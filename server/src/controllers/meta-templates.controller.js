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
      // We store {{2}} internally (body uses {{1}} for title+price, button uses {{2}} for link),
      // but normalise any {{N}} in the button URL to {{1}} in the Meta payload.
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
            const fileHandle = await whatsappService.uploadMediaResumable(buffer, `gallery_card${i + 1}_${Date.now()}.jpg`, mimeType);
            const mediaId    = galleryImg.media_id || await whatsappService.uploadMedia(buffer, `gallery_card${i + 1}.jpg`, mimeType);
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
        const fileHandle = await whatsappService.uploadMediaResumable(buffer, `auto_card${i + 1}_${Date.now()}.jpg`, mimeType);
        console.log(`[AutoUpload] Card ${i + 1}: resumable upload → file_handle=${fileHandle}`);

        // Upload 2: regular → media_id for message send payload
        const mediaId = await whatsappService.uploadMedia(buffer, `auto_card${i + 1}.jpg`, mimeType);
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

// Get shop_url from channel settings
function getShopUrl(db, channelId) {
  const row = db.channel_settings?.find(s => s.channel_id === channelId) || db.channel_settings?.[0];
  try {
    const s = JSON.parse(row?.settings || '{}');
    const raw = s.shop_url || s.store_url || s.website_url || '';
    if (!raw) return null;
    const base = raw.replace(/\/$/, '');
    return base.startsWith('http') ? base : `https://${base}`;
  } catch (_) { return null; }
}

