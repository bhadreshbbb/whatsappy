import { Router } from 'express';
import { visitorsController } from '../controllers/visitors.controller.js';
import { getDb } from '../services/database.js';

const router = Router();

router.get('/', visitorsController.getVisitors);
router.get('/stats', visitorsController.getStats);

// Protected diagnostic: compares JWT channelId vs what's actually in DB.
// Returns channel_id from JWT, how many visitors are stored under it,
// and a summary of all channel_ids that have data — so you can spot mismatches.
router.get('/channel-check', (req, res) => {
  try {
    const db = getDb();
    const jwtChannelId = req.headers['x-channel-id'] || '';

    const counts = {};
    for (const v of db.website_visitors) {
      const cid = v.channel_id || '(none)';
      counts[cid] = (counts[cid] || 0) + 1;
    }

    const sorted = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([channel_id, visitors]) => ({
        channel_id,
        visitors,
        is_your_channel: channel_id === jwtChannelId,
      }));

    const yourCount = counts[jwtChannelId] || 0;
    const demoCount = counts['demo'] || 0;

    res.json({
      your_channel_id:    jwtChannelId || '(empty — JWT missing channelId)',
      your_visitor_count: yourCount,
      demo_visitor_count: demoCount,
      mismatch_warning:   demoCount > 0 && yourCount === 0
        ? `${demoCount} visitors stored under "demo" but 0 under your channel "${jwtChannelId}". Your tracker script likely has channelId: "demo" instead of "${jwtChannelId}". Update WhatswayConfig.channelId on your website.`
        : null,
      all_channels: sorted,
      total_visitors_in_db: db.website_visitors.length,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', visitorsController.getVisitor);
router.get('/:id/carts', visitorsController.getVisitorCarts);
router.get('/:id/activity', visitorsController.getVisitorActivity);

export { router as visitorsRoutes };
