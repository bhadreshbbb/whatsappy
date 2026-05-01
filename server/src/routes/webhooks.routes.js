import { Router } from 'express';
import { webhooksController } from '../controllers/webhooks.controller.js';

const router = Router();

// Shopify Order webhook (POST from Shopify Admin)
router.post('/shopify/order', webhooksController.shopifyOrder);

// Custom website / any platform order (universal)
router.post('/order', webhooksController.customOrder);

// Meta WhatsApp incoming messages webhook
router.get('/whatsapp',  webhooksController.webhookVerify);    // verification
router.post('/whatsapp', webhooksController.webhookIncoming);   // incoming messages + statuses

// Order responses API
router.get('/order-responses/:campaignId', webhooksController.getOrderResponses);
router.get('/orders/pending',              webhooksController.getPendingOrders);
router.post('/order/test',                 webhooksController.testCodOrder);
router.post('/product-view/test',          webhooksController.testProductView);

export { router as webhooksRoutes };
