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

// Migrate all "demo" channel data → real channel from JWT.
// One-time fix for users who installed tracker without channelId (defaulted to "demo").
router.post('/migrate-from-demo', (req, res) => {
  try {
    const db      = getDb();
    const realCid = req.headers['x-channel-id'] || '';
    if (!realCid) return res.status(400).json({ error: 'No channelId in JWT' });

    const TABLES = [
      'website_visitors', 'cart_events', 'purchase_history',
      'page_views', 'product_views', 'searches', 'custom_events',
      'abandoned_cart_campaigns', 'abandoned_cart_executions',
      'campaign_locks', 'product_catalog', 'channel_settings',
    ];

    const counts = {};
    for (const table of TABLES) {
      if (!Array.isArray(db[table])) continue;
      let n = 0;
      for (const doc of db[table]) {
        if (doc.channel_id === 'demo') {
          doc.channel_id = realCid;
          n++;
        }
      }
      if (n > 0) counts[table] = n;
    }

    db.save();
    const total = Object.values(counts).reduce((s, v) => s + v, 0);
    console.log(`[Migrate] demo → ${realCid}: ${total} records across`, counts);
    res.json({ success: true, migrated: total, by_table: counts, to_channel: realCid });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/visitors/cleanup-phone/:phone
// Removes ALL records for a phone number (all variants) from every table.
router.delete('/cleanup-phone/:phone', (req, res) => {
  try {
    const db = getDb();
    const raw    = req.params.phone.replace(/^\+/, '');
    const short  = raw.replace(/^91/, '');
    const phones = [...new Set([raw, `+${raw}`, short])];

    const TABLES = [
      'website_visitors', 'cart_events', 'purchase_history', 'product_views',
      'abandoned_cart_executions', 'campaign_locks', 'chat_conversations',
      'order_responses', 'searches', 'custom_events', 'user_sessions',
    ];

    const counts = {};
    for (const table of TABLES) {
      if (!Array.isArray(db[table])) continue;
      const before = db[table].length;
      db[table] = db[table].filter(r => !phones.includes(r.phone));
      const deleted = before - db[table].length;
      if (deleted > 0) counts[table] = deleted;
    }

    // chat_messages — also check from/to/conversation_id
    if (Array.isArray(db.chat_messages)) {
      const before = db.chat_messages.length;
      db.chat_messages = db.chat_messages.filter(r =>
        !phones.includes(r.phone) &&
        !phones.includes(r.from) &&
        !phones.includes(r.to) &&
        !phones.includes(r.conversation_id)
      );
      const deleted = before - db.chat_messages.length;
      if (deleted > 0) counts.chat_messages = deleted;
    }

    db.save();
    const total = Object.values(counts).reduce((s, v) => s + v, 0);
    console.log(`[Cleanup] Removed ${total} records for phones ${phones.join(', ')}:`, counts);
    res.json({ success: true, phones_matched: phones, total_deleted: total, by_table: counts });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', visitorsController.getVisitor);
router.get('/:id/carts', visitorsController.getVisitorCarts);
router.get('/:id/activity', visitorsController.getVisitorActivity);

export { router as visitorsRoutes };
