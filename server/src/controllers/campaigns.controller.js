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
      const channelId = req.headers['x-channel-id'] || 'demo';
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
      const result = db.abandoned_cart_campaigns.find(c => c.id == id);
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
      const channelId = req.headers['x-channel-id'] || 'demo';
      const b = req.body;
      // Accept both snake_case (from frontend) and camelCase
      const campaignType    = b.campaign_type    || b.campaignType   || 'abandoned_cart';
      const targetSegment   = b.target_segment   || b.targetSegment  || 'all';
      const targetLanguage  = b.target_language  || b.targetLanguage || 'en';
      const templateId      = b.template_id      || b.template?.id   || null;
      const templateIds     = b.template_ids     || [];
      const metaTemplateId  = b.meta_template_id || null;   // linked approved Meta carousel template
      const delayHours      = b.delay_hours  != null ? Number(b.delay_hours)  : 1;
      const runTimes        = b.run_times    != null ? Number(b.run_times)    : 1; // 0 = infinite

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
        stage_vars: b.stage_vars || null,   // { s1: { v1, v2 }, s2: { v1, v2 } } for abandoned_product_view
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
      const idx = db.abandoned_cart_campaigns.findIndex(c => c.id == id);
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
        delay_hours:      delayHours ?? existing.delay_hours,
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
      const idx = db.abandoned_cart_campaigns.findIndex(c => String(c.id) === String(id));
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

      if (type === 'abandoned_product_view' || type === 'product_view') {
        // Reset product_view records that were sent by this campaign
        (db.product_views || []).forEach(v => {
          if (String(v.campaign_id) === String(id) || !v.campaign_id) {
            // Only reset if followup not complete (i.e. campaign was mid-flight)
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
      const channelId = req.headers['x-channel-id'] || 'demo';
      const campaign = db.abandoned_cart_campaigns.find(c => c.id == id);
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
          const variables = {
            name: target.name || 'Customer',
            product_name: target.product_name || '',
            product_price: target.product_price || String(target.total_amount || ''),
            total_amount: String(target.total_amount || ''),
            cart_url: target.cart_url || '',
            product_url: target.product_url || '',
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

      const channelId = req.headers['x-channel-id'] || 'demo';
      const campaign = db.abandoned_cart_campaigns.find(c => c.id == id);
      if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

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
              productMediaId = await whatsappService.uploadMedia(buffer, `test_${Date.now()}.jpg`, mimeType);
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
        // Find the most recent real order for this phone, or use dummy data
        const realOrder = (db.orders || [])
          .filter(o => o.channel_id === channelId && o.phone)
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

        const testName     = realOrder?.name     || 'Test Customer';
        const testOrderId  = realOrder?.order_number || 'ORD-TEST-001';
        const testProducts = realOrder?.products_summary || 'Blue Kurti × 1';
        const testTotal    = String(realOrder?.total_amount || '799');
        const testPayment  = realOrder?.payment_method || 'Cash on Delivery';
        const testImage    = realOrder?.product_image || metaTpl.header_image_url || '';

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
        const apiResult = await whatsappService.sendTemplateMessage(phone, sendPayload);
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
      const idx = db.abandoned_cart_campaigns.findIndex(c => c.id == id);
      if (idx < 0) {
        return res.status(404).json({ error: 'Campaign not found' });
      }
      db.abandoned_cart_campaigns[idx].is_active = (status === 'running' || status === 'scheduled') ? 1 : 0;
      db.save();
      res.json(db.abandoned_cart_campaigns[idx]);
    } catch (error) {
      next(error);
    }
  },

  async getCampaignAnalytics(req, res, next) {
    try {
      const db = getDb();
      const { id } = req.params;
      const channelId = req.headers['x-channel-id'] || 'demo';

      // Visitors who clicked through from this campaign (UTM attribution)
      const utmVisitors = (db.website_visitors || []).filter(v =>
        v.channel_id === channelId && String(v.utm_campaign) === String(id)
      );
      const utmPhones   = new Set(utmVisitors.map(v => v.phone).filter(Boolean));
      const utmSessions = new Set(utmVisitors.map(v => v.session_id).filter(Boolean));

      // Unique clicks: count unique phones (or sessions for anon)
      const clickPhones = new Set(utmVisitors.filter(v=>v.phone).map(v=>v.phone));
      const clickAnon   = new Set(utmVisitors.filter(v=>!v.phone).map(v=>v.session_id));
      const clicks    = clickPhones.size + clickAnon.size;
      // Unique purchasers by phone
      const purchases = new Set(utmVisitors.filter(v => v.status === 'purchased' && v.phone).map(v=>v.phone)).size
                      + utmVisitors.filter(v => v.status === 'purchased' && !v.phone).length;

      // Unique cart adders by phone from UTM visitors
      const cartPhones = new Set(
        (db.cart_events || []).filter(c =>
          c.channel_id === channelId &&
          (utmPhones.has(c.phone) || utmSessions.has(c.session_id))
        ).map(c => c.phone || c.session_id)
      );
      const addToCarts = cartPhones.size;

      // Execution stats
      const executions  = (db.abandoned_cart_executions || []).filter(e => String(e.campaign_id) === String(id));
      const totalSent   = executions.filter(e => e.status === 'sent').length;
      const totalFailed = executions.filter(e => e.status === 'failed').length;
      const msgClicked  = executions.filter(e => e.clicked).length;
      const openRate    = totalSent > 0 ? +((msgClicked / totalSent) * 100).toFixed(1) : 0;
      const cartRate    = clicks    > 0 ? +((addToCarts  / clicks   ) * 100).toFixed(1) : 0;
      const buyRate     = clicks    > 0 ? +((purchases   / clicks   ) * 100).toFixed(1) : 0;

      res.json({
        clicks, add_to_carts: addToCarts, purchases,
        total_sent: totalSent, total_failed: totalFailed,
        msg_clicked: msgClicked,
        open_rate: openRate, cart_rate: cartRate, buy_rate: buyRate,
      });
    } catch (error) { next(error); }
  },

  async getExecutions(req, res, next) {
    try {
      const db = getDb();
      const { id } = req.params;
      const cam = db.abandoned_cart_campaigns.find(c => c.id == id);
      const result = db.abandoned_cart_executions
        .filter(e => e.campaign_id == id)
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
      const channelId = req.headers['x-channel-id'] || 'demo';
      const campaign = db.abandoned_cart_campaigns.find(c => c.id == id);
      if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

      const settingsRow = (db.channel_settings || []).find(s => s.channel_id === channelId);
      const chSettings = settingsRow ? (() => { try { return JSON.parse(settingsRow.settings || '{}'); } catch(_) { return {}; } })() : {};
      const productSlug = (chSettings.product_url_slug || '/products').replace(/\/+$/, '');

      let audience = [];

      if (campaign.campaign_type === 'abandoned_product_view') {
        const now = Date.now();
        const THIRTY_MIN_MS = 30 * 60 * 1000;
        audience = (db.product_views || []).filter(v => {
          if (v.channel_id !== channelId || !v.phone) return false;
          if (!v.product_url || !v.product_url.includes(productSlug)) return false;
          if ((v.followup_count || 0) >= 2) return false;
          const visitor = db.website_visitors.find(vis => vis.phone === v.phone);
          if (visitor && visitor.status !== 'product_view') return false;
          return true;
        }).map(v => {
          const visitor = db.website_visitors.find(vis => vis.phone === v.phone);
          const lastActivity = visitor?.visited_at || v.created_at;
          const minSince = Math.floor((now - new Date(lastActivity).getTime()) / 60000);
          return {
            phone: v.phone,
            name: visitor?.name || v.product_name || 'Unknown',
            product_name: v.product_name || '',
            product_url: v.product_url || '',
            product_price: v.product_price || '',
            status: visitor?.status || 'product_view',
            followup_count: v.followup_count || 0,
            minutes_since_activity: minSince,
            ready_to_send: minSince >= 30,
          };
        });
      } else if (campaign.campaign_type === 'abandoned_cart') {
        audience = (db.cart_events || []).filter(c =>
          c.channel_id === channelId && !c.recovered && c.phone
        ).map(c => {
          const visitor = db.website_visitors.find(v => v.phone === c.phone);
          return { phone: c.phone, name: visitor?.name || c.name || 'Unknown', status: visitor?.status || 'abandoned_cart', product_name: c.product_name || '', total_amount: c.total_amount || 0 };
        });
      } else if (campaign.campaign_type === 'product_view') {
        audience = (db.product_views || []).filter(v =>
          v.channel_id === channelId && v.phone && v.product_url && v.product_url.includes(productSlug)
        ).map(v => {
          const visitor = db.website_visitors.find(vis => vis.phone === v.phone);
          return { phone: v.phone, name: visitor?.name || 'Unknown', status: visitor?.status, product_name: v.product_name || '', product_url: v.product_url || '' };
        });
      } else if (campaign.campaign_type === 'order_confirmation') {
        if (!db.orders) db.orders = [];
        const responses = db.order_responses || [];
        audience = db.orders.filter(o =>
          o.channel_id === channelId && o.is_cod && o.phone
        ).map(o => {
          const resp = responses.filter(r => r.phone === o.phone && r.order_id === o.id)
            .sort((a,b) => new Date(b.responded_at) - new Date(a.responded_at));
          const latest = resp[0];
          return {
            phone:          o.phone,
            name:           o.name || 'Unknown',
            order_number:   o.order_number,
            order_total:    o.total_amount,
            payment_method: o.payment_method,
            products:       o.products_summary || '',
            order_status:   o.status,
            confirmation_sent: o.confirmation_sent,
            ready_to_send:  !o.confirmation_sent,
            response_type:  latest?.response_type || null,
            response_text:  latest?.response_text || null,
            responded_at:   latest?.responded_at  || null,
          };
        });
      } else {
        audience = (db.website_visitors || []).filter(v =>
          v.channel_id === channelId && v.phone
        ).map(v => ({ phone: v.phone, name: v.name || 'Unknown', status: v.status, city: v.city || '' }));
      }

      // Deduplicate by phone
      const seen = new Set();
      audience = audience.filter(u => { if (seen.has(u.phone)) return false; seen.add(u.phone); return true; });

      res.json({ count: audience.length, audience: audience.slice(0, 100) });
    } catch (error) {
      next(error);
    }
  },
};
