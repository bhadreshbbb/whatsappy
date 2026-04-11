import { Router } from 'express';
import { getDb } from '../services/database.js';
import { aiService } from '../services/ai.service.js';
import { whatsappService } from '../services/whatsapp.service.js';
import { upgradeStatus } from '../utils/statusMachine.js';

const router = Router();

// [FEATURE 2] AI Webhook to Process Incoming Customer Replies
router.post('/webhook', async (req, res, next) => {
  try {
    const db = getDb();
    // Example WhatsApp Meta webhook payload parsing
    const { from_number, message_text, channel_id } = req.body;
    
    if (!from_number || !message_text) {
      return res.status(400).json({ error: 'Missing phone number or message_text.'});
    }

    // 1. Locate User Context
    const visitor = db.website_visitors.find(v => v.phone === from_number && v.channel_id === (channel_id || 'demo'));
    let targetContext = visitor || { status: 'unknown' };

    // 2. Fetch their most recent abandoned cart or product for Deep Context
    const recentCart = db.cart_events
      .filter(c => c.phone === from_number)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

    if (recentCart) {
        targetContext = { ...targetContext, ...recentCart };
    }

    // ── INTENT INTERCEPTION ──
    const textLower = message_text.toLowerCase().trim();
    const optOutPhrases = ['stop', 'unsubscribe', 'no', 'cancel', "don't send", 'stop messages'];
    const buyPhrases = ['buy now', 'purchase', 'buy it', 'order'];
    const cartPhrases = ['add to cart', 'cart'];

    if (optOutPhrases.some(p => textLower.includes(p))) {
      if (visitor) {
        visitor.is_opted_out = true;
        db.save();
      }
      const reply = "We respect your privacy. You have been successfully opted out and will no longer receive automated messages from us. Type 'START' to resume.";
      await whatsappService.sendMessage(from_number, [{ type: 'body', text: reply }]);
      return res.json({ success: true, action: 'opted_out' });
    }

    if (visitor) {
      if (textLower === 'start') {
        visitor.is_opted_out = false;
        db.save();
        await whatsappService.sendMessage(from_number, [{ type: 'body', text: "Welcome back! You will now receive updates." }]);
        return res.json({ success: true, action: 'opted_in' });
      }

      let upgraded = false;
      if (buyPhrases.some(p => textLower.includes(p))) {
        upgraded = upgradeStatus(visitor, 'purchased');
      } else if (cartPhrases.some(p => textLower.includes(p))) {
        upgraded = upgradeStatus(visitor, 'abandoned_cart');
      }
      if (upgraded) db.save();
    }

    // 3. Let AI Brain Decide Reply
    const aiReply = await aiService.generateReply(message_text, targetContext);

    // 4. Send Reply via WhatsApp
    await whatsappService.sendMessage(from_number, [{ type: 'body', text: aiReply }]);

    res.json({ success: true, ai_reply: aiReply });
  } catch (err) {
    next(err);
  }
});

export { router as whatsappRoutes };
