/**
 * AI Controller
 * - POST /api/ai/generate-template  → Claude API writes WhatsApp template body
 * - GET  /api/ai/insights           → Smart insights from existing campaign data
 */
import { getDb } from '../services/database.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

// ── Call Claude API ────────────────────────────────────────────────────────────
async function callClaude(prompt, maxTokens = 600) {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set in server .env');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Claude API error ${res.status}`);
  return data.content?.[0]?.text || '';
}

// ── Smart Insights (no external API — computed from existing data) ─────────────
function computeInsights(db, channelId) {
  const now = Date.now();
  const DAY  = 86400000;
  const WEEK = 7 * DAY;

  // ── Revenue at risk — abandoned carts with phone numbers ────────────────────
  const activeCarts = (db.cart_events || []).filter(c =>
    c.channel_id === channelId && !c.recovered && c.phone && c.total_amount > 0
  );
  const revenueAtRisk = activeCarts.reduce((sum, c) => sum + (parseFloat(c.total_amount) || 0), 0);

  // ── High-intent buyers — product_view status, no cart, no purchase ──────────
  const purchasedPhones = new Set(
    (db.purchase_history || []).filter(p => p.channel_id === channelId).map(p => p.phone)
  );
  const cartPhones = new Set(
    (db.cart_events || []).filter(c => c.channel_id === channelId && !c.recovered).map(c => c.phone)
  );
  const highIntentVisitors = (db.website_visitors || []).filter(v =>
    v.channel_id === channelId &&
    v.phone &&
    v.status === 'product_view' &&
    !purchasedPhones.has(v.phone) &&
    !cartPhones.has(v.phone)
  );

  // ── Best send hour — hour with most successful executions ───────────────────
  const hourCounts = new Array(24).fill(0);
  (db.abandoned_cart_executions || [])
    .filter(e => e.channel_id === channelId && e.status === 'sent')
    .forEach(e => {
      if (e.sent_at) hourCounts[new Date(e.sent_at).getHours()]++;
    });
  const bestHour = hourCounts.indexOf(Math.max(...hourCounts));

  // ── Response rate ───────────────────────────────────────────────────────────
  const totalSent = (db.abandoned_cart_executions || []).filter(e =>
    e.channel_id === channelId && e.status === 'sent'
  ).length;
  const totalResponses = (db.order_responses || []).filter(r =>
    r.channel_id === channelId
  ).length;
  const responseRate = totalSent > 0 ? ((totalResponses / totalSent) * 100).toFixed(1) : '0.0';

  // ── Recovery this week ──────────────────────────────────────────────────────
  const weekStart = now - WEEK;
  const recoveredThisWeek = (db.cart_events || []).filter(c =>
    c.channel_id === channelId && c.recovered && c.recovered_at &&
    new Date(c.recovered_at).getTime() > weekStart
  );
  const revenueRecoveredWeek = recoveredThisWeek.reduce((sum, c) => sum + (parseFloat(c.total_amount) || 0), 0);

  // ── Orders confirmed ────────────────────────────────────────────────────────
  const confirmedOrders = (db.order_responses || []).filter(r =>
    r.channel_id === channelId && r.response_type === 'confirmed'
  ).length;

  // ── Campaign health scores ──────────────────────────────────────────────────
  const campaigns = (db.abandoned_cart_campaigns || []).filter(c =>
    c.channel_id === channelId && c.is_active
  ).map(cam => {
    const executions = (db.abandoned_cart_executions || []).filter(e => e.campaign_id === cam.id);
    const sent       = executions.filter(e => e.status === 'sent').length;
    const failed     = executions.filter(e => e.status === 'failed').length;
    const total      = sent + failed;
    const deliveryRate = total > 0 ? Math.round((sent / total) * 100) : null;
    return {
      id:           cam.id,
      name:         cam.name,
      type:         cam.campaign_type,
      total_sent:   cam.total_sent || sent,
      delivery_rate: deliveryRate,
      last_run_at:  cam.last_run_at || null,
    };
  });

  // ── Smart recommendations ───────────────────────────────────────────────────
  const recommendations = [];
  if (revenueAtRisk > 0)
    recommendations.push(`💰 ₹${Math.round(revenueAtRisk).toLocaleString('en-IN')} revenue at risk from ${activeCarts.length} abandoned carts — recovery campaign can win it back`);
  if (highIntentVisitors.length > 0)
    recommendations.push(`🎯 ${highIntentVisitors.length} high-intent shoppers viewed products but didn't buy — perfect audience for abandoned product view campaign`);
  if (bestHour >= 0 && hourCounts[bestHour] > 0)
    recommendations.push(`⏰ Your messages get best engagement at ${bestHour}:00–${bestHour + 1}:00 — schedule campaigns around this window`);
  if (confirmedOrders > 0)
    recommendations.push(`📦 ${confirmedOrders} customers confirmed their COD orders via WhatsApp quick reply`);
  if (recommendations.length === 0)
    recommendations.push('🚀 Start your first campaign to unlock AI-powered performance insights');

  return {
    revenue_at_risk:       Math.round(revenueAtRisk),
    high_intent_count:     highIntentVisitors.length,
    best_send_hour:        hourCounts[bestHour] > 0 ? bestHour : null,
    response_rate:         parseFloat(responseRate),
    revenue_recovered_week: Math.round(revenueRecoveredWeek),
    confirmed_orders:      confirmedOrders,
    active_campaigns:      campaigns.length,
    campaign_health:       campaigns,
    recommendations,
    total_sent_all_time:   totalSent,
  };
}

