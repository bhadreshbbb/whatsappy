import { Router } from 'express';
import { getDb } from '../services/database.js';

const router = Router();

const STATUS_RANK = {
  purchased: 7, followup_complete: 6, product_recommendation: 6,
  abandoned_checkout: 5, abandoned_cart: 4,
  product_view_lock: 3, product_view: 2, active: 1,
};

router.get('/', (req, res, next) => {
  try {
    const db = getDb();
    const { search, page = '1', limit = '50', language } = req.query;
    const channelId = req.headers['x-channel-id'] || 'demo';

    // Deduplicate by phone — pick the session with the highest-ranked status
    const phoneMap = new Map();
    for (const v of db.website_visitors) {
      if (v.channel_id !== channelId || !v.phone) continue;
      const existing = phoneMap.get(v.phone);
      if (!existing || (STATUS_RANK[v.status] || 0) > (STATUS_RANK[existing.status] || 0)) {
        phoneMap.set(v.phone, v);
      }
    }
    let results = [...phoneMap.values()];

    if (search) {
      const s = String(search).toLowerCase();
      results = results.filter(v =>
        (v.name && v.name.toLowerCase().includes(s)) ||
        (v.phone && v.phone.includes(s))
      );
    }

    if (language) {
      results = results.filter(v => v.language === language);
    }

    results.sort((a, b) => new Date(b.last_seen_at || b.visited_at).getTime() - new Date(a.last_seen_at || a.visited_at).getTime());

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    res.json({
      contacts: results.slice(offset, offset + limitNum).map(v => ({
        id: v.id,
        name: v.name,
        phone: v.phone,
        email: v.email,
        city: v.city,
        country: v.country,
        country_code: v.country_code,
        language: v.language,
        status: v.status,
        last_active_at: v.last_seen_at || v.visited_at,
      })),
      total: results.length,
    });
  } catch (error) {
    next(error);
  }
});

export { router as contactsRoutes };
