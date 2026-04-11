import { Router } from 'express';
import { getDb } from '../services/database.js';

const router = Router();

router.get('/', (req, res, next) => {
  try {
    const db = getDb();
    const { search, page = '1', limit = '50', language } = req.query;
    const channelId = req.headers['x-channel-id'] || 'demo';

    let results = db.website_visitors.filter(v => v.channel_id === channelId && v.phone);

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
