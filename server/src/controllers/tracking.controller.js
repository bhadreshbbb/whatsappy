import { getDb } from '../services/database.js';
import { getLanguageFromGeo } from '../utils/geoLanguage.js';
import { upgradeStatus } from '../utils/statusMachine.js';

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
      res.json({ success: true });
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
              currency, product_name, product_image, product_url, cart_url, product_price } = req.body;
      
      const existingIdx = db.cart_events.findIndex(c => 
        c.channel_id === (channelId || 'demo') && 
        c.session_id === sessionId && 
        c.event_type === (eventType || 'add_to_cart') && 
        !c.recovered
      );

      if (existingIdx >= 0) {
        db.cart_events[existingIdx].products = JSON.stringify(products || []);
        db.cart_events[existingIdx].total_amount = totalAmount || 0;
        db.cart_events[existingIdx].cart_url = cart_url || db.cart_events[existingIdx].cart_url;
        db.cart_events[existingIdx].product_name = product_name || db.cart_events[existingIdx].product_name;
        db.cart_events[existingIdx].product_image = product_image || db.cart_events[existingIdx].product_image;
        db.cart_events[existingIdx].product_price = product_price || db.cart_events[existingIdx].product_price;
        db.cart_events[existingIdx].product_url = product_url || db.cart_events[existingIdx].product_url;
      } else {
        const newEvent = {
          id: (db.cart_events.length || 0) + 1,
          channel_id: channelId || 'demo',
          session_id: sessionId,
          phone, email, name,
          event_type: eventType || 'add_to_cart',
          cart_id: cartId,
          products: JSON.stringify(products || []),
          total_amount: totalAmount || 0,
          currency: currency || null,
          whatsapp_sent: 0,
          recovered: 0,
          created_at: new Date().toISOString(),
          // ── Enrichment for Automation ──
          product_name, product_image, product_url, cart_url, product_price
        };
        db.cart_events.push(newEvent);
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
      }

      // If user checkout_completed (conversion) mark this and previous as recovered
      if (eventType === 'checkout_completed') {
        this._markRecovered(db, channelId, sessionId, phone);
      }
      db.save();

      res.json({ success: true });
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
    }
  },

  async trackProduct(req, res, next) {
    try {
      const db = getDb();
      const { channelId, sessionId, product, eventType, product_name, product_image, product_url, product_price, currency } = req.body;
      const cid = channelId || 'demo';

      // Find visitor to link phone immediately if available
      const visitor = db.website_visitors.find(v => v.channel_id === cid && v.session_id === sessionId);

      // Deduplicate: Don't track multiple distinct events for exact same product view by same session
      const existingIdx = db.product_views.findIndex(v =>
        v.channel_id === cid && v.session_id === sessionId && v.product_name === product_name
      );

      if (existingIdx < 0) {
        db.product_views.push({
          id: (db.product_views.length || 0) + 1,
          channel_id: cid,
          session_id: sessionId,
          phone: visitor?.phone || null,
          product: JSON.stringify(product || {}),
          event_type: 'product_viewed',
          product_name, product_image, product_url, product_price, currency,
          whatsapp_sent: 0,
          followup_count: 0,
          created_at: new Date().toISOString()
        });
      }

      // ── STORE PRODUCT DATA ON VISITOR RECORD for dynamic campaign injection ──
      const vIdx = db.website_visitors.findIndex(v => v.channel_id === cid && v.session_id === sessionId);
      if (vIdx >= 0) {
        // Always update to most recently viewed product
        db.website_visitors[vIdx].last_product_name  = product_name  || db.website_visitors[vIdx].last_product_name;
        db.website_visitors[vIdx].last_product_image = product_image || db.website_visitors[vIdx].last_product_image;
        db.website_visitors[vIdx].last_product_url   = product_url   || db.website_visitors[vIdx].last_product_url;
        db.website_visitors[vIdx].last_product_price = product_price || db.website_visitors[vIdx].last_product_price;
        upgradeStatus(db.website_visitors[vIdx], 'product_view');
      }

      db.save();
      res.json({ success: true });
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
      const { channelId, sessionId, name, phone } = req.body;
      const vIdx = db.website_visitors.findIndex(v => v.channel_id === (channelId || 'demo') && v.session_id === sessionId);
      if (vIdx >= 0) {
        db.website_visitors[vIdx].name = name;
        db.website_visitors[vIdx].phone = phone;
        // Also update any anonymous cart events if they exist
        db.cart_events.filter(c => c.session_id === sessionId).forEach(c => {
           c.name = name; c.phone = phone;
        });

        // 🔥 LINK PRODUCT VIEWS: ensure anonymouse product views get this phone number
        db.product_views.filter(v => v.session_id === sessionId).forEach(v => {
           v.phone = phone;
        });
        db.save();
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
      const { channelId, sessionId, url, pageTitle } = req.body;
      db.page_views.push({
        id: (db.page_views.length || 0) + 1,
        channel_id: channelId || 'demo',
        session_id: sessionId,
        url,
        page_title: pageTitle,
        viewed_at: new Date().toISOString()
      });
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

  // ── Private Geo-IP Engine ─────────────────────────────────────────────────
  async _getGeoData(ip) {
    const fallback = { city: 'Unknown', state: 'Unknown', country: 'Unknown', countryCode: '🌐', timezone: 'UTC' };

    if (!ip) return fallback;

    // Strip IPv4-mapped IPv6 prefix (::ffff:1.2.3.4 → 1.2.3.4)
    // Pure IPv6 (mobile) is kept as-is; pure IPv4 (PC/laptop) is kept as-is
    const cleanIp = ip.replace(/^::ffff:/, '');

    // Skip local/private addresses — API won't resolve them
    if (
      cleanIp === '127.0.0.1' ||
      cleanIp === '::1' ||
      cleanIp.startsWith('192.168.') ||
      cleanIp.startsWith('10.') ||
      cleanIp.startsWith('172.')
    ) {
      return { city: 'Local', state: 'Local', country: 'Local', countryCode: 'XX', timezone: 'UTC' };
    }

    try {
      const response = await fetch(`https://api.freeipapi.app/api/v1/lookup?ip=${encodeURIComponent(cleanIp)}`, {
        headers: {
          'Authorization': `Bearer ${process.env.FREEIPAPI_TOKEN}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) return fallback;

      const data = await response.json();

      return {
        city:        data.cityName    || null,
        state:       data.regionName  || null,
        country:     data.countryName || null,
        countryCode: data.countryCode || null,
        timezone:    data.timeZone    || null,
      };
    } catch (e) {
      console.error('Geo lookup error:', e.message);
      return fallback;
    }
  }
};
