import { getDb } from '../services/database.js';
import { whatsappService } from '../services/whatsapp.service.js';
import { saveChatMessage } from './chat.controller.js';

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
      const delayHours      = b.delay_hours      != null ? Number(b.delay_hours) : 1;

      const id = Date.now(); // use timestamp for unique IDs
      const newCampaign = {
        id,
        channel_id: channelId,
        name: b.name,
        description: b.description || '',
        campaign_type: campaignType,
        target_segment: targetSegment,
        target_language: targetLanguage,
        filters: '{}',
        template_id: templateId,
        template_ids: templateIds,
        meta_template_id: metaTemplateId,   // NEW — Meta carousel template for product recommendation
        schedule_type: 'delayed',
        delay_hours: delayHours,
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
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      let targetEvents = [];
      const seg = campaign.target_segment || 'all';

      // Advanced User Filtering Engine
      if (campaign.campaign_type === 'abandoned_cart') {
        targetEvents = db.cart_events.filter(c => c.channel_id === channelId && !c.recovered && c.phone);
      } else if (campaign.campaign_type === 'product_view') {
        targetEvents = db.product_views.filter(v => v.channel_id === channelId && v.phone);
      } else {
        // Custom Broadcasts / Post-Purchase Upsells
        targetEvents = db.website_visitors.filter(v => {
          if (v.channel_id !== channelId || !v.phone) return false;
          if (seg === 'purchasers' || campaign.campaign_type === 'post_purchase') return v.status === 'purchased';
          if (seg === 'hot_users') return v.status === 'hot_user';
          if (seg === 'active_visitors') return v.status === 'active' || v.status === 'product_view';
          return true; // seg === 'all'
        });
      }
      
      // Resolve template
      const templateId = (campaign.template_ids && campaign.template_ids.length > 0)
        ? campaign.template_ids[0]
        : (campaign.template_id || null);
      const templateRecord = templateId ? db.message_templates.find(t => t.id == templateId) : null;

      // Build base message text from template
      let baseText = '';
      if (templateRecord) {
        if (templateRecord.body_text) {
          baseText = templateRecord.body_text;
        } else if (templateRecord.components) {
          try {
            const comps = JSON.parse(templateRecord.components);
            baseText = comps.find(c => c.type === 'body')?.text || comps[0]?.text || '';
          } catch (_) {}
        }
      }

      let sent = 0;
      for (const target of targetEvents) {
        if (!target.phone) continue;
        // Avoid sending the same initial blast twice immediately
        if (campaign.campaign_type !== 'abandoned_cart' && target.whatsapp_sent_at) {
          const hoursSince = (Date.now() - new Date(target.whatsapp_sent_at).getTime()) / (60 * 60 * 1000);
          if (hoursSince < 1) continue;
        }

        const userLang = campaign.target_language === 'per_user'
          ? (target.language || 'en')
          : (campaign.target_language || 'en');

        // Fill variables into message text
        const variables = {
          name: target.name || 'Customer',
          product_name: target.product_name || '',
          product_price: target.product_price || String(target.total_amount || ''),
          total_amount: String(target.total_amount || ''),
          cart_url: target.cart_url || '',
          product_url: target.product_url || '',
        };
        let resolvedText = baseText;
        for (const [k, v] of Object.entries(variables)) {
          resolvedText = resolvedText.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
        }

        // Actually send via WhatsApp API
        let wamid = null;
        try {
          const result = await whatsappService.sendMessage(
            target.phone,
            [{ type: 'body', text: baseText }],
            variables
          );
          wamid = result.messageId || null;
          resolvedText = result.resolvedText || resolvedText;
        } catch (e) {
          console.error('[Campaign] Send error:', e.message);
        }

        // Save to chat inbox
        saveChatMessage(db, target.phone, resolvedText, channelId, {
          wamid,
          campaignName: campaign.name,
          templateName: templateRecord?.name || null,
        });

        db.abandoned_cart_executions.push({
          id: (db.abandoned_cart_executions.length || 0) + 1,
          campaign_id: id,
          cart_event_id: target.cart_id || target.id,
          phone: target.phone,
          name: target.name || null,
          template_id: templateId,
          stage: 1,
          language: userLang,
          products: target.products || '[]',
          status: 'sent',
          sent_at: new Date().toISOString()
        });

        target.whatsapp_sent = 1;
        target.followup_count = (target.followup_count || 0) + 1;
        target.whatsapp_sent_at = new Date().toISOString();
        sent++;
      }

      campaign.total_sent = (campaign.total_sent || 0) + sent;
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
