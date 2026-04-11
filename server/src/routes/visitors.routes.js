import { Router } from 'express';
import { visitorsController } from '../controllers/visitors.controller.js';

const router = Router();

router.get('/', visitorsController.getVisitors);
router.get('/stats', visitorsController.getStats);
router.get('/:id', visitorsController.getVisitor);
router.get('/:id/carts', visitorsController.getVisitorCarts);
router.get('/:id/activity', visitorsController.getVisitorActivity);

export { router as visitorsRoutes };
