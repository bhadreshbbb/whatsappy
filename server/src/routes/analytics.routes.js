import { Router } from 'express';
import { analyticsController } from '../controllers/analytics.controller.js';

const router = Router();

router.get('/dashboard',    analyticsController.getDashboard);
router.get('/top-language', analyticsController.getTopLanguage);
router.get('/pages',        analyticsController.getPageAnalytics);
router.get('/cities',       analyticsController.getCityAnalytics);
router.get('/contacts',     analyticsController.getContactPower);
router.get('/devices',      analyticsController.getDeviceBreakdown);
router.get('/engagement',       analyticsController.getEngagementStats);
router.get('/brand',            analyticsController.getBrandIntel);
router.get('/repeat-visitors',  analyticsController.getRepeatVisitors);
router.get('/',                 analyticsController.getAnalytics);

export { router as analyticsRoutes };
