import { Router } from 'express';
import { templatesController } from '../controllers/templates.controller.js';

const router = Router();

router.get('/', templatesController.getTemplates);
router.get('/:id', templatesController.getTemplate);
router.post('/', templatesController.createTemplate);
router.put('/:id', templatesController.updateTemplate);
router.delete('/:id', templatesController.deleteTemplate);

export { router as templatesRoutes };
