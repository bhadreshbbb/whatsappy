import express from 'express';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { trackingRoutes } from './routes/tracking.routes.js';
import { visitorsRoutes } from './routes/visitors.routes.js';
import { campaignsRoutes } from './routes/campaigns.routes.js';
import { templatesRoutes } from './routes/templates.routes.js';
import { analyticsRoutes } from './routes/analytics.routes.js';
import { cartEventsRoutes } from './routes/cartEvents.routes.js';
import { settingsRoutes } from './routes/settings.routes.js';
import { whatsappRoutes } from './routes/whatsapp.routes.js';
import { contactsRoutes } from './routes/contacts.routes.js';
import { productsRoutes } from './routes/products.routes.js';
import { chatRoutes } from './routes/chat.routes.js';
import { galleryRoutes, galleryPublicRoutes } from './routes/gallery.routes.js';
import { metaTemplatesRoutes } from './routes/meta-templates.routes.js';
import { webhooksRoutes }      from './routes/webhooks.routes.js';
import { aiRoutes }            from './routes/ai.routes.js';
import { authRoutes }          from './routes/auth.routes.js';
import { requireAuth }         from './middleware/auth.middleware.js';
import { initDb } from './services/database.js';
import { startAutomation } from './jobs/automation.js';
import { errorHandler } from './middleware/errorHandler.js';
import { setChatIo } from './controllers/chat.controller.js';
import { getDb } from './services/database.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3001;

// Socket.io
const io = new SocketIO(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

io.on('connection', (socket) => {
  const channelId = socket.handshake.query.channelId || 'demo';
  socket.join(`channel_${channelId}`);
  console.log(`[Socket] Client connected — channel: ${channelId}`);

  // Track online status
  socket.on('user_online', ({ phone }) => {
    const db = getDb();
    const conv = db.chat_conversations.find(c => c.phone === phone && c.channel_id === channelId);
    if (conv) {
      conv.is_online = true;
      db.save();
      io.to(`channel_${channelId}`).emit('user_status', { phone, is_online: true });
    }
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected`);
  });
});

// Pass io to chat controller
setChatIo(io);

// CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-api-key', 'x-channel-id', 'Authorization'],
  credentials: false,
}));
app.options('*', cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── ONE-TIME: clear all contact/visitor data (remove after use) ─────────────
app.post('/api/__clear_contacts', async (req, res) => {
  if (req.headers['x-clear-secret'] !== 'trk-clear-2025-abc') {
    return res.status(403).json({ error: 'forbidden' });
  }
  const COLS = [
    'website_visitors', 'cart_events', 'purchase_history', 'page_views',
    'product_views', 'searches', 'custom_events', 'chat_conversations',
    'chat_messages', 'abandoned_cart_executions', 'campaign_locks',
  ];
  const db = getDb();
  const results = {};
  for (const col of COLS) {
    const before = (db[col] || []).length;
    db[col] = [];
    results[col] = before;
  }
  db.save();
  console.log('[Admin] Contact data cleared:', results);
  res.json({ success: true, cleared: results });
});

// Public routes — no auth required
app.use('/api/auth',     authRoutes);
app.use('/api/tracking', trackingRoutes);          // pixel — called by website visitors
app.use('/api/webhooks', webhooksRoutes);          // Meta/Shopify webhook callbacks
app.use('/api/gallery',  galleryPublicRoutes);     // proxy + preview — used as <img src>, can't send JWT

// Protected routes — JWT required
app.use('/api/visitors',       requireAuth, visitorsRoutes);
app.use('/api/campaigns',      requireAuth, campaignsRoutes);
app.use('/api/templates',      requireAuth, templatesRoutes);
app.use('/api/analytics',      requireAuth, analyticsRoutes);
app.use('/api/cart-events',    requireAuth, cartEventsRoutes);
app.use('/api/settings',       requireAuth, settingsRoutes);
app.use('/api/whatsapp',       requireAuth, whatsappRoutes);
app.use('/api/contacts',       requireAuth, contactsRoutes);
app.use('/api/products',       requireAuth, productsRoutes);
app.use('/api/chat',           requireAuth, chatRoutes);
app.use('/api/gallery',        requireAuth, galleryRoutes);
app.use('/api/meta-templates', requireAuth, metaTemplatesRoutes);
app.use('/api/ai',             requireAuth, aiRoutes);

// Serve built React frontend — must be BEFORE errorHandler
const clientDist = path.join(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {

  // ── Dynamic tracker.js — inject server-side channelId so visits NEVER go to "demo"
  // Even if the website forgets WhatswayConfig.channelId, the correct channel is used.
  // Priority: WhatswayConfig.channelId (page) → server-injected channelId (this) → ''
  const trackerPath = path.join(clientDist, 'tracker.js');
  app.get('/tracker.js', (req, res) => {
    try {
      const db = getDb();
      // Pick the real channelId: env override first, then first real user in DB
      let serverChannelId = process.env.DEFAULT_CHANNEL_ID || '';
      if (!serverChannelId && Array.isArray(db.users)) {
        const realUser = db.users.find(u => u.channel_id && u.channel_id !== 'demo');
        if (realUser) serverChannelId = realUser.channel_id;
      }

      let content = fs.readFileSync(trackerPath, 'utf8');
      // Inject channelId as a global at the TOP of the file — no regex fragility.
      // Tracker reads window.__WW_CID__ as the final fallback before empty string.
      // This means even if WhatswayConfig is missing/broken, correct channel is used.
      if (serverChannelId) {
        content = `window.__WW_CID__='${serverChannelId}';\n` + content;
      }

      res.setHeader('Content-Type', 'application/javascript');
      res.setHeader('Cache-Control', 'public, max-age=60'); // 1 min cache — stays fresh
      res.send(content);
      if (serverChannelId) {
        console.log(`[Tracker] Served tracker.js with channelId="${serverChannelId}"`);
      } else {
        console.warn('[Tracker] WARNING: No channelId found — tracker served without default channel');
      }
    } catch (e) {
      console.error('[Tracker] Error serving tracker.js:', e.message);
      res.sendFile(trackerPath); // fallback: serve raw file
    }
  });

  app.use(express.static(clientDist));
  // All non-API routes → serve React app (client-side routing)
  app.get(/^(?!\/api).*$/, (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
  console.log('[Static] Serving frontend from client/dist');
}

app.use(errorHandler);

// Wait for DB to fully load before accepting requests — prevents race where
// tracking calls arrive while MongoDB is still loading and trigger a save
// that wipes all collections (deleteMany on empty in-memory arrays).
initDb().then(() => {
  startAutomation();
  httpServer.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`  WhatsWay Pro Server running!`);
    console.log(`========================================`);
    console.log(`  API:    http://localhost:${PORT}`);
    console.log(`  Socket: ws://localhost:${PORT}`);
    console.log(`  Health: http://localhost:${PORT}/health`);
    console.log(`========================================\n`);
  });
});

export default app;
