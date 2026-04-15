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
      if (!visitor) {
        return res.status(404).json({ error: 'Visitor not found' });
      }
      const pageViews = db.page_views.filter(p => p.session_id === visitor.session_id);
      const cartEvents = db.cart_events.filter(c => c.session_id === visitor.session_id);
      const activity = [
        ...pageViews.map(p => ({ ...p, type: 'page_view', time: p.viewed_at })),
        ...cartEvents.map(c => ({ ...c, type: c.event_type, time: c.created_at }))
      ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
      res.json(activity.slice(0, 50));
    } catch (error) {
      next(error);
    }
  },
};
