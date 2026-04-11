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
import { galleryRoutes } from './routes/gallery.routes.js';
import { metaTemplatesRoutes } from './routes/meta-templates.routes.js';
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
    const conv = db.chat_conversations.find(c => c.phone === phone);
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

app.use('/api/tracking',   trackingRoutes);
app.use('/api/visitors',   visitorsRoutes);
app.use('/api/campaigns',  campaignsRoutes);
app.use('/api/templates',  templatesRoutes);
app.use('/api/analytics',  analyticsRoutes);
app.use('/api/cart-events',cartEventsRoutes);
app.use('/api/settings',   settingsRoutes);
app.use('/api/whatsapp',   whatsappRoutes);
app.use('/api/contacts',   contactsRoutes);
app.use('/api/products',   productsRoutes);
app.use('/api/chat',       chatRoutes);
app.use('/api/gallery',         galleryRoutes);
app.use('/api/meta-templates',  metaTemplatesRoutes);

// Serve built React frontend — must be BEFORE errorHandler
const clientDist = path.join(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // All non-API routes → serve React app (client-side routing)
  app.get(/^(?!\/api).*$/, (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
  console.log('[Static] Serving frontend from client/dist');
}

app.use(errorHandler);

initDb().then(() => {
  startAutomation();
});

httpServer.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`  WhatsWay Pro Server running!`);
  console.log(`========================================`);
  console.log(`  API:    http://localhost:${PORT}`);
  console.log(`  Socket: ws://localhost:${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/health`);
  console.log(`========================================\n`);
});

export default app;
