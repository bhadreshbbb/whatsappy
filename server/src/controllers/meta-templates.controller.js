import { getDb } from '../services/database.js';
import { v4 as uuidv4 } from 'uuid';
import { whatsappService } from '../services/whatsapp.service.js';
import https from 'https';
import http from 'http';

// ── Get credentials from settings (DB only — no env var fallback for WhatsApp) ─
function getCreds(channelId) {
  try {
    const db   = getDb();
    const rows = db.channel_settings || [];

    // 1. Exact channel match
    if (channelId && channelId !== 'demo') {
      const row = rows.find(r => r.channel_id === channelId);
      if (row) {
        const s = JSON.parse(row.settings || '{}');
        if (s.whatsapp_token && s.whatsapp_phone_id && s.whatsapp_business_id) {
          return { token: s.whatsapp_token, phoneId: s.whatsapp_phone_id, wabaId: s.whatsapp_business_id, appId: s.whatsapp_app_id || null };
        }
      }
    }

    // 2. Any non-demo channel with full credentials
    for (const row of rows) {
      if (row.channel_id === 'demo') continue;
      try {
        const s = JSON.parse(row.settings || '{}');
        if (s.whatsapp_token && s.whatsapp_phone_id && s.whatsapp_business_id) {
          return { token: s.whatsapp_token, phoneId: s.whatsapp_phone_id, wabaId: s.whatsapp_business_id, appId: s.whatsapp_app_id || null };
        }
      } catch (_) {}
    }
  } catch (e) {
    console.error('[MetaTemplates] getCreds DB error:', e.message);
  }
  return null;
}

/**
 * Sanitize template BODY TEXT before sending to Meta API.
 * Meta rejects: multiple consecutive spaces, 3+ consecutive newlines,
 * leading/trailing whitespace per line, and more than 2 total line breaks.
 */
