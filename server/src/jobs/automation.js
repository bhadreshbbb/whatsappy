import { whatsappService } from '../services/whatsapp.service.js';
import { getDb } from '../services/database.js';
import { aiService } from '../services/ai.service.js';
import { translateComponents } from '../services/translate.service.js';
import { saveChatMessage } from '../controllers/chat.controller.js';
import { upgradeStatus } from '../utils/statusMachine.js';
import { computeHotProducts, buildSendMessagePayload, scrapeProductData, LANG_MAP, autoRefreshPendingStatuses, buildAutoProductCards } from '../controllers/meta-templates.controller.js';
import { v4 as uuidv4 } from 'uuid';

let cronInterval;
let productDetectionInterval;
let productRefreshInterval;
let templateStatusInterval;
let lockCheckInterval;
let _productCycleOffset = 0;

// Returns true if the given channelId has valid WhatsApp credentials in channel_settings.
function hasValidCredentials(db, channelId) {
  const row = (db.channel_settings || []).find(r => r.channel_id === channelId);
  if (!row) return false;
  try {
    const s = JSON.parse(row.settings || '{}');
    return !!(s.whatsapp_token && s.whatsapp_phone_id);
  } catch (_) { return false; }
}

// Returns the real user-owned channel that has WhatsApp credentials.
// Prefers channels that have a user account (ignores orphaned / stale credentials).
function getPrimaryChannelId(db) {
  const rows = db.channel_settings || [];

  // Priority 1: a channel that has BOTH a user account AND credentials
  const userChannels = (db.users || [])
    .map(u => u.channel_id)
    .filter(c => c && c !== 'demo');
  for (const cid of userChannels) {
    const row = rows.find(r => r.channel_id === cid);
    if (!row) continue;
    try {
      const s = JSON.parse(row.settings || '{}');
      if (s.whatsapp_token && s.whatsapp_phone_id) return cid;
    } catch (_) {}
  }

  // Priority 2: first non-demo channel with credentials (legacy fallback)
  for (const row of rows) {
    if (row.channel_id === 'demo') continue;
    try {
      const s = JSON.parse(row.settings || '{}');
      if (s.whatsapp_token && s.whatsapp_phone_id) return row.channel_id;
    } catch (_) {}
  }

  return userChannels[0] || 'demo';
}
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const SIX_HOURS_MS = 60 * 1000; // DEMO: 1 minute (change back to 6 * 60 * 60 * 1000 for production
const TWENTY_SIX_HOURS_MS = 26 * 60 * 60 * 1000;

/**
 * Universal Automation Engine v3
 *
 * Campaign Flow:
 *
 *  FLOW 1 — website_visit (status: active)
 *    User only visited home/listing pages, never viewed a product.
 *    4 stages of product recommendation messages using Shopify catalog.
 *    After stage 4 → status stays 'active' (no upgrade, they're cold).
 *
 *  FLOW 2 — product_view (status: product_view)
 *    User viewed a product page then left.
 *    4 stages using the exact product they viewed (last_product_* on visitor).
 *    After stage 4 → status = 'hot_user'.
 *
 *  FLOW 3 — abandoned_cart (cart_events not recovered)
 *    User added to cart but didn't buy.
 *    4 stages of cart recovery with product image + cart link.
 *    After stage 4 → status = 'cart_followup_complete' (+ hot_user).
 *
 *  FLOW 4 — post_cart_upsell (status: cart_followup_complete)
 *    All 4 cart reminders sent, user still hasn't bought.
 *    Now send product upsell / recommendation messages from catalog.
 *    Keeps user engaged until they buy.
 *
 *  FLOW 5 — post_purchase (status: purchased)
 *    AI-powered upsell recommendations based on what they bought.
 */

