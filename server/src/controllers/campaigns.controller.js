import { getDb } from '../services/database.js';
import { whatsappService } from '../services/whatsapp.service.js';
import { saveChatMessage } from './chat.controller.js';
import { buildSendMessagePayload, LANG_MAP, scrapeProductData } from './meta-templates.controller.js';
import { v4 as uuidv4 } from 'uuid';

// Sanitize text before sending to Meta — collapse multi-space, trim newlines
function sanitizeMetaText(text) {
  if (!text) return text;
  return text
    .split('\n')
    .map(line => line.replace(/ {2,}/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const campaignsController = {
  async getCampaigns(req, res, next) {
    try {
      const db = getDb();
      const channelId = req.headers['x-channel-id'] || '';
      const result = db.abandoned_cart_campaigns
        .filter(c => c.channel_id === channelId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async getCampaign(req, res, next) {
    try {
      const db = getDb();
      const { id } = req.params;
      const channelId = req.headers['x-channel-id'] || '';
      const result = db.abandoned_cart_campaigns.find(c => c.id == id && c.channel_id === channelId);
      if (!result) {
        return res.status(404).json({ error: 'Campaign not found' });
      }
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async createCampaign(req, res, next) {
    try {
      const db = getDb();
      const channelId = req.headers['x-channel-id'] || '';
      const b = req.body;
      // Accept both snake_case (from frontend) and camelCase
      const campaignType    = b.campaign_type    || b.campaignType   || 'abandoned_cart';
      const targetSegment   = b.target_segment   || b.targetSegment  || 'all';
      const targetLanguage  = b.target_language  || b.targetLanguage || 'en';
      const templateId      = b.template_id      || b.template?.id   || null;
      const templateIds     = b.template_ids     || [];
      const metaTemplateId  = b.meta_template_id || null;   // linked approved Meta carousel template
      const metaTemplateName = metaTemplateId
        ? ((db.meta_templates || []).find(t => String(t.id) === String(metaTemplateId))?.name || b.meta_template_name || null)
        : null;
      const delayHours      = b.delay_hours  != null ? Number(b.delay_hours)  : 1;
      const runTimes        = b.run_times    != null ? Number(b.run_times)    : 1; // 0 = infinite

      // For APV campaigns: auto-deactivate all existing APV campaigns for this channel
      // so only ONE is ever active. Prevents stale campaigns with wrong templates from firing.
      if (campaignType === 'abandoned_product_view') {
        for (const old of db.abandoned_cart_campaigns) {
          if (old.channel_id === channelId && old.campaign_type === 'abandoned_product_view' && old.is_active) {
            old.is_active = 0;
            old.updated_at = new Date().toISOString();
            console.log(`[Campaign] Auto-deactivated old APV campaign "${old.name}" (id=${old.id}) — replaced by new campaign`);
          }
        }
      }

      const id = Date.now(); // use timestamp for unique IDs
      const newCampaign = {
        id,
        channel_id: channelId,
        name: b.name,
        description: b.description || '',
        campaign_type: campaignType,
        target_segment: targetSegment,
        target_language: targetLanguage,
        filters: b.filters || '{}',
        template_id: templateId,
        template_ids: templateIds,
        meta_template_id: metaTemplateId,
        meta_template_name: metaTemplateName,
        stage_vars: b.stage_vars || null,   // { s1: { v1, v2 }, s2: { v1, v2 } } for abandoned_product_view
        apv_delay_min:    b.apv_delay_min    != null ? Number(b.apv_delay_min)    : null, // APV: mins before 1st msg
        apv_followup_min: b.apv_followup_min != null ? Number(b.apv_followup_min) : null, // APV: mins gap before 2nd msg
        schedule_type: 'delayed',
        delay_hours: delayHours,
        run_times: runTimes,
        is_active: 1,
        total_sent: 0,
        total_recovered: 0,
        created_at: new Date().toISOString()
      };
      
      db.abandoned_cart_campaigns.push(newCampaign);
      db.save();
      res.status(201).json(newCampaign);
    } catch (error) {
      next(error);
    }
  },

  async updateCampaign(req, res, next) {
    try {
      const db = getDb();
      const { id } = req.params;
      const channelId = req.headers['x-channel-id'] || '';
      const idx = db.abandoned_cart_campaigns.findIndex(c => c.id == id && c.channel_id === channelId);
      if (idx < 0) {
        return res.status(404).json({ error: 'Campaign not found' });
      }
      const { name, description, isActive, filters, template, template_ids, delayHours } = req.body;
      const existing = db.abandoned_cart_campaigns[idx];
      
      db.abandoned_cart_campaigns[idx] = {
        ...existing,
        name: name ?? existing.name,
        description: description ?? existing.description,
        filters: filters ? JSON.stringify(filters) : existing.filters,
        template_id:      template?.id ?? existing.template_id,
        template_name:    template?.name ?? existing.template_name,
        template_ids:     template_ids ?? existing.template_ids,
        meta_template_id: req.body.meta_template_id !== undefined ? (req.body.meta_template_id || null) : existing.meta_template_id,
        meta_template_name: (() => {
          const newId = req.body.meta_template_id !== undefined ? (req.body.meta_template_id || null) : existing.meta_template_id;
          return newId ? ((db.meta_templates || []).find(t => String(t.id) === String(newId))?.name || existing.meta_template_name || null) : null;
        })(),
        delay_hours:      delayHours ?? existing.delay_hours,
        apv_delay_min:    req.body.apv_delay_min    != null ? Number(req.body.apv_delay_min)    : existing.apv_delay_min,
        apv_followup_min: req.body.apv_followup_min != null ? Number(req.body.apv_followup_min) : existing.apv_followup_min,
        is_active:        isActive !== undefined ? (isActive ? 1 : 0) : existing.is_active,
        updated_at:       new Date().toISOString()
      };
      
      db.save();
      res.json(db.abandoned_cart_campaigns[idx]);
    } catch (error) {
      next(error);
    }
  },

  async deleteCampaign(req, res, next) {
    try {
      const db = getDb();
      const { id } = req.params;
      const channelId = req.headers['x-channel-id'] || '';
      const idx = db.abandoned_cart_campaigns.findIndex(c => String(c.id) === String(id) && c.channel_id === channelId);
      if (idx < 0) return res.status(404).json({ error: 'Campaign not found' });

      const campaign = db.abandoned_cart_campaigns[idx];

      // 1. Remove execution history for this campaign
      if (db.abandoned_cart_executions) {
        db.abandoned_cart_executions = db.abandoned_cart_executions.filter(
          e => String(e.campaign_id) !== String(id)
        );
      }

      // 2. For automation campaigns — reset the whatsapp_sent flags so automation
      //    stops targeting these events (no orphaned state left behind).
      const type = campaign.campaign_type;
      const now  = new Date().toISOString();

      if (type === 'abandoned_product_view' || type === 'product_view') {
        // Release all visitors currently locked by this campaign back to product_view
        // so they are no longer stuck in a campaign that no longer exists.
        if (type === 'abandoned_product_view') {
          // Collect ALL phones that had any lock for this campaign (active + completed cycles)
          const allCamLocks = (db.campaign_locks || []).filter(l =>
            String(l.campaign_id) === String(id)
          );
          const affectedPhones = new Set(allCamLocks.map(l => l.phone));

          // Release every affected visitor back to a clean re-enterable state:
          // • product_view_lock  → product_view  (was mid-campaign)
          // • product_recommendation / followup_complete → active (completed cycle — fully reset
          //   so they re-enter from scratch with the new campaign, no stale cycle baggage)
          for (const phone of affectedPhones) {
            const visitor = (db.website_visitors || []).find(v =>
              v.phone === phone && v.channel_id === channelId
            );
            if (!visitor) continue;
            const prev = visitor.status;
            if (visitor.status === 'product_view_lock') {
              visitor.status = 'product_view';
            } else if (visitor.status === 'product_recommendation' || visitor.status === 'followup_complete') {
              visitor.status = 'active';
            }
            visitor.updated_at = now;
            if (visitor.status !== prev)
              console.log(`[Campaign Delete] ${phone} → ${visitor.status} (was ${prev}, released from deleted campaign)`);
            // Reset product_view send flags so a new campaign can target them fresh
            (db.product_views || []).forEach(pv => {
              if (pv.phone === phone) {
                pv.whatsapp_sent = 0; pv.followup_count = 0; pv.whatsapp_sent_at = null;
                delete pv.campaign_id;
              }
            });
          }
          // Remove all campaign_locks for this campaign (active + completed)
          db.campaign_locks = (db.campaign_locks || []).filter(l =>
            String(l.campaign_id) !== String(id)
          );
          console.log(`[Campaign Delete] Cleared ${allCamLocks.length} lock(s) and reset ${affectedPhones.size} visitor(s)`);
        }

        // Reset product_view records that were sent by this campaign (mid-flight only)
        (db.product_views || []).forEach(v => {
          if (String(v.campaign_id) === String(id) || !v.campaign_id) {
            if ((v.followup_count || 0) < 2) {
              v.whatsapp_sent    = 0;
              v.whatsapp_sent_at = null;
              v.followup_count   = 0;
              delete v.campaign_id;
            }
          }
        });
      } else if (type === 'abandoned_cart' || type === 'abandoned_checkout' || type === 'discount') {
        (db.cart_events || []).forEach(e => {
          if (String(e.campaign_id) === String(id)) {
            e.whatsapp_sent    = 0;
            e.whatsapp_sent_at = null;
            e.followup_count   = 0;
            delete e.campaign_id;
          }
        });
      } else if (type === 'post_cart_upsell') {
        (db.website_visitors || []).forEach(v => {
          if (String(v.upsell_campaign_id) === String(id)) {
            v.upsell_sent    = 0;
            v.upsell_sent_at = null;
            delete v.upsell_campaign_id;
          }
        });
      } else if (type === 'post_purchase') {
        (db.website_visitors || []).forEach(v => {
          if (String(v.purchase_campaign_id) === String(id)) {
            v.whatsapp_sent = 0;
            delete v.purchase_campaign_id;
          }
        });
      }

      // 3. Remove the campaign itself
      db.abandoned_cart_campaigns.splice(idx, 1);
      db.save();

      res.json({ success: true, deleted: id, type });
    } catch (error) {
      next(error);
    }
  },

  async sendCampaign(req, res, next) {
    try {
      const db = getDb();
      const { id } = req.params;
      const channelId = req.headers['x-channel-id'] || '';
      const campaign = db.abandoned_cart_campaigns.find(c => c.id == id && c.channel_id === channelId);
      if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

      // ── Build target audience ──────────────────────────────────────────────
      let targetEvents = [];
      const seg = campaign.target_segment || 'all';

      const applyRule = (visitor, rule) => {
        const cv = visitor[rule.field];
        if (rule.op === 'eq')       return String(cv ?? '').toLowerCase() === String(rule.value ?? '').toLowerCase();
        if (rule.op === 'contains') return String(cv ?? '').toLowerCase().includes(String(rule.value ?? '').toLowerCase());
        if (rule.op === 'gte')      return Number(cv ?? 0) >= Number(rule.value ?? 0);
        if (rule.op === 'lte')      return Number(cv ?? 0) <= Number(rule.value ?? 0);
        return true;
      };

      if (campaign.campaign_type === 'custom' || campaign.campaign_type === 'product_recommendation') {
        let filterDef = { logic: 'AND', rules: [] };
        try { filterDef = JSON.parse(campaign.filters || '{}'); } catch (_) {}
        const { logic = 'AND', rules = [] } = filterDef;
        targetEvents = db.website_visitors.filter(v => {
          if (v.channel_id !== channelId || !v.phone) return false;
          if (!rules.length) return true;
          const results = rules.map(r => applyRule(v, r));
          return logic === 'AND' ? results.every(Boolean) : results.some(Boolean);
        });
      } else if (campaign.campaign_type === 'abandoned_cart') {
        targetEvents = db.cart_events.filter(c => c.channel_id === channelId && !c.recovered && c.phone);
      } else if (campaign.campaign_type === 'product_view' || campaign.campaign_type === 'abandoned_product_view') {
        const _sr = (db.channel_settings || []).find(s => s.channel_id === channelId);
        const _cs = _sr ? (() => { try { return JSON.parse(_sr.settings || '{}'); } catch(_) { return {}; } })() : {};
        const _slug = (_cs.product_url_slug || '/products').replace(/\/+$/, '');
        targetEvents = db.product_views.filter(v =>
          v.channel_id === channelId && v.phone &&
          v.product_url && v.product_url.includes(_slug)
        );
      } else {
        targetEvents = db.website_visitors.filter(v => {
          if (v.channel_id !== channelId || !v.phone) return false;
          if (seg === 'purchasers' || campaign.campaign_type === 'post_purchase') return v.status === 'purchased';
          if (seg === 'hot_users') return v.status === 'hot_user';
          if (seg === 'active_visitors') return v.status === 'active' || v.status === 'product_view';
          return true;
        });
      }

      // ── Resolve linked templates ───────────────────────────────────────────
      const metaTpl = campaign.meta_template_id
        ? (db.meta_templates || []).find(t => String(t.id) === String(campaign.meta_template_id))
        : null;

      const templateId = (campaign.template_ids?.length > 0)
        ? campaign.template_ids[0]
        : (campaign.template_id || null);
      const templateRecord = templateId ? db.message_templates.find(t => t.id == templateId) : null;

      let baseText = '';
      if (templateRecord?.body_text) {
        baseText = templateRecord.body_text;
      } else if (templateRecord?.components) {
        try {
          const comps = JSON.parse(templateRecord.components);
          baseText = comps.find(c => c.type === 'body')?.text || comps[0]?.text || '';
        } catch (_) {}
      }

      // Deduplicate by phone — never send the same campaign twice to the same number in one batch
      const sentPhones = new Set();
      let sent = 0;
      let skipped = 0;
      const errors = [];
      const payloads = []; // collect every Meta API payload for frontend console logging

      for (const target of targetEvents) {
        if (!target.phone) continue;
        if (sentPhones.has(target.phone)) continue;
        sentPhones.add(target.phone);

        // Language: use campaign setting → template's own language → 'en' fallback
        const tplLang = metaTpl?.language || 'en';
        const userLang = campaign.target_language === 'per_user'
          ? (target.language || tplLang)
          : (campaign.target_language || tplLang);
        const metaLangCode = LANG_MAP[userLang] || userLang;

        let wamid = null;
        let resolvedText = '';

        // ── PATH A: Meta template send (carousel / approved template) ─────────
        let cardsSent = [];
        if (metaTpl) {
          const sendPayload = buildSendMessagePayload(metaTpl, metaTpl.product_config, target.phone, metaLangCode, campaign.id);
          console.log(`[Campaign Send] Meta template "${metaTpl.name}" → ${target.phone}`);
          console.log(JSON.stringify(sendPayload, null, 2));
          payloads.push({ phone: target.phone, template: metaTpl.name, payload: sendPayload });

          // Build resolved text from actual product cards for chat inbox
          cardsSent = (metaTpl.product_config?.cards || []).map(c => ({
            title:    c.title    || '',
            price:    c.price    || '',
            link:     c.link     || '',
            media_id: c.media_id || '',
            image:    c._hot_image_url || c.image || '',
          }));
          resolvedText = cardsSent.length
            ? `[Carousel: ${metaTpl.name}]\n` + cardsSent.map((c, i) =>
                `Card ${i + 1}: ${c.title || '—'}${c.price ? ' • ' + c.price : ''}${c.link ? '\n' + c.link : ''}`
              ).join('\n')
            : `[Template: ${metaTpl.name}]`;

          let sendOk = false;
          try {
            const result = await whatsappService.sendTemplateMessage(target.phone, sendPayload);
            wamid = result.messageId || null;
            sendOk = !!wamid;
            if (!sendOk) {
              const errMsg = `Meta returned no wamid for ${target.phone}`;
              console.error('[Campaign]', errMsg);
              errors.push(errMsg);
            }
          } catch (e) {
            console.error('[Campaign] Meta template send error:', e.message);
            errors.push(`${target.phone}: ${e.message}`);
          }
          if (!sendOk) { skipped++; continue; }

        // ── PATH B: Regular text/template message ─────────────────────────────
        } else {
          const _tagUrl = (url, ph) => {
            if (!url || !ph) return url || '';
            const tag = Buffer.from(String(ph)).toString('base64')
              .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
            return url + (url.includes('?') ? '&' : '?') + 'ww_src=' + tag;
          };
          const variables = {
            name: target.name || 'Customer',
            product_name: target.product_name || '',
            product_price: target.product_price || String(target.total_amount || ''),
            total_amount: String(target.total_amount || ''),
            cart_url:    _tagUrl(target.cart_url,    target.phone),
            product_url: _tagUrl(target.product_url, target.phone),
            product_image: target.product_image || '',
          };
          if (templateRecord?.product_data) {
            try {
              const pd = typeof templateRecord.product_data === 'string' ? JSON.parse(templateRecord.product_data) : templateRecord.product_data;
              if (pd.name || pd.title) variables.product_name  = pd.name || pd.title;
              if (pd.price)            variables.product_price = String(pd.price);
              if (pd.image)            variables.product_image = pd.image;
              if (pd.link || pd.url)   variables.product_url   = pd.link || pd.url;
            } catch (_) {}
          }
          // Sanitize all variable values before substitution
          for (const k of Object.keys(variables)) {
            if (typeof variables[k] === 'string') variables[k] = sanitizeMetaText(variables[k]);
          }
          resolvedText = sanitizeMetaText(baseText);
          for (const [k, v] of Object.entries(variables)) {
            resolvedText = resolvedText.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
          }
          let sendOk = false;
          try {
            const result = await whatsappService.sendMessage(target.phone, [{ type: 'body', text: sanitizeMetaText(baseText) }], variables);
            wamid = result.messageId || null;
            resolvedText = result.resolvedText || resolvedText;
            sendOk = !!wamid;
          } catch (e) {
            console.error('[Campaign] Send error:', e.message);
            errors.push(`${target.phone}: ${e.message}`);
          }
          if (!sendOk) { skipped++; continue; }
        }

        saveChatMessage(db, target.phone, resolvedText, channelId, {
          wamid,
          campaignName: campaign.name,
          templateName: metaTpl?.name || templateRecord?.name || null,
        });

        db.abandoned_cart_executions.push({
          id: (db.abandoned_cart_executions.length || 0) + 1,
          campaign_id: id,
          campaign_name: campaign.name,
          cart_event_id: target.cart_id || target.id,
          phone: target.phone,
          name: target.name || null,
          template_id: metaTpl?.id || templateId,
          template_name: metaTpl?.name || templateRecord?.name || null,
          stage: 1,
          language: metaLangCode,
          status: wamid ? 'sent' : 'failed',
          sent_at: new Date().toISOString(),
          is_meta_template: !!metaTpl,
          cards_sent: cardsSent.length ? cardsSent : undefined,
        });

        target.whatsapp_sent    = 1;
        target.followup_count   = (target.followup_count || 0) + 1;
        target.whatsapp_sent_at = new Date().toISOString();
        sent++;
      }

      campaign.total_sent  = (campaign.total_sent || 0) + sent;
      campaign.last_run_at = new Date().toISOString();
      db.save();

      res.json({ success: true, sent, skipped, errors: errors.length ? errors : undefined, payloads });
    } catch (error) {
      next(error);
    }
  },

  async sendTestMessage(req, res, next) {
    try {
      const db = getDb();
      const { id } = req.params;
      const { phone } = req.body;
      if (!phone) return res.status(400).json({ error: 'phone is required' });

      const headerChannelId = req.headers['x-channel-id'] || '';
      // Find by ID — also accept demo/empty channel campaigns for backwards compat
      const campaign = db.abandoned_cart_campaigns.find(c =>
        c.id == id && (c.channel_id === headerChannelId || c.channel_id === 'demo' || c.channel_id === '')
      );
      if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
      // Use campaign's real channelId for credentials — same as automation does
      const channelId = (campaign.channel_id && campaign.channel_id !== 'demo' && campaign.channel_id !== '')
        ? campaign.channel_id : headerChannelId;

      const metaTpl = campaign.meta_template_id
        ? (db.meta_templates || []).find(t => String(t.id) === String(campaign.meta_template_id))
        : null;

      const tplLang = metaTpl?.language || campaign.target_language || 'en';
      const metaLangCode = LANG_MAP[tplLang] || tplLang;

      const result = { phone, campaign: campaign.name, template: null, payload: null, wamid: null, success: false, error: null, product_used: null };

      if (!metaTpl) {
        result.error = 'No Meta template linked to this campaign — link a Meta template first';
        return res.json(result);
      }

      // ── Build per-user product config for abandoned_product_view ──────────────
      let productConfig = metaTpl.product_config;

      if (!metaTpl.is_carousel && campaign.campaign_type === 'abandoned_product_view') {
        // Pick a random product_view record from this channel as the test product
        const _tsr = (db.channel_settings || []).find(s => s.channel_id === channelId);
        const _tcs = _tsr ? (() => { try { return JSON.parse(_tsr.settings || '{}'); } catch(_) { return {}; } })() : {};
        const _tSlug = (_tcs.product_url_slug || '/products').replace(/\/+$/, '');
        const allViews = (db.product_views || []).filter(v =>
          v.channel_id === channelId && v.product_url && v.product_url.includes(_tSlug)
        );
        const randomView = allViews.length > 0
          ? allViews[Math.floor(Math.random() * allViews.length)]
          : null;

        let productName  = randomView?.product_name  || '';
        let productPrice = randomView?.product_price || '';
        let productImage = randomView?.product_image || '';
        let productUrl   = randomView?.product_url   || '';

        console.log(`[TestSend] Picked product view: ${productUrl || '(none)'}`);

        // Scrape if data is missing and URL exists
        if (productUrl && (!productName || !productPrice || !productImage)) {
          try {
            console.log(`[TestSend] Scraping ${productUrl}…`);
            const scraped = await scrapeProductData(productUrl);
            if (!productName  && (scraped.title || scraped.name))      productName  = scraped.title || scraped.name;
            if (!productPrice && scraped.price)                         productPrice = scraped.price;
            if (!productImage && (scraped.image_url || scraped.image))  productImage = scraped.image_url || scraped.image;
            console.log(`[TestSend] Scraped: "${productName}" ${productPrice} img=${!!productImage}`);
          } catch (scrapeErr) {
            console.warn(`[TestSend] Scrape failed: ${scrapeErr.message}`);
          }
        }

        // Fallback to template example_values if still no data
        if (!productName || !productImage) {
          const ex = Array.isArray(metaTpl.example_values) ? {} : (metaTpl.example_values || {});
          if (!productName)  productName  = ex['1'] || 'Sample Product';
          if (!productPrice) productPrice = ex['2'] || '';
          if (!productUrl)   productUrl   = metaTpl.header_image_url ? '' : '';
        }

        // Stage vars from campaign
        const sv = campaign.stage_vars || {};
        const stageTpl = sv['s1'] || {};
        const tok = (s) => (s || '')
          .replace(/\{product_name\}/g,  productName)
          .replace(/\{product_price\}/g, productPrice)
          .replace(/\{product_url\}/g,   productUrl)
          .replace(/\{customer_name\}/g, 'Test Customer');
        const v1 = tok(stageTpl.v1) || productName  || 'Check this product';
        const v2 = tok(stageTpl.v2) || productPrice || 'Limited time offer';

        // Upload product image to Meta → media_id
        let productMediaId = '';
        if (productImage) {
          const cached = (db.gallery_images || []).find(
            g => g.source_url === productImage && g.channel_id === channelId && g.media_id
          );
          if (cached) {
            productMediaId = cached.media_id;
            console.log(`[TestSend] Image cache hit — media_id: ${productMediaId}`);
          } else {
            try {
              const { buffer, mimeType } = await whatsappService.downloadImage(productImage);
              productMediaId = await whatsappService.uploadMedia(buffer, `test_${Date.now()}.jpg`, mimeType, channelId);
              // Cache it
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
                filename: `test_${Date.now()}.jpg`, media_id: productMediaId,
                source_url: productImage, created_at: new Date().toISOString(),
              });
              db.save();
              console.log(`[TestSend] Image uploaded → media_id: ${productMediaId}`);
            } catch (imgErr) {
              console.warn(`[TestSend] Image upload failed: ${imgErr.message} — using template header fallback`);
              productMediaId = metaTpl.header_image_id || '';
            }
          }
        } else {
          productMediaId = metaTpl.header_image_id || '';
        }

        productConfig = {
          cards: [{
            '1':      v1,
            '2':      v2,
            name:     'Test Customer',
            title:    productName,
            price:    productPrice,
            link:     productUrl,
            url:      productUrl,
            image:    productImage,
            media_id: productMediaId,
          }],
        };

        result.product_used = { name: productName, price: productPrice, url: productUrl, image: productImage, media_id: productMediaId, v1, v2 };
      }

      // ── Build productConfig for order_confirmation campaigns ─────────────────
      if (campaign.campaign_type === 'order_confirmation' && !metaTpl.is_carousel) {
        const RAND_NAMES    = ['Priya Sharma', 'Rahul Verma', 'Anjali Singh', 'Karan Mehta', 'Neha Patel', 'Vikram Joshi'];
        const RAND_PRODUCTS = [
          'Blue Anarkali Kurti × 1', 'Red Silk Saree × 1', 'Cotton Kurta Set × 2',
          'Embroidered Dupatta × 1 + Kurti × 1', 'Floral Print Dress × 1',
          'Rayon Palazzo Set × 2', 'Georgette Salwar Suit × 1',
        ];
        const RAND_TOTALS   = ['649', '799', '1099', '1249', '1599', '2099', '899'];
        const RAND_PAYMENTS = ['Cash on Delivery', 'Cash on Delivery', 'Cash on Delivery', 'UPI', 'Prepaid'];
        const pick = arr => arr[Math.floor(Math.random() * arr.length)];
        const randId = 'ORD-' + Math.floor(100000 + Math.random() * 900000);

        const testName     = pick(RAND_NAMES);
        const testOrderId  = randId;
        const testProducts = pick(RAND_PRODUCTS);
        const testTotal    = pick(RAND_TOTALS);
        const testPayment  = pick(RAND_PAYMENTS);
        const testImage    = metaTpl.header_image_url || '';

        productConfig = {
          cards: [{
            name:             testName,
            customer_name:    testName,
            order_id:         testOrderId,
            order_number:     testOrderId,
            order_products:   testProducts,
            products_summary: testProducts,
            order_total:      testTotal,
            total_amount:     testTotal,
            payment_method:   testPayment,
            delivery_date:    '3–5 business days',
            image:            testImage,
            image_url:        testImage,
            media_id:         metaTpl.header_image_id || '',
            // link/url used as fallback for URL button suffix resolution
            link:             testOrderId,
            url:              testOrderId,
          }],
        };
        result.product_used = { name: testName, order_id: testOrderId, products: testProducts, total: testTotal, payment: testPayment };
      }

      const sendPayload = buildSendMessagePayload(metaTpl, productConfig, phone, metaLangCode, campaign.id);
      result.template = metaTpl.name;
      result.payload  = sendPayload;

      console.log(`\n[TestSend] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`[TestSend] Campaign : "${campaign.name}"`);
      console.log(`[TestSend] Template : "${metaTpl.name}" (${metaLangCode})`);
      console.log(`[TestSend] To       : ${phone}`);
      if (result.product_used) {
        console.log(`[TestSend] Product  : "${result.product_used.name}" | ${result.product_used.price}`);
        console.log(`[TestSend] v1="${result.product_used.v1}" v2="${result.product_used.v2}"`);
      }
      console.log(`[TestSend] Payload  :\n${JSON.stringify(sendPayload, null, 2)}`);

      try {
        const apiResult = await whatsappService.sendTemplateMessage(phone, sendPayload, channelId);
        result.wamid    = apiResult.messageId || null;
        result.success  = !!result.wamid;
        console.log(`[TestSend] ✓ wamid: ${result.wamid}`);
      } catch (e) {
        result.error   = e.message;
        result.success = false;
        console.error(`[TestSend] ✗ Error: ${e.message}`);
      }

      console.log(`[TestSend] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async updateStatus(req, res, next) {
    try {
      const db = getDb();
      const { id } = req.params;
      const { status } = req.body;
      const channelId = req.headers['x-channel-id'] || '';
      const idx = db.abandoned_cart_campaigns.findIndex(c => c.id == id && c.channel_id === channelId);
      if (idx < 0) {
        return res.status(404).json({ error: 'Campaign not found' });
      }
      const campaign    = db.abandoned_cart_campaigns[idx];
      const newIsActive = (status === 'running' || status === 'scheduled') ? 1 : 0;
      campaign.is_active = newIsActive;

      // When pausing an APV campaign: release product_view_lock visitors if no other
      // active APV campaign exists — otherwise they'd be stuck with no messages sending.
      if (newIsActive === 0 && campaign.campaign_type === 'abandoned_product_view') {
        const channelId = campaign.channel_id;
        const otherActiveAPV = db.abandoned_cart_campaigns.some(c =>
          String(c.id) !== String(id) &&
          c.channel_id === channelId &&
          c.campaign_type === 'abandoned_product_view' &&
          c.is_active
        );
        if (!otherActiveAPV) {
          const now = new Date().toISOString();
          const activeLocks = (db.campaign_locks || []).filter(l =>
            String(l.campaign_id) === String(id) && l.lock_status === 'active'
          );
          for (const lock of activeLocks) {
            const visitor = (db.website_visitors || []).find(v =>
              v.phone === lock.phone && v.channel_id === channelId && v.status === 'product_view_lock'
            );
            if (visitor) {
              visitor.status     = 'product_view';
              visitor.updated_at = now;
              console.log(`[Campaign Pause] ${visitor.phone} → product_view (no other active APV)`);
            }
          }
        }
      }

      db.save();
      res.json(campaign);
    } catch (error) {
      next(error);
    }
  },

  async debugPayload(req, res, next) {
    try {
      const db  = getDb();
      const { id } = req.params;
      const { phone } = req.body;
      const headerChannelId = req.headers['x-channel-id'] || '';

      const campaign = db.abandoned_cart_campaigns.find(c =>
        c.id == id && (c.channel_id === headerChannelId || c.channel_id === 'demo' || c.channel_id === '')
      );
      if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
      const channelId = (campaign.channel_id && campaign.channel_id !== 'demo') ? campaign.channel_id : headerChannelId;

      // ── Credentials ──
      const rows = db.channel_settings || [];
      let credSource = null, token = null, phoneId = null, appId = null;
      const channelRow = rows.find(s => s.channel_id === channelId);
      if (channelRow) {
        const s = JSON.parse(channelRow.settings || '{}');
        if (s.whatsapp_token && s.whatsapp_phone_id) {
          token = s.whatsapp_token; phoneId = s.whatsapp_phone_id; appId = s.whatsapp_app_id || null;
          credSource = `DB channel="${channelId}"`;
        }
      }
      if (!token) {
        for (const row of rows) {
          if (row.channel_id === 'demo') continue;
          const s = JSON.parse(row.settings || '{}');
          if (s.whatsapp_token && s.whatsapp_phone_id) {
            token = s.whatsapp_token; phoneId = s.whatsapp_phone_id; appId = s.whatsapp_app_id || null;
            credSource = `DB best-match channel="${row.channel_id}"`;
            break;
          }
        }
      }
      // DB-only — no env var fallback for WhatsApp credentials

      // ── Product data for this phone ──
      const visitor  = (db.website_visitors || []).find(v => v.phone === phone && v.channel_id === channelId);
      const viewRec  = (db.product_views   || []).filter(v => v.phone === phone && v.channel_id === channelId)
                         .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;
      const lock     = (db.campaign_locks  || []).find(l => l.phone === phone && String(l.campaign_id) === String(id));

      // ── Meta template ──
      const metaTpl  = campaign.meta_template_id
        ? (db.meta_templates || []).find(t => String(t.id) === String(campaign.meta_template_id))
        : null;

      let payload = null;
      if (metaTpl) {
        const { buildSendMessagePayload } = await import('./meta-templates.controller.js');
        const pc = metaTpl.product_config || {};
        payload = buildSendMessagePayload(metaTpl, pc, phone || '919999999999', metaTpl.language || 'en', campaign.id);
      }

      // ── Verify token against Meta ──
      let metaVerify = null;
      if (token && phoneId) {
        try {
          const vRes = await fetch(`https://graph.facebook.com/v25.0/${phoneId}?fields=verified_name,display_phone_number,status`, {
            headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000),
          });
          metaVerify = await vRes.json();
        } catch (e) { metaVerify = { error: e.message }; }
      }

      res.json({
        campaign:      { id: campaign.id, name: campaign.name, type: campaign.campaign_type, channel_id: campaign.channel_id },
        credentials:   { source: credSource, phone_id: phoneId, app_id: appId, token_prefix: token ? token.substring(0,20)+'...' : null, token_length: token?.length || 0 },
        meta_verify:   metaVerify,
        visitor:       visitor ? { phone: visitor.phone, status: visitor.status, name: visitor.name } : null,
        product_view:  viewRec  ? { product_name: viewRec.product_name, product_url: viewRec.product_url, product_price: viewRec.product_price, product_image: viewRec.product_image, created_at: viewRec.created_at } : null,
        campaign_lock: lock     ? { stage: lock.stage, locked_at: lock.locked_at, stage_1_sent_at: lock.stage_1_sent_at } : null,
        meta_template: metaTpl  ? { id: metaTpl.id, name: metaTpl.name, status: metaTpl.meta_status, language: metaTpl.language } : null,
        api_url:       phoneId  ? `https://graph.facebook.com/v25.0/${phoneId}/messages` : null,
        payload,
      });
    } catch (error) { next(error); }
  },

  async getCampaignAnalytics(req, res, next) {
    try {
      const db = getDb();
      const { id } = req.params;
      const channelId = req.headers['x-channel-id'] || '';

      const campaign = db.abandoned_cart_campaigns.find(c => String(c.id) === String(id) && c.channel_id === channelId);
      if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

      // ── All locks for this campaign ───────────────────────────────────────────
      const locks = (db.campaign_locks || []).filter(l =>
        l.channel_id === channelId && String(l.campaign_id) === String(id)
      );
      const lockedPhones = new Set(locks.map(l => l.phone));

      // ── All executions for this campaign ─────────────────────────────────────
      const executions = (db.abandoned_cart_executions || [])
        .filter(e => String(e.campaign_id) === String(id));

      // ── Per-phone exec lookup — uses LOCK timestamps as source of truth ─────────
      // After re-entry, lock.stage_1_sent_at is reset to null. We find the
      // execution that most closely matches the lock's current-cycle timestamp
      // (within 5 min). This avoids showing old-cycle sends as "sent".
      const findExecForLock = (lockTs, stageNum) => {
        if (!lockTs) return null; // not sent in current cycle
        const lockMs = new Date(lockTs).getTime();
        return executions
          .filter(x => (x.stage || 1) === stageNum)
          .sort((a, b) =>
            Math.abs(new Date(a.sent_at).getTime() - lockMs) -
            Math.abs(new Date(b.sent_at).getTime() - lockMs)
          )
          .find(x => Math.abs(new Date(x.sent_at).getTime() - lockMs) < 5 * 60 * 1000) || null;
      };

      // ── Inbound chat messages — only AFTER current-cycle stage 1 send ─────────
      // Replies from before the current campaign cycle (old campaigns, old runs)
      // are excluded so analytics shows only responses to THIS campaign.
      const getInbound = (phone, sinceIso) => {
        const sinceMs = sinceIso ? new Date(sinceIso).getTime() : 0;
        return (db.chat_messages || [])
          .filter(m =>
            m.phone === phone && m.channel_id === channelId && m.direction === 'in' &&
            new Date(m.timestamp || m.created_at).getTime() > sinceMs
          )
          .sort((a, b) =>
            new Date(b.timestamp || b.created_at) - new Date(a.timestamp || a.created_at)
          );
      };

      // ── Visitor map for enrichment ────────────────────────────────────────────
      const visitorByPhone = {};
      (db.website_visitors || [])
        .filter(v => v.channel_id === channelId && v.phone)
        .forEach(v => {
          if (!visitorByPhone[v.phone] || new Date(v.visited_at) > new Date(visitorByPhone[v.phone].visited_at)) {
            visitorByPhone[v.phone] = v;
          }
        });

      // ── Latest product view per phone ─────────────────────────────────────────
      const latestViewByPhone = {};
      (db.product_views || [])
        .filter(v => v.channel_id === channelId)
        .forEach(v => {
          const ph = v.phone || (db.website_visitors.find(vis => vis.session_id === v.session_id && vis.channel_id === channelId))?.phone;
          if (!ph) return;
          if (!latestViewByPhone[ph] || new Date(v.created_at) > new Date(latestViewByPhone[ph].created_at)) {
            latestViewByPhone[ph] = { ...v, phone: ph };
          }
        });

      // ── Purchases ─────────────────────────────────────────────────────────────
      const purchasedPhones = new Set(
        locks.filter(l => l.lock_status === 'purchased').map(l => l.phone)
      );
      const revenueByPhone = {};
      locks.forEach(l => {
        if (l.lock_status === 'purchased' && l.revenue) {
          revenueByPhone[l.phone] = (revenueByPhone[l.phone] || 0) + parseFloat(l.revenue || 0);
        }
      });
      // Also pull from purchase_history
      (db.purchase_history || []).filter(p => p.channel_id === channelId && lockedPhones.has(p.phone)).forEach(p => {
        if (!revenueByPhone[p.phone]) revenueByPhone[p.phone] = 0;
        revenueByPhone[p.phone] += parseFloat(p.total_amount || 0);
      });

      // ── Per-user data — only locked users (those who entered the campaign) ──────
      const users = locks.map(lock => {
        const phone   = lock.phone;
        const visitor = visitorByPhone[phone] || {};
        const viewRec = latestViewByPhone[phone] || null;

        // Current-cycle timestamps from the lock (null = not sent / reset by re-entry)
        const s1At = lock.stage_1_sent_at || null;
        const s2At = lock.stage_2_sent_at || null;

        // Match execution to current cycle by timestamp proximity
        const s1Exec = findExecForLock(s1At, 1);
        const s2Exec = findExecForLock(s2At, 2);

        // Replies: only AFTER current-cycle stage 1 send (ignores pre-campaign replies)
        const msgs = getInbound(phone, s1At);
        const lastMsg = msgs[0] || null;

        // Clicked: product viewed > 1 min after current-cycle stage 1 send
        const s1Ms = s1At ? new Date(s1At).getTime() : null;
        const clicked = s1Ms
          ? (db.product_views || []).some(pv =>
              pv.phone === phone && pv.channel_id === channelId &&
              new Date(pv.created_at).getTime() > s1Ms + 60000
            )
          : false;

        return {
          phone,
          name:         lock.name        || visitor.name || 'Unknown',
          city:         visitor.city     || '',
          device:       visitor.device   || '',
          product_name:  viewRec?.product_name  || lock.product_name  || '',
          product_url:   lock.product_url  || viewRec?.product_url  || '',
          product_price: viewRec?.product_price || lock.product_price || '',
          // Stage 1: use lock timestamp as truth; exec for status/error
          stage1_sent_at: s1At,
          stage1_status:  s1At ? (s1Exec?.status || 'sent') : null,
          stage1_error:   s1Exec?.error || null,
          // Stage 2: same
          stage2_sent_at: s2At,
          stage2_status:  s2At ? (s2Exec?.status || 'sent') : null,
          stage2_error:   s2Exec?.error || null,
          // Responses — current cycle only
          responded:        msgs.length > 0,
          response_count:   msgs.length,
          last_response:    lastMsg?.text || null,
          last_response_at: lastMsg ? (lastMsg.timestamp || lastMsg.created_at) : null,
          all_responses:    msgs.slice(0, 10).map(m => ({ text: m.text || '', at: m.timestamp || m.created_at })),
          clicked,
          lock_status:  lock.lock_status || 'active',
          purchased:    lock.lock_status === 'purchased',
          revenue:      revenueByPhone[phone] || 0,
          locked_at:    lock.locked_at || null,
          cycle_count:  lock.cycle_count || 1,
          send_history: lock.send_history || [],
          // Campaign attribution — stored on visitor when APV stage 2 completes
          apv_source_campaign_id:   visitor.apv_source_campaign_id   || null,
          apv_source_campaign_name: visitor.apv_source_campaign_name || null,
          apv_completed_at:         visitor.apv_completed_at         || lock.stage_2_sent_at || null,
          current_visitor_status:   visitor.status || 'product_view',
        };
      });

      // ── Summary — based on current-cycle lock state, not raw execution count ────
      const stage1Sent   = users.filter(u => u.stage1_status === 'sent').length;
      const stage2Sent   = users.filter(u => u.stage2_status === 'sent').length;
      const totalFailed  = users.filter(u => u.stage1_status === 'failed' || u.stage2_status === 'failed').length;
      const respondedCount = users.filter(u => u.responded).length;
      const clickedCount   = users.filter(u => u.clicked).length;
      const cartAdds       = locks.filter(l => ['cart_added', 'purchased'].includes(l.lock_status)).length;
      const purchasesCount = locks.filter(l => l.lock_status === 'purchased').length;
      const totalRevenue   = locks.reduce((s, l) => s + parseFloat(l.revenue || 0), 0);
      const responseRate   = users.length > 0 ? +((respondedCount / users.length) * 100).toFixed(1) : 0;

      const summary = {
        total_users:   users.length,
        stage1_sent:   stage1Sent,
        stage2_sent:   stage2Sent,
        total_failed:  totalFailed,
        responded:     respondedCount,
        clicked:       clickedCount,
        cart_adds:     cartAdds,
        purchases:     purchasesCount,
        revenue:       totalRevenue,
        response_rate: responseRate,
        // legacy fields kept for existing analytics panel
        total_sent:    stage1Sent,
        msg_clicked:   clickedCount,
        clicks:        clickedCount,
        add_to_carts:  cartAdds,
        open_rate:     stage1Sent > 0 ? +((clickedCount / stage1Sent) * 100).toFixed(1) : 0,
        cart_rate:     clickedCount > 0 ? +((cartAdds / clickedCount) * 100).toFixed(1) : 0,
        buy_rate:      clickedCount > 0 ? +((purchasesCount / clickedCount) * 100).toFixed(1) : 0,
      };

      res.json({
        summary,
        users: users.slice(0, 200),
        campaign: { id: campaign.id, name: campaign.name, campaign_type: campaign.campaign_type },
      });
    } catch (error) { next(error); }
  },

  async getExecutions(req, res, next) {
    try {
      const db = getDb();
      const { id } = req.params;
      const channelId = req.headers['x-channel-id'] || '';
      const cam = db.abandoned_cart_campaigns.find(c => c.id == id && c.channel_id === channelId);
      if (!cam) return res.status(404).json({ error: 'Campaign not found' });
      const result = db.abandoned_cart_executions
        .filter(e => e.campaign_id == id && e.status !== 'archived_reentry')
        .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())
        .slice(0, 200)
        .map(e => ({
          ...e,
          campaign_name: e.campaign_name || cam?.name || null,
        }));
      const totalSent   = result.filter(e => e.status === 'sent').length;
      const totalFailed = result.filter(e => e.status === 'failed').length;
      res.json({ executions: result, totalSent, totalFailed });
    } catch (error) {
      next(error);
    }
  },

  async getAudience(req, res, next) {
    try {
      const db = getDb();
      const { id } = req.params;
      const channelId = req.headers['x-channel-id'] || '';
      const campaign = db.abandoned_cart_campaigns.find(c =>
        c.id == id && (c.channel_id === channelId || c.channel_id === 'demo' || !c.channel_id || c.channel_id === '')
      );
      if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
      // Use campaign's own channelId for data queries (consistent with automation)
      const effectiveChannelId = (campaign.channel_id && campaign.channel_id !== 'demo' && campaign.channel_id !== '')
        ? campaign.channel_id : channelId;

      const settingsRow = (db.channel_settings || []).find(s => s.channel_id === effectiveChannelId);
      const chSettings = settingsRow ? (() => { try { return JSON.parse(settingsRow.settings || '{}'); } catch(_) { return {}; } })() : {};
      const productSlug = (chSettings.product_url_slug || '/products').replace(/\/+$/, '');
      const now = Date.now();

      // ── Build per-phone contact map — identical logic to Analytics command center ──
      // This ensures the audience panel shows the SAME users and statuses as the
      // command center (best status across all sessions, deduped by phone).
      const allWithPhone = (db.website_visitors || []).filter(v => v.channel_id === effectiveChannelId && v.phone);
      const phoneMap = new Map();
      allWithPhone.forEach(v => {
        if (!phoneMap.has(v.phone)) phoneMap.set(v.phone, []);
        phoneMap.get(v.phone).push(v);
      });

      const allPageViews = (db.page_views       || []).filter(p => p.channel_id === effectiveChannelId);
      const allCarts     = (db.cart_events      || []).filter(c => c.channel_id === effectiveChannelId);
      const allPurchases = (db.purchase_history || []).filter(p => p.channel_id === effectiveChannelId);
      const allProdViews = (db.product_views    || []).filter(v => v.channel_id === effectiveChannelId);

      const STATUS_RANK = { purchased: 7, followup_complete: 6, product_recommendation: 6, abandoned_checkout: 5, abandoned_cart: 4, product_view_lock: 3, product_view: 2, active: 1 };

      const contactMap = new Map();
      for (const [phone, sessions] of phoneMap.entries()) {
        sessions.sort((a, b) => new Date(b.visited_at) - new Date(a.visited_at));
        const canonical = sessions[0];

        const name     = sessions.map(s => s.name).find(Boolean) || '';
        const city     = sessions.map(s => s.city).find(Boolean) || '';
        const device   = sessions.map(s => s.device_type).find(Boolean) || '';
        const language = sessions.map(s => s.language).find(Boolean) || '';

        const status = sessions.reduce((best, s) =>
          (STATUS_RANK[s.status] || 0) > (STATUS_RANK[best] || 0) ? s.status : best, 'active');

        const allSessionIds = new Set(sessions.map(s => s.session_id).filter(Boolean));
        const pvs        = allPageViews.filter(p => allSessionIds.has(p.session_id) || p.phone === phone);
        const userCarts  = allCarts.filter(c => allSessionIds.has(c.session_id) || c.phone === phone);
        const userPurch  = allPurchases.filter(p => p.phone === phone);

        const avgEngage  = pvs.length ? Math.round(pvs.reduce((s,p)=>s+(p.engagement_score||0),0)/pvs.length) : (canonical.engagement_score||0);
        const totalTime  = sessions.reduce((s,v)=>s+(v.total_time_sec||0),0) + pvs.reduce((s,p)=>s+(p.duration_sec||0),0);
        const pageCount  = sessions.reduce((s,v)=>s+(v.total_page_views||0),0) || pvs.length;
        const cartCount  = userCarts.length;

        const powerScore = Math.round(
          Math.min(avgEngage,100)*0.40 + Math.min(cartCount*25,100)*0.25 +
          Math.min(totalTime/3,100)*0.20 + Math.min(pageCount*10,100)*0.15
        );

        contactMap.set(phone, {
          id: canonical.id, session_id: canonical.session_id,
          phone, name, city, device, language, status,
          is_repeat:        sessions.length > 1,
          visit_count:      sessions.length,
          power_score:      powerScore,
          engagement_score: avgEngage,
          page_views:       pageCount,
          cart_events:      cartCount,
          total_time_sec:   totalTime,
          last_seen:        canonical.visited_at,
          _userCarts:  userCarts,
          _userPurch:  userPurch,
        });
      }

      // ── Product view lookups per phone (resolve anonymous via session) ──
      // latestViewByPhone: most recent view (for product_view campaign type)
      // bestViewByPhone:   highest composite engagement score (for APV only)
      const allPhoneViewsMap = {};
      for (const v of allProdViews) {
        const phone = v.phone
          || (db.website_visitors.find(vis => vis.session_id === v.session_id && vis.channel_id === effectiveChannelId))?.phone;
        if (!phone) continue;
        const vp = { ...v, phone };
        if (!allPhoneViewsMap[phone]) allPhoneViewsMap[phone] = [];
        allPhoneViewsMap[phone].push(vp);
      }
      const latestViewByPhone = {};
      const bestViewByPhone   = {};
      for (const [phone, views] of Object.entries(allPhoneViewsMap)) {
        // Latest by created_at
        views.sort((a, b) => b.created_at > a.created_at ? 1 : -1);
        latestViewByPhone[phone] = views[0];
        // Best by composite score: time 50% + scroll 30% + engagement 20%
        const maxDur = Math.max(...views.map(v => v.duration_sec || 0)) || 1;
        const scored = views.map(v => ({
          ...v,
          _score: (((v.duration_sec || 0) / maxDur) * 50) +
                  (((v.max_scroll_pct || v.scroll_pct || 0) / 100) * 30) +
                  (((v.engagement_score || 0) / 100) * 20),
        }));
        scored.sort((a, b) => b._score - a._score);
        bestViewByPhone[phone] = scored[0];
      }

      let audience = [];

      // ═══════════════════════════════════════════════════════════════════════
      if (campaign.campaign_type === 'abandoned_product_view') {

        const locks = (db.campaign_locks || []).filter(l =>
          String(l.campaign_id) === String(id)
        );
        const lockedPhones = new Set(locks.map(l => l.phone));

        const MAX_VIEW_AGE_MIN = 7 * 24 * 60; // 7 days in minutes

        // Campaign-level metrics — all counts filtered to CURRENT cycle per lock
        const allExecsForCampaign = (db.abandoned_cart_executions || [])
          .filter(x => String(x.campaign_id) === String(id));

        const camIdStr = String(id);
        let metricReplied = 0;
        const lockedPhonesSet = new Set(locks.map(l => l.phone));

        for (const l of locks) {
          const s1Ms = l.stage_1_sent_at ? new Date(l.stage_1_sent_at).getTime() : null;
          if (!s1Ms) continue;
          const replied = (db.chat_messages || []).some(m =>
            m.phone === l.phone && m.channel_id === effectiveChannelId && m.direction === 'in' &&
            new Date(m.timestamp || m.created_at).getTime() > s1Ms
          );
          if (replied) metricReplied++;
        }

        // Attribution metrics — based on ww_cam tracking in URLs
        // attributed_clicks: unique visitors who clicked a link from this campaign (last_click_campaign_id)
        const attrClicks = (db.website_visitors || []).filter(v =>
          v.channel_id === effectiveChannelId && String(v.last_click_campaign_id) === camIdStr
        );
        // attributed_carts: cart events stamped with source_campaign_id = this campaign
        const attrCarts = (db.cart_events || []).filter(c =>
          c.channel_id === effectiveChannelId && String(c.source_campaign_id) === camIdStr && !c.recovered
        );
        const attrCartsRecovered = (db.cart_events || []).filter(c =>
          c.channel_id === effectiveChannelId && String(c.source_campaign_id) === camIdStr
        );
        // attributed_purchases: purchases stamped with source_campaign_id = this campaign
        const attrPurchases = (db.purchase_history || []).filter(p =>
          p.channel_id === effectiveChannelId && String(p.source_campaign_id) === camIdStr
        );
        const attrRevenue = attrPurchases.reduce((s, p) => s + (parseFloat(p.total_amount) || 0), 0);

        const stage1SentExecs = allExecsForCampaign.filter(x => (x.stage || 1) === 1 && x.status === 'sent');
        const stage2SentExecs = allExecsForCampaign.filter(x => x.stage === 2 && x.status === 'sent');

        const campaignMetrics = {
          total_reached:  stage1SentExecs.length,                              // unique users who received msg 1
          stage1_sent:    stage1SentExecs.length,
          stage2_sent:    stage2SentExecs.length,
          total_failed:   allExecsForCampaign.filter(x => x.status === 'failed').length,
          conversations:  metricReplied,                                        // unique users who replied
          clicked:        attrClicks.length,                                    // clicked campaign URL (ww_cam)
          cart_adds:      attrCartsRecovered.length,                            // cart adds attributed to this campaign
          purchases:      attrPurchases.length,                                 // purchases attributed to this campaign
          revenue:        attrRevenue,                                          // attributed revenue
          // Legacy inferred metrics (from lock status — fallback when tracking code not present)
          lock_cart_adds: locks.filter(l => ['cart_added', 'purchased'].includes(l.lock_status)).length,
          lock_purchases: locks.filter(l => l.lock_status === 'purchased').length,
          lock_revenue:   locks.reduce((s, l) => s + (parseFloat(l.revenue) || 0), 0),
        };

        // Helper: get execution records per phone for this campaign.
        // When lockAnchor is provided (locked users), the lock timestamps are the
        // source of truth — only find an exec within 5 min of the lock's timestamp.
        // This prevents archived/failed pre-reset records from leaking into the
        // current-cycle display after re-entry.
        const getExecs = (phone, lockAnchor = null) => {
          const allExecs = (db.abandoned_cart_executions || [])
            .filter(x => String(x.campaign_id) === String(id) && x.phone === phone
              && x.status !== 'archived_reentry')
            .sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at));

          let s1, s2;
          if (lockAnchor) {
            // If re-entry happened after stage was sent, those timestamps are from old cycle — treat as null
            const reentryMs = lockAnchor.reentry_at ? new Date(lockAnchor.reentry_at).getTime() : 0;
            const s1Ts = lockAnchor.stage_1_sent_at && (!reentryMs || new Date(lockAnchor.stage_1_sent_at).getTime() >= reentryMs)
              ? lockAnchor.stage_1_sent_at : null;
            const s2Ts = lockAnchor.stage_2_sent_at && (!reentryMs || new Date(lockAnchor.stage_2_sent_at).getTime() >= reentryMs)
              ? lockAnchor.stage_2_sent_at : null;
            const findNear = (lockTs, stageNum) => {
              const stageExecs = allExecs.filter(x => (x.stage || 1) === stageNum);
              // If lock timestamp exists, match within 5 min window
              if (lockTs) {
                const lockMs = new Date(lockTs).getTime();
                const near = stageExecs.find(x => Math.abs(new Date(x.sent_at).getTime() - lockMs) < 5 * 60 * 1000);
                if (near) return near;
              }
              // No lock timestamp yet (stage not sent) — return any failed/pending exec so UI shows it
              return stageExecs.find(x => x.status === 'failed') || (lockTs ? stageExecs[0] : null);
            };
            s1 = findNear(s1Ts, 1);
            s2 = findNear(s2Ts, 2);
          } else {
            s1 = allExecs.find(x => (x.stage || 1) === 1) || null;
            s2 = allExecs.find(x => x.stage === 2) || null;
          }

          return {
            stage1_status:      s1?.status      || null,
            stage1_error:       s1?.error       || null,
            stage1_retry_count: s1?.retry_count || 0,
            stage1_sent_at: lockAnchor ? (s1?.sent_at || null) : (s1?.sent_at || null),
            stage2_status:      s2?.status      || null,
            stage2_error:       s2?.error       || null,
            stage2_retry_count: s2?.retry_count || 0,
            stage2_sent_at: lockAnchor ? (s2?.sent_at || null) : (s2?.sent_at || null),
          };
        };

        // Locked users — enriched with command center data
        const lockedAudience = locks.map(l => {
          const ct      = contactMap.get(l.phone) || {};
          const cart    = ct._userCarts?.find(c => !c.recovered);
          const purch   = ct._userPurch?.sort((a,b) => new Date(b.created_at)-new Date(a.created_at))[0];
          // Use most recent product view (same logic as automation timer)
          const viewRec = latestViewByPhone[l.phone];
          // minSince uses last_seen (visitor.visited_at) — matches automation inactivity check
          const lastPVTime = ct.last_seen || viewRec?.created_at;
          const minSince = lastPVTime ? Math.floor((now - new Date(lastPVTime).getTime()) / 60000) : null;
          // Compute time until next stage send for locked users
          const stage1DelayMin = campaign.apv_delay_min != null ? campaign.apv_delay_min : 2;
          const stage1Ms   = l.stage_1_sent_at ? new Date(l.stage_1_sent_at).getTime() : null;
          const followupMs = (campaign.apv_followup_min != null ? campaign.apv_followup_min : 4) * 60 * 1000;
          const stage2DueMs = stage1Ms ? stage1Ms + followupMs : null;
          const minUntilNext = (l.lock_status === 'active' && l.stage === 1 && stage2DueMs)
            ? Math.max(0, Math.floor((stage2DueMs - now) / 60000))
            : null;
          // Stage 1 countdown — for locked users at stage 0 waiting for first send
          const lockAnchorTime = l.reentry_at || l.locked_at;
          const stage1DueMs = (l.lock_status === 'active' && l.stage === 0 && lockAnchorTime)
            ? new Date(lockAnchorTime).getTime() + stage1DelayMin * 60 * 1000
            : null;
          const minUntilStage1 = stage1DueMs != null
            ? Math.max(0, Math.floor((stage1DueMs - now) / 60000))
            : null;
          // Inbound replies — filtered to AFTER stage 1 sent (current cycle only)
          const s1SentMs = stage1Ms;
          const inboundMsgs = (db.chat_messages || [])
            .filter(m =>
              m.phone === l.phone && m.channel_id === effectiveChannelId && m.direction === 'in' &&
              (!s1SentMs || new Date(m.timestamp || m.created_at).getTime() > s1SentMs)
            )
            .sort((a, b) => new Date(b.timestamp || b.created_at) - new Date(a.timestamp || a.created_at));
          const lastReply = inboundMsgs[0] || null;

          // Clicked: product_view > 1 min after stage 1 send (inferred link click)
          // Attribution: did this user click the campaign link (ww_cam tracking)?
          const visitorRec = db.website_visitors.find(v => v.phone === l.phone && v.channel_id === effectiveChannelId);
          const clickedCampaign = visitorRec && String(visitorRec.last_click_campaign_id) === camIdStr;
          const clickedAt = clickedCampaign ? (visitorRec.last_click_at || null) : null;

          // Attribution: cart add after campaign click
          const attrCart = (db.cart_events || []).find(c =>
            c.phone === l.phone && c.channel_id === effectiveChannelId &&
            String(c.source_campaign_id) === camIdStr
          );
          // Attribution: purchase after campaign click
          const attrPurch = (db.purchase_history || []).find(p =>
            p.phone === l.phone && p.channel_id === effectiveChannelId &&
            String(p.source_campaign_id) === camIdStr
          );

          const execs = getExecs(l.phone, l);  // lock-anchored: null lock ts → null status
          return {
            phone: l.phone, name: ct.name || 'Unknown',
            city: ct.city || '', device: ct.device || '',
            status: ct.status || l.last_known_status || 'product_view_lock',
            power_score: ct.power_score || 0, engagement_score: ct.engagement_score || 0,
            page_views: ct.page_views || 0, cart_events: ct.cart_events || 0,
            is_repeat: ct.is_repeat || false,
            product_name:  viewRec?.product_name  || l.product_name  || '',
            product_url:   l.product_url   || viewRec?.product_url   || '',
            product_price: viewRec?.product_price || l.product_price || '',
            product_image: viewRec?.product_image || l.product_image || '',
            lock_status: l.lock_status, stage: l.stage || 0,
            locked_at: l.locked_at, stage_1_sent_at: l.stage_1_sent_at,
            stage_2_sent_at: l.stage_2_sent_at,
            revenue: attrPurch ? parseFloat(attrPurch.total_amount || 0) : (purch ? parseFloat(purch.total_amount || 0) : (l.revenue || 0)),
            cart_amount: attrCart?.total_amount || cart?.total_amount || 0,
            followup_count: l.stage || 0,
            minutes_since_activity: minSince,
            minutes_until_next_send: minUntilNext,
            stage2_due_at: stage2DueMs ? new Date(stage2DueMs).toISOString() : null,
            stage1_due_at: stage1DueMs ? new Date(stage1DueMs).toISOString() : null,
            minutes_until_stage1: minUntilStage1,
            apv_delay_min: stage1DelayMin,
            ready_to_send: (minUntilNext === 0 || minUntilStage1 === 0) && execs.stage1_status !== 'sent' && execs.stage1_status !== 'failed' && (execs.stage1_retry_count || 0) < 3, is_locked: true,
            responded: inboundMsgs.length > 0,
            response_count: inboundMsgs.length,
            last_response_text: lastReply?.text || null,
            last_response_at: lastReply?.timestamp || lastReply?.created_at || null,
            // Attribution fields
            clicked: clickedCampaign,          // clicked the campaign URL (ww_cam)
            clicked_at: clickedAt,             // when they clicked
            attributed_cart: !!attrCart,       // added to cart after clicking
            attributed_cart_amount: attrCart ? parseFloat(attrCart.total_amount || 0) : 0,
            attributed_purchase: !!attrPurch,  // purchased after clicking
            attributed_revenue: attrPurch ? parseFloat(attrPurch.total_amount || 0) : 0,
            // Re-entry / multi-cycle analytics
            cycle_count:  l.cycle_count  || 1,
            send_history: l.send_history || [],
            ...execs,
          };
        });

        // Pending — contacts with product_view or product_view_lock status but no lock record yet
        // (product_view_lock means campaign claimed them but stage 1 hasn't fired yet)
        const pendingAudience = [...contactMap.values()].filter(c =>
          (c.status === 'product_view' || c.status === 'product_view_lock') && !lockedPhones.has(c.phone)
        ).map(c => {
          // Use most recent product view (same as automation timer)
          const viewRec = latestViewByPhone[c.phone];
          if (viewRec?.product_url && !viewRec.product_url.includes(productSlug)) return null;
          if ((viewRec?.followup_count || 0) >= 2) return null;
          // Timer anchor: if the product was viewed BEFORE this campaign existed,
          // the delay starts from campaign creation (user entered campaign then),
          // not from the old view time. Matches automation safety-net logic.
          const rawAnchor = viewRec?.created_at || c.last_seen;
          const campaignCreatedAt = campaign.created_at || null;
          const anchorTime = (rawAnchor && campaignCreatedAt && new Date(rawAnchor) < new Date(campaignCreatedAt))
            ? campaignCreatedAt
            : rawAnchor;
          const minSince = anchorTime ? Math.floor((now - new Date(anchorTime).getTime()) / 60000) : null;
          // Ignore product views older than 7 days — they are stale
          if (minSince == null || minSince > MAX_VIEW_AGE_MIN) return null;
          const execs = getExecs(c.phone);
          const stage1DelayMin = campaign.apv_delay_min != null ? campaign.apv_delay_min : 2;
          // Compute stage 1 countdown using same anchor as automation
          const minUntilStage1 = (minSince != null && minSince < stage1DelayMin)
            ? stage1DelayMin - minSince
            : 0;
          // Compute stage 2 countdown even for pending users whose stage 1 exec exists
          const s1SentMs = execs.stage1_sent_at ? new Date(execs.stage1_sent_at).getTime() : null;
          const pendingFollowupMs = (campaign.apv_followup_min || 4) * 60 * 1000;
          const s2DueMs  = s1SentMs ? s1SentMs + pendingFollowupMs : null;
          const minUntilNext = (s2DueMs && execs.stage1_status === 'sent' && !execs.stage2_sent_at)
            ? Math.max(0, Math.floor((s2DueMs - now) / 60000))
            : null;
          return {
            phone: c.phone, name: c.name || 'Unknown',
            city: c.city || '', device: c.device || '',
            status: c.status,
            power_score: c.power_score, engagement_score: c.engagement_score,
            page_views: c.page_views, cart_events: c.cart_events,
            is_repeat: c.is_repeat,
            product_name:  viewRec?.product_name  || '',
            product_url:   viewRec?.product_url   || '',
            product_price: viewRec?.product_price || '',
            product_image: viewRec?.product_image || '',
            lock_status: 'pending', stage: 0, locked_at: null,
            followup_count: viewRec?.followup_count || 0,
            minutes_since_activity: minSince,
            minutes_until_next_send: minUntilNext,
            ready_to_send: minSince >= stage1DelayMin && execs.stage1_status !== 'sent' && execs.stage1_status !== 'failed' && (execs.stage1_retry_count || 0) < 3,
            minutes_until_stage1: minUntilStage1,
            apv_delay_min: stage1DelayMin,
            is_locked: false,
            last_response_text: null, last_response_at: null,
            stage_1_sent_at: execs.stage1_sent_at, stage_2_sent_at: execs.stage2_sent_at,
            stage1_due_at: anchorTime ? new Date(new Date(anchorTime).getTime() + stage1DelayMin * 60 * 1000).toISOString() : null,
            stage2_due_at: s2DueMs ? new Date(s2DueMs).toISOString() : null,
            ...execs,
          };
        }).filter(Boolean);

        audience = [...lockedAudience, ...pendingAudience];
        // Attach campaign metrics for the UI header — returned alongside audience list
        audience._metrics = campaignMetrics;

      // ═══════════════════════════════════════════════════════════════════════
      } else if (campaign.campaign_type === 'abandoned_cart') {

        audience = [...contactMap.values()].filter(c => c.status === 'abandoned_cart').map(c => {
          const cart = c._userCarts.filter(ce => !ce.recovered).sort((a,b) => new Date(b.created_at)-new Date(a.created_at))[0];
          const purch = c._userPurch.sort((a,b) => new Date(b.created_at)-new Date(a.created_at))[0];
          let products = [];
          try { products = JSON.parse(cart?.products || '[]'); } catch (_) {}
          const minSince   = cart?.created_at ? Math.floor((now - new Date(cart.created_at).getTime()) / 60000) : null;
          const delayMin   = (campaign.delay_hours || 1) * 60;
          return {
            phone: c.phone, name: c.name || 'Unknown',
            city: c.city || '', device: c.device || '',
            status: c.status,
            power_score: c.power_score, engagement_score: c.engagement_score,
            page_views: c.page_views, cart_events: c.cart_events,
            is_repeat: c.is_repeat,
            product_name:  cart?.product_name || products[0]?.name || '',
            product_price: cart?.product_price || '',
            cart_amount:   parseFloat(cart?.total_amount || 0),
            cart_items:    products.length || cart?.cart_items || 0,
            minutes_since_activity: minSince,
            ready_to_send: !cart?.whatsapp_sent && minSince != null && minSince >= delayMin,
            stage:       cart?.followup_count || 0,
            revenue:     purch ? parseFloat(purch.total_amount || 0) : 0,
            lock_status: cart?.whatsapp_sent ? 'messaged' : 'pending',
          };
        });

      // ═══════════════════════════════════════════════════════════════════════
      } else if (campaign.campaign_type === 'product_view') {

        audience = [...contactMap.values()].filter(c => c.status === 'product_view').map(c => {
          const viewRec  = latestViewByPhone[c.phone];
          const minSince = viewRec?.created_at ? Math.floor((now - new Date(viewRec.created_at).getTime()) / 60000) : null;
          const delayMin = (campaign.delay_hours || 1) * 60;
          return {
            phone: c.phone, name: c.name || 'Unknown',
            city: c.city || '', device: c.device || '',
            status: c.status,
            power_score: c.power_score, engagement_score: c.engagement_score,
            page_views: c.page_views, cart_events: c.cart_events,
            is_repeat: c.is_repeat,
            product_name:  viewRec?.product_name  || '',
            product_url:   viewRec?.product_url   || '',
            product_price: viewRec?.product_price || '',
            product_image: viewRec?.product_image || '',
            minutes_since_activity: minSince,
            ready_to_send: !viewRec?.whatsapp_sent && minSince != null && minSince >= delayMin,
            stage:       viewRec?.followup_count || 0,
            lock_status: viewRec?.whatsapp_sent ? 'messaged' : 'pending',
          };
        });

      // ═══════════════════════════════════════════════════════════════════════
      } else if (campaign.campaign_type === 'order_confirmation') {

        if (!db.orders) db.orders = [];
        const responses = db.order_responses || [];
        audience = db.orders.filter(o => o.channel_id === effectiveChannelId && o.is_cod && o.phone).map(o => {
          const resp  = responses.filter(r => r.phone === o.phone && r.order_id === o.id)
            .sort((a,b) => new Date(b.responded_at) - new Date(a.responded_at));
          const latest = resp[0];
          return {
            phone: o.phone, name: o.name || 'Unknown',
            order_number: o.order_number, order_total: o.total_amount,
            payment_method: o.payment_method, products: o.products_summary || '',
            order_status: o.status, confirmation_sent: o.confirmation_sent,
            ready_to_send: !o.confirmation_sent,
            response_type: latest?.response_type || null,
            response_text: latest?.response_text || null,
            responded_at:  latest?.responded_at  || null,
          };
        });

      // ═══════════════════════════════════════════════════════════════════════
      } else if (campaign.campaign_type === 'custom' || campaign.campaign_type === 'product_recommendation') {

        let filterDef = { logic: 'AND', rules: [] };
        try { filterDef = JSON.parse(campaign.filters || '{}'); } catch (_) {}
        const { logic = 'AND', rules = [] } = filterDef;
        const applyRule = (c, rule) => {
          const cv = c[rule.field];
          if (rule.op === 'eq')       return String(cv ?? '').toLowerCase() === String(rule.value ?? '').toLowerCase();
          if (rule.op === 'contains') return String(cv ?? '').toLowerCase().includes(String(rule.value ?? '').toLowerCase());
          if (rule.op === 'gte')      return Number(cv ?? 0) >= Number(rule.value ?? 0);
          if (rule.op === 'lte')      return Number(cv ?? 0) <= Number(rule.value ?? 0);
          return true;
        };
        audience = [...contactMap.values()].filter(c => {
          if (!rules.length) return true;
          const results = rules.map(r => applyRule(c, r));
          return logic === 'AND' ? results.every(Boolean) : results.some(Boolean);
        }).map(c => ({
          phone: c.phone, name: c.name || 'Unknown',
          city: c.city || '', device: c.device || '', status: c.status,
          power_score: c.power_score, engagement_score: c.engagement_score,
          page_views: c.page_views, cart_events: c.cart_events,
          is_repeat: c.is_repeat,
          minutes_since_activity: c.last_seen ? Math.floor((now - new Date(c.last_seen).getTime()) / 60000) : null,
          lock_status: c.status === 'purchased' ? 'purchased' : 'visitor',
        }));

      // ═══════════════════════════════════════════════════════════════════════
      } else {

        // Generic: filter by campaign segment, use contact map for accurate status
        const seg = campaign.target_segment || 'all';
        audience = [...contactMap.values()].filter(c => {
          if (campaign.campaign_type === 'post_purchase'    || seg === 'purchasers')      return c.status === 'purchased';
          if (campaign.campaign_type === 'post_cart_upsell')                              return c.status === 'followup_complete';
          if (campaign.campaign_type === 'abandoned_checkout')                            return c.status === 'abandoned_checkout';
          if (campaign.campaign_type === 'discount')                                      return c.status === 'abandoned_cart';
          if (campaign.campaign_type === 'website_visit'    || seg === 'active_visitors') return c.status === 'active';
          if (seg === 'hot_users')                                                         return c.power_score >= 80;
          return true;
        }).map(c => ({
          phone: c.phone, name: c.name || 'Unknown',
          city: c.city || '', device: c.device || '', status: c.status,
          power_score: c.power_score, engagement_score: c.engagement_score,
          page_views: c.page_views, cart_events: c.cart_events,
          is_repeat: c.is_repeat,
          minutes_since_activity: c.last_seen ? Math.floor((now - new Date(c.last_seen).getTime()) / 60000) : null,
          lock_status: c.status === 'purchased' ? 'purchased' : c.status === 'abandoned_cart' ? 'messaged' : 'visitor',
        }));
      }

      // Deduplicate by phone
      const seen = new Set();
      audience = audience.filter(u => { if (seen.has(u.phone)) return false; seen.add(u.phone); return true; });

      // Sort: locked/active first, then by power_score
      const LOCK_ORDER = { active: 0, cart_added: 1, purchased: 2, shifted_recommendation: 3, messaged: 4, pending: 5, visitor: 6 };
      audience.sort((a, b) => {
        const la = LOCK_ORDER[a.lock_status] ?? 9, lb = LOCK_ORDER[b.lock_status] ?? 9;
        if (la !== lb) return la - lb;
        return (b.power_score || 0) - (a.power_score || 0);
      });

      // Preserve metrics before stripping (array property is lost after map)
      const metrics = audience._metrics || null;

      // Strip internal refs before sending
      audience = audience.map(({ _userCarts, _userPurch, ...rest }) => rest);

      res.json({ count: audience.length, audience: audience.slice(0, 100), metrics });
    } catch (error) {
      next(error);
    }
  },

  // POST /api/campaigns/fix-apv-template
  // Body: { meta_template_name: "producrt_ddd" }  OR  { meta_template_id: 123 }
  // Forces ALL active APV campaigns to use the specified template — fixes stale campaigns.
  async fixApvTemplate(req, res, next) {
    try {
      const db = getDb();
      const channelId = req.headers['x-channel-id'] || '';
      const { meta_template_name, meta_template_id } = req.body;

      // Find the target template
      const tpl = meta_template_id
        ? (db.meta_templates || []).find(t => String(t.id) === String(meta_template_id))
        : (db.meta_templates || []).find(t => t.name === meta_template_name);

      if (!tpl) {
        return res.status(404).json({
          error: `Template not found: ${meta_template_name || meta_template_id}`,
          available: (db.meta_templates || []).map(t => ({ id: t.id, name: t.name, status: t.meta_status })),
        });
      }

      const apvCampaigns = (db.abandoned_cart_campaigns || []).filter(c =>
        c.campaign_type === 'abandoned_product_view' && c.channel_id === channelId
      );

      const before = apvCampaigns.map(c => ({ id: c.id, name: c.name, old_template: c.meta_template_name || c.meta_template_id, active: !!c.is_active }));
      for (const c of apvCampaigns) {
        c.meta_template_id   = tpl.id;
        c.meta_template_name = tpl.name;
        c.updated_at = new Date().toISOString();
      }
      db.save();

      console.log(`[FixAPV] Updated ${apvCampaigns.length} APV campaign(s) → template "${tpl.name}" (id=${tpl.id})`);
      res.json({
        success: true,
        template_applied: { id: tpl.id, name: tpl.name, status: tpl.meta_status },
        campaigns_updated: apvCampaigns.length,
        before,
        after: apvCampaigns.map(c => ({ id: c.id, name: c.name, new_template: c.meta_template_name, active: !!c.is_active })),
      });
    } catch (error) {
      next(error);
    }
  },
};
