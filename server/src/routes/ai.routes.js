import { Router } from 'express';
import { aiController } from '../controllers/ai.controller.js';

const router = Router();

router.get('/insights',              aiController.getInsights);
router.get('/intent-score/:phone',   aiController.getIntentScore);
router.post('/generate-template',    aiController.generateTemplate);

export { router as aiRoutes };
