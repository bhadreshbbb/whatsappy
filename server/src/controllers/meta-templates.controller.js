import { getDb } from '../services/database.js';
import { v4 as uuidv4 } from 'uuid';
import { whatsappService } from '../services/whatsapp.service.js';
import https from 'https';
import http from 'http';

// ── Get credentials from settings ─────────────────────────────────────────────
function getCreds(channelId) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const wabaId = process.env.WHATSAPP_BUSINESS_ID;
  const appId  = process.env.WHATSAPP_APP_ID;
  if (token && phoneId && wabaId) return { token, phoneId, wabaId, appId: appId || null };
  try {
    const db = getDb();
    const row = db.channel_settings.find(s => s.channel_id === channelId)
      || db.channel_settings[0];
    const s = JSON.parse(row?.settings || '{}');
    if (s?.whatsapp_token && s?.whatsapp_phone_id && s?.whatsapp_business_id) {
      return { token: s.whatsapp_token, phoneId: s.whatsapp_phone_id, wabaId: s.whatsapp_business_id, appId: s.whatsapp_app_id || null };
    }
  } catch (_) { }
  return null;
}

// ── Variable example values — Meta reviewers see these; use realistic strings ──
// Mapped from the var_map field options so Meta understands what each {{N}} is.
const FIELD_EXAMPLES = {
  product_title:       'Blue Cotton Kurti',
  product_price:       '₹799',
  product_title_price: 'Blue Cotton Kurti\n₹799',   // compact: title + newline + price in one var
  product_link:        'blue-cotton-kurti',
  customer_name:       'Priya Sharma',
  cart_total:          '₹1,499',
  cart_link:           'cart-abc123',
};

/**
 * Return a human-meaningful example value for {{varNum}}.
 * varMap e.g. { '1': 'product_title', '2': 'product_price', '3': 'custom', '3_custom': 'SAVE20' }
 */
function getVarExample(varNum, varMap) {
  const field = (varMap || {})[String(varNum)];
  if (!field) return `Sample${varNum}`;
  if (field === 'custom') return String((varMap || {})[`${varNum}_custom`] || `Value${varNum}`);
  return FIELD_EXAMPLES[field] || `Value${varNum}`;
}

/**
 * Build body_text example for Meta — { body_text: [["val1","val2","val3"]] }
 * Prefers real product example_values filled by user/auto-detect over generic fallbacks.
 */
function buildBodyExample(text, varMap, exampleValues = {}) {
  const vars = [...(text || '').matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1]);
  if (!vars.length) return null;
  return { body_text: [vars.map(v => String(exampleValues[v] || '').trim() || getVarExample(v, varMap))] };
}

/**
 * Build URL button example for Meta.
 * Meta format: example = ["slug-val"]  — just the variable VALUE, not the full URL.
 * e.g.  url: "https://store.com/{{1}}"  →  example: ["blue-cotton-kurti"]
 * Uses original var numbers (before {{1}} normalisation) to look up values.
 */
function buildUrlExample(url, varMap, exampleValues = {}) {
  const vars = [...(url || '').matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1]);
  if (!vars.length) return null;
  return vars.map(v => String(exampleValues[v] || '').trim() || getVarExample(v, varMap));
}

