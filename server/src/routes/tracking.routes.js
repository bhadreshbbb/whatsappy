import { Router } from 'express';
import { trackingController } from '../controllers/tracking.controller.js';

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

export { router as trackingRoutes };
