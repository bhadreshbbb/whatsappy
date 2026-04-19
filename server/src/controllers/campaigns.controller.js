import { getDb } from '../services/database.js';
import { whatsappService } from '../services/whatsapp.service.js';
import { saveChatMessage } from './chat.controller.js';
import { buildSendMessagePayload, LANG_MAP } from './meta-templates.controller.js';

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
      const idx = db.abandoned_cart_campaigns.findIndex(c => c.id == id);
      if (idx < 0) {
        return res.status(404).json({ error: 'Campaign not found' });
      }
      db.abandoned_cart_campaigns.splice(idx, 1);
      db.save();
      res.json({ success: true });
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
      } else if (campaign.campaign_type === 'product_view') {
        targetEvents = db.product_views.filter(v => v.channel_id === channelId && v.phone);
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
        ? (db.meta_templates || []).find(t => t.id === campaign.meta_template_id)
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

      // Deduplicate by phone — never send the same campaign twice to the same number
      const sentPhones = new Set();
      let sent = 0;

      for (const target of targetEvents) {
        if (!target.phone) continue;
        if (sentPhones.has(target.phone)) continue;
        sentPhones.add(target.phone);
        // Rate-limit: skip if sent within last hour for non-cart campaigns
        if (campaign.campaign_type !== 'abandoned_cart' && target.whatsapp_sent_at) {
          const hoursSince = (Date.now() - new Date(target.whatsapp_sent_at).getTime()) / 3600000;
          if (hoursSince < 1) continue;
        }

        const userLang = campaign.target_language === 'per_user'
          ? (target.language || 'en')
          : (campaign.target_language || 'en');
        const metaLangCode = LANG_MAP[userLang] || userLang;

        let wamid = null;
        let resolvedText = '';

        // ── PATH A: Meta template send (carousel / approved template) ─────────
        let cardsSent = [];
        if (metaTpl) {
          const sendPayload = buildSendMessagePayload(metaTpl, metaTpl.product_config, target.phone, metaLangCode, campaign.id);
          console.log(`[Campaign Send] Meta template "${metaTpl.name}" → ${target.phone}`);
          console.log(JSON.stringify(sendPayload, null, 2));

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

          try {
            const result = await whatsappService.sendTemplateMessage(target.phone, sendPayload);
            wamid = result.messageId || null;
          } catch (e) {
            console.error('[Campaign] Meta template send error:', e.message);
          }

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
          try {
            const result = await whatsappService.sendMessage(target.phone, [{ type: 'body', text: sanitizeMetaText(baseText) }], variables);
            wamid = result.messageId || null;
            resolvedText = result.resolvedText || resolvedText;
          } catch (e) {
            console.error('[Campaign] Send error:', e.message);
          }
        }

        saveChatMessage(db, target.phone, resolvedText, channelId, {
          wamid,
          campaignName: campaign.name,
          templateName: metaTpl?.name || templateRecord?.name || null,
        });

        db.abandoned_cart_executions.push({
          id: (db.abandoned_cart_executions.length || 0) + 1,
          campaign_id: id,
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

      res.json({ success: true, sent });
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
      const executions = (db.abandoned_cart_executions || []).filter(e => String(e.campaign_id) === String(id));
      const totalSent  = executions.length;
      const msgClicked = executions.filter(e => e.clicked).length;

      res.json({ clicks, add_to_carts: addToCarts, purchases, total_sent: totalSent, msg_clicked: msgClicked });
    } catch (error) { next(error); }
  },

  async getExecutions(req, res, next) {
    try {
      const db = getDb();
      const { id } = req.params;
      const result = db.abandoned_cart_executions
        .filter(e => e.campaign_id == id)
        .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())
        .slice(0, 100);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
};