// ── Build Meta API components — v25.0 compliant ──────────────────────────────
// Meta template creation API requires UPPERCASE type/format values.
// Message send API uses lowercase — these are different APIs!
//
// Template creation payload structure (carousel):
// {
//   "name": "...", "language": "en_US", "category": "MARKETING",
//   "components": [
//     { "type": "BODY", "text": "...", "example": { "body_text": [["val1","val2"]] } },
//     { "type": "CAROUSEL", "cards": [
//       { "components": [
//           { "type": "HEADER", "format": "IMAGE", "example": { "header_handle": ["<file_handle>"] } },
//           { "type": "BODY",   "text": "...",     "example": { "body_text": [["val1","val2"]] } },
//           { "type": "BUTTONS","buttons": [
//               { "type": "QUICK_REPLY", "text": "..." },
//               { "type": "URL", "text": "...", "url": "https://...{{1}}", "example": ["slug"] }
//           ]}
//       ]}
//     ]}
//   ]
// }
function buildMetaComponents(tpl) {
  const components = [];

  // variable_labels can arrive as object { '1': 'product_title' } or legacy []
  const stdVarMap = Array.isArray(tpl.variable_labels) ? {} : (tpl.variable_labels || {});

  // ── CAROUSEL ────────────────────────────────────────────────────────────────
  if (tpl.is_carousel && tpl.carousel_cards?.length >= 2) {

    // REQUIRED carousel-level body (Meta mandates a top-level BODY for carousel templates)
    // If the user left it blank, use a sensible default so Meta doesn't reject.
    const bodyText = tpl.body?.trim() || 'Check out our latest products for you!';
    const bodyComp = { type: 'BODY', text: bodyText };
    const bodyEx = buildBodyExample(bodyText, stdVarMap);
    if (bodyEx) bodyComp.example = bodyEx;
    components.push(bodyComp);

    const cards = tpl.carousel_cards.map((card, cardIdx) => {
      const cardComponents = [];
      const vm  = card.var_map || {};          // per-card {{N}} → field mapping
      const exV = card.example_values || {};   // actual product values filled by user/auto-detect

      // 1. HEADER — image is mandatory for carousel cards
      const headerComp = { type: 'HEADER', format: 'IMAGE' };
      if (card.header_media_id) {
        headerComp.example = { header_handle: [String(card.header_media_id)] };
        console.log(`[MetaTemplates] Card ${cardIdx + 1} header_handle = "${card.header_media_id}"`);
      } else {
        console.warn(`[MetaTemplates] ⚠  Card ${cardIdx + 1}: header_media_id missing — upload image to Gallery first.`);
      }
      cardComponents.push(headerComp);

      // 2. BODY — use real example_values so Meta reviewers see meaningful content
      if (card.body?.trim()) {
        const comp = { type: 'BODY', text: card.body };
        const ex = buildBodyExample(card.body, vm, exV);
        if (ex) comp.example = ex;
        cardComponents.push(comp);
      }

      // 3. BUTTONS — max 2 per card (Meta spec)
      // CRITICAL: Meta requires URL button variable to always be {{1}} (button-scoped).
      // We store {{3}} internally (to track which var_map entry = product_link),
      // but normalise to {{1}} in the Meta payload.
      if (card.buttons?.length) {
        const buttons = card.buttons.slice(0, 2).map(b => {
          const bType = String(b.type || '').toUpperCase();
          if (bType === 'URL') {
            // Collect original var numbers BEFORE normalisation (for example lookup)
            const origVars = [...(b.url || '').matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1]);
            // Normalise: replace any {{N}} → {{1}}  (Meta button-variable scope rule)
            const normalizedUrl = (b.url || '').replace(/\{\{\d+\}\}/g, '{{1}}');
            const btn = { type: 'URL', text: b.text, url: normalizedUrl };
            if (origVars.length) {
              // example = [slug_value] — the value that replaces {{1}} at send time
              const exVal = String(exV[origVars[0]] || '').trim() || getVarExample(origVars[0], vm);
              btn.example = [exVal];
            }
            return btn;
          }
          if (bType === 'QUICK_REPLY') return { type: 'QUICK_REPLY', text: b.text };
          if (bType === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phone_number };
          return null;
        }).filter(Boolean);
        if (buttons.length) cardComponents.push({ type: 'BUTTONS', buttons });
      }

      return { components: cardComponents };
    });

    components.push({ type: 'CAROUSEL', cards });
    return components;
  }

  // ── STANDARD template ────────────────────────────────────────────────────────

  if (tpl.header_type === 'IMAGE') {
    components.push({ type: 'HEADER', format: 'IMAGE' });
  } else if (tpl.header_type === 'TEXT' && tpl.header_text?.trim()) {
    const hVars = [...tpl.header_text.matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1]);
    const comp = { type: 'HEADER', format: 'TEXT', text: tpl.header_text };
    if (hVars.length) comp.example = { header_text: hVars.map(v => getVarExample(v, stdVarMap)) };
    components.push(comp);
  }

  if (tpl.body?.trim()) {
    const comp = { type: 'BODY', text: tpl.body };
    const ex = buildBodyExample(tpl.body, stdVarMap);
    if (ex) comp.example = ex;
    components.push(comp);
  }

  if (tpl.footer?.trim()) components.push({ type: 'FOOTER', text: tpl.footer });

  if (tpl.buttons?.length) {
    const buttons = tpl.buttons.map(b => {
      const bType = String(b.type || '').toUpperCase();
      if (bType === 'URL') {
        const btn = { type: 'URL', text: b.text, url: b.url };
        const ex = buildUrlExample(b.url, stdVarMap);
        if (ex) btn.example = ex;
        return btn;
      }
      if (bType === 'QUICK_REPLY')  return { type: 'QUICK_REPLY',  text: b.text };
      if (bType === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phone_number };
      return b;
    });
    components.push({ type: 'BUTTONS', buttons });
  }

  return components;
}

