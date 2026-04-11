import { Router } from 'express';
import { getDb } from '../services/database.js';

const router = Router();

// GET /api/products — return product catalog for this channel
router.get('/', (req, res, next) => {
  try {
    const db = getDb();
    const channelId = req.headers['x-channel-id'] || 'demo';
    const products = db.product_catalog.filter(p => p.channel_id === channelId)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    res.json({ products, total: products.length });
  } catch (error) {
    next(error);
  }
});

export { router as productsRoutes };
