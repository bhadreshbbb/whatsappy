/**
 * Webhooks Controller
 * Handles:
 *  1. Shopify Order webhook  → POST /api/webhooks/shopify/order
 *  2. Meta WhatsApp incoming → POST /api/webhooks/whatsapp
 *     (user replies to order confirmation messages)
 */
import { getDb } from '../services/database.js';
import { whatsappService } from '../services/whatsapp.service.js';
import { upgradeStatus } from '../utils/statusMachine.js';

// ── COD gateway keywords ──────────────────────────────────────────────────────
const COD_KEYWORDS = ['cash on delivery', 'cod', 'pay on delivery', 'cash', 'manual'];
function isCOD(gateway = '') {
  const g = gateway.toLowerCase();
  return COD_KEYWORDS.some(k => g.includes(k));
}

// ── Normalize phone: ensure 91XXXXXXXXXX format ───────────────────────────────
function normalizePhone(raw = '') {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('91') && digits.length === 12) return digits;
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

// ── Build product summary string from Shopify line_items ──────────────────────
function buildProductsSummary(lineItems = []) {
  if (!Array.isArray(lineItems) || !lineItems.length) return '';
  return lineItems
    .map(i => {
      const name = i.title || i.name || 'Product';
      const qty  = i.quantity || 1;
      return `${name} × ${qty}`;
    })
    .join(', ');
}

// ── Get product image from first line_item ────────────────────────────────────
function getFirstProductImage(lineItems = []) {
  const first = lineItems[0];
  return first?.image?.src || first?.image_url || null;
}

