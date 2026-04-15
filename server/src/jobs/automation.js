import { whatsappService } from '../services/whatsapp.service.js';
import { getDb } from '../services/database.js';
import { aiService } from '../services/ai.service.js';
import { translateComponents } from '../services/translate.service.js';
import { saveChatMessage } from '../controllers/chat.controller.js';
import { upgradeStatus } from '../utils/statusMachine.js';
import { computeHotProducts, buildSendMessagePayload, scrapeProductData, LANG_MAP } from '../controllers/meta-templates.controller.js';
import { v4 as uuidv4 } from 'uuid';

let cronInterval;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

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

export function startAutomation() {
  console.log('Starting automation engine...');
  cronInterval = setInterval(() => {
    runAutomation().catch(err => console.error('[Automation] Error:', err));
    refreshAutoProductTemplates().catch(err => console.error('[AutoProducts] Error:', err));
  }, 60 * 1000);
  console.log('Automation engine active - monitoring tracker events');
}

// ── Every-24-hour refresh: update product_config.cards for auto-mode templates ──
// - Gallery folder is named after each template (auto-created if missing)
// - If a hot product's image URL changed since last cycle, re-download + re-upload to Meta
// - Always rebuilds the send_payload so campaigns get fresh media IDs
async function refreshAutoProductTemplates() {
  const now = Date.now();

  const db      = getDb();
  const nowDt   = new Date();
  const channelId = process.env.CHANNEL_ID || 'demo';

  // Only auto-product-mode APPROVED/PENDING carousel templates that are due for refresh
  const nowIso = new Date(now).toISOString();
  const templates = (db.meta_templates || []).filter(t => {
    if (t.channel_id !== channelId) return false;
    if (!t.is_carousel || !t.auto_product_mode) return false;
    if (t.meta_status !== 'APPROVED' && t.meta_status !== 'PENDING') return false;
    // Per-template: skip if next_auto_refresh hasn't arrived yet
    const nextRefresh = t.product_config?.next_auto_refresh;
    if (nextRefresh && nowIso < nextRefresh) return false;
    return true;
  });
  if (templates.length === 0) return;

  // Get enough hot products for the largest carousel (max card count across all templates)
  const maxCards = Math.max(...templates.map(t => t.carousel_cards?.length || 3), 10);
  const hotProducts = computeHotProducts(db, channelId, maxCards);
  if (hotProducts.length === 0) {
    // No tracker data yet — still advance the next_auto_refresh so we check again in 24h
    console.log('[AutoProducts] No hot products found — advancing next_auto_refresh and skipping image update');
    for (const tpl of templates) {
      if (!tpl.product_config) tpl.product_config = {};
      tpl.product_config.next_auto_refresh = new Date(now + TWENTY_FOUR_HOURS_MS).toISOString();
    }
    db.save();
    return;
  }

  console.log(`[AutoProducts] 24h refresh — ${hotProducts.length} hot products, ${templates.length} template(s)`);
  if (!db.gallery_folders) db.gallery_folders = [];
  if (!db.gallery_images)  db.gallery_images  = [];

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
              console.log(`[AutoProducts] "${tpl.name}" card ${i + 1}: scraped "${hotName}" — image: ${hotImage ? 'found' : 'none'}`);
            } catch (scrapeErr) {
              console.warn(`[AutoProducts] "${tpl.name}" card ${i + 1}: scrape failed (${scrapeErr.message}), using cached data`);
            }
          }

          const newImageUrl  = hotImage;
          const prevImageUrl = existing._hot_image_url || '';

          // Re-upload image if:
          //  (a) product image URL changed since last cycle, OR
          //  (b) no media ID stored yet
          const productChanged = newImageUrl && newImageUrl !== prevImageUrl;
          const needsUpload    = newImageUrl && (productChanged || !existing.header_media_id);

          let header_media_id = existing.header_media_id || '';
          let image_id        = existing.image_id || '';

          if (needsUpload) {
            // Check gallery cache first (same URL already uploaded this cycle)
            const cached = db.gallery_images.find(
              img => img.source_url === newImageUrl && img.channel_id === channelId
            );
            if (cached && !productChanged) {
              header_media_id = cached.media_id || '';
              image_id        = cached.id;
              console.log(`[AutoProducts] "${tpl.name}" card ${i + 1}: reuse cached media_id → ${header_media_id}`);
            } else {
              // Download image and upload to Meta Graph API → get media_id for send payload
              try {
                const { buffer, mimeType } = await whatsappService.downloadImage(newImageUrl);

                // uploadMedia() returns a numeric media_id used in { "image": { "id": media_id } }
                const mediaId = await whatsappService.uploadMedia(buffer, `${folderName}_card${i + 1}.jpg`, mimeType);

                const imgRecord = {
                  id:           uuidv4(),
                  folder_id:    folder.id,
                  channel_id:   channelId,
                  filename:     mediaId,           // named by media_id
                  mime_type:    mimeType,
                  size:         buffer.length,
                  media_id:     mediaId,            // what the send payload uses
                  source_url:   newImageUrl,
                  created_at:   nowDt.toISOString(),
                  template_name: tpl.name,
                  card_index:   i,
                };
                db.gallery_images.push(imgRecord);

                header_media_id = mediaId;
                image_id        = imgRecord.id;
                console.log(`[AutoProducts] "${tpl.name}" card ${i + 1}: ${productChanged ? 're-uploaded new product' : 'first upload'} → media_id: ${mediaId}`);
              } catch (imgErr) {
                console.error(`[AutoProducts] "${tpl.name}" card ${i + 1} image upload failed:`, imgErr.message);
                // Keep existing IDs if upload fails — don't break the whole refresh
              }
            }
          }

          return {
            title:           hotName   || existing.title  || '',
            price:           hotPrice  || existing.price  || '',
            link:            hot.url   || existing.link   || '',
            image_id,
            media_id:        header_media_id,   // numeric ID for send payload { "id": media_id }
            header_media_id,
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
      tpl.product_config.next_auto_refresh = new Date(now + TWENTY_FOUR_HOURS_MS).toISOString();
      tpl.product_config.auto_products     = hotProducts.slice(0, cardCount);
      tpl.product_config.folder_name       = folderName;

      // Always rebuild the cached send payload with latest media IDs
      // Campaigns read this cached payload at send time so they always use fresh products
      tpl.product_config.send_payload = buildSendMessagePayload(tpl, tpl.product_config, '{{RECIPIENT_PHONE}}');

      const uploaded = cards.filter(c => c.header_media_id).length;
      const changed  = cards.filter(c => c._product_changed).length;
      console.log(`\n[AutoProducts] ✓ "${tpl.name}" — template structure UNCHANGED, send payload refreshed`);
      console.log(`  ${cardCount} cards | ${uploaded} images uploaded | ${changed} product(s) swapped`);
      cards.forEach((c, i) => console.log(`  Card ${i+1}: "${c.title || '—'}"  ${c.price || ''}  [score:${c._hot_score||0}  carts:${c._hot_carts||0}  views:${c._hot_views||0}]`));
      console.log(`  Next refresh: ${tpl.product_config.next_auto_refresh}\n`);
    } catch (e) {
      console.error(`[AutoProducts] Template "${tpl.name}" (${tpl.id}) error:`, e.message);
    }
  }

  db.save();
  console.log(`[AutoProducts] 24h refresh done — next at ${new Date(now + TWENTY_FOUR_HOURS_MS).toLocaleTimeString()}`);
}

