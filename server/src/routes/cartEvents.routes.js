import { Router } from 'express';
import { getDb } from '../services/database.js';

const router = Router();

router.get('/', (req, res, next) => {
  try {
    const db = getDb();
    const channelId = req.headers['x-channel-id'] || 'demo';
    const { status } = req.query;

    let results = db.cart_events.filter(c => c.channel_id === channelId);
    
    if (status === 'active') {
      results = results.filter(c => 
        (c.event_type === 'add_to_cart' || c.event_type === 'checkout_started') && 
        !c.recovered
      );
    } else if (status === 'purchased') {
      results = results.filter(c => c.recovered);
    }
    
    results = results.map(c => {
      const visitor = db.website_visitors.find(v => v.session_id === c.session_id);
      return {
        ...c,
        visitor_name: visitor?.name,
        visitor_phone: visitor?.phone,
        visitor_city: visitor?.city,
        visitor_country: visitor?.country,
        visitor_language: visitor?.language
      };
    });

    results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    res.json({
      events: results,
      total: results.length
    });
  } catch (error) {
    next(error);
  }
});

export { router as cartEventsRoutes };
