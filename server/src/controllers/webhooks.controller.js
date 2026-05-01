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

// ── COD detection — covers Shopify + custom payment gateways ─────────────────
// financial_status 'pending' alone is NOT reliable (UPI/bank also start pending)
// Primary: gateway name matching. Secondary: explicit is_cod flag.
const COD_GATEWAY_KEYWORDS = [
  'cash on delivery', 'cod', 'pay on delivery', 'pay at door',
  'cash', 'manual', 'offline payment', 'collect on delivery',
];
function isCOD(gateway = '', financialStatus = '', explicitCodFlag = null) {
  if (explicitCodFlag === true)  return true;
  if (explicitCodFlag === false) return false;
  const g = (gateway || '').toLowerCase().trim();
  if (!g || g === '') return false; // empty gateway = online payment gateway
  return COD_GATEWAY_KEYWORDS.some(k => g.includes(k));
}

// ── Build productConfig for buildSendMessagePayload ───────────────────────────
function buildOrderProductConfig(order, visitorName) {
  const customerName = order.name || visitorName || 'Customer';
  const orderId      = order.order_number || String(order.id);
  return {
    cards: [{
      name:             customerName,
      customer_name:    customerName,
      order_id:         orderId,
      order_number:     orderId,
      order_products:   order.products_summary || '',
      products_summary: order.products_summary || '',
      order_total:      String(order.total_amount || 0),
      total_amount:     order.total_amount || 0,
      payment_method:   order.payment_method || 'Cash on Delivery',
      delivery_date:    '3–5 business days',
      image:            order.product_image || '',
      image_url:        order.product_image || '',
      // Fallback for URL button suffix (e.g. https://store.com/orders/{{1}})
      link:             orderId,
      url:              orderId,
    }],
  };
}