async function runAutomation() {
  const db = getDb();
  const channelId = process.env.CHANNEL_ID || 'demo';

  const campaigns = (db.abandoned_cart_campaigns || []).filter(c => c.channel_id === channelId && c.is_active);

  for (const cam of campaigns) {
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
          return (isInitial || isFollowup) && v.visited_at < targetTime;
        }).slice(0, 5);

        await sendMultiple(db, cam, visitors, 'visit');
      }

      // ────────────────────────────────────────────────────────────────────
      // FLOW 2: Product View — user viewed a product, left without cart
      // ────────────────────────────────────────────────────────────────────
      else if (cam.campaign_type === 'product_view') {
        // Target product_views table (has exact product data)
        const views = db.product_views.filter(v => {
          if (v.channel_id !== channelId || !v.phone) return false;
          const isInitial  = !v.whatsapp_sent;
          const isFollowup = v.whatsapp_sent && (v.followup_count || 0) < 4;
          if (isFollowup) {
            const hoursSince = v.whatsapp_sent_at ? (Date.now() - new Date(v.whatsapp_sent_at).getTime()) / 3600000 : Infinity;
            const requiredGap = (v.followup_count || 1) * 24; // progressive 24/48/72
            if (hoursSince < requiredGap) return false;
          }
          // Check live visitor status — skip if user has progressed past product_view
          const visitor = db.website_visitors.find(vis => vis.phone === v.phone || vis.session_id === v.session_id);
          if (visitor && isBlockedByStatus(visitor.status, 'product_view')) return false;
          return (isInitial || isFollowup) && v.created_at < targetTime;
        }).slice(0, 5);

        await sendMultiple(db, cam, views, 'view');
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

          return (c.event_type === 'add_to_cart' || c.event_type === 'checkout_started') &&
                 (isInitial || isFollowup) && c.created_at < targetTime;
        }).slice(0, 5);

        await sendMultiple(db, cam, carts, 'cart');
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
          return isInitial || isFollowup;
        }).slice(0, 5);

        await sendMultiple(db, cam, targets, 'upsell');
      }

      // ────────────────────────────────────────────────────────────────────
      // FLOW 5: Post-Purchase — bought something, now upsell related products
      // ────────────────────────────────────────────────────────────────────
      else if (cam.campaign_type === 'post_purchase') {
        const customers = db.website_visitors.filter(v =>
          v.channel_id === channelId && v.phone && v.status === 'purchased' &&
          (v.last_purchase_at || v.visited_at) < targetTime && !v.whatsapp_sent
        ).slice(0, 5);

        await sendMultiple(db, cam, customers, 'customer');
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
            if (hoursSince < (cam.delay_hours || 24)) return false;
          }
          return isInitial || isFollowup;
        }).slice(0, 5);

        await sendMultiple(db, cam, targets, 'broadcast');
      }

    } catch (err) { console.error(`[Automation] Cam ${cam.id} error:`, err); }
  }

  db.save();
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
  active:                  ['website_visit'],
  product_view:            ['product_view'],
  abandoned_cart:          ['abandoned_cart', 'discount'],
  abandoned_checkout:      ['abandoned_checkout', 'discount'],
  followup_complete:       ['post_cart_upsell'],
  purchased:               ['post_purchase'],
};

