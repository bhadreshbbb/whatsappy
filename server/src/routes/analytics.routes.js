import { Router } from 'express';
import { analyticsController } from '../controllers/analytics.controller.js';

const router = Router();

router.get('/dashboard', analyticsController.getDashboard);
router.get('/top-language', analyticsController.getTopLanguage);
router.get('/', analyticsController.getAnalytics);

export { router as analyticsRoutes };