// ── Fire order confirmation WhatsApp immediately ──────────────────────────────
async function sendOrderConfirmationNow(db, order) {
  try {
    // Find an active order_confirmation campaign for this channel
    const cam = (db.abandoned_cart_campaigns || []).find(c =>
      c.channel_id === order.channel_id &&
      c.campaign_type === 'order_confirmation' &&
      c.is_active &&
      c.meta_template_id
    );
    if (!cam) {
      console.log('[OrderConfirmation] No active order_confirmation campaign — will send on next automation run');
      return;
    }

    const metaTpl = (db.meta_templates || []).find(t =>
      String(t.id) === String(cam.meta_template_id) &&
      (t.meta_status === 'APPROVED' || t.meta_status === 'ACTIVE')
    );
    if (!metaTpl) {
      console.warn('[OrderConfirmation] Meta template not APPROVED yet — will retry on automation run');
      return;
    }

    // Dedup
    const alreadySent = (db.abandoned_cart_executions || []).find(e =>
      e.campaign_id === cam.id && e.phone === order.phone && e.order_id === order.id
    );
    if (alreadySent) return;

    const visitor = (db.website_visitors || []).find(v =>
      v.channel_id === order.channel_id && v.phone === order.phone
    );
    if (visitor?.is_opted_out) return;

    const { buildSendMessagePayload } = await import('./meta-templates.controller.js');
    // Always use the template's own language — not the campaign's target_language.
    // Meta error #132001 occurs when you send a language code the template wasn't submitted in.
    const productConfig = buildOrderProductConfig(order, visitor?.name);
    const msgPayload = buildSendMessagePayload(metaTpl, productConfig, order.phone, metaTpl.language);

    const { whatsappService } = await import('../services/whatsapp.service.js');
    const result = await whatsappService.sendTemplateMessage(order.phone, msgPayload);

    const execRecord = {
      id:            (db.abandoned_cart_executions.length || 0) + 1,
      campaign_id:   cam.id,
      campaign_name: cam.name,
      campaign_type: 'order_confirmation',
      channel_id:    order.channel_id,
      phone:         order.phone,
      name:          order.name || visitor?.name || '',
      order_id:      order.id,
      order_number:  order.order_number,
      template_name: metaTpl.name,
      status:        result?.messageId ? 'sent' : 'failed',
      wamid:         result?.messageId || null,
      error:         result?.error     || null,
      payload_sent:  JSON.stringify(msgPayload),
      stage:         1,
      sent_at:       new Date().toISOString(),
    };
    db.abandoned_cart_executions.push(execRecord);

    if (result?.messageId) {
      order.confirmation_sent    = true;
      order.confirmation_sent_at = new Date().toISOString();
      console.log(`[OrderConfirmation] ✓ Instant send — order ${order.order_number} → ${order.phone} wamid=${result.messageId}`);
    } else {
      console.error(`[OrderConfirmation] ✗ Instant send failed — ${order.order_number}: ${result?.error}`);
    }
  } catch (err) {
    console.error('[OrderConfirmation] Instant send error:', err.message);
  }
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

      // ── Extract fields from Shopify order payload ─────────────────────────────
      const shopifyOrderId = String(body.id || body.order_id || '');
      const orderNumber    = String(body.order_number || body.name || shopifyOrderId);

      // Phone: check multiple locations Shopify may put it
      const rawPhone = body.phone
        || body.customer?.phone
        || body.billing_address?.phone
        || body.shipping_address?.phone
        || '';
      const phone = normalizePhone(rawPhone);

      const gateway         = body.gateway || body.payment_gateway || '';
      const financialStatus = body.financial_status || '';
      const totalPrice      = parseFloat(body.total_price || body.subtotal_price || 0);
      const currency        = body.currency || 'INR';
      const lineItems       = body.line_items || [];

      const customerName = [
        body.customer?.first_name,
        body.customer?.last_name,
      ].filter(Boolean).join(' ').trim()
        || body.shipping_address?.name
        || body.billing_address?.name
        || 'Customer';

      const cancelled = !!body.cancelled_at;
      const confirmed = body.confirmed !== false && !cancelled;

      // ── COD detection ─────────────────────────────────────────────────────────
      // Use explicit is_cod flag if provided, else detect from gateway name
      const cod = isCOD(gateway, financialStatus, body.is_cod ?? null);

      console.log(`[Shopify Webhook] Order ${orderNumber} — gateway="${gateway}" financial="${financialStatus}" COD=${cod} phone=${phone} ₹${totalPrice}`);

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

      // ── Immediately fire WhatsApp confirmation for COD orders ─────────────────
      // Don't await — respond to Shopify immediately, send in background
      if (cod && phone) {
        setImmediate(() => {
          sendOrderConfirmationNow(db, order)
            .then(() => db.save())
            .catch(e => console.error('[OrderConfirmation] Background send error:', e.message));
        });
      }

      res.json({ success: true, order_id: order.id, order_number: orderNumber, is_cod: cod, phone });
    } catch (err) {
      console.error('[Shopify Webhook] Error:', err.message);
      res.status(500).json({ error: err.message });
    }
  },

  // ── Custom Website Order endpoint ─────────────────────────────────────────────
  // For non-Shopify websites: POST /api/webhooks/order
  // Body: { phone, name, order_number, products, total_amount, payment_method, is_cod }
  async customOrder(req, res) {
    try {
      const db        = getDb();
      const channelId = req.headers['x-channel-id'] || 'demo';
      const {
        phone: rawPhone, name, order_number, order_id,
        products, total_amount, currency = 'INR',
        payment_method = '', is_cod,
        product_image,
      } = req.body;

      const phone = normalizePhone(rawPhone);
      if (!phone) return res.status(400).json({ error: 'Phone number required' });

      // Detect COD
      const cod = isCOD(payment_method, '', is_cod ?? null);

      // Build products summary
      let lineItems = [];
      let productsSummary = '';
      if (Array.isArray(products)) {
        lineItems = products;
        productsSummary = products.map(p => `${p.title || p.name} × ${p.quantity || 1}`).join(', ');
      } else if (typeof products === 'string') {
        productsSummary = products;
      }

      if (!db.orders) db.orders = [];
      const orderId = String(order_id || order_number || (db.orders.length + 1));

      // Idempotency
      const existing = db.orders.find(o => o.channel_id === channelId && o.order_number === orderId);
      if (existing) return res.json({ success: true, duplicate: true });

      const order = {
        id:               (db.orders.length || 0) + 1,
        channel_id:       channelId,
        shopify_order_id: null,
        order_number:     orderId,
        phone,
        name:             name || 'Customer',
        gateway:          payment_method,
        is_cod:           cod,
        financial_status: cod ? 'pending' : 'paid',
        total_amount:     parseFloat(total_amount || 0),
        currency,
        products:         JSON.stringify(lineItems),
        products_summary: productsSummary,
        product_image:    product_image || null,
        payment_method:   cod ? 'Cash on Delivery' : (payment_method || 'Online Payment'),
        status:           'pending',
        confirmation_sent: false,
        confirmation_sent_at: null,
        created_at:       new Date().toISOString(),
        source:           'custom',
      };
      db.orders.push(order);

      // Update visitor + cart
      const vi = db.website_visitors.findIndex(v => v.channel_id === channelId && v.phone === phone);
      if (vi >= 0) {
        upgradeStatus(db.website_visitors[vi], 'purchased');
        db.website_visitors[vi].last_purchased_at = new Date().toISOString();
        db.website_visitors[vi].purchase_count = (db.website_visitors[vi].purchase_count || 0) + 1;
      }
      (db.cart_events || []).forEach(c => {
        if (c.channel_id === channelId && c.phone === phone && !c.recovered) {
          c.recovered = 1; c.recovered_at = new Date().toISOString();
        }
      });

      db.save();
      console.log(`[CustomOrder] Order ${orderId} — COD=${cod} phone=${phone}`);

      // Immediate WhatsApp send for COD
      if (cod && phone) {
        setImmediate(() => {
          sendOrderConfirmationNow(db, order)
            .then(() => db.save())
            .catch(e => console.error('[OrderConfirmation] Custom order send error:', e.message));
        });
      }

      res.json({ success: true, order_id: order.id, order_number: orderId, is_cod: cod });
    } catch (err) {
      console.error('[CustomOrder] Error:', err.message);
      res.status(500).json({ error: err.message });
    }
  },

  // ── 2. Meta WhatsApp incoming message webhook ─────────────────────────────────
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
      // Meta expects 200 within 20s — respond immediately, process async
      res.sendStatus(200);

      const db   = getDb();
      const body = req.body;

      // Meta webhook root structure:
      // { object: "whatsapp_business_account", entry: [{ id, changes: [{ value, field }] }] }
      if (body?.object !== 'whatsapp_business_account') return;

      for (const entry of (body.entry || [])) {
        for (const change of (entry.changes || [])) {
          if (change.field !== 'messages') continue;
          const value = change.value;
          if (!value) continue;

          // value.metadata.phone_number_id → match to our channel
          const phoneNumberId = value.metadata?.phone_number_id || '';
          // Find channel by phone_number_id stored in settings
          let channelId = 'demo';
          for (const row of (db.channel_settings || [])) {
            try {
              const s = JSON.parse(row.settings || '{}');
              if (s.whatsapp_phone_id && s.whatsapp_phone_id === phoneNumberId) {
                channelId = row.channel_id;
                break;
              }
            } catch (_) {}
          }

          // ── contacts[] → name map keyed by normalized phone ──────────────────
          // Meta: value.contacts = [{ wa_id: "919...", profile: { name: "Priya" } }]
          const contactsMap = {};
          for (const c of (value.contacts || [])) {
            if (c.wa_id) contactsMap[normalizePhone(c.wa_id)] = c.profile?.name || null;
          }

          // ── statuses[] — delivery/read/failed updates ───────────────────────
          // Meta: value.statuses = [{ id, status, timestamp, recipient_id, errors?, conversation?, pricing? }]
          for (const st of (value.statuses || [])) {
            const wamid       = st.id;                          // wamid we sent
            const status      = st.status;                      // sent|delivered|read|failed
            const recipientId = normalizePhone(st.recipient_id);
            const ts          = st.timestamp
              ? new Date(Number(st.timestamp) * 1000).toISOString()
              : new Date().toISOString();

            const exec = (db.abandoned_cart_executions || []).find(e => e.wamid === wamid);
            if (exec) {
              exec.delivery_status = status;
              if (status === 'delivered') exec.delivered_at = ts;
              if (status === 'read')      exec.read_at      = ts;
              if (status === 'failed') {
                // Meta: errors = [{ code, title, message, error_data: { details } }]
                const err = st.errors?.[0];
                exec.delivery_error = err
                  ? `${err.code}: ${err.title || err.message || 'Failed'}`
                  : 'Delivery failed';
                exec.failed_at = ts;
              }
            }
            console.log(`[WhatsApp Status] wamid=${wamid} status=${status} phone=${recipientId}`);
          }

          // ── messages[] — incoming user messages ─────────────────────────────
          // Meta: value.messages = [{ from, id, timestamp, type, text?, button?, interactive?, context? }]
          for (const msg of (value.messages || [])) {
            // msg.from = user's wa_id e.g. "919106862019" (no +, no spaces)
            const phone       = normalizePhone(msg.from);
            // msg.id = wamid of this incoming message
            const incomingId  = msg.id;
            // msg.timestamp = Unix epoch string e.g. "1714380000"
            const timestamp   = msg.timestamp
              ? new Date(Number(msg.timestamp) * 1000).toISOString()
              : new Date().toISOString();
            // msg.context.id = wamid of the message this user is REPLYING TO
            // msg.context.from = our phone number
            const contextId   = msg.context?.id   || null;
            const contextFrom = msg.context?.from  || null;
            const senderName  = contactsMap[phone] || null;

            // ── Extract text based on msg.type ─────────────────────────────────
            // Meta message types: text | button | interactive | image | audio |
            //   document | video | sticker | location | contacts | reaction | order | unknown
            let responseText = '';
            let buttonPayload = null;
            let isQuickReply  = false;

            switch (msg.type) {
              case 'text':
                // { text: { body: "user typed this" } }
                responseText = msg.text?.body || '';
                break;

              case 'button':
                // Template quick reply button tap
                // { button: { payload: "Yes, Confirmed", text: "Yes, Confirmed" } }
                // payload = what we set in template button config
                // text    = display label (same as payload for template quick replies)
                responseText  = msg.button?.text    || msg.button?.payload || '';
                buttonPayload = msg.button?.payload || null;
                isQuickReply  = true;
                break;

              case 'interactive':
                // Interactive message reply (non-template)
                // button_reply: { type: "button_reply", button_reply: { id: "btn_1", title: "Yes" } }
                // list_reply:   { type: "list_reply",   list_reply:   { id: "row_1", title: "Option" } }
                if (msg.interactive?.type === 'button_reply') {
                  responseText  = msg.interactive.button_reply?.title || '';
                  buttonPayload = msg.interactive.button_reply?.id    || null;
                } else if (msg.interactive?.type === 'list_reply') {
                  responseText  = msg.interactive.list_reply?.title || '';
                  buttonPayload = msg.interactive.list_reply?.id    || null;
                }
                isQuickReply = true;
                break;

              case 'reaction':
                // { reaction: { message_id: "wamid...", emoji: "👍" } }
                responseText = msg.reaction?.emoji || '[reaction]';
                break;

              case 'image':
              case 'video':
              case 'audio':
              case 'document':
              case 'sticker':
                responseText = `[${msg.type}]`;
                break;

              case 'location':
                responseText = '[location shared]';
                break;

              case 'order':
                // WhatsApp catalog order
                responseText = '[catalog order placed]';
                break;

              default:
                responseText = `[${msg.type || 'unknown'} message]`;
            }

            if (!phone) continue;

            // Dedup — Meta may deliver same webhook more than once
            if (incomingId && (db.order_responses || []).find(r => r.incoming_wamid === incomingId)) {
              console.log(`[WhatsApp Webhook] Duplicate wamid=${incomingId} — skipped`);
              continue;
            }

            console.log(`[WhatsApp Webhook] From ${phone}${senderName ? ` (${senderName})` : ''} type=${msg.type} text="${responseText}"${contextId ? ` replies_to=${contextId}` : ''}`);

            const textLower = responseText.toLowerCase().trim();

            // ── Classify intent ────────────────────────────────────────────────
            const CONFIRM_WORDS  = ['yes', 'confirmed', 'confirm', 'ha', 'haan', 'ok', 'okay', 'haa'];
            const CANCEL_WORDS   = ['cancel', 'no', 'nahi', 'nhi', 'mat', 'band', 'rokoo', 'ruko'];
            let responseType;
            if (CONFIRM_WORDS.some(w => textLower === w || textLower.startsWith(w + ' ') || textLower.endsWith(' ' + w)))
              responseType = 'confirmed';
            else if (CANCEL_WORDS.some(w => textLower === w || textLower.startsWith(w + ' ') || textLower.endsWith(' ' + w)))
              responseType = 'cancelled';
            else
              responseType = 'custom';

            // ── Find originating execution via context.id ──────────────────────
            // context.id = wamid of our outgoing template message
            let execution = null;
            if (contextId) {
              execution = (db.abandoned_cart_executions || []).find(e => e.wamid === contextId);
            }
            // Fallback: latest order_confirmation execution for this phone in this channel
            if (!execution) {
              execution = (db.abandoned_cart_executions || [])
                .filter(e => e.phone === phone && e.campaign_type === 'order_confirmation' && e.channel_id === channelId)
                .sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at))[0] || null;
            }

            // ── Find linked order ──────────────────────────────────────────────
            let order = null;
            if (execution?.order_id) {
              order = (db.orders || []).find(o => o.id === execution.order_id);
            }
            if (!order) {
              order = (db.orders || [])
                .filter(o => o.channel_id === channelId && o.phone === phone)
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;
            }

            // ── Visitor ────────────────────────────────────────────────────────
            const visitor     = (db.website_visitors || []).find(v => v.channel_id === channelId && v.phone === phone);
            const displayName = senderName || visitor?.name || order?.name || 'Unknown';

            // ── Store response ─────────────────────────────────────────────────
            if (!db.order_responses) db.order_responses = [];
            const responseRecord = {
              id:             (db.order_responses.length || 0) + 1,
              channel_id:     channelId,
              phone:          phone,              // msg.from (normalized)
              name:           displayName,        // contacts[].profile.name
              incoming_wamid: incomingId,         // msg.id (this message's wamid)
              context_wamid:  contextId,          // msg.context.id (replied-to wamid)
              context_from:   contextFrom,        // msg.context.from (our number)
              order_id:       order?.id       || null,
              order_number:   order?.order_number || null,
              campaign_id:    execution?.campaign_id   || null,
              campaign_name:  execution?.campaign_name || null,
              response_type:  responseType,       // confirmed | cancelled | custom
              response_text:  responseText,       // actual text user sent
              button_payload: buttonPayload,      // msg.button.payload (if quick reply)
              is_quick_reply: isQuickReply,       // true for button/interactive types
              msg_type:       msg.type,           // exact Meta type
              raw_payload:    JSON.stringify(msg),// full Meta message object
              responded_at:   timestamp,          // from msg.timestamp (Unix→ISO)
            };
            db.order_responses.push(responseRecord);

            // ── Update order status ────────────────────────────────────────────
            if (order) {
              if (responseType === 'confirmed' && order.status === 'pending') {
                order.status = 'confirmed';
                order.confirmed_at = timestamp;
                console.log(`[WhatsApp Webhook] ✓ Order ${order.order_number} CONFIRMED by ${phone}`);
              } else if (responseType === 'cancelled' && order.status !== 'cancelled') {
                order.status = 'cancelled';
                order.cancelled_at = timestamp;
                console.log(`[WhatsApp Webhook] ✗ Order ${order.order_number} CANCELLED by ${phone}`);
              }
            }

            // ── Mark execution as replied ──────────────────────────────────────
            if (execution) {
              execution.user_replied  = true;
              execution.reply_text    = responseText;
              execution.reply_type    = responseType;
              execution.reply_is_qr   = isQuickReply;
              execution.replied_at    = timestamp;
            }

            // ── Opt-out / Opt-in ───────────────────────────────────────────────
            if (['stop', 'unsubscribe'].some(w => textLower.includes(w))) {
              if (visitor) { visitor.is_opted_out = true; db.save(); }
              console.log(`[WhatsApp Webhook] ${phone} opted OUT`);
            } else if (textLower === 'start') {
              if (visitor) { visitor.is_opted_out = false; db.save(); }
              console.log(`[WhatsApp Webhook] ${phone} opted IN`);
            }
          }

          db.save();
        }
      }
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

  // ── 5. Test COD order — diagnostic endpoint, awaits send, returns full result ─
  async testCodOrder(req, res) {
    try {
      const db        = getDb();
      const channelId = req.headers['x-channel-id'] || 'demo';
      const { phone: rawPhone, name, order_number, products, total_amount, payment_method = 'Cash on Delivery' } = req.body;

      const phone = normalizePhone(rawPhone);
      if (!phone) return res.status(400).json({ error: 'Phone number required' });

      const PRODUCTS_LIST = ['Blue Anarkali Kurti × 1', 'Red Silk Saree × 1', 'Cotton Kurta Set × 2', 'Rayon Palazzo Set × 1'];
      const NAMES_LIST    = ['Priya Sharma', 'Rahul Verma', 'Anjali Singh', 'Karan Mehta'];
      const pick = arr => arr[Math.floor(Math.random() * arr.length)];

      const ordNum = order_number || ('TEST-' + Math.floor(100000 + Math.random() * 900000));

      // Diagnostic pre-checks
      const cam = (db.abandoned_cart_campaigns || []).find(c =>
        c.channel_id === channelId &&
        c.campaign_type === 'order_confirmation' &&
        c.is_active &&
        c.meta_template_id
      );
      if (!cam) {
        return res.json({ success: false, step: 'campaign', error: 'No active order_confirmation campaign found for this channel. Create one first and make sure it is active.' });
      }

      const metaTpl = (db.meta_templates || []).find(t =>
        String(t.id) === String(cam.meta_template_id) &&
        (t.meta_status === 'APPROVED' || t.meta_status === 'ACTIVE')
      );
      if (!metaTpl) {
        const tpl = (db.meta_templates || []).find(t => String(t.id) === String(cam.meta_template_id));
        return res.json({ success: false, step: 'template', error: `Template "${tpl?.name || cam.meta_template_id}" is not APPROVED yet. Current status: ${tpl?.meta_status || 'not found'}` });
      }

      if (!db.orders) db.orders = [];
      const existing = db.orders.find(o => o.channel_id === channelId && o.order_number === ordNum);
      if (existing) {
        return res.json({ success: false, step: 'dedup', error: `Order ${ordNum} already exists. A new random ID will be used next time.` });
      }

      const order = {
        id:               (db.orders.length || 0) + 1,
        channel_id:       channelId,
        order_number:     ordNum,
        phone,
        name:             name || pick(NAMES_LIST),
        gateway:          payment_method,
        is_cod:           true,
        financial_status: 'pending',
        total_amount:     parseFloat(total_amount || pick(['499','699','799','999','1199'])),
        currency:         'INR',
        products:         JSON.stringify([]),
        products_summary: (typeof products === 'string' ? products : null) || pick(PRODUCTS_LIST),
        product_image:    null,
        payment_method:   'Cash on Delivery',
        status:           'pending',
        confirmation_sent: false,
        created_at:       new Date().toISOString(),
        source:           'test',
      };
      db.orders.push(order);
      db.save();

      // Await the send — return full result to client
      const { buildSendMessagePayload } = await import('./meta-templates.controller.js');
      const productConfig = buildOrderProductConfig(order, order.name);
      const msgPayload    = buildSendMessagePayload(metaTpl, productConfig, order.phone, metaTpl.language);

      let wamid = null, sendError = null;
      try {
        const result = await whatsappService.sendTemplateMessage(order.phone, msgPayload);
        wamid = result?.messageId || result?.wamid || null;
        if (wamid) {
          order.confirmation_sent    = true;
          order.confirmation_sent_at = new Date().toISOString();
        }
      } catch (e) {
        sendError = e.message;
      }

      // Save execution record
      const execRecord = {
        id:            (db.abandoned_cart_executions.length || 0) + 1,
        campaign_id:   cam.id,
        campaign_name: cam.name,
        campaign_type: 'order_confirmation',
        channel_id:    channelId,
        phone,
        name:          order.name,
        order_id:      order.id,
        order_number:  ordNum,
        template_name: metaTpl.name,
        status:        wamid ? 'sent' : 'failed',
        wamid,
        error:         sendError,
        payload_sent:  JSON.stringify(msgPayload),
        stage:         1,
        sent_at:       new Date().toISOString(),
      };
      db.abandoned_cart_executions.push(execRecord);
      db.save();

      if (sendError) {
        return res.json({ success: false, step: 'meta_api', error: sendError, order_number: ordNum, phone, campaign: cam.name, template: metaTpl.name });
      }

      res.json({ success: true, wamid, order_number: ordNum, phone, campaign: cam.name, template: metaTpl.name, message: 'WhatsApp message sent successfully' });
    } catch (err) {
      console.error('[TestCodOrder] Error:', err.message);
      res.status(500).json({ error: err.message });
    }
  },

  // ── 6. Test Abandoned Product View — injects product_view + triggers send ─────
  async testProductView(req, res) {
    try {
      const db        = getDb();
      const channelId = req.headers['x-channel-id'] || 'demo';
      const { phone: rawPhone, product_name, product_url, product_image, product_price } = req.body;

      const phone = normalizePhone(rawPhone);
      if (!phone) return res.status(400).json({ error: 'Phone number required' });

      // Diagnostic: find active campaign
      const cam = (db.abandoned_cart_campaigns || []).find(c =>
        c.channel_id === channelId &&
        c.campaign_type === 'abandoned_product_view' &&
        c.is_active &&
        c.meta_template_id
      );
      if (!cam) return res.json({ success: false, step: 'campaign', error: 'No active abandoned_product_view campaign found. Create and activate one first.' });

      const metaTpl = (db.meta_templates || []).find(t =>
        String(t.id) === String(cam.meta_template_id) &&
        (t.meta_status === 'APPROVED' || t.meta_status === 'ACTIVE')
      );
      if (!metaTpl) {
        const tpl = (db.meta_templates || []).find(t => String(t.id) === String(cam.meta_template_id));
        return res.json({ success: false, step: 'template', error: `Template "${tpl?.name || cam.meta_template_id}" is not APPROVED yet. Status: ${tpl?.meta_status || 'not found'}` });
      }

      // Get product slug from channel settings
      const settingsRow = (db.channel_settings || []).find(s => s.channel_id === channelId);
      const channelSettings = settingsRow ? (() => { try { return JSON.parse(settingsRow.settings || '{}'); } catch(_) { return {}; } })() : {};
      const productSlug = channelSettings.product_url_slug || '/products';
      const shopUrl     = channelSettings.shop_url || 'https://yourstore.com';

      // Build product URL that satisfies the slug check in automation
      const finalProductUrl = product_url || `${shopUrl}${productSlug}/test-product`;
      const finalProductName  = product_name  || 'Test Product';
      const finalProductImage = product_image || '';
      const finalProductPrice = product_price || '999';

      // Ensure visitor exists with product_view status
      if (!db.website_visitors) db.website_visitors = [];
      let visitor = db.website_visitors.find(v => v.channel_id === channelId && v.phone === phone);
      const now = new Date().toISOString();
      if (!visitor) {
        visitor = {
          id:         (db.website_visitors.length || 0) + 1,
          channel_id: channelId,
          session_id: `test_${phone}_${Date.now()}`,
          phone,
          name:       'Test User',
          status:     'product_view',
          visited_at: now,
          created_at: now,
        };
        db.website_visitors.push(visitor);
      } else {
        visitor.status     = 'product_view';
        visitor.visited_at = new Date(Date.now() - 35 * 60 * 1000).toISOString(); // 35 min ago
        visitor.last_product_name  = finalProductName;
        visitor.last_product_image = finalProductImage;
        visitor.last_product_url   = finalProductUrl;
        visitor.last_product_price = finalProductPrice;
      }

      // Inject product_view record with created_at 35 minutes ago (bypasses 30-min wait)
      if (!db.product_views) db.product_views = [];
      const existingView = db.product_views.find(v =>
        v.channel_id === channelId && v.phone === phone && v.product_url === finalProductUrl
      );
      const viewRecord = {
        id:             existingView?.id || (db.product_views.length || 0) + 1,
        channel_id:     channelId,
        session_id:     visitor.session_id,
        phone,
        event_type:     'product_viewed',
        product_name:   finalProductName,
        product_image:  finalProductImage,
        product_url:    finalProductUrl,
        product_price:  finalProductPrice,
        product:        JSON.stringify({ name: finalProductName, image: finalProductImage, url: finalProductUrl, price: finalProductPrice }),
        whatsapp_sent:  0,
        followup_count: 0,
        // 35 minutes ago — bypasses the 30-min inactivity check in automation
        created_at:     new Date(Date.now() - 35 * 60 * 1000).toISOString(),
      };
      if (existingView) {
        Object.assign(existingView, viewRecord);
      } else {
        db.product_views.push(viewRecord);
      }
      db.save();

      // Build and send the WhatsApp message directly (same as automation would do)
      const { buildSendMessagePayload, LANG_MAP } = await import('./meta-templates.controller.js');

      // Build productConfig from the view record (mirrors automation logic)
      const productConfig = metaTpl.is_carousel
        ? metaTpl.product_config
        : {
            cards: [{
              name:          visitor.name || 'Customer',
              title:         finalProductName,
              price:         String(finalProductPrice),
              link:          finalProductUrl,
              url:           finalProductUrl,
              image:         finalProductImage,
              image_url:     finalProductImage,
              media_id:      metaTpl.header_image_id || '',
              product_name:  finalProductName,
              product_price: String(finalProductPrice),
              product_url:   finalProductUrl,
              product_image: finalProductImage,
            }],
          };

      const msgPayload = buildSendMessagePayload(metaTpl, productConfig, phone, metaTpl.language, cam.id);

      let wamid = null, sendError = null;
      try {
        const result = await whatsappService.sendTemplateMessage(phone, msgPayload);
        wamid = result?.messageId || result?.wamid || null;
      } catch (e) { sendError = e.message; }

      // Mark view as sent
      if (wamid) {
        viewRecord.whatsapp_sent    = 1;
        viewRecord.whatsapp_sent_at = new Date().toISOString();
        viewRecord.followup_count   = 1;
      }

      // Save execution record
      db.abandoned_cart_executions.push({
        id:            (db.abandoned_cart_executions.length || 0) + 1,
        campaign_id:   cam.id,
        campaign_name: cam.name,
        campaign_type: 'abandoned_product_view',
        channel_id:    channelId,
        phone,
        name:          visitor.name || 'Test User',
        template_name: metaTpl.name,
        status:        wamid ? 'sent' : 'failed',
        wamid,
        error:         sendError,
        stage:         1,
        sent_at:       new Date().toISOString(),
      });
      db.save();

      if (sendError) {
        return res.json({ success: false, step: 'meta_api', error: sendError, phone, campaign: cam.name, template: metaTpl.name, product: finalProductName, product_url: finalProductUrl });
      }

      res.json({ success: true, wamid, phone, campaign: cam.name, template: metaTpl.name, product: finalProductName, product_url: finalProductUrl, message: 'WhatsApp message sent successfully' });
    } catch (err) {
      console.error('[TestProductView] Error:', err.message);
      res.status(500).json({ error: err.message });
    }
  },
};
