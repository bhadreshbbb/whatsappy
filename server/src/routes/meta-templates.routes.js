import { Router } from 'express';
import {
  listTemplates, createTemplate, refreshStatus,
  saveProductConfig, deleteTemplate,
} from '../controllers/meta-templates.controller.js';

const router = Router();

router.get('/',                         listTemplates);
router.post('/',                        createTemplate);
router.get('/:id/refresh',             refreshStatus);
router.put('/:id/product-config',      saveProductConfig);
router.delete('/:id',                  deleteTemplate);

export { router as metaTemplatesRoutes };
