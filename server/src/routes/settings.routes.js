import { Router } from 'express';
import { getDb } from '../services/database.js';

const router = Router();

router.get('/', (req, res, next) => {
  try {
    const db = getDb();
    const channelId = req.headers['x-channel-id'] || 'demo';
    const settings = db.channel_settings.find(s => s.channel_id === channelId);
    res.json(settings ? JSON.parse(settings.settings || '{}') : {});
  } catch (error) {
    next(error);
  }
});

router.post('/', (req, res, next) => {
  try {
    const db = getDb();
    const channelId = req.headers['x-channel-id'] || 'demo';
    const settings = req.body;
    
    const idx = db.channel_settings.findIndex(s => s.channel_id === channelId);
    if (idx >= 0) {
      db.channel_settings[idx].settings = JSON.stringify(settings);
    } else {
      db.channel_settings.push({
        channel_id: channelId,
        settings: JSON.stringify(settings)
      });
    }
    
    db.save();
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post('/test-whatsapp', (req, res, next) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number required' });
    // Mock test — real integration would call Meta API here
    res.json({ success: true, message: `Test message sent to ${phone}` });
  } catch (error) {
    next(error);
  }
});

export { router as settingsRoutes };
