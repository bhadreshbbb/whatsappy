import { Router } from 'express';
import {
  listTemplates, createTemplate, refreshStatus,
  saveProductConfig, deleteTemplate, scrapeProduct,
  getHotProducts, refreshAutoProducts, previewPayload, getSendPayload,
} from '../controllers/meta-templates.controller.js';

const router = Router();

router.get('/', listTemplates);
router.post('/', createTemplate);
router.post('/preview-payload', previewPayload);
router.post('/scrape-product', scrapeProduct);
router.get('/hot-products', getHotProducts);
router.get('/:id/refresh', refreshStatus);
router.get('/:id/send-payload', getSendPayload);
router.post('/:id/refresh-auto', refreshAutoProducts);
router.put('/:id/product-config', saveProductConfig);
router.delete('/:id', deleteTemplate);

export { router as metaTemplatesRoutes };