/**
 * Automatically downloads and uploads images from external URLs to Meta
 * and creates Gallery records for them.
 */
async function autoUploadTemplateImages(channelId, carouselCards) {
  const db = getDb();
  let folder = (db.gallery_folders || []).find(f => f.channel_id === channelId && f.name === 'Template Assets');

  if (!folder) {
    folder = { id: uuidv4(), channel_id: channelId, name: 'Template Assets', created_at: new Date().toISOString() };
    if (!db.gallery_folders) db.gallery_folders = [];
    db.gallery_folders.push(folder);
  }

  const updatedCards = [...carouselCards];
  for (let i = 0; i < updatedCards.length; i++) {
    const card = updatedCards[i];

    // ── Priority 1: already have a file_handle (resumable upload) — use it ───
    if (card.file_handle) {
      console.log(`[AutoUpload] Card ${i + 1}: using existing file_handle = ${card.file_handle}`);
      updatedCards[i] = { ...card, header_media_id: card.file_handle };
      continue;
    }

    // ── Priority 2: header_media_id already set (legacy or manual) ───────────
    if (card.header_media_id) {
      console.log(`[AutoUpload] Card ${i + 1}: using existing header_media_id = ${card.header_media_id}`);
      continue;
    }

    // ── Priority 3: gallery image_id — look up file_handle or media_id from DB
    if (card.image_id) {
      const galleryImg = (db.gallery_images || []).find(img => img.id === card.image_id && img.channel_id === channelId);
      if (galleryImg) {
        const handle = galleryImg.file_handle || galleryImg.media_id || '';
        if (handle) {
          updatedCards[i] = { ...card, header_media_id: handle };
          console.log(`[AutoUpload] Card ${i + 1}: resolved from gallery image_id ${card.image_id} → handle = ${handle}`);
          continue;
        }
      }
    }

    // ── Priority 4: external image URL — download + resumable upload to Meta ─
    const externalUrl = card.selected_fetch_image || card.product_data?.image_url || '';
    if (externalUrl) {
      let imageUrl = externalUrl;
      if (imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;
      if (!imageUrl.startsWith('http')) {
        console.warn(`[AutoUpload] Card ${i + 1}: skipping invalid image URL "${externalUrl}"`);
        continue;
      }
      try {
        const { buffer, mimeType } = await whatsappService.downloadImage(imageUrl);
        const filename = `auto_card${i + 1}_${Date.now()}.jpg`;

        // Use resumable upload API → returns file_handle like "4:abcXYZ..."
        const fileHandle = await whatsappService.uploadMediaResumable(buffer, filename, mimeType);

        // Save to Gallery for reuse
        const image = {
          id: uuidv4(), folder_id: folder.id, channel_id: channelId,
          filename, mime_type: mimeType, size: buffer.length,
          file_handle: fileHandle, source_url: externalUrl,
          created_at: new Date().toISOString(),
        };
        if (!db.gallery_images) db.gallery_images = [];
        db.gallery_images.push(image);

        updatedCards[i] = { ...card, image_id: image.id, file_handle: fileHandle, header_media_id: fileHandle };
        console.log(`[AutoUpload] Card ${i + 1}: uploaded → file_handle = ${fileHandle}`);
      } catch (err) {
        console.error(`[AutoUpload] Card ${i + 1}: upload failed — ${err.message}`);
        throw new Error(`Failed to upload image for card ${i + 1}: ${err.message}`);
      }
      continue;
    }

    // ── No image source at all ───────────────────────────────────────────────
    console.warn(`[AutoUpload] Card ${i + 1}: no image source — header_handle will be missing`);
  }

  db.save();
  return updatedCards;
}

// ── Preview / dry-run payload (no submission to Meta) ─────────────────────────
// POST /api/meta-templates/preview-payload  ← same body as createTemplate
export async function previewPayload(req, res) {
  try {
    const db = getDb();
    const channelId = req.headers['x-channel-id'] || 'demo';
    const { name, category, language, body, footer, buttons, header_type, header_text,
      is_carousel, carousel_cards, variable_labels } = req.body;

    const cleanName = (name || 'preview').toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const langMap = { en: 'en_US', hi: 'hi', gu: 'gu', ta: 'ta', te: 'te', mr: 'mr', bn: 'bn', ar: 'ar', ur: 'ur' };

    const tpl = {
      name: cleanName, category: category || 'MARKETING',
      language: language || 'en',
      header_type: header_type || 'NONE', header_text: header_text || '',
      body: body || '', footer: footer || '',
      buttons: buttons || [], variable_labels: variable_labels || [],
      is_carousel: !!is_carousel, carousel_cards: carousel_cards || [],
    };

    // ── Resolve images if dry-running carousel ──
    if (is_carousel) {
      tpl.carousel_cards = await autoUploadTemplateImages(channelId, carousel_cards);
    }

    const components = buildMetaComponents(tpl);
    const payload = {
      name: cleanName,
      category: (tpl.category || 'MARKETING').toUpperCase(),  // "MARKETING" | "UTILITY" — Meta requires UPPERCASE
      language: langMap[tpl.language] || tpl.language,
      components,
    };

    // Build real API URL (with actual WABA_ID if creds available)
    const creds = getCreds(channelId);
    const apiUrl = creds
      ? `https://graph.facebook.com/v25.0/${creds.wabaId}/message_templates`
      : `https://graph.facebook.com/v25.0/{WABA_ID}/message_templates`;
    const authDisplay = creds
      ? `Bearer ${creds.token.slice(0, 10)}...${creds.token.slice(-4)}`
      : 'Bearer <YOUR_WHATSAPP_TOKEN>';
    const payloadStr = JSON.stringify(payload);
    const curlCommand = `curl -X POST '${apiUrl}' \\\n  -H 'Authorization: ${creds ? `Bearer ${creds.token}` : '<YOUR_TOKEN>'}' \\\n  -H 'Content-Type: application/json' \\\n  -d '${payloadStr.replace(/'/g, "'\\''")}'`;

    // Also log to server console
    console.log('\n[MetaTemplates] DRY-RUN PAYLOAD:\n', JSON.stringify(payload, null, 2));
    console.log('[MetaTemplates] CURL:\n', curlCommand);

    res.json({
      payload,
      meta_api_url: apiUrl,
      method: 'POST',
      auth_header: authDisplay,
      curl_command: curlCommand,
      notes: {
        name_rule: 'lowercase letters, numbers, underscores only',
        language_sent: langMap[tpl.language] || tpl.language,
        cards_count: is_carousel ? carousel_cards?.length : 'N/A (standard template)',
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── Resolve a product field value for the send message payload ───────────────
function getFieldValue(varNum, varMap, productCard) {
  const field = (varMap || {})[String(varNum)];
  if (!field) return '';
  switch (field) {
    case 'product_title':       return productCard?.title  || '';
    case 'product_price':       return productCard?.price  || '';
    case 'product_title_price': {
      // Compact: title + newline + price in a single variable
      const t = productCard?.title || '';
      const p = productCard?.price || '';
      return t && p ? `${t}\n${p}` : (t || p);
    }
    case 'product_link': {
      const link = productCard?.link || '';
      // URL buttons expect just the variable segment (slug), not the full URL
      try { const seg = new URL(link).pathname.split('/').filter(Boolean).pop(); return seg || link; }
      catch { return link; }
    }
    case 'customer_name':  return 'Customer';
    case 'cart_total':     return productCard?.cart_total || '';
    case 'cart_link':      return productCard?.link || '';
    case 'custom':         return String((varMap || {})[`${varNum}_custom`] || '');
    default:               return '';
  }
}

/**
 * Build the WhatsApp /messages send payload for an approved carousel template.
 * This is what campaigns POST to the WhatsApp Cloud API.
 * productConfig = tpl.product_config  |  recipientPhone = '+91...'
 */
/**
 * LANG MAP — short code to Meta language code (exported for use in automation)
 */
export const LANG_MAP = { en: 'en_US', hi: 'hi', gu: 'gu', ta: 'ta', te: 'te', mr: 'mr', bn: 'bn', ar: 'ar', ur: 'ur' };

export function buildSendMessagePayload(tpl, productConfig, recipientPhone = '{{RECIPIENT_PHONE}}', languageOverride = null) {
  // languageOverride: Meta language code e.g. 'en_US', 'hi', 'gu' — from campaign target_language
  // Falls back to the template's own stored language
  const langCode = languageOverride
    ? (LANG_MAP[languageOverride] || languageOverride)   // allow short ('hi') or full ('en_US')
    : (LANG_MAP[tpl.language] || tpl.language || 'en_US');
  const stdVarMap = Array.isArray(tpl.variable_labels) ? {} : (tpl.variable_labels || {});
  const components = [];

  // Optional carousel-level body parameters
  if (tpl.body?.trim()) {
    const vars = [...tpl.body.matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1]);
    if (vars.length > 0) {
      const firstCard = (productConfig?.cards || [])[0] || {};
      components.push({ type: 'body', parameters: vars.map(v => ({ type: 'text', text: getFieldValue(v, stdVarMap, firstCard) })) });
    }
  }

  // Carousel cards
  if (tpl.is_carousel && tpl.carousel_cards?.length) {
    const cards = tpl.carousel_cards.map((card, i) => {
      const pc  = (productConfig?.cards || [])[i] || {};
      const vm  = card.var_map || {};
      const exV = card.example_values || {};
      const cardComponents = [];

      // Merged product data: product_config > card.product_data (auto-fill fallback)
      // This ensures price/title/link are always dynamic even before product_config is saved
      const pd = {
        title: pc.title || card.product_data?.title || '',
        price: pc.price || card.product_data?.price || '',
        link:  pc.link  || card.product_data?.link  || '',
        ...pc,
      };

      // Header image — file_handle (resumable) > media_id > public URL
      const imgId  = pc.file_handle || pc.header_media_id || card.file_handle || card.header_media_id || '';
      const imgUrl = pc._hot_image_url || pc.image_url || card.product_data?.image_url || '';
      if (imgId) {
        cardComponents.push({ type: 'header', parameters: [{ type: 'image', image: { id: imgId } }] });
      } else if (imgUrl) {
        cardComponents.push({ type: 'header', parameters: [{ type: 'image', image: { link: imgUrl } }] });
      }

      // Body text parameters — resolve each {{N}} via var_map against merged product data
      if (card.body?.trim()) {
        const vars = [...card.body.matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1]);
        if (vars.length > 0) {
          const params = vars.map(v => {
            const val = getFieldValue(v, vm, pd) || String(exV[v] || '');
            return { type: 'text', text: val };
          });
          cardComponents.push({ type: 'body', parameters: params });
        }
      }

      // URL button parameters — {{N}} in stored URL resolves via var_map to product field.
      // At send time the button expects exactly 1 parameter for its {{1}} (normalised at creation).
      (card.buttons || []).slice(0, 2).forEach((btn, bi) => {
        if (String(btn.type || '').toLowerCase() === 'url' && btn.url?.includes('{{')) {
          const urlVars = [...btn.url.matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1]);
          const paramVal = getFieldValue(urlVars[0], vm, pd) || String(exV[urlVars[0]] || '');
          if (paramVal) {
            cardComponents.push({ type: 'button', sub_type: 'url', index: String(bi), parameters: [{ type: 'text', text: paramVal }] });
          }
        }
      });

      return { card_index: i, components: cardComponents };
    });
    components.push({ type: 'carousel', cards });
  }

  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipientPhone,
    type: 'template',
    template: { name: tpl.name, language: { code: langCode }, components },
  };
}

// ── Get send payload for an approved template (with current product config) ───
export async function getSendPayload(req, res) {
  try {
    const db = getDb();
    const channelId = req.headers['x-channel-id'] || 'demo';
    const { id } = req.params;
    const tpl = (db.meta_templates || []).find(t => t.id === id && t.channel_id === channelId);
    if (!tpl) return res.status(404).json({ error: 'Template not found' });

    const langOverride = req.query.lang || null;  // e.g. ?lang=hi or ?lang=en_US
    const payload = buildSendMessagePayload(tpl, tpl.product_config, req.query.to || '{{RECIPIENT_PHONE}}', langOverride);
    const creds = getCreds(channelId);

    const sendApiUrl = creds
      ? `https://graph.facebook.com/v25.0/${creds.phoneId}/messages`
      : 'https://graph.facebook.com/v25.0/{PHONE_NUMBER_ID}/messages';
    const authDisplay = creds
      ? `Bearer ${creds.token.slice(0, 10)}...${creds.token.slice(-4)}`
      : 'Bearer <YOUR_WHATSAPP_TOKEN>';
    const payloadStr = JSON.stringify(payload);
    const curlCommand = `curl -X POST '${sendApiUrl}' \\\n  -H 'Authorization: ${creds ? `Bearer ${creds.token}` : '<YOUR_TOKEN>'}' \\\n  -H 'Content-Type: application/json' \\\n  -d '${payloadStr.replace(/'/g, "'\\''")}'`;

    console.log('\n[MetaTemplates] SEND PAYLOAD:\n', JSON.stringify(payload, null, 2));
    console.log('[MetaTemplates] SEND CURL:\n', curlCommand);

    res.json({
      payload,
      api_url: sendApiUrl,
      method: 'POST',
      auth_header: authDisplay,
      curl_command: curlCommand,
      last_refresh:  tpl.product_config?.last_auto_refresh || null,
      next_refresh:  tpl.product_config?.last_auto_refresh
        ? new Date(new Date(tpl.product_config.last_auto_refresh).getTime() + 6 * 3600 * 1000).toISOString()
        : null,
      products: (tpl.product_config?.cards || []).map(c => ({ title: c.title, price: c.price, link: c.link, image: c._hot_image_url || '' })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
    const { name, category, language, header_type, header_text, body, footer, buttons, variable_labels, is_carousel, carousel_cards } = req.body;

    // Carousel body (intro text) is optional; standard templates require body
    if (!name) return res.status(400).json({ error: 'Template name is required' });
    if (!is_carousel && !body) return res.status(400).json({ error: 'Body text is required for standard templates' });
    if (is_carousel && (!carousel_cards || carousel_cards.length < 2)) return res.status(400).json({ error: 'Carousel needs at least 2 cards' });

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
      is_carousel: !!is_carousel,
      carousel_cards: carousel_cards || [],
      meta_status: 'DRAFT',
      meta_template_id: null,
      // Product config (filled after approval)
      product_config: null,
      created_at: new Date().toISOString(),
      submitted_at: null,
    };

    const creds = getCreds(channelId);
    if (creds) {
      // ── Step 1: Resolve images (auto-upload if URL provided) ──
      const resolvedCards = is_carousel ? await autoUploadTemplateImages(channelId, carousel_cards) : [];
      tpl.carousel_cards = resolvedCards;

      // ── Step 2: Build Payload ──
      const components = buildMetaComponents(tpl);
      const langMap = { en: 'en_US', hi: 'hi', gu: 'gu', ta: 'ta', te: 'te', mr: 'mr', bn: 'bn', ar: 'ar', ur: 'ur' };
      const payload = {
        name: cleanName,
        category: (tpl.category || 'MARKETING').toUpperCase(),  // Meta requires UPPERCASE: "MARKETING", "UTILITY"
        language: langMap[tpl.language] || tpl.language,
        components,
      };

      // ── Step 3: Log the FULL payload for debugging / cross-checking Meta compliance ──
      console.log('\n════════════════════════════════════════════════════════');
      console.log('[MetaTemplates] SUBMITTING TO META — FULL PAYLOAD:');
      console.log('════════════════════════════════════════════════════════');
      console.log(JSON.stringify(payload, null, 2));
      console.log('════════════════════════════════════════════════════════\n');

      const metaRes = await fetch(
        `https://graph.facebook.com/v25.0/${creds.wabaId}/message_templates`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${creds.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const metaData = await metaRes.json();
      console.log('[MetaTemplates] META RESPONSE:', JSON.stringify(metaData, null, 2));
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
      `https://graph.facebook.com/v25.0/${creds.wabaId}/message_templates?name=${tpl.name}&fields=name,status,id,quality_score,rejected_reason`,
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

// ── Get hot/trending products based on views + abandoned cart data ────────────
export function getHotProducts(req, res) {
  try {
    const db = getDb();
    const channelId = req.headers['x-channel-id'] || 'demo';
    const limit = Math.min(parseInt(req.query.limit) || 10, 20);
    const days = parseInt(req.query.days) || 30;
    const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

    const scores = {};

    // ── Score from product views ─────────────────────────────────────────────
    for (const v of (db.product_views || [])) {
      if (v.channel_id !== channelId || v.created_at < since) continue;
      const key = v.product_url || v.product_name;
      if (!key) continue;
      if (!scores[key]) scores[key] = { name: v.product_name, url: v.product_url, image: v.product_image, price: v.product_price, views: 0, carts: 0 };
      scores[key].views++;
      if (!scores[key].name && v.product_name) scores[key].name = v.product_name;
      if (!scores[key].image && v.product_image) scores[key].image = v.product_image;
      if (!scores[key].price && v.product_price) scores[key].price = v.product_price;
    }

    // ── Score from abandoned cart events (weight × 3) ────────────────────────
    for (const c of (db.cart_events || [])) {
      if (c.channel_id !== channelId || c.recovered || c.created_at < since) continue;
      let productName = c.product_name;
      let productUrl = c.product_url;
      // Try to extract from products JSON array if direct fields empty
      if (!productName && c.products) {
        try { const arr = JSON.parse(c.products); productName = arr[0]?.name; productUrl = productUrl || arr[0]?.url; } catch (_) { }
      }
      const key = productUrl || productName;
      if (!key) continue;
      if (!scores[key]) scores[key] = { name: productName, url: productUrl, image: c.product_image, price: c.product_price, views: 0, carts: 0 };
      scores[key].carts++;
      if (!scores[key].name && productName) scores[key].name = productName;
      if (!scores[key].image && c.product_image) scores[key].image = c.product_image;
      if (!scores[key].price && c.product_price) scores[key].price = c.product_price;
    }

    // ── Add catalog products as baseline (so there's always something) ────────
    for (const p of (db.product_catalog || [])) {
      if (p.channel_id !== channelId) continue;
      const key = p.url || p.name;
      if (!key) continue;
      if (!scores[key]) scores[key] = { name: p.name, url: p.url, image: p.image, price: p.price, views: 0, carts: 0 };
      if (!scores[key].name && p.name) scores[key].name = p.name;
      if (!scores[key].image && p.image) scores[key].image = p.image;
      if (!scores[key].price && p.price) scores[key].price = p.price;
    }

    const products = Object.entries(scores)
      .map(([key, p]) => {
        const score = (p.views * 1) + (p.carts * 3);
        return {
          key,
          name: p.name || key,
          url: p.url || '',
          image: p.image || '',
          price: p.price || '',
          views: p.views,
          carts: p.carts,
          score: Math.round(score * 10) / 10,
          is_trending: p.views >= 3,
          is_abandoned: p.carts > 0,
        };
      })
      .filter(p => p.name)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    res.json({ products, generated_at: new Date().toISOString(), days });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── Refresh auto-products for a template ──────────────────────────────────────
export async function refreshAutoProducts(req, res) {
  try {
    const db = getDb();
    const channelId = req.headers['x-channel-id'] || 'demo';
    const { id } = req.params;

    const tpl = (db.meta_templates || []).find(t => t.id === id && t.channel_id === channelId);
    if (!tpl) return res.status(404).json({ error: 'Template not found' });
    if (!tpl.is_carousel) return res.status(400).json({ error: 'Only carousel templates support auto-products' });

    const hotProducts = computeHotProducts(db, channelId, tpl.auto_product_count || tpl.carousel_cards?.length || 3);

    // Build cards config from hot products
    const existingCards = (tpl.product_config?.cards) || tpl.carousel_cards.map(() => ({}));
    const cards = tpl.carousel_cards.map((card, i) => {
      const hot = hotProducts[i];
      const existing = existingCards[i] || {};
      if (!hot) return existing;
      return {
        ...existing,
        title: hot.name,
        price: hot.price,
        link: hot.url,
        // Only update image_id if card is in auto mode and no manual image set
        image_id: (card.source === 'auto' || !existing.image_id) ? (existing.image_id || '') : existing.image_id,
        _hot_image_url: hot.image,
        _hot_score: hot.score,
        _hot_views: hot.views,
        _hot_carts: hot.carts,
      };
    });

    if (!tpl.product_config) tpl.product_config = {};
    tpl.product_config.cards = cards;
    tpl.product_config.last_auto_refresh = new Date().toISOString();
    tpl.product_config.auto_products = hotProducts;
    db.save();

    res.json({ template: tpl, hot_products: hotProducts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Shared helper — used by endpoint and daily cron
export function computeHotProducts(db, channelId, limit = 10) {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const scores = {};

  for (const v of (db.product_views || [])) {
    if (v.channel_id !== channelId || v.created_at < since) continue;
    const key = v.product_url || v.product_name; if (!key) continue;
    if (!scores[key]) scores[key] = { name: v.product_name, url: v.product_url, image: v.product_image, price: v.product_price, views: 0, carts: 0 };
    scores[key].views++;
    if (!scores[key].image && v.product_image) scores[key].image = v.product_image;
    if (!scores[key].price && v.product_price) scores[key].price = v.product_price;
  }
  for (const c of (db.cart_events || [])) {
    if (c.channel_id !== channelId || c.recovered || c.created_at < since) continue;
    let pName = c.product_name, pUrl = c.product_url;
    if (!pName && c.products) { try { const a = JSON.parse(c.products); pName = a[0]?.name; pUrl = pUrl || a[0]?.url; } catch (_) { } }
    const key = pUrl || pName; if (!key) continue;
    if (!scores[key]) scores[key] = { name: pName, url: pUrl, image: c.product_image, price: c.product_price, views: 0, carts: 0 };
    scores[key].carts++;
    if (!scores[key].image && c.product_image) scores[key].image = c.product_image;
    if (!scores[key].price && c.product_price) scores[key].price = c.product_price;
  }
  for (const p of (db.product_catalog || [])) {
    if (p.channel_id !== channelId) continue;
    const key = p.url || p.name; if (!key) continue;
    if (!scores[key]) scores[key] = { name: p.name, url: p.url, image: p.image, price: p.price, views: 0, carts: 0 };
    if (!scores[key].name && p.name) scores[key].name = p.name;
    if (!scores[key].image && p.image) scores[key].image = p.image;
    if (!scores[key].price && p.price) scores[key].price = p.price;
  }

  return Object.entries(scores)
    .map(([, p]) => ({ name: p.name || '', url: p.url || '', image: p.image || '', price: p.price || '', views: p.views, carts: p.carts, score: (p.views * 1) + (p.carts * 3) }))
    .filter(p => p.name)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ── Scrape product from URL (Shopify JSON API + OpenGraph fallback) ───────────
export async function scrapeProduct(req, res) {
  try {
    const { url } = req.body;
    if (!url || !url.startsWith('http')) return res.status(400).json({ error: 'Valid URL required' });

    const cleanUrl = url.split('?')[0].replace(/\/$/, '');

    // ── 1. Try Shopify JSON API ──────────────────────────────────────────────
    try {
      const shopifyJson = cleanUrl + '.json';
      const r = await fetch(shopifyJson, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (r.ok) {
        const data = await r.json();
        const p = data.product;
        if (p?.title) {
          const variant = p.variants?.[0];
          const price = variant?.price;
          const currency = variant?.presentment_prices?.[0]?.price?.currency_code || 'INR';
          const symbol = currency === 'INR' ? '₹' : (currency === 'USD' ? '$' : currency + ' ');
          // Collect all product images (up to 8)
          const images = (p.images || []).slice(0, 8).map(img => ({ url: img.src, alt: img.alt || p.title }));
          return res.json({
            title: p.title,
            price: price ? `${symbol}${price}` : '',
            image_url: images[0]?.url || '',
            images,
            description: (p.body_html || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().substring(0, 200),
            source: 'shopify',
          });
        }
      }
    } catch (_) { }

    // ── 2. OpenGraph / meta tag scraping ────────────────────────────────────
    const html = await fetchHtml(url);
    function getMeta(props) {
      for (const prop of [].concat(props)) {
        const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`, 'i'))
          || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`, 'i'));
        if (m?.[1]) return m[1].trim();
      }
      return '';
    }
    const title = getMeta(['og:title', 'twitter:title']) || (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '').trim();
    const image_url = getMeta(['og:image', 'twitter:image:src', 'twitter:image']);
    const description = getMeta(['og:description', 'twitter:description', 'description']);
    const priceRaw = getMeta(['product:price:amount', 'og:price:amount']);
    const currency = getMeta(['product:price:currency', 'og:price:currency']) || 'INR';
    const symbol = currency === 'INR' ? '₹' : (currency === 'USD' ? '$' : currency + ' ');

    res.json({
      title: title.substring(0, 100),
      price: priceRaw ? `${symbol}${priceRaw}` : '',
      image_url,
      images: image_url ? [{ url: image_url, alt: title }] : [],
      description: description.substring(0, 200),
      source: 'opengraph',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WhatsWayBot/1.0)', 'Accept': 'text/html' },
      timeout: 8000,
    }, (resp) => {
      // Follow one redirect
      if ((resp.statusCode === 301 || resp.statusCode === 302) && resp.headers.location) {
        return fetchHtml(resp.headers.location).then(resolve).catch(reject);
      }
      let body = '';
      resp.on('data', chunk => { if (body.length < 200000) body += chunk; });
      resp.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
  });
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
        `https://graph.facebook.com/v25.0/${creds.wabaId}/message_templates?hsm_id=${tpl.meta_template_id}&name=${tpl.name}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${creds.token}` } }
      ).catch(() => { });
    }

    db.meta_templates.splice(idx, 1);
    db.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
