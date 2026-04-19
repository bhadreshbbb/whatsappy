import { getDb } from '../services/database.js';

export const visitorsController = {
  async getVisitors(req, res, next) {
    try {
      const db = getDb();
      const { search, page = '1', limit = '20', status, device, hasPhone } = req.query;
      const channelId = req.headers['x-channel-id'] || 'demo';

      let results = db.website_visitors.filter(v => v.channel_id === channelId);

      if (search) {
        const s = String(search).toLowerCase();
        results = results.filter(v =>
          (v.name && v.name.toLowerCase().includes(s)) ||
          (v.phone && v.phone.includes(s)) ||
          (v.email && v.email.toLowerCase().includes(s)) ||
          (v.city && v.city.toLowerCase().includes(s))
        );
      }
      if (status)   results = results.filter(v => v.status === status);
      if (device)   results = results.filter(v => v.device_type === device);
      if (hasPhone === 'true') results = results.filter(v => !!v.phone);
      
      results.sort((a, b) => new Date(b.visited_at).getTime() - new Date(a.visited_at).getTime());
      
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const offset = (pageNum - 1) * limitNum;
      const paginatedResults = results.slice(offset, offset + limitNum);
      
      res.json({
        data: paginatedResults,
        pagination: {
          total: results.length,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(results.length / limitNum)
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async getStats(req, res, next) {
    try {
      const db = getDb();
      const channelId = req.headers['x-channel-id'] || 'demo';

      const visitors = db.website_visitors.filter(v => v.channel_id === channelId);
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      
      const carts = db.cart_events.filter(c => c.channel_id === channelId);
      const campaigns = db.abandoned_cart_campaigns.filter(c => c.channel_id === channelId);

      res.json({
        total: visitors.length,
        active: visitors.filter(v => new Date(v.visited_at) >= fiveMinAgo).length,
        withPhone: visitors.filter(v => v.phone).length,
        cartEvents: carts.length,
        recovered: carts.filter(c => c.recovered).length,
        totalSent: campaigns.reduce((acc, c) => acc + (c.total_sent || 0), 0)
      });
    } catch (error) {
      next(error);
    }
  },

  async getVisitor(req, res, next) {
    try {
      const db = getDb();
      const { id } = req.params;
      const visitor = db.website_visitors.find(v => v.id == id);
      if (!visitor) {
        return res.status(404).json({ error: 'Visitor not found' });
      }
      res.json(visitor);
    } catch (error) {
      next(error);
    }
  },

  async getVisitorCarts(req, res, next) {
    try {
      const db = getDb();
      const { id } = req.params;
      const visitor = db.website_visitors.find(v => v.id == id);
      if (!visitor) {
        return res.status(404).json({ error: 'Visitor not found' });
      }
      const carts = db.cart_events.filter(c => c.session_id === visitor.session_id);
      res.json(carts);
    } catch (error) {
      next(error);
    }
  },

  async getVisitorActivity(req, res, next) {
    try {
      const db = getDb();
      const { id } = req.params;
      const visitor = db.website_visitors.find(v => v.id == id);
      if (!visitor) return res.status(404).json({ error: 'Visitor not found' });

      const channelId = visitor.channel_id;
      const phone = visitor.phone;

      // Collect all session IDs for this phone (across visits)
      const allSessions = db.website_visitors
        .filter(v => v.channel_id === channelId && (v.session_id === visitor.session_id || (phone && v.phone === phone)))
        .map(v => v.session_id)
        .filter(Boolean);
      const sessionSet = new Set(allSessions);

      const bySession = (arr, timeField) =>
        arr.filter(x => sessionSet.has(x.session_id) || (phone && x.phone === phone))
           .map(x => ({ ...x, _time: x[timeField] || x.created_at || x.viewed_at }));

      const pageViews = bySession(db.page_views || [], 'viewed_at').map(p => ({
        type: 'page_view', time: p._time,
        url: p.url, title: p.page_title, referrer: p.referrer,
        duration_sec: p.duration_sec, max_scroll_pct: p.max_scroll_pct,
        engagement_score: p.engagement_score, click_events: p.click_events,
      }));

      const productViews = bySession(db.product_views || [], 'created_at').map(p => ({
        type: 'product_view', time: p._time,
        product_name: p.product_name, product_image: p.product_image,
        product_url: p.product_url, product_price: p.product_price,
      }));

      const cartEvents = bySession(db.cart_events || [], 'created_at').map(c => {
        let products = [];
        try { products = JSON.parse(c.products || '[]'); } catch (_) {}
        return {
          type: c.event_type || 'add_to_cart', time: c._time,
          product_name: c.product_name, product_image: c.product_image,
          product_url: c.product_url, product_price: c.product_price,
          total_amount: c.total_amount, cart_url: c.cart_url,
          recovered: !!c.recovered, products,
        };
      });

      const purchases = phone
        ? (db.purchase_history || []).filter(p => p.channel_id === channelId && p.phone === phone).map(p => {
            let products = [];
            try { products = JSON.parse(p.products || '[]'); } catch (_) {}
            return { type: 'purchase', time: p.purchased_at, order_id: p.order_id, total_amount: p.total_amount, currency: p.currency, products };
          })
        : [];

      const campaignSends = phone
        ? (db.abandoned_cart_executions || []).filter(e => e.phone === phone).map(e => ({
            type: 'campaign_send', time: e.sent_at,
            campaign_name: e.campaign_name || null, template_name: e.template_name,
            status: e.status, cards_sent: e.cards_sent,
          }))
        : [];

      const searches = bySession(db.searches || [], 'searched_at').map(s => ({
        type: 'search', time: s._time, query: s.query, results_count: s.results_count,
      }));

      const timeline = [
        ...pageViews, ...productViews, ...cartEvents,
        ...purchases, ...campaignSends, ...searches,
      ].sort((a, b) => new Date(b.time) - new Date(a.time));

      // All sessions info for the profile header
      const allVisitorSessions = db.website_visitors
        .filter(v => v.channel_id === channelId && (phone ? v.phone === phone : v.session_id === visitor.session_id))
        .sort((a, b) => new Date(b.visited_at) - new Date(a.visited_at));

      res.json({ visitor, allSessions: allVisitorSessions, timeline: timeline.slice(0, 300) });
    } catch (error) { next(error); }
  },
};