// ── Buyer Intent Score for a visitor ─────────────────────────────────────────
function buyerIntentScore(db, channelId, phone) {
  let score = 0;
  const views    = (db.product_views || []).filter(v => v.channel_id === channelId && v.phone === phone);
  const carts    = (db.cart_events   || []).filter(c => c.channel_id === channelId && c.phone === phone);
  const purchases = (db.purchase_history || []).filter(p => p.channel_id === channelId && p.phone === phone);
  const visitor  = (db.website_visitors || []).find(v => v.channel_id === channelId && v.phone === phone);

  // Signals
  score += Math.min(views.length * 15, 40);        // product views (max 40)
  score += Math.min(carts.length * 20, 35);         // cart events (max 35)
  if (purchases.length > 0) score += 25;            // past purchaser = very high intent
  if (visitor?.engagement_score > 60) score += 10; // high engagement
  if (visitor?.total_page_views > 5) score += 5;   // explored site

  return Math.min(Math.round(score), 100);
}

export const aiController = {

  // ── GET /api/ai/insights ────────────────────────────────────────────────────
  async getInsights(req, res) {
    try {
      const db        = getDb();
      const channelId = req.headers['x-channel-id'] || 'demo';
      const insights  = computeInsights(db, channelId);
      res.json({ success: true, ...insights });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // ── GET /api/ai/intent-score/:phone ────────────────────────────────────────
  async getIntentScore(req, res) {
    try {
      const db        = getDb();
      const channelId = req.headers['x-channel-id'] || 'demo';
      const phone     = req.params.phone;
      const score     = buyerIntentScore(db, channelId, phone);
      res.json({ phone, intent_score: score });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  // ── POST /api/ai/generate-template ─────────────────────────────────────────
  async generateTemplate(req, res) {
    try {
      const {
        campaign_type = 'abandoned_product_view',
        language      = 'English',
        tone          = 'friendly',
        product_type  = 'fashion clothing',
        product_name  = '',
        brand_name    = '',
      } = req.body;

      const toneDesc = {
        friendly:     'warm, conversational, uses emojis',
        urgent:       'creates urgency, limited-time feel, bold',
        professional: 'polished, clean, business-like, minimal emojis',
      }[tone] || 'warm and friendly';

      const campaignDesc = {
        abandoned_product_view: 'The user viewed a product but did not add it to cart or buy it. Remind them about the product.',
        abandoned_cart:         'The user added products to cart but did not complete checkout. Recover the sale.',
        order_confirmation:     'User placed a COD (Cash on Delivery) order. Confirm the order details and ask them to confirm.',
        product_recommendation: 'Recommend products to an existing customer based on their interests.',
      }[campaign_type] || 'Re-engage a potential customer.';

      const varList = {
        abandoned_product_view: '{{1}} = customer first name, {{2}} = product name + price (e.g. "Blue Kurti | ₹799")',
        abandoned_cart:         '{{1}} = customer first name, {{2}} = product name + price',
        order_confirmation:     '{{1}} = customer name, {{2}} = order ID, {{3}} = product list, {{4}} = total amount, {{5}} = payment method',
        product_recommendation: '{{1}} = customer first name, {{2}} = product name + price',
      }[campaign_type] || '{{1}} = customer name';

      const prompt = `You are an expert WhatsApp marketing copywriter for Indian e-commerce brands.

Write a WhatsApp Business template message with these specs:

Campaign type: ${campaign_type.replace(/_/g, ' ')}
Context: ${campaignDesc}
Language: ${language}
Tone: ${toneDesc}
Product type: ${product_type}${product_name ? `\nSpecific product: ${product_name}` : ''}${brand_name ? `\nBrand: ${brand_name}` : ''}

Rules:
- Use exactly these variables: ${varList}
- Keep body under 160 characters if possible (WhatsApp shows preview)
- Maximum body length: 1024 characters
- Use emojis naturally (${tone === 'professional' ? 'minimally' : 'freely'})
- No markdown, no asterisks for bold — plain text only
- Must end with a clear call to action
- If language is Hindi/Gujarati/Tamil/Telugu/Marathi, write in that script (not transliteration)

Return ONLY a JSON object (no explanation, no markdown code blocks):
{
  "body": "the template body text with {{1}} {{2}} etc",
  "header": "short header line (max 60 chars, optional, null if not needed)",
  "footer": "short footer like 'Reply STOP to opt out' or null",
  "button_text": "CTA button label (max 20 chars)",
  "quick_replies": ["Reply 1", "Reply 2"] or [],
  "explanation": "one sentence why this copy works"
}`;

      const raw = await callClaude(prompt, 700);

      // Parse JSON from response
      let parsed;
      try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
      } catch (_) {
        parsed = { body: raw, header: null, footer: null, button_text: 'Shop Now', quick_replies: [], explanation: '' };
      }

      res.json({ success: true, ...parsed, campaign_type, language, tone });
    } catch (err) {
      console.error('[AI] Template generate error:', err.message);
      res.status(500).json({ error: err.message });
    }
  },
};
