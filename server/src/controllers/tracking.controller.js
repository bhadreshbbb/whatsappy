import { getDb } from '../services/database.js';
import { getLanguageFromGeo } from '../utils/geoLanguage.js';
import { upgradeStatus } from '../utils/statusMachine.js';
import https from 'https';
import http from 'http';

/**
 * Scrape a URL for product details (name, price, image).
 * Tries Shopify JSON API first, falls back to OpenGraph meta tags.
 * Returns { name, price, image, url } — all strings, never throws.
 */
async function scrapeProductUrl(url) {
  if (!url || !url.startsWith('http')) return {};
  const cleanUrl = url.split('?')[0].replace(/\/$/, '');

  // ── Shopify .json API ──────────────────────────────────────────────────────
  try {
    const r = await fetch(cleanUrl + '.json', {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(6000),
    });
    if (r.ok) {
      const data = await r.json();
      const p = data.product;
      if (p && p.title) {
        const variant   = p.variants?.[0];
        const priceVal  = variant?.price || '';
        const currency  = variant?.presentment_prices?.[0]?.price?.currency_code || 'INR';
        const sym       = currency === 'INR' ? '₹' : (currency === 'USD' ? '$' : currency + ' ');
        const image     = p.images?.[0]?.src || '';
        return { name: p.title, price: priceVal ? `${sym}${priceVal}` : '', image, url: cleanUrl };
      }
    }
  } catch (_) {}

  // ── OpenGraph / meta tag scraping ────────────────────────────────────────────
  try {
    const html = await fetchHtml(cleanUrl);
    function gm(props) {
      for (const prop of [].concat(props)) {
        const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`, 'i'))
               || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`, 'i'));
        if (m?.[1]) return m[1].trim();
      }
      return '';
    }
    // JSON-LD Product schema in HTML
    const ldMatch = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/i);
    if (ldMatch) {
      try {
        const ld = JSON.parse(ldMatch[1]);
        const items = ld['@graph'] ? ld['@graph'] : [ld];
        for (const item of items) {
          if (item['@type'] === 'Product') {
            const offer    = Array.isArray(item.offers) ? item.offers[0] : (item.offers || {});
            const priceVal = offer.price || '';
            const currency = offer.priceCurrency || 'INR';
            const sym      = currency === 'INR' ? '₹' : (currency === 'USD' ? '$' : currency + ' ');
            const img      = Array.isArray(item.image) ? item.image[0] : item.image;
            const imgUrl   = typeof img === 'string' ? img : (img?.url || '');
            return {
              name:  item.name  || '',
              price: priceVal ? `${sym}${priceVal}` : '',
              image: imgUrl,
              url:   item.url   || cleanUrl,
            };
          }
        }
      } catch (_) {}
    }
    const name     = gm(['og:title', 'twitter:title']) || (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '').trim();
    const image    = gm(['og:image', 'twitter:image:src', 'twitter:image']);
    const priceRaw = gm(['product:price:amount', 'og:price:amount']);
    const currency = gm(['product:price:currency', 'og:price:currency']) || 'INR';
    const sym      = currency === 'INR' ? '₹' : (currency === 'USD' ? '$' : currency + ' ');
    return {
      name:  name.substring(0, 120),
      price: priceRaw ? `${sym}${priceRaw}` : '',
      image,
      url:   cleanUrl,
    };
  } catch (_) {}

  return {};
}

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' } }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; if (data.length > 80000) req.destroy(); });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy());
  });
}

/**
 * Advanced Tracking Controller
 * Bridges tracker.js events with automation engine
 */
