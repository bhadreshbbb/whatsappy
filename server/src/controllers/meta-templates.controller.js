import { getDb } from '../services/database.js';
import { v4 as uuidv4 } from 'uuid';
import https from 'https';
import http from 'http';

// ── Get credentials from settings ─────────────────────────────────────────────
function getCreds(channelId) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const wabaId = process.env.WHATSAPP_BUSINESS_ID;
  if (token && phoneId && wabaId) return { token, phoneId, wabaId };
  try {
    const db = getDb();
    const row = db.channel_settings.find(s => s.channel_id === channelId)
      || db.channel_settings[0];
    const s = JSON.parse(row?.settings || '{}');
    if (s?.whatsapp_token && s?.whatsapp_phone_id && s?.whatsapp_business_id) {
      return { token: s.whatsapp_token, phoneId: s.whatsapp_phone_id, wabaId: s.whatsapp_business_id };
    }
  } catch (_) { }
  return null;
}

// ── Build Meta API components from our template ────────────────────────────────
function buildMetaComponents(tpl) {
  const components = [];

  // ── CAROUSEL template ──────────────────────────────────────────────────────
  if (tpl.is_carousel && tpl.carousel_cards?.length >= 2) {
    // Optional intro body
    if (tpl.body) {
      const vars = [...tpl.body.matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1]);
      const comp = { type: 'BODY', text: tpl.body };
      if (vars.length) comp.example = { body_text: [vars.map(v => `Value${v}`)] };
      components.push(comp);
    }

    // Carousel cards
    const cards = tpl.carousel_cards.map(card => {
      const cardComponents = [];
      // Resolve example values: prefer card.example_values > product_data fields > generic fallback
      const ev = card.example_values || {};
      const pd = card.product_data || {};
      const vm = card.var_map || {};
      const fieldMap = { product_title: pd.title, product_price: pd.price, product_link: pd.link, customer_name: 'Customer', cart_total: '', cart_link: pd.link };
      function resolveEx(varNum) {
        return ev[varNum] || fieldMap[vm[varNum]] || `Value${varNum}`;
      }

      // Each card must have IMAGE header (with example handle if provided)
      const headerComp = { type: 'HEADER', format: 'IMAGE' };
      if (card.header_media_id) {
        headerComp.example = { header_handle: [card.header_media_id] };
      }
      cardComponents.push(headerComp);

      // Card body — use real example values from product data
      if (card.body) {
        const vars = [...card.body.matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1]);
        const comp = { type: 'BODY', text: card.body };
        if (vars.length) comp.example = { body_text: [vars.map(v => resolveEx(v))] };
        cardComponents.push(comp);
      }

      // Card buttons (max 2) — substitute URL variables with example values
      if (card.buttons?.length) {
        const buttons = card.buttons.slice(0, 2).map(b => {
          if (b.type === 'URL') {
            const btn = { type: 'URL', text: b.text, url: b.url };
            if (b.url.includes('{{')) {
              let exUrl = b.url;
              const urlVars = [...b.url.matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1]);
              for (const vn of urlVars) {
                const val = resolveEx(vn);
                exUrl = exUrl.replace(`{{${vn}}}`, val || 'example');
              }
              btn.example = [exUrl];
            }
            return btn;
          }
          return { type: 'QUICK_REPLY', text: b.text };
        });
        cardComponents.push({ type: 'BUTTONS', buttons });
      }

      return { components: cardComponents };
    });

    components.push({ type: 'CAROUSEL', cards });
    return components;
  }

  // ── Regular template ───────────────────────────────────────────────────────
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
    const { name, category, language, header_type, header_text, body, footer, buttons, variable_labels, is_carousel, carousel_cards } = req.body;

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
        `https://graph.facebook.com/v21.0/${creds.wabaId}/message_templates?hsm_id=${tpl.meta_template_id}&name=${tpl.name}`,
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

// ── Language code map (short → Meta locale) ───────────────────────────────
export const LANG_MAP = { en: 'en_US', hi: 'hi', gu: 'gu', ta: 'ta', te: 'te', mr: 'mr', bn: 'bn', ar: 'ar', ur: 'ur' };

// ── Resolve a product field value for the send payload ────────────────────
function getFieldValue(varNum, varMap, productCard) {
  const field = (varMap || {})[String(varNum)];
  if (!field) return '';
  switch (field) {
    case 'product_title': return productCard?.title || '';
    case 'product_price': return productCard?.price || '';
    case 'product_link': {
      const link = productCard?.link || '';
      try { const seg = new URL(link).pathname.split('/').filter(Boolean).pop(); return seg || link; } catch { return link; }
    }
    case 'customer_name': return 'Customer';
    case 'cart_total':    return productCard?.cart_total || '';
    case 'cart_link':     return productCard?.link || '';
    default: return '';
  }
}

