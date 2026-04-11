import { getDb } from '../services/database.js';
import { getLanguageFromGeo } from '../utils/geoLanguage.js';

export const analyticsController = {
  async getDashboard(req, res, next) {
    try {
      const db = getDb();
      const channelId = req.headers['x-channel-id'] || 'demo';

      const visitors = db.website_visitors.filter(v => v.channel_id === channelId);
      const carts = db.cart_events.filter(c => c.channel_id === channelId);
      const campaigns = db.abandoned_cart_campaigns.filter(c => c.channel_id === channelId);
      const revenue = db.purchase_history.filter(p => p.channel_id === channelId);

      const today = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const thisWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const thisMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      res.json({
        visitors: {
          total: visitors.length,
          today: visitors.filter(v => new Date(v.visited_at) >= today).length,
          this_week: visitors.filter(v => new Date(v.visited_at) >= thisWeek).length,
          this_month: visitors.filter(v => new Date(v.visited_at) >= thisMonth).length
        },
        carts: {
          total: carts.length,
          abandoned: carts.filter(c => (c.event_type === 'add_to_cart' || c.event_type === 'checkout_started') && !c.whatsapp_sent && !c.recovered).length,
          recovered: carts.filter(c => c.recovered).length,
          recoveryRate: carts.length > 0 ? ((carts.filter(c => c.recovered).length / carts.length) * 100).toFixed(1) : 0
        },
        campaigns: {
          total: campaigns.length,
          active: campaigns.filter(c => c.is_active).length,
          total_sent: campaigns.reduce((acc, c) => acc + (c.total_sent || 0), 0)
        },
        revenue: {
          recovered: revenue.reduce((acc, p) => acc + (p.total_amount || 0), 0),
          potential: carts.filter(c => !c.recovered).length * 2000
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async getAnalytics(req, res, next) {
    try {
      const db = getDb();
      const channelId = req.headers['x-channel-id'] || 'demo';
      const { period = '7' } = req.query;
      const days = parseInt(period) || 7;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const allVisitors = db.website_visitors.filter(v => v.channel_id === channelId);
      const allCarts = db.cart_events.filter(c => c.channel_id === channelId);
      const campaigns = db.abandoned_cart_campaigns.filter(c => c.channel_id === channelId);
      const execs = db.abandoned_cart_executions;

      const visitors = allVisitors.filter(v => new Date(v.visited_at) >= since);
      const carts = allCarts.filter(c => new Date(c.created_at) >= since);

      // Build byDay and cartByDay arrays
      const byDayMap = {};
      const cartByDayMap = {};
      for (let i = 0; i < days; i++) {
        const d = new Date(Date.now() - (days - 1 - i) * 24 * 60 * 60 * 1000);
        const key = d.toISOString().slice(0, 10);
        byDayMap[key] = 0;
        cartByDayMap[key] = 0;
      }
      visitors.forEach(v => {
        const key = v.visited_at.slice(0, 10);
        if (key in byDayMap) byDayMap[key]++;
      });
      carts.forEach(c => {
        const key = c.created_at.slice(0, 10);
        if (key in cartByDayMap) cartByDayMap[key]++;
      });
      const byDay = Object.entries(byDayMap).map(([day, count]) => ({ day, visitors: count }));
      const cartByDay = Object.entries(cartByDayMap).map(([day, count]) => ({ day, carts: count }));

      // Top cities
      const cityCount = allVisitors.reduce((acc, v) => {
        const city = v.city || 'Unknown';
        acc[city] = (acc[city] || 0) + 1;
        return acc;
      }, {});
      const topCities = Object.entries(cityCount)
        .map(([city, cnt]) => ({ city, cnt }))
        .sort((a, b) => b.cnt - a.cnt)
        .slice(0, 10);

      res.json({
        visitors: visitors.length,
        cartEvents: carts.length,
        recovered: carts.filter(c => c.recovered).length,
        messagesSent: execs.filter(e => {
          const camp = campaigns.find(c => c.id === e.campaign_id);
          return camp && camp.channel_id === channelId;
        }).length,
        byDay,
        cartByDay,
        topCities,
        campaignPerf: campaigns.map(c => ({
          name: c.name,
          total_sent: c.total_sent || 0,
          total_recovered: c.total_recovered || 0,
        })),
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Returns the dominant language among this channel's visitors,
   * derived from the language field auto-assigned during tracking.
   * Falls back to geo-mapping if the stored language is missing.
   */
  async getTopLanguage(req, res, next) {
    try {
      const db = getDb();
      const channelId = req.headers['x-channel-id'] || 'demo';
      const visitors = db.website_visitors.filter(v => v.channel_id === channelId);

      const counts = {};
      for (const v of visitors) {
        const lang = v.language
          || getLanguageFromGeo(v.city, v.state, v.country_code);
        counts[lang] = (counts[lang] || 0) + 1;
      }

      // Build sorted breakdown
      const breakdown = Object.entries(counts)
        .map(([lang, count]) => ({ lang, count }))
        .sort((a, b) => b.count - a.count);

      const topLang = breakdown[0]?.lang || 'en';
      const total = visitors.length;

      res.json({ topLang, total, breakdown });
    } catch (error) {
      next(error);
    }
  },
};