export const trackingController = {
  // ── Track Visitor ──────────────────────────────────────────────────────────
  async trackVisitor(req, res, next) {
    try {
      const db = getDb();
      const { channelId, sessionId, url, deviceType, language, pageViews, pageTitle, screen_res, timezone: tz, shopify_carousel } = req.body;
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
              || req.ip
              || req.socket?.remoteAddress
              || '';
              console.log('bbbbbb',ip)
      const geo = await this._getGeoData(ip);

      // Geo-based language is the source of truth (city/state → native language)
      // Browser locale (hi-IN, en-US) is a hint only — strip suffix and use as fallback
      const geoLang = getLanguageFromGeo(geo.city, geo.state, geo.countryCode);
      const browserLang = language ? language.split('-')[0].toLowerCase() : null;
      // Prefer geo (accurate) over browser locale (can be wrong e.g. VPN users)
      const resolvedLanguage = geoLang || browserLang || 'en';

      const visitorIdx = db.website_visitors.findIndex(v => v.channel_id === (channelId || 'demo') && v.session_id === sessionId);
      const visitor = {
        id: visitorIdx >= 0 ? db.website_visitors[visitorIdx].id : (db.website_visitors.length || 0) + 1,
        channel_id: channelId || 'demo',
        session_id: sessionId,
        ip_address: ip,
        language: resolvedLanguage,
        page_url: url,
        device_type: deviceType,
        page_views: pageViews || 1,
        shopify_carousel: shopify_carousel || '[]',
        status: visitorIdx >= 0 ? db.website_visitors[visitorIdx].status : 'active',
        // ── Geo & Environment Enrichment ──
        city: geo.city || null,
        state: geo.state || null,
        country: geo.country || null,
        country_code: geo.countryCode || null,
        timezone: tz || geo.timezone || null,
        screen_res: screen_res || null,
        visited_at: new Date().toISOString(),
        created_at: visitorIdx >= 0 ? db.website_visitors[visitorIdx].created_at : new Date().toISOString()
      };

      if (visitorIdx >= 0) db.website_visitors[visitorIdx] = { ...db.website_visitors[visitorIdx], ...visitor };
      else db.website_visitors.push(visitor);

      // ── Auto-sync Shopify catalog from scraped carousel ──
      if (shopify_carousel) {
        try {
          const products = JSON.parse(shopify_carousel);
          if (Array.isArray(products) && products.length > 0) {
            for (const p of products) {
              if (!p.name || !p.url) continue;
              const existing = db.product_catalog.findIndex(c => c.channel_id === (channelId || 'demo') && c.url === p.url);
              const record = { channel_id: channelId || 'demo', name: p.name, price: p.price || '0', image: p.image || '', url: p.url, updated_at: new Date().toISOString() };
              if (existing >= 0) Object.assign(db.product_catalog[existing], record);
              else db.product_catalog.push({ id: (db.product_catalog.length || 0) + 1, ...record });
            }
          }
        } catch (_) {}
      }

      db.save();
      // Return IP + geo so the tracker can console.log it in the browser
      res.json({
        success: true,
        debug: {
          ip:       ip   || null,
          city:     geo.city    || null,
          state:    geo.state   || null,
          country:  geo.country || null,
          timezone: geo.timezone|| null,
          language: resolvedLanguage,
          session:  sessionId,
        }
      });
    } catch (e) { next(e); }
  },

  // ── Identify ──────────────────────────────────────────────────────────────
  async identify(req, res, next) {
    try {
      const db = getDb();
      const { channelId, sessionId, phone, email, name } = req.body;
      const idx = db.website_visitors.findIndex(v => v.channel_id === (channelId || 'demo') && v.session_id === sessionId);
      if (idx >= 0) {
        db.website_visitors[idx].phone = phone || db.website_visitors[idx].phone;
        db.website_visitors[idx].email = email || db.website_visitors[idx].email;
        db.website_visitors[idx].name = name || db.website_visitors[idx].name;
        db.save();
      }
      res.json({ success: true });
    } catch (e) { next(e); }
  },

  // ── Track Cart ────────────────────────────────────────────────────────────
  async trackCart(req, res, next) {
    try {
      const db = getDb();
      const { channelId, sessionId, phone, email, name, eventType, cartId, products, totalAmount,
              currency, cart_url } = req.body;
      let { product_name, product_image, product_url, product_price } = req.body;

      const cid = channelId || 'demo';

      // Auto-fill product fields from first product in array if top-level fields are missing
      const productsArr = Array.isArray(products) ? products : [];
      const firstProduct = productsArr[0] || {};
      if (!product_name  && firstProduct.name)  product_name  = firstProduct.name;
      if (!product_image && firstProduct.image) product_image = firstProduct.image;
      if (!product_url   && firstProduct.url)   product_url   = firstProduct.url;
      if (!product_price && firstProduct.price) product_price = String(firstProduct.price);

      const needsScrape = product_url && (!product_name || !product_image);

      const existingIdx = db.cart_events.findIndex(c =>
        c.channel_id === cid &&
        c.session_id === sessionId &&
        c.event_type === (eventType || 'add_to_cart') &&
        !c.recovered
      );

      if (existingIdx >= 0) {
        db.cart_events[existingIdx].products      = JSON.stringify(productsArr);
        db.cart_events[existingIdx].total_amount  = totalAmount || 0;
        db.cart_events[existingIdx].cart_url      = cart_url     || db.cart_events[existingIdx].cart_url;
        db.cart_events[existingIdx].product_name  = product_name  || db.cart_events[existingIdx].product_name;
        db.cart_events[existingIdx].product_image = product_image || db.cart_events[existingIdx].product_image;
        db.cart_events[existingIdx].product_price = product_price || db.cart_events[existingIdx].product_price;
        db.cart_events[existingIdx].product_url   = product_url   || db.cart_events[existingIdx].product_url;
      } else {
        db.cart_events.push({
          id: (db.cart_events.length || 0) + 1,
          channel_id: cid,
          session_id: sessionId,
          phone, email, name,
          event_type:    eventType   || 'add_to_cart',
          cart_id:       cartId,
          products:      JSON.stringify(productsArr),
          total_amount:  totalAmount || 0,
          currency:      currency    || null,
          whatsapp_sent: 0,
          recovered:     0,
          created_at:    new Date().toISOString(),
          product_name, product_image, product_url, cart_url, product_price,
        });
      }

      // ── Update visitor status to abandoned_cart or abandoned_checkout ──
      // This causes the automation engine to stop website_visit / product_view
      // campaigns for this user and start targeting them with correct recovery instead.
      const vCartIdx = db.website_visitors.findIndex(v =>
        v.channel_id === (channelId || 'demo') && (v.session_id === sessionId || (phone && v.phone === phone))
      );
      if (vCartIdx >= 0) {
        if (eventType === 'checkout_started') {
          if (upgradeStatus(db.website_visitors[vCartIdx], 'abandoned_checkout')) {
            db.website_visitors[vCartIdx].checkout_started_at = new Date().toISOString();
          }
        } else if (eventType !== 'checkout_completed') {
          if (upgradeStatus(db.website_visitors[vCartIdx], 'abandoned_cart')) {
            db.website_visitors[vCartIdx].cart_started_at = new Date().toISOString();
          }
        }
        // Always backfill phone/email/name if now available
        if (phone && !db.website_visitors[vCartIdx].phone) db.website_visitors[vCartIdx].phone = phone;
        if (email && !db.website_visitors[vCartIdx].email) db.website_visitors[vCartIdx].email = email;
        if (name  && !db.website_visitors[vCartIdx].name)  db.website_visitors[vCartIdx].name  = name;
      } else if (eventType !== 'checkout_completed') {
        // ── CREATE visitor on-the-fly when cart event arrives before trackVisitor ──
        const newStatus = eventType === 'checkout_started' ? 'abandoned_checkout' : 'abandoned_cart';
        const now = new Date().toISOString();
        db.website_visitors.push({
          id:           (db.website_visitors.length || 0) + 1,
          channel_id:   channelId || 'demo',
          session_id:   sessionId,
          phone:        phone  || null,
          email:        email  || null,
          name:         name   || null,
          status:       newStatus,
          device_type:  null,
          page_views:   1,
          last_product_name:  product_name  || null,
          last_product_image: product_image || null,
          last_product_url:   product_url   || null,
          last_product_price: product_price || null,
          cart_started_at:       eventType !== 'checkout_started' ? now : null,
          checkout_started_at:   eventType === 'checkout_started' ? now : null,
          visited_at:   now,
          created_at:   now,
          updated_at:   now,
        });
        console.log(`[Visitor] Auto-created on cart event — status=${newStatus} session=${sessionId} phone=${phone||'unknown'}`);
      }

      // If user checkout_completed (conversion) mark this and previous as recovered
      if (eventType === 'checkout_completed') {
        this._markRecovered(db, channelId, sessionId, phone);
      }
      db.save();
      res.json({ success: true });

      // ── Background scrape: fill missing product fields without blocking ──
      if (needsScrape) {
        const cid2 = channelId || 'demo';
        scrapeProductUrl(product_url).then(scraped => {
          if (!scraped.name && !scraped.image) return;
          const db2 = getDb();
          // Patch every cart event for this session that is missing data
          db2.cart_events.filter(c => c.channel_id === cid2 && c.session_id === sessionId).forEach(c => {
            if (!c.product_name  && scraped.name)  c.product_name  = scraped.name;
            if (!c.product_image && scraped.image) c.product_image = scraped.image;
            if (!c.product_price && scraped.price) c.product_price = scraped.price;
            // Also patch items in products JSON array
            try {
              const arr = JSON.parse(c.products || '[]');
              let changed = false;
              arr.forEach(p => {
                if (p.url === product_url) {
                  if (!p.image && scraped.image) { p.image = scraped.image; changed = true; }
                  if (!p.name  && scraped.name)  { p.name  = scraped.name;  changed = true; }
                  if (!p.price && scraped.price) { p.price = scraped.price; changed = true; }
                }
              });
              if (changed) c.products = JSON.stringify(arr);
            } catch (_) {}
          });
          // Upsert product catalog
          const ci = db2.product_catalog.findIndex(p => p.channel_id === cid2 && p.url === product_url);
          if (ci >= 0) {
            if (!db2.product_catalog[ci].name  && scraped.name)  db2.product_catalog[ci].name  = scraped.name;
            if (!db2.product_catalog[ci].image && scraped.image) db2.product_catalog[ci].image = scraped.image;
            if (!db2.product_catalog[ci].price && scraped.price) db2.product_catalog[ci].price = scraped.price;
          } else if (scraped.name) {
            db2.product_catalog.push({
              id: (db2.product_catalog.length || 0) + 1, channel_id: cid2,
              name: scraped.name, price: scraped.price || '', image: scraped.image || '',
              url: product_url, updated_at: new Date().toISOString(),
            });
          }
          db2.save();
          console.log(`[Scrape] Cart event enriched: "${scraped.name}" ${scraped.price} ${product_url}`);
        }).catch(() => {});
      }
    } catch (e) { next(e); }
  },

  // ── Track Purchase (The Recovery Engine) ──────────────────────────────────
  async trackPurchase(req, res, next) {
    try {
      const db = getDb();
      const { channelId, sessionId, phone, orderId, products, totalAmount } = req.body;
      
      db.purchase_history.push({
        id: (db.purchase_history.length || 0) + 1,
        channel_id: channelId || 'demo',
        phone, order_id: orderId,
        products: JSON.stringify(products || []),
        total_amount: totalAmount || 0,
        purchased_at: new Date().toISOString()
      });

      // 🔥 AUTOMATIC DETECTION: mark all abandonment events for this user as recovered
      this._markRecovered(db, channelId, sessionId, phone);
      db.save();

      res.json({ success: true });
    } catch (e) { next(e); }
  },

  _markRecovered(db, channelId, sessionId, phone) {
    const cid = channelId || 'demo';
    db.cart_events.forEach(c => {
      if (c.channel_id === cid && (c.session_id === sessionId || (phone && c.phone === phone))) {
        if (!c.recovered) {
          c.recovered = 1;
          c.recovered_at = new Date().toISOString();
        }
      }
    });

    // Update visitor status
    const vIdx = db.website_visitors.findIndex(v => v.channel_id === cid && (v.session_id === sessionId || (phone && v.phone === phone)));
    if (vIdx >= 0) {
      upgradeStatus(db.website_visitors[vIdx], 'purchased');
    } else {
      // Create minimal visitor record for the purchase so dashboard shows it
      const now = new Date().toISOString();
      db.website_visitors.push({
        id:        (db.website_visitors.length || 0) + 1,
        channel_id: cid,
        session_id: sessionId,
        phone:     phone || null,
        status:    'purchased',
        page_views: 1,
        visited_at: now,
        created_at: now,
        updated_at: now,
      });
    }
  },

  async trackProduct(req, res, next) {
    try {
      const db = getDb();
      const { channelId, sessionId, product, eventType, currency } = req.body;
      let { product_name, product_image, product_url, product_price } = req.body;
      const cid = channelId || 'demo';

      // ── Server-side auto-scrape: if image or name missing but URL provided ──
      // Respond immediately; scrape runs async and patches the record when done.
      const needsScrape = product_url && (!product_name || !product_image);

      // Find visitor to link phone immediately if available
      const visitor = db.website_visitors.find(v => v.channel_id === cid && v.session_id === sessionId);

      // Deduplicate: Don't track multiple distinct events for exact same product URL by same session
      const existingIdx = db.product_views.findIndex(v =>
        v.channel_id === cid && v.session_id === sessionId &&
        (product_url ? v.product_url === product_url : v.product_name === product_name)
      );

      const record = {
        id: existingIdx >= 0 ? db.product_views[existingIdx].id : (db.product_views.length || 0) + 1,
        channel_id:     cid,
        session_id:     sessionId,
        phone:          visitor?.phone || null,
        product:        JSON.stringify(product || {}),
        event_type:     'product_viewed',
        product_name:   product_name  || '',
        product_image:  product_image || '',
        product_url:    product_url   || '',
        product_price:  product_price || '',
        currency:       currency      || null,
        whatsapp_sent:  0,
        followup_count: 0,
        created_at:     new Date().toISOString(),
      };

      if (existingIdx < 0) db.product_views.push(record);
      else Object.assign(db.product_views[existingIdx], record);

      // ── Store on visitor record for campaign variables ──
      const vIdx = db.website_visitors.findIndex(v => v.channel_id === cid && v.session_id === sessionId);
      if (vIdx >= 0) {
        db.website_visitors[vIdx].last_product_name  = product_name  || db.website_visitors[vIdx].last_product_name;
        db.website_visitors[vIdx].last_product_image = product_image || db.website_visitors[vIdx].last_product_image;
        db.website_visitors[vIdx].last_product_url   = product_url   || db.website_visitors[vIdx].last_product_url;
        db.website_visitors[vIdx].last_product_price = product_price || db.website_visitors[vIdx].last_product_price;
        upgradeStatus(db.website_visitors[vIdx], 'product_view');
      } else {
        // ── CREATE visitor on-the-fly when product event arrives before trackVisitor ──
        const now = new Date().toISOString();
        db.website_visitors.push({
          id:           (db.website_visitors.length || 0) + 1,
          channel_id:   cid,
          session_id:   sessionId,
          phone:        visitor?.phone || null,
          status:       'product_view',
          device_type:  null,
          page_views:   1,
          last_product_name:  product_name  || null,
          last_product_image: product_image || null,
          last_product_url:   product_url   || null,
          last_product_price: product_price || null,
          visited_at:   now,
          created_at:   now,
          updated_at:   now,
        });
        console.log(`[Visitor] Auto-created on product view — status=product_view session=${sessionId}`);
      }

      db.save();
      res.json({ success: true });

      // ── Background scrape: fill missing fields without blocking response ──
      if (needsScrape) {
        scrapeProductUrl(product_url).then(scraped => {
          if (!scraped.name && !scraped.image) return;
          const db2 = getDb();
          const idx = db2.product_views.findIndex(v =>
            v.channel_id === cid && v.session_id === sessionId && v.product_url === product_url
          );
          if (idx >= 0) {
            if (!db2.product_views[idx].product_name  && scraped.name)  db2.product_views[idx].product_name  = scraped.name;
            if (!db2.product_views[idx].product_image && scraped.image) db2.product_views[idx].product_image = scraped.image;
            if (!db2.product_views[idx].product_price && scraped.price) db2.product_views[idx].product_price = scraped.price;
          }
          // Also patch visitor record
          const vi = db2.website_visitors.findIndex(v => v.channel_id === cid && v.session_id === sessionId);
          if (vi >= 0) {
            if (!db2.website_visitors[vi].last_product_name  && scraped.name)  db2.website_visitors[vi].last_product_name  = scraped.name;
            if (!db2.website_visitors[vi].last_product_image && scraped.image) db2.website_visitors[vi].last_product_image = scraped.image;
            if (!db2.website_visitors[vi].last_product_price && scraped.price) db2.website_visitors[vi].last_product_price = scraped.price;
          }
          // Patch product catalog too
          const key = product_url;
          const ci  = db2.product_catalog.findIndex(p => p.channel_id === cid && p.url === key);
          if (ci >= 0) {
            if (!db2.product_catalog[ci].name  && scraped.name)  db2.product_catalog[ci].name  = scraped.name;
            if (!db2.product_catalog[ci].image && scraped.image) db2.product_catalog[ci].image = scraped.image;
            if (!db2.product_catalog[ci].price && scraped.price) db2.product_catalog[ci].price = scraped.price;
          } else if (scraped.name) {
            db2.product_catalog.push({
              id: (db2.product_catalog.length || 0) + 1, channel_id: cid,
              name: scraped.name, price: scraped.price || '', image: scraped.image || '',
              url: product_url, updated_at: new Date().toISOString(),
            });
          }
          db2.save();
          console.log(`[Scrape] Product enriched: "${scraped.name}" ${scraped.price} ${product_url}`);
        }).catch(() => {});
      }
    } catch (e) { next(e); }
  },

  // ── Shopify Product Catalog Sync ─────────────────────────────────────────
  async trackShopifyProducts(req, res, next) {
    try {
      const db = getDb();
      const { channelId, products } = req.body;
      const cid = channelId || 'demo';

      if (!Array.isArray(products) || products.length === 0) {
        return res.json({ success: true, synced: 0 });
      }

      let synced = 0;
      for (const p of products) {
        if (!p.name) continue;
        const existing = db.product_catalog.findIndex(c => c.channel_id === cid && c.url === p.url);
        const record = {
          channel_id: cid,
          name: p.name,
          price: p.price || '0.00',
          image: p.image || '',
          url: p.url || '',
          updated_at: new Date().toISOString()
        };
        if (existing >= 0) {
          db.product_catalog[existing] = { ...db.product_catalog[existing], ...record };
        } else {
          db.product_catalog.push({ id: (db.product_catalog.length || 0) + 1, ...record });
          synced++;
        }
      }

      db.save();
      res.json({ success: true, synced, total: db.product_catalog.filter(p => p.channel_id === cid).length });
    } catch (e) { next(e); }
  },

  async trackIdentify(req, res, next) {
    try {
      const db = getDb();
      const { channelId, sessionId, name, phone,
              auto_product_name, auto_product_image, auto_product_url, auto_product_price } = req.body;
      const cid = channelId || 'demo';
      let vIdx = db.website_visitors.findIndex(v => v.channel_id === cid && v.session_id === sessionId);
      if (vIdx < 0 && phone) {
        // Try by phone across all sessions for this channel
        vIdx = db.website_visitors.findIndex(v => v.channel_id === cid && v.phone === phone);
      }
      if (vIdx >= 0) {
        db.website_visitors[vIdx].name  = name  || db.website_visitors[vIdx].name;
        db.website_visitors[vIdx].phone = phone || db.website_visitors[vIdx].phone;
        // Backfill session_id if we found visitor by phone but session was different
        if (!db.website_visitors[vIdx].session_id) db.website_visitors[vIdx].session_id = sessionId;

        // If tracker sent auto-captured product (from product page detect), store it
        if (auto_product_name)  db.website_visitors[vIdx].last_product_name  = auto_product_name;
        if (auto_product_image) db.website_visitors[vIdx].last_product_image = auto_product_image;
        if (auto_product_url)   db.website_visitors[vIdx].last_product_url   = auto_product_url;
        if (auto_product_price) db.website_visitors[vIdx].last_product_price = auto_product_price;
      } else {
        // ── CREATE visitor on-the-fly when identify arrives before trackVisitor ──
        const now = new Date().toISOString();
        const newVisitor = {
          id:           (db.website_visitors.length || 0) + 1,
          channel_id:   cid,
          session_id:   sessionId,
          phone:        phone || null,
          name:         name  || null,
          status:       'active',
          device_type:  null,
          page_views:   1,
          last_product_name:  auto_product_name  || null,
          last_product_image: auto_product_image || null,
          last_product_url:   auto_product_url   || null,
          last_product_price: auto_product_price || null,
          visited_at:   now,
          created_at:   now,
          updated_at:   now,
        };
        db.website_visitors.push(newVisitor);
        vIdx = db.website_visitors.length - 1;
        console.log(`[Visitor] Auto-created on identify — status=active session=${sessionId} phone=${phone||'unknown'}`);
      }

      // Link phone to all anonymous events for this session
      db.cart_events.filter(c => c.session_id === sessionId).forEach(c => {
        c.name  = name  || c.name;
        c.phone = phone || c.phone;
      });
      db.product_views.filter(v => v.session_id === sessionId).forEach(v => {
        v.phone = phone || v.phone;
      });
      db.save();

      // Background scrape if auto_product_url provided but image/price missing
      if (auto_product_url && (!auto_product_image || !auto_product_price)) {
        scrapeProductUrl(auto_product_url).then(scraped => {
          if (!scraped.name && !scraped.image) return;
          const db2 = getDb();
          const vi  = db2.website_visitors.findIndex(v => v.channel_id === cid && v.session_id === sessionId);
          if (vi >= 0) {
            if (!db2.website_visitors[vi].last_product_name  && scraped.name)  db2.website_visitors[vi].last_product_name  = scraped.name;
            if (!db2.website_visitors[vi].last_product_image && scraped.image) db2.website_visitors[vi].last_product_image = scraped.image;
            if (!db2.website_visitors[vi].last_product_price && scraped.price) db2.website_visitors[vi].last_product_price = scraped.price;
            db2.save();
          }
        }).catch(() => {});
      }
      res.json({ success: true });
    } catch(e) { next(e); }
  },

  async trackCheckout(req, res, next) {
    try {
      const { eventType } = req.body;
      if (eventType === 'checkout_completed') {
        return this.trackCart(req, res, next); // reuse recovery logic
      }
      res.json({ success: true });
    } catch(e) { next(e); }
  },

  async trackPageView(req, res, next) {
    try {
      const db = getDb();
      const {
        channelId, sessionId, url, pageTitle, pageViewId, referrer,
        durationSec, maxScrollPct, scrollEvents, clickEvents,
        activeTimeSec, engagementScore, exitEvent,
        deviceType, browser, os, screenRes,
      } = req.body;
      const cid = channelId || 'demo';
      const now = new Date().toISOString();

      // Upsert by pageViewId so heartbeat updates don't create duplicates
      if (pageViewId) {
        const idx = db.page_views.findIndex(p => p.page_view_id === pageViewId);
        if (idx >= 0) {
          // Update existing record with latest engagement data
          Object.assign(db.page_views[idx], {
            duration_sec:     durationSec     ?? db.page_views[idx].duration_sec,
            max_scroll_pct:   maxScrollPct    ?? db.page_views[idx].max_scroll_pct,
            scroll_events:    scrollEvents    ?? db.page_views[idx].scroll_events,
            click_events:     clickEvents     ?? db.page_views[idx].click_events,
            active_time_sec:  activeTimeSec   ?? db.page_views[idx].active_time_sec,
            engagement_score: engagementScore ?? db.page_views[idx].engagement_score,
            exit_event:       exitEvent       ?? db.page_views[idx].exit_event,
            updated_at: now,
          });
          db.save();
          return res.json({ success: true });
        }
      }

      // Find visitor for phone linkage
      const visitor = db.website_visitors.find(v => v.channel_id === cid && v.session_id === sessionId);

      db.page_views.push({
        id: (db.page_views.length || 0) + 1,
        page_view_id:    pageViewId || null,
        channel_id:      cid,
        session_id:      sessionId,
        phone:           visitor?.phone || null,
        url:             url || '',
        page_title:      pageTitle || '',
        referrer:        referrer || '',
        duration_sec:    durationSec    || 0,
        max_scroll_pct:  maxScrollPct   || 0,
        scroll_events:   scrollEvents   || 0,
        click_events:    clickEvents    || 0,
        active_time_sec: activeTimeSec  || 0,
        engagement_score: engagementScore || 0,
        exit_event:      !!exitEvent,
        device_type:     deviceType || visitor?.device_type || null,
        browser:         browser    || null,
        os:              os         || null,
        screen_res:      screenRes  || null,
        viewed_at:       now,
        updated_at:      now,
      });

      // Update visitor engagement score (rolling average)
      if (visitor) {
        const myViews = db.page_views.filter(p => p.channel_id === cid && p.session_id === sessionId && p.engagement_score > 0);
        const avgScore = myViews.length ? Math.round(myViews.reduce((s, p) => s + p.engagement_score, 0) / myViews.length) : 0;
        visitor.engagement_score = avgScore;
        visitor.total_page_views = (visitor.total_page_views || 0) + 1;
        visitor.total_time_sec   = (visitor.total_time_sec || 0) + (durationSec || 0);
      }

      db.save();
      res.json({ success: true });
    } catch (e) { next(e); }
  },

  async trackSearch(req, res, next) {
    try {
      const db = getDb();
      const { channelId, sessionId, query, resultsCount, filters } = req.body;
      db.searches.push({
        id: (db.searches.length || 0) + 1,
        channel_id: channelId || 'demo',
        session_id: sessionId,
        query,
        results_count: resultsCount || 0,
        filters: JSON.stringify(filters || {}),
        searched_at: new Date().toISOString()
      });
      db.save();
      res.json({ success: true });
    } catch (e) { next(e); }
  },

  // ── Track WhatsApp Link Click (wc_ref=wa in URL) ─────────────��───────────
  async trackClick(req, res, next) {
    try {
      const db = getDb();
      const { channelId, sessionId, eventType, campaignId } = req.body;
      const cid = channelId || 'demo';

      // Mark the execution as clicked if campaignId provided
      if (campaignId) {
        const exec = db.abandoned_cart_executions.find(e =>
          String(e.campaign_id) === String(campaignId) && e.session_id === sessionId
        );
        if (exec) {
          exec.clicked = 1;
          exec.clicked_at = new Date().toISOString();
        }
      }

      db.custom_events.push({
        id: (db.custom_events.length || 0) + 1,
        channel_id: cid,
        session_id: sessionId,
        event_name: eventType || 'whatsapp_click',
        properties: JSON.stringify({ campaignId }),
        created_at: new Date().toISOString()
      });
      db.save();
      res.json({ success: true });
    } catch (e) { next(e); }
  },

  async trackCustom(req, res, next) {
    try {
      const db = getDb();
      const { channelId, sessionId, eventName, properties } = req.body;
      db.custom_events.push({
        id: (db.custom_events.length || 0) + 1,
        channel_id: channelId || 'demo',
        session_id: sessionId,
        event_name: eventName,
        properties: JSON.stringify(properties || {}),
        created_at: new Date().toISOString()
      });
      db.save();
      res.json({ success: true });
    } catch (e) { next(e); }
  },

  // ── Private Geo-IP Engine  ─────────────────────────────────────────────────
  async _getGeoData(ip) {  console.log('sss'.ip)
    const fallback = { city: 'Unknown', state: 'Unknown', country: 'Unknown', countryCode: '🌐', timezone: 'UTC' };

    if (!ip) return fallback;

    // Strip IPv4-mapped IPv6 prefix (::ffff:1.2.3.4 → 1.2.3.4)
    // Pure IPv6 (mobile) is kept as-is; pure IPv4 (PC/laptop) is kept as-is
    const cleanIp = ip.replace(/^::ffff:/, '');

    // Skip local/private addresses — API won't resolve them
    // if (
    //   cleanIp === '127.0.0.1' ||
    //   cleanIp === '::1' ||
    //   cleanIp.startsWith('192.168.') ||
    //   cleanIp.startsWith('10.') ||
    //   cleanIp.startsWith('172.')
    // ) {
    //   return { city: 'Local', state: 'Local', country: 'Local', countryCode: 'XX', timezone: 'UTC' };
    // }

    try {
      const response = await fetch(`https://api.freeipapi.app/api/v1/lookup?ip=${encodeURIComponent(cleanIp)}`, {
        headers: {
          'Authorization': `Bearer ${process.env.FREEIPAPI_TOKEN}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) return fallback;

      const data = await response.json();
 console.log('bb',data)
      return {
        city:        data.city    || null,
        state:       data.region  || null,
        country:     data.country || null,
        countryCode: data.country_code || null,
        timezone:    data.timezones    || null,
      };
    } catch (e) {
      console.error('Geo lookup error:', e.message);
      return fallback;
    }
  }
};