// ── Build the /messages send payload for an approved carousel template ────
export function buildSendMessagePayload(tpl, productConfig, recipientPhone = '{{RECIPIENT_PHONE}}', languageOverride = null) {
  const langCode = languageOverride
    ? (LANG_MAP[languageOverride] || languageOverride)
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
      const pc = (productConfig?.cards || [])[i] || {};
      const vm = card.var_map || {};
      const cardComponents = [];

      // Header image — use Meta media_id (preferred) or public image URL
      const imgId  = pc.header_media_id || card.header_media_id || '';
      const imgUrl = pc._hot_image_url || pc.image_url || card.product_data?.image_url || '';
      if (imgId) {
        cardComponents.push({ type: 'header', parameters: [{ type: 'image', image: { id: imgId } }] });
      } else if (imgUrl) {
        cardComponents.push({ type: 'header', parameters: [{ type: 'image', image: { link: imgUrl } }] });
      }

      // Body text parameters
      if (card.body?.trim()) {
        const vars = [...card.body.matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1]);
        if (vars.length > 0) {
          cardComponents.push({ type: 'body', parameters: vars.map(v => ({ type: 'text', text: getFieldValue(v, vm, pc) })) });
        }
      }

      // URL button parameters
      (card.buttons || []).slice(0, 2).forEach((btn, bi) => {
        if (String(btn.type || '').toLowerCase() === 'url' && btn.url?.includes('{{')) {
          const urlVars = [...btn.url.matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1]);
          cardComponents.push({ type: 'button', sub_type: 'url', index: String(bi), parameters: urlVars.map(v => ({ type: 'text', text: getFieldValue(v, vm, pc) })) });
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

// ── Preview / dry-run creation payload (no submission to Meta) ────────────
export async function previewPayload(req, res) {
  try {
    const channelId = req.headers['x-channel-id'] || 'demo';
    const { name, category, language, body, footer, buttons, header_type, header_text,
      is_carousel, carousel_cards, variable_labels } = req.body;

    const cleanName = (name || 'preview').toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const tpl = {
      name: cleanName, category: category || 'MARKETING',
      language: language || 'en',
      header_type: header_type || 'NONE', header_text: header_text || '',
      body: body || '', footer: footer || '',
      buttons: buttons || [], variable_labels: variable_labels || [],
      is_carousel: !!is_carousel, carousel_cards: carousel_cards || [],
    };

    const components = buildMetaComponents(tpl);
    const payload = {
      name: cleanName,
      category: (tpl.category || 'MARKETING').toLowerCase(),
      language: LANG_MAP[tpl.language] || tpl.language,
      components,
    };

    const creds = getCreds(channelId);
    const apiUrl = creds
      ? `https://graph.facebook.com/v25.0/${creds.wabaId}/message_templates`
      : `https://graph.facebook.com/v25.0/{WABA_ID}/message_templates`;
    const authDisplay = creds
      ? `Bearer ${creds.token.slice(0, 10)}...${creds.token.slice(-4)}`
      : 'Bearer <YOUR_WHATSAPP_TOKEN>';
    const payloadStr = JSON.stringify(payload);
    const curlCommand = `curl -X POST '${apiUrl}' \\\n  -H 'Authorization: ${creds ? `Bearer ${creds.token}` : '<YOUR_TOKEN>'}' \\\n  -H 'Content-Type: application/json' \\\n  -d '${payloadStr.replace(/'/g, "'\\''")}'`;

    console.log('\n[MetaTemplates] DRY-RUN PAYLOAD:\n', JSON.stringify(payload, null, 2));

    res.json({
      payload,
      meta_api_url: apiUrl,
      method: 'POST',
      auth_header: authDisplay,
      curl_command: curlCommand,
      notes: {
        name_rule: 'lowercase letters, numbers, underscores only',
        language_sent: LANG_MAP[tpl.language] || tpl.language,
        cards_count: is_carousel ? carousel_cards?.length : 'N/A (standard template)',
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── Get send payload for an approved template (with current product config) ─
export async function getSendPayload(req, res) {
  try {
    const db = getDb();
    const channelId = req.headers['x-channel-id'] || 'demo';
    const { id } = req.params;
    const tpl = (db.meta_templates || []).find(t => t.id === id && t.channel_id === channelId);
    if (!tpl) return res.status(404).json({ error: 'Template not found' });

    const langOverride = req.query.lang || null;
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

    res.json({
      payload,
      meta_api_url: sendApiUrl,
      method: 'POST',
      auth_header: authDisplay,
      curl_command: curlCommand,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
