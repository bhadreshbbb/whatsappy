import { Router } from 'express';
import {
  listTemplates, createTemplate, refreshStatus,
  saveProductConfig, deleteTemplate, scrapeProduct,
} from '../controllers/meta-templates.controller.js';

const router = Router();

router.get('/',                         listTemplates);
router.post('/',                        createTemplate);
router.post('/scrape-product',          scrapeProduct);
router.get('/:id/refresh',             refreshStatus);
router.put('/:id/product-config',      saveProductConfig);
router.delete('/:id',                  deleteTemplate);

export { router as metaTemplatesRoutes };
