import { getDb } from '../services/database.js';
import { v4 as uuidv4 } from 'uuid';

// ── Get credentials from settings ─────────────────────────────────────────────
function getCreds(channelId) {
  const token   = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const wabaId  = process.env.WHATSAPP_BUSINESS_ID;
  if (token && phoneId && wabaId) return { token, phoneId, wabaId };
  try {
    const db  = getDb();
    const row = db.channel_settings.find(s => s.channel_id === channelId)
              || db.channel_settings[0];
    const s   = JSON.parse(row?.settings || '{}');
    if (s?.whatsapp_token && s?.whatsapp_phone_id && s?.whatsapp_business_id) {
      return { token: s.whatsapp_token, phoneId: s.whatsapp_phone_id, wabaId: s.whatsapp_business_id };
    }
  } catch (_) {}
  return null;
}

// ── Build Meta API components from our template ────────────────────────────────
function buildMetaComponents(tpl) {
  const components = [];

  // HEADER
  if (tpl.header_type === 'IMAGE') {
    components.push({ type: 'HEADER', format: 'IMAGE' });
  } else if (tpl.header_type === 'TEXT' && tpl.header_text) {
    const headerVars = [...tpl.header_text.matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1]);
    const comp = { type: 'HEADER', format: 'TEXT', text: tpl.header_text };
    if (headerVars.length) comp.example = { header_text: headerVars.map(() => 'Sample') };
    components.push(comp);
  }

  // BODY
  if (tpl.body) {
    const bodyVars = [...tpl.body.matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1]);
    const comp = { type: 'BODY', text: tpl.body };
    if (bodyVars.length) comp.example = { body_text: [bodyVars.map(v => `Value${v}`)] };
    components.push(comp);
  }

  // FOOTER
  if (tpl.footer) components.push({ type: 'FOOTER', text: tpl.footer });

  // BUTTONS
  if (tpl.buttons?.length) {
    const buttons = tpl.buttons.map(b => {
      if (b.type === 'URL') {
        const btn = { type: 'URL', text: b.text, url: b.url };
        if (b.url.includes('{{')) btn.example = [b.url.replace(/\{\{\d+\}\}/g, 'example.com')];
        return btn;
      }
      if (b.type === 'QUICK_REPLY') return { type: 'QUICK_REPLY', text: b.text };
      if (b.type === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phone_number };
      return b;
    });
    components.push({ type: 'BUTTONS', buttons });
  }

  return components;
}