function isBlockedByStatus(visitorStatus, campaignType) {
  if (campaignType === 'custom_broadcast') return false; // Allowed unconditionally (relies on query filters)
  if (!visitorStatus) return false;
  const allowed = STATUS_ALLOWED[visitorStatus];
  if (!allowed) return false; // unknown status — don't block
  return !allowed.includes(campaignType);
}

async function sendMultiple(db, cam, events, type) {
  const channelId = process.env.CHANNEL_ID || 'demo';

  for (const evt of events) {
    try {
      // ── LIVE STATUS GUARD: re-fetch visitor status at send time ──
      // The user may have changed status SINCE this batch was assembled.
      // This ensures we never send a lower-funnel campaign to a higher-funnel user.
      const visitor = db.website_visitors.find(v => v.phone === evt.phone);
      
      if (visitor?.is_opted_out) {
        console.log(`[Status Guard] Skipped "${cam.name}" for ${evt.phone} — user is opted out`);
        continue;
      }

      const liveStatus = visitor?.status;

      if (liveStatus && isBlockedByStatus(liveStatus, cam.campaign_type)) {
        console.log(`[Status Guard] Skipped "${cam.name}" for ${evt.phone} — user is now "${liveStatus}", campaign needs different status`);
        // Do NOT mark as sent — the correct campaign will pick them up automatically
        continue;
      }

      // Determine current stage
      const currentStage = (type === 'upsell' || type === 'broadcast')
        ? (evt.upsell_count || 0) + 1
        : (evt.followup_count || 0) + 1;

      // ── DEDUP CHECK ──
      const alreadySent = db.abandoned_cart_executions.find(x =>
        x.campaign_id === cam.id && x.phone === evt.phone && (x.stage || 1) === currentStage
      );
      if (alreadySent) {
        console.log(`[De-dupe] Already sent stage ${currentStage} of ${cam.name} to ${evt.phone}`);
        continue;
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

      // ── PATH A: Meta Carousel Template (type: "template") ──────────��──────
      // Used when campaign has a linked approved Meta carousel template.
      // This is the correct format for product recommendation campaigns.
      const metaTpl = cam.meta_template_id
        ? (db.meta_templates || []).find(t => t.id === cam.meta_template_id && t.meta_status === 'APPROVED')
        : null;

      if (metaTpl) {
        // Build the exact /messages carousel payload with language override
        const sendPayload = buildSendMessagePayload(metaTpl, metaTpl.product_config, evt.phone, metaLangCode);

        // ── FULL MESSAGE PAYLOAD LOG ─────────────────────────────────────────
        const pc = metaTpl.product_config;
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

        const sendResult = await whatsappService.sendTemplateMessage(evt.phone, sendPayload);

        saveChatMessage(db, evt.phone, sendResult.resolvedText || `[Carousel: ${metaTpl.name}]`, channelId, {
          wamid: sendResult.messageId || null,
          campaignName: cam.name,
          templateName: metaTpl.name,
        });

        db.abandoned_cart_executions.push({
          id: (db.abandoned_cart_executions.length || 0) + 1,
          campaign_id: cam.id,
          phone: evt.phone,
          name: evt.name,
          template_id: metaTpl.id,
          template_name: metaTpl.name,
          stage: currentStage,
          language: metaLangCode,
          status: sendResult.messageId ? 'sent' : 'failed',
          sent_at: new Date().toISOString(),
          is_meta_template: true,
        });

        if (type === 'upsell') {
          evt.upsell_sent    = 1;
          evt.upsell_count   = currentStage;
          evt.upsell_sent_at = new Date().toISOString();
        } else {
          evt.whatsapp_sent    = 1;
          evt.followup_count   = currentStage;
          evt.whatsapp_sent_at = new Date().toISOString();
        }

        // Stage 4 → promote visitor to followup_complete (same as PATH B)
        if (currentStage === 4) {
          const vIdx = db.website_visitors.findIndex(v => v.phone === evt.phone);
          if (vIdx >= 0 && upgradeStatus(db.website_visitors[vIdx], 'followup_complete')) {
            console.log(`[Stage 4] ${evt.phone} → followup_complete`);
          }
        }

        cam.total_sent = (cam.total_sent || 0) + 1;
        cam.last_run_at = new Date().toISOString();
        console.log(`[Automation] ${cam.name} meta-template stage-${currentStage} → ${evt.phone}`);
        continue;  // skip PATH B
      }

      // ── PATH B: Old message_templates (type: "text") ───────────────────────
      const templateRecord = db.message_templates.find(t => t.id == templateId);
      if (!templateRecord) {
        console.warn(`[Automation] Template ${templateId} not found for campaign ${cam.name}, skipping ${evt.phone}`);
        continue;
      }

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

      const sendResult = await whatsappService.sendMessage(evt.phone, components, variables);

      // ── SAVE TO CHAT INBOX (live update) ──
      saveChatMessage(db, evt.phone, sendResult.resolvedText || '', channelId, {
        wamid: sendResult.messageId || null,
        campaignName: cam.name,
        templateName,
      });

      // ── LOG EXECUTION ──
      db.abandoned_cart_executions.push({
        id: (db.abandoned_cart_executions.length || 0) + 1,
        campaign_id: cam.id,
        phone: evt.phone,
        name: evt.name,
        template_id: templateId,
        template_name: templateName,
        stage: currentStage,
        language: userLang,
        status: 'sent',
        sent_at: new Date().toISOString(),
        product_image: variables.product_image || ''
      });

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

      // ── STAGE 4 STATUS PROMOTIONS ──
      if (currentStage === 4) {
        const vIdx = db.website_visitors.findIndex(v => v.phone === evt.phone);
        if (vIdx >= 0) {
          // ANY campaign reaching stage 4 without converting upgrades to followup_complete
          // so they drop into the universal product recommendation engine (post_cart_upsell)
          if (upgradeStatus(db.website_visitors[vIdx], 'followup_complete')) {
            console.log(`[Stage 4] ${evt.phone} → followup_complete (universal upsell targeting begins)`);
          }
        }
      }

      cam.total_sent = (cam.total_sent || 0) + 1;
      cam.last_run_at = new Date().toISOString();
      console.log(`[Automation] ${cam.name} stage-${currentStage} → ${evt.phone}`);

    } catch (e) { console.error(`[Automation] Send error for ${evt.phone}:`, e); }
  }
}

/**
 * Build WhatsApp message variables depending on campaign type.
 * Each type has different dynamic data sources.
 */
function buildVariables(db, cam, evt, visitor, type, channelId) {
  const base = {
    name: evt.name || visitor?.name || 'Customer',
    total_amount: (evt.total_amount || 0).toLocaleString(),
    currency: evt.currency || null,
    cart_url: evt.cart_url || '',
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
      product_url:   evt.product_url   || '',
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
      product_url:   evt.product_url   || '',
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
      product_url:   firstPick.url   || '',
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