export const webhooksController = {

  // ── 1. Shopify Order Created webhook ────────────────────────────────────────
  // Shopify Admin → Settings → Notifications → Webhooks
  // Event: "Order creation" → URL: https://yourserver.com/api/webhooks/shopify/order
  async shopifyOrder(req, res) {
    try {
      const db   = getDb();
      const body = req.body;
      const channelId = req.headers['x-channel-id'] || 'demo';

      // Extract core fields from Shopify order payload
      const shopifyOrderId = String(body.id || body.order_id || '');
      const orderNumber    = String(body.order_number || body.name || shopifyOrderId);
      const rawPhone       = body.phone || body.billing_address?.phone || body.shipping_address?.phone || '';
      const phone          = normalizePhone(rawPhone);
      const gateway        = body.gateway || body.payment_gateway || '';
      const financialStatus= body.financial_status || '';
      const totalPrice     = parseFloat(body.total_price || body.subtotal_price || 0);
      const currency       = body.currency || 'INR';
      const lineItems      = body.line_items || [];
      const customerName   = body.customer?.first_name
        ? `${body.customer.first_name} ${body.customer.last_name || ''}`.trim()
        : (body.shipping_address?.name || body.billing_address?.name || 'Customer');
      const cancelled      = !!body.cancelled_at;
      const confirmed      = body.confirmed !== false && !cancelled;

      // Detect COD
      const cod = isCOD(gateway) || gateway === '' && financialStatus === 'pending';

      console.log(`[Shopify Webhook] Order ${orderNumber} — gateway="${gateway}" cod=${cod} phone=${phone} total=${totalPrice}`);

      // Skip if already recorded (idempotency)
      if (shopifyOrderId) {
        const existing = (db.orders || []).find(o => o.shopify_order_id === shopifyOrderId);
        if (existing) {
          console.log(`[Shopify Webhook] Duplicate order ${shopifyOrderId} — skipped`);
          return res.json({ success: true, duplicate: true });
        }
      }

      // Skip cancelled / not confirmed
      if (!confirmed) {
        return res.json({ success: true, skipped: 'not_confirmed' });
      }

      // Build order record
      if (!db.orders) db.orders = [];
      const order = {
        id:               (db.orders.length || 0) + 1,
        channel_id:       channelId,
        shopify_order_id: shopifyOrderId,
        order_number:     orderNumber,
        phone:            phone,
        name:             customerName,
        gateway:          gateway,
        is_cod:           cod,
        financial_status: financialStatus,
        total_amount:     totalPrice,
        currency:         currency,
        products:         JSON.stringify(lineItems.map(i => ({
          title: i.title || i.name || '',
          quantity: i.quantity || 1,
          price: parseFloat(i.price || 0),
          image: i.image?.src || null,
          variant: i.variant_title || '',
        }))),
        products_summary: buildProductsSummary(lineItems),
        product_image:    getFirstProductImage(lineItems),
        payment_method:   cod ? 'Cash on Delivery' : (gateway || 'Online Payment'),
        status:           'pending',
        confirmation_sent: false,
        confirmation_sent_at: null,
        created_at:       new Date().toISOString(),
      };
      db.orders.push(order);

      // Also add to purchase_history for existing tracking
      if (!db.purchase_history) db.purchase_history = [];
      const phExisting = db.purchase_history.find(p =>
        p.order_id === shopifyOrderId && p.channel_id === channelId
      );
      if (!phExisting) {
        db.purchase_history.push({
          id:          (db.purchase_history.length || 0) + 1,
          channel_id:  channelId,
          phone:       phone,
          order_id:    shopifyOrderId,
          products:    order.products,
          total_amount: totalPrice,
          currency:    currency,
          purchased_at: new Date().toISOString(),
          payment_method: order.payment_method,
          is_cod:      cod,
        });
      }

      // Update visitor status → purchased
      if (phone) {
        const vi = db.website_visitors.findIndex(v =>
          v.channel_id === channelId && v.phone === phone
        );
        if (vi >= 0) {
          upgradeStatus(db.website_visitors[vi], 'purchased');
          db.website_visitors[vi].last_purchased_at = new Date().toISOString();
          db.website_visitors[vi].purchase_count = (db.website_visitors[vi].purchase_count || 0) + 1;
        }
        // Mark cart events as recovered
        (db.cart_events || []).forEach(c => {
          if (c.channel_id === channelId && c.phone === phone && !c.recovered) {
            c.recovered = 1;
            c.recovered_at = new Date().toISOString();
          }
        });
      }

      db.save();
      console.log(`[Shopify Webhook] Saved order ${orderNumber} — COD=${cod} phone=${phone}`);

      res.json({ success: true, order_id: order.id, order_number: orderNumber, is_cod: cod, phone });
    } catch (err) {
      console.error('[Shopify Webhook] Error:', err.message);
      res.status(500).json({ error: err.message });
    }
  },

  // ── 2. Meta WhatsApp incoming message webhook ────────────────────────────────
  // Meta sends user replies here (GET for verification, POST for messages)
  // Set in Meta App Dashboard → WhatsApp → Configuration → Webhook
  // Subscribed fields: messages
  webhookVerify(req, res) {
    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'whatsway_verify_123';
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('[WhatsApp Webhook] Verified');
      return res.status(200).send(challenge);
    }
    res.sendStatus(403);
  },

  async webhookIncoming(req, res) {
    try {
      // Always respond 200 quickly — Meta expects fast response
      res.sendStatus(200);

      const db   = getDb();
      const body = req.body;

      // Parse Meta webhook format
      const entry   = body?.entry?.[0];
      const changes = entry?.changes?.[0];
      const value   = changes?.value;
      if (!value) return;

      const messages  = value.messages  || [];
      const statuses  = value.statuses  || [];
      const channelId = 'demo'; // single channel for now

      // ── Handle delivery/read statuses ───────────────────────────────────────
      for (const st of statuses) {
        const wamid  = st.id;
        const status = st.status; // 'sent', 'delivered', 'read', 'failed'
        const phone  = normalizePhone(st.recipient_id);
        if (wamid && status) {
          // Update execution record
          const exec = (db.abandoned_cart_executions || []).find(e => e.wamid === wamid);
          if (exec) {
            exec.delivery_status = status;
            if (status === 'read') exec.read_at = new Date().toISOString();
          }
        }
      }

      // Contacts name map (Meta sends contact profile alongside messages)
      const contactsMap = {};
      for (const c of (value.contacts || [])) {
        if (c.wa_id) contactsMap[normalizePhone(c.wa_id)] = c.profile?.name || null;
      }

      // ── Handle incoming messages ─────────────────────────────────────────────
      for (const msg of messages) {
        const phone      = normalizePhone(msg.from);
        const incomingId = msg.id;   // wamid of THIS incoming message
        const contextId  = msg.context?.id || null; // wamid of the message user is REPLYING TO
        const timestamp  = msg.timestamp ? new Date(Number(msg.timestamp) * 1000).toISOString() : new Date().toISOString();
        const senderName = contactsMap[phone] || null;

        let responseText = '';
        let isQuickReply = false;

        switch (msg.type) {
          case 'text':
            responseText = msg.text?.body || '';
            break;
          case 'button':
            // Quick reply button tap
            responseText = msg.button?.text || msg.button?.payload || '';
            isQuickReply = true;
            break;
          case 'interactive':
            responseText = msg.interactive?.button_reply?.title
              || msg.interactive?.list_reply?.title
              || '';
            isQuickReply = true;
            break;
          default:
            responseText = `[${msg.type} message]`;
        }

        if (!phone) continue;

        // Dedup — skip if we already stored this exact incoming message
        if (incomingId && (db.order_responses || []).find(r => r.incoming_wamid === incomingId)) {
          console.log(`[WhatsApp Webhook] Duplicate incoming ${incomingId} — skipped`);
          continue;
        }

        console.log(`[WhatsApp Webhook] Reply from ${phone}${senderName ? ' ('+senderName+')' : ''}: "${responseText}" [type=${msg.type}]${contextId ? ' ctx='+contextId : ''}`);

        const textLower = responseText.toLowerCase().trim();

        // ── Classify ──────────────────────────────────────────────────────────
        const confirmPhrases = ['yes', 'confirmed', 'confirm', 'ha', 'haan', 'ok', 'okay'];
        const cancelPhrases  = ['cancel', 'no', 'nahi', 'nhi'];
        let responseType;
        if (confirmPhrases.some(p => textLower === p || textLower.includes(p))) responseType = 'confirmed';
        else if (cancelPhrases.some(p => textLower === p || textLower.includes(p)))  responseType = 'cancelled';
        else responseType = 'custom';

        // ── Find originating execution via context.id (most reliable) ──────────
        let execution = null;
        if (contextId) {
          execution = (db.abandoned_cart_executions || []).find(e => e.wamid === contextId);
        }
        // Fallback: latest order_confirmation execution for this phone
        if (!execution) {
          execution = (db.abandoned_cart_executions || [])
            .filter(e => e.phone === phone && e.campaign_type === 'order_confirmation')
            .sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at))[0] || null;
        }

        // ── Find order linked to this execution or latest pending order ─────────
        let order = null;
        if (execution?.order_id) {
          order = (db.orders || []).find(o => o.id === execution.order_id);
        }
        if (!order) {
          order = (db.orders || [])
            .filter(o => o.channel_id === channelId && o.phone === phone)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;
        }

        // ── Find visitor for name ──────────────────────────────────────────────
        const visitor = db.website_visitors.find(v =>
          v.channel_id === channelId && v.phone === phone
        );
        const displayName = senderName || visitor?.name || order?.name || 'Unknown';

        // ── Store response ─────────────────────────────────────────────────────
        if (!db.order_responses) db.order_responses = [];
        const responseRecord = {
          id:             (db.order_responses.length || 0) + 1,
          channel_id:     channelId,
          phone:          phone,
          name:           displayName,
          incoming_wamid: incomingId,
          context_wamid:  contextId,
          order_id:       order?.id || null,
          order_number:   order?.order_number || null,
          campaign_id:    execution?.campaign_id || null,
          campaign_name:  execution?.campaign_name || null,
          response_type:  responseType,
          response_text:  responseText,
          is_quick_reply: isQuickReply,
          msg_type:       msg.type,
          raw_payload:    JSON.stringify(msg),
          responded_at:   timestamp,
        };
        db.order_responses.push(responseRecord);

        // ── Update order status ────────────────────────────────────────────────
        if (order) {
          if (responseType === 'confirmed' && order.status === 'pending') {
            order.status       = 'confirmed';
            order.confirmed_at = timestamp;
            console.log(`[WhatsApp Webhook] ✓ Order ${order.order_number} CONFIRMED by ${phone}`);
          } else if (responseType === 'cancelled' && order.status !== 'cancelled') {
            order.status        = 'cancelled';
            order.cancelled_at  = timestamp;
            console.log(`[WhatsApp Webhook] ✗ Order ${order.order_number} CANCELLED by ${phone}`);
          }
        }

        // ── Mark execution as responded ────────────────────────────────────────
        if (execution) {
          execution.user_replied    = true;
          execution.reply_text      = responseText;
          execution.reply_type      = responseType;
          execution.reply_is_qr     = isQuickReply;
          execution.replied_at      = timestamp;
        }

        // ── Opt-out ────────────────────────────────────────────────────────────
        if (['stop', 'unsubscribe'].some(p => textLower.includes(p))) {
          if (visitor) { visitor.is_opted_out = true; }
        }
        // ── Opt-in ─────────────────────────────────────────────────────────────
        if (textLower === 'start') {
          if (visitor) { visitor.is_opted_out = false; }
        }
      }

      db.save();
    } catch (err) {
      console.error('[WhatsApp Webhook] Error:', err.message);
    }
  },

  // ── 3. Get order responses for a campaign — flat list + per-user grouped ─────
  async getOrderResponses(req, res) {
    try {
      const db        = getDb();
      const channelId = req.headers['x-channel-id'] || 'demo';
      const { campaignId } = req.params;

      const allResponses = (db.order_responses || [])
        .filter(r => r.channel_id === channelId &&
          (campaignId === 'all' || String(r.campaign_id) === String(campaignId))
        )
        .sort((a, b) => new Date(b.responded_at) - new Date(a.responded_at));

      // ── Summary ───────────────────────────────────────────────────────────────
      const summary = {
        total:     allResponses.length,
        confirmed: allResponses.filter(r => r.response_type === 'confirmed').length,
        cancelled: allResponses.filter(r => r.response_type === 'cancelled').length,
        custom:    allResponses.filter(r => r.response_type === 'custom').length,
        quick_replies: allResponses.filter(r => r.is_quick_reply).length,
        custom_texts:  allResponses.filter(r => !r.is_quick_reply && r.msg_type === 'text').length,
      };

      // ── Per-user grouped ──────────────────────────────────────────────────────
      const byPhone = {};
      for (const r of allResponses) {
        if (!byPhone[r.phone]) {
          byPhone[r.phone] = {
            phone:        r.phone,
            name:         r.name || 'Unknown',
            order_number: r.order_number,
            order_id:     r.order_id,
            latest_type:  r.response_type,    // most recent response type
            latest_text:  r.response_text,
            latest_at:    r.responded_at,
            reply_count:  0,
            replies:      [],
          };
        }
        byPhone[r.phone].reply_count++;
        byPhone[r.phone].replies.push({
          id:            r.id,
          response_type: r.response_type,
          response_text: r.response_text,
          is_quick_reply: r.is_quick_reply,
          msg_type:      r.msg_type,
          responded_at:  r.responded_at,
          raw_payload:   r.raw_payload,        // full Meta payload for that message
        });
      }

      const perUser = Object.values(byPhone)
        .sort((a, b) => new Date(b.latest_at) - new Date(a.latest_at));

      res.json({ responses: allResponses.slice(0, 100), per_user: perUser, summary });
    } catch (err) { res.status(500).json({ error: err.message }); }
  },

  // ── 4. Get pending COD orders (audience for order_confirmation campaign) ──────
  async getPendingOrders(req, res) {
    try {
      const db        = getDb();
      const channelId = req.headers['x-channel-id'] || 'demo';

      const orders = (db.orders || [])
        .filter(o => o.channel_id === channelId && o.is_cod && o.phone)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      res.json({ orders, total: orders.length });
    } catch (err) { res.status(500).json({ error: err.message }); }
  },
};
