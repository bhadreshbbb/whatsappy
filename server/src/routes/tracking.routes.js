import { Router } from 'express';
import { trackingController } from '../controllers/tracking.controller.js';
import { getDb } from '../services/database.js';

const router = Router();

router.post('/visitor',          (req, res, next) => trackingController.trackVisitor(req, res, next));
router.post('/click',            (req, res, next) => trackingController.trackClick(req, res, next));
router.post('/identify',         (req, res, next) => trackingController.trackIdentify(req, res, next));
router.post('/pageview',         (req, res, next) => trackingController.trackPageView(req, res, next));
router.post('/cart',             (req, res, next) => trackingController.trackCart(req, res, next));
router.post('/checkout',         (req, res, next) => trackingController.trackCheckout(req, res, next));
router.post('/purchase',         (req, res, next) => trackingController.trackPurchase(req, res, next));
router.post('/product',          (req, res, next) => trackingController.trackProduct(req, res, next));
router.post('/search',           (req, res, next) => trackingController.trackSearch(req, res, next));
router.post('/custom',           (req, res, next) => trackingController.trackCustom(req, res, next));
router.post('/shopify-products', (req, res, next) => trackingController.trackShopifyProducts(req, res, next));

// Public diagnostic: shows what channel_ids have visitor data in DB.
// Used by Settings page to detect tracker misconfiguration (e.g. channelId: 'demo' on website).
router.get('/channel-debug', (req, res) => {
  try {
    const db = getDb();
    const counts = {};
    for (const v of db.website_visitors) {
      const cid = v.channel_id || '(none)';
      counts[cid] = (counts[cid] || 0) + 1;
    }
    const sorted = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([channel_id, visitors]) => ({ channel_id, visitors }));
    const queriedCid = req.query.channelId || null;
    const queriedCount = queriedCid ? (counts[queriedCid] || 0) : null;
    res.json({
      total_visitors_in_db: db.website_visitors.length,
      channels_with_data:   sorted,
      queried_channel:      queriedCid ? { channel_id: queriedCid, visitors: queriedCount } : null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export { router as trackingRoutes };