async function buildAutoProductCards(channelId, cleanName, count = 4) {
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

  // ── Candidates from analytics/pages (db.page_views) — same source as the UI ──
  // Read page_views, group by URL (same logic as getPageAnalytics), filter product
  // pages, rank by views descending. Full URL is used directly — no store prefix needed.
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const pvRows = (db.page_views || []).filter(p => p.channel_id === channelId && p.viewed_at >= since);

  const byUrl = {};
  for (const pv of pvRows) {
    const url = pv.url; if (!url) continue;
    if (!byUrl[url]) byUrl[url] = { url, title: pv.page_title || '', views: 0, sessions: new Set(),
      totalDuration: 0, totalScroll: 0, totalEngagement: 0, exits: 0 };
    byUrl[url].views++;
    byUrl[url].sessions.add(pv.session_id);
    byUrl[url].totalDuration   += pv.duration_sec    || 0;
    byUrl[url].totalScroll     += pv.max_scroll_pct  || 0;
    byUrl[url].totalEngagement += pv.engagement_score|| 0;
    if (pv.exit_event) byUrl[url].exits++;
  }

  // Same shape as analytics/pages response, filtered to product-like URLs, sorted by views
  const analyticsPages = Object.values(byUrl)
    .map(p => ({
      url:              p.url,
      title:            p.title,
      views:            p.views,
      unique_visitors:  p.sessions.size,
      avg_duration_sec: p.views ? Math.round(p.totalDuration   / p.views) : 0,
      avg_scroll_pct:   p.views ? Math.round(p.totalScroll     / p.views) : 0,
      avg_engagement:   p.views ? Math.round(p.totalEngagement / p.views) : 0,
      exit_rate:        p.views ? Math.round((p.exits / p.views) * 100) : 0,
    }))
    .filter(p => isProductUrl(p.url))
    .sort((a, b) => b.views - a.views);

  console.log(`[AutoCards] analytics/pages product URLs: ${analyticsPages.length} (from ${pvRows.length} total page_views)`);
  analyticsPages.slice(0, 8).forEach((p, i) =>
    console.log(`  #${i+1} views=${p.views} unique=${p.unique_visitors} avg_dur=${p.avg_duration_sec}s  ${p.url}`)
  );

  if (analyticsPages.length === 0) {
    throw new Error(
      'No product pages found in Analytics → Pages data. ' +
      'Install the tracking snippet on your store so page visits are recorded, ' +
      'then auto-detect will use the most-viewed product pages automatically.'
    );
  }
return analyticsPages;
  const candidates = analyticsPages.map(p => ({ name: p.title, url: p.url, views: p.views, score: p.views }));
  console.log(`[AutoCards] ${candidates.length} product page candidates`);

  const cards = [];
  const productConfigCards = [];

  for (const hot of candidates) {
    if (cards.length >= COUNT) break;

    if (!hot.url) {
      console.log(`[AutoCards] Skip entry — no URL`);
      continue;
    }

    // ── Get title + price + image ─────────────────────────────────────────────
    // For Shopify-API candidates: data already validated, skip HTTP scrape.
    // For analytics candidates: scrape the page to confirm title+price+image.
    let title = '', price = '', imageUrl = '';
    const link = hot.url;

    if (hot._shopify && hot._title && hot._imageUrl) {
      // Shopify API gave us confirmed data
      title    = hot._title;
      price    = hot._price || '';
      imageUrl = hot._imageUrl;
      console.log(`[AutoCards] Shopify product "${title}" — using API data directly`);
    } else {
      try {
        const scraped = await scrapeProductData(hot.url);
        title    = (scraped.title     || '').trim();
        price    = (scraped.price     || '').trim();
        imageUrl = (scraped.image_url || '').trim();
      } catch (e) {
        console.warn(`[AutoCards] Skip "${hot.name}" — scrape failed: ${e.message}`);
        continue;
      }
      // Fall back to analytics name/price if scraper couldn't extract them
      if (!title) title = (hot.name  || '').trim();
      if (!price) price = (hot.price || '').trim();
    }

    if (!title)    { console.log(`[AutoCards] Skip "${hot.url}" — no title`);    continue; }
    if (!price)    { console.log(`[AutoCards] Skip "${hot.url}" — no price`);    continue; }
    if (!imageUrl) { console.log(`[AutoCards] Skip "${hot.url}" — no main image`); continue; }

    console.log(`[AutoCards] ✓ Valid product ${cards.length + 1}: "${title}"  ${price}`);

    // ── Dual image upload ─────────────────────────────────────────────────────
    let fileHandle = '', mediaId = '', imageId = '';
    const cardNum = cards.length + 1;

    const cached = db.gallery_images.find(
      img => img.channel_id === channelId && img.source_url === imageUrl && img.media_id
    );
    if (cached) {
      mediaId    = cached.media_id    || '';
      fileHandle = cached.file_handle || '';
      imageId    = cached.id;
      if (!fileHandle) {
        try {
          const { buffer, mimeType } = await whatsappService.downloadImage(imageUrl);
          fileHandle = await whatsappService.uploadMediaResumable(buffer, `auto_${cleanName}_c${cardNum}.jpg`, mimeType);
          cached.file_handle = fileHandle;
        } catch (_) { /* non-fatal */ }
      }
      console.log(`[AutoCards] Card ${cardNum}: reused cached → media_id:${mediaId}`);
    } else {
      try {
        const { buffer, mimeType } = await whatsappService.downloadImage(imageUrl);
        const filename = `auto_${cleanName}_c${cardNum}.jpg`;

        mediaId = await whatsappService.uploadMedia(buffer, filename, mimeType);
        try {
          fileHandle = await whatsappService.uploadMediaResumable(buffer, filename, mimeType);
        } catch (e) {
          console.warn(`[AutoCards] Card ${cardNum}: resumable upload failed (non-fatal) — ${e.message}`);
        }

        const imgRecord = {
          id:           uuidv4(),  folder_id: folder.id, channel_id: channelId,
          filename,     mime_type: mimeType,  size: buffer.length,
          media_id:     mediaId,              // /messages { "image": { "id": media_id } }
          file_handle:  fileHandle,           // template creation header_handle only
          source_url:   imageUrl,
          auto_detected: true,
          product_url:  link,     product_name: title,
          template_name: cleanName, card_index: cardNum - 1,
          created_at:   new Date().toISOString(),
        };
        db.gallery_images.push(imgRecord);
        imageId = imgRecord.id;
        console.log(`[AutoCards] Card ${cardNum}: uploaded → media_id:${mediaId}  file_handle:${fileHandle || 'n/a'}`);
      } catch (e) {
        console.error(`[AutoCards] Card ${cardNum}: image upload failed — ${e.message}. Skipping.`);
        continue; // image upload failed — skip this product
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
      body: '{{1}}',
      buttons: [{ type: 'URL', text: 'Shop Now', url: `${buttonUrlBase}{{2}}` }],
      source: 'auto',
      image_id: imageId, file_handle: fileHandle, media_id: mediaId,
      var_map:        { '1': 'product_title_price', '2': 'product_link' },
      example_values: { '1': `${title}\n${price}`, '2': slug },
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
    throw new Error(
      `Auto-detect found only ${cards.length} valid product(s) with title+price+image confirmed. ` +
      `Need at least 2. Ensure product pages are accessible and include price + og:image markup.`
    );
  }

  db.save();
  console.log(`[AutoCards] ${cards.length}/${candidates.length} candidates passed → gallery "${folderName}"`);
  return { cards, productConfigCards };
}

// ── Auto-detect products endpoint — validate + upload BEFORE template creation ─
// POST /api/meta-templates/auto-detect-products
// Flow: computeHotProducts → scrapeProductData (validates title+price+image) →
//       downloadImage → uploadMedia (media_id) + uploadMediaResumable (file_handle) →
//       save to gallery → return ready-to-edit card data to the UI.
// Only products that pass ALL three checks (title, price, main image) are returned.
export async function autoDetectProducts(req, res) {
  try {
    const channelId = req.headers['x-channel-id'] || 'demo';
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
      tpl.carousel_cards = await autoUploadTemplateImages(channelId, carousel_cards, name || 'preview');
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
      const imgUrl  = pc._hot_image_url || pc.image_url || card.product_data?.image_url || '';
      if (mediaId) {
        cardComponents.push({ type: 'header', parameters: [{ type: 'image', image: { id: mediaId } }] });
      } else if (imgUrl) {
        console.warn(`[SendPayload] Card ${i + 1}: no media_id — falling back to image URL (may be rejected by Meta)`);
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
        media_id: c.media_id       || '',   // numeric ID for /messages
        score:    c._hot_score     || 0,
        carts:    c._hot_carts     || 0,
        views:    c._hot_views     || 0,
      })),
      template_structure: {
        body:        tpl.body || '',
        card_count:  tpl.carousel_cards?.length || 0,
        note:        'Template structure (body text, variables, buttons) is fixed at creation. Only product data in messages refreshes every 24h.',
      },
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
    const { name, category, language, header_type, header_text, body, footer, buttons, variable_labels, is_carousel, carousel_cards, auto_product_mode } = req.body;

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
          productConfigCards = carousel_cards.map(c => ({
            title:       c.product_data?.title  || c.example_values?.['1']?.split('\n')[0] || '',
            price:       c.product_data?.price  || c.example_values?.['1']?.split('\n')[1] || '',
            link:        c.product_data?.link   || '',
            image:       c.product_data?.image_url || c._hot_image_url || '',
            media_id:    c.media_id || '',
            file_handle: c.file_handle || '',
          }));
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
        };
        tpl.product_config.send_payload = buildSendMessagePayload(tpl, tpl.product_config, '{{RECIPIENT_PHONE}}');
      } else {
        resolvedCards = is_carousel ? await autoUploadTemplateImages(channelId, carousel_cards, name) : [];
        tpl.carousel_cards = resolvedCards;
      }

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
        // Meta can return "ACTIVE" (= approved) immediately for some accounts
        const rawStatus = metaData.status || 'PENDING';
        tpl.meta_status = rawStatus === 'ACTIVE' ? 'APPROVED' : rawStatus;
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
// Strategy 1 (preferred): query by meta_template_id directly
//   GET /v25.0/{meta_template_id}?fields=name,status,quality_score,rejected_reason
// Strategy 2 (fallback): search by name in the WABA templates list
//   GET /v25.0/{wabaId}/message_templates?name={name}&fields=...
export async function refreshStatus(req, res) {
  try {
    const db = getDb();
    const channelId = req.headers['x-channel-id'] || 'demo';
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
      // Meta returns "ACTIVE" for approved templates — normalise to "APPROVED"
      const rawStatus = found.status || '';
      tpl.meta_status = rawStatus === 'ACTIVE' ? 'APPROVED' : rawStatus;
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

// ── Auto-refresh PENDING template statuses in the background ─────────────────
// Exported so automation.js can call it on startup and schedule it.
export async function autoRefreshPendingStatuses() {
  const db = getDb();
  const channelId = process.env.CHANNEL_ID || 'demo';
  const creds = getCreds(channelId);
  if (!creds) return;

  const pending = (db.meta_templates || []).filter(t =>
    t.channel_id === channelId &&
    (t.meta_status === 'PENDING' || t.meta_status === 'DRAFT') &&
    t.meta_template_id
  );
  if (pending.length === 0) return;

  console.log(`[MetaTemplates] Auto-refreshing status for ${pending.length} PENDING/DRAFT template(s)...`);
  let updated = 0;

  for (const tpl of pending) {
    try {
      const res = await fetch(
        `https://graph.facebook.com/v25.0/${tpl.meta_template_id}?fields=name,status,quality_score,rejected_reason`,
        { headers: { Authorization: `Bearer ${creds.token}` } }
      );
      const data = await res.json();
      if (res.ok && data.status) {
        const rawStatus = data.status;
        const newStatus = rawStatus === 'ACTIVE' ? 'APPROVED' : rawStatus;
        if (newStatus !== tpl.meta_status) {
          console.log(`[MetaTemplates] "${tpl.name}": ${tpl.meta_status} → ${newStatus}`);
          tpl.meta_status = newStatus;
          if (data.rejected_reason) tpl.rejected_reason = data.rejected_reason;
          if (data.quality_score)   tpl.quality_score   = data.quality_score;
          tpl.status_refreshed_at = new Date().toISOString();
          updated++;
        }
      }
    } catch (e) {
      console.warn(`[MetaTemplates] Auto-refresh failed for "${tpl.name}": ${e.message}`);
    }
  }

  if (updated > 0) {
    db.save();
    console.log(`[MetaTemplates] Auto-refresh: ${updated} template(s) status updated`);
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

// ── Manual refresh: same logic as the 24h cron but triggered on demand ───────
export async function refreshAutoProducts(req, res) {
  try {
    const db = getDb();
    const channelId = req.headers['x-channel-id'] || 'demo';
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
              const mediaId = await whatsappService.uploadMedia(buffer, `${folderName}_card${i + 1}.jpg`, mimeType);
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
