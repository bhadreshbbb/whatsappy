import { getDb } from '../services/database.js';
import { getLanguageFromGeo } from '../utils/geoLanguage.js';
import { upgradeStatus, downgradeStatus } from '../utils/statusMachine.js';
import https from 'https';
import http from 'http';

// Cross-browser identity: sync the best status from all phone sessions to one session.
// Called after a phone is linked to a new session so the new browser immediately
// reflects the correct funnel position (e.g. abandoned_cart) instead of starting at 'active'.
const _STATUS_RANK = { purchased: 7, followup_complete: 6, product_recommendation: 6, abandoned_checkout: 5, abandoned_cart: 4, product_view_lock: 3, product_view: 2, active: 1 };
function _syncBestStatus(db, cid, visitorIdx, phone) {
  const allSessions = db.website_visitors.filter(v => v.channel_id === cid && v.phone === phone);
  // Terminal states — don't propagate to new sessions. A returning user who views a product
  // should start a fresh re-entry cycle, not inherit the completed state.
  const TERMINAL = new Set(['followup_complete', 'product_recommendation', 'product_view_lock', 'purchased']);
  const bestStatus = allSessions.reduce((best, s) => {
    if (TERMINAL.has(s.status)) return best;
    return (_STATUS_RANK[s.status] || 0) > (_STATUS_RANK[best] || 0) ? s.status : best;
  }, 'active');
  const current = db.website_visitors[visitorIdx].status || 'active';
  if ((_STATUS_RANK[bestStatus] || 0) > (_STATUS_RANK[current] || 0)) {
    db.website_visitors[visitorIdx].status     = bestStatus;
    db.website_visitors[visitorIdx].updated_at = new Date().toISOString();
    console.log(`[CrossBrowser] ${phone} status synced → ${bestStatus} (best across ${allSessions.length} sessions)`);
  }
}