function sanitizeMetaText(text) {
  if (!text) return text;
  return text
    .split('\n')
    .map(line => line.replace(/ {2,}/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')  // max 2 consecutive newlines
    .trim();
}

/**
 * Sanitize a VARIABLE VALUE before injecting it as a template parameter.
 * Variable values must NEVER contain newlines — Meta counts them against the
 * hydrated body's 2-line-break limit, causing error #132018.
 * Replaces \n with " | " so title+price stays readable on one line.
 */
function sanitizeVarValue(text) {
  // Meta rejects empty string parameters — always return at least a single space
  if (!text && text !== 0) return ' ';
  const s = String(text)
    .replace(/\n/g, ' | ')          // newlines → " | " (Meta disallows \n in params)
    .replace(/ {2,}/g, ' ')
    .trim();
  return s || ' ';                  // never return empty string to Meta
}

/**
 * Sanitize BUTTON TEXT for Meta API.
 * Meta rejects: emojis, newlines, bold/italic/strikethrough formatting chars.
 * Allowed: plain ASCII + Unicode letters/digits, spaces, punctuation.
 */
function sanitizeButtonText(text) {
  if (!text) return text;
  return text
    // Strip emoji ranges (broad coverage)
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/[\u{FE00}-\u{FEFF}]/gu, '')   // variation selectors
    .replace(/[\u{1F900}-\u{1F9FF}]/gu, '') // supplemental symbols
    .replace(/\u200D/g, '')                  // zero-width joiner
    // Strip WhatsApp formatting: *bold* _italic_ ~strike~ `code`
    .replace(/[*_~`]/g, '')
    // No newlines
    .replace(/[\n\r]/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim()
    .slice(0, 25); // Meta button text max 25 chars
}

// ── Variable example values — Meta reviewers see these; use realistic strings ──
// Mapped from the var_map field options so Meta understands what each {{N}} is.
const FIELD_EXAMPLES = {
  product_title:       'Blue Cotton Kurti',
  product_price:       '₹799',
  product_title_price: 'Blue Cotton Kurti | ₹799',   // compact: title + price in one var (no \n — Meta hydrated body limit)
  product_link:        'blue-cotton-kurti',
  customer_name:       'Priya Sharma',
  cart_total:          '₹1,499',
  cart_link:           'cart-abc123',
  order_id:            'ORD-20260429-1042',
  order_products:      'Blue Cotton Kurti × 1',
  order_total:         '799',
  payment_method:      'Cash on Delivery',
  delivery_date:       '3–5 business days',
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
  return { body_text: [vars.map(v => sanitizeVarValue(String(exampleValues[v] || '').trim() || getVarExample(v, varMap)))] };
}

/**
 * For NAMED parameter format:
 * - Derive a clean param name for each {{N}} variable:
 *   uses variable_labels value if set, else falls back to "param_N"
 * - Returns { nameFor, namedBody } where:
 *   nameFor(v) → param name string
 *   namedBody  → body text with {{N}} replaced by {{param_name}}
 */
function buildNamedParams(text, varMap, exampleValues = {}) {
  const vars = [...new Set([...(text || '').matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1]))].sort((a,b)=>+a-+b);
  if (!vars.length) return { namedBody: text, params: [] };

  // param name: label (snake_case) or "param_N"
  const nameFor = v => {
    const label = (varMap || {})[String(v)];
    if (label && label !== 'custom') return label.replace(/\s+/g, '_').toLowerCase();
    const custom = (varMap || {})[`${v}_custom`];
    if (custom) return custom.replace(/\W+/g, '_').toLowerCase().slice(0, 30);
    return `param_${v}`;
  };

  let namedBody = text;
  const params = vars.map(v => {
    const name = nameFor(v);
    namedBody = namedBody.replace(new RegExp(`\\{\\{${v}\\}\\}`, 'g'), `{{${name}}}`);
    const example = sanitizeVarValue(String(exampleValues[v] || '').trim() || getVarExample(v, varMap));
    return { param_name: name, example };
  });

  // Meta error 2388299: variables cannot be at the very start or end of body text.
  // Add minimal static text to satisfy this constraint without changing user intent.
  if (/^\{\{[^}]+\}\}/.test(namedBody.trimStart())) {
    namedBody = 'Hi! ' + namedBody;
  }
  if (/\{\{[^}]+\}\}$/.test(namedBody.trimEnd())) {
    namedBody = namedBody + '.';
  }

  return { namedBody, params };
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
function buildMetaComponents(tpl, { preserveVarNumbers = false } = {}) {
  const components = [];

  // variable_labels can arrive as object { '1': 'product_title' } or legacy []
  const stdVarMap = Array.isArray(tpl.variable_labels) ? {} : (tpl.variable_labels || {});

  // ── CAROUSEL ────────────────────────────────────────────────────────────────
  if (tpl.is_carousel && tpl.carousel_cards?.length >= 2) {

    // REQUIRED carousel-level body (Meta mandates a top-level BODY for carousel templates)
    // If the user left it blank, use a sensible default so Meta doesn't reject.
    const bodyText = sanitizeMetaText(tpl.body?.trim() || 'Check out our latest products for you!');
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
      const fileHandle = card.file_handle || card.header_media_id || '';
      if (fileHandle) {
        headerComp.example = { header_handle: [String(fileHandle)] };
        console.log(`[MetaTemplates] Card ${cardIdx + 1} header_handle = "${fileHandle}"`);
      } else {
        console.warn(`[MetaTemplates] ⚠  Card ${cardIdx + 1}: no file_handle/header_media_id — upload image to Gallery first.`);
      }
      cardComponents.push(headerComp);

      // 2. BODY — use real example_values so Meta reviewers see meaningful content
      if (card.body?.trim()) {
        const cleanBody = sanitizeMetaText(card.body);
        const comp = { type: 'BODY', text: cleanBody };
        const ex = buildBodyExample(cleanBody, vm, exV);
        if (ex) comp.example = ex;
        cardComponents.push(comp);
      }

      // 3. BUTTONS — max 2 per card (Meta spec)
      // CRITICAL: Meta requires URL button variable to always be {{1}} (button-scoped).
      // We store {{2}} internally (body uses {{1}} for title+price, button uses {{2}} for link),
      // but normalise any {{N}} in the button URL to {{1}} in the Meta payload.
      if (card.buttons?.length) {
        const buttons = card.buttons.slice(0, 2).map(b => {
          const bType = String(b.type || '').toUpperCase();
          if (bType === 'URL') {
            // Collect original var numbers BEFORE normalisation (for example lookup)
            const origVars = [...(b.url || '').matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1]);
            // Normalise: replace any {{N}} → {{1}}  (Meta button-variable scope rule)
            const normalizedUrl = preserveVarNumbers
              ? (b.url || '')
              : (b.url || '').replace(/\{\{\d+\}\}/g, '{{1}}');
            const btn = { type: 'URL', text: sanitizeButtonText(b.text), url: normalizedUrl };
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

  // ── STANDARD (single product) template — uses NAMED parameter format ─────────

  const exVals = Array.isArray(tpl.example_values) ? {} : (tpl.example_values || {});

  if (tpl.header_type === 'IMAGE') {
    const headerComp = { type: 'HEADER', format: 'IMAGE' };
    if (tpl.header_file_handle) headerComp.example = { header_handle: [String(tpl.header_file_handle)] };
    components.push(headerComp);
  } else if (tpl.header_type === 'TEXT' && tpl.header_text?.trim()) {
    const cleanHeader = sanitizeMetaText(tpl.header_text);
    const hVars = [...cleanHeader.matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1]);
    const comp = { type: 'HEADER', format: 'TEXT', text: cleanHeader };
    if (hVars.length) comp.example = { header_text: hVars.map(v => getVarExample(v, stdVarMap)) };
    components.push(comp);
  }

  if (tpl.body?.trim()) {
    const cleanBody = sanitizeMetaText(tpl.body);
    const { namedBody, params } = buildNamedParams(cleanBody, stdVarMap, exVals);
    const comp = { type: 'BODY', text: namedBody };
    if (params.length) comp.example = { body_text_named_params: params };
    components.push(comp);
  }

  if (tpl.footer?.trim()) components.push({ type: 'FOOTER', text: sanitizeMetaText(tpl.footer) });

  if (tpl.buttons?.length) {
    const rawButtons = tpl.buttons
      // Skip FLOW buttons with no flow_id — Meta rejects empty flow_id
      .filter(b => !(String(b.type || '').toUpperCase() === 'FLOW' && !b.flow_id?.trim()))
      .map(b => {
        const bType = String(b.type || '').toUpperCase();
        if (bType === 'URL') {
          const btn = { type: 'URL', text: sanitizeButtonText(b.text), url: b.url };
          const btnExVals = { '1': exVals['btn_1'] || exVals['4'] || 'product-slug' };
          const ex = buildUrlExample(b.url, stdVarMap, btnExVals);
          if (ex) btn.example = ex;
          return btn;
        }
        if (bType === 'QUICK_REPLY')  return { type: 'QUICK_REPLY',  text: sanitizeButtonText(b.text) };
        if (bType === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: sanitizeButtonText(b.text), phone_number: b.phone_number };
        if (bType === 'COPY_CODE') {
          const coupon = String(b.coupon_code || b.example || '').trim().toUpperCase() || 'DISCOUNT10';
          return { type: 'COPY_CODE', example: coupon };
        }
        if (bType === 'FLOW') {
          const flowBtn = { type: 'FLOW', text: sanitizeButtonText(b.text) };
          if (b.flow_id) flowBtn.flow_id = String(b.flow_id).trim();
          if (b.navigate_screen) flowBtn.navigate_screen = String(b.navigate_screen).trim();
          return flowBtn;
        }
        return null;
      })
      .filter(Boolean);

    // Meta rule: CTA buttons (URL, PHONE_NUMBER, FLOW) MUST come before QUICK_REPLY buttons.
    // Mixing is only allowed when CTAs appear first in the array.
    const CTA_TYPES = new Set(['URL', 'PHONE_NUMBER', 'FLOW', 'COPY_CODE']);
    const ctaBtns = rawButtons.filter(b => CTA_TYPES.has(b.type));
    const qrBtns  = rawButtons.filter(b => b.type === 'QUICK_REPLY');
    const buttons  = [...ctaBtns, ...qrBtns];

    if (buttons.length) components.push({ type: 'BUTTONS', buttons });
  }

  return components;
}

/**
 * Automatically downloads and uploads images from external URLs to Meta
 * and creates Gallery records inside a folder named after the template.
 * templateName: the template's display name — used as the gallery folder name.
 */
async function autoUploadTemplateImages(channelId, carouselCards, templateName = 'Template Assets') {
  const db = getDb();
  const folderName = (templateName || 'Template Assets').replace(/[^a-z0-9_\- ]/gi, '_').trim();
  if (!db.gallery_folders) db.gallery_folders = [];

  let folder = db.gallery_folders.find(f => f.channel_id === channelId && f.name === folderName);
  if (!folder) {
    folder = { id: uuidv4(), channel_id: channelId, name: folderName, created_at: new Date().toISOString() };
    db.gallery_folders.push(folder);
    console.log(`[AutoUpload] Created gallery folder "${folderName}"`);
  }

  const updatedCards = [...carouselCards];
  for (let i = 0; i < updatedCards.length; i++) {
    const card = updatedCards[i];

    // ── Priority 1: already have both file_handle + media_id — use them ────────
    if (card.file_handle && card.media_id) {
      console.log(`[AutoUpload] Card ${i + 1}: existing file_handle=${card.file_handle}  media_id=${card.media_id}`);
      updatedCards[i] = { ...card, header_media_id: card.file_handle };
      continue;
    }

    // ── Priority 2: gallery image_id — look up file_handle + media_id from DB ─
    if (card.image_id) {
      const galleryImg = (db.gallery_images || []).find(img => img.id === card.image_id && img.channel_id === channelId);
      if (galleryImg?.file_handle) {
        updatedCards[i] = {
          ...card,
          file_handle:     galleryImg.file_handle,
          media_id:        galleryImg.media_id || '',
          header_media_id: galleryImg.file_handle,   // template creation uses file_handle
        };
        console.log(`[AutoUpload] Card ${i + 1}: from gallery → file_handle=${galleryImg.file_handle}  media_id=${galleryImg.media_id || 'none'}`);
        continue;
      }
      // Gallery image exists but has no file_handle (e.g. auto-detected product with only media_id).
      // Re-upload via source_url to get a file_handle for template approval.
      if (galleryImg?.source_url) {
        let imageUrl = galleryImg.source_url;
        if (imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;
        if (imageUrl.startsWith('http')) {
          try {
            const { buffer, mimeType } = await whatsappService.downloadImage(imageUrl);
            const fileHandle = await whatsappService.uploadMediaResumable(buffer, `gallery_card${i + 1}_${Date.now()}.jpg`, mimeType, channelId);
            const mediaId    = galleryImg.media_id || await whatsappService.uploadMedia(buffer, `gallery_card${i + 1}.jpg`, mimeType, channelId);
            // Persist file_handle back to gallery so future creates don't need to re-upload
            galleryImg.file_handle = fileHandle;
            if (!galleryImg.media_id) galleryImg.media_id = mediaId;
            updatedCards[i] = {
              ...card,
              file_handle:     fileHandle,
              media_id:        mediaId,
              header_media_id: fileHandle,
            };
            console.log(`[AutoUpload] Card ${i + 1}: re-uploaded from source_url → file_handle=${fileHandle}  media_id=${mediaId}`);
            continue;
          } catch (reupErr) {
            console.warn(`[AutoUpload] Card ${i + 1}: re-upload from source_url failed (${reupErr.message}), continuing without file_handle`);
          }
        }
      }
    }

    // ── Priority 3: external image URL — upload TWICE to Meta ────────────────
    // • uploadMediaResumable → file_handle  (used in template creation example)
    // • uploadMedia          → media_id     (stored in gallery, used in send payload { "id": media_id })
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

        // Upload 1: resumable → file_handle for template creation example
        const fileHandle = await whatsappService.uploadMediaResumable(buffer, `auto_card${i + 1}_${Date.now()}.jpg`, mimeType, channelId);
        console.log(`[AutoUpload] Card ${i + 1}: resumable upload → file_handle=${fileHandle}`);

        // Upload 2: regular → media_id for message send payload
        const mediaId = await whatsappService.uploadMedia(buffer, `auto_card${i + 1}.jpg`, mimeType, channelId);
        console.log(`[AutoUpload] Card ${i + 1}: regular upload → media_id=${mediaId}`);

        // Save to gallery — folder named after template, image record named by media_id
        const image = {
          id:          uuidv4(),
          folder_id:   folder.id,
          channel_id:  channelId,
          filename:    mediaId,          // named by media_id
          mime_type:   mimeType,
          size:        buffer.length,
          file_handle: fileHandle,       // for template creation
          media_id:    mediaId,          // for message send: { "id": media_id }
          source_url:  externalUrl,
          created_at:  new Date().toISOString(),
        };
        if (!db.gallery_images) db.gallery_images = [];
        db.gallery_images.push(image);

        updatedCards[i] = {
          ...card,
          image_id:        image.id,
          file_handle:     fileHandle,
          media_id:        mediaId,
          header_media_id: fileHandle,   // template creation uses file_handle in example
        };
      } catch (err) {
        console.error(`[AutoUpload] Card ${i + 1}: upload failed — ${err.message}. Continuing without image.`);
        // Don't throw — other cards should still work; template can still be submitted
      }
      continue;
    }

    // ── No image source at all ───────────────────────────────────────────────
    console.warn(`[AutoUpload] Card ${i + 1}: no image source — header will be missing`);
  }

  db.save();
  return updatedCards;
}

// ── Build carousel cards fully from hot products (auto_product_mode) ──────────
// Called at template creation time. Scrapes, downloads, and dual-uploads each
// hot product image (media_id for send + file_handle for template creation).
// Every image is ALWAYS saved to the gallery with both IDs.
// Fetch products from Shopify /products.json — returns ready-to-use product list
async function fetchShopifyProducts(shopBase, limit = 20) {
  const url = `${shopBase}/products.json?limit=${limit}`;
  console.log(`[AutoCards] Trying Shopify API: ${url}`);
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error(`Shopify products.json returned ${r.status}`);
  const data = await r.json();
  const products = (data.products || []);
  return products.map(p => {
    const variant   = p.variants?.[0];
    const price     = variant?.price ? `₹${variant.price}` : '';
    const imageUrl  = p.images?.[0]?.src || '';
    const handle    = p.handle || nameToSlug(p.title);
    return {
      name:     p.title || '',
      url:      `${shopBase}/products/${handle}`,
      image:    imageUrl,
      price,
      views:    0,
      carts:    0,
      score:    0,
      _shopify: true,
      // Pre-validated — Shopify API guarantees title, price (may be '0'), image
      _title:    p.title || '',
      _price:    price,
      _imageUrl: imageUrl,
    };
  }).filter(p => p.name && p.image); // must have title + image at minimum
}

// Get shop_url — env var wins, then channel settings
function getShopUrl(db, channelId) {
  // 1. Env var (always available regardless of DB state)
  if (process.env.SHOP_URL) return process.env.SHOP_URL.replace(/\/$/, '');
  // 2. Channel settings
  const row = db.channel_settings?.find(s => s.channel_id === channelId) || db.channel_settings?.[0];
  try {
    const s = JSON.parse(row?.settings || '{}');
    const raw = s.shop_url || s.store_url || s.website_url || '';
    if (!raw) return null;
    const base = raw.replace(/\/$/, '');
    return base.startsWith('http') ? base : `https://${base}`;
  } catch (_) { return null; }
}

export async function buildAutoProductCards(channelId, cleanName, count = 4, offset = 0) {
  const db = getDb();
  const COUNT = Math.max(2, count);

  if (!db.gallery_folders) db.gallery_folders = [];
  if (!db.gallery_images)  db.gallery_images  = [];

  const folderName = cleanName.replace(/[^a-z0-9_\- ]/gi, '_').trim();
  let folder = db.gallery_folders.find(f => f.channel_id === channelId && f.name === folderName);
  if (!folder) {
    folder = { id: uuidv4(), channel_id: channelId, name: folderName, created_at: new Date().toISOString() };
    db.gallery_folders.push(folder);
    console.log(`[AutoCards] Created gallery folder "${folderName}"`);
  }

  // ── Step 1: Get product URLs from analytics/pages (db.page_views) ────────────
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const pvRows = (db.page_views || []).filter(p => p.channel_id === channelId && p.viewed_at >= since);

  const byUrl = {};
  for (const pv of pvRows) {
    const url = pv.url; if (!url) continue;
    if (!byUrl[url]) byUrl[url] = { url, title: pv.page_title || '', views: 0, sessions: new Set() };
    byUrl[url].views++;
    byUrl[url].sessions.add(pv.session_id);
    if (pv.page_title && pv.page_title.length > (byUrl[url].title||'').length) byUrl[url].title = pv.page_title;
  }

  const analyticsPages = Object.values(byUrl)
    .filter(p => isProductUrl(p.url))
    .sort((a, b) => b.views - a.views);

  console.log(`[AutoCards] analytics/pages: ${analyticsPages.length} product URLs from ${pvRows.length} page_views`);
  analyticsPages.slice(0, 8).forEach((p, i) => console.log(`  #${i+1} views=${p.views}  ${p.url}`));

  // ── Step 2: Build catalog lookup map (URL → {name, price, image}) ────────────
  // product_catalog has scraped title+price+image for every tracked URL.
  // Use it to fill data without re-scraping — images come from here directly.
  const catalogMap = {};
  for (const c of (db.product_catalog || [])) {
    if (c.url) catalogMap[c.url] = c;
  }

  // ── Step 3: Build candidates list ─────────────────────────────────────────────
  // Primary: analytics/pages product URLs (most-viewed first)
  // Always supplement with product_catalog so we reach COUNT even with sparse traffic
  let candidates = [];

  // Analytics-sourced candidates
  const analyticsCandidates = analyticsPages.map(p => {
    const cat = catalogMap[p.url] || {};
    return { url: p.url, name: cat.name || p.title || '', price: cat.price || '', image: cat.image || '', views: p.views, _from_analytics: true };
  });

  // Catalog candidates (already stored products in settings — always include as supplement)
  const seenUrls = new Set(analyticsCandidates.map(c => c.url));
  const catalogCandidates = (db.product_catalog || [])
    .filter(c => c.channel_id === channelId && c.url && !seenUrls.has(c.url))
    .map(c => ({ url: c.url, name: c.name || '', price: c.price || '', image: c.image || '', views: 0, _from_catalog: true }));

  candidates = [...analyticsCandidates, ...catalogCandidates];

  // If still not enough, try Shopify API to pull more products
  if (candidates.length < COUNT) {
    console.log(`[AutoCards] Only ${candidates.length} candidates — trying Shopify API for more`);
    const shopUrl = getShopUrl(db, channelId) || inferStoreBaseUrl(db);
    if (shopUrl) {
      try {
        const shopifyProducts = await fetchShopifyProducts(shopUrl, 50);
        const seededAt = new Date().toISOString();
        const shopifyUrls = new Set(candidates.map(c => c.url));
        for (const sp of shopifyProducts) {
          const ei = db.product_catalog.findIndex(c => c.url === sp.url);
          const entry = { channel_id: channelId, name: sp.name, url: sp.url, price: sp._price, image: sp.image, _seeded_at: seededAt };
          if (ei >= 0) db.product_catalog[ei] = { ...db.product_catalog[ei], ...entry };
          else db.product_catalog.push(entry);
          catalogMap[sp.url] = entry;
          if (!shopifyUrls.has(sp.url)) {
            candidates.push({ url: sp.url, name: sp.name, price: sp._price, image: sp.image, views: 0, _shopify: true });
            shopifyUrls.add(sp.url);
          }
        }
        db.save();
        console.log(`[AutoCards] Shopify supplement: +${shopifyProducts.length} products`);
      } catch (e) {
        console.warn(`[AutoCards] Shopify supplement failed: ${e.message}`);
      }
    }
  }

  console.log(`[AutoCards] ${analyticsCandidates.length} from analytics + ${catalogCandidates.length} from catalog = ${candidates.length} total candidates`);

  // Limit pool to top 50 (sorted by views: top → medium → low)
  const MAX_POOL = 50;
  candidates = candidates.slice(0, MAX_POOL);
  const totalCandidates = candidates.length;

  // Round-robin cycle with wrap-around: rotate the list so we always have
  // enough candidates regardless of pool size.
  // e.g. 4 products, offset=1 → [B,C,D,A]; offset=2 → [C,D,A,B]; etc.
  if (offset > 0 && totalCandidates > 0) {
    const start = offset % totalCandidates;
    if (start > 0) {
      candidates = [...candidates.slice(start), ...candidates.slice(0, start)];
    }
    console.log(`[AutoCards] Cycle offset=${offset} → rotated pool starting at #${start + 1} of ${totalCandidates}`);
  }

  console.log(`[AutoCards] ${candidates.length} candidates in window (pool=${totalCandidates}, offset=${offset})`);

  const cards = [];
  const productConfigCards = [];

  for (const hot of candidates) {
    if (cards.length >= COUNT) break;

    if (!hot.url) {
      console.log(`[AutoCards] Skip entry — no URL`);
      continue;
    }

    // ── Get title + price + image ─────────────────────────────────────────────
    // Priority: catalog data (already scraped) → Shopify API → scrape live
    let title = '', price = '', imageUrl = '';
    const link = hot.url;

    // 1. Use data already on the candidate (from catalog or Shopify API)
    title    = (hot.name  || hot._title    || '').trim();
    price    = (hot.price || hot._price    || '').trim();
    imageUrl = (hot.image || hot._imageUrl || '').trim();

    // 2. Fill gaps from product_catalog (has images from tracker scraping)
    const catEntry = catalogMap[hot.url];
    if (catEntry) {
      if (!title)    title    = (catEntry.name  || '').trim();
      if (!price)    price    = (catEntry.price || '').trim();
      if (!imageUrl) imageUrl = (catEntry.image || '').trim();
    }

    // 3. Only scrape if image is still missing (title/price can be inferred but image is required)
    if (!imageUrl || !title || !price) {
      try {
        console.log(`[AutoCards] Scraping for missing data: title=${!!title} price=${!!price} image=${!!imageUrl} — ${hot.url}`);
        const scraped = await scrapeProductData(hot.url);
        if (!title)    title    = (scraped.title     || '').trim();
        if (!price)    price    = (scraped.price     || '').trim();
        if (!imageUrl) imageUrl = (scraped.image_url || '').trim();
        // Save to catalog so future calls skip scraping
        if (scraped.image_url) {
          const ei = db.product_catalog.findIndex(c => c.url === hot.url);
          const entry = { channel_id: channelId, name: scraped.title || title, url: hot.url, price: scraped.price || price, image: scraped.image_url };
          if (ei >= 0) db.product_catalog[ei] = { ...db.product_catalog[ei], ...entry };
          else db.product_catalog.push(entry);
          catalogMap[hot.url] = entry;
        }
      } catch (e) {
        console.warn(`[AutoCards] Scrape failed for "${hot.url}": ${e.message}`);
      }
    } else {
      console.log(`[AutoCards] Using stored data for "${title}" — no scrape needed`);
    }

    if (!title)    { console.log(`[AutoCards] Skip "${hot.url}" — no title`);    continue; }
    if (!price)    { console.log(`[AutoCards] Skip "${hot.url}" — no price`);    continue; }
    if (!imageUrl) { console.log(`[AutoCards] Skip "${hot.url}" — no main image`); continue; }

    console.log(`[AutoCards] ✓ Valid product ${cards.length + 1}: "${title}"  ${price}`);

    // ── Dual image upload ─────────────────────────────────────────────────────
    let fileHandle = '', mediaId = '', imageId = '';
    const cardNum = cards.length + 1;
    const filename = `auto_${folderName}_c${cardNum}.jpg`;

    // Check if this source_url was already uploaded anywhere (reuse media_id to avoid redundant uploads)
    const globalCached = db.gallery_images.find(
      img => img.channel_id === channelId && img.source_url === imageUrl && img.media_id
    );

    if (globalCached) {
      mediaId    = globalCached.media_id    || '';
      fileHandle = globalCached.file_handle || '';

      // Ensure a record exists in THIS folder (so gallery shows it under the template folder)
      const folderRecord = db.gallery_images.find(
        img => img.channel_id === channelId && img.folder_id === folder.id && img.source_url === imageUrl
      );
      if (folderRecord) {
        // Update in-place (refresh title, price, card slot)
        folderRecord.media_id     = mediaId;
        folderRecord.file_handle  = fileHandle;
        folderRecord.product_name = title;
        folderRecord.product_url  = link;
        folderRecord.card_index   = cardNum - 1;
        folderRecord.updated_at   = new Date().toISOString();
        imageId = folderRecord.id;
      } else {
        // Create a new record in the template folder (same media_id, different folder)
        const newRec = {
          id:            uuidv4(), folder_id: folder.id, channel_id: channelId,
          filename,      mime_type: globalCached.mime_type || 'image/jpeg', size: globalCached.size || 0,
          media_id:      mediaId,
          file_handle:   fileHandle,
          source_url:    imageUrl,
          auto_detected: true,
          product_url:   link, product_name: title,
          template_name: folderName, card_index: cardNum - 1,
          created_at:    new Date().toISOString(),
        };
        db.gallery_images.push(newRec);
        imageId = newRec.id;
      }

      // Backfill missing file_handle on the global record if needed
      if (!fileHandle) {
        try {
          const { buffer, mimeType } = await whatsappService.downloadImage(imageUrl);
          fileHandle = await whatsappService.uploadMediaResumable(buffer, filename, mimeType, channelId);
          globalCached.file_handle = fileHandle;
          if (folderRecord) folderRecord.file_handle = fileHandle;
        } catch (_) { /* non-fatal */ }
      }
      console.log(`[AutoCards] Card ${cardNum}: reused cached media_id:${mediaId} → upserted in folder "${folderName}"`);
    } else {
      try {
        const { buffer, mimeType } = await whatsappService.downloadImage(imageUrl);

        mediaId = await whatsappService.uploadMedia(buffer, filename, mimeType, channelId);
        try {
          fileHandle = await whatsappService.uploadMediaResumable(buffer, filename, mimeType, channelId);
        } catch (e) {
          console.warn(`[AutoCards] Card ${cardNum}: resumable upload failed (non-fatal) — ${e.message}`);
        }

        // Upsert: replace existing record in this folder slot, or push new one
        const existIdx = db.gallery_images.findIndex(
          img => img.channel_id === channelId && img.folder_id === folder.id && img.card_index === cardNum - 1
        );
        const imgRecord = {
          id:            existIdx >= 0 ? db.gallery_images[existIdx].id : uuidv4(),
          folder_id:     folder.id, channel_id: channelId,
          filename,      mime_type: mimeType, size: buffer.length,
          media_id:      mediaId,
          file_handle:   fileHandle,
          source_url:    imageUrl,
          auto_detected: true,
          product_url:   link, product_name: title,
          template_name: folderName, card_index: cardNum - 1,
          created_at:    existIdx >= 0 ? db.gallery_images[existIdx].created_at : new Date().toISOString(),
          updated_at:    new Date().toISOString(),
        };
        if (existIdx >= 0) db.gallery_images[existIdx] = imgRecord;
        else db.gallery_images.push(imgRecord);
        imageId = imgRecord.id;
        console.log(`[AutoCards] Card ${cardNum}: uploaded → media_id:${mediaId}  file_handle:${fileHandle || 'n/a'}`);
      } catch (e) {
        console.warn(`[AutoCards] Card ${cardNum}: Meta upload failed (${e.message}) — card added without media_id, will retry on submit`);
        mediaId = ''; fileHandle = ''; imageId = '';
      }
    }

    // ── Add card (only reached when title + price + image + media_id all confirmed) ──
    // Variable structure:
    //   {{1}} = product_title_price  → "Title\n₹Price"  (one variable, Meta-compliant)
    //   {{2}} = product_link         → URL button suffix (slug appended to fixed button URL prefix)
    let slug = link;
    let buttonUrlBase = 'https://yourstore.com/products/';
    try {
      const u = new URL(link);
      const parts = u.pathname.split('/').filter(Boolean);
      slug = parts.pop() || slug;
      buttonUrlBase = parts.length ? `${u.origin}/${parts.join('/')}/` : `${u.origin}/`;
    } catch(_) {}

    cards.push({
      body: '✨ {{1}}\n\nTap below to explore this product now!',
      buttons: [{ type: 'URL', text: 'Shop Now', url: `${buttonUrlBase}{{2}}` }],
      source: 'auto',
      image_id: imageId, file_handle: fileHandle, media_id: mediaId,
      var_map:        { '1': 'product_title_price', '2': 'product_link' },
      example_values: { '1': `${title} | ${price}`, '2': slug },
      product_data:   { title, price, link, image_url: imageUrl },
      selected_fetch_image: imageUrl,
      fetched_images: [{ url: imageUrl, alt: title }],
    });
    productConfigCards.push({
      title, price, link, image_id: imageId,
      media_id:    mediaId,    // numeric — /messages { "image": { "id": media_id } }
      file_handle: fileHandle, // "4:..." — template creation only, never in send payload
      _hot_image_url: imageUrl,
      _hot_score: hot.score ?? 0, _hot_views: hot.views ?? 0, _hot_carts: hot.carts ?? 0,
      _auto_updated: new Date().toISOString(),
    });
  }

  if (cards.length < 2) {
    if (offset > 0) {
      // With wrap-around this should be rare, but if the entire catalog has <2 valid products,
      // return gracefully so automation advances offset and retries next tick.
      console.warn(`[AutoCards] Only ${cards.length} valid product(s) in full catalog at offset=${offset} — retrying next tick`);
      db.save();
      return { cards, productConfigCards, candidatesTotal: totalCandidates };
    }
    const tried = candidates.length;
    throw new Error(
      `Auto-detect found only ${cards.length} valid product(s) from ${tried} candidates. ` +
      `Need at least 2. Check: (1) shop_url is set in Settings, ` +
      `(2) product URLs are accessible, ` +
      `(3) WhatsApp credentials are configured for image upload.`
    );
  }

  db.save();
  console.log(`[AutoCards] ${cards.length}/${candidates.length} candidates passed → gallery "${folderName}"`);
  return { cards, productConfigCards, candidatesTotal: totalCandidates };
}

// ── Auto-detect products endpoint — validate + upload BEFORE template creation ─
// POST /api/meta-templates/auto-detect-products
// Flow: computeHotProducts → scrapeProductData (validates title+price+image) →
//       downloadImage → uploadMedia (media_id) + uploadMediaResumable (file_handle) →
//       save to gallery → return ready-to-edit card data to the UI.
// Only products that pass ALL three checks (title, price, main image) are returned.
export async function autoDetectProducts(req, res) {
  try {
    const channelId = req.headers['x-channel-id'] || '';
    const { count = 4, template_name = '' } = req.body;
    const cleanName = (template_name || 'auto_products').toLowerCase().replace(/[^a-z0-9_]/g, '_');

    const { cards, productConfigCards } = await buildAutoProductCards(channelId, cleanName, Number(count));

    res.json({
      cards,            // ready-to-use carousel card objects (editable in UI)
      products: productConfigCards.map(c => ({
        title:    c.title,
        price:    c.price,
        link:     c.link,
        image:    c._hot_image_url,
        media_id: c.media_id,
      })),
      validated: cards.length,
    });
  } catch (err) {
    console.error('[AutoDetect] Error:', err.message);
    res.status(400).json({ error: err.message });
  }
}

// ── Preview / dry-run payload (no submission to Meta) ─────────────────────────
// POST /api/meta-templates/preview-payload  ← same body as createTemplate
export async function previewPayload(req, res) {
  try {
    const db = getDb();
    const channelId = req.headers['x-channel-id'] || '';
    const { name, category, language, body, footer, buttons, header_type, header_text,
      is_carousel, carousel_cards, variable_labels,
      header_image_url, header_image_id, example_values } = req.body;

    const cleanName = (name || 'preview').toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const langMap = { en: 'en_US', hi: 'hi', gu: 'gu', ta: 'ta', te: 'te', mr: 'mr', bn: 'bn', ar: 'ar', ur: 'ur' };

    const tpl = {
      name: cleanName, category: category || 'MARKETING',
      language: language || 'en',
      header_type: header_type || 'NONE', header_text: header_text || '',
      body: body || '', footer: footer || '',
      buttons: buttons || [], variable_labels: variable_labels || [],
      example_values: example_values || {},
      is_carousel: !!is_carousel, carousel_cards: carousel_cards || [],
    };

    // ── For single product: resolve header image → get real file_handle from Meta ──
    if (!is_carousel && header_type === 'IMAGE') {
      // Try gallery record first (cheapest — already uploaded)
      let resolvedFileHandle = '';
      let resolvedMediaId = '';

      if (header_image_id && db.gallery_images) {
        const rec = db.gallery_images.find(g => g.id === header_image_id && g.channel_id === channelId);
        if (rec) {
          resolvedFileHandle = rec.file_handle || '';
          resolvedMediaId    = rec.media_id    || '';
        }
      }

      // Upload image to Meta to get file_handle if not already cached
      const imgUrl = header_image_url || '';
      if (!resolvedFileHandle && imgUrl) {
        try {
          const creds = getCreds(channelId);
          if (creds) {
            const { buffer, mimeType } = await whatsappService.downloadImage(imgUrl);
            const filename = `${cleanName}_prev_${Date.now()}.jpg`;
            resolvedFileHandle = await whatsappService.uploadMediaResumable(buffer, filename, mimeType, channelId);
            if (!resolvedMediaId) {
              try { resolvedMediaId = await whatsappService.uploadMedia(buffer, filename, mimeType, channelId); } catch (_) {}
            }
            // Cache in gallery so next preview/creation reuses it
            if (!db.gallery_folders) db.gallery_folders = [];
            if (!db.gallery_images)  db.gallery_images  = [];
            let folder = db.gallery_folders.find(f => f.channel_id === channelId && f.name === cleanName);
            if (!folder) {
              folder = { id: uuidv4(), channel_id: channelId, name: cleanName, created_at: new Date().toISOString() };
              db.gallery_folders.push(folder);
            }
            const existIdx = db.gallery_images.findIndex(g => g.channel_id === channelId && g.template_name === cleanName && g.card_index === 0);
            const record = {
              id: existIdx >= 0 ? db.gallery_images[existIdx].id : uuidv4(),
              folder_id: folder.id, channel_id: channelId,
              filename, media_id: resolvedMediaId, file_handle: resolvedFileHandle,
              source_url: imgUrl, template_name: cleanName, card_index: 0,
              auto_detected: false,
              created_at: existIdx >= 0 ? db.gallery_images[existIdx].created_at : new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            if (existIdx >= 0) db.gallery_images[existIdx] = record;
            else db.gallery_images.push(record);
            db.save();
            console.log(`[Preview] Uploaded header image → file_handle: ${resolvedFileHandle}, media_id: ${resolvedMediaId}`);
          }
        } catch (uploadErr) {
          console.warn(`[Preview] Header image upload failed (non-fatal): ${uploadErr.message}`);
        }
      }

      if (resolvedFileHandle) tpl.header_file_handle = resolvedFileHandle;
      if (resolvedMediaId)    tpl.header_image_id    = resolvedMediaId;
    }

    // ── Resolve images if dry-running carousel ──
    if (is_carousel) {
      tpl.carousel_cards = await autoUploadTemplateImages(channelId, carousel_cards, name || 'preview');
    }

    const components = buildMetaComponents(tpl, { preserveVarNumbers: !is_carousel ? false : true });
    const payload = {
      name: cleanName,
      category: (tpl.category || 'MARKETING').toUpperCase(),
      language: langMap[tpl.language] || tpl.language,
      ...(is_carousel ? {} : { parameter_format: 'NAMED' }),
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
      // Compact: title + separator + price in a single variable.
      // MUST NOT use \n — Meta counts all newlines against the 2-line-break hydrated body limit.
      const t = productCard?.title || '';
      const p = productCard?.price || '';
      return t && p ? `${t} | ${p}` : (t || p);
    }
    case 'product_link': {
      const link = productCard?.link || productCard?.url || productCard?.product_url || '';
      if (!link) return '';
      // If already a slug (no protocol), return as-is
      if (!link.startsWith('http')) return link;
      // Extract ONLY the last path segment (slug) — never pass the full URL as button parameter
      try {
        const seg = new URL(link).pathname.split('/').filter(Boolean).pop() || '';
        return seg;
      } catch { return ''; }
    }
    case 'customer_name':  return productCard?.name || productCard?.customer_name || 'Customer';
    case 'cart_total':     return productCard?.cart_total || '';
    case 'cart_link':      return productCard?.link || '';
    case 'order_id':       return productCard?.order_id || productCard?.order_number || '';
    case 'order_products': return productCard?.order_products || productCard?.products_summary || '';
    case 'order_total':    return String(productCard?.order_total || productCard?.total_amount || '');
    case 'payment_method': return productCard?.payment_method || '';
    case 'delivery_date':  return productCard?.delivery_date || '3–5 business days';
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

export function buildSendMessagePayload(tpl, productConfig, recipientPhone = '{{RECIPIENT_PHONE}}', languageOverride = null, campaignId = null) {
  // languageOverride: Meta language code e.g. 'en_US', 'hi', 'gu' — from campaign target_language
  // Falls back to the template's own stored language
  const langCode = languageOverride
    ? (LANG_MAP[languageOverride] || languageOverride)   // allow short ('hi') or full ('en_US')
    : (LANG_MAP[tpl.language] || tpl.language || 'en_US');
  const stdVarMap = Array.isArray(tpl.variable_labels) ? {} : (tpl.variable_labels || {});
  const components = [];

  const firstCard = (productConfig?.cards || [])[0] || {};

  // Non-carousel image header — inject product image from productConfig.cards[0]
  if (!tpl.is_carousel && tpl.header_type === 'IMAGE') {
    const cardMediaId = firstCard.media_id || '';
    const cardImgUrl  = firstCard.image || firstCard.image_url || '';
    // Only fall back to template's stored header if the card has NO product-specific image at all.
    // This prevents Faux Georgette (or any template default) from overriding the actual product image.
    const mediaId = cardMediaId || (cardImgUrl ? '' : (tpl.header_image_id || ''));
    const imgUrl  = cardImgUrl  || (cardMediaId ? '' : (tpl.header_image_url || ''));
    if (mediaId) {
      components.push({ type: 'header', parameters: [{ type: 'image', image: { id: mediaId } }] });
    } else if (imgUrl) {
      components.push({ type: 'header', parameters: [{ type: 'image', image: { link: imgUrl } }] });
    }
  }

  // Optional body parameters (carousel-level or single-product)
  if (tpl.body?.trim()) {
    const vars = [...tpl.body.matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1]);
    if (vars.length > 0) {
      // When variable_labels is empty (abandoned_product_view), perUserProductConfig.cards[0]
      // stores already-resolved strings in positional keys: '1', '2', etc.
      // Fall back to those if getFieldValue returns empty.
      const resolveVar = (v) => {
        const fieldVal = getFieldValue(v, stdVarMap, firstCard);
        if (fieldVal) return fieldVal;
        return String(firstCard[v] || firstCard[`v${v}`] || '');
      };
      // Non-carousel templates use parameter_format: NAMED — include parameter_name
      // so Meta can match each value to the correct named placeholder ({{param_1}} etc.)
      const nameFor = (v) => {
        const label = stdVarMap[v];
        if (label && label !== 'custom') return label.replace(/\s+/g, '_').toLowerCase();
        return `param_${v}`;
      };
      const isNamed = !tpl.is_carousel;
      components.push({
        type: 'body',
        parameters: vars.map(v => {
          const param = { type: 'text', text: sanitizeVarValue(resolveVar(v)) };
          if (isNamed) param.parameter_name = nameFor(v);
          return param;
        }),
      });
    }
  }

  // Non-carousel URL button parameters
  if (!tpl.is_carousel) {
    const buttons = Array.isArray(tpl.buttons)
      ? tpl.buttons
      : (typeof tpl.buttons === 'string' ? (() => { try { return JSON.parse(tpl.buttons); } catch (_) { return []; } })() : []);
    buttons.forEach((btn, bi) => {
      const bType = String(btn.type || '').toUpperCase();
      if (bType === 'URL' && btn.url?.includes('{{')) {
        const urlVars = [...btn.url.matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1]);
        const varStart = btn.url.indexOf('{{');
        const staticPrefix = varStart > 0 ? btn.url.substring(0, varStart) : '';
        const fullLink = firstCard.link || firstCard.url || firstCard.product_url || '';
        let paramVal;
        if (staticPrefix) {
          let seg = getFieldValue(urlVars[0], stdVarMap, firstCard);
          // If seg contains spaces or non-URL-safe chars (e.g. resolved to a customer name),
          // prefer order_id as the path segment, or URL-encode as last resort.
          if (seg && /[^A-Za-z0-9\-_.~]/.test(seg)) {
            seg = firstCard.order_id || firstCard.order_number || encodeURIComponent(seg);
          }
          paramVal = seg || (fullLink ? (() => { try { return new URL(fullLink).pathname.split('/').filter(Boolean).pop() || ''; } catch { return ''; } })() : '');
          if (paramVal && campaignId) paramVal += `?utm_source=whatsapp&utm_medium=single_product&utm_campaign=${campaignId}`;
        } else {
          paramVal = fullLink || getFieldValue(urlVars[0], stdVarMap, firstCard);
          if (paramVal && campaignId) { const sep = paramVal.includes('?') ? '&' : '?'; paramVal += `${sep}utm_source=whatsapp&utm_medium=single_product&utm_campaign=${campaignId}`; }
        }
        if (paramVal) {
          components.push({ type: 'button', sub_type: 'url', index: String(bi), parameters: [{ type: 'text', text: paramVal }] });
        }
      }
      if (bType === 'COPY_CODE') {
        const coupon = String(btn.coupon_code || btn.example || '').trim();
        if (coupon) {
          components.push({ type: 'button', sub_type: 'copy_code', index: String(bi), parameters: [{ type: 'coupon_code', coupon_code: coupon }] });
        }
      }
    });
  }

  // Carousel cards
  if (tpl.is_carousel && tpl.carousel_cards?.length) {
    const cards = tpl.carousel_cards.map((card, i) => {
      const pc  = (productConfig?.cards || [])[i] || {};
      const vm  = card.var_map || {};
      const exV = card.example_values || {};
      const cardComponents = [];

      // Merged product data: product_config > card.product_data (auto-fill fallback)
      // Spread pc first (gives access to extra fields like header_media_id), then
      // override with explicit fallback so empty-string pc.title doesn't kill the fallback.
      const pd = {
        ...pc,
        title: pc.title || card.product_data?.title || '',
        price: pc.price || card.product_data?.price || '',
        link:  pc.link  || card.product_data?.link  || '',
      };

      // Header image for /messages API.
      // ONLY use media_id (numeric string from uploadMedia → POST /media → data.id).
      // file_handle ("4:...") is for template creation ONLY — Meta rejects it in /messages.
      // If no media_id, fall back to image URL via { link: url }.
      const mediaId = pc.media_id || card.media_id || '';
      const imgUrl  = pc._hot_image_url || pc.image_url || pc.image || card.product_data?.image_url || '';
      if (mediaId) {
        cardComponents.push({ type: 'header', parameters: [{ type: 'image', image: { id: mediaId } }] });
      } else if (imgUrl) {
        console.warn(`[SendPayload] Card ${i + 1}: no media_id — falling back to image URL (may be rejected by Meta)`);
        cardComponents.push({ type: 'header', parameters: [{ type: 'image', image: { link: imgUrl } }] });
      }

      // Body text parameters — resolve each {{N}} via var_map against merged product data
      // Use sanitizeVarValue (not sanitizeMetaText) — variable values must never contain \n
      if (card.body?.trim()) {
        const vars = [...card.body.matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1]);
        if (vars.length > 0) {
          const params = vars.map(v => {
            const val = sanitizeVarValue(getFieldValue(v, vm, pd) || String(exV[v] || ''));
            return { type: 'text', text: val };
          });
          cardComponents.push({ type: 'body', parameters: params });
        }
      }

      // URL button parameters — {{N}} in stored URL resolves via var_map to product field.
      // Two modes depending on how the template button URL was created:
      //   • Static prefix + variable  e.g. "https://store.com/products/{{2}}"
      //     → send ONLY the slug. Meta appends it to the static prefix.
      //   • Entire URL is variable    e.g. "{{2}}" or "{{1}}"
      //     → send the FULL URL. Meta uses it as-is.
      (card.buttons || []).slice(0, 2).forEach((btn, bi) => {
        if (String(btn.type || '').toLowerCase() === 'url' && btn.url?.includes('{{')) {
          const urlVars  = [...btn.url.matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1]);
          const varStart = btn.url.indexOf('{{');
          const staticPrefix = varStart > 0 ? btn.url.substring(0, varStart) : ''; // '' when entire URL is variable

          const fullLink = pd.link || '';
          let paramVal;

          if (staticPrefix) {
            // Template has a static prefix — parameter must be only the slug so Meta doesn't double the prefix
            const slug = getFieldValue(urlVars[0], vm, pd); // extracts last path segment
            const rawFallback = String(exV[urlVars[0]] || '');
            const fallbackSlug = rawFallback.startsWith('http')
              ? (() => { try { return new URL(rawFallback).pathname.split('/').filter(Boolean).pop() || ''; } catch { return ''; } })()
              : rawFallback;
            paramVal = slug || fallbackSlug;
            // Append UTM to slug so Meta builds: staticPrefix + slug?utm_...
            if (paramVal && campaignId) {
              paramVal += `?utm_source=whatsapp&utm_medium=carousel&utm_campaign=${campaignId}`;
            }
          } else {
            // Entire URL is the variable — send the full product URL so the button is clickable
            paramVal = fullLink || getFieldValue(urlVars[0], vm, pd) || String(exV[urlVars[0]] || '');
            if (paramVal && campaignId) {
              const sep = paramVal.includes('?') ? '&' : '?';
              paramVal += `${sep}utm_source=whatsapp&utm_medium=carousel&utm_campaign=${campaignId}`;
            }
          }

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
    const channelId = req.headers['x-channel-id'] || '';
    const { id } = req.params;
    const tpl = (db.meta_templates || []).find(t => t.id === id && t.channel_id === channelId);
    if (!tpl) return res.status(404).json({ error: 'Template not found' });

    const langOverride = req.query.lang || null;

    // For single-product (non-carousel) templates, product data comes per-user at send time.
    // Build a sample config from example_values so the preview payload is meaningful.
    let previewConfig = tpl.product_config;
    if (!tpl.is_carousel && (!previewConfig?.cards?.length)) {
      const ex = Array.isArray(tpl.example_values) ? {} : (tpl.example_values || {});
      const buttons = Array.isArray(tpl.buttons) ? tpl.buttons
        : (typeof tpl.buttons === 'string' ? (() => { try { return JSON.parse(tpl.buttons); } catch { return []; } })() : []);
      const copyBtn = buttons.find(b => String(b.type || '').toUpperCase() === 'COPY_CODE');
      const sampleLink = 'https://yourstore.com/products/sample-product';
      previewConfig = {
        cards: [{
          '1':      ex['1']     || 'Product Name - Customer',
          '2':      ex['2']     || 'Price: Rs.999',
          link:     sampleLink,
          url:      sampleLink,
          media_id: tpl.header_image_id || '',
          image:    tpl.header_image_url || '',
          coupon:   copyBtn?.coupon_code || '',
        }],
      };
    }

    const payload = buildSendMessagePayload(tpl, previewConfig, req.query.to || '{{RECIPIENT_PHONE}}', langOverride);
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

    // Parse buttons for single-product metadata
    const tplButtons = Array.isArray(tpl.buttons) ? tpl.buttons
      : (typeof tpl.buttons === 'string' ? (() => { try { return JSON.parse(tpl.buttons); } catch { return []; } })() : []);

    res.json({
      payload,
      api_url: sendApiUrl,
      method: 'POST',
      auth_header: authDisplay,
      curl_command: curlCommand,
      is_single_product: !tpl.is_carousel,
      last_refresh:  tpl.product_config?.last_auto_refresh || null,
      next_refresh:  tpl.product_config?.next_auto_refresh
        || (tpl.product_config?.last_auto_refresh
          ? new Date(new Date(tpl.product_config.last_auto_refresh).getTime() + 24 * 3600 * 1000).toISOString()
          : null),
      folder_name:   tpl.product_config?.folder_name || null,
      products: (tpl.product_config?.cards || []).map((c, i) => ({
        card:     i + 1,
        title:    c.title          || '',
        price:    c.price          || '',
        link:     c.link           || '',
        image:    c._hot_image_url || '',
        media_id: c.media_id       || '',
        score:    c._hot_score     || 0,
        carts:    c._hot_carts     || 0,
        views:    c._hot_views     || 0,
      })),
      // Single-product template metadata for campaign preview UI
      single_product_info: !tpl.is_carousel ? {
        body:        tpl.body || '',
        footer:      tpl.footer || '',
        header_type: tpl.header_type || '',
        buttons:     tplButtons.map(b => ({
          type:        b.type,
          text:        b.text,
          url:         b.url || null,
          coupon_code: b.coupon_code || null,
        })),
        var_count:   [...(tpl.body || '').matchAll(/\{\{(\d+)\}\}/g)].length,
        note:        'Header image, body variables & button URL auto-filled per user from their product view at send time.',
      } : null,
      template_structure: {
        body:        tpl.body || '',
        card_count:  tpl.carousel_cards?.length || 0,
        note:        'Template structure fixed at creation. Product data refreshes every 24h.',
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── List all meta templates ────────────────────────────────────────────────────
export async function listTemplates(req, res) {
  const db = getDb();
  const channelId = req.headers['x-channel-id'] || '';
  const templates = (db.meta_templates || [])
    .filter(t => t.channel_id === channelId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  // Sync PENDING/DRAFT statuses from Meta WABA list before responding
  const pending = templates.filter(t => t.meta_template_id && !['APPROVED','REJECTED','SUBMIT_ERROR','NO_CREDENTIALS'].includes(t.meta_status));
  if (pending.length > 0) {
    try {
      const creds = getCreds(channelId);
      if (creds) {
        const metaRes = await fetch(
          `https://graph.facebook.com/v25.0/${creds.wabaId}/message_templates?fields=id,name,status&limit=100`,
          { headers: { Authorization: `Bearer ${creds.token}` } }
        );
        if (metaRes.ok) {
          const metaData = await metaRes.json();
          const metaMap = {};
          for (const mt of (metaData.data || [])) {
            metaMap[mt.id]   = mt;
            metaMap[mt.name] = mt;
          }
          let updated = false;
          for (const tpl of pending) {
            const found = metaMap[tpl.meta_template_id] || metaMap[tpl.name];
            if (!found) continue;
            const raw = found.status || '';
            const newStatus = (raw === 'ACTIVE' || raw === 'APPROVED') ? 'APPROVED' : raw;
            if (newStatus !== tpl.meta_status) {
              tpl.meta_status = newStatus;
              tpl.status_refreshed_at = new Date().toISOString();
              updated = true;
              console.log(`[listTemplates] "${tpl.name}" synced → ${newStatus}`);
            }
          }
          if (updated) db.save();
        }
      }
    } catch (e) {
      console.warn(`[listTemplates] Status sync failed (non-fatal): ${e.message}`);
    }
  }

  res.json({ templates });
}

// ── Create + submit template to Meta ──────────────────────────────────────────
export async function createTemplate(req, res) {
  try {
    const db = getDb();
    const channelId = req.headers['x-channel-id'] || '';
    const { name, category, language, header_type, header_text, header_image_url, body, footer, buttons, variable_labels, example_values, is_carousel, carousel_cards, auto_product_mode } = req.body;

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
      header_image_url: header_image_url || '',
      header_image_id: '',
      header_file_handle: '',
      example_values: example_values || {},
      body,
      footer: footer || '',
      buttons: buttons || [],
      variable_labels: variable_labels || [],
      is_carousel: !!is_carousel,
      auto_product_mode: !!auto_product_mode,
      carousel_cards: carousel_cards || [],
      meta_status: 'DRAFT',
      meta_template_id: null,
      product_config: null,  // initialized below after image upload
      created_at: new Date().toISOString(),
      submitted_at: null,
    };

    const creds = getCreds(channelId);
    if (creds) {
      // ── Step 1: Resolve images ────────────────────────────────────────────────
      // auto_product_mode: build ALL cards server-side from hot products (scrape + dual upload)
      // manual mode:       upload images provided by the client (existing autoUploadTemplateImages)
      let resolvedCards;
      if (is_carousel && auto_product_mode) {
        // If client already pre-detected and uploaded cards (via /auto-detect-products), reuse them.
        // Otherwise run full buildAutoProductCards (fallback for direct submit without pre-detect).
        const alreadyUploaded = Array.isArray(carousel_cards) && carousel_cards.length >= 2
          && carousel_cards.every(c => c.media_id || c.file_handle);

        let cards, productConfigCards;
        if (alreadyUploaded) {
          cards = carousel_cards;
          productConfigCards = carousel_cards.map(c => {
            const imageUrl = c.product_data?.image_url || c._hot_image_url || c.selected_fetch_image || '';
            return {
              title:          c.product_data?.title  || c.example_values?.['1']?.split('\n')[0] || '',
              price:          c.product_data?.price  || c.example_values?.['1']?.split('\n')[1] || '',
              link:           c.product_data?.link   || '',
              _hot_image_url: imageUrl,   // required by buildSendMessagePayload as image URL fallback
              image_url:      imageUrl,
              media_id:       c.media_id    || '',   // numeric — /messages { "image": { "id": media_id } }
              file_handle:    c.file_handle || '',   // "4:..." — template creation only
              image_id:       c.image_id    || '',
            };
          });
          // Ensure gallery has an entry for each card's media_id so 6h refresh can reuse them.
          // Upsert: update existing record for this card slot, or insert new one.
          if (!db.gallery_folders) db.gallery_folders = [];
          if (!db.gallery_images)  db.gallery_images  = [];
          let folder = db.gallery_folders.find(f => f.channel_id === channelId && f.name === cleanName);
          if (!folder) {
            folder = { id: uuidv4(), channel_id: channelId, name: cleanName, created_at: new Date().toISOString() };
            db.gallery_folders.push(folder);
          }
          for (const [i, c] of carousel_cards.entries()) {
            const imgUrl = c.product_data?.image_url || c._hot_image_url || c.selected_fetch_image || '';
            const mediaId = c.media_id || '';
            const fileHandle = c.file_handle || '';
            if (!mediaId && !fileHandle) continue; // nothing to store
            // Upsert by card_index + template_name — replace the slot's old record
            const existIdx = db.gallery_images.findIndex(
              g => g.channel_id === channelId && g.template_name === cleanName && g.card_index === i
            );
            const record = {
              id: existIdx >= 0 ? db.gallery_images[existIdx].id : uuidv4(),
              folder_id: folder.id, channel_id: channelId,
              filename:    `${cleanName}_c${i + 1}.jpg`,
              media_id:    mediaId,
              file_handle: fileHandle,
              source_url:  imgUrl,
              product_name: c.product_data?.title || '',
              product_url:  c.product_data?.link  || '',
              auto_detected: true, template_name: cleanName, card_index: i,
              created_at: existIdx >= 0 ? db.gallery_images[existIdx].created_at : new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            if (existIdx >= 0) {
              db.gallery_images[existIdx] = record;
              console.log(`[MetaTemplates] Gallery updated card ${i + 1} media_id:${mediaId} for "${cleanName}"`);
            } else {
              db.gallery_images.push(record);
              console.log(`[MetaTemplates] Gallery stored card ${i + 1} media_id:${mediaId} for "${cleanName}"`);
            }
          }
          db.save(); // persist gallery immediately before Meta API call
          console.log(`[MetaTemplates] auto_product_mode: reusing ${cards.length} pre-uploaded cards from client`);
        } else {
          // Full auto: scrape + dual-upload
          ({ cards, productConfigCards } = await buildAutoProductCards(channelId, cleanName));
          console.log(`[MetaTemplates] auto_product_mode: built ${cards.length} cards via buildAutoProductCards`);
        }

        resolvedCards = cards;
        tpl.carousel_cards = resolvedCards;
        tpl.product_config = {
          cards:             productConfigCards,
          last_auto_refresh: new Date().toISOString(),
          next_auto_refresh: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
          folder_name:       cleanName,
          auto_products:     productConfigCards.map(c => ({ name: c.title, price: c.price, url: c.link, image: c._hot_image_url || c.image_url })),
        };
        tpl.product_config.send_payload = buildSendMessagePayload(tpl, tpl.product_config, '{{RECIPIENT_PHONE}}');
      } else if (!is_carousel) {
        resolvedCards = [];
        tpl.carousel_cards = [];

        if (tpl.header_type === 'IMAGE') {
          // Resolve image source: prefer URL, fall back to gallery record lookup by header_image_id
          let headerImageUrl = req.body.header_image_url || '';
          const headerImageGalleryId = req.body.header_image_id || '';

          // If gallery image selected (no URL), look up gallery record for reuse or source_url
          if (!headerImageUrl && headerImageGalleryId && db.gallery_images) {
            const galleryRec = db.gallery_images.find(g => g.id === headerImageGalleryId && g.channel_id === channelId);
            if (galleryRec) {
              // Reuse existing file_handle + media_id if already uploaded — no re-upload needed
              if (galleryRec.file_handle && galleryRec.media_id) {
                tpl.header_file_handle = galleryRec.file_handle;
                tpl.header_image_id    = galleryRec.media_id;
                console.log(`[MetaTemplates] Reusing gallery image → media_id: ${galleryRec.media_id}, file_handle: ${galleryRec.file_handle}`);
              } else {
                // Has source_url — download + upload
                headerImageUrl = galleryRec.source_url || '';
              }
            }
          }

          // Upload if we have a URL and don't already have file_handle
          if (headerImageUrl && !tpl.header_file_handle) {
            try {
              console.log(`[MetaTemplates] Single product: uploading header image for "${cleanName}"…`);
              const { buffer, mimeType } = await whatsappService.downloadImage(headerImageUrl);
              const filename = `${cleanName}_header_${Date.now()}.jpg`;

              // uploadMediaResumable → file_handle (REQUIRED for template creation header example)
              let fileHandle = '';
              let resumableErr = '';
              try {
                fileHandle = await whatsappService.uploadMediaResumable(buffer, filename, mimeType, channelId);
                tpl.header_file_handle = fileHandle;
                console.log(`[MetaTemplates] Resumable upload → file_handle: ${fileHandle}`);
              } catch (fhErr) {
                resumableErr = fhErr.message;
                console.error(`[MetaTemplates] Resumable upload failed: ${fhErr.message}`);
              }

              // uploadMedia → media_id (used in /messages send payload)
              let mediaId = '';
              try {
                mediaId = await whatsappService.uploadMedia(buffer, filename, mimeType, channelId);
                tpl.header_image_id = mediaId;
                console.log(`[MetaTemplates] Media upload → media_id: ${mediaId}`);
              } catch (mErr) {
                console.error(`[MetaTemplates] Media upload failed: ${mErr.message}`);
              }

              // Store in gallery under folder named after template
              if (!db.gallery_folders) db.gallery_folders = [];
              if (!db.gallery_images)  db.gallery_images  = [];
              let folder = db.gallery_folders.find(f => f.channel_id === channelId && f.name === cleanName);
              if (!folder) {
                folder = { id: uuidv4(), channel_id: channelId, name: cleanName, created_at: new Date().toISOString() };
                db.gallery_folders.push(folder);
              }
              // Upsert — replace existing record for this template if any
              const existIdx = db.gallery_images.findIndex(g => g.channel_id === channelId && g.template_name === cleanName && g.card_index === 0);
              const record = {
                id: existIdx >= 0 ? db.gallery_images[existIdx].id : uuidv4(),
                folder_id: folder.id, channel_id: channelId,
                filename, media_id: mediaId, file_handle: fileHandle,
                source_url: headerImageUrl, template_name: cleanName, card_index: 0,
                auto_detected: false,
                created_at: existIdx >= 0 ? db.gallery_images[existIdx].created_at : new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };
              if (existIdx >= 0) db.gallery_images[existIdx] = record;
              else db.gallery_images.push(record);
              db.save();
            } catch (imgErr) {
              console.error(`[MetaTemplates] Header image upload failed: ${imgErr.message}`);
            }
          }

          if (!tpl.header_file_handle) {
            // Meta REQUIRES example.header_handle for IMAGE headers — abort before submitting.
            db.meta_templates = (db.meta_templates || []).filter(t => t.id !== tpl.id);
            db.save();
            const detail = resumableErr
              ? `Meta API error: ${resumableErr}`
              : 'Resumable upload returned no file_handle.';
            return res.status(400).json({
              error: `Header image upload failed — ${detail} ` +
                     'Fix: (1) Confirm Facebook App ID is saved in Settings → WhatsApp → App ID, ' +
                     '(2) the image URL is publicly accessible from the internet, ' +
                     '(3) your Access Token has whatsapp_business_messaging permission.',
            });
          }
        }
      } else {
        resolvedCards = is_carousel ? await autoUploadTemplateImages(channelId, carousel_cards, name) : [];
        tpl.carousel_cards = resolvedCards;
      }

      // ── Step 2: Build Payload ──
      const components = buildMetaComponents(tpl);
      const langMap = { en: 'en_US', hi: 'hi', gu: 'gu', ta: 'ta', te: 'te', mr: 'mr', bn: 'bn', ar: 'ar', ur: 'ur' };
      const payload = {
        name: cleanName,
        category: (tpl.category || 'MARKETING').toUpperCase(),
        language: langMap[tpl.language] || tpl.language,
        // Non-carousel single product uses NAMED params ({{param_name}} in body)
        // Carousel uses POSITIONAL ({{1}}, {{2}} per card)
        ...(is_carousel ? {} : { parameter_format: 'NAMED' }),
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
        // Meta can return "ACTIVE" (= approved) immediately for some accounts
        const rawStatus = metaData.status || 'PENDING';
        tpl.meta_status = rawStatus === 'ACTIVE' ? 'APPROVED' : rawStatus;
        tpl.submitted_at = new Date().toISOString();
        console.log(`[MetaTemplates] Submitted "${cleanName}" → id: ${metaData.id}`);
      } else {
        // Meta rejected — do NOT save to DB (template does not exist at Meta's side)
        const metaErr = metaData?.error || metaData;
        const userMsg  = metaErr.error_user_msg || metaErr.message || 'Unknown error';
        console.error(`[MetaTemplates] Submit error (not saved):`, metaErr);
        return res.status(400).json({
          error: `Meta rejected the template: ${userMsg}`,
          meta_error: metaErr,
        });
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
// Strategy 1 (preferred): query by meta_template_id directly
//   GET /v25.0/{meta_template_id}?fields=name,status,quality_score,rejected_reason
// Strategy 2 (fallback): search by name in the WABA templates list
//   GET /v25.0/{wabaId}/message_templates?name={name}&fields=...
export async function refreshStatus(req, res) {
  try {
    const db = getDb();
    const channelId = req.headers['x-channel-id'] || '';
    const { id } = req.params;

    const tpl = (db.meta_templates || []).find(t => t.id === id && t.channel_id === channelId);
    if (!tpl) return res.status(404).json({ error: 'Template not found' });

    const creds = getCreds(channelId);
    if (!creds) return res.status(400).json({ error: 'WhatsApp credentials not configured' });

    let found = null;

    // ── Strategy 1: direct template ID lookup (most reliable) ────────────────
    if (tpl.meta_template_id) {
      try {
        const directRes = await fetch(
          `https://graph.facebook.com/v25.0/${tpl.meta_template_id}?fields=name,status,quality_score,rejected_reason`,
          { headers: { Authorization: `Bearer ${creds.token}` } }
        );
        const directData = await directRes.json();
        if (directRes.ok && directData.status) {
          found = directData;
          console.log(`[MetaTemplates] Status (direct ID): ${tpl.meta_template_id} → ${directData.status}`);
        } else {
          console.warn(`[MetaTemplates] Direct ID lookup failed: ${JSON.stringify(directData?.error)}`);
        }
      } catch (directErr) {
        console.warn(`[MetaTemplates] Direct ID fetch error: ${directErr.message}`);
      }
    }

    // ── Strategy 2: search by name in WABA list ────────────────────────────
    if (!found) {
      const listRes = await fetch(
        `https://graph.facebook.com/v25.0/${creds.wabaId}/message_templates?name=${encodeURIComponent(tpl.name)}&fields=name,status,id,quality_score,rejected_reason`,
        { headers: { Authorization: `Bearer ${creds.token}` } }
      );
      const listData = await listRes.json();
      if (listRes.ok && listData.data?.length) {
        found = listData.data.find(t => t.name === tpl.name) || listData.data[0];
        // Persist the meta_template_id if we didn't have it yet
        if (found.id && !tpl.meta_template_id) tpl.meta_template_id = found.id;
        console.log(`[MetaTemplates] Status (name search): "${tpl.name}" → ${found.status}`);
      }
    }

    if (found) {
      // Meta returns "ACTIVE" or "APPROVED" for approved templates — normalise both
      const rawStatus = found.status || '';
      tpl.meta_status = (rawStatus === 'ACTIVE' || rawStatus === 'APPROVED') ? 'APPROVED' : rawStatus;
      if (found.rejected_reason) tpl.rejected_reason = found.rejected_reason;
      if (found.quality_score)   tpl.quality_score   = found.quality_score;
      tpl.status_refreshed_at = new Date().toISOString();
      db.save();
      console.log(`[MetaTemplates] "${tpl.name}" status updated → ${tpl.meta_status}`);
    } else {
      console.warn(`[MetaTemplates] Could not get status for "${tpl.name}" from Meta`);
    }

    res.json({ template: tpl });
  } catch (err) {
    console.error('[MetaTemplates] refreshStatus error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

// ── Auto-refresh ALL template statuses from Meta WABA in one bulk call ────────
// Fetches the full WABA template list and syncs every local template's status.
// Handles: PENDING → APPROVED, PENDING → REJECTED, missing meta_template_id.
export async function autoRefreshPendingStatuses() {
  const db = getDb();

  // Collect all unique channels that have pending templates
  const allChannels = [...new Set(
    (db.meta_templates || [])
      .filter(t => t.channel_id && (t.meta_status === 'PENDING' || t.meta_status === 'DRAFT' || t.meta_status === 'IN_APPEAL'))
      .map(t => t.channel_id)
  )];
  if (allChannels.length === 0) return;

  for (const channelId of allChannels) {
  const creds = getCreds(channelId);
  if (!creds) continue;

  // Only bother if we have at least one non-APPROVED template with a submitted ID
  const localTemplates = (db.meta_templates || []).filter(t => t.channel_id === channelId);
  const needsCheck = localTemplates.filter(t =>
    t.meta_status === 'PENDING' || t.meta_status === 'DRAFT' || t.meta_status === 'IN_APPEAL'
  );
  if (needsCheck.length === 0) continue;

  console.log(`[MetaTemplates] Bulk status sync — checking ${needsCheck.length} template(s) via WABA list…`);

  // Fetch all templates from WABA (paginate if needed)
  const metaTemplates = {};
  let url = `https://graph.facebook.com/v25.0/${creds.wabaId}/message_templates?fields=id,name,status,quality_score,rejected_reason&limit=100`;
  try {
    while (url) {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${creds.token}` } });
      const data = await res.json();
      if (!res.ok) {
        console.warn(`[MetaTemplates] WABA list fetch failed: ${JSON.stringify(data?.error)}`);
        break;
      }
      for (const mt of (data.data || [])) {
        // Key by both name and id so we can match either way
        metaTemplates[mt.name] = mt;
        if (mt.id) metaTemplates[mt.id] = mt;
      }
      url = data.paging?.next || null;
    }
  } catch (e) {
    console.warn(`[MetaTemplates] WABA list fetch error: ${e.message}`);
    return;
  }

  let updated = 0;
  for (const tpl of needsCheck) {
    // Match by meta_template_id first, then by name
    const found = (tpl.meta_template_id && metaTemplates[tpl.meta_template_id])
      || metaTemplates[tpl.name];

    if (!found) {
      console.warn(`[MetaTemplates] "${tpl.name}" not found in WABA list`);
      continue;
    }

    // Persist meta_template_id if we got it from the list
    if (found.id && !tpl.meta_template_id) {
      tpl.meta_template_id = found.id;
    }

    const rawStatus = found.status || '';
    const newStatus = (rawStatus === 'ACTIVE' || rawStatus === 'APPROVED') ? 'APPROVED' : rawStatus;

    if (newStatus !== tpl.meta_status) {
      console.log(`[MetaTemplates] "${tpl.name}": ${tpl.meta_status} → ${newStatus}`);
      tpl.meta_status = newStatus;
      if (found.rejected_reason) tpl.rejected_reason = found.rejected_reason;
      if (found.quality_score)   tpl.quality_score   = found.quality_score;
      tpl.status_refreshed_at = new Date().toISOString();
      updated++;
    } else {
      console.log(`[MetaTemplates] "${tpl.name}": still ${newStatus}`);
    }
  }

  if (updated > 0) {
    db.save();
    console.log(`[MetaTemplates] Bulk sync done — ${updated} template(s) updated`);
  } else {
    console.log(`[MetaTemplates] Bulk sync done — no status changes`);
  }
  } // end for channelId
}

// ── Save product config (image, vars mapping, etc.) ───────────────────────────
export function saveProductConfig(req, res) {
  const db = getDb();
  const channelId = req.headers['x-channel-id'] || '';
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
    const channelId = req.headers['x-channel-id'] || '';
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

// ── Manual refresh: same logic as the 24h cron but triggered on demand ───────
export async function refreshAutoProducts(req, res) {
  try {
    const db = getDb();
    const channelId = req.headers['x-channel-id'] || '';
    const { id } = req.params;
    const nowDt = new Date();

    const tpl = (db.meta_templates || []).find(t => t.id === id && t.channel_id === channelId);
    if (!tpl) return res.status(404).json({ error: 'Template not found' });
    if (!tpl.is_carousel) return res.status(400).json({ error: 'Only carousel templates support auto-products' });

    const cardCount  = tpl.carousel_cards?.length || 3;
    const hotProducts = computeHotProducts(db, channelId, cardCount);

    // ── Per-template gallery folder ───────────────────────────────────────────
    const folderName = (tpl.name || 'auto_products').replace(/[^a-z0-9_\- ]/gi, '_').trim();
    if (!db.gallery_folders) db.gallery_folders = [];
    if (!db.gallery_images)  db.gallery_images  = [];

    let folder = db.gallery_folders.find(f => f.channel_id === channelId && f.name === folderName);
    if (!folder) {
      folder = { id: uuidv4(), channel_id: channelId, name: folderName, created_at: nowDt.toISOString() };
      db.gallery_folders.push(folder);
    }

    const existingCards = tpl.product_config?.cards || tpl.carousel_cards.map(() => ({}));

    const cards = await Promise.all(
      tpl.carousel_cards.map(async (card, i) => {
        const hot      = hotProducts[i % hotProducts.length];
        const existing = existingCards[i] || {};
        if (!hot) return existing;

        // ── Scrape fresh product data when URL is available ──────────────────
        let hotName  = hot.name  || '';
        let hotPrice = hot.price || '';
        let hotImage = hot.image || '';

        if (hot.url) {
          try {
            const scraped = await scrapeProductData(hot.url);
            if (scraped.title)     hotName  = scraped.title;
            if (scraped.price)     hotPrice = scraped.price;
            if (scraped.image_url) hotImage = scraped.image_url;
            console.log(`[RefreshAutoProducts] "${tpl.name}" card ${i + 1}: scraped "${hotName}"`);
          } catch (scrapeErr) {
            console.warn(`[RefreshAutoProducts] "${tpl.name}" card ${i + 1}: scrape failed (${scrapeErr.message}), using cached data`);
          }
        }

        const newImageUrl  = hotImage;
        const prevImageUrl = existing._hot_image_url || '';
        const productChanged = newImageUrl && newImageUrl !== prevImageUrl;
        const needsUpload    = newImageUrl && (productChanged || !existing.header_media_id);

        let header_media_id = existing.header_media_id || '';
        let image_id        = existing.image_id || '';

        if (needsUpload) {
          const cached = db.gallery_images.find(
            img => img.source_url === newImageUrl && img.channel_id === channelId && !productChanged
          );
          if (cached) {
            header_media_id = cached.media_id || '';
            image_id        = cached.id;
          } else {
            try {
              const { buffer, mimeType } = await whatsappService.downloadImage(newImageUrl);
              // uploadMedia() → numeric media_id used as { "image": { "id": media_id } } in send payload
              const mediaId = await whatsappService.uploadMedia(buffer, `${folderName}_card${i + 1}.jpg`, mimeType, channelId);
              const imgRecord = {
                id: uuidv4(), folder_id: folder.id, channel_id: channelId,
                filename: mediaId,          // named by media_id
                mime_type: mimeType, size: buffer.length,
                media_id: mediaId,           // used in send payload
                source_url: newImageUrl,
                created_at: nowDt.toISOString(), template_name: tpl.name, card_index: i,
              };
              db.gallery_images.push(imgRecord);
              header_media_id = mediaId;
              image_id        = imgRecord.id;
              console.log(`[RefreshAutoProducts] "${tpl.name}" card ${i + 1}: uploaded → media_id: ${mediaId}`);
            } catch (imgErr) {
              console.error(`[RefreshAutoProducts] card ${i + 1} upload failed:`, imgErr.message);
            }
          }
        }

        return {
          title: hotName  || existing.title || '',
          price: hotPrice || existing.price || '',
          link:  hot.url  || existing.link  || '',
          image_id,
          media_id:        header_media_id,  // numeric ID for send payload { "id": media_id }
          header_media_id,
          _hot_image_url: newImageUrl,
          _hot_score: hot.score, _hot_views: hot.views, _hot_carts: hot.carts,
          _auto_updated: nowDt.toISOString(),
        };
      })
    );

    if (!tpl.product_config) tpl.product_config = {};
    tpl.product_config.cards             = cards;
    tpl.product_config.last_auto_refresh = nowDt.toISOString();
    tpl.product_config.next_auto_refresh = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    tpl.product_config.auto_products     = hotProducts;
    tpl.product_config.folder_name       = folderName;
    tpl.product_config.send_payload      = buildSendMessagePayload(tpl, tpl.product_config, '{{RECIPIENT_PHONE}}');

    db.save();
    res.json({ template: tpl, hot_products: hotProducts, folder: folderName, cards_updated: cards.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Returns true if a URL looks like a product page (not home/category/blog/cart)
function isProductUrl(url) {
  if (!url) return false;
  try {
    const p = new URL(url).pathname.toLowerCase();
    if (/\/(products?|item|p|detail|shop|pd)\/[^/]+/.test(p)) return true;
    if (p.startsWith('/products/') && p.split('/').filter(Boolean).length >= 2) return true;
    return false;
  } catch (_) { return false; }
}

// Convert a product name to a URL slug  e.g. "Blue Cotton Kurti" → "blue-cotton-kurti"
function nameToSlug(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Derive the store base URL from all known URLs in the DB (prefer product-page origins)
function inferStoreBaseUrl(db) {
  // First: check channel settings shop_url
  for (const row of (db.channel_settings || [])) {
    try {
      const s = JSON.parse(row.settings || '{}');
      const raw = s.shop_url || s.store_url || s.website_url || '';
      if (raw) {
        const base = raw.replace(/\/$/, '');
        return base.startsWith('http') ? base : `https://${base}`;
      }
    } catch (_) {}
  }

  const allUrls = [
    ...(db.page_views      || []).map(p => p.url),
    ...(db.website_visitors|| []).map(v => v.page_url),
    ...(db.product_views   || []).map(v => v.product_url),
    ...(db.cart_events     || []).map(c => c.product_url),
    ...(db.product_catalog || []).map(p => p.url),
  ].filter(Boolean);

  const origins = {};
  for (const u of allUrls) {
    try {
      const o = new URL(u).origin;
      // Skip obvious placeholders
      if (/localhost|127\.0\.0\.1|example\.com$/.test(o)) continue;
      origins[o] = (origins[o] || 0) + 1;
    } catch (_) {}
  }
  const sorted = Object.entries(origins).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] || null;
}

export function computeHotProducts(db, channelId, limit = 10) {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const scores = {};  // keyed by product name (lowercase) for deduplication

  // ── Infer store base URL (used to construct product URLs when none recorded) ──
  const storeBase = inferStoreBaseUrl(db);
  console.log(`[computeHotProducts] storeBase=${storeBase || 'unknown'}`);

  // ── Source 1: Analytics page_views — real browsed product URLs ───────────────
  for (const pv of (db.page_views || [])) {
    if (pv.channel_id !== channelId || pv.viewed_at < since) continue;
    const url = pv.url; if (!url || !isProductUrl(url)) continue;
    const key = (pv.page_title || url).toLowerCase();
    if (!scores[key]) scores[key] = { name: pv.page_title || '', url, image: '', price: '', views: 0, carts: 0, page_views: 0 };
    scores[key].page_views++;
    scores[key].views++;
    if (pv.page_title && pv.page_title.length > (scores[key].name||'').length) scores[key].name = pv.page_title;
  }

  // ── Source 2: product_views events ───────────────────────────────────────────
  for (const v of (db.product_views || [])) {
    if (v.channel_id !== channelId || v.created_at < since) continue;
    const key = (v.product_name || v.product_url || '').toLowerCase(); if (!key) continue;
    if (!scores[key]) scores[key] = { name: v.product_name || '', url: v.product_url || '', image: v.product_image || '', price: v.product_price || '', views: 0, carts: 0, page_views: 0 };
    scores[key].views++;
    if (!scores[key].url   && v.product_url)   scores[key].url   = v.product_url;
    if (!scores[key].name  && v.product_name)  scores[key].name  = v.product_name;
    if (!scores[key].image && v.product_image) scores[key].image = v.product_image;
    if (!scores[key].price && v.product_price) scores[key].price = v.product_price;
  }

  // ── Source 3: cart_events — expand ALL products in the cart JSON array ────────
  // Most real carts store { products: '[{"name":"...","price":...}]' } with no product URL.
  // We extract every product from every cart event to get accurate name×frequency counts.
  for (const c of (db.cart_events || [])) {
    if (c.channel_id !== channelId || c.recovered || c.created_at < since) continue;
    let items = [];
    if (c.product_name) {
      items.push({ name: c.product_name, price: c.product_price ? String(c.product_price) : '', url: c.product_url || '' });
    }
    if (c.products) {
      try {
        const parsed = JSON.parse(c.products);
        for (const item of (Array.isArray(parsed) ? parsed : [])) {
          if (item.name) items.push({ name: item.name, price: item.price ? `₹${item.price}` : '', url: item.url || c.product_url || '' });
        }
      } catch (_) {}
    }
    for (const item of items) {
      if (!item.name) continue;
      const key = item.name.toLowerCase();
      if (!scores[key]) scores[key] = { name: item.name, url: item.url || '', image: '', price: item.price || '', views: 0, carts: 0, page_views: 0 };
      scores[key].carts++;
      if (!scores[key].url   && item.url)   scores[key].url   = item.url;
      if (!scores[key].price && item.price) scores[key].price = item.price;
    }
  }

  // ── Source 4: product_catalog — sorted by Shopify position (merchandising order) ─
  // Give each catalog product a small position-based base score so that when there is
  // no analytics data the ordering still reflects the store's own featured order.
  const catalogItems = (db.product_catalog || []).filter(p => p.channel_id === channelId && (p.url || p.name));
  catalogItems.forEach((p, pos) => {
    const key = (p.name || p.url || '').toLowerCase();
    const posScore = Math.max(0, 50 - pos); // first product = 50, 50th+ = 0
    if (!scores[key]) scores[key] = { name: p.name || '', url: p.url || '', image: p.image || '', price: p.price || '', views: 0, carts: 0, page_views: 0, _pos_score: posScore };
    else scores[key]._pos_score = (scores[key]._pos_score || 0) + posScore;
    if (!scores[key].url   && p.url)   scores[key].url   = p.url;
    if (!scores[key].name  && p.name)  scores[key].name  = p.name;
    if (!scores[key].image && p.image) scores[key].image = p.image;
    if (!scores[key].price && p.price) scores[key].price = p.price;
  });

  // ── Cross-match: boost catalog products that appear in cart events by name ────
  // Normalise to first 3 words for fuzzy matching (handles long product names)
  function normName(n) { return (n||'').toLowerCase().replace(/[^a-z0-9 ]/g,'').split(/\s+/).slice(0,3).join(' '); }
  for (const key of Object.keys(scores)) {
    const norm = normName(scores[key].name);
    if (!norm) continue;
    for (const c of (db.cart_events || [])) {
      if (c.channel_id !== channelId) continue;
      try {
        const items = c.products ? JSON.parse(c.products) : [];
        for (const item of items) {
          if (normName(item.name) === norm) { scores[key].carts++; break; }
        }
      } catch (_) {}
    }
  }

  // ── For products with no URL: construct one from storeBase + /products/slug ───
  if (storeBase) {
    for (const p of Object.values(scores)) {
      if (!p.url && p.name) {
        p.url = `${storeBase}/products/${nameToSlug(p.name)}`;
      }
    }
  }

  const all = Object.values(scores)
    .map(p => ({ ...p, score: (p.page_views * 2) + (p.views * 1) + (p.carts * 3) + (p._pos_score || 0) }))
    .filter(p => p.url)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  console.log(`[computeHotProducts] channel=${channelId} → ${all.length} candidates`);
  all.slice(0, 6).forEach((p, i) => console.log(`  #${i+1} "${p.name.substring(0,40)}" score=${p.score} (page_views=${p.page_views} carts=${p.carts} pos=${p._pos_score||0})`));
  return all;
}

// ── Scrape product data from URL — shared helper (no Express dependency) ────────
// Returns { title, price, image_url, images, description, source } or throws.
export async function scrapeProductData(url) {
  if (!url || !url.startsWith('http')) throw new Error('Valid URL required');

  const cleanUrl = url.split('?')[0].replace(/\/$/, '');

  // ── 1. Try Shopify JSON API ────────────────────────────────────────────────
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
        const images = (p.images || []).slice(0, 8).map(img => ({ url: img.src, alt: img.alt || p.title }));
        return {
          title: p.title,
          price: price ? `${symbol}${price}` : '',
          image_url: images[0]?.url || '',
          images,
          description: (p.body_html || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().substring(0, 200),
          source: 'shopify',
        };
      }
    }
  } catch (_) { }

  // ── 2. OpenGraph / meta tag scraping ──────────────────────────────────────
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

  return {
    title: title.substring(0, 100),
    price: priceRaw ? `${symbol}${priceRaw}` : '',
    image_url,
    images: image_url ? [{ url: image_url, alt: title }] : [],
    description: description.substring(0, 200),
    source: 'opengraph',
  };
}

// ── Scrape product from URL — Express HTTP endpoint ───────────────────────────
export async function scrapeProduct(req, res) {
  try {
    const { url } = req.body;
    const result = await scrapeProductData(url);
    res.json(result);
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
    const channelId = req.headers['x-channel-id'] || '';
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