// ── Seed product catalog from Shopify /products.json on startup ─────────────
// Runs once at boot. If shop_url is set and catalog is empty or last seeded >24h ago,
// fetches all products from Shopify API and saves to product_catalog.
async function seedProductCatalog() {
  try {
    const db = getDb();
    // Get shop_url from settings or SHOP_URL env
    let shopUrl = process.env.SHOP_URL || null;
    if (!shopUrl) {
      for (const row of (db.channel_settings || [])) {
        try { const s = JSON.parse(row.settings || '{}'); if (s.shop_url) { shopUrl = s.shop_url; break; } } catch (_) {}
      }
    }
    if (!shopUrl) {
      console.log('[Seed] No shop_url configured — skipping product catalog seed. Set SHOP_URL env or save in Settings.');
      return;
    }
    shopUrl = shopUrl.replace(/\/$/, '');

    // Check if catalog already has non-demo products seeded recently
    const existing = (db.product_catalog || []).filter(p => p.url?.includes(new URL(shopUrl).hostname));
    const lastSeed = existing[0]?._seeded_at;
    if (existing.length >= 10 && lastSeed && (Date.now() - new Date(lastSeed).getTime()) < 24 * 3600 * 1000) {
      console.log(`[Seed] Catalog already has ${existing.length} products from ${shopUrl} — skip`);
      return;
    }

    console.log(`[Seed] Fetching products from ${shopUrl}/products.json …`);
    const r = await fetch(`${shopUrl}/products.json?limit=50`, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const products = data.products || [];
    if (!products.length) { console.log('[Seed] Shopify returned 0 products'); return; }

    if (!db.product_catalog) db.product_catalog = [];
    const seededAt = new Date().toISOString();
    let added = 0;
    for (const p of products) {
      const url   = `${shopUrl}/products/${p.handle}`;
      const price = p.variants?.[0]?.price ? `₹${p.variants[0].price}` : '';
      const image = p.images?.[0]?.src || '';
      if (!p.title || !image) continue;
      const existing = db.product_catalog.findIndex(c => c.url === url);
      const entry = { channel_id: 'demo', name: p.title, url, price, image, handle: p.handle, _seeded_at: seededAt };
      if (existing >= 0) db.product_catalog[existing] = { ...db.product_catalog[existing], ...entry };
      else { db.product_catalog.push(entry); added++; }
    }
    db.save();
    console.log(`[Seed] ✓ ${added} new products added to catalog from ${shopUrl} (total: ${db.product_catalog.length})`);
  } catch (e) {
    console.error('[Seed] Product catalog seed failed:', e.message);
  }
}

// ── Apply page_views-only cards to all auto-product templates ────────────────
// Called after buildAutoProductCards (which reads ONLY page_views).
// Updates product_config.cards + rebuilds send_payload for every auto-product
// APPROVED/PENDING carousel template. No computeHotProducts — same data source
// as the template-creation auto-detect button.
async function applyCardsToAutoProductTemplates(channelId, productConfigCards) {
  const db = getDb();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  if (!productConfigCards || productConfigCards.length === 0) {
    console.log('[ProductDetect] No valid products in this cycle window — skipping template update');
    return;
  }

  const templates = (db.meta_templates || []).filter(t =>
    t.channel_id === channelId &&
    t.is_carousel &&
    t.auto_product_mode &&
    (t.meta_status === 'APPROVED' || t.meta_status === 'PENDING')
  );

  if (templates.length === 0) {
    console.log('[ProductDetect] No auto-product carousel templates found — skipping apply');
    return;
  }

  for (const tpl of templates) {
    try {
      const cardCount = tpl.carousel_cards?.length || 3;

      // Extract the static URL base from the template's button URL (e.g. 'https://laaasyna.com/products/')
      // Only use products whose link starts with the same base — ensures {{2}} slug resolves correctly.
      let buttonUrlBase = null;
      for (const tc of (tpl.carousel_cards || [])) {
        for (const btn of (tc.buttons || [])) {
          if (String(btn.type || '').toUpperCase() === 'URL' && btn.url?.includes('{{')) {
            const varIdx = btn.url.indexOf('{{');
            if (varIdx > 0) buttonUrlBase = btn.url.substring(0, varIdx);
            break;
          }
        }
        if (buttonUrlBase) break;
      }

      // Filter to products whose URL matches the button base; skip unmatched (wrong domain/path)
      let matchedCards = productConfigCards;
      if (buttonUrlBase) {
        const matched = productConfigCards.filter(c => c.link && c.link.startsWith(buttonUrlBase));
        if (matched.length > 0) {
          matchedCards = matched;
          console.log(`[ProductDetect] "${tpl.name}" — ${matched.length}/${productConfigCards.length} products match base "${buttonUrlBase}"`);
        } else {
          console.warn(`[ProductDetect] "${tpl.name}" — no products match base "${buttonUrlBase}", using all ${productConfigCards.length}`);
        }
      }

      // Use the offset-provided batch directly — the cycle in buildAutoProductCards already
      // ensures we get a different set of products each tick.
      const rawPool = matchedCards.length > 0 ? matchedCards : productConfigCards;

      // Deduplicate by URL so no product appears twice in the same carousel
      const seenUrls = new Set();
      const pool = rawPool.filter(c => {
        const key = (c.link || c.image_url || c.title || '').trim().toLowerCase();
        if (!key || seenUrls.has(key)) return false;
        seenUrls.add(key);
        return true;
      });
      console.log(`[ProductDetect] "${tpl.name}" — ${pool.length} unique products from cycle window (${rawPool.length} raw)`);

      // Never repeat: use only as many cards as we have unique products
      const uniqueCount = Math.min(cardCount, pool.length);
      const cards = pool.slice(0, uniqueCount);

      if (!tpl.product_config) tpl.product_config = {};
      tpl.product_config.cards             = cards;
      tpl.product_config.last_auto_refresh = nowIso;
      tpl.product_config.next_auto_refresh = new Date(now + SIX_HOURS_MS).toISOString();
      tpl.product_config.send_payload      = buildSendMessagePayload(tpl, tpl.product_config, '{{RECIPIENT_PHONE}}');

      console.log(`[ProductDetect] ✓ "${tpl.name}" — ${cardCount} cards applied, send_payload rebuilt`);
      cards.forEach((c, i) => console.log(`  Card ${i + 1}: "${c.title || '—'}"  ${c.price || ''}  media_id:${c.media_id || 'n/a'}`));
    } catch (e) {
      console.error(`[ProductDetect] Template "${tpl.name}" apply error:`, e.message);
    }
  }

  db.save();
  console.log(`[ProductDetect] Applied page_views cards to ${templates.length} template(s)`);
}

// ── Every-minute lock status checker ─────────────────────────────────────────
// Source of truth: visitor.status.
//   product_view_lock  → user is in APV campaign, all good
//   product_view       → user re-entered (new product viewed) → reset lock, FLOW 2b picks up
//   abandoned_cart     → user added to cart → mark lock, user exits APV
//   purchased          → user purchased → mark lock
//   product_recommendation → both msgs sent (set by sendMultiple) → mark shifted_recommendation
// Any status ≠ product_view_lock means the user has left the campaign.
async function checkLockedUsers() {
  const db = getDb();
  if (!db.campaign_locks?.length) return;

  let changed = false;

  // Collect locks to delete (post-purchase re-entry) — avoid mutating during iteration
  const locksToDelete = new Set();

  for (const lock of db.campaign_locks) {
    if (!['active', 'shifted_recommendation'].includes(lock.lock_status)) continue;

    // Find visitor by phone only — channel_id on the lock may be stale after multilogin
    // migrations. Use the most-recently-updated session: after re-entry a new session has
    // product_view_lock while the old session retains the prior cycle's terminal status.
    const _byRecent = (arr) => arr.slice().sort((a, b) =>
      new Date(b.updated_at || b.visited_at || 0) - new Date(a.updated_at || a.visited_at || 0)
    )[0];
    const visitor = _byRecent(db.website_visitors.filter(v => v.phone === lock.phone && v.channel_id !== 'demo'))
      || _byRecent(db.website_visitors.filter(v => v.phone === lock.phone));
    if (!visitor) continue;

    lock.last_status_check = new Date().toISOString();
    const currStatus = visitor.status;

    // ── product_view_lock ─────────────────────────────────────────────────────
    if (currStatus === 'product_view_lock') {
      // Cycle re-entry: user viewed a new product (product_view_lock) but lock is
      // still shifted_recommendation (cycle 1 done). This happens when trackProductView
      // fires before trackVisitor links the phone (race condition) — the instant
      // re-entry path in tracking.controller was skipped. Reset here so cycle 2 fires.
      if (lock.lock_status === 'shifted_recommendation') {
        const cycleNum = (lock.cycle_count || 0) + 1;
        if (!lock.send_history) lock.send_history = [];
        lock.send_history.push({
          cycle:          cycleNum,
          product_name:   lock.product_name   || '',
          stage1_sent_at: lock.stage_1_sent_at || null,
          stage2_sent_at: lock.stage_2_sent_at || null,
          archived_at:    new Date().toISOString(),
          exit_reason:    'reentry_product_view_lock',
        });
        lock.cycle_count     = cycleNum;
        lock.stage           = 0;
        lock.stage_1_sent_at = null;
        lock.stage_2_sent_at = null;
        lock.lock_status     = 'active';
        lock.unlock_reason   = null;
        lock.shifted_at      = null;
        lock.reentry_at      = new Date().toISOString();
        (db.abandoned_cart_executions || []).forEach(x => {
          if (String(x.campaign_id) === String(lock.campaign_id) &&
              x.phone === lock.phone &&
              (x.status === 'sent' || x.status === 'failed' || x.status === 'reset_for_retry')) {
            x.status = 'archived_reentry'; x.archived_at = lock.reentry_at;
          }
        });
        (db.product_views || []).filter(v => v.phone === lock.phone)
          .forEach(v => { v.whatsapp_sent = 0; v.followup_count = 0; v.whatsapp_sent_at = null; });
        // Update product to the latest view for this phone.
        // If the URL changed, clear old image so apvQuickCheck scrapes the new product
        // instead of uploading a stale/wrong image from the previous cycle.
        const _latestPV = (db.product_views || [])
          .filter(v => v.phone === lock.phone)
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        if (_latestPV) {
          const _urlChanged = _latestPV.product_url && _latestPV.product_url !== lock.product_url;
          if (_latestPV.product_url)   lock.product_url   = _latestPV.product_url;
          if (_latestPV.product_name)  lock.product_name  = _latestPV.product_name;
          if (_latestPV.product_price) lock.product_price = _latestPV.product_price;
          // On URL change, ALWAYS clear the image so PATH A scrapes fresh.
          // _latestPV.product_image is the tracker's OG meta which is often the store-wide
          // banner; carrying it over would poison the gallery cache for all future sends.
          lock.product_image = _urlChanged ? '' : (_latestPV.product_image || lock.product_image);
        }
        changed = true;
        console.log(`[LockCheck] ${lock.phone} shifted_recommendation → product_view_lock detected — reset for cycle ${cycleNum}`);
        continue;
      }
      // Active lock at stage≥1 (stage 1 sent, waiting for stage 2) — check if the visitor
      // has moved to a different product. If so, reset so the new product gets stage 1.
      // This is the safety-net for cases where trackProduct's reset was skipped because
      // the session didn't have a phone yet (v.phone was null at trackProduct time).
      if (lock.lock_status === 'active' && (lock.stage || 0) >= 1) {
        const _cleanLockUrl = (u) => { try { return new URL(u || '').origin + new URL(u || '').pathname; } catch { return (u || '').split('?')[0]; } };
        const visitorUrl  = visitor.last_product_url;
        const lockUrl     = lock.product_url;
        const productChanged = visitorUrl && lockUrl &&
          _cleanLockUrl(visitorUrl) !== _cleanLockUrl(lockUrl);
        if (productChanged) {
          const cycleNum = (lock.cycle_count || 0) + 1;
          if (!lock.send_history) lock.send_history = [];
          lock.send_history.push({
            cycle:          cycleNum,
            product_name:   lock.product_name   || '',
            product_url:    lock.product_url    || '',
            stage1_sent_at: lock.stage_1_sent_at || null,
            stage2_sent_at: lock.stage_2_sent_at || null,
            archived_at:    new Date().toISOString(),
            exit_reason:    'reentry_product_changed_lockcheck',
          });
          lock.cycle_count     = cycleNum;
          lock.stage           = 0;
          lock.stage_1_sent_at = null;
          lock.stage_2_sent_at = null;
          lock.lock_status     = 'active';
          lock.unlock_reason   = null;
          lock.shifted_at      = null;
          // Use NOW as the delay anchor, not the product_view's created_at.
          // The product_view record can belong to a previous session (user viewed this product
          // days ago then revisited anonymously now) — using that old created_at makes the
          // delay pass immediately and fires stage-1 instantly.  Detection lag is ≤60s which
          // is acceptable vs. the instant-fire risk of using a stale timestamp.
          lock.reentry_at = new Date().toISOString();
          // Update lock to the new product.
          // For the image: look up from product_views for the new URL (no channel filter —
          // multilogin may have stored views under a different channel). If not found, clear
          // so PATH A scrapes fresh rather than carrying over the old product's image.
          if (visitor.last_product_url)   lock.product_url   = visitor.last_product_url;
          if (visitor.last_product_name)  lock.product_name  = visitor.last_product_name;
          if (visitor.last_product_price) lock.product_price = visitor.last_product_price;
          // Session-based lookup for new URL image — view may be stored under phone=null from pre-login browse
          const _lockCheckSessions = new Set(
            (db.website_visitors || []).filter(v => v.phone === lock.phone).map(v => v.session_id).filter(Boolean)
          );
          const _newUrlPV = (db.product_views || [])
            .filter(v =>
              (v.phone === lock.phone || (v.session_id && _lockCheckSessions.has(v.session_id))) &&
              v.product_url === visitor.last_product_url
            )
            .sort((a, b) => ((b.product_image ? 1 : 0) - (a.product_image ? 1 : 0)) || (new Date(b.created_at) - new Date(a.created_at)))[0];
          lock.product_image = _newUrlPV?.product_image || '';
          (db.abandoned_cart_executions || []).forEach(x => {
            if (String(x.campaign_id) === String(lock.campaign_id) &&
                x.phone === lock.phone &&
                (x.status === 'sent' || x.status === 'failed' || x.status === 'reset_for_retry')) {
              x.status = 'archived_reentry'; x.archived_at = lock.reentry_at;
            }
          });
          (db.product_views || []).filter(v => v.phone === lock.phone)
            .forEach(v => { v.whatsapp_sent = 0; v.followup_count = 0; v.whatsapp_sent_at = null; });
          changed = true;
          console.log(`[LockCheck] ${lock.phone} product changed mid-cycle (stage ${lock.stage + 1}→0) → "${visitor.last_product_url}" — lock reset, stage 1 will restart`);
          continue;
        }
      }
      // Still mid-cycle on the same product — nothing to do
      if (lock.last_known_status !== currStatus) {
        lock.last_known_status = currStatus;
        changed = true;
      }
      continue;
    }

    // ── Status changed away from product_view_lock ────────────────────────────
    if (lock.last_known_status !== currStatus) {
      lock.last_known_status = currStatus;
      changed = true;
      console.log(`[LockCheck] ${lock.phone}: exited product_view_lock → ${currStatus}`);
    }

    if (currStatus === 'product_view') {
      // Safety-net re-entry: tracking.controller.js normally handles this immediately
      // by setting product_view_lock directly. This path only fires when the APV campaign
      // was inactive at view time so the visitor ended up at product_view instead.
      if (lock.lock_status === 'active' && lock.stage >= 1) {
        const cycleNum = (lock.cycle_count || 0) + 1;
        if (!lock.send_history) lock.send_history = [];
        lock.send_history.push({
          cycle:          cycleNum,
          product_name:   lock.product_name   || '',
          product_url:    lock.product_url    || '',
          product_price:  lock.product_price  || '',
          stage1_sent_at: lock.stage_1_sent_at || null,
          stage2_sent_at: lock.stage_2_sent_at || null,
          archived_at:    new Date().toISOString(),
          exit_reason:    'reentry_product_view',
        });
        lock.cycle_count     = cycleNum;
        lock.stage           = 0;
        lock.stage_1_sent_at = null;
        lock.stage_2_sent_at = null;
        lock.lock_status     = 'active';
        lock.unlock_reason   = null;
        lock.shifted_at      = null;
        lock.reentry_at      = new Date().toISOString();
        // Archive dedup records (preserve history — change status so stage 1 can fire fresh)
        const archNow1 = new Date().toISOString();
        (db.abandoned_cart_executions || []).forEach(x => {
          if (String(x.campaign_id) === String(lock.campaign_id) &&
              x.phone === lock.phone &&
              (x.status === 'sent' || x.status === 'failed' || x.status === 'reset_for_retry')) {
            x.status = 'archived_reentry'; x.archived_at = archNow1;
          }
        });
        // Reset product_view flags
        (db.product_views || []).filter(v => v.phone === lock.phone && v.channel_id === lock.channel_id)
          .forEach(v => { v.whatsapp_sent = 0; v.followup_count = 0; v.whatsapp_sent_at = null; });
        changed = true;
        console.log(`[LockCheck] ${lock.phone} re-entered APV cycle ${cycleNum} — lock reset, FLOW 2b will pick up`);
      } else if (lock.lock_status === 'shifted_recommendation') {
        // Re-entry after full cycle complete — same reset, FLOW 2b claims them again
        const cycleNum = (lock.cycle_count || 0) + 1;
        if (!lock.send_history) lock.send_history = [];
        lock.send_history.push({
          cycle:          cycleNum,
          product_name:   lock.product_name   || '',
          stage1_sent_at: lock.stage_1_sent_at || null,
          stage2_sent_at: lock.stage_2_sent_at || null,
          archived_at:    new Date().toISOString(),
          exit_reason:    'reentry_after_completion',
        });
        lock.cycle_count     = cycleNum;
        lock.stage           = 0;
        lock.stage_1_sent_at = null;
        lock.stage_2_sent_at = null;
        lock.lock_status     = 'active';
        lock.unlock_reason   = null;
        lock.shifted_at      = null;
        lock.reentry_at      = new Date().toISOString();
        const archNow2 = new Date().toISOString();
        (db.abandoned_cart_executions || []).forEach(x => {
          if (String(x.campaign_id) === String(lock.campaign_id) &&
              x.phone === lock.phone &&
              (x.status === 'sent' || x.status === 'failed' || x.status === 'reset_for_retry')) {
            x.status = 'archived_reentry'; x.archived_at = archNow2;
          }
        });
        (db.product_views || []).filter(v => v.phone === lock.phone)
          .forEach(v => { v.whatsapp_sent = 0; v.followup_count = 0; v.whatsapp_sent_at = null; });
        changed = true;
        console.log(`[LockCheck] ${lock.phone} re-entered APV after full cycle — lock reset for new cycle ${cycleNum}`);
      }

    } else if (currStatus === 'abandoned_cart' || currStatus === 'abandoned_checkout') {
      if (lock.lock_status === 'active') {
        lock.lock_status   = 'cart_added';
        lock.cart_added_at = new Date().toISOString();
        lock.unlock_reason = 'user_added_to_cart';
        const cartEvt = (db.cart_events || []).find(c =>
          c.phone === lock.phone && !c.recovered && c.channel_id === lock.channel_id
        );
        if (cartEvt) lock.cart_amount = parseFloat(cartEvt.total_amount) || 0;
        changed = true;
        console.log(`[LockCheck] ✓ ${lock.phone} added to cart (₹${lock.cart_amount || 0}) — exited APV`);
      }

    } else if (currStatus === 'purchased') {
      lock.lock_status   = 'purchased';
      lock.purchased_at  = new Date().toISOString();
      lock.unlock_reason = 'user_purchased';
      const purchase = (db.purchase_history || [])
        .filter(p => p.phone === lock.phone)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
      if (purchase) lock.revenue = parseFloat(purchase.total_amount) || 0;
      changed = true;
      console.log(`[LockCheck] ✓ ${lock.phone} purchased — revenue ₹${lock.revenue || 0}`);

    } else if (currStatus === 'product_recommendation') {
      // Both APV messages sent — sendMultiple already set this status and shifted_recommendation.
      // Mark here as safety net in case sendMultiple missed setting lock_status.
      if (lock.lock_status === 'active') {
        lock.lock_status   = 'shifted_recommendation';
        lock.shifted_at    = new Date().toISOString();
        lock.unlock_reason = 'follow_up_loop_complete_no_conversion';
        changed = true;
        console.log(`[LockCheck] ${lock.phone} APV complete — shifted to recommendation pool`);
      }
    }
  }

  // ── Post-purchase re-entry: clear stale purchased/cart locks so FLOW 2b creates a fresh lock.
  // Include product_view_lock because tracking.controller now sets that status immediately
  // when an active APV campaign exists, skipping the product_view intermediate step. ────────
  const reenteredVisitors = (db.website_visitors || []).filter(v =>
    v.channel_id && v.phone &&
    (v.status === 'product_view' || v.status === 'product_view_lock') && (v.funnel_cycle || 1) > 1
  );
  for (const vis of reenteredVisitors) {
    const stale = (db.campaign_locks || []).filter(l =>
      l.phone === vis.phone && l.channel_id === vis.channel_id &&
      ['purchased', 'cart_added'].includes(l.lock_status)
    );
    if (stale.length) {
      const staleIds = new Set(stale.map(l => l.id));
      const staleKept = db.campaign_locks.filter(l => !staleIds.has(l.id));
      db.campaign_locks.splice(0, db.campaign_locks.length, ...staleKept);
      (db.product_views || []).forEach(v => {
        if (v.phone === vis.phone && v.channel_id === vis.channel_id) {
          v.whatsapp_sent = 0; v.followup_count = 0; v.whatsapp_sent_at = null;
        }
      });
      changed = true;
      console.log(`[LockCheck] ${vis.phone} re-entered funnel (cycle ${vis.funnel_cycle}) — stale locks cleared`);
    }
  }

  if (changed) db.save();
}

// Tracks whether this is the first apvQuickCheck run after server start.
// On first run, expired stage-0 locks have their anchor reset to NOW so the
// configured delay starts fresh — prevents messages firing immediately after restart.
let _apvFirstRun = true;
// Prevents concurrent apvQuickCheck runs: if an image upload or API call takes
// longer than 15s, the next timer tick must wait rather than sending duplicates.
let _apvRunning = false;

/**
 * APV Quick Check — runs every 15 seconds.
 * Fires stage-1 and stage-2 messages for APV locks whose delay has expired.
 * Works directly from campaign_locks — bypasses all visitor channel_id filtering
 * so multi-login channel_id mismatches can never block message delivery.
 */
async function apvQuickCheck() {
  if (_apvRunning) {
    console.log('[APVQuick] Already running — skipping this tick (previous send still in-flight)');
    return;
  }
  _apvRunning = true;
  try {
  const db = getDb();
  const now = Date.now();

  // On first run after server start: reset any expired stage-0 locks so their
  // configured delay starts fresh from server startup, not from original lock time.
  if (_apvFirstRun) {
    _apvFirstRun = false;
    let resetCount = 0;
    const apvCampsForReset = (db.abandoned_cart_campaigns || []).filter(c =>
      c.is_active && c.campaign_type === 'abandoned_product_view'
    );
    for (const cam of apvCampsForReset) {
      const DELAY_MS = (cam.apv_delay_min != null ? cam.apv_delay_min : 2) * 60 * 1000;
      for (const lock of (db.campaign_locks || [])) {
        if (String(lock.campaign_id) !== String(cam.id)) continue;
        if (lock.lock_status !== 'active' || (lock.stage || 0) !== 0) continue;
        const anchor = lock.reentry_at || lock.locked_at;
        const ageMs = anchor ? (now - new Date(anchor).getTime()) : Infinity;
        if (ageMs >= DELAY_MS) {
          lock.reentry_at = new Date(now).toISOString();
          resetCount++;
        }
      }
    }
    if (resetCount > 0) {
      db.save();
      console.log(`[APVQuick] server-start: reset ${resetCount} expired stage-0 lock(s) — delay restarted from now`);
    }
    return; // let reset take effect on next tick (15 s later)
  }

  let apvCampaigns = (db.abandoned_cart_campaigns || []).filter(c =>
    c.is_active && c.campaign_type === 'abandoned_product_view'
  );
  // Enforce single active APV campaign — keep newest, deactivate rest, migrate their locks.
  const allApvCampaigns = (db.abandoned_cart_campaigns || []).filter(c => c.campaign_type === 'abandoned_product_view');
  const newestApv = allApvCampaigns.sort((a, b) => Number(b.id) - Number(a.id))[0];

  if (apvCampaigns.length > 1 || (newestApv && apvCampaigns.length === 1 && String(apvCampaigns[0].id) !== String(newestApv.id))) {
    // Deactivate all APV campaigns except the newest
    let migratedLocks = 0;
    for (const old of allApvCampaigns) {
      if (String(old.id) === String(newestApv?.id)) continue;
      if (old.is_active) { old.is_active = 0; old.updated_at = new Date().toISOString(); }
      // Migrate all non-terminal locks from this stale campaign → newest campaign
      // (include shifted_recommendation so re-entry after cycle completion works)
      if (newestApv) {
        for (const lock of (db.campaign_locks || [])) {
          if (String(lock.campaign_id) === String(old.id) &&
              ['active', 'shifted_recommendation'].includes(lock.lock_status)) {
            lock.campaign_id = newestApv.id;
            migratedLocks++;
          }
        }
      }
    }
    if (migratedLocks > 0 || apvCampaigns.length > 1) {
      db.save();
      console.warn(`[APVQuick] ⚠ Deactivated stale APV campaigns, migrated ${migratedLocks} lock(s) → "${newestApv?.name}" (template="${newestApv?.meta_template_name}")`);
    }
    apvCampaigns = newestApv ? [newestApv] : [];
  }

  // Also collect ANY active lock for any APV campaign (including ones just migrated)
  const allLocks = (db.campaign_locks || []).filter(l => apvCampaigns.some(c => String(c.id) === String(l.campaign_id)));
  console.log(`[APVQuick] tick — ${apvCampaigns.length} active APV campaign(s) | ${allLocks.length} total lock(s) | io=${!!global.io}`);
  if (apvCampaigns.length === 0) return;

  for (const cam of apvCampaigns) {
    // Always use the primary user-owned channel — campaign.channel_id may be stale
    // (e.g. created under an old channel that no longer has a user account).
    const channelId = getPrimaryChannelId(db);
    const STAGE1_DELAY_MS = (cam.apv_delay_min  != null ? cam.apv_delay_min  : 2) * 60 * 1000;
    const STAGE2_GAP_MS   = (cam.apv_followup_min != null ? cam.apv_followup_min : 4) * 60 * 1000;

    const buildEvent = (l) => {
      const visitor = (db.website_visitors || []).find(v => v.phone === l.phone);
      // Find the product_view for this phone — no channel_id filter (multilogin may have
      // stored views under a different channel than getPrimaryChannelId returns).
      // Normalize URLs before matching: strip query params so UTM-tagged lock URLs
      // still match clean product_view URLs stored by the tracker.
      const cleanUrl = (u) => { try { return new URL(u).origin + new URL(u).pathname; } catch { return (u || '').split('?')[0]; } };
      const visitorSessions = new Set(
        (db.website_visitors || []).filter(v => v.phone === l.phone).map(v => v.session_id).filter(Boolean)
      );
      const allViews = (db.product_views || []).filter(v =>
        v.phone === l.phone || (v.session_id && visitorSessions.has(v.session_id))
      );
      const lockCleanUrl = l.product_url ? cleanUrl(l.product_url) : '';
      // Pick the BEST matching view for this URL: prefer records that have an image,
      // then a name, then the most recent — avoids using an older session's empty record
      // when a newer scraped record for the same URL already has the product image.
      const matchedView = lockCleanUrl
        ? (allViews
            .filter(v => cleanUrl(v.product_url) === lockCleanUrl)
            .sort((a, b) =>
              ((b.product_image ? 1 : 0) - (a.product_image ? 1 : 0)) ||
              ((b.product_name  ? 1 : 0) - (a.product_name  ? 1 : 0)) ||
              (new Date(b.created_at) - new Date(a.created_at))
            )[0] || null)
        : null;
      const latestView = [...allViews].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
      const viewRec = matchedView || latestView;
      return {
        phone:         l.phone,
        name:          visitor?.name || '',
        product_name:  l.product_name  || viewRec?.product_name  || '',
        // Only use URL-matched view for image — latestView may belong to a different (previous) product
        product_image: l.product_image || matchedView?.product_image || '',
        product_url:   l.product_url   || viewRec?.product_url   || '',
        product_price: l.product_price || viewRec?.product_price || '',
        followup_count: 0,       // overridden per stage below
        whatsapp_sent:  0,       // overridden per stage below
        whatsapp_sent_at: null,  // overridden per stage below
        _lock: l, _viewRec: viewRec, _visitor: visitor,
      };
    };

    // phone param is optional — campaign-level steps omit it, per-lock steps pass it
    const dbg = (step, detail, phone = undefined) => {
      if (global.io) global.io.emit('apv_debug', { campaign: cam.name, channelId, phone, step, detail, ts: new Date().toLocaleTimeString() });
    };

    // Resolve template name for step-1 log so it's visible immediately
    const _step1Tpl = cam.meta_template_id
      ? ((db.meta_templates || []).find(t => String(t.id) === String(cam.meta_template_id))?.name || `id=${cam.meta_template_id}`)
      : '(none — PATH B)';
    dbg('1. CHANNEL', `CAMPAIGN="${cam.name}" (id=${cam.id})  template="${_step1Tpl}"  channelId="${channelId}"${channelId !== cam.channel_id ? ` (campaign has stale "${cam.channel_id}" — using primary)` : ''}`);

    // ── Stage 1: locks at stage=0 whose delay has expired ──────────────────
    const allLocksForCam = (db.campaign_locks || []).filter(l => String(l.campaign_id) === String(cam.id));
    dbg('2. ALL LOCKS', `total=${allLocksForCam.length} | ${allLocksForCam.map(l=>`${l.phone} stage=${l.stage} status=${l.lock_status}`).join(' | ')}`);

    // ── Safety net: create locks for orphaned product_view_lock visitors ─────
    // Handles post-delete/recreate: locks were deleted but visitor status was
    // reset to product_view_lock. Without this, apvQuickCheck never fires for
    // them and they stay at "⏳ Queued · fires in ≤15s" forever.
    {
      const lockedPhonesSet = new Set(allLocksForCam.map(l => l.phone));
      const MAX_VIEW_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
      const orphans = (db.website_visitors || []).filter(v =>
        v.phone && v.status === 'product_view_lock' && !lockedPhonesSet.has(v.phone)
      );
      let orphanCreated = 0;
      for (const v of orphans) {
        // Use visitor's last_product_* fields, or fall back to most recent product_view record
        const recentPV = (db.product_views || [])
          .filter(pv => pv.phone === v.phone && new Date(pv.created_at).getTime() > (now - MAX_VIEW_AGE_MS))
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        const lockNow = new Date(now).toISOString();
        // Use the actual product view time as the lock anchor so if the delay
        // has already passed, apvQuickCheck fires on the very next tick (≤15s).
        // Do NOT set reentry_at — it stays null so the anchor is locked_at.
        const lockAnchor = recentPV?.created_at || v.last_seen || lockNow;
        if (!db.campaign_locks) db.campaign_locks = [];
        db.campaign_locks.push({
          id: `lock_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          channel_id: v.channel_id || channelId,
          phone: v.phone,
          campaign_id: cam.id,
          campaign_type: 'abandoned_product_view',
          locked_at: lockAnchor,
          product_url:   v.last_product_url   || recentPV?.product_url   || '',
          product_name:  v.last_product_name  || recentPV?.product_name  || '',
          product_image: v.last_product_image || recentPV?.product_image || '',
          product_price: v.last_product_price || recentPV?.product_price || '',
          stage: 0, stage_1_sent_at: null, stage_2_sent_at: null,
          lock_status: 'active', revenue: 0, cycle_count: 0,
          last_status_check: lockNow, last_known_status: 'product_view_lock',
          unlock_reason: null,
        });
        // Push into allLocksForCam so this tick's stage1 check can pick it up immediately
        allLocksForCam.push(db.campaign_locks[db.campaign_locks.length - 1]);
        lockedPhonesSet.add(v.phone);
        orphanCreated++;
        console.log(`[APVQuick] Safety net: created lock for ${v.phone} (product_view_lock with no lock — delay starts now)`);
      }
      if (orphanCreated > 0) {
        dbg('2a. ORPHAN LOCKS', `Created ${orphanCreated} safety-net lock(s) for product_view_lock visitors with no lock`);
        db.save();
      }
    }

    const stage1Locks = allLocksForCam.filter(l => {
      if (l.lock_status !== 'active') return false;
      if ((l.stage || 0) !== 0) return false;
      const anchor = l.reentry_at || l.locked_at;
      const ageMs = anchor ? (now - new Date(anchor).getTime()) : 0;
      const passed = ageMs >= STAGE1_DELAY_MS;
      if (!passed) dbg('2b. DELAY NOT YET', `age=${Math.round(ageMs/1000)}s need=${Math.round(STAGE1_DELAY_MS/1000)}s remaining=${Math.round((STAGE1_DELAY_MS-ageMs)/1000)}s`, l.phone);
      else          dbg('2c. DELAY PASSED ✅', `age=${Math.round(ageMs/1000)}s >= delay=${Math.round(STAGE1_DELAY_MS/1000)}s → queuing for send`, l.phone);
      return passed;
    });

    if (stage1Locks.length > 0) {
      dbg('3. STAGE1 OVERDUE', `${stage1Locks.length} lock(s) ready → calling sendMultiple`);
      console.log(`[APV Quick] "${cam.name}" stage 1 — ${stage1Locks.length} overdue lock(s)`);
      for (const l of stage1Locks) {
        const _s1Anchor = l.reentry_at || l.locked_at;
        const _s1AgeMs  = _s1Anchor ? (now - new Date(_s1Anchor).getTime()) : 0;
        console.log(`[APV Stage1] ${l.phone} anchor=${_s1Anchor ? (l.reentry_at ? 'reentry_at' : 'locked_at') : 'none'} age=${Math.round(_s1AgeMs/1000)}s delay=${Math.round(STAGE1_DELAY_MS/1000)}s cycle=${l.cycle_count||0} product="${l.product_url}"`);
      }
      // Belt-and-suspenders: archive SENT execs from previous cycles so dedup never blocks.
      // NEVER archive 'failed' here — failed execs must survive so retry count accumulates
      // and the 3-retry limit can pause. Cycle-resets (trackProductView / checkLockedUsers /
      // identify) already archive failed execs at the correct transition point.
      const archNow = new Date().toISOString();
      for (const l of stage1Locks) {
        if (l.reentry_at || (l.cycle_count || 0) > 0) {
          const reentryMs = l.reentry_at ? new Date(l.reentry_at).getTime() : 0;
          (db.abandoned_cart_executions || []).forEach(x => {
            if (String(x.campaign_id) === String(cam.id) && x.phone === l.phone &&
                (x.status === 'sent' || x.status === 'reset_for_retry')) {
              const execMs = x.sent_at ? new Date(x.sent_at).getTime() : 0;
              if (!reentryMs || execMs < reentryMs) {
                x.status = 'archived_reentry'; x.archived_at = archNow;
              }
            }
          });
        }
      }
      const events = stage1Locks.map(l => ({ ...buildEvent(l), followup_count: 0, whatsapp_sent: 0 }));
      await sendMultiple(db, cam, events, 'view', channelId);
      db.save();
    } else {
      dbg('3. STAGE1 OVERDUE', '0 lock(s) ready — nothing to send');
    }

    // ── Stage 2: locks at stage=1 whose follow-up gap has passed ───────────
    const _cleanLockUrlS2 = (u) => { try { return new URL(u || '').origin + new URL(u || '').pathname; } catch { return (u || '').split('?')[0]; } };
    const stage2Locks = allLocksForCam.filter(l => {
      if (l.lock_status !== 'active') return false;
      if (l.stage !== 1 || !l.stage_1_sent_at) return false;
      // Use the MOST RECENTLY SEEN visitor to determine current product URL.
      // .some() was too aggressive: a stale multilogin session with an old URL
      // would permanently block stage-2 even after the user returned to the original product.
      const _visAll = (db.website_visitors || []).filter(v => v.phone === l.phone);
      const _latestVis = _visAll
        .filter(v => v.last_product_url)
        .sort((a, b) => new Date(b.last_seen || 0) - new Date(a.last_seen || 0))[0];
      const _prodChanged = _latestVis &&
        l.product_url &&
        _cleanLockUrlS2(_latestVis.last_product_url) !== _cleanLockUrlS2(l.product_url);
      if (_prodChanged) return false;
      // Also check product_views recorded AFTER stage-1 was sent, including from anonymous
      // sessions (phone=null) that share a session_id with a known-phone visitor. This catches
      // the multilogin case: new browser session views Product B before phone is linked →
      // trackProductView can't reset the lock (v.phone=null), but a product_view record IS
      // created. If that view is for a different product, skip stage-2 for the old product.
      const _lockSentAtMs = new Date(l.stage_1_sent_at).getTime();
      const _visSessions  = new Set(_visAll.map(v => v.session_id).filter(Boolean));
      // Use most-recent-view approach: only skip stage-2 if the user's LATEST product view
      // after stage-1 was sent is for a DIFFERENT URL. A brief detour to another product
      // followed by a return to the original must NOT permanently block stage-2.
      const _pvAfterStage1 = (db.product_views || [])
        .filter(pv =>
          (pv.phone === l.phone || (pv.session_id && _visSessions.has(pv.session_id))) &&
          pv.product_url &&
          new Date(pv.created_at).getTime() > _lockSentAtMs
        )
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
      const _pvProdChanged = _pvAfterStage1 &&
        l.product_url &&
        _cleanLockUrlS2(_pvAfterStage1.product_url) !== _cleanLockUrlS2(l.product_url);
      if (_pvProdChanged) return false;
      return (now - new Date(l.stage_1_sent_at).getTime()) >= STAGE2_GAP_MS;
    });

    if (stage2Locks.length > 0) {
      console.log(`[APV Quick] "${cam.name}" stage 2 — ${stage2Locks.length} overdue lock(s)`);
      const events = stage2Locks.map(l => ({
        ...buildEvent(l),
        followup_count: 1, whatsapp_sent: 1, whatsapp_sent_at: l.stage_1_sent_at,
      }));
      await sendMultiple(db, cam, events, 'view', channelId);
      db.save();
    }
  }
  } finally {
    _apvRunning = false;
  }
}

export function startAutomation() {
  console.log('Starting automation engine...');

  // ── Reset 401-failed executions so they retry with updated credentials ──
  try {
    const db = getDb();
    let reset = 0;
    for (const x of (db.abandoned_cart_executions || [])) {
      if (x.status === 'failed' && (x.error || '').includes('401')) {
        x.status = 'reset_for_retry'; x.retry_count = 0; reset++;
      }
    }
    if (reset > 0) { db.save(); console.log(`[Boot] Reset ${reset} 401-failed executions for retry`); }
  } catch (e) {
    console.error('[Boot] Reset error:', e.message);
  }

  // Seed product catalog from Shopify on boot
  seedProductCatalog().catch(err => console.error('[Seed] Error:', err));

  // Main automation loop - runs every minute for message sending
  cronInterval = setInterval(() => {
    runAutomation().catch(err => console.error('[Automation] Error:', err));
    refreshAutoProductTemplates().catch(err => console.error('[AutoProducts] Error:', err));
  }, 60 * 1000);

  // Product detection — every SIX_HOURS_MS (1 min in DEMO).
  const CYCLE_BATCH = 1; // advance by 1 product per tick for fine-grained rotation
  const CYCLE_COUNT = 10;
  productDetectionInterval = setInterval(async () => {
    try {
      const db = getDb();

      // ── Step 1: find auto-product templates across ALL channels ──────────────
      const autoTpls = (db.meta_templates || []).filter(t =>
        t.channel_id &&
        t.is_carousel &&
        t.auto_product_mode &&
        (t.meta_status === 'APPROVED' || t.meta_status === 'PENDING' || t.meta_status === 'DRAFT')
      );
      if (!autoTpls.length) {
        console.log('[ProductDetect] No auto-product carousel templates — skipping');
        return;
      }
      console.log(`[ProductDetect] tick — offset=${_productCycleOffset}, templates=${autoTpls.length}`);

      const currentOffset = _productCycleOffset;
      let candidatesTotal = 0;

      // ── Step 2: per-template scrape + gallery upload + apply ─────────────────
      // Each template gets its own gallery folder (named after the template) so
      // media_id / file_handle stored in product_config.cards are valid for that
      // template's send_payload. Images are replaced (upserted) each cycle.
      for (const tpl of autoTpls) {
        try {
          const cardCount = tpl.carousel_cards?.length || 3;

          let result;
          try {
            result = await buildAutoProductCards(tpl.channel_id, tpl.name, CYCLE_COUNT, currentOffset);
          } catch (err) {
            console.error(`[ProductDetect] buildAutoProductCards failed for "${tpl.name}":`, err.message);
            continue;
          }

          const rawCards = result.productConfigCards || [];
          // Track largest pool seen across all templates (for offset math)
          if ((result.candidatesTotal || 0) > candidatesTotal) candidatesTotal = result.candidatesTotal;

          if (!rawCards.length) {
            console.log(`[ProductDetect] "${tpl.name}" — 0 valid products this tick, skipping`);
            continue;
          }

          // Deduplicate by URL so the same product never appears twice in one message
          const seen = new Set();
          const productConfigCards = rawCards.filter(c => {
            const key = (c.link || c.image_url || c.title || '').trim().toLowerCase();
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
          });

          // Only use as many cards as we have unique products — never repeat
          const uniqueCount = Math.min(cardCount, productConfigCards.length);
          const newCards = productConfigCards.slice(0, uniqueCount);

          if (!tpl.product_config) tpl.product_config = {};
          tpl.product_config.cards             = newCards;
          tpl.product_config.last_auto_refresh = new Date().toISOString();
          tpl.product_config.send_payload      = buildSendMessagePayload(tpl, tpl.product_config, '{{RECIPIENT_PHONE}}');

          console.log(`[ProductDetect] ✓ "${tpl.name}" — ${cardCount} cards updated (gallery: "${tpl.name}"):`);
          newCards.forEach((c, i) =>
            console.log(`   Card ${i + 1}: "${c.title || '—'}"  ${c.price || ''}  media_id:${c.media_id || 'n/a'}  ${c.link || ''}`)
          );
        } catch (e) {
          console.error(`[ProductDetect] template "${tpl.name}" error:`, e.message);
        }
      }

      // ── Step 3: advance offset for next tick ─────────────────────────────────
      const poolSize = Math.min(50, candidatesTotal || 0);
      _productCycleOffset = poolSize > 0 ? (currentOffset + CYCLE_BATCH) % poolSize : 0;
      console.log(`[ProductDetect] offset ${currentOffset} → ${_productCycleOffset} | pool=${poolSize}`);

      db.save();
    } catch (err) {
      console.error('[ProductDetect] Fatal error:', err.message);
      _productCycleOffset = 0;
    }
  }, SIX_HOURS_MS);
  
  // Product recommendation refresh - runs every 26 hours for new product recommendations
  productRefreshInterval = setInterval(() => {
    refreshProductRecommendations().catch(err => console.error('[ProductRefresh] Error:', err));
  }, TWENTY_SIX_HOURS_MS);

  // Template status refresh - check PENDING/DRAFT templates every 5 minutes
  templateStatusInterval = setInterval(() => {
    autoRefreshPendingStatuses().catch(err => console.error('[TemplateStatus] Error:', err));
  }, 5 * 60 * 1000);

  // Lock status checker — every 1 minute: detect cart/purchase/loop-complete for locked users
  lockCheckInterval = setInterval(() => {
    checkLockedUsers().catch(err => console.error('[LockCheck] Error:', err));
  }, 60 * 1000);

  // APV quick fire — every 15 seconds: send APV messages the instant their delay expires
  // Works directly from campaign_locks → no channel_id filtering → no missed sends
  setInterval(() => {
    apvQuickCheck().catch(err => console.error('[APVQuick] Error:', err));
  }, 15 * 1000);
  // Fire immediately on startup too
  apvQuickCheck().catch(err => console.error('[APVQuick] Initial error:', err));

  // Check pending template statuses immediately on startup
  autoRefreshPendingStatuses().catch(err => console.error('[TemplateStatus] Initial error:', err));

  console.log('Automation engine active:');
  console.log('  - Message sending: Every 5 minutes (new users)');
  console.log('  - Lock status check: Every 1 minute (cart/purchase detection)');
  console.log('  - Product detection: Every 6 hours');
  console.log('  - Product refresh: Every 26 hours');
  console.log('  - Template status sync: Every 5 minutes');
}

// ── Product-config refresh for auto-mode templates ───────────────────────────
// Called every minute (checks next_auto_refresh gate) OR force-called from
// autoDetectAndScrapeProducts() every 6 hours (bypasses the gate).
// - Gallery folder is named after each template (auto-created if missing)
// - If a hot product's image URL changed since last cycle, re-download + re-upload to Meta
//   (both uploadMedia → media_id for send payload AND uploadMediaResumable → file_handle
//    so gallery images are always ready for both template creation and message sending)
// - Always rebuilds the send_payload so campaigns get fresh media IDs
async function refreshAutoProductTemplates(forceRefresh = false) {
  const now = Date.now();

  const db      = getDb();
  const nowDt   = new Date();

  // Process all channels dynamically — iterate over every channel that has carousel templates
  const allChannels = [...new Set(
    (db.meta_templates || [])
      .filter(t => t.channel_id && t.is_carousel && !t.auto_product_mode)
      .map(t => t.channel_id)
  )];
  if (allChannels.length === 0) return;

  if (!db.gallery_folders) db.gallery_folders = [];
  if (!db.gallery_images)  db.gallery_images  = [];

  for (const channelId of allChannels) {
  // Only APPROVED/PENDING carousel templates that are NOT auto_product_mode.
  // auto_product_mode templates are exclusively managed by buildAutoProductCards
  // (productDetectionInterval) — this function handles non-auto-product carousels only.
  const nowIso = new Date(now).toISOString();
  const templates = (db.meta_templates || []).filter(t => {
    if (t.channel_id !== channelId) return false;
    if (!t.is_carousel) return false;
    if (t.auto_product_mode) return false; // handled by productDetectionInterval
    if (t.meta_status !== 'APPROVED' && t.meta_status !== 'PENDING') return false;
    // Per-template: skip if next_auto_refresh hasn't arrived yet (unless forced)
    if (!forceRefresh) {
      const nextRefresh = t.product_config?.next_auto_refresh;
      if (nextRefresh && nowIso < nextRefresh) return false;
    }
    return true;
  });
  if (templates.length === 0) continue;

  // Get enough hot products for the largest carousel (max card count across all templates)
  const maxCards = Math.max(...templates.map(t => t.carousel_cards?.length || 3), 10);
  const hotProducts = computeHotProducts(db, channelId, maxCards);
  if (hotProducts.length === 0) {
    // No tracker data yet — still advance the next_auto_refresh so we check again in 24h
    console.log(`[AutoProducts] No hot products for channel ${channelId} — advancing next_auto_refresh`);
    for (const tpl of templates) {
      if (!tpl.product_config) tpl.product_config = {};
      tpl.product_config.next_auto_refresh = new Date(now + TWENTY_FOUR_HOURS_MS).toISOString();
    }
    continue;
  }

  console.log(`[AutoProducts] 24h refresh channel=${channelId} — ${hotProducts.length} hot products, ${templates.length} template(s)`);

  for (const tpl of templates) {
    try {
      const cardCount     = tpl.carousel_cards?.length || 3;
      const existingCards = tpl.product_config?.cards || tpl.carousel_cards.map(() => ({}));

      // ── Per-template gallery folder (named after template) ─────────────────
      const folderName = (tpl.name || 'auto_products').replace(/[^a-z0-9_\- ]/gi, '_').trim();
      let folder = db.gallery_folders.find(f => f.channel_id === channelId && f.name === folderName);
      if (!folder) {
        folder = { id: uuidv4(), channel_id: channelId, name: folderName, created_at: nowDt.toISOString() };
        db.gallery_folders.push(folder);
        console.log(`[AutoProducts] Created gallery folder "${folderName}" for template "${tpl.name}"`);
      }

      // Build updated cards — exactly as many as the template has carousel cards
      const cards = await Promise.all(
        tpl.carousel_cards.map(async (card, i) => {
          // Rotate through hot products if there are fewer hot than cards
          const hot      = hotProducts[i % hotProducts.length];
          const existing = existingCards[i] || {};

          // ── Scrape fresh product data — title + price + image all required ─────
          let hotName  = '';
          let hotPrice = '';
          let hotImage = '';

          if (hot.url) {
            try {
              const scraped = await scrapeProductData(hot.url);
              hotName  = (scraped.title     || '').trim();
              hotPrice = (scraped.price     || '').trim();
              hotImage = (scraped.image_url || '').trim();

              if (!hotName || !hotPrice || !hotImage) {
                const missing = [!hotName && 'title', !hotPrice && 'price', !hotImage && 'image'].filter(Boolean).join(', ');
                console.warn(`[AutoProducts] "${tpl.name}" card ${i + 1}: scrape missing ${missing} — keeping existing card data`);
                // Fall back to existing card data so the card is not broken
                hotName  = hotName  || existing.title || hot.name  || '';
                hotPrice = hotPrice || existing.price || hot.price || '';
                hotImage = hotImage || existing._hot_image_url || hot.image || '';
              } else {
                console.log(`[AutoProducts] "${tpl.name}" card ${i + 1}: ✓ "${hotName}" — ${hotPrice}`);
              }
            } catch (scrapeErr) {
              console.warn(`[AutoProducts] "${tpl.name}" card ${i + 1}: scrape failed (${scrapeErr.message}) — keeping existing`);
              hotName  = existing.title || hot.name  || '';
              hotPrice = existing.price || hot.price || '';
              hotImage = existing._hot_image_url || hot.image || '';
            }
          } else {
            hotName  = existing.title || hot.name  || '';
            hotPrice = existing.price || hot.price || '';
            hotImage = existing._hot_image_url || hot.image || '';
          }

          const newImageUrl  = hotImage;
          const prevImageUrl = existing._hot_image_url || '';

          // Re-upload only when we have a valid image URL AND it changed or has no media_id.
          // If hotImage is empty (scrape couldn't find an image), keep the existing IDs.
          const productChanged = newImageUrl && newImageUrl !== prevImageUrl;
          const needsUpload    = newImageUrl && (productChanged || !existing.media_id);

          // media_id  = numeric ID from uploadMedia()  → used in /messages { "id": media_id }
          // file_handle = "4:..." from uploadMediaResumable() → template creation only, NEVER in /messages
          let media_id    = existing.media_id    || '';
          let file_handle = existing.file_handle || '';
          let image_id    = existing.image_id    || '';

          if (needsUpload) {
            // Check gallery cache first (same source URL already uploaded this cycle)
            const cached = db.gallery_images.find(
              img => img.source_url === newImageUrl && img.channel_id === channelId
            );
            if (cached && !productChanged) {
              media_id    = cached.media_id    || '';
              file_handle = cached.file_handle || '';
              image_id    = cached.id;
              console.log(`[AutoProducts] "${tpl.name}" card ${i + 1}: reuse cached → media_id: ${media_id}`);
            } else {
              try {
                const { buffer, mimeType } = await whatsappService.downloadImage(newImageUrl);
                const imgFilename = `${folderName}_card${i + 1}.jpg`;

                // Upload 1: POST /media → numeric media_id for /messages { "image": { "id": media_id } }
                const newMediaId = await whatsappService.uploadMedia(buffer, imgFilename, mimeType);

                // Upload 2: resumable → file_handle "4:..." for template creation only
                let newFileHandle = '';
                try {
                  newFileHandle = await whatsappService.uploadMediaResumable(buffer, imgFilename, mimeType);
                } catch (fhErr) {
                  console.warn(`[AutoProducts] "${tpl.name}" card ${i + 1}: resumable upload failed (non-fatal): ${fhErr.message}`);
                }

                // Upsert gallery record for this card slot — replace old image with new one
                const existGallIdx = db.gallery_images.findIndex(
                  g => g.channel_id === channelId && g.template_name === tpl.name && g.card_index === i
                );
                const imgRecord = {
                  id:            existGallIdx >= 0 ? db.gallery_images[existGallIdx].id : uuidv4(),
                  folder_id:     folder.id,
                  channel_id:    channelId,
                  filename:      imgFilename,
                  mime_type:     mimeType,
                  size:          buffer.length,
                  media_id:      newMediaId,      // /messages { "image": { "id": media_id } }
                  file_handle:   newFileHandle,   // template creation header_handle only
                  source_url:    newImageUrl,
                  auto_detected: true,
                  created_at:    existGallIdx >= 0 ? db.gallery_images[existGallIdx].created_at : nowDt.toISOString(),
                  updated_at:    nowDt.toISOString(),
                  template_name: tpl.name,
                  card_index:    i,
                };
                if (existGallIdx >= 0) {
                  db.gallery_images[existGallIdx] = imgRecord; // replace old record
                } else {
                  db.gallery_images.push(imgRecord);
                }

                media_id    = newMediaId;
                file_handle = newFileHandle;
                image_id    = imgRecord.id;
                console.log(`[AutoProducts] "${tpl.name}" card ${i + 1}: ${productChanged ? 're-upload' : 'first upload'} → media_id: ${media_id}  file_handle: ${file_handle || 'n/a'}`);
              } catch (imgErr) {
                console.error(`[AutoProducts] "${tpl.name}" card ${i + 1} image upload failed:`, imgErr.message);
              }
            }
          }

          return {
            title:           hotName  || existing.title || '',
            price:           hotPrice || existing.price || '',
            link:            hot.url  || existing.link  || '',
            image_id,
            media_id,        // numeric — /messages { "image": { "id": media_id } }
            file_handle,     // "4:..." — template creation only, NEVER used in send payload
            _hot_image_url:  newImageUrl,
            _hot_score:      hot.score,
            _hot_views:      hot.views,
            _hot_carts:      hot.carts,
            _auto_updated:   nowDt.toISOString(),
            _product_changed: productChanged,
          };
        })
      );

      if (!tpl.product_config) tpl.product_config = {};
      tpl.product_config.cards             = cards;
      tpl.product_config.last_auto_refresh = nowDt.toISOString();
      // When force-called from the 6h product detect cycle, schedule next check in 6h.
      // When run via the scheduled minute-loop (gate-based), keep 24h interval.
      tpl.product_config.next_auto_refresh = new Date(now + (forceRefresh ? SIX_HOURS_MS : TWENTY_FOUR_HOURS_MS)).toISOString();
      tpl.product_config.auto_products     = hotProducts.slice(0, cardCount);
      tpl.product_config.folder_name       = folderName;

      // Always rebuild the cached send payload with latest media IDs.
      // Campaigns read this at send time so they always use fresh trending products.
      tpl.product_config.send_payload = buildSendMessagePayload(tpl, tpl.product_config, '{{RECIPIENT_PHONE}}');

      const uploaded = cards.filter(c => c.media_id).length;
      const changed  = cards.filter(c => c._product_changed).length;
      console.log(`\n[AutoProducts] ✓ "${tpl.name}"`);
      console.log(`  🔒 Template structure: UNCHANGED (approved by Meta)`);
      console.log(`  📝 Message content: UPDATED`);
      console.log(`  ${cardCount} cards | ${uploaded} images uploaded | ${changed} product(s) swapped`);
      cards.forEach((c, i) => console.log(`  Card ${i+1}: "${c.title || '—'}"  ${c.price || ''}  [score:${c._hot_score||0}  carts:${c._hot_carts||0}  views:${c._hot_views||0}]`));
      console.log(`  Next refresh: ${tpl.product_config.next_auto_refresh}\n`);
    } catch (e) {
      console.error(`[AutoProducts] Template "${tpl.name}" (${tpl.id}) error:`, e.message);
    }
  }

  } // end for channelId

  db.save();
  const refreshLabel = forceRefresh ? '6h (post-detect)' : '24h (scheduled)';
  const nextMs = forceRefresh ? SIX_HOURS_MS : TWENTY_FOUR_HOURS_MS;
  console.log(`[AutoProducts] ${refreshLabel} refresh done — next at ${new Date(now + nextMs).toLocaleTimeString()}`);
}

// ── Per-send product refresh ──────────────────────────────────────────────────
// Calls the SAME buildAutoProductCards used by template-creation auto-detect.
// Reads only page_views table. Products with 404 / missing title / price / image
// are automatically skipped inside buildAutoProductCards — never stored or sent.
// Gallery is updated with fresh media_id so the message send always has valid images.
async function refreshTemplateForSend(db, tpl, channelId) {
  const cardCount = (tpl.carousel_cards || []).length || 2;
  console.log(`[SendRefresh] "${tpl.name}" — calling buildAutoProductCards (${cardCount} cards, page_views only)…`);

  let productConfigCards;
  try {
    const result = await buildAutoProductCards(channelId, tpl.name, cardCount);
    productConfigCards = result.productConfigCards;
  } catch (err) {
    console.warn(`[SendRefresh] buildAutoProductCards failed for "${tpl.name}": ${err.message} — keeping existing product_config`);
    return;
  }

  if (!productConfigCards || productConfigCards.length === 0) {
    console.warn(`[SendRefresh] No valid products for "${tpl.name}" — keeping existing product_config`);
    return;
  }

  // Cycle cards if fewer valid products than carousel slots
  const cards = Array.from({ length: cardCount }, (_, i) =>
    productConfigCards[i % productConfigCards.length]
  );

  if (!tpl.product_config) tpl.product_config = {};
  tpl.product_config.cards             = cards;
  tpl.product_config.last_auto_refresh = new Date().toISOString();
  tpl.product_config.send_payload      = buildSendMessagePayload(tpl, tpl.product_config, '{{RECIPIENT_PHONE}}');

  db.save();

  console.log(`[SendRefresh] ✓ "${tpl.name}" — ${cards.filter(c => c.media_id).length}/${cardCount} images ready`);
  cards.forEach((c, i) => console.log(`  Card ${i + 1}: "${c.title || '—'}"  ${c.price || ''}  media_id:${c.media_id || 'none'}`));
}

async function runAutomation() {
  // Run lock checker FIRST so re-entries and status resets are visible to FLOW 2b
  // Without this, a user with product_view status but shifted_recommendation lock
  // (stage=2) would be blocked by the followup_count>=2 guard in FLOW 2b.
  await checkLockedUsers().catch(err => console.error('[LockCheck] Error in runAutomation:', err));

  const db = getDb();
  const campaigns = (db.abandoned_cart_campaigns || []).filter(c => c.is_active);

  for (const cam of campaigns) {
    // Always use the primary user-owned channel — campaign.channel_id may be stale.
    const channelId = getPrimaryChannelId(db);
    try {
      const delayMs = (cam.delay_hours || 0) * 60 * 60 * 1000;
      const targetTime = new Date(Date.now() - delayMs).toISOString();

      // ────────────────────────────────────────────────────────────────────
      // FLOW 1: Website Visit — home/listing page only visitors (status=active)
      // ────────────────────────────────────────────────────────────────────
      if (cam.campaign_type === 'website_visit') {
        const visitors = db.website_visitors.filter(v => {
          if (v.channel_id !== channelId || !v.phone) return false;
          // Only pure home/listing page visitors — product viewers and cart users have different status
          if (v.status !== 'active') return false;

          const isInitial  = !v.whatsapp_sent;
          const isFollowup = v.whatsapp_sent && (v.followup_count || 0) < 4;
          if (isFollowup) {
            const hoursSince = v.whatsapp_sent_at ? (Date.now() - new Date(v.whatsapp_sent_at).getTime()) / 3600000 : Infinity;
            const requiredGap = (v.followup_count || 1) * 24; // 1=24h, 2=48h, 3=72h
            if (hoursSince < requiredGap) return false;
          }
          if (!(isInitial || isFollowup) || v.visited_at >= targetTime) return false;
          // Apply optional per-campaign audience filters (city, device, language, scores…)
          return passesAudienceFilters(db, channelId, v.phone, cam);
        }).slice(0, 5);

        await sendMultiple(db, cam, visitors, 'visit', channelId);
      }

      // ────────────────────────────────────────────────────────────────────
      // FLOW 2: Product View — user viewed a product, left without cart
      // ────────────────────────────────────────────────────────────────────
      else if (cam.campaign_type === 'product_view') {
        // Build latest product_views by phone — resolve phone via session_id for anonymous sessions
        const pvByPhone = {};
        for (const v of (db.product_views || [])) {
          if (v.channel_id !== channelId) continue;
          const phone = v.phone
            || (db.website_visitors.find(vis => vis.session_id === v.session_id && vis.channel_id === channelId))?.phone;
          if (!phone) continue;
          const vp = phone !== v.phone ? { ...v, phone } : v;
          if (!pvByPhone[phone] || vp.created_at > pvByPhone[phone].created_at) pvByPhone[phone] = vp;
        }
        const views = Object.values(pvByPhone).filter(v => {
          const isInitial  = !v.whatsapp_sent;
          const isFollowup = v.whatsapp_sent && (v.followup_count || 0) < 4;
          if (isFollowup) {
            const hoursSince = v.whatsapp_sent_at ? (Date.now() - new Date(v.whatsapp_sent_at).getTime()) / 3600000 : Infinity;
            const requiredGap = (v.followup_count || 1) * 24;
            if (hoursSince < requiredGap) return false;
          }
          const visitor = db.website_visitors.find(vis => vis.phone === v.phone || vis.session_id === v.session_id);
          if (visitor && isBlockedByStatus(visitor.status, 'product_view')) return false;
          if (!((isInitial || isFollowup) && v.created_at < targetTime)) return false;
          return passesAudienceFilters(db, channelId, v.phone, cam);
        }).slice(0, 5);

        await sendMultiple(db, cam, views, 'view', channelId);
      }

      // ────────────────────────────────────────────────────────────────────
      // FLOW 2b: Abandoned Product View — slug-matched product views, single
      //          product template, 30-min first message, 24h follow-up, max 2
      //
      // Status is the ONE source of truth for campaign membership:
      //   product_view_lock → user locked in immediately on product-view event
      //   product_view      → fallback only (APV inactive at view time, then activated)
      //   any other status  → user exited, checkLockedUsers handles cleanup
      //
      // tracking.controller.js sets product_view_lock IMMEDIATELY on the product-view
      // event when an active APV campaign exists. The safety-net claim below covers
      // the edge case where the campaign was inactive at view time.
      // ────────────────────────────────────────────────────────────────────
      else if (cam.campaign_type === 'abandoned_product_view') {
        // apvQuickCheck (runs every 15 s, has _apvRunning mutex) is the SOLE APV send path.
        // Processing APV here in runAutomation too causes double-sends: both fire sendMultiple
        // for the same lock at the same tick because neither has written the execution record
        // yet when both check eligibility concurrently.
        // The safety-net claim (product_view → product_view_lock) and lock creation still run
        // here so new visitors are picked up immediately, but the ACTUAL SEND is deferred to
        // apvQuickCheck which handles dedup safely with its mutex.
        {
          const settingsRow = (db.channel_settings || []).find(s => s.channel_id === channelId);
          const channelSettings = settingsRow ? (() => { try { return JSON.parse(settingsRow.settings || '{}'); } catch(_) { return {}; } })() : {};
          const now = Date.now();
          const MAX_VIEW_AGE_MS = 7 * 24 * 60 * 60 * 1000;
          const latestViewByPhoneAPV = {};
          for (const v of (db.product_views || [])) {
            if (!v.channel_id || v.channel_id === 'demo') continue;
            const phone = v.phone || (db.website_visitors.find(vis => vis.session_id === v.session_id))?.phone;
            if (!phone) continue;
            const vp = phone !== v.phone ? { ...v, phone } : v;
            const cur = latestViewByPhoneAPV[phone];
            if (!cur || new Date(vp.created_at) > new Date(cur.created_at)) latestViewByPhoneAPV[phone] = vp;
          }
          const eligibleVisitors = (db.website_visitors || []).filter(vis => {
            if (!vis.channel_id || vis.channel_id === 'demo' || !vis.phone) return false;
            if (vis.status !== 'product_view' && vis.status !== 'product_view_lock') return false;
            const latestPV = latestViewByPhoneAPV[vis.phone];
            const lastAct = latestPV?.created_at || vis.visited_at || vis.created_at;
            if (!lastAct || (now - new Date(lastAct).getTime()) > MAX_VIEW_AGE_MS) return false;
            return true;
          });
          // Safety-net claim only: product_view → product_view_lock + create entry lock
          // apvQuickCheck fires the actual messages
          let apvStatusChanged = false;
          for (const vis of eligibleVisitors) {
            if (vis.status === 'product_view') {
              vis.status = 'product_view_lock';
              vis.updated_at = new Date().toISOString();
              apvStatusChanged = true;
              const nowEntry = new Date().toISOString();
              const viewRec  = latestViewByPhoneAPV[vis.phone];
              if (!db.campaign_locks) db.campaign_locks = [];
              const alreadyLocked = db.campaign_locks.find(l =>
                l.phone === vis.phone && String(l.campaign_id) === String(cam.id)
              );
              if (!alreadyLocked) {
                db.campaign_locks.push({
                  id: uuidv4(), channel_id: channelId,
                  phone: vis.phone, campaign_id: cam.id, campaign_type: cam.campaign_type,
                  locked_at: nowEntry, reentry_at: null,
                  product_url:   viewRec?.product_url   || vis.last_product_url   || '',
                  product_name:  viewRec?.product_name  || vis.last_product_name  || '',
                  product_price: viewRec?.product_price || vis.last_product_price || '',
                  product_image: viewRec?.product_image || vis.last_product_image || '',
                  stage: 0, stage_1_sent_at: null, stage_2_sent_at: null,
                  lock_status: 'active', revenue: 0,
                  last_status_check: nowEntry, last_known_status: 'product_view_lock', unlock_reason: null,
                });
                console.log(`[APV/runAuto] ${vis.phone} claimed → product_view_lock + entry lock created`);
              }
            }
          }
          if (apvStatusChanged) db.save();
        }
        // DO NOT call sendMultiple for APV here — apvQuickCheck is the send path.
        continue; // eslint-disable-line no-continue
      }

      // ────────────────────────────────────────────────────────────────────
      // FLOW 3: Abandoned Cart & Checkout — added to cart or checkout started
      // ────────────────────────────────────────────────────────────────────
      else if (cam.campaign_type === 'abandoned_cart' || cam.campaign_type === 'abandoned_checkout' || cam.campaign_type === 'discount') {
        const carts = db.cart_events.filter(c => {
          if (c.channel_id !== channelId || !c.phone || c.recovered) return false;
          const isInitial  = !c.whatsapp_sent;
          const isFollowup = c.whatsapp_sent && (c.followup_count || 0) < 4;
          if (isFollowup) {
            const hoursSince = c.whatsapp_sent_at ? (Date.now() - new Date(c.whatsapp_sent_at).getTime()) / 3600000 : Infinity;
            const requiredGap = (c.followup_count || 1) * 24; // progressive 24/48/72
            if (hoursSince < requiredGap) return false;
          }
          // Check live visitor status — if they just purchased, skip (STATUS GUARD will catch it too)
          const visitor = db.website_visitors.find(vis => vis.phone === c.phone || vis.session_id === c.session_id);
          if (visitor && isBlockedByStatus(visitor.status, cam.campaign_type)) return false;
          if (cam.campaign_type === 'abandoned_cart' && c.event_type === 'checkout_started') return false;
          if (cam.campaign_type === 'abandoned_checkout' && c.event_type === 'add_to_cart') return false;
          if (!((c.event_type === 'add_to_cart' || c.event_type === 'checkout_started') &&
                (isInitial || isFollowup) && c.created_at < targetTime)) return false;
          // Apply optional per-campaign audience filters (uses visitor record for the phone)
          return passesAudienceFilters(db, channelId, c.phone, cam);
        }).slice(0, 5);

        await sendMultiple(db, cam, carts, 'cart', channelId);
      }

      // ────────────────────────────────────────────────────────────────────
      // FLOW 4: Post-Cart Upsell — all 4 cart reminders sent, still no purchase
      //         Target: status = 'followup_complete'
      // ────────────────────────────────────────────────────────────────────
      else if (cam.campaign_type === 'post_cart_upsell') {
        const targets = db.website_visitors.filter(v => {
          if (v.channel_id !== channelId || !v.phone) return false;
          if (v.status !== 'followup_complete') return false;
          const isInitial  = !v.upsell_sent;
          const isFollowup = v.upsell_sent; // INFINITE WEEKLY LOOP (No < 4 limit)
          if (isFollowup) {
            const hoursSince = (Date.now() - new Date(v.upsell_sent_at).getTime()) / 3600000;
            if (hoursSince < 168) return false; // 168h (7 days) between weekly upsells
          } else if (isInitial) {
            // Wait exactly 1 week from the moment they finished Stage 4 (which updated 'v.updated_at')
            const hoursSinceUpgrade = v.updated_at ? (Date.now() - new Date(v.updated_at).getTime()) / 3600000 : 0;
            if (hoursSinceUpgrade < 168) return false;
          }
          if (!(isInitial || isFollowup)) return false;
          return passesAudienceFilters(db, channelId, v.phone, cam);
        }).slice(0, 5);

        await sendMultiple(db, cam, targets, 'upsell', channelId);
      }

      // ────────────────────────────────────────────────────────────────────
      // FLOW 5: Post-Purchase — bought something, now upsell related products
      // ────────────────────────────────────────────────────────────────────
      else if (cam.campaign_type === 'post_purchase') {
        const customers = db.website_visitors.filter(v => {
          if (!(v.channel_id === channelId && v.phone && v.status === 'purchased' &&
                (v.last_purchase_at || v.visited_at) < targetTime && !v.whatsapp_sent)) return false;
          return passesAudienceFilters(db, channelId, v.phone, cam);
        }).slice(0, 5);

        await sendMultiple(db, cam, customers, 'customer', channelId);
      }

      // ────────────────────────────────────────────────────────────────────
      // FLOW 6: Custom Broadcast — filtered manual or automatic targeted pushes
      // ────────────────────────────────────────────────────────────────────
      else if (cam.campaign_type === 'custom_broadcast') {
        const filters = cam.status_filters || [];
        const targets = db.website_visitors.filter(v => {
          if (v.channel_id !== channelId || !v.phone || v.is_opted_out) return false;
          if (filters.length > 0 && !filters.includes(v.status)) return false;

          const executions = db.abandoned_cart_executions.filter(x => x.campaign_id === cam.id && x.phone === v.phone);
          const isInitial = executions.length === 0;

          if (cam.is_one_time) {
            return isInitial; // Only send once ever
          }

          const isFollowup = executions.length > 0 && executions.length < 4;
          if (isFollowup) {
            const lastSent = new Date(executions[executions.length - 1].sent_at).getTime();
            const hoursSince = (Date.now() - lastSent) / 3600000;
            if (hoursSince < (cam.delay_hours != null ? cam.delay_hours : 24)) return false;
          }
          return isInitial || isFollowup;
        }).slice(0, 5);

        await sendMultiple(db, cam, targets, 'broadcast', channelId);
      }

      // ── Order Confirmation: COD orders that haven't been confirmed yet ──────────
      else if (cam.campaign_type === 'order_confirmation') {
        if (!db.orders) db.orders = [];
        const targets = db.orders.filter(o => {
          if (o.channel_id !== channelId) return false;
          if (!o.phone || !o.is_cod)      return false;
          if (o.confirmation_sent)        return false;   // already messaged
          if (o.status === 'cancelled')   return false;   // user already cancelled
          return true;
        }).slice(0, 10);

        if (targets.length > 0) {
          console.log(`[OrderConfirmation] Campaign "${cam.name}" — ${targets.length} COD order(s) to confirm`);
        }

        for (const order of targets) {
          try {
            const visitor = db.website_visitors.find(v =>
              v.channel_id === channelId && v.phone === order.phone
            );

            // Skip opted-out users
            if (visitor?.is_opted_out) continue;

            // Dedup: don't send twice
            const alreadySent = (db.abandoned_cart_executions || []).find(e =>
              e.campaign_id === cam.id && e.phone === order.phone &&
              e.order_id === order.id
            );
            if (alreadySent) continue;

            // Resolve the Meta template
            const metaTpl = cam.meta_template_id
              ? (db.meta_templates || []).find(t =>
                  String(t.id) === String(cam.meta_template_id) &&
                  ['approved', 'active'].includes((t.meta_status || '').toLowerCase())
                )
              : null;

            if (!metaTpl) {
              console.warn(`[OrderConfirmation] No APPROVED Meta template for campaign "${cam.name}" — check template status`);
              break;
            }

            // Build variable values from order data
            let lineItems = [];
            try { lineItems = JSON.parse(order.products || '[]'); } catch (_) {}
            const productsSummary = order.products_summary ||
              lineItems.map(i => `${i.title || i.name} × ${i.quantity || 1}`).join(', ') || '';
            const customerName = order.name || visitor?.name || 'Customer';
            const orderId      = order.order_number || String(order.id);
            const orderTotal   = String(order.total_amount || 0);
            const payMethod    = order.payment_method || 'Cash on Delivery';

            // productConfig.cards[0] — this is what buildSendMessagePayload reads
            // field names must match getFieldValue() cases in meta-templates.controller.js
            const productConfig = {
              cards: [{
                // customer_name variable
                name:           customerName,
                customer_name:  customerName,
                // order_id variable
                order_id:       orderId,
                order_number:   orderId,
                // order_products variable
                order_products: productsSummary,
                products_summary: productsSummary,
                // order_total variable
                order_total:    orderTotal,
                total_amount:   order.total_amount || 0,
                // payment_method variable
                payment_method: payMethod,
                // delivery_date variable
                delivery_date:  '3–5 business days',
                // header image
                image:          order.product_image || '',
                image_url:      order.product_image || '',
                // Fallback for URL button suffix (e.g. https://store.com/orders/{{1}})
                link:           orderId,
                url:            orderId,
              }],
            };

            const { buildSendMessagePayload } = await import('../controllers/meta-templates.controller.js');
            // Use template's own language — avoids Meta #132001 "does not exist in translation"
            const msgPayload = buildSendMessagePayload(metaTpl, productConfig, order.phone, metaTpl.language);

            const { whatsappService } = await import('../services/whatsapp.service.js');
            const result = await whatsappService.sendTemplateMessage(order.phone, msgPayload, channelId);

            // Record execution
            const execRecord = {
              id:            (db.abandoned_cart_executions.length || 0) + 1,
              campaign_id:   cam.id,
              campaign_name: cam.name,
              campaign_type: 'order_confirmation',
              channel_id:    channelId,
              phone:         order.phone,
              name:          order.name || visitor?.name || '',
              order_id:      order.id,
              order_number:  order.order_number,
              template_name: metaTpl.name,
              status:        result?.messageId ? 'sent' : 'failed',
              wamid:         result?.messageId || null,
              error:         result?.error || null,
              payload_sent:  JSON.stringify(msgPayload),
              stage:         1,
              sent_at:       new Date().toISOString(),
            };
            db.abandoned_cart_executions.push(execRecord);

            if (result?.messageId) {
              // Mark order as confirmation sent
              order.confirmation_sent    = true;
              order.confirmation_sent_at = new Date().toISOString();
              console.log(`[OrderConfirmation] Sent to ${order.phone} — order ${order.order_number} wamid=${result.messageId}`);
            } else {
              console.error(`[OrderConfirmation] Failed for ${order.phone} — ${result?.error || 'unknown error'}`);
            }
          } catch (err) {
            console.error(`[OrderConfirmation] Error for order ${order.order_number}:`, err.message);
          }
        }
      }

      // ── Product Recommendation: carousel Meta template + audience filter rules ─
      else if (cam.campaign_type === 'product_recommendation') {
        let filterDef = { logic: 'AND', rules: [] };
        try { filterDef = JSON.parse(cam.filters || '{}'); } catch (_) {}
        const { logic = 'AND', rules = [] } = filterDef;

        const targets = db.website_visitors.filter(v => {
          if (v.channel_id !== channelId || !v.phone || v.is_opted_out) return false;
          if (v.whatsapp_sent_at) {
            const hoursSince = (Date.now() - new Date(v.whatsapp_sent_at).getTime()) / 3600000;
            if (hoursSince < (cam.delay_hours != null ? cam.delay_hours : 24)) return false;
          }
          if (cam.is_one_time) {
            const alreadySent = db.abandoned_cart_executions.find(x => x.campaign_id === cam.id && x.phone === v.phone);
            if (alreadySent) return false;
          }
          if (!rules.length) return true;
          const results = rules.map(r => applyRule(v, r));
          return logic === 'AND' ? results.every(Boolean) : results.some(Boolean);
        }).slice(0, 5);

        await sendMultiple(db, cam, targets, 'broadcast', channelId);
      }

      // ── Custom campaign: audience filtered via rules, sends meta template if linked ──
      else if (cam.campaign_type === 'custom') {
        let filterDef = { logic: 'AND', rules: [] };
        try { filterDef = JSON.parse(cam.filters || '{}'); } catch (_) {}
        const { logic = 'AND', rules = [] } = filterDef;

        const targets = db.website_visitors.filter(v => {
          if (v.channel_id !== channelId || !v.phone || v.is_opted_out) return false;
          // Delay gate: skip if sent too recently
          if (v.whatsapp_sent_at) {
            const hoursSince = (Date.now() - new Date(v.whatsapp_sent_at).getTime()) / 3600000;
            if (hoursSince < (cam.delay_hours != null ? cam.delay_hours : 24)) return false;
          }
          // De-dup: skip if already sent by this campaign and it's one-time
          if (cam.is_one_time) {
            const alreadySent = db.abandoned_cart_executions.find(x => x.campaign_id === cam.id && x.phone === v.phone);
            if (alreadySent) return false;
          }
          if (!rules.length) return true;
          const results = rules.map(r => applyRule(v, r));
          return logic === 'AND' ? results.every(Boolean) : results.some(Boolean);
        }).slice(0, 5);

        await sendMultiple(db, cam, targets, 'broadcast', channelId);
      }

    } catch (err) { console.error(`[Automation] Cam ${cam.id} error:`, err); }
  }

  db.save();
}

// ── Per-campaign audience filter helpers ─────────────────────────────────────
// Campaigns can store optional `filters` JSON ({ logic:'AND', rules:[...] })
// that narrows the auto-targeted audience further (e.g. city, device, language,
// power_score, page_views, engagement_score, cart_events).
// These filters are applied on top of the flow-level targeting (status/event type).

function applyRule(visitor, rule) {
  const cv = visitor[rule.field];
  if (rule.op === 'eq')       return String(cv ?? '').toLowerCase() === String(rule.value ?? '').toLowerCase();
  if (rule.op === 'contains') return String(cv ?? '').toLowerCase().includes(String(rule.value ?? '').toLowerCase());
  if (rule.op === 'gte')      return Number(cv ?? 0) >= Number(rule.value ?? 0);
  if (rule.op === 'lte')      return Number(cv ?? 0) <= Number(rule.value ?? 0);
  return true;
}

/**
 * Parse campaign.filters and check if the visitor associated with `phone` passes them.
 * Returns true (include) if no filters are set or if the visitor matches all rules.
 */
function passesAudienceFilters(db, channelId, phone, cam) {
  if (!cam.filters) return true;
  let rules;
  try { rules = JSON.parse(cam.filters).rules || []; } catch { return true; }
  if (rules.length === 0) return true;
  // Try exact channel match first, then any non-demo channel — handles channel_id mismatch
  const visitor = db.website_visitors.find(v => v.phone === phone && v.channel_id === channelId)
    || db.website_visitors.find(v => v.phone === phone && v.channel_id && v.channel_id !== 'demo');
  if (!visitor) return true;  // no visitor record → include (can't filter without data)
  return rules.every(rule => applyRule(visitor, rule));
}

/**
 * Status hierarchy — higher index = more advanced in funnel.
 * A campaign is only allowed to run if the user's status matches its intended level.
 * If a user has progressed further, the campaign is silently skipped and the correct
 * campaign (matching their new status) will pick them up on the next 60s tick.
 *
 * Status → allowed campaign types
 * ─────────────────────────────────────────────────────────────────
 * active               → website_visit
 * product_view         → product_view          (blocks website_visit)
 * abandoned_cart       → abandoned_cart/discount (blocks website_visit + product_view)
 * cart_followup_complete → post_cart_upsell     (blocks cart recovery)
 * purchased            → post_purchase          (blocks everything else)
 */
const STATUS_ALLOWED = {
  active:                   ['website_visit'],
  product_view:             ['product_view', 'abandoned_product_view'],
  product_view_lock:        ['abandoned_product_view'],  // claimed by APV, blocks all other campaigns
  abandoned_cart:           ['abandoned_cart', 'discount'],
  abandoned_checkout:       ['abandoned_checkout', 'discount'],
  followup_complete:        ['post_cart_upsell'],
  product_recommendation:   [],  // APV complete — waiting for next product_view re-entry
  purchased:                ['post_purchase'],
};

function isBlockedByStatus(visitorStatus, campaignType) {
  if (campaignType === 'custom_broadcast') return false;
  if (campaignType === 'custom') return false;
  if (campaignType === 'product_recommendation') return false;
  if (campaignType === 'order_confirmation') return false;    // targets orders table, not visitor status
  // APV campaign requires product_view_lock (or product_view for the initial claim tick)
  if (campaignType === 'abandoned_product_view') {
    return visitorStatus !== 'product_view_lock' && visitorStatus !== 'product_view';
  }
  if (!visitorStatus) return false;
  const allowed = STATUS_ALLOWED[visitorStatus];
  if (!allowed) return false; // unknown status — don't block
  return !allowed.includes(campaignType);
}

async function sendMultiple(db, cam, events, type, credChannelId) {
  // credChannelId = cam.channel_id (the channel the campaign belongs to = the logged-in user's channel)
  // All credential lookups use this channel; sendTemplateMessage also tries other channels on 401.
  const channelId = credChannelId || cam.channel_id;

  // Deduplicate by phone — same user can appear in multiple sessions/events
  const seenPhones = new Set();
  const dedupedEvents = events.filter(evt => {
    if (!evt.phone) return true;
    if (seenPhones.has(evt.phone)) return false;
    seenPhones.add(evt.phone);
    return true;
  });

  const emit = (step, phone, detail) => {
    if (global.io) global.io.emit('apv_debug', { campaign: cam.name, phone, step, detail, ts: new Date().toLocaleTimeString() });
  };

  for (const evt of dedupedEvents) {
    emit('4. ENTER sendMultiple', evt.phone, `channelId="${channelId}" followup_count=${evt.followup_count}`);
    try {
      // ── LIVE STATUS GUARD: re-fetch visitor status at send time ──
      const visitor = db.website_visitors.find(v => v.phone === evt.phone);

      if (visitor?.is_opted_out) {
        emit('❌ SKIP opted_out', evt.phone, 'visitor is opted out');
        console.log(`[Status Guard] Skipped "${cam.name}" for ${evt.phone} — user is opted out`);
        continue;
      }

      const liveStatus = visitor?.status;
      emit('5. VISITOR STATUS', evt.phone, `status="${liveStatus}" visitor_found=${!!visitor}`);

      const isApvFromLock = cam.campaign_type === 'abandoned_product_view' && !!evt._lock;
      emit('6. APV FROM LOCK', evt.phone, `isApvFromLock=${isApvFromLock} (skips status guard)`);

      if (!isApvFromLock && liveStatus && isBlockedByStatus(liveStatus, cam.campaign_type)) {
        emit('❌ SKIP status_guard', evt.phone, `status="${liveStatus}" blocked for ${cam.campaign_type}`);
        console.log(`[Status Guard] Skipped "${cam.name}" for ${evt.phone} — status="${liveStatus}"`);
        continue;
      }

      if (isApvFromLock && (liveStatus === 'purchased' || liveStatus === 'followup_complete')) {
        emit('❌ SKIP already_converted', evt.phone, `status="${liveStatus}"`);
        console.log(`[APV Lock] Skipping ${evt.phone} — already converted (status="${liveStatus}")`);
        continue;
      }

      // Cart has higher priority than APV — if user added to cart while APV delay was running,
      // skip and pause the lock so it doesn't keep re-firing every 15s tick.
      // trackCart normally sets lock_status='cart_added' immediately, but this guard catches
      // the race where cart is added between the stage1Locks filter and here.
      if (isApvFromLock && (liveStatus === 'abandoned_cart' || liveStatus === 'abandoned_checkout')) {
        const _lockToP = (db.campaign_locks || []).find(l =>
          l.phone === evt.phone && String(l.campaign_id) === String(cam.id) && l.lock_status === 'active'
        );
        if (_lockToP) { _lockToP.lock_status = 'cart_added'; db.save(); }
        emit('❌ SKIP cart_priority', evt.phone, `status="${liveStatus}" — cart has higher priority than APV, lock paused`);
        console.log(`[APV Lock] Skipping ${evt.phone} — ${liveStatus} has higher priority than APV (lock→cart_added)`);
        continue;
      }

      const currentStage = (type === 'upsell' || type === 'broadcast')
        ? (evt.upsell_count || 0) + 1
        : (evt.followup_count || 0) + 1;
      emit('7. STAGE', evt.phone, `currentStage=${currentStage}`);

      // ── DEDUP CHECK ──
      // cycleStart: only consider execs from the CURRENT cycle — execs before reentry_at
      // belong to a previous cycle and must never block the current cycle's send.
      const cycleStart = evt._lock?.reentry_at ? new Date(evt._lock.reentry_at).getTime() : null;
      const alreadySent = db.abandoned_cart_executions.find(x => {
        if (String(x.campaign_id) !== String(cam.id) || x.phone !== evt.phone) return false;
        if ((x.stage || 1) !== currentStage || x.status !== 'sent') return false;
        if (cycleStart && x.sent_at && new Date(x.sent_at).getTime() < cycleStart) return false;
        return true;
      });
      if (alreadySent) {
        emit('❌ SKIP dedup', evt.phone, `stage ${currentStage} already sent at ${alreadySent.sent_at}`);
        console.log(`[De-dupe] Already sent stage ${currentStage} of ${cam.name} to ${evt.phone}`);
        continue;
      }

      let _retryCount = 0;
      const failedExec = db.abandoned_cart_executions.find(x => {
        if (String(x.campaign_id) !== String(cam.id) || x.phone !== evt.phone) return false;
        if ((x.stage || 1) !== currentStage) return false;
        if (x.status !== 'failed' && x.status !== 'reset_for_retry') return false;
        // Cross-cycle guard: ignore failed execs from before the current cycle's reentry_at.
        // Without this, stale 3-retry-exhausted execs from old cycles silently block new cycles
        // (sendMultiple skips without creating a new exec → UI shows "sending now" forever).
        if (cycleStart && x.sent_at && new Date(x.sent_at).getTime() < cycleStart) return false;
        return true;
      });
      if (failedExec) {
        const retries = failedExec.retry_count || 0;
        const ageMs = failedExec.sent_at ? Date.now() - new Date(failedExec.sent_at).getTime() : 0;
        emit('8. FAILED EXEC FOUND', evt.phone, `retry_count=${retries} age=${Math.round(ageMs/1000)}s error="${failedExec.error?.slice(0,60)}"`);
        if (retries >= 3 && ageMs < 30 * 60 * 1000) {
          emit('❌ SKIP max_retries', evt.phone, `${retries} failures, wait ${Math.round((30*60*1000-ageMs)/1000)}s more`);
          console.log(`[Retry] Pausing ${evt.phone} stage ${currentStage} — ${retries} failures, error: ${failedExec.error?.slice(0, 80)}`);
          continue;
        }
        _retryCount = ageMs >= 30 * 60 * 1000 ? 0 : retries + 1;
        db.abandoned_cart_executions.splice(db.abandoned_cart_executions.indexOf(failedExec), 1);
        emit('8b. RETRY', evt.phone, `attempt ${_retryCount+1}, deleted old failed exec`);
        console.log(`[Retry] Attempt ${_retryCount + 1} for stage ${currentStage} of "${cam.name}" → ${evt.phone} (prev: ${failedExec.error?.slice(0, 60)})`);
      } else {
        emit('8. NO FAILED EXEC', evt.phone, `fresh send attempt`);
      }

      // ── TEMPLATE SELECTION (4-stage array & infinite loop support) ──
      const stageTemplates = cam.template_ids || [];
      const tIdMap = stageTemplates.length > 0
           ? stageTemplates[(currentStage - 1) % stageTemplates.length]
           : cam.template_id;
      const templateId = tIdMap || cam.template_id;
      const templateName = `${cam.campaign_type} stage-${currentStage}`;

      // ── BUILD VARIABLES ──
      const variables = buildVariables(db, cam, evt, visitor, type, channelId);

      // ── AI UPSELL for post_purchase and post_cart_upsell ──
      if (cam.campaign_type === 'post_purchase') {
        const recentPurchase = db.purchase_history.find(p => p.phone === evt.phone) || {};
        let purchasedItem = 'product';
        try {
          const arr = JSON.parse(recentPurchase.products || '[]');
          if (arr.length) purchasedItem = arr.map(p => p.name).join(', ');
        } catch (_) {}
        const upsell = await aiService.recommendUpsell(purchasedItem);
        variables.product_name  = upsell.name;
        variables.product_price = String(upsell.price);
        variables.product_image = upsell.image;
        variables.ai_reason     = upsell.reason;
      }

      if (cam.campaign_type === 'post_cart_upsell') {
        // Pick 3 random products from catalog as upsell recommendations
        const catalog = db.product_catalog.filter(p => p.channel_id === channelId);
        const picks = catalog.length > 0
          ? catalog.sort(() => 0.5 - Math.random()).slice(0, 3)
          : [];
        
        if (picks.length > 0) {
          variables.product_name  = picks[0].name;
          variables.product_price = picks[0].price;
          variables.product_image = picks[0].image;
          variables.product_url   = picks[0].url;
          variables.product_list  = picks.map(p => `• ${p.name} — ₹${p.price}`).join('\n');
          variables.recommended_products = JSON.stringify(picks);
        }
      }

      // ── Resolve language for this send ──
      const userLang = cam.target_language === 'per_user'
        ? (evt.language || visitor?.language || 'en')
        : (cam.target_language || 'en');
      const metaLangCode = LANG_MAP[userLang] || userLang; // 'hi' → 'hi', 'en' → 'en_US'

      // ── PATH A: Meta Carousel Template (type: "template") ──────────────────
      // Find by ID exactly — same logic as test send. No status gating here;
      // Meta will reject unapproved templates at the API level with a clear error.
      const metaTpl = cam.meta_template_id
        ? (db.meta_templates || []).find(t => String(t.id) === String(cam.meta_template_id))
        : null;
      const _tplStatus = (metaTpl?.meta_status || '').toLowerCase();
      const _tplApproved = ['approved', 'active'].includes(_tplStatus);
      emit('9. TEMPLATE', evt.phone, `meta_template_id="${cam.meta_template_id}" found=${!!metaTpl} status="${metaTpl?.meta_status || 'N/A'}" approved=${_tplApproved} name="${metaTpl?.name || 'none'}"`);
      if (cam.meta_template_id && !metaTpl) {
        emit('❌ SKIP no_template_found', evt.phone, `template id=${cam.meta_template_id} not found in meta_templates DB — recreate campaign with correct template`);
        console.warn(`[Automation] Campaign "${cam.name}" — meta_template_id=${cam.meta_template_id} not found in DB`);
      }
      if (metaTpl && !_tplApproved) {
        emit('9. TEMPLATE STATUS WARN', evt.phone, `status="${metaTpl.meta_status}" — proceeding anyway (Meta will reject if not approved)`);
      }
      if (!cam.meta_template_id) {
        emit('9. NO META TEMPLATE', evt.phone, `cam.meta_template_id is empty — will use PATH B (plain text template)`);
      }

      if (metaTpl) {
        // Refresh products if campaign delay has elapsed since last product refresh
        if (metaTpl.auto_product_mode) {
          const lastRefresh = metaTpl.product_config?.last_auto_refresh;
          const delayMs     = (cam.delay_hours != null ? cam.delay_hours : 24) * 60 * 60 * 1000;
          const stale       = !lastRefresh || delayMs === 0 || (Date.now() - new Date(lastRefresh).getTime()) >= delayMs;
          if (stale) {
            console.log(`[SendRefresh] Products stale for "${metaTpl.name}" (delay: ${cam.delay_hours}h) — refreshing…`);
            await refreshTemplateForSend(db, metaTpl, channelId);
          }
        }

        // ── SINGLE PRODUCT (abandoned_product_view): scrape + upload + stage vars ──
        let perUserProductConfig = metaTpl.product_config;
        if (!metaTpl.is_carousel && cam.campaign_type === 'abandoned_product_view') {
          const visitorName = visitor?.name || evt.name || 'Customer';
          let _apvSkip = false; // set true to skip this user

          emit('9a. APV PRODUCT MODE', evt.phone, `single-product build — is_carousel=${metaTpl.is_carousel} template="${metaTpl.name}"`);

          try {
            // ── Step 1: Ensure product data is complete — scrape if anything missing ──
            let productName  = evt.product_name  || '';
            let productPrice = evt.product_price || '';
            let productImage = evt.product_image || '';
            let _productImageScraped = false; // true when scraper found a product-specific image
            const productUrl = evt.product_url   || '';

            emit('9b. PRODUCT DATA', evt.phone, `name="${productName}" price="${productPrice}" image=${!!productImage} url="${productUrl.slice(0,60)}"`);

            // If absolutely no data and no URL to scrape, skip this user
            if (!productUrl && !productName && !productImage) {
              emit('❌ SKIP no_product_data', evt.phone, 'no productUrl, name, or image in lock/event — cannot build message');
              console.warn(`[AbandonedProductView] SKIP ${evt.phone} — no product URL or data available`);
              _apvSkip = true;
            }

            // Always scrape on stage-1 (lock.stage=0) — the lock may already have an image
            // URL from the tracker's OG meta tag, but that is often the store-wide logo/banner,
            // not the product-specific image. The Shopify JSON endpoint (.json) or page JSON-LD
            // always returns the real product image. Stage-2 (lock.stage=1) skips the scrape
            // because PATH A already ran during stage-1 and saved the verified URL to the lock.
            const _needsImageScrape = !evt._lock || evt._lock.stage === 0;
            if (!_apvSkip && productUrl && (!productName || !productPrice || !productImage || _needsImageScrape)) {
              emit('9c. SCRAPING', evt.phone, `missing fields or unverified image — scraping ${productUrl.slice(0, 80)}`);
              try {
                const scraped = await scrapeProductData(productUrl);
                if (!productName  && (scraped.title || scraped.name)) productName  = scraped.title || scraped.name;
                if (!productPrice && scraped.price)                    productPrice = scraped.price;
                // ALWAYS prefer scraped image over tracker's OG image — scraper returns
                // the product-specific image; tracker OG often returns the store's default.
                if (scraped.image_url || scraped.image) {
                  productImage = scraped.image_url || scraped.image;
                  _productImageScraped = true; // mark as verified: from scraper, not tracker OG meta
                }

                // Patch the product_views record so future sends skip scraping.
                // Use session-based lookup — view may be stored under phone=null from pre-login browse.
                const _scrapeVisitorSessions = new Set(
                  (db.website_visitors || []).filter(v => v.phone === evt.phone).map(v => v.session_id).filter(Boolean)
                );
                const pvIdx = db.product_views.findIndex(v =>
                  (v.phone === evt.phone || (v.session_id && _scrapeVisitorSessions.has(v.session_id))) &&
                  v.product_url === productUrl
                );
                if (pvIdx >= 0) {
                  if (!db.product_views[pvIdx].product_name  && productName)  db.product_views[pvIdx].product_name  = productName;
                  if (!db.product_views[pvIdx].product_price && productPrice) db.product_views[pvIdx].product_price = productPrice;
                  // Only overwrite image with verified scraped data — don't overwrite a
                  // previously-scraped correct image with tracker OG meta (often store banner).
                  if (productImage && _productImageScraped) db.product_views[pvIdx].product_image = productImage;
                }
                emit('9c. SCRAPED ✅', evt.phone, `name="${productName}" price="${productPrice}" image=${!!productImage}`);
                console.log(`[AbandonedProductView] Scraped: "${productName}" ${productPrice} img=${!!productImage}`);
              } catch (scrapeErr) {
                emit('9c. SCRAPE FAILED', evt.phone, `${scrapeErr.message} — continuing with available data`);
                console.warn(`[AbandonedProductView] Scrape failed for ${evt.phone}: ${scrapeErr.message} — continuing with available data`);
              }
            }
            // Expose resolved image URL on evt so gallery-cleanup in send-error handler uses it
            evt._resolvedProductImage = productImage;

            if (!_apvSkip) {
              // ── Step 2: Resolve stage variables — never send empty strings to Meta ──
              const sv = cam.stage_vars || {};
              const sKey = currentStage === 1 ? 's1' : 's2';
              const stageTpl = sv[sKey] || {};
              const tok = (s) => (s || '')
                .replace(/\{product_name\}/g,  productName)
                .replace(/\{product_price\}/g, productPrice)
                .replace(/\{product_url\}/g,   productUrl)
                .replace(/\{customer_name\}/g, visitorName);
              // Ensure v1/v2 are NEVER empty — Meta rejects empty variable values
              const v1 = tok(stageTpl.v1) || productName  || 'Check this product';
              const v2 = tok(stageTpl.v2) || productPrice || 'Limited time offer';
              emit('9d. VARS', evt.phone, `stage=${currentStage} v1="${v1.slice(0,40)}" v2="${v2.slice(0,40)}"`);

              // ── Step 3: Upload product image to Meta media API → media_id ──
              let productMediaId = '';
              if (productImage) {
                // Skip gallery cache on retries — media_ids are tied to the WhatsApp token.
                // After a token refresh the cached id is stale and Meta returns 403 (#131005).
                // Re-uploading on each retry costs one extra API call but guarantees a fresh id.
                // Also filter by product_url: if two products share the same OG meta image URL
                // (e.g. store-wide banner), each gets its own cache entry so the wrong product's
                // media_id is never returned for a different product.
                const _cUrlGal = (u) => { try { return new URL(u || '').origin + new URL(u || '').pathname; } catch { return (u || '').split('?')[0]; } };
                const cached = _retryCount === 0
                  ? (db.gallery_images || []).find(g =>
                      g.source_url === productImage &&
                      g.media_id &&
                      g.channel_id === channelId &&
                      (!g.product_url || _cUrlGal(g.product_url) === _cUrlGal(productUrl))
                    )
                  : null;
                if (cached) {
                  productMediaId = cached.media_id;
                  emit('9e. IMAGE CACHE HIT ✅', evt.phone, `media_id="${productMediaId}"`);
                  console.log(`[AbandonedProductView] Image cache hit for ${evt.phone} — media_id: ${productMediaId}`);
                } else {
                  emit('9e. IMAGE UPLOADING', evt.phone, `downloading & uploading to Meta Media API…`);
                  try {
                    const { buffer, mimeType } = await whatsappService.downloadImage(productImage);
                    productMediaId = await whatsappService.uploadMedia(buffer, `apv_${Date.now()}.jpg`, mimeType);
                    if (!db.gallery_folders) db.gallery_folders = [];
                    if (!db.gallery_images)  db.gallery_images  = [];
                    const folderName = metaTpl.name;
                    let folder = db.gallery_folders.find(f => f.channel_id === channelId && f.name === folderName);
                    if (!folder) {
                      folder = { id: uuidv4(), channel_id: channelId, name: folderName, created_at: new Date().toISOString() };
                      db.gallery_folders.push(folder);
                    }
                    db.gallery_images.push({
                      id: uuidv4(), folder_id: folder.id, channel_id: channelId,
                      filename: `apv_${evt.phone}_${Date.now()}.jpg`,
                      media_id: productMediaId, source_url: productImage,
                      product_name: productName, product_url: productUrl,
                      created_at: new Date().toISOString(),
                    });
                    db.save();
                    emit('9e. IMAGE UPLOADED ✅', evt.phone, `media_id="${productMediaId}"`);
                    console.log(`[AbandonedProductView] Image uploaded for ${evt.phone} → media_id: ${productMediaId}`);
                  } catch (imgErr) {
                    // Upload failed but we still have the product image URL.
                    // Leave productMediaId empty so buildSendMessagePayload sends { link: productImageUrl }
                    // instead of the template's default header image — this sends the CORRECT product
                    // image via direct URL rather than always showing the store's banner/logo.
                    // Only fall back to header_image_id if productImage is also empty (handled below).
                    productMediaId = '';
                    emit('9e. IMAGE UPLOAD FAILED', evt.phone, `${imgErr.message} — sending product image via direct URL link`);
                    console.warn(`[AbandonedProductView] Image upload failed for ${evt.phone}: ${imgErr.message} — sending via direct URL`);
                  }
                }
              } else {
                // No product image URL — fall back to template's pre-uploaded header image,
                // same as the test-send path. If that's also empty, send without image and
                // let Meta return the real error.
                productMediaId = metaTpl.header_image_id || '';
                emit('9e. NO IMAGE', evt.phone, `productImage empty — fallback to template header_image_id="${productMediaId || 'none'}" header_type="${metaTpl.header_type}"`);
                console.warn(`[AbandonedProductView] ${evt.phone} — no product image URL, using template header_image_id="${productMediaId || 'none'}"`);
              }

              if (!_apvSkip) {
                perUserProductConfig = {
                  cards: [{
                    '1':      v1,            // positional key → {{1}} in body
                    '2':      v2,            // positional key → {{2}} in body
                    name:     visitorName,
                    title:    productName  || v1,
                    price:    productPrice || v2,
                    link:     productUrl,
                    url:      productUrl,
                    image:    productImage,
                    media_id: productMediaId,
                  }],
                };
                emit('9f. CONFIG BUILT ✅', evt.phone, `v1="${v1.slice(0,30)}" v2="${v2.slice(0,30)}" media_id="${productMediaId}" url="${productUrl.slice(0,40)}"`);

                // Persist the resolved image URL back to the lock so future sends
                // (stage-2, retries) can find it via buildEvent without re-scraping.
                // Runs here (after full resolution) so it captures tracker-supplied
                // images too, not just scraped ones.
                const _evtLock = (db.campaign_locks || []).find(lk => lk.phone === evt.phone && String(lk.campaign_id) === String(cam.id));
                // Only persist the image URL back to the lock if the scraper verified it —
                // i.e. it came from the Shopify JSON API or OG meta from the product page itself.
                // OG meta forwarded from the tracker is often the store's default banner and
                // would poison the gallery cache: every product sharing that OG URL would reuse
                // the same (wrong) media_id on future sends.
                // Stage-2 falls back to matchedView?.product_image (from product_views) if the
                // lock image is empty — that record is updated by the scrape at line above so
                // a successful stage-1 scrape still feeds stage-2 correctly.
                if (_evtLock && productImage && _productImageScraped) _evtLock.product_image = productImage;
              }
            }
          } catch (apvErr) {
            emit('❌ SKIP apv_error', evt.phone, `unexpected error: ${apvErr.message}`);
            console.error(`[AbandonedProductView] Unexpected error building config for ${evt.phone}: ${apvErr.message}`);
            _apvSkip = true;
          }

          if (_apvSkip) {
            emit('❌ SKIP apv_final', evt.phone, `cannot build valid payload — recording as failed`);
            console.warn(`[AbandonedProductView] Skipping send for ${evt.phone} — cannot build valid payload (no product image + no template header)`);
            // Record as failed so UI shows the issue and ready_to_send clears
            db.abandoned_cart_executions.push({
              id: (db.abandoned_cart_executions.length || 0) + 1,
              campaign_id: cam.id, campaign_name: cam.name,
              phone: evt.phone, name: evt.name || '',
              template_id: metaTpl.id, template_name: metaTpl.name,
              stage: currentStage, language: metaLangCode,
              status: 'failed', error: 'No product image available and template has no header image',
              sent_at: new Date().toISOString(), is_meta_template: true,
            });
            db.save();
            continue;
          }
        } else if (!metaTpl.is_carousel && (evt.product_name || evt.product_url)) {
          const visitorName = visitor?.name || evt.name || 'Customer';
          perUserProductConfig = { cards: [{ name: visitorName, title: evt.product_name || '', price: evt.product_price || '', link: evt.product_url || '', url: evt.product_url || '', image: evt.product_image || '' }] };
          emit('9a. NON-APV SINGLE PRODUCT', evt.phone, `using evt product data directly title="${evt.product_name?.slice(0,30)}"`);
        }

        // Build the exact /messages payload with language override + UTM tracking
        let sendPayload;
        try {
          sendPayload = buildSendMessagePayload(metaTpl, perUserProductConfig, evt.phone, metaLangCode, cam.id);
          emit('9g. PAYLOAD BUILT ✅', evt.phone, `template="${metaTpl.name}" lang="${metaLangCode}" cards=${perUserProductConfig?.cards?.length ?? 0}`);
        } catch (buildErr) {
          emit('❌ SKIP payload_build_failed', evt.phone, `buildSendMessagePayload error: ${buildErr.message}`);
          console.error(`[APV] buildSendMessagePayload failed for ${evt.phone}: ${buildErr.message}`);
          const failedAt = new Date().toISOString();
          db.abandoned_cart_executions.push({
            id: (db.abandoned_cart_executions.length || 0) + 1,
            campaign_id: cam.id, campaign_name: cam.name,
            phone: evt.phone, name: evt.name || '',
            template_id: metaTpl.id, template_name: metaTpl.name,
            stage: currentStage, language: metaLangCode,
            status: 'failed', error: `Payload build failed: ${buildErr.message}`,
            retry_count: _retryCount, sent_at: failedAt, is_meta_template: true,
          });
          // Keep lock at stage=0 so apvQuickCheck can retry every 15s
          db.save();
          continue;
        }

        // ── FULL MESSAGE PAYLOAD LOG ─────────────────────────────────────────
        const pc = perUserProductConfig || metaTpl.product_config;
        const cardSummary = (pc?.cards || []).map((c, i) =>
          `  Card ${i + 1}: "${c.title || '—'}"  ${c.price || ''}  ${c.link || ''}`
        ).join('\n');
        console.log('\n╔══════════════════════════════════════════════════════════════╗');
        console.log(`║  META TEMPLATE SEND  →  ${evt.phone}`);
        console.log(`║  Template : "${metaTpl.name}"  (${metaTpl.meta_template_id || metaTpl.id})`);
        console.log(`║  Language : ${metaLangCode}  |  Campaign: "${cam.name}"`);
        console.log(`║  Last product refresh : ${pc?.last_auto_refresh || 'never'}`);
        console.log(`║  Next product refresh : ${pc?.next_auto_refresh || 'not scheduled'}`);
        if (cardSummary) { console.log('║  Products in message:'); console.log(cardSummary); }
        console.log('╠══════════════════════════════════════════════════════════════╣');
        console.log('║  POST https://graph.facebook.com/v25.0/{PHONE_NUMBER_ID}/messages');
        console.log('║  Payload:');
        console.log(JSON.stringify(sendPayload, null, 2));
        console.log('╚══════════════════════════════════════════════════════════════╝\n');

        // Log credentials being used
        emit('10. CREDENTIALS', evt.phone, `channelId="${channelId}" → getCredentials() will try this channel first, then fallback to others on 401`);

        // Pre-send lock-stage guard (APV only) — MUST run BEFORE emitting apv_sending so
        // the UI never shows "Sending now" for a send that will be skipped (which would
        // leave the UI stuck forever since no apv_sent/apv_failed fires after continue).
        // Re-entry can reset the lock (stage→0, reentry_at=NOW) in the gap between earlier
        // awaits (scrape, download, upload) and here. Checking stage now catches that race.
        if (cam.campaign_type === 'abandoned_product_view' && evt._lock) {
          const _expectedLockStage = currentStage - 1; // 0 before stage-1, 1 before stage-2
          if (evt._lock.stage !== _expectedLockStage || evt._lock.lock_status !== 'active') {
            console.log(`[APV/PathA] ${evt.phone} pre-send stage guard: expected lock.stage=${_expectedLockStage} got ${evt._lock.stage} (${evt._lock.lock_status}) — re-entry raced, skipping send`);
            continue;
          }
          // Stage-2 product-change guard: check if the visitor has moved to a different
          // product DURING image download/upload (async gap above). If so, stage-2 for
          // the old product must not fire — the user has already signalled a new intent.
          // Also catches multilogin: anonymous session viewed a different product after
          // stage-1 was sent (trackProductView couldn't reset the lock since phone=null).
          if (currentStage === 2) {
            const _pgClean = (u) => { try { return new URL(u || '').origin + new URL(u || '').pathname; } catch { return (u || '').split('?')[0]; } };
            const _pgLockUrl = evt._lock?.product_url;
            const _pgLockSentAtMs = evt._lock?.stage_1_sent_at ? new Date(evt._lock.stage_1_sent_at).getTime() : 0;
            const _pgVisAll = (db.website_visitors || []).filter(v => v.phone === evt.phone);
            const _pgLatestVis = _pgVisAll
              .filter(v => v.last_product_url)
              .sort((a, b) => new Date(b.last_seen || 0) - new Date(a.last_seen || 0))[0];
            const _pgProdChangedVis = _pgLatestVis &&
              _pgLockUrl &&
              _pgClean(_pgLatestVis.last_product_url) !== _pgClean(_pgLockUrl);
            const _pgVisSessions = new Set(_pgVisAll.map(v => v.session_id).filter(Boolean));
            const _pgPVAfterStage1 = (db.product_views || [])
              .filter(pv =>
                (pv.phone === evt.phone || (pv.session_id && _pgVisSessions.has(pv.session_id))) &&
                pv.product_url &&
                new Date(pv.created_at).getTime() > _pgLockSentAtMs
              )
              .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
            const _pgProdChangedPV = _pgPVAfterStage1 &&
              _pgLockUrl &&
              _pgClean(_pgPVAfterStage1.product_url) !== _pgClean(_pgLockUrl);
            if ((_pgProdChangedVis || _pgProdChangedPV) && _pgLockUrl) {
              const _pgReason = _pgProdChangedVis ? 'visitor.last_product_url changed' : 'product_views: newer view for different URL';
              console.log(`[APV/PathA] ${evt.phone} stage-2 guard (${_pgReason}): user moved off "${_pgLockUrl}" — stage-2 skipped`);
              continue;
            }
          }
        }

        // Emit real-time event to browser — fires immediately before the API call.
        // Guard must run before this so we only show "Sending now" if we'll actually send.
        if (global.io) {
          global.io.emit('apv_sending', {
            phone: evt.phone, name: evt.name || '',
            campaign_id: cam.id, campaign_name: cam.name,
            stage: currentStage, channel_id: channelId,
            payload: sendPayload, timestamp: new Date().toISOString(),
          });
        }

        // Snapshot lock state before the async send.
        // If the user views a different product (tracking re-entry) WHILE the API
        // call is in-flight, the lock will be reset (new reentry_at, stage→0, new product).
        // After the send we detect this and archive the exec so the new cycle isn't blocked.
        const _lockSnapReentryAt = evt._lock?.reentry_at ?? null;

        let sendResult;
        try {
          sendResult = await whatsappService.sendTemplateMessage(evt.phone, sendPayload, channelId);
        } catch (sendErr) {
          console.error(`[MetaTemplateSend] FAILED for ${evt.phone} — ${sendErr.message}`);
          const failedAt = new Date().toISOString();
          db.abandoned_cart_executions.push({
            id: (db.abandoned_cart_executions.length || 0) + 1,
            campaign_id: cam.id, campaign_name: cam.name,
            phone: evt.phone, name: evt.name,
            template_id: metaTpl.id, template_name: metaTpl.name,
            stage: currentStage, language: metaLangCode,
            status: 'failed', error: sendErr.message,
            retry_count: _retryCount,
            sent_at: failedAt, is_meta_template: true,
            payload_sent: JSON.stringify(sendPayload),
          });
          if (global.io) {
            global.io.emit('apv_failed', {
              phone: evt.phone, campaign_id: cam.id, campaign_name: cam.name,
              stage: currentStage, error: sendErr.message, timestamp: failedAt,
            });
          }
          // 403 "Access denied" (#131005) = stale media_id (token was refreshed).
          // Remove the cached gallery entry so next attempt re-uploads with the new token.
          if (sendErr.message.includes('403') || sendErr.message.includes('131005') || sendErr.message.toLowerCase().includes('access denied')) {
            // Use the resolved/scraped image URL (saved on evt by APV block) — may differ
            // from evt.product_image if the scraper found a different URL
            const imgUrl = evt._resolvedProductImage || evt.product_image || '';
            if (imgUrl && db.gallery_images) {
              const before = db.gallery_images.length;
              const imgKept = db.gallery_images.filter(g => g.source_url !== imgUrl);
              db.gallery_images.splice(0, db.gallery_images.length, ...imgKept);
              if (db.gallery_images.length < before)
                console.log(`[APV] Cleared ${before - db.gallery_images.length} stale media_id cache entry(ies) for ${imgUrl} (token refresh 403)`);
            }
          }
          // Keep lock at stage=0 — apvQuickCheck retries every 15s automatically
          db.save();
          continue;
        }

        // Build human-readable text from actual per-user cards (not the generic template cards)
        const sentCards = (perUserProductConfig?.cards || metaTpl.product_config?.cards || []);
        const carouselText = sentCards.length
          ? `[Carousel: ${metaTpl.name}]\n` + sentCards.map((c, i) =>
              `Card ${i + 1}: ${c.title || '—'}${c.price ? ' • ' + c.price : ''}${c.link ? '\n' + c.link : ''}`
            ).join('\n')
          : `[Carousel: ${metaTpl.name}]`;

        saveChatMessage(db, evt.phone, carouselText, channelId, {
          wamid: sendResult.messageId || null,
          campaignName: cam.name,
          templateName: metaTpl.name,
        });

        // Detect re-entry race: did the user view a different product while this
        // API call was in-flight? If so, the lock was reset (new reentry_at) and
        // we must NOT update it to stage=currentStage — that would clobber the new
        // cycle and permanently block stage 1 of the new product.
        const _lockResetDuringSend = evt._lock && (evt._lock.reentry_at ?? null) !== _lockSnapReentryAt;
        const execSentAt = new Date().toISOString();
        const execRecord = {
          id: (db.abandoned_cart_executions.length || 0) + 1,
          campaign_id: cam.id,
          campaign_name: cam.name,
          phone: evt.phone,
          name: evt.name,
          template_id: metaTpl.id,
          template_name: metaTpl.name,
          stage: currentStage,
          language: metaLangCode,
          // If lock was reset mid-send, archive this exec so the new cycle isn't blocked
          status: _lockResetDuringSend ? 'archived_reentry' : (sendResult.messageId ? 'sent' : 'failed'),
          sent_at: execSentAt,
          is_meta_template: true,
          cards_sent: sentCards.map(c => ({
            title:    c.title    || '',
            price:    c.price    || '',
            link:     c.link     || '',
            media_id: c.media_id || '',
            image:    c._hot_image_url || c.image || '',
          })),
          payload_sent: JSON.stringify(sendPayload),
        };
        if (_lockResetDuringSend) {
          execRecord.archived_at = execSentAt;
          emit('⚠ REENTRY RACE', evt.phone, `lock reset during send (reentry_at changed) — exec archived, lock NOT updated`);
          console.warn(`[APV] ${evt.phone} re-entered mid-send — exec archived, skipping lock update to protect new cycle`);
        }
        db.abandoned_cart_executions.push(execRecord);

        if (!_lockResetDuringSend) {
          if (type === 'upsell') {
            evt.upsell_sent    = 1;
            evt.upsell_count   = currentStage;
            evt.upsell_sent_at = execSentAt;
          } else {
            evt.whatsapp_sent    = 1;
            evt.followup_count   = currentStage;
            evt.whatsapp_sent_at = execSentAt;
          }
        }

        // ── Campaign lock: create on stage 1, update stage on follow-up ──────
        // Skip if lock was reset mid-send (re-entry race) — new cycle must run fresh.
        if (cam.campaign_type === 'abandoned_product_view' && sendResult?.messageId && !_lockResetDuringSend) {
          if (!db.campaign_locks) db.campaign_locks = [];
          const nowIso = new Date().toISOString();
          const existingLock = db.campaign_locks.find(l => l.phone === evt.phone && String(l.campaign_id) === String(cam.id));
          if (!existingLock) {
            db.campaign_locks.push({
              id: uuidv4(),
              channel_id:        channelId,
              phone:             evt.phone,
              campaign_id:       cam.id,
              campaign_type:     cam.campaign_type,
              locked_at:         nowIso,
              product_url:       evt.product_url   || '',
              product_name:      evt.product_name  || '',
              product_price:     evt.product_price || '',
              product_image:     evt.product_image || '',
              stage:             currentStage,
              stage_1_sent_at:   currentStage === 1 ? nowIso : null,
              stage_2_sent_at:   currentStage === 2 ? nowIso : null,
              lock_status:       'active',
              revenue:           0,
              last_status_check: nowIso,
              last_known_status: 'product_view_lock',
              unlock_reason:     null,
            });
            console.log(`[Lock] Created lock for ${evt.phone} — stage ${currentStage} — product: "${evt.product_name}"`);
          } else {
            existingLock.stage = currentStage;
            if (currentStage === 1) existingLock.stage_1_sent_at = nowIso;
            if (currentStage === 2) existingLock.stage_2_sent_at = nowIso;
            console.log(`[Lock] Updated lock for ${evt.phone} → stage ${currentStage}`);
          }
        }

        // ── Update product_views record for APV so follow-up tracking is correct ──
        if (cam.campaign_type === 'abandoned_product_view' && evt._viewRec && !_lockResetDuringSend) {
          const pvIdx = db.product_views.findIndex(v => v.id === evt._viewRec.id);
          if (pvIdx >= 0) {
            db.product_views[pvIdx].whatsapp_sent    = 1;
            db.product_views[pvIdx].followup_count   = currentStage;
            db.product_views[pvIdx].whatsapp_sent_at = new Date().toISOString();
            db.product_views[pvIdx].campaign_id      = cam.id;
          }
        }

        // Stage 4 → promote visitor to followup_complete (same as PATH B)
        if (currentStage === 4) {
          const vIdx = db.website_visitors.findIndex(v => v.phone === evt.phone);
          if (vIdx >= 0 && upgradeStatus(db.website_visitors[vIdx], 'followup_complete')) {
            console.log(`[Stage 4] ${evt.phone} → followup_complete`);
          }
        }

        // APV stage 2 complete — move to product_recommendation and close the lock immediately.
        // Status product_recommendation = both follow-ups sent, user in recommendation pool.
        // Any new product_view will restart the cycle via statusMachine re-entry rules.
        // Guards: skip if lock was reset mid-send (re-entry race), or if Meta returned no wamid
        // (HTTP 200 but no message ID = message likely not delivered; keep stage=1+active so retry
        // fires on the next tick rather than silently closing a cycle that never completed).
        if (currentStage === 2 && cam.campaign_type === 'abandoned_product_view' && !_lockResetDuringSend && sendResult?.messageId) {
          // Upgrade ALL sessions for this phone — a stale 'active' session on another channel
          // must not leave 'product_view_lock' sessions behind after cycle completion.
          const nowIso = new Date().toISOString();
          let anyUpgraded = false;
          db.website_visitors.forEach((v, idx) => {
            if (v.phone !== evt.phone) return;
            const upgraded = upgradeStatus(db.website_visitors[idx], 'product_recommendation');
            if (upgraded) {
              db.website_visitors[idx].apv_source_campaign_id   = cam.id;
              db.website_visitors[idx].apv_source_campaign_name = cam.name;
              db.website_visitors[idx].apv_completed_at         = nowIso;
              anyUpgraded = true;
            }
          });
          if (anyUpgraded) {
            // Close the lock immediately — no need to wait for checkLockedUsers 5-min timer
            const closeLock = (db.campaign_locks || []).find(l =>
              l.phone === evt.phone && String(l.campaign_id) === String(cam.id)
            );
            if (closeLock && closeLock.lock_status === 'active') {
              closeLock.lock_status   = 'shifted_recommendation';
              closeLock.shifted_at    = nowIso;
              closeLock.unlock_reason = 'follow_up_loop_complete_no_conversion';
            }
            console.log(`[APV Stage 2] ${evt.phone} → product_recommendation — campaign "${cam.name}"`);
          }
        }

        // Emit success event so browser console shows full payload + Meta response
        if (global.io) {
          global.io.emit('apv_sent', {
            phone: evt.phone, campaign_id: cam.id, campaign_name: cam.name,
            stage: currentStage, wamid: sendResult?.messageId,
            payload: sendResult?.sentPayload || sendPayload,
            meta_response: sendResult?.metaResponse || null,
            timestamp: new Date().toISOString(),
          });
        }

        cam.total_sent = (cam.total_sent || 0) + 1;
        cam.last_run_at = new Date().toISOString();
        if (cam.campaign_type === 'abandoned_product_view') db.save();
        console.log(`[Automation] ${cam.name} meta-template stage-${currentStage} → ${evt.phone}`);
        continue;  // skip PATH B
      }

      // ── PATH B: Old message_templates (type: "text") ───────────────────────
      emit('PATH B', evt.phone, `using plain text template_id="${templateId}" — no meta_template_id on campaign`);
      const templateRecord = db.message_templates.find(t => t.id == templateId);
      if (!templateRecord) {
        emit('❌ SKIP path_b_no_template', evt.phone, `template id="${templateId}" not found in message_templates — add a template to campaign`);
        console.warn(`[Automation] Template ${templateId} not found for campaign "${cam.name}" — skipping ${evt.phone}`);
        db.abandoned_cart_executions.push({
          id: (db.abandoned_cart_executions.length || 0) + 1,
          campaign_id: cam.id, campaign_name: cam.name,
          phone: evt.phone, name: evt.name || '',
          template_id: templateId, stage: currentStage,
          status: 'failed', error: `Template not found or not configured (id: ${templateId || 'none'})`,
          sent_at: new Date().toISOString(),
        });
        db.save();
        continue;
      }
      emit('PATH B TEMPLATE', evt.phone, `found template "${templateRecord.name}" body="${(templateRecord.body_text||'').slice(0,50)}"`);

      // Build components from new-format (body_text) or fall back to old components field
      let components;
      const storedComponents = templateRecord.components ? JSON.parse(templateRecord.components) : [];
      if (storedComponents.length > 0) {
        components = storedComponents;
      } else if (templateRecord.body_text) {
        components = [{ type: 'body', text: templateRecord.body_text }];
        if (templateRecord.header_type === 'text' && templateRecord.header_text) {
          components.unshift({ type: 'header', text: templateRecord.header_text });
        }
        if (templateRecord.footer_text) {
          components.push({ type: 'footer', text: templateRecord.footer_text });
        }
        const btns = templateRecord.buttons
          ? (typeof templateRecord.buttons === 'string' ? JSON.parse(templateRecord.buttons) : templateRecord.buttons)
          : [];
        if (btns.length) components.push({ type: 'buttons', buttons: btns });
      } else {
        console.warn(`[Automation] Template ${templateId} has no body text, skipping ${evt.phone}`);
        continue;
      }

      // ── TEMPLATE-STORED VALUES: manual / URL-scraped templates always win ──────
      // Override runtime event-level variables with values stored on the template
      // so every send is consistent with what the user configured at creation time.
      if (templateRecord.product_data) {
        try {
          const pd = typeof templateRecord.product_data === 'string'
            ? JSON.parse(templateRecord.product_data)
            : templateRecord.product_data;
          if (pd.name  || pd.title) variables.product_name  = pd.name  || pd.title;
          if (pd.price)             variables.product_price = String(pd.price);
          if (pd.image)             variables.product_image = pd.image;
          if (pd.link  || pd.url)   variables.product_url   = pd.link  || pd.url;
        } catch (_) {}
      }
      if (templateRecord.example_values) {
        try {
          const ev = typeof templateRecord.example_values === 'string'
            ? JSON.parse(templateRecord.example_values)
            : templateRecord.example_values;
          // Named field overrides (product_name, product_price, etc.)
          for (const [k, v] of Object.entries(ev)) {
            if (v !== undefined && v !== '' && k in variables) variables[k] = v;
          }
        } catch (_) {}
      }
      if (templateRecord.carousel_cards) {
        try {
          const cards = typeof templateRecord.carousel_cards === 'string'
            ? JSON.parse(templateRecord.carousel_cards)
            : templateRecord.carousel_cards;
          if (Array.isArray(cards) && cards.length > 0) {
            // Use first card's product_data as the top-level product vars
            const pd = cards[0].product_data || {};
            if (pd.title || pd.name) variables.product_name  = pd.title || pd.name;
            if (pd.price)            variables.product_price = String(pd.price);
            if (pd.image)            variables.product_image = pd.image;
            if (pd.link  || pd.url)  variables.product_url   = pd.link  || pd.url;
          }
        } catch (_) {}
      }

      if (userLang && userLang !== 'en') {
        components = await translateComponents(components, userLang);
        console.log(`[Lang] Translating to ${userLang} for ${evt.phone} (${evt.name || 'user'})`);
      }

      // Pre-send lock-stage guard BEFORE apv_sending — same reason as PATH A:
      // if guard fires we never emitted apv_sending, so UI won't get stuck on "Sending now".
      if (cam.campaign_type === 'abandoned_product_view' && evt._lock) {
        const _expectedLockStageB = currentStage - 1;
        if (evt._lock.stage !== _expectedLockStageB || evt._lock.lock_status !== 'active') {
          console.log(`[APV/PathB] ${evt.phone} pre-send stage guard: expected lock.stage=${_expectedLockStageB} got ${evt._lock.stage} (${evt._lock.lock_status}) — re-entry raced, skipping send`);
          continue;
        }
      }

      if (global.io) {
        global.io.emit('apv_sending', {
          phone: evt.phone, name: evt.name || '',
          campaign_id: cam.id, campaign_name: cam.name,
          stage: currentStage, channel_id: channelId,
          timestamp: new Date().toISOString(),
        });
      }

      // Snapshot lock re-entry state before async send — same guard as PATH A.
      const _lockSnapReentryAtB = evt._lock?.reentry_at ?? null;

      const sendResult = await whatsappService.sendMessage(evt.phone, components, variables, channelId);

      // Detect re-entry race: did the user view a different product while this
      // API call was in-flight? If so the lock was reset (new reentry_at) and we
      // must NOT update it to stage=currentStage — that would clobber the new cycle.
      const _lockResetDuringSendB = evt._lock && (evt._lock.reentry_at ?? null) !== _lockSnapReentryAtB;

      // ── SAVE TO CHAT INBOX (live update) ──
      saveChatMessage(db, evt.phone, sendResult.resolvedText || '', channelId, {
        wamid: sendResult.messageId || null,
        campaignName: cam.name,
        templateName,
      });

      // ── LOG EXECUTION ──
      const _execStatus = _lockResetDuringSendB
        ? 'archived_reentry'
        : (sendResult.messageId ? 'sent' : 'failed');
      db.abandoned_cart_executions.push({
        id: (db.abandoned_cart_executions.length || 0) + 1,
        campaign_id: cam.id,
        campaign_name: cam.name,
        phone: evt.phone,
        name: evt.name,
        template_id: templateId,
        template_name: templateName,
        stage: currentStage,
        language: userLang,
        status: _execStatus,
        error: _execStatus === 'failed' ? 'Message send failed — check WhatsApp credentials' : null,
        retry_count: _retryCount,
        sent_at: new Date().toISOString(),
        archived_at: _lockResetDuringSendB ? new Date().toISOString() : undefined,
        product_image: variables.product_image || ''
      });
      if (_execStatus === 'failed') {
        // apv_sending was already emitted — MUST emit apv_failed so UI clears "Sending now".
        // sendMessage() catches API errors and returns { messageId: null } rather than throwing,
        // so this path is the only signal the browser receives about the failure.
        if (global.io) {
          global.io.emit('apv_failed', {
            phone: evt.phone, campaign_id: cam.id, campaign_name: cam.name,
            stage: currentStage,
            error: 'Send failed — check WhatsApp credentials or message template',
            timestamp: new Date().toISOString(),
          });
        }
        db.save(); continue;
      }
      if (_lockResetDuringSendB) {
        console.warn(`[APV/PathB] ${evt.phone} re-entered mid-send — exec archived, skipping lock update to protect new cycle`);
        // API call did complete — emit apv_sent so UI clears "Sending now" (consistent with PATH A).
        if (global.io) {
          global.io.emit('apv_sent', {
            phone: evt.phone, campaign_id: cam.id, campaign_name: cam.name,
            stage: currentStage, wamid: sendResult?.messageId,
            timestamp: new Date().toISOString(),
          });
        }
        db.save(); continue;
      }

      if (global.io) {
        global.io.emit('apv_sent', {
          phone: evt.phone, campaign_id: cam.id, campaign_name: cam.name,
          stage: currentStage, wamid: sendResult?.messageId,
          payload: sendResult?.sentPayload || null,
          meta_response: sendResult?.metaResponse || null,
          timestamp: new Date().toISOString(),
        });
      }

      // ── UPDATE EVENT STATE ──
      if (type === 'upsell') {
        evt.upsell_sent    = 1;
        evt.upsell_count   = currentStage;
        evt.upsell_sent_at = new Date().toISOString();
      } else {
        evt.whatsapp_sent    = 1;
        evt.followup_count   = currentStage;
        evt.whatsapp_sent_at = new Date().toISOString();
      }

      // ── Update product_views record for APV (PATH B text template) ──
      if (cam.campaign_type === 'abandoned_product_view' && evt._viewRec) {
        const pvIdx = db.product_views.findIndex(v => v.id === evt._viewRec.id);
        if (pvIdx >= 0) {
          db.product_views[pvIdx].whatsapp_sent    = 1;
          db.product_views[pvIdx].followup_count   = currentStage;
          db.product_views[pvIdx].whatsapp_sent_at = new Date().toISOString();
          db.product_views[pvIdx].campaign_id      = cam.id;
        }
      }

      // ── Campaign lock for APV PATH B (text template) — matches PATH A lock creation ──
      if (cam.campaign_type === 'abandoned_product_view') {
        if (!db.campaign_locks) db.campaign_locks = [];
        const nowIso = new Date().toISOString();
        const existingLock = db.campaign_locks.find(l => l.phone === evt.phone && String(l.campaign_id) === String(cam.id));
        if (!existingLock) {
          db.campaign_locks.push({
            id: uuidv4(), channel_id: channelId,
            phone: evt.phone, campaign_id: cam.id, campaign_type: cam.campaign_type,
            locked_at: nowIso, reentry_at: null,
            product_url: evt.product_url || '', product_name: evt.product_name || '',
            product_price: evt.product_price || '', product_image: evt.product_image || '',
            stage: currentStage, stage_1_sent_at: currentStage === 1 ? nowIso : null,
            stage_2_sent_at: currentStage === 2 ? nowIso : null,
            lock_status: 'active', revenue: 0,
            last_status_check: nowIso, last_known_status: 'product_view_lock', unlock_reason: null,
          });
          console.log(`[Lock/PathB] Created lock for ${evt.phone} — stage ${currentStage}`);
        } else {
          existingLock.stage = currentStage;
          if (currentStage === 1) existingLock.stage_1_sent_at = nowIso;
          if (currentStage === 2) existingLock.stage_2_sent_at = nowIso;
        }
      }

      // ── STAGE COMPLETION ──
      if (currentStage === 4) {
        const vIdx = db.website_visitors.findIndex(v => v.phone === evt.phone);
        if (vIdx >= 0 && upgradeStatus(db.website_visitors[vIdx], 'followup_complete')) {
          console.log(`[Stage 4] ${evt.phone} → followup_complete → weekly upsell loop`);
        }
      } else if (currentStage === 2 && cam.campaign_type === 'abandoned_product_view') {
        const nowIso2 = new Date().toISOString();
        let anyUpgraded2 = false;
        db.website_visitors.forEach((v, idx) => {
          if (v.phone !== evt.phone) return;
          if (upgradeStatus(db.website_visitors[idx], 'product_recommendation')) anyUpgraded2 = true;
        });
        if (anyUpgraded2) {
          const closeLock = (db.campaign_locks || []).find(l =>
            l.phone === evt.phone && String(l.campaign_id) === String(cam.id)
          );
          if (closeLock && closeLock.lock_status === 'active') {
            closeLock.lock_status   = 'shifted_recommendation';
            closeLock.shifted_at    = nowIso2;
            closeLock.unlock_reason = 'follow_up_loop_complete_no_conversion';
          }
          console.log(`[APV Stage 2] ${evt.phone} → product_recommendation`);
        }
      }

      cam.total_sent = (cam.total_sent || 0) + 1;
      cam.last_run_at = new Date().toISOString();
      console.log(`[Automation] ${cam.name} stage-${currentStage} → ${evt.phone}`);

    } catch (e) {
      console.error(`[Automation] Send error for ${evt.phone}:`, e);
      // Safety net: create a failed exec so the UI clears "🟢 sending ≤60s" and shows ❌
      try {
        const fallbackStage = (type === 'upsell' || type === 'broadcast')
          ? (evt.upsell_count || 0) + 1
          : (evt.followup_count || 0) + 1;
        const alreadyHasExec = (db.abandoned_cart_executions || []).some(x =>
          String(x.campaign_id) === String(cam.id) && x.phone === evt.phone && (x.stage || 1) === fallbackStage
        );
        const failedAt = new Date().toISOString();
        if (!alreadyHasExec) {
          db.abandoned_cart_executions.push({
            id: (db.abandoned_cart_executions.length || 0) + 1,
            campaign_id: cam.id, campaign_name: cam.name,
            phone: evt.phone, name: evt.name || '',
            stage: fallbackStage,
            status: 'failed', error: e.message || 'Unexpected error in automation',
            sent_at: failedAt,
          });
          // Keep lock at stage=0 — apvQuickCheck retries every 15s
          db.save();
        }
        // Clear any "Sending now" UI state — this fires regardless of alreadyHasExec
        if (global.io) {
          global.io.emit('apv_failed', {
            phone: evt.phone, campaign_id: cam.id, campaign_name: cam.name,
            stage: fallbackStage, error: e.message || 'Unexpected error',
            timestamp: failedAt,
          });
        }
      } catch (_) {}
    }
  }
}

/**
 * Append ?ww_src=BASE64(phone) to a URL so the tracker can auto-identify
 * the user when they click from WhatsApp — works in incognito / any browser.
 */
function _tagUrl(url, phone, campaignId = null) {
  if (!url || !phone) return url || '';
  const tag = Buffer.from(String(phone)).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  let out = url + (url.includes('?') ? '&' : '?') + 'ww_src=' + tag;
  if (campaignId) {
    out += '&ww_cam=' + encodeURIComponent(campaignId);
    out += '&utm_source=whatsapp&utm_medium=campaign&utm_campaign=' + encodeURIComponent(campaignId);
  }
  return out;
}

/**
 * Build WhatsApp message variables depending on campaign type.
 * Each type has different dynamic data sources.
 */
function buildVariables(db, cam, evt, visitor, type, channelId) {
  const phone  = evt.phone || visitor?.phone || '';
  const camId  = cam?.id   || null;
  const base = {
    name: evt.name || visitor?.name || 'Customer',
    total_amount: (evt.total_amount || 0).toLocaleString(),
    currency: evt.currency || null,
    cart_url: _tagUrl(evt.cart_url, phone, camId),
    shopify_carousel: typeof evt.shopify_carousel === 'string'
      ? evt.shopify_carousel
      : JSON.stringify(evt.shopify_carousel || [])
  };

  if (type === 'cart') {
    // FLOW 3 — cart product data comes from the cart_event itself
    return {
      ...base,
      product_name:  evt.product_name  || extractFirstProductName(evt.products),
      product_image: evt.product_image || '',
      product_url:   _tagUrl(evt.product_url, phone, camId),
      product_price: evt.product_price || String(evt.total_amount || ''),
      product_list:  buildProductList(evt.products),
    };
  }

  if (type === 'view') {
    // FLOW 2 — use the exact product the visitor was looking at
    return {
      ...base,
      product_name:  evt.product_name  || '',
      product_image: evt.product_image || '',
      product_url:   _tagUrl(evt.product_url, phone, camId),
      product_price: evt.product_price || '',
      product_list:  evt.product_name ? `• ${evt.product_name}` : '',
    };
  }

  if (type === 'visit') {
    // FLOW 1 — inject catalog product recommendations for home/listing page visitors
    const catalog = db.product_catalog.filter(p => p.channel_id === channelId);
    const picks = catalog.length > 0
      ? catalog.sort(() => 0.5 - Math.random()).slice(0, 3)
      : [];

    const firstPick = picks[0] || {};
    return {
      ...base,
      product_name:  firstPick.name  || 'our latest collection',
      product_image: firstPick.image || '',
      product_url:   _tagUrl(firstPick.url, phone, camId),
      product_price: firstPick.price || '',
      product_list:  picks.map(p => `• ${p.name} — ₹${p.price}`).join('\n') || 'Check our latest products',
      recommended_products: JSON.stringify(picks),
    };
  }

  if (type === 'upsell') {
    // FLOW 4 — post_cart_upsell variables fall back to last_product if catalog is empty. 
    // They are primarily overwritten by the sendMultiple block above using 3 random picks.
    return {
      ...base,
      product_name:  visitor?.last_product_name  || 'exclusive offer',
      product_image: visitor?.last_product_image || '',
      product_url:   visitor?.last_product_url   || '',
      product_price: visitor?.last_product_price || '',
      product_list:  visitor?.last_product_name ? `• ${visitor.last_product_name}` : 'our best products',
    };
  }

  if (type === 'order') {
    // Order confirmation — evt is a purchase_history or order record
    let productsSummary = '';
    try {
      const items = JSON.parse(evt.products || evt.line_items || '[]');
      productsSummary = items.map(i => `${i.name || i.title} × ${i.quantity || 1}`).join(', ') || evt.product_name || '';
    } catch (_) { productsSummary = evt.product_name || ''; }
    return {
      ...base,
      customer_name:  evt.name    || visitor?.name    || 'Customer',
      order_id:       evt.order_id || evt.order_number || '',
      order_products: productsSummary,
      order_total:    String(evt.total_amount || 0),
      payment_method: evt.payment_method || (evt.is_cod ? 'Cash on Delivery' : 'Online Payment'),
      delivery_date:  evt.delivery_date  || '3–5 business days',
      product_image:  evt.product_image  || '',
    };
  }

  // FLOW 5 & 6 — post_purchase / broadcast: filled in by AI service after this call
  return { ...base, product_name: '', product_image: '', product_price: '', ai_reason: '' };
}

function extractFirstProductName(productsJson) {
  try {
    const arr = JSON.parse(productsJson || '[]');
    return arr[0]?.name || '';
  } catch (_) { return ''; }
}

function buildProductList(productsJson) {
  try {
    const arr = JSON.parse(productsJson || '[]');
    return arr.map(p => `• ${p.name} — ₹${(p.price || 0).toLocaleString()}`).join('\n');
  } catch (_) { return ''; }
}

// ── AUTO-DETECT AND SCRAPE TOP PRODUCTS FROM ANALYTICS ────────────────────────
// Runs every 6 hours to:
//  1. Analyze page_views and cart_events to find top 5 trending products
//  2. Scrape product pages for latest data (title, price, main image)
//  3. Download and upload images to Meta (storing in gallery with media_id)
//  4. Update product_catalog with fresh data
//
// This ensures templates always have the latest trending products with valid images
async function autoDetectAndScrapeProducts() {
  const db = getDb();
  const nowDt = new Date();

  // Collect all channels that have any tracked data
  const allChannels = [...new Set(
    [...(db.page_views || []), ...(db.product_views || [])]
      .filter(v => v.channel_id)
      .map(v => v.channel_id)
  )];
  if (allChannels.length === 0) return;

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  AUTO-DETECT TOP PRODUCTS FROM TRAFFIC ANALYTICS              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  if (!db.gallery_folders) db.gallery_folders = [];
  if (!db.gallery_images) db.gallery_images = [];

  for (const channelId of allChannels) {
  // Get top 5 products from analytics (last 7 days)
  const topProducts = computeHotProducts(db, channelId, 5);

  if (topProducts.length === 0) {
    console.log(`[ProductDetect] No products found for channel ${channelId}`);
    continue;
  }
  
  console.log(`[ProductDetect] Found ${topProducts.length} trending products:`);
  topProducts.forEach((p, i) => {
    console.log(`  ${i + 1}. "${p.name}" - ${p.price} (score: ${p.score}, views: ${p.views}, carts: ${p.carts})`);
  });
  
  // Initialize gallery structures
  if (!db.gallery_folders) db.gallery_folders = [];
  if (!db.gallery_images) db.gallery_images = [];
  
  // Get or create auto-products gallery folder
  const folderName = 'auto_products_trending';
  let folder = db.gallery_folders.find(f => f.channel_id === channelId && f.name === folderName);
  if (!folder) {
    folder = {
      id: uuidv4(),
      channel_id: channelId,
      name: folderName,
      created_at: nowDt.toISOString()
    };
    db.gallery_folders.push(folder);
    console.log(`[ProductDetect] Created gallery folder "${folderName}"`);
  }
  
  console.log('\n[ProductDetect] Starting product scraping and image upload...');
  
  // Process each product: scrape data and upload main image
  for (let i = 0; i < topProducts.length; i++) {
    const product = topProducts[i];
    
    try {
      console.log(`\n[ProductDetect] Processing product ${i + 1}/${topProducts.length}: "${product.name}"`);
      
      // Skip if no URL
      if (!product.url) {
        console.log(`  ⚠ Skipping - no product URL`);
        continue;
      }
      
      // Scrape fresh product data — title + price + main image must ALL be confirmed
      console.log(`  → Scraping ${product.url}`);
      const scraped = await scrapeProductData(product.url);

      const productTitle = (scraped.title     || '').trim();
      const productPrice = (scraped.price     || '').trim();
      const productImage = (scraped.image_url || '').trim();

      if (!productTitle) { console.log(`  ⚠ Skip — no title found after scrape`);      continue; }
      if (!productPrice) { console.log(`  ⚠ Skip — no price found after scrape`);      continue; }
      if (!productImage) { console.log(`  ⚠ Skip — no main image found after scrape`); continue; }

      console.log(`  ✓ Validated: "${productTitle}" — ${productPrice}`);
      console.log(`  Image: ${productImage.slice(0, 80)}`);
      
      // Update product_catalog with fresh data
      const catalogIdx = db.product_catalog.findIndex(
        p => p.channel_id === channelId && p.url === product.url
      );
      
      if (catalogIdx >= 0) {
        db.product_catalog[catalogIdx].name = productTitle;
        db.product_catalog[catalogIdx].price = productPrice;
        db.product_catalog[catalogIdx].image = productImage;
        db.product_catalog[catalogIdx].updated_at = nowDt.toISOString();
        db.product_catalog[catalogIdx].auto_detected = true;
        db.product_catalog[catalogIdx].traffic_score = product.score;
        console.log(`  ✓ Updated product catalog`);
      } else {
        db.product_catalog.push({
          id: (db.product_catalog.length || 0) + 1,
          channel_id: channelId,
          name: productTitle,
          price: productPrice,
          image: productImage,
          url: product.url,
          auto_detected: true,
          traffic_score: product.score,
          created_at: nowDt.toISOString(),
          updated_at: nowDt.toISOString()
        });
        console.log(`  ✓ Added to product catalog`);
      }
      
      // Download and upload image to Meta if we have an image URL
      if (productImage) {
        console.log(`  → Downloading image...`);
        
        try {
          // Check if image already exists in gallery for this product
          const existingImage = db.gallery_images.find(
            img => img.source_url === productImage && img.channel_id === channelId
          );
          
          if (existingImage) {
            console.log(`  ✓ Image already in gallery (media_id: ${existingImage.media_id})`);
            continue;
          }
          
          // Download image
          const { buffer, mimeType } = await whatsappService.downloadImage(productImage);
          console.log(`  ✓ Downloaded (${buffer.length} bytes, ${mimeType})`);

          // Upload 1: regular upload → media_id (for message send payload)
          console.log(`  → Uploading to Meta (regular)...`);
          const mediaId = await whatsappService.uploadMedia(
            buffer,
            `auto_product_${i + 1}_${Date.now()}.jpg`,
            mimeType
          );
          console.log(`  ✓ Regular upload → media_id: ${mediaId}`);

          // Upload 2: resumable upload → file_handle (for template creation/approval)
          let fileHandle = '';
          try {
            fileHandle = await whatsappService.uploadMediaResumable(
              buffer,
              `auto_product_${i + 1}_${Date.now()}.jpg`,
              mimeType
            );
            console.log(`  ✓ Resumable upload → file_handle: ${fileHandle}`);
          } catch (fhErr) {
            console.warn(`  ⚠ Resumable upload failed (non-fatal): ${fhErr.message}`);
          }

          // Save both IDs to gallery
          const imageRecord = {
            id: uuidv4(),
            folder_id: folder.id,
            channel_id: channelId,
            filename: `${productTitle.substring(0, 50)}_${mediaId}`,
            mime_type: mimeType,
            size: buffer.length,
            file_handle: fileHandle,   // for template creation example (header_handle)
            media_id: mediaId,         // for message send: { "image": { "id": media_id } }
            source_url: productImage,
            product_name: productTitle,
            product_url: product.url,
            auto_detected: true,
            traffic_score: product.score,
            created_at: nowDt.toISOString()
          };

          db.gallery_images.push(imageRecord);
          console.log(`  ✓ Saved to gallery (file_handle: ${fileHandle ? 'yes' : 'no'}, media_id: ${mediaId})`);
          
        } catch (imgErr) {
          console.error(`  ✗ Image upload failed: ${imgErr.message}`);
        }
      }
      
    } catch (err) {
      console.error(`  ✗ Product processing failed: ${err.message}`);
    }
  }

  } // end for channelId

  db.save();

  console.log('\n[ProductDetect] Auto-detect complete!');
  console.log(`  - Gallery images: ${db.gallery_images.filter(i => i.auto_detected).length}`);
  console.log(`  - Next run: ${new Date(Date.now() + SIX_HOURS_MS).toLocaleString()}`);

  // After fresh product data + images are in the gallery, immediately push to auto-product templates.
  // Pass forceRefresh=true so it bypasses the 24h next_auto_refresh gate and uses 6h interval.
  await refreshAutoProductTemplates(true);

  console.log('╚════════════════════════════════════════════════════════════════╝\n');
}

// ── REFRESH PRODUCT RECOMMENDATIONS ────────────────────────────────────────────
// Runs every 26 hours to:
//  1. Re-analyze traffic to find NEW trending products
//  2. Update auto-mode templates with fresh product recommendations
//  3. Ensure campaigns always send the latest trending items
async function refreshProductRecommendations() {
  const db = getDb();
  const nowDt = new Date();

  // Collect all channels with auto-product templates
  const allChannels = [...new Set(
    (db.meta_templates || [])
      .filter(t => t.channel_id && t.is_carousel && t.auto_product_mode)
      .map(t => t.channel_id)
  )];
  if (allChannels.length === 0) return;

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  26-HOUR PRODUCT RECOMMENDATION REFRESH                       ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  for (const channelId of allChannels) {
  // Get fresh top products based on last 7 days traffic
  const hotProducts = computeHotProducts(db, channelId, 10);

  if (hotProducts.length === 0) {
    console.log(`[ProductRefresh] No products found for channel ${channelId} — skipping`);
    continue;
  }

  console.log(`[ProductRefresh] channel=${channelId} — ${hotProducts.length} products to recommend`);

  // Find all auto-product-mode templates
  const autoTemplates = (db.meta_templates || []).filter(t =>
    t.channel_id === channelId &&
    t.is_carousel &&
    t.auto_product_mode &&
    (t.meta_status === 'APPROVED' || t.meta_status === 'PENDING')
  );

  if (autoTemplates.length === 0) {
    console.log(`[ProductRefresh] No auto-product templates for channel ${channelId}`);
    continue;
  }

  console.log(`[ProductRefresh] Updating ${autoTemplates.length} template(s)...`);

  for (const tpl of autoTemplates) {
    try {
      console.log(`\n  Template: "${tpl.name}"`);
      
      const cardCount = tpl.carousel_cards?.length || 3;
      const selectedProducts = hotProducts.slice(0, cardCount);
      
      // ⚠️ CRITICAL: Template structure NEVER changes
      // We ONLY update the product_config.cards data that fills the variables
      // The template body, buttons, and structure remain unchanged
      
      if (!tpl.product_config) tpl.product_config = {};
      
      tpl.product_config.auto_products = selectedProducts;
      tpl.product_config.last_auto_refresh = nowDt.toISOString();
      tpl.product_config.next_auto_refresh = new Date(Date.now() + TWENTY_SIX_HOURS_MS).toISOString();
      
      // Update ONLY the card data (product info), NOT the template structure
      if (tpl.product_config.cards) {
        // Keep all template structure (var_map, buttons, body text) UNCHANGED
        // Only update the product data that fills the variables at message send time
        tpl.product_config.cards = tpl.product_config.cards.map((card, i) => {
          const newProduct = selectedProducts[i] || selectedProducts[0];
          return {
            ...card,  // Keep all existing card structure (var_map, buttons, example_values)
            // ONLY update product data fields:
            title: newProduct.name,
            price: newProduct.price,
            link: newProduct.url,
            _hot_score: newProduct.score,
            _hot_views: newProduct.views,
            _hot_carts: newProduct.carts,
            _hot_image_url: newProduct.image,
            _auto_updated: nowDt.toISOString()
          };
        });
        
        // Rebuild ONLY the send payload (message content), NOT the template
        // The template structure at Meta stays the same, only message data changes
        tpl.product_config.send_payload = buildSendMessagePayload(
          tpl,
          tpl.product_config,
          '{{RECIPIENT_PHONE}}'
        );
      }
      
      console.log(`  ✓ Updated product data ONLY (template structure unchanged)`);
      
      console.log(`  ✓ Updated with ${selectedProducts.length} products`);
      selectedProducts.forEach((p, i) => {
        console.log(`    ${i + 1}. "${p.name}" (score: ${p.score})`);
      });
      
    } catch (err) {
      console.error(`  ✗ Template update failed: ${err.message}`);
    }
  }
  
  } // end for channelId

  db.save();

  console.log('\n[ProductRefresh] Recommendation refresh complete!');
  console.log(`  - Next refresh: ${new Date(Date.now() + TWENTY_SIX_HOURS_MS).toLocaleString()}`);
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
}