// Strip query string + hash + trailing slash from any URL before storing
// e.g. https://shop.com/products/kurti?variant=123&ref=home → https://shop.com/products/kurti
function cleanProductUrl(url) {
  if (!url || typeof url !== 'string') return url || '';
  try {
    const u = new URL(url);
    return (u.origin + u.pathname).replace(/\/$/, '');
  } catch (_) {
    // Not a full URL (e.g. relative path) — just strip after ?
    return url.split('?')[0].split('#')[0].replace(/\/$/, '');
  }
}

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
      const { channelId, sessionId, url, language, pageViews, pageTitle, screen_res, timezone: tz, shopify_carousel,
              utm_source, utm_medium, utm_campaign, phone: visitorPhone } = req.body;
      console.log(`[Track/visitor] channelId="${channelId || 'demo'}" session="${(sessionId||'').slice(0,20)}" url="${(url||'').slice(0,60)}"`);
      // Also parse UTM from the page URL itself (covers direct clicks from WhatsApp)
      let _utmSource = utm_source || null, _utmMedium = utm_medium || null, _utmCampaign = utm_campaign || null;
      let _wwCam = null; // ww_cam = WhatsApp campaign ID (last-click attribution)
      try {
        const _u = new URL(url || '');
        _utmSource   = _utmSource   || _u.searchParams.get('utm_source')   || null;
        _utmMedium   = _utmMedium   || _u.searchParams.get('utm_medium')   || null;
        _utmCampaign = _utmCampaign || _u.searchParams.get('utm_campaign') || null;
        _wwCam       = _u.searchParams.get('ww_cam') || null;
      } catch (_) {}
      // Server-side decode of ww_src → phone (base64url, injected by _tagUrl in automation.js)
      // Works in incognito / any browser — no localStorage needed.
      let _wwSrcPhone = null;
      try {
        const _wu = new URL(url || '');
        const _wwSrc = _wu.searchParams.get('ww_src');
        if (_wwSrc) {
          const b64 = _wwSrc.replace(/-/g, '+').replace(/_/g, '/');
          const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
          const decoded = Buffer.from(padded, 'base64').toString('utf8');
          if (/^\d{7,15}$/.test(decoded)) {
            _wwSrcPhone = decoded;
            console.log(`[Campaign] ww_src decoded → phone=${_wwSrcPhone}`);
          }
        }
      } catch (_) {}
      // Device type: use client-sent value, fall back to server-side UA detection
      const _clientDevice = req.body.deviceType;
      const _ua = (req.headers['user-agent'] || '').toLowerCase();
      const _serverDevice = /tablet|ipad|playbook|silk/i.test(_ua) ? 'tablet'
                          : /mobile|iphone|android|iemobile|blackberry|opera mini|opera mobi|windows phone/i.test(_ua) ? 'mobile'
                          : 'desktop';
      const deviceType = _clientDevice || _serverDevice;
      console.log(`[Device] client="${_clientDevice || '—'}" ua-detected="${_serverDevice}" → using="${deviceType}"`);
      // ── IP extraction: check all proxy headers in priority order ────────────
      // Cloudflare (most reliable on Render) → standard proxy → socket
      const _cfIp    = req.headers['cf-connecting-ip']?.trim();
      const _fwdIp   = req.headers['x-forwarded-for']?.split(',')[0]?.trim();
      const _realIp  = req.headers['x-real-ip']?.trim();
      const _sockIp  = req.socket?.remoteAddress?.trim();
      const _reqIp   = req.ip?.trim();

      const ip = _cfIp || _fwdIp || _realIp || _reqIp || _sockIp || '';

      console.log('[IP] cf-connecting-ip:', _cfIp    || '—');
      console.log('[IP] x-forwarded-for: ', _fwdIp   || '—');
      console.log('[IP] x-real-ip:       ', _realIp  || '—');
      console.log('[IP] req.ip:          ', _reqIp   || '—');
      console.log('[IP] socket.addr:     ', _sockIp  || '—');
      console.log('[IP] → using:         ', ip       || '— (empty)');
      const geo = await this._getGeoData(ip, tz);

      // Geo-based language is the source of truth (city/state → native language)
      // Browser locale (hi-IN, en-US) is a hint only — strip suffix and use as fallback
      const geoLang = getLanguageFromGeo(geo.city, geo.state, geo.countryCode);
      const browserLang = language ? language.split('-')[0].toLowerCase() : null;
      // Prefer geo (accurate) over browser locale (can be wrong e.g. VPN users)
      const resolvedLanguage = geoLang || browserLang || 'en';

      let visitorIdx = db.website_visitors.findIndex(v => v.channel_id === (channelId || 'demo') && v.session_id === sessionId);
      // If session not found but this session_id matches a known phone's session, link it
      const existingPhone = visitorIdx >= 0 ? db.website_visitors[visitorIdx].phone : null;
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
        // UTM attribution — keep first-touch (don't overwrite if already set)
        utm_source:   _utmSource   || (visitorIdx >= 0 ? db.website_visitors[visitorIdx].utm_source   : null) || null,
        utm_medium:   _utmMedium   || (visitorIdx >= 0 ? db.website_visitors[visitorIdx].utm_medium   : null) || null,
        utm_campaign: _utmCampaign || (visitorIdx >= 0 ? db.website_visitors[visitorIdx].utm_campaign : null) || null,
        // Last-click WhatsApp campaign attribution — always updated on each campaign click
        // ww_cam is injected into product URLs by the automation engine (_tagUrl)
        last_click_campaign_id: _wwCam || (visitorIdx >= 0 ? db.website_visitors[visitorIdx].last_click_campaign_id : null) || null,
        last_click_at:          _wwCam ? new Date().toISOString() : (visitorIdx >= 0 ? db.website_visitors[visitorIdx].last_click_at : null) || null,
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

      // Re-resolve index after push (in case it was a new record)
      if (visitorIdx < 0) visitorIdx = db.website_visitors.findIndex(v => v.channel_id === (channelId||'demo') && v.session_id === sessionId);

      // ── Cross-browser recognition: phone sent from localStorage ──────────────
      // If client sends a previously stored phone, enrich the new session from
      // their existing profile so they appear as the same known user immediately.
      // Use phone from client localStorage OR server-decoded ww_src (campaign link click)
      const _phoneToLink = visitorPhone || _wwSrcPhone;
      if (_phoneToLink && visitorIdx >= 0 && !db.website_visitors[visitorIdx].phone) {
        const cid = channelId || 'demo';
        db.website_visitors[visitorIdx].phone = _phoneToLink;

        // Find all previous sessions for this phone, sorted most-recent first
        const prevSessions = db.website_visitors
          .filter(v => v.channel_id === cid && v.phone === _phoneToLink && v.session_id !== sessionId)
          .sort((a, b) => new Date(b.visited_at || b.created_at) - new Date(a.visited_at || a.created_at));

        if (prevSessions.length > 0) {
          const best = prevSessions[0]; // most recent previous session
          const cur  = db.website_visitors[visitorIdx];
          // Copy profile fields the new browser doesn't have yet
          if (!cur.name  && best.name)  cur.name  = best.name;
          if (!cur.email && best.email) cur.email = best.email;
          // Keep geo from current request (more accurate) but fall back to known
          if (!cur.city    && best.city)    cur.city    = best.city;
          if (!cur.state   && best.state)   cur.state   = best.state;
          if (!cur.country && best.country) cur.country = best.country;
          if (!cur.country_code && best.country_code) cur.country_code = best.country_code;
          // Carry purchase/repeat metadata
          const pCount = (db.purchase_history || []).filter(p => p.channel_id === cid && p.phone === visitorPhone).length;
          cur.purchase_count       = pCount || best.purchase_count || 0;
          cur.is_repeat_purchaser  = pCount >= 2 || best.is_repeat_purchaser || false;
          cur.is_repeat            = true;
          cur.visit_count          = prevSessions.length + 1;
          cur.total_purchase_count = pCount;
          cur.funnel_cycle         = best.funnel_cycle || 1;
        }

        // Sync best status (abandoned_cart, purchased, etc.) to this new session
        _syncBestStatus(db, cid, visitorIdx, _phoneToLink);

        // Backfill phone on any events already recorded for this session
        db.cart_events.forEach(c  => { if (c.session_id  === sessionId && !c.phone)  c.phone = _phoneToLink; });
        db.product_views.forEach(v => { if (v.session_id === sessionId && !v.phone)  v.phone = _phoneToLink; });
        (db.page_views || []).forEach(p => { if (p.session_id === sessionId && !p.phone) p.phone = _phoneToLink; });
        console.log(`[CrossBrowser] Recognized ${_phoneToLink} — enriched new session from ${prevSessions.length} previous session(s)`);
      }

      // If visitor already has a phone, keep is_repeat / visit_count consistent
      const knownPhone = existingPhone || (visitorIdx >= 0 ? db.website_visitors[visitorIdx]?.phone : null);
      if (knownPhone) {
        const samePhoneSessions = db.website_visitors.filter(v => v.channel_id === (channelId||'demo') && v.phone === knownPhone);
        if (samePhoneSessions.length > 1) {
          const vCount = samePhoneSessions.length;
          const pCount = (db.purchase_history||[]).filter(p=>p.channel_id===(channelId||'demo')&&p.phone===knownPhone).length;
          samePhoneSessions.forEach(v => {
            const vi = db.website_visitors.findIndex(x=>x.id===v.id);
            if (vi>=0) { db.website_visitors[vi].is_repeat=true; db.website_visitors[vi].visit_count=vCount; db.website_visitors[vi].total_purchase_count=pCount; }
          });
        }
      }

      // ── Auto-sync Shopify catalog from scraped carousel ──
      if (shopify_carousel) {
        try {
          const products = JSON.parse(shopify_carousel);
          if (Array.isArray(products) && products.length > 0) {
            for (const p of products) {
              if (!p.name || !p.url) continue;
              const existing = db.product_catalog.findIndex(c => c.channel_id === (channelId || 'demo') && c.url === p.url);
              const record = { channel_id: channelId || 'demo', name: p.name, price: p.price || '0', image: p.image || '', url: cleanProductUrl(p.url), updated_at: new Date().toISOString() };
              if (existing >= 0) Object.assign(db.product_catalog[existing], record);
              else db.product_catalog.push({ id: (db.product_catalog.length || 0) + 1, ...record });
            }
          }
        } catch (_) {}
      }

      db.save();

      // ── Campaign click marking: ww_cam present → mark execution clicked immediately ──
      // This is the most reliable path: happens server-side on every page visit from campaign link.
      if (_wwCam) {
        const _knownPhone = _wwSrcPhone
          || (visitorIdx >= 0 ? db.website_visitors[visitorIdx]?.phone : null)
          || visitorPhone;
        if (_knownPhone) {
          const execs = (db.abandoned_cart_executions || []).filter(e =>
            String(e.campaign_id) === String(_wwCam) && e.phone === _knownPhone
          ).sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at));
          if (execs.length > 0 && !execs[0].clicked) {
            execs[0].clicked    = 1;
            execs[0].clicked_at = new Date().toISOString();
            db.save();
            console.log(`[Campaign] ✓ Click recorded — campaign=${_wwCam} phone=${_knownPhone}`);
          }
        }
      }

      // Return full geo debug payload so browser console can show everything
      const ipSource = _cfIp ? 'cf-connecting-ip' : _fwdIp ? 'x-forwarded-for' : _realIp ? 'x-real-ip' : _reqIp ? 'req.ip' : 'socket';
      res.json({
        success: true,
        debug: {
          ip:            ip            || null,
          ipSource:      ipSource,
          city:          geo.city      || null,
          state:         geo.state     || null,
          country:       geo.country   || null,
          timezone:      geo.timezone  || null,
          language:      resolvedLanguage,
          session:       sessionId,
          geoApiStep:    geo._debug?.step         || null,
          geoApiCalled:  geo._debug?.apiCalled    ?? null,
          geoHttpStatus: geo._debug?.httpStatus   || null,
          geoApiUrl:     geo._debug?.apiUrl       || null,
          geoRawResponse: geo._debug?.rawResponse || null,
          geoError:      geo._debug?.error || geo._debug?.errorBody || null,
        }
      });
    } catch (e) { next(e); }
  },

  // ── Identify ──────────────────────────────────────────────────────────────
  async identify(req, res, next) {
    try {
      const db = getDb();
      const { channelId, sessionId, phone, email, name } = req.body;
      const cid = channelId || 'demo';
      const idx = db.website_visitors.findIndex(v => v.channel_id === cid && v.session_id === sessionId);
      if (idx >= 0) {
        // Track whether phone is being linked for the first time on this session
        const wasPhoneNull = !db.website_visitors[idx].phone;
        db.website_visitors[idx].phone = phone || db.website_visitors[idx].phone;
        db.website_visitors[idx].email = email || db.website_visitors[idx].email;
        db.website_visitors[idx].name  = name  || db.website_visitors[idx].name;

        // Identity resolution: mark ALL sessions for this phone as same user
        if (phone) {
          const allPhoneSessions = db.website_visitors.filter(v =>
            v.channel_id === cid && v.phone === phone
          );
          const visitCount = allPhoneSessions.length;
          const purchaseCount = (db.purchase_history || []).filter(p =>
            p.channel_id === cid && p.phone === phone
          ).length;
          if (visitCount > 1) {
            // Mark every session for this phone as repeat with correct counts
            allPhoneSessions.forEach(v => {
              const vi = db.website_visitors.findIndex(x => x.id === v.id);
              if (vi >= 0) {
                db.website_visitors[vi].is_repeat           = true;
                db.website_visitors[vi].visit_count          = visitCount;
                db.website_visitors[vi].total_purchase_count = purchaseCount;
              }
            });
          }
          // Backfill phone on all events for all sessions of this phone
          const allSessionIds = new Set(allPhoneSessions.map(v => v.session_id).filter(Boolean));
          db.cart_events.forEach(c => { if (allSessionIds.has(c.session_id) && !c.phone) c.phone = phone; });
          db.product_views.forEach(v => { if (allSessionIds.has(v.session_id) && !v.phone) v.phone = phone; });
          db.page_views && db.page_views.forEach(p => { if (allSessionIds.has(p.session_id) && !p.phone) p.phone = phone; });

          // Sync best status across all phone sessions to the current session
          _syncBestStatus(db, cid, idx, phone);

          // ── APV cycle re-entry recovery ─────────────────────────────────────
          // trackProductView ran before this identify set the phone, so the
          // lock-reset check (isReentry && v.phone) was skipped — v.phone was null.
          // Now that phone is linked on a product_view_lock session, check for a
          // stale APV lock that needs resetting so cycle 2+ can fire.
          const currVisitor = db.website_visitors[idx];
          if (wasPhoneNull && currVisitor.status === 'product_view_lock') {
            const hasActiveAPV = (db.abandoned_cart_campaigns || []).some(c =>
              c.campaign_type === 'abandoned_product_view' && c.is_active && c.channel_id !== 'demo'
            );
            if (hasActiveAPV) {
              const apvLock = (db.campaign_locks || []).find(l =>
                l.phone === phone &&
                l.campaign_type === 'abandoned_product_view' &&
                (l.lock_status === 'shifted_recommendation' ||
                 (l.lock_status === 'active' && (l.stage || 0) >= 1))
              );
              if (apvLock) {
                const now = new Date().toISOString();
                const cycleNum = (apvLock.cycle_count || 0) + 1;
                if (!apvLock.send_history) apvLock.send_history = [];
                apvLock.send_history.push({
                  cycle:          cycleNum,
                  product_name:   apvLock.product_name   || '',
                  stage1_sent_at: apvLock.stage_1_sent_at || null,
                  stage2_sent_at: apvLock.stage_2_sent_at || null,
                  archived_at:    now,
                  exit_reason:    'reentry_identify_new_session',
                });
                apvLock.cycle_count = cycleNum;
                (db.abandoned_cart_executions || []).forEach(x => {
                  if (String(x.campaign_id) === String(apvLock.campaign_id) &&
                      x.phone === phone &&
                      (x.status === 'sent' || x.status === 'failed' || x.status === 'reset_for_retry')) {
                    x.status = 'archived_reentry'; x.archived_at = now;
                  }
                });
                apvLock.stage           = 0;
                apvLock.stage_1_sent_at = null;
                apvLock.stage_2_sent_at = null;
                apvLock.lock_status     = 'active';
                apvLock.unlock_reason   = null;
                apvLock.shifted_at      = null;
                apvLock.reentry_at      = now;
                // Update product to current view if available
                const latestPV = (db.product_views || [])
                  .filter(pv => pv.phone === phone && pv.channel_id === cid)
                  .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
                if (latestPV?.product_url)   apvLock.product_url   = latestPV.product_url;
                if (latestPV?.product_name)  apvLock.product_name  = latestPV.product_name;
                if (latestPV?.product_image) apvLock.product_image = latestPV.product_image;
                if (latestPV?.product_price) apvLock.product_price = latestPV.product_price;
                // Reset product_view send flags so FLOW 2b / apvQuickCheck treats this as fresh
                (db.product_views || []).filter(pv => pv.phone === phone && pv.channel_id === cid)
                  .forEach(pv => { pv.whatsapp_sent = 0; pv.followup_count = 0; pv.whatsapp_sent_at = null; });
                console.log(`[APV Re-entry] ${phone} identified on new session → cycle ${cycleNum} reset, timer starts NOW`);
              } else {
                // No existing lock — first-time APV entry where phone was null when trackProductView
                // ran (race condition). Create a fresh stage-0 lock now that phone is known.
                const activeApvCampId = (db.abandoned_cart_campaigns || []).find(c =>
                  c.campaign_type === 'abandoned_product_view' && c.is_active && c.channel_id !== 'demo'
                );
                if (activeApvCampId) {
                  const now = new Date().toISOString();
                  const latestPV = (db.product_views || [])
                    .filter(pv => pv.phone === phone && pv.channel_id === cid)
                    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
                  if (!db.campaign_locks) db.campaign_locks = [];
                  db.campaign_locks.push({
                    id: `lock_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                    channel_id: cid, phone,
                    campaign_id: activeApvCampId.id, campaign_type: 'abandoned_product_view',
                    locked_at: latestPV?.created_at || now,
                    product_url: latestPV?.product_url || '', product_name: latestPV?.product_name || '',
                    product_price: latestPV?.product_price || '', product_image: latestPV?.product_image || '',
                    stage: 0, stage_1_sent_at: null, stage_2_sent_at: null,
                    lock_status: 'active', revenue: 0, cycle_count: 0,
                    last_status_check: now, last_known_status: 'product_view_lock',
                    unlock_reason: null,
                  });
                  console.log(`[APV] ${phone} → stage-0 lock created from identify (race condition recovery)`);
                }
              }
            }
          }
        }
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

      // Normalize products array — ensure each item has a consistent `url` field as unique key
      // product_url is the canonical unique identifier for a product (e.g. /products/blue-kurti)
      const rawArr = Array.isArray(products) ? products : [];
      const productsArr = rawArr.map(p => ({
        url:   cleanProductUrl(p.url || p.product_url || p.link || ''),  // ← clean unique key
        name:  p.name  || p.title || p.product_name || '',
        price: p.price != null ? String(p.price) : (p.product_price || ''),
        image: p.image || p.product_image || p.img || '',
        id:    p.id    || p.variant_id || '',
      }));

      // Clean top-level product_url too
      if (product_url) product_url = cleanProductUrl(product_url);

      // ── Cart Cleared: empty products + zero total → recover cart + downgrade status ──
      const cartIsCleared = productsArr.length === 0 && (!totalAmount || parseFloat(totalAmount) === 0);
      if (cartIsCleared) {
        const nowClear = new Date().toISOString();
        let cartCleared = false;
        db.cart_events.forEach(c => {
          if (c.channel_id === cid && (c.session_id === sessionId || (phone && c.phone === phone)) && !c.recovered) {
            c.recovered = 1; c.recovered_at = nowClear; c.recovery_reason = 'cart_cleared';
            cartCleared = true;
          }
        });
        if (cartCleared) {
          const stillHasCart = db.cart_events.some(c => c.channel_id === cid && c.phone === phone && !c.recovered);
          if (!stillHasCart) {
            const vIdx = db.website_visitors.findIndex(v =>
              v.channel_id === cid && (v.session_id === sessionId || (phone && v.phone === phone))
            );
            if (vIdx >= 0) {
              const hasRecentView = (db.product_views || []).some(v => v.channel_id === cid && (v.phone === phone || v.session_id === sessionId));
              const targetStatus = hasRecentView ? 'product_view' : 'active';
              downgradeStatus(db.website_visitors[vIdx], targetStatus);
              console.log(`[Cart] Cleared for ${phone || sessionId} → status downgraded to ${targetStatus}`);

              // APV timer restart: when cart is emptied the full delay must restart from NOW.
              // Without this, the timer continues from the original view time — so if 2 of 3
              // mins already elapsed before cart-add, only 1 min would remain after cart-clear.
              const hasActiveAPVCamp = phone && (db.abandoned_cart_campaigns || []).some(c =>
                c.campaign_type === 'abandoned_product_view' && c.is_active && c.channel_id !== 'demo'
              );
              if (hasActiveAPVCamp) {
                // Reset product_view timestamps → FLOW 2b timer anchor becomes NOW
                (db.product_views || []).filter(pv => pv.channel_id === cid && pv.phone === phone)
                  .forEach(pv => {
                    pv.created_at       = nowClear;
                    pv.whatsapp_sent    = 0;
                    pv.followup_count   = 0;
                    pv.whatsapp_sent_at = null;
                  });
                // Reset APV lock so stage 1 fires fresh (handles cart_added AND mid-stage active locks)
                const apvLock = (db.campaign_locks || []).find(l =>
                  l.phone === phone && l.channel_id === cid &&
                  l.campaign_type === 'abandoned_product_view' &&
                  ['active', 'cart_added'].includes(l.lock_status)
                );
                if (apvLock) {
                  if (!apvLock.send_history) apvLock.send_history = [];
                  apvLock.send_history.push({
                    cycle:          apvLock.cycle_count || 1,
                    stage1_sent_at: apvLock.stage_1_sent_at || null,
                    stage2_sent_at: apvLock.stage_2_sent_at || null,
                    archived_at:    nowClear,
                    exit_reason:    'cart_cleared_reentry',
                  });
                  (db.abandoned_cart_executions || []).forEach(x => {
                    if (String(x.campaign_id) === String(apvLock.campaign_id) &&
                        x.phone === phone &&
                        (x.status === 'sent' || x.status === 'failed' || x.status === 'reset_for_retry')) {
                      x.status = 'archived_reentry'; x.archived_at = nowClear;
                    }
                  });
                  apvLock.stage           = 0;
                  apvLock.stage_1_sent_at = null;
                  apvLock.stage_2_sent_at = null;
                  apvLock.lock_status     = 'active';
                  apvLock.unlock_reason   = null;
                  apvLock.reentry_at      = nowClear;
                  console.log(`[APV] ${phone} cart cleared — lock reset, full APV delay restarting from NOW`);
                }
              }
            }
          }
          db.save();
        }
        return res.json({ success: true, cart_cleared: true });
      }

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

      // ── Campaign attribution: stamp source_campaign_id if visitor clicked a campaign link recently ──
      const _cartVisitor = db.website_visitors.find(v =>
        v.channel_id === cid && (v.session_id === sessionId || (phone && v.phone === phone))
      );
      const ATTR_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h attribution window
      const _camAttr = (() => {
        if (!_cartVisitor?.last_click_campaign_id) return null;
        const clickedMs = _cartVisitor.last_click_at ? new Date(_cartVisitor.last_click_at).getTime() : 0;
        if (Date.now() - clickedMs > ATTR_WINDOW_MS) return null;
        return String(_cartVisitor.last_click_campaign_id);
      })();

      if (existingIdx >= 0) {
        // Always sync products array to reflect current cart state (including removals)
        db.cart_events[existingIdx].products     = JSON.stringify(productsArr);
        db.cart_events[existingIdx].total_amount = totalAmount || 0;
        db.cart_events[existingIdx].cart_url     = cart_url || db.cart_events[existingIdx].cart_url;
        // Top-level product_* fields always reflect the first remaining item in cart
        // so campaign audience shows what's actually still in the cart
        const curFirst = productsArr[0] || {};
        db.cart_events[existingIdx].product_name  = curFirst.name  || product_name  || db.cart_events[existingIdx].product_name;
        db.cart_events[existingIdx].product_image = curFirst.image || product_image || db.cart_events[existingIdx].product_image;
        db.cart_events[existingIdx].product_price = curFirst.price || product_price || db.cart_events[existingIdx].product_price;
        db.cart_events[existingIdx].product_url   = curFirst.url   || product_url   || db.cart_events[existingIdx].product_url;
        if (_camAttr && !db.cart_events[existingIdx].source_campaign_id) {
          db.cart_events[existingIdx].source_campaign_id = _camAttr;
        }
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
          source_campaign_id: _camAttr || null,
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
      const { channelId, sessionId, phone, orderId, products, totalAmount, currency } = req.body;
      const cid = channelId || 'demo';

      // Avoid duplicate purchase records for same order
      const existing = orderId
        ? db.purchase_history.find(p => p.channel_id === cid && p.order_id === String(orderId))
        : null;

      if (!existing) {
        // Campaign attribution: stamp source_campaign_id if visitor clicked a campaign link recently
        const _purchVisitor = db.website_visitors.find(v =>
          v.channel_id === cid && (v.session_id === sessionId || (phone && v.phone === phone))
        );
        const _purchAttr = (() => {
          if (!_purchVisitor?.last_click_campaign_id) return null;
          const clickedMs = _purchVisitor.last_click_at ? new Date(_purchVisitor.last_click_at).getTime() : 0;
          if (Date.now() - clickedMs > 24 * 60 * 60 * 1000) return null;
          return String(_purchVisitor.last_click_campaign_id);
        })();

        db.purchase_history.push({
          id:           (db.purchase_history.length || 0) + 1,
          channel_id:   cid,
          session_id:   sessionId,
          phone:        phone    || null,
          order_id:     orderId  || null,
          products:     JSON.stringify(products || []),
          total_amount: totalAmount || 0,
          currency:     currency || null,
          purchased_at: new Date().toISOString(),
          source_campaign_id: _purchAttr || null,
        });
        console.log(`[Purchase] Order ${orderId || 'N/A'} — ₹${totalAmount || 0} — phone=${phone || 'unknown'} session=${sessionId}${_purchAttr ? ` — attributed to campaign ${_purchAttr}` : ''}`);
      } else {
        console.log(`[Purchase] Duplicate order ${orderId} — skipped`);
      }

      // Mark all cart events recovered + set visitor status → purchased
      this._markRecovered(db, channelId, sessionId, phone);
      db.save();

      res.json({ success: true });
    } catch (e) { next(e); }
  },

  _markRecovered(db, channelId, sessionId, phone) {
    const cid = channelId || 'demo';
    const now = new Date().toISOString();

    // Mark all matching cart events as recovered
    db.cart_events.forEach(c => {
      if (c.channel_id === cid && (c.session_id === sessionId || (phone && c.phone === phone))) {
        if (!c.recovered) {
          c.recovered    = 1;
          c.recovered_at = now;
        }
      }
    });

    // Update visitor: status → purchased + purchase tracking fields
    const vIdx = db.website_visitors.findIndex(v =>
      v.channel_id === cid && (v.session_id === sessionId || (phone && v.phone === phone))
    );

    if (vIdx >= 0) {
      const v = db.website_visitors[vIdx];

      // Increment purchase_count (exact number of purchases this user made)
      const newCount = (v.purchase_count || 0) + 1;
      v.purchase_count       = newCount;
      v.last_purchased_at    = now;
      // is_repeat_purchaser = true from 2nd purchase onwards
      if (newCount >= 2) v.is_repeat_purchaser = true;

      console.log(`[Purchase] ${phone || sessionId} — purchase_count=${newCount}${newCount >= 2 ? ' (repeat purchaser)' : ''}`);

      // Upgrade status to purchased (also resets funnel_cycle if coming from a re-entry)
      upgradeStatus(v, 'purchased');
    } else {
      // Create minimal visitor record so dashboard shows the purchase
      db.website_visitors.push({
        id:                   (db.website_visitors.length || 0) + 1,
        channel_id:           cid,
        session_id:           sessionId,
        phone:                phone || null,
        status:               'purchased',
        purchase_count:       1,
        last_purchased_at:    now,
        is_repeat_purchaser:  false,
        funnel_cycle:         1,
        page_views:           1,
        visited_at:           now,
        created_at:           now,
        updated_at:           now,
      });
    }
  },

  async trackProduct(req, res, next) {
    try {
      const db = getDb();
      const { channelId, sessionId, product, eventType, currency } = req.body;
      let { product_name, product_image, product_url, product_price } = req.body;
      const cid = channelId || 'demo';

      // Strip query params from URL before storing
      if (product_url) product_url = cleanProductUrl(product_url);

      // ── Slug gate: only track URLs matching configured product_url_slug ────
      {
        const settingsRow = (db.channel_settings || []).find(s => s.channel_id === cid);
        const chSettings = settingsRow ? (() => { try { return JSON.parse(settingsRow.settings || '{}'); } catch(_) { return {}; } })() : {};
        const productSlug = (chSettings.product_url_slug || '/products').replace(/\/+$/, '');
        if (product_url && productSlug && !product_url.includes(productSlug)) {
          console.warn(`[Track] Product view SKIPPED — URL "${product_url}" does not contain slug "${productSlug}". Update product_url_slug in Settings if this is a real product page.`);
          return res.json({ success: true, skipped: true, reason: 'URL does not match product_url_slug' });
        }
      }

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
        const v = db.website_visitors[vIdx];
        v.last_product_name  = product_name  || v.last_product_name;
        v.last_product_image = product_image || v.last_product_image;
        v.last_product_url   = product_url   || v.last_product_url;
        v.last_product_price = product_price || v.last_product_price;

        // Only upgrade to product_view if user has NO active cart items.
        // Exception: post-cycle statuses (product_recommendation, followup_complete) completed
        // the APV loop WITHOUT adding to cart — stale carts from prior cycles must not block re-entry.
        const isPostCycle = v.status === 'product_recommendation' || v.status === 'followup_complete';
        const hasActiveCart = !isPostCycle && db.cart_events.some(c =>
          c.channel_id === cid &&
          (c.session_id === sessionId || (v.phone && c.phone === v.phone)) &&
          !c.recovered
        );
        if (hasActiveCart) {
          console.log(`[Status] product_view blocked for ${v.phone || sessionId} — active cart exists, keeping abandoned_cart`);
        } else {
          const prevStatus = v.status;
          const now = new Date().toISOString();

          // If an active APV campaign exists, immediately set product_view_lock on the
          // main status — no 60-second wait for the automation loop to claim the user.
          const hasActiveAPV = (db.abandoned_cart_campaigns || []).some(c =>
            c.campaign_type === 'abandoned_product_view' && c.is_active && c.channel_id !== 'demo'
          );

          if (hasActiveAPV) {
            // Phone-level re-entry check: detect completed APV cycle regardless of which
            // session is making the request. Handles same-session AND cross-session cases.
            const phoneCompletedAPV = v.phone
              ? (db.website_visitors || []).some(other =>
                  other.phone === v.phone && other.channel_id === cid &&
                  (other.status === 'product_recommendation' || other.status === 'followup_complete'))
              : false;
            // Also check if this phone has a lock that completed (shifted_recommendation with stage=2)
            const completedLock = v.phone
              ? (db.campaign_locks || []).find(l =>
                  l.phone === v.phone &&
                  l.campaign_type === 'abandoned_product_view' &&
                  (l.lock_status === 'shifted_recommendation' || (l.lock_status === 'active' && l.stage >= 2)))
              : null;
            // Mid-campaign re-entry: phone has active lock at stage 1 (stage 1 sent, stage 2 pending).
            // A new device/session viewing a product should reset the entire cycle — prevStatus is
            // 'active' for the new session so the checks above miss this case.
            const inProgressLock = v.phone
              ? (db.campaign_locks || []).find(l =>
                  l.phone === v.phone &&
                  l.campaign_type === 'abandoned_product_view' &&
                  l.lock_status === 'active' && l.stage >= 1)
              : null;
            // Pending-lock re-entry: phone has active lock at stage 0 (countdown running, stage 1
            // not yet sent). New browser session / tab views a different product — prevStatus is
            // 'active' so the checks above miss this. Treat as re-entry so the lock is reset with
            // the new product and a fresh delay.
            const pendingLock = v.phone
              ? (db.campaign_locks || []).find(l =>
                  l.phone === v.phone &&
                  l.campaign_type === 'abandoned_product_view' &&
                  l.lock_status === 'active' && (l.stage || 0) === 0)
              : null;
            const isReentry = prevStatus === 'product_view_lock' || prevStatus === 'product_recommendation'
              || prevStatus === 'followup_complete'
              || phoneCompletedAPV || !!completedLock || !!inProgressLock || !!pendingLock;

            // Post-cycle re-entry: increment funnel_cycle
            if (prevStatus === 'product_recommendation' || prevStatus === 'followup_complete' ||
                prevStatus === 'purchased' || phoneCompletedAPV) {
              v.funnel_cycle = (v.funnel_cycle || 1) + 1;
            }
            v.status     = 'product_view_lock';
            v.updated_at = now;

            if (isReentry && v.phone) {
              // Find the active APV lock for this phone (any resettable status)
              const apvLock = (db.campaign_locks || []).find(l =>
                l.phone === v.phone &&
                l.campaign_type === 'abandoned_product_view' &&
                ['active', 'shifted_recommendation'].includes(l.lock_status)
              );
              const _cleanUrl = (u) => { try { return u ? new URL(u).origin + new URL(u).pathname : ''; } catch { return (u || '').split('?')[0]; } };
              // 15-second cooldown guard: only blocks reset when the SAME product was just seen
              // (prevents duplicate tracker fires on page-reload/SPA navigation for the same URL).
              // A genuinely DIFFERENT product URL always restarts the cycle immediately — the user
              // is signalling a new intent and we want the fresh product + fresh delay.
              const _lockAnchor = apvLock && (apvLock.reentry_at || apvLock.locked_at);
              const _isRecentFire = _lockAnchor && (Date.now() - new Date(_lockAnchor).getTime()) < 15_000;
              const _isSameProduct = product_url && apvLock?.product_url &&
                _cleanUrl(product_url) === _cleanUrl(apvLock.product_url);
              const _recentLock = _isRecentFire && _isSameProduct;
              if (apvLock && !_recentLock) {
                const cycleNum = (apvLock.cycle_count || 0) + 1;
                if (!apvLock.send_history) apvLock.send_history = [];
                apvLock.send_history.push({
                  cycle:            cycleNum,
                  product_name:     apvLock.product_name    || '',
                  product_url:      apvLock.product_url     || '',
                  stage1_sent_at:   apvLock.stage_1_sent_at || null,
                  stage2_sent_at:   apvLock.stage_2_sent_at || null,
                  archived_at:      now,
                  exit_reason:      prevStatus === 'product_view_lock' ? 'reentry_new_product'
                                    : (inProgressLock && prevStatus !== 'product_view_lock') ? 'reentry_cross_device'
                                    : 'reentry_after_completion',
                  reentry_product:  product_name || product_url || '',
                  reentry_from_status: prevStatus,
                });
                apvLock.cycle_count     = cycleNum;
                (db.abandoned_cart_executions || []).forEach(x => {
                  if (String(x.campaign_id) === String(apvLock.campaign_id) &&
                      x.phone === v.phone &&
                      (x.status === 'sent' || x.status === 'failed' || x.status === 'reset_for_retry')) {
                    x.status = 'archived_reentry'; x.archived_at = now;
                  }
                });
                apvLock.stage           = 0;
                apvLock.stage_1_sent_at = null;
                apvLock.stage_2_sent_at = null;
                apvLock.lock_status     = 'active';
                apvLock.unlock_reason   = null;
                apvLock.shifted_at      = null;
                apvLock.reentry_at      = now;
                // Update product to the CURRENT view. If URL changes, clear stale name/image
                // so the audience falls back to the fresh product_view record (which will be
                // populated by the background scrape). Look for the best available data across
                // all sessions for this phone+URL before clearing.
                const newUrl = product_url || apvLock.product_url;
                const urlChanged = product_url && product_url !== apvLock.product_url;
                const bestPV = urlChanged
                  ? (db.product_views || [])
                      .filter(pv => pv.channel_id === cid && pv.product_url === product_url &&
                        (pv.phone === v.phone ||
                         (db.website_visitors.find(vis => vis.session_id === pv.session_id && vis.channel_id === cid))?.phone === v.phone))
                      .sort((a, b) => ((b.product_name ? 1 : 0) - (a.product_name ? 1 : 0)) || (new Date(b.created_at) - new Date(a.created_at)))[0]
                  : null;
                apvLock.product_url   = newUrl;
                apvLock.product_name  = product_name  || bestPV?.product_name  || (urlChanged ? '' : apvLock.product_name);
                apvLock.product_image = product_image || bestPV?.product_image  || (urlChanged ? '' : apvLock.product_image);
                apvLock.product_price = product_price || bestPV?.product_price  || apvLock.product_price;
                console.log(`[APV Re-entry] ${v.phone} ${prevStatus} → product_view_lock — cycle ${cycleNum}, product: "${apvLock.product_name || apvLock.product_url}", timer starts NOW`);
              } else if (_recentLock) {
                console.log(`[APV] ${v.phone || sessionId} → duplicate fire guard (same product, lock set ${Math.round((Date.now()-new Date(_lockAnchor).getTime())/1000)}s ago) — skipping`);
              } else {
                // apvLock null: lock has a non-resettable status (cart_added/purchased)
                // or is missing. Forcibly archive stale execs and ensure a stage-0 lock
                // exists so apvQuickCheck can fire the new cycle.
                const activeApvCamp = (db.abandoned_cart_campaigns || []).find(c =>
                  c.campaign_type === 'abandoned_product_view' && c.is_active && c.channel_id !== 'demo'
                );
                if (activeApvCamp) {
                  (db.abandoned_cart_executions || []).forEach(x => {
                    if (String(x.campaign_id) === String(activeApvCamp.id) &&
                        x.phone === v.phone &&
                        (x.status === 'sent' || x.status === 'failed' || x.status === 'reset_for_retry')) {
                      x.status = 'archived_reentry'; x.archived_at = now;
                    }
                  });
                  const forceResetLock = (db.campaign_locks || []).find(l =>
                    l.phone === v.phone && String(l.campaign_id) === String(activeApvCamp.id)
                  );
                  if (forceResetLock) {
                    const prevLockStatus = forceResetLock.lock_status;
                    if (!forceResetLock.send_history) forceResetLock.send_history = [];
                    forceResetLock.send_history.push({
                      cycle: (forceResetLock.cycle_count || 0) + 1,
                      stage1_sent_at: forceResetLock.stage_1_sent_at || null,
                      stage2_sent_at: forceResetLock.stage_2_sent_at || null,
                      archived_at: now, exit_reason: 'reentry_forced_reset',
                      reentry_from_status: prevStatus,
                    });
                    forceResetLock.cycle_count     = (forceResetLock.cycle_count || 0) + 1;
                    forceResetLock.stage           = 0;
                    forceResetLock.stage_1_sent_at = null;
                    forceResetLock.stage_2_sent_at = null;
                    forceResetLock.lock_status     = 'active';
                    forceResetLock.unlock_reason   = null;
                    forceResetLock.shifted_at      = null;
                    forceResetLock.reentry_at      = now;
                    if (product_url)   forceResetLock.product_url   = product_url;
                    if (product_name)  forceResetLock.product_name  = product_name;
                    if (product_image) forceResetLock.product_image = product_image;
                    if (product_price) forceResetLock.product_price = product_price;
                    console.log(`[APV Re-entry] ${v.phone} forced lock reset (was "${prevLockStatus}") from ${prevStatus} — timer starts NOW`);
                  } else {
                    if (!db.campaign_locks) db.campaign_locks = [];
                    db.campaign_locks.push({
                      id: `lock_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                      channel_id: cid, phone: v.phone,
                      campaign_id: activeApvCamp.id, campaign_type: 'abandoned_product_view',
                      locked_at: now, reentry_at: now,
                      product_url: product_url || '', product_name: product_name || '',
                      product_price: product_price || '', product_image: product_image || '',
                      stage: 0, stage_1_sent_at: null, stage_2_sent_at: null,
                      lock_status: 'active', revenue: 0,
                      last_status_check: now, last_known_status: 'product_view_lock',
                      unlock_reason: null, cycle_count: 1,
                    });
                    console.log(`[APV Re-entry] ${v.phone} created fresh lock from ${prevStatus} (no prior lock) — timer starts NOW`);
                  }
                } else {
                  console.log(`[APV] ${v.phone || sessionId} → product_view_lock (re-entry, no active APV camp) from ${prevStatus}`);
                }
              }
              // Always reset product_view send flags on re-entry so FLOW 2b treats this as fresh
              (db.product_views || []).filter(pv => pv.phone === v.phone && pv.channel_id === cid)
                .forEach(pv => { pv.whatsapp_sent = 0; pv.followup_count = 0; pv.whatsapp_sent_at = null; });
              // Cross-session cleanup: reset other sessions for this phone stuck at
              // product_recommendation so contacts dedup shows the new product_view_lock
              (db.website_visitors || []).forEach(other => {
                if (other !== v && other.phone === v.phone && other.channel_id === cid &&
                    (other.status === 'product_recommendation' || other.status === 'followup_complete')) {
                  other.status = 'active';
                  other.updated_at = now;
                }
              });
            } else {
              console.log(`[APV] ${v.phone || sessionId} → product_view_lock immediately (from ${prevStatus})`);
              // First-time APV entry with phone already known: create stage-0 lock immediately so
              // apvQuickCheck can fire after the configured delay. Without this, apvQuickCheck
              // finds no lock and the message never sends ("sending now" forever).
              if (v.phone) {
                const activeApvCampFT = (db.abandoned_cart_campaigns || []).find(c =>
                  c.campaign_type === 'abandoned_product_view' && c.is_active && c.channel_id !== 'demo'
                );
                if (activeApvCampFT) {
                  const existingFTLock = (db.campaign_locks || []).find(l =>
                    l.phone === v.phone && String(l.campaign_id) === String(activeApvCampFT.id) &&
                    ['active', 'shifted_recommendation'].includes(l.lock_status)
                  );
                  if (!existingFTLock) {
                    if (!db.campaign_locks) db.campaign_locks = [];
                    db.campaign_locks.push({
                      id: `lock_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                      channel_id: cid, phone: v.phone,
                      campaign_id: activeApvCampFT.id, campaign_type: 'abandoned_product_view',
                      locked_at: now,
                      product_url: product_url || '', product_name: product_name || '',
                      product_price: product_price || '', product_image: product_image || '',
                      stage: 0, stage_1_sent_at: null, stage_2_sent_at: null,
                      lock_status: 'active', revenue: 0, cycle_count: 0,
                      last_status_check: now, last_known_status: 'product_view_lock',
                      unlock_reason: null,
                    });
                    console.log(`[APV] ${v.phone} → stage-0 lock created for first-time APV entry`);
                  }
                }
              }
            }
          } else {
            // No active APV campaign — standard status upgrade
            upgradeStatus(v, 'product_view');

            // Safety net: if user was in APV when campaign is now paused/deleted, reset lock.
            // Phone-level check handles cross-device: if any session for this phone was at
            // product_recommendation, reset the lock and clean up other sessions.
            const phoneWasInAPV = v.phone && (db.website_visitors || []).some(other =>
              other.phone === v.phone && other.channel_id === cid &&
              (other.status === 'product_view_lock' || other.status === 'product_recommendation')
            );
            const wasInAPV = prevStatus === 'product_view_lock' || prevStatus === 'product_recommendation' || phoneWasInAPV;
            if (wasInAPV && v.phone) {
              const apvLock = (db.campaign_locks || []).find(l =>
                l.phone === v.phone && l.channel_id === cid &&
                l.campaign_type === 'abandoned_product_view' &&
                ['active', 'shifted_recommendation'].includes(l.lock_status)
              );
              if (apvLock) {
                const cycleNum = (apvLock.cycle_count || 0) + 1;
                if (!apvLock.send_history) apvLock.send_history = [];
                apvLock.send_history.push({
                  cycle:           cycleNum,
                  product_name:    apvLock.product_name    || '',
                  product_url:     apvLock.product_url     || '',
                  stage1_sent_at:  apvLock.stage_1_sent_at || null,
                  stage2_sent_at:  apvLock.stage_2_sent_at || null,
                  archived_at:     new Date().toISOString(),
                  exit_reason:     'reentry_no_active_apv',
                  reentry_product: product_name || product_url || '',
                });
                apvLock.cycle_count     = cycleNum;
                (db.abandoned_cart_executions || []).forEach(x => {
                  if (String(x.campaign_id) === String(apvLock.campaign_id) &&
                      x.phone === v.phone &&
                      (x.status === 'sent' || x.status === 'failed' || x.status === 'reset_for_retry')) {
                    x.status = 'archived_reentry'; x.archived_at = new Date().toISOString();
                  }
                });
                apvLock.stage           = 0;
                apvLock.stage_1_sent_at = null;
                apvLock.stage_2_sent_at = null;
                apvLock.lock_status     = 'active';
                apvLock.unlock_reason   = null;
                apvLock.shifted_at      = null;
                apvLock.reentry_at      = new Date().toISOString();
                if (product_url)   apvLock.product_url   = product_url;
                if (product_name)  apvLock.product_name  = product_name;
                if (product_image) apvLock.product_image = product_image;
                if (product_price) apvLock.product_price = product_price;
                (db.product_views || []).filter(pv => pv.phone === v.phone && pv.channel_id === cid)
                  .forEach(pv => { pv.whatsapp_sent = 0; pv.followup_count = 0; pv.whatsapp_sent_at = null; });
                console.log(`[APV Re-entry] ${v.phone} ${prevStatus} → product_view — lock reset`);
              }
              // Cross-session cleanup: reset other sessions for this phone at product_recommendation
              (db.website_visitors || []).forEach(other => {
                if (other !== v && other.phone === v.phone && other.channel_id === cid &&
                    (other.status === 'product_recommendation' || other.status === 'followup_complete')) {
                  other.status = 'active';
                  other.updated_at = new Date().toISOString();
                }
              });
            }
          }
        }
      } else {
        // ── CREATE visitor on-the-fly when product event arrives before trackVisitor ──
        const now = new Date().toISOString();
        const hasActiveAPV = (db.abandoned_cart_campaigns || []).some(c =>
          c.campaign_type === 'abandoned_product_view' && c.is_active && c.channel_id !== 'demo'
        );
        db.website_visitors.push({
          id:           (db.website_visitors.length || 0) + 1,
          channel_id:   cid,
          session_id:   sessionId,
          phone:        visitor?.phone || null,
          status:       hasActiveAPV ? 'product_view_lock' : 'product_view',
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
        console.log(`[Visitor] Auto-created on product view — status=${hasActiveAPV ? 'product_view_lock' : 'product_view'} session=${sessionId}`);
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

        // ── Identity resolution: mark ALL sessions for this phone as same user ──
        if (phone) {
          const allPhoneSessions = db.website_visitors.filter(v =>
            v.channel_id === cid && v.phone === phone
          );
          const visitCount = allPhoneSessions.length;
          const purchaseCount = (db.purchase_history || []).filter(p =>
            p.channel_id === cid && p.phone === phone
          ).length;
          if (visitCount > 1) {
            allPhoneSessions.forEach(v => {
              const vi = db.website_visitors.findIndex(x => x.id === v.id);
              if (vi >= 0) {
                db.website_visitors[vi].is_repeat           = true;
                db.website_visitors[vi].visit_count          = visitCount;
                db.website_visitors[vi].total_purchase_count = purchaseCount;
              }
            });
          }
          // Backfill phone on all events across all sessions of this phone
          const allSessionIds = new Set(allPhoneSessions.map(v => v.session_id).filter(Boolean));
          db.cart_events.forEach(c => { if (allSessionIds.has(c.session_id) && !c.phone) c.phone = phone; });
          db.product_views.forEach(v => { if (allSessionIds.has(v.session_id) && !v.phone) v.phone = phone; });
          db.page_views && db.page_views.forEach(p => { if (allSessionIds.has(p.session_id) && !p.phone) p.phone = phone; });
        }
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
        // Resolve phone from session → visitor record
        const visitor = (db.website_visitors || []).find(v => v.channel_id === cid && v.session_id === sessionId);
        const phone = visitor?.phone || null;
        // Only mark clicked when we know the phone — prevents wrong-user attribution
        if (phone) {
          const execs = (db.abandoned_cart_executions || []).filter(e =>
            String(e.campaign_id) === String(campaignId) && e.phone === phone
          ).sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at));
          if (execs.length > 0 && !execs[0].clicked) {
            execs[0].clicked = 1;
            execs[0].clicked_at = new Date().toISOString();
            console.log(`[Campaign] trackClick ✓ campaign=${campaignId} phone=${phone}`);
          }
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

  // ── Timezone → Geo fallback (used when IP is local/private) ─────────────
  // Maps IANA timezone → { city, state, country, countryCode }
  // Covers all major Indian cities + global zones.
  _geoFromTimezone(tz, step, ip) {
    const TZ_MAP = {
      // ── India ──
      'Asia/Kolkata':   { city: 'Mumbai',      state: 'Maharashtra',  country: 'India',          countryCode: 'IN' },
      'Asia/Calcutta':  { city: 'Kolkata',      state: 'West Bengal',  country: 'India',          countryCode: 'IN' },
      // ── USA ──
      'America/New_York':    { city: 'New York',    state: 'New York',      country: 'United States', countryCode: 'US' },
      'America/Chicago':     { city: 'Chicago',     state: 'Illinois',      country: 'United States', countryCode: 'US' },
      'America/Denver':      { city: 'Denver',      state: 'Colorado',      country: 'United States', countryCode: 'US' },
      'America/Los_Angeles': { city: 'Los Angeles', state: 'California',    country: 'United States', countryCode: 'US' },
      'America/Phoenix':     { city: 'Phoenix',     state: 'Arizona',       country: 'United States', countryCode: 'US' },
      'America/Anchorage':   { city: 'Anchorage',   state: 'Alaska',        country: 'United States', countryCode: 'US' },
      'Pacific/Honolulu':    { city: 'Honolulu',    state: 'Hawaii',        country: 'United States', countryCode: 'US' },
      // ── UK / Europe ──
      'Europe/London':   { city: 'London',     state: 'England',      country: 'United Kingdom', countryCode: 'GB' },
      'Europe/Paris':    { city: 'Paris',      state: 'Île-de-France',country: 'France',         countryCode: 'FR' },
      'Europe/Berlin':   { city: 'Berlin',     state: 'Berlin',       country: 'Germany',        countryCode: 'DE' },
      'Europe/Rome':     { city: 'Rome',       state: 'Lazio',        country: 'Italy',          countryCode: 'IT' },
      'Europe/Madrid':   { city: 'Madrid',     state: 'Madrid',       country: 'Spain',          countryCode: 'ES' },
      'Europe/Moscow':   { city: 'Moscow',     state: 'Moscow',       country: 'Russia',         countryCode: 'RU' },
      // ── Middle East ──
      'Asia/Dubai':      { city: 'Dubai',      state: 'Dubai',        country: 'UAE',            countryCode: 'AE' },
      'Asia/Riyadh':     { city: 'Riyadh',     state: 'Riyadh',       country: 'Saudi Arabia',   countryCode: 'SA' },
      // ── Asia Pacific ──
      'Asia/Singapore':  { city: 'Singapore',  state: 'Singapore',    country: 'Singapore',      countryCode: 'SG' },
      'Asia/Tokyo':      { city: 'Tokyo',      state: 'Tokyo',        country: 'Japan',          countryCode: 'JP' },
      'Asia/Shanghai':   { city: 'Shanghai',   state: 'Shanghai',     country: 'China',          countryCode: 'CN' },
      'Asia/Hong_Kong':  { city: 'Hong Kong',  state: 'Hong Kong',    country: 'China',          countryCode: 'HK' },
      'Asia/Seoul':      { city: 'Seoul',      state: 'Seoul',        country: 'South Korea',    countryCode: 'KR' },
      'Asia/Bangkok':    { city: 'Bangkok',    state: 'Bangkok',      country: 'Thailand',       countryCode: 'TH' },
      'Asia/Jakarta':    { city: 'Jakarta',    state: 'Jakarta',      country: 'Indonesia',      countryCode: 'ID' },
      'Asia/Karachi':    { city: 'Karachi',    state: 'Sindh',        country: 'Pakistan',       countryCode: 'PK' },
      'Asia/Dhaka':      { city: 'Dhaka',      state: 'Dhaka',        country: 'Bangladesh',     countryCode: 'BD' },
      'Asia/Colombo':    { city: 'Colombo',    state: 'Western',      country: 'Sri Lanka',      countryCode: 'LK' },
      'Asia/Kathmandu':  { city: 'Kathmandu',  state: 'Bagmati',      country: 'Nepal',          countryCode: 'NP' },
      // ── Australia ──
      'Australia/Sydney':   { city: 'Sydney',    state: 'New South Wales', country: 'Australia', countryCode: 'AU' },
      'Australia/Melbourne':{ city: 'Melbourne', state: 'Victoria',        country: 'Australia', countryCode: 'AU' },
      'Australia/Brisbane': { city: 'Brisbane',  state: 'Queensland',      country: 'Australia', countryCode: 'AU' },
      'Australia/Perth':    { city: 'Perth',     state: 'Western Australia',country: 'Australia',countryCode: 'AU' },
      // ── Canada ──
      'America/Toronto':    { city: 'Toronto',   state: 'Ontario',      country: 'Canada',         countryCode: 'CA' },
      'America/Vancouver':  { city: 'Vancouver', state: 'British Columbia',country: 'Canada',      countryCode: 'CA' },
    };

    const geo = tz ? TZ_MAP[tz] : null;
    if (geo) {
      console.log(`[Geo] Timezone fallback "${tz}" → ${geo.city}, ${geo.state}, ${geo.country}`);
      return { ...geo, timezone: tz, _debug: { step: step + '_tz_fallback', ip: ip || null, apiCalled: false, timezone: tz, resolved: geo } };
    }

    // If timezone not in map, at least use it as timezone field with Unknown city
    if (tz) {
      // Try to infer country from timezone prefix (Asia/*, Europe/*, America/*, etc.)
      const prefix = tz.split('/')[0];
      const prefixCountry = { 'America': 'Americas', 'Europe': 'Europe', 'Asia': 'Asia', 'Africa': 'Africa', 'Pacific': 'Pacific', 'Australia': 'Australia' }[prefix] || 'Unknown';
      console.log(`[Geo] Timezone "${tz}" not in map — using prefix region "${prefixCountry}"`);
      return { city: 'Unknown', state: 'Unknown', country: prefixCountry, countryCode: '🌐', timezone: tz,
               _debug: { step: step + '_tz_prefix', ip: ip || null, apiCalled: false, timezone: tz } };
    }

    console.log('[Geo] No IP, no timezone — full fallback');
    return { city: 'Unknown', state: 'Unknown', country: 'Unknown', countryCode: '🌐', timezone: 'UTC',
             _debug: { step: step + '_no_data', ip: ip || null, apiCalled: false } };
  },

  // ── Private Geo-IP Engine ─────────────────────────────────────────────────
  // Returns { city, state, country, countryCode, timezone, _debug }
  // _debug carries the full raw API response + status so the frontend can log it.
  async _getGeoData(ip, browserTimezone) {
    const fallback = { city: 'Unknown', state: 'Unknown', country: 'Unknown', countryCode: '🌐', timezone: 'UTC' };

    if (!ip) {
      console.log('[Geo] No IP — using timezone fallback');
      return this._geoFromTimezone(browserTimezone, 'no_ip');
    }

    // Strip IPv4-mapped IPv6 (::ffff:1.2.3.4 → 1.2.3.4)
    // Strip brackets from [::1] style IPv6
    // Pure IPv6 (mobile) kept as-is — ip-api.com supports it
    let cleanIp = ip
      .replace(/^::ffff:/i, '')
      .replace(/^\[/, '')
      .replace(/\]$/, '');
    const ipType = /^[\da-fA-F:]+$/.test(cleanIp) && cleanIp.includes(':') ? 'IPv6 (mobile)' : 'IPv4 (desktop)';
    console.log(`[Geo] IP: "${cleanIp}" — ${ipType}`);

    if (
      cleanIp === '127.0.0.1' || cleanIp === '::1' || cleanIp === 'localhost' ||
      cleanIp.startsWith('192.168.') || cleanIp.startsWith('10.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(cleanIp) ||
      cleanIp.startsWith('fc') || cleanIp.startsWith('fd')
    ) {
      console.log('[Geo] Local/private IP — using browser timezone fallback');
      return this._geoFromTimezone(browserTimezone, 'local_ip', cleanIp);
    }

    // ip-api.com: free, no API key, no Cloudflare, works from servers
    // IPv6 MUST be passed raw in the path — encodeURIComponent breaks colons
    // e.g. 2601:647::1 → must stay as-is, NOT 2601%3A647%3A%3A1
    const url = `http://ip-api.com/json/${cleanIp}?fields=status,message,city,regionName,country,countryCode,timezone`;
    console.log(`[Geo] → GET ${url}`);

    try {
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });

      console.log(`[Geo] ← HTTP ${response.status}`);

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[Geo] API error ${response.status}:`, errText);
        return { ...fallback, _debug: { step: 'api_error', ip: cleanIp, apiCalled: true, httpStatus: response.status, errorBody: errText } };
      }

      const data = await response.json();
      console.log('[Geo] Raw response:', JSON.stringify(data));

      // ip-api.com returns status:"fail" for invalid IPs
      if (data.status === 'fail') {
        console.warn(`[Geo] ip-api.com fail: ${data.message}`);
        return { ...fallback, _debug: { step: 'api_fail', ip: cleanIp, apiCalled: true, httpStatus: response.status, rawResponse: data } };
      }

      // ip-api.com fields: city, regionName, country, countryCode, timezone
      const result = {
        city:        data.city        || null,
        state:       data.regionName  || null,
        country:     data.country     || null,
        countryCode: data.countryCode || null,
        timezone:    data.timezone    || null,
        _debug: {
          step:        'success',
          ip:          cleanIp,
          apiCalled:   true,
          httpStatus:  response.status,
          apiUrl:      url,
          rawResponse: data,
        },
      };
      console.log('[Geo] Parsed:', { city: result.city, state: result.state, country: result.country, timezone: result.timezone });
      return result;
    } catch (e) {
      console.error('[Geo] Fetch error:', e.message);
      return { ...fallback, _debug: { step: 'fetch_error', ip: cleanIp, apiCalled: true, error: e.message } };
    }
  }
};
