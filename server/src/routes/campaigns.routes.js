import { Router } from 'express';
import { campaignsController } from '../controllers/campaigns.controller.js';

const router = Router();

router.get('/', campaignsController.getCampaigns);
router.get('/:id', campaignsController.getCampaign);
router.post('/', campaignsController.createCampaign);
router.put('/:id', campaignsController.updateCampaign);
router.delete('/:id', campaignsController.deleteCampaign);
router.post('/:id/send', campaignsController.sendCampaign);
router.post('/:id/status', campaignsController.updateStatus);
router.get('/:id/executions', campaignsController.getExecutions);
router.get('/:id/analytics', campaignsController.getCampaignAnalytics);

export { router as campaignsRoutes };
