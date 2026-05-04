import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

router.post('/signup',          authController.signup);
router.post('/login',           authController.login);
router.get('/me',               requireAuth, authController.me);
router.post('/change-password', requireAuth, authController.changePassword);

export { router as authRoutes };
