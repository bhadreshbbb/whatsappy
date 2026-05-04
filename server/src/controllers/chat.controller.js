import { getDb } from '../services/database.js';
import { whatsappService } from '../services/whatsapp.service.js';

let _io = null;
export function setChatIo(io) { _io = io; }

/**
 * Shared function — called by automation.js and chat controller to record
 * any outgoing message into the chat inbox and push a live socket event.
 */
export function saveChatMessage(db, phone, text, channelId, { wamid = null, campaignName = null, templateName = null } = {}) {
  const msgId = `out_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const timestamp = new Date().toISOString();

  const msg = {
    id: msgId,
    phone,
    channel_id: channelId,
    direction: 'out',
    type: 'text',
    text: text || '',
    media_url: '',
    timestamp,
    status: 'sent',
    wamid,
    campaign_name: campaignName || null,
    template_name: templateName || null,
  };
  db.chat_messages.push(msg);

  // Get visitor name
  const visitor = db.website_visitors.find(v => v.phone === phone && v.channel_id === channelId);
  const conv = getOrCreateConversation(db, phone, visitor?.name, channelId);
  conv.last_message = text || '';
  conv.last_message_at = timestamp;
  conv.last_message_direction = 'out';

  if (_io) {
    _io.to(`channel_${channelId}`).emit('new_message', {
      message: msg,
      conversation: convWithStats(conv, db),
    });
  }
  return msg;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getOrCreateConversation(db, phone, name, channelId) {
  let conv = db.chat_conversations.find(c => c.phone === phone && c.channel_id === channelId);
  if (!conv) {
    conv = {
      phone,
      name: name || phone,
      channel_id: channelId,
      is_online: false,
      last_seen: null,
      unread_count: 0,
      last_message: '',
      last_message_at: new Date().toISOString(),
      last_message_direction: 'in',
    };
    db.chat_conversations.push(conv);
  }
  return conv;
}

function convWithStats(conv, db) {
  const msgs = db.chat_messages.filter(m => m.phone === conv.phone && m.channel_id === conv.channel_id);
  const hasReplied  = msgs.some(m => m.direction === 'in');
  const hasSeen     = msgs.some(m => m.direction === 'out' && m.status === 'seen');
  const hasNotSeen  = msgs.some(m => m.direction === 'out' && m.status !== 'seen');
  return { ...conv, has_replied: hasReplied, has_seen: hasSeen, has_not_seen: hasNotSeen };
}

// ─── Controllers ─────────────────────────────────────────────────────────────

export const chatController = {
  async getConversations(req, res, next) {
    try {
      const db = getDb();
      const channelId = req.headers['x-channel-id'] || '';
      const { filter, search } = req.query;

      // Seed conversations from existing visitors who have phone numbers
      db.website_visitors.forEach(v => {
        if (!v.phone || v.channel_id !== channelId) return;
        const exists = db.chat_conversations.find(c => c.phone === v.phone && c.channel_id === channelId);
        if (!exists) {
          db.chat_conversations.push({
            phone: v.phone,
            name: v.name || v.phone,
            channel_id: channelId,
            is_online: false,
            last_seen: v.visited_at || null,
            unread_count: 0,
            last_message: '',
            last_message_at: v.visited_at || new Date().toISOString(),
            last_message_direction: 'out',
          });
        }
      });

      let convs = db.chat_conversations
        .filter(c => c.channel_id === channelId)
        .map(c => convWithStats(c, db));

      // Apply filters
      if (filter === 'online')      convs = convs.filter(c => c.is_online);
      if (filter === 'replied')     convs = convs.filter(c => c.has_replied);
      if (filter === 'not_replied') convs = convs.filter(c => !c.has_replied);
      if (filter === 'seen')        convs = convs.filter(c => c.has_seen);
      if (filter === 'not_seen')    convs = convs.filter(c => c.has_not_seen);

      // Search
      if (search) {
        const s = search.toLowerCase();
        convs = convs.filter(c =>
          (c.name || '').toLowerCase().includes(s) ||
          (c.phone || '').includes(s)
        );
      }

      convs.sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at));
      res.json(convs);
    } catch (err) { next(err); }
  },

  async getMessages(req, res, next) {
    try {
      const db = getDb();
      const channelId = req.headers['x-channel-id'] || '';
      const { phone } = req.params;

      const msgs = db.chat_messages
        .filter(m => m.phone === phone && m.channel_id === channelId)
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

      // Auto-mark incoming messages as seen when chat is opened
      let updated = false;
      db.chat_messages.forEach(m => {
        if (m.phone === phone && m.channel_id === channelId && m.direction === 'in' && m.status !== 'seen') {
          m.status = 'seen';
          updated = true;
        }
      });
      if (updated) {
        const conv = db.chat_conversations.find(c => c.phone === phone && c.channel_id === channelId);
        if (conv) conv.unread_count = 0;
        db.save();
      }

      res.json(msgs);
    } catch (err) { next(err); }
  },

  async sendMessage(req, res, next) {
    try {
      const db = getDb();
      const channelId = req.headers['x-channel-id'] || '';
      const { phone } = req.params;
      const { text, media_url } = req.body;

      if (!text && !media_url) return res.status(400).json({ error: 'Message text required' });

      // Save to chat immediately with 'sending' status
      const msgId = `out_${Date.now()}_${Math.random().toString(36).substr(2,6)}`;
      const timestamp = new Date().toISOString();
      const msg = {
        id: msgId, phone, channel_id: channelId,
        direction: 'out', type: media_url ? 'image' : 'text',
        text: text || '', media_url: media_url || '',
        timestamp, status: 'sending', wamid: null,
      };
      db.chat_messages.push(msg);

      const visitor = db.website_visitors.find(v => v.phone === phone);
      const conv = getOrCreateConversation(db, phone, visitor?.name, channelId);
      conv.last_message = text || '📷 Image';
      conv.last_message_at = timestamp;
      conv.last_message_direction = 'out';
      db.save();

      // Emit immediately so UI shows 'sending' state
      if (_io) _io.to(`channel_${channelId}`).emit('new_message', { message: msg, conversation: convWithStats(conv, db) });

      // Call WhatsApp API
      try {
        const result = await whatsappService.sendTextMessage(phone, text || '');
        msg.status = 'sent';
        msg.wamid = result.wamid || null;
        db.save();
        // Update status tick in UI
        if (_io) _io.to(`channel_${channelId}`).emit('message_status', { wamid: msg.id, status: 'sent', phone });
      } catch (e) {
        msg.status = 'sent'; // keep optimistic if API missing
        console.error('[Chat] WhatsApp send error:', e.message);
        db.save();
      }

      res.json(msg);
    } catch (err) { next(err); }
  },

  async markSeen(req, res, next) {
    try {
      const db = getDb();
      const channelId = req.headers['x-channel-id'] || '';
      const { phone } = req.params;

      db.chat_messages.forEach(m => {
        if (m.phone === phone && m.channel_id === channelId && m.direction === 'out') {
          m.status = 'seen';
        }
      });
      const conv = db.chat_conversations.find(c => c.phone === phone && c.channel_id === channelId);
      if (conv) conv.unread_count = 0;
      db.save();

      if (_io) {
        _io.to(`channel_${channelId}`).emit('messages_seen', { phone });
      }
      res.json({ ok: true });
    } catch (err) { next(err); }
  },

  // Meta WhatsApp webhook verification (GET)
  webhookVerify(req, res) {
    const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'whatsway_verify_token';
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('[Webhook] Meta webhook verified ✓');
      return res.status(200).send(challenge);
    }
    res.sendStatus(403);
  },

  // Meta WhatsApp webhook receiver (POST)
  async webhookReceive(req, res, next) {
    try {
      const db = getDb();
      const channelId = process.env.CHANNEL_ID || 'demo';
      const body = req.body;

      // Always ACK immediately (Meta requires 200 within 5s)
      res.sendStatus(200);

      if (body.object !== 'whatsapp_business_account') return;

      for (const entry of (body.entry || [])) {
        for (const change of (entry.changes || [])) {
          const val = change.value;
          if (!val) continue;

          // ── Incoming messages ──
          for (const waMsg of (val.messages || [])) {
            const phone = waMsg.from;
            const contact = (val.contacts || []).find(c => c.wa_id === phone);
            const name = contact?.profile?.name || phone;
            const text = waMsg.type === 'text' ? waMsg.text?.body : `[${waMsg.type}]`;
            const timestamp = new Date(Number(waMsg.timestamp) * 1000).toISOString();

            // Dedup by wamid
            const exists = db.chat_messages.find(m => m.wamid === waMsg.id);
            if (exists) continue;

            const msg = {
              id: `in_${Date.now()}_${Math.random().toString(36).substr(2,6)}`,
              phone,
              channel_id: channelId,
              direction: 'in',
              type: waMsg.type,
              text: text || '',
              media_url: '',
              timestamp,
              status: 'received',
              wamid: waMsg.id,
            };
            db.chat_messages.push(msg);

            const conv = getOrCreateConversation(db, phone, name, channelId);
            conv.name = name;
            conv.last_message = text || '';
            conv.last_message_at = timestamp;
            conv.last_message_direction = 'in';
            conv.unread_count = (conv.unread_count || 0) + 1;

            // Update visitor name too
            const visitor = db.website_visitors.find(v => v.phone === phone && v.channel_id === channelId);
            if (visitor && name !== phone) visitor.name = name;

            db.save();

            if (_io) {
              _io.to(`channel_${channelId}`).emit('new_message', { message: msg, conversation: convWithStats(conv, db) });
            }
            console.log(`[Webhook] Incoming from ${phone}: "${text}"`);
          }

          // ── Status updates (delivered / read) ──
          for (const st of (val.statuses || [])) {
            const msg = db.chat_messages.find(m => m.wamid === st.id);
            if (!msg) continue;
            const statusMap = { sent: 'sent', delivered: 'delivered', read: 'seen', failed: 'failed' };
            msg.status = statusMap[st.status] || msg.status;
            db.save();
            if (_io) {
              _io.to(`channel_${channelId}`).emit('message_status', { wamid: st.id, status: msg.status, phone: msg.phone });
            }
          }
        }
      }
    } catch (err) {
      console.error('[Webhook] Error:', err);
    }
  },

  // Simulate incoming message (dev/testing)
  async simulateIncoming(req, res, next) {
    try {
      const db = getDb();
      const channelId = req.headers['x-channel-id'] || '';
      const { phone, text, name } = req.body;
      if (!phone || !text) return res.status(400).json({ error: 'phone and text required' });

      const msg = {
        id: `in_${Date.now()}_${Math.random().toString(36).substr(2,6)}`,
        phone,
        channel_id: channelId,
        direction: 'in',
        type: 'text',
        text,
        media_url: '',
        timestamp: new Date().toISOString(),
        status: 'received',
        wamid: `sim_${Date.now()}`,
      };
      db.chat_messages.push(msg);

      const conv = getOrCreateConversation(db, phone, name, channelId);
      conv.name = name || conv.name;
      conv.last_message = text;
      conv.last_message_at = msg.timestamp;
      conv.last_message_direction = 'in';
      conv.unread_count = (conv.unread_count || 0) + 1;
      db.save();

      if (_io) {
        _io.to(`channel_${channelId}`).emit('new_message', { message: msg, conversation: convWithStats(conv, db) });
      }
      res.json({ ok: true, message: msg });
    } catch (err) { next(err); }
  },
};