// ── List all meta templates ────────────────────────────────────────────────────
export function listTemplates(req, res) {
  const db = getDb();
  const channelId = req.headers['x-channel-id'] || 'demo';
  const templates = (db.meta_templates || [])
    .filter(t => t.channel_id === channelId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json({ templates });
}

// ── Create + submit template to Meta ──────────────────────────────────────────
export async function createTemplate(req, res) {
  try {
    const db = getDb();
    const channelId = req.headers['x-channel-id'] || 'demo';
    const { name, category, language, header_type, header_text, body, footer, buttons, variable_labels } = req.body;

    if (!name || !body) return res.status(400).json({ error: 'name and body are required' });

    // Sanitize name: lowercase, underscores only
    const cleanName = name.toLowerCase().replace(/[^a-z0-9_]/g, '_');

    const tpl = {
      id: uuidv4(),
      channel_id: channelId,
      name: cleanName,
      category: category || 'MARKETING',
      language: language || 'en',
      header_type: header_type || 'NONE',
      header_text: header_text || '',
      body,
      footer: footer || '',
      buttons: buttons || [],
      variable_labels: variable_labels || [],
      meta_status: 'DRAFT',
      meta_template_id: null,
      // Product config (filled after approval)
      product_config: null,
      created_at: new Date().toISOString(),
      submitted_at: null,
    };

    const creds = getCreds(channelId);
    if (creds) {
      // Submit to Meta
      const components = buildMetaComponents(tpl);
      const langMap = { en: 'en_US', hi: 'hi', gu: 'gu', ta: 'ta', te: 'te', mr: 'mr', bn: 'bn', ar: 'ar', ur: 'ur' };
      const payload = {
        name: cleanName,
        category: tpl.category,
        language: langMap[tpl.language] || tpl.language,
        components,
      };

      const metaRes = await fetch(
        `https://graph.facebook.com/v21.0/${creds.wabaId}/message_templates`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${creds.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const metaData = await metaRes.json();
      if (metaRes.ok && metaData.id) {
        tpl.meta_template_id = metaData.id;
        tpl.meta_status = metaData.status || 'PENDING';
        tpl.submitted_at = new Date().toISOString();
        console.log(`[MetaTemplates] Submitted "${cleanName}" → id: ${metaData.id}`);
      } else {
        tpl.meta_status = 'SUBMIT_ERROR';
        tpl.meta_error = JSON.stringify(metaData?.error || metaData);
        console.error(`[MetaTemplates] Submit error:`, metaData?.error);
      }
    } else {
      tpl.meta_status = 'NO_CREDENTIALS';
    }

    if (!db.meta_templates) db.meta_templates = [];
    db.meta_templates.push(tpl);
    db.save();
    res.json({ template: tpl });
  } catch (err) {
    console.error('[MetaTemplates] Create error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

// ── Refresh status from Meta ──────────────────────────────────────────────────
export async function refreshStatus(req, res) {
  try {
    const db = getDb();
    const channelId = req.headers['x-channel-id'] || 'demo';
    const { id } = req.params;

    const tpl = (db.meta_templates || []).find(t => t.id === id && t.channel_id === channelId);
    if (!tpl) return res.status(404).json({ error: 'Template not found' });

    const creds = getCreds(channelId);
    if (!creds) return res.status(400).json({ error: 'WhatsApp credentials not configured' });

    const metaRes = await fetch(
      `https://graph.facebook.com/v21.0/${creds.wabaId}/message_templates?name=${tpl.name}&fields=name,status,id,quality_score,rejected_reason`,
      { headers: { Authorization: `Bearer ${creds.token}` } }
    );
    const metaData = await metaRes.json();

    if (metaRes.ok && metaData.data?.length) {
      const found = metaData.data.find(t => t.name === tpl.name) || metaData.data[0];
      tpl.meta_status = found.status;
      if (found.id) tpl.meta_template_id = found.id;
      if (found.rejected_reason) tpl.rejected_reason = found.rejected_reason;
      db.save();
    }

    res.json({ template: tpl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── Save product config (image, vars mapping, etc.) ───────────────────────────
export function saveProductConfig(req, res) {
  const db = getDb();
  const channelId = req.headers['x-channel-id'] || 'demo';
  const { id } = req.params;

  const tpl = (db.meta_templates || []).find(t => t.id === id && t.channel_id === channelId);
  if (!tpl) return res.status(404).json({ error: 'Template not found' });

  tpl.product_config = req.body;
  db.save();
  res.json({ template: tpl });
}

// ── Delete template ───────────────────────────────────────────────────────────
export async function deleteTemplate(req, res) {
  try {
    const db = getDb();
    const channelId = req.headers['x-channel-id'] || 'demo';
    const { id } = req.params;

    const idx = (db.meta_templates || []).findIndex(t => t.id === id && t.channel_id === channelId);
    if (idx === -1) return res.status(404).json({ error: 'Template not found' });

    const tpl = db.meta_templates[idx];
    const creds = getCreds(channelId);

    // Try to delete from Meta too
    if (creds && tpl.meta_template_id) {
      await fetch(
        `https://graph.facebook.com/v21.0/${creds.wabaId}/message_templates?hsm_id=${tpl.meta_template_id}&name=${tpl.name}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${creds.token}` } }
      ).catch(() => {});
    }

    db.meta_templates.splice(idx, 1);
    db.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
