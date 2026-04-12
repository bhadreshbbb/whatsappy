/**
 * WhatsApp Cloud API Service
 * Calls Meta Graph API when credentials are set in .env / Settings.
 * Falls back to simulation log when not configured.
 *
 * Required env vars (or set via Settings page):
 *   WHATSAPP_TOKEN       — permanent access token from Meta Developer Console
 *   WHATSAPP_PHONE_ID    — Phone Number ID (not the display number)
 */

import { getDb } from './database.js';

function getCredentials() {
  // Check env first, then fall back to channel settings in DB
  const token   = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (token && phoneId) return { token, phoneId };

  try {
    const db = getDb();
    const row = db.channel_settings[0];
    const s = JSON.parse(row?.settings || '{}');
    if (s?.whatsapp_token && s?.whatsapp_phone_id) {
      return { token: s.whatsapp_token, phoneId: s.whatsapp_phone_id };
    }
  } catch (_) {}
  return null;
}

async function callMetaApi(phoneId, token, body) {
  const url = `https://graph.facebook.com/v25.0/${phoneId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Meta API error ${res.status}: ${JSON.stringify(data?.error || data)}`);
  const wamid = data?.messages?.[0]?.id || null;
  return { wamid, raw: data };
}

export const whatsappService = {
  /**
   * Send a plain text message (used by Chat UI admin replies)
   */
  async sendTextMessage(phone, text) {
    const clean = String(phone).replace(/\D/g, '');
    const to = clean.startsWith('91') ? clean : `91${clean}`;
    const creds = getCredentials();

    if (creds) {
      console.log(`[WhatsApp] → ${to}: "${text.substring(0, 60)}..."`);
      const result = await callMetaApi(creds.phoneId, creds.token, {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text, preview_url: false },
      });
      console.log(`[WhatsApp] ✓ Sent wamid: ${result.wamid}`);
      return { wamid: result.wamid };
    }

    // No credentials — simulation mode
    const mockId = `mock_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[WhatsApp SIM] → ${to}: "${text.substring(0, 60)}"`);
    return { wamid: mockId };
  },

  /**
   * Send a template message (used by automation/campaigns)
   * components: [{type:'body', text:'...'}, ...]
   * variables: key/value map to fill {{placeholders}}
   */
  async sendMessage(phone, components, variables) {
    const clean = String(phone).replace(/\D/g, '');
    const to = clean.startsWith('91') ? clean : `91${clean}`;

    // Resolve the final message text by filling variables into the body component
    const bodyComp = components?.find(c => c.type === 'body');
    let messageText = bodyComp?.text || '';
    if (variables) {
      for (const [key, val] of Object.entries(variables)) {
        if (val !== null && val !== undefined) {
          messageText = messageText.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(val));
        }
      }
    }

    const creds = getCredentials();

    if (creds) {
      // With real credentials: send as plain text (most reliable for custom templates)
      // For approved Meta templates, you'd use type:'template' instead
      console.log(`[WhatsApp] Campaign → ${to}: "${messageText.substring(0, 60)}..."`);
      try {
        const result = await callMetaApi(creds.phoneId, creds.token, {
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: messageText, preview_url: false },
        });
        console.log(`[WhatsApp] ✓ Campaign sent wamid: ${result.wamid}`);
        return { messageId: result.wamid, resolvedText: messageText };
      } catch (err) {
        console.error(`[WhatsApp] ✗ Campaign send failed for ${to}:`, err.message);
        // Still return so automation can record it
        return { messageId: null, resolvedText: messageText };
      }
    }

    // Simulation mode
    const mockId = `mock_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[WhatsApp SIM] Campaign → ${to}: "${messageText.substring(0, 70)}"`);
    return { messageId: mockId, resolvedText: messageText };
  },

  // kept for backward compat
  async sendTemplate(phone, templateName, language, components) {
    console.log(`[WhatsApp] Template "${templateName}" → ${phone}`);
    return { messageId: `tpl_${Date.now()}` };
  },

  async uploadMedia(buffer, filename, mimeType) {
    const creds = getCredentials();
    if (!creds) throw new Error('WhatsApp credentials not configured.');

    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', mimeType);
    form.append('file', new Blob([buffer], { type: mimeType }), filename);

    const res = await fetch(
      `https://graph.facebook.com/v25.0/${creds.phoneId}/media`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${creds.token}` },
        body: form,
      }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(`Meta Media API error: ${JSON.stringify(data?.error || data)}`);
    return data.id;
  },

  async downloadImage(url) {
    console.log(`[WhatsApp] Downloading image: ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download image from ${url}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    
    // Guess mime type from header or extension
    let mimeType = res.headers.get('content-type') || 'image/jpeg';
    if (url.toLowerCase().endsWith('.png')) mimeType = 'image/png';
    else if (url.toLowerCase().endsWith('.webp')) mimeType = 'image/webp';
    
    return { buffer, mimeType };
  },

  formatMessage(template, variables) {
    let out = template;
    for (const [k, v] of Object.entries(variables)) {
      out = out.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
    }
    return out;
  },
};
