import { Router } from 'express';
import { getDb } from '../services/database.js';

const router = Router();

// Seed product catalog from Shopify when shop_url is saved
async function triggerCatalogSeed(shopUrl, channelId) {
  if (!shopUrl) return;
  const base = shopUrl.replace(/\/$/, '');
  try {
    const r = await fetch(`${base}/products.json?limit=50`, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) { console.warn(`[Settings] Catalog seed: HTTP ${r.status} from ${base}`); return; }
    const data = await r.json();
    const products = data.products || [];
    const db = getDb();
    if (!db.product_catalog) db.product_catalog = [];
    const seededAt = new Date().toISOString();
    let added = 0, updated = 0;
    for (const p of products) {
      const url   = `${base}/products/${p.handle}`;
      const price = p.variants?.[0]?.price ? `₹${p.variants[0].price}` : '';
      const image = p.images?.[0]?.src || '';
      if (!p.title || !image) continue;
      const ei = db.product_catalog.findIndex(c => c.url === url && c.channel_id === channelId);
      const entry = { channel_id: channelId, name: p.title, url, price, image, handle: p.handle, _seeded_at: seededAt };
      if (ei >= 0) { db.product_catalog[ei] = { ...db.product_catalog[ei], ...entry }; updated++; }
      else { db.product_catalog.push(entry); added++; }
    }
    db.save();
    console.log(`[Settings] ✓ Catalog seeded from ${base}: +${added} new, ${updated} updated (${products.length} total from Shopify)`);
  } catch (e) {
    console.error(`[Settings] Catalog seed failed for ${base}:`, e.message);
  }
}

router.get('/', (req, res, next) => {
  try {
    const db = getDb();
    const channelId = req.headers['x-channel-id'] || '';
    const settings = db.channel_settings.find(s => s.channel_id === channelId);
    res.json(settings ? JSON.parse(settings.settings || '{}') : {});
  } catch (error) {
    next(error);
  }
});

router.post('/', (req, res, next) => {
  try {
    const db = getDb();
    const channelId = req.headers['x-channel-id'] || '';
    const newSettings = req.body;

    // Detect shop_url change to trigger live catalog seed
    const existing = db.channel_settings.find(s => s.channel_id === channelId);
    const oldSettings = existing ? JSON.parse(existing.settings || '{}') : {};
    const shopUrlChanged = newSettings.shop_url && newSettings.shop_url !== oldSettings.shop_url;

    const idx = db.channel_settings.findIndex(s => s.channel_id === channelId);
    if (idx >= 0) {
      db.channel_settings[idx].settings = JSON.stringify(newSettings);
    } else {
      db.channel_settings.push({ channel_id: channelId, settings: JSON.stringify(newSettings) });
    }
    db.save();

    // If shop_url was set or changed, seed catalog immediately (non-blocking)
    if (shopUrlChanged) {
      console.log(`[Settings] shop_url set to ${newSettings.shop_url} — seeding product catalog…`);
      triggerCatalogSeed(newSettings.shop_url, channelId).catch(e => console.error('[Settings] Seed error:', e.message));
    }

    res.json({ success: true, catalog_seed_triggered: shopUrlChanged });
  } catch (error) {
    next(error);
  }
});

// Manual re-seed endpoint — called from UI "Sync Products" button
// Test actual message send (POST /messages) — not just token verification
router.post('/test-send', async (req, res, next) => {
  try {
    const db = getDb();
    const channelId = req.headers['x-channel-id'] || '';
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'phone required' });

    // DB-only — find exact channel then fallback to any non-demo channel with credentials
    let token = null, phoneId = null;
    const rows = db.channel_settings || [];
    const findCreds = (row) => { try { const s = JSON.parse(row?.settings || '{}'); return s.whatsapp_token && s.whatsapp_phone_id ? s : null; } catch { return null; } };
    let cs = (channelId && channelId !== 'demo') ? findCreds(rows.find(r => r.channel_id === channelId)) : null;
    if (!cs) cs = rows.filter(r => r.channel_id !== 'demo').map(r => findCreds(r)).find(Boolean);
    if (cs) { token = cs.whatsapp_token; phoneId = cs.whatsapp_phone_id; }

    if (!token || !phoneId) return res.json({ success: false, error: 'Credentials not configured in Settings', channelId, token_set: !!token, phone_id_set: !!phoneId });

    const to = String(phone).replace(/\D/g, '');
    const body = { messaging_product: 'whatsapp', to: to.startsWith('91') ? to : `91${to}`, type: 'text', text: { body: 'WhatsWay test message ✓' } };
    const url = `https://graph.facebook.com/v25.0/${phoneId}/messages`;
    const metaRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const data = await metaRes.json();
    res.json({
      success: metaRes.ok,
      status: metaRes.status,
      response: data,
      channelId,
      phoneId,
      token_prefix: token.substring(0, 15) + '...',
    });
  } catch (error) { next(error); }
});

// DELETE /api/settings/channel/:channelId
// Removes stale channel credentials and re-assigns its campaigns to the caller's real channel.
router.delete('/channel/:channelId', (req, res, next) => {
  try {
    const db = getDb();
    const targetId = req.params.channelId;
    const realId   = req.headers['x-channel-id'] || '';

    if (!targetId || targetId === 'demo') return res.status(400).json({ error: 'Invalid channelId' });
    if (targetId === realId) return res.status(400).json({ error: 'Cannot delete your own active channel' });

    // 1. Remove channel_settings entry
    const settingsIdx = db.channel_settings.findIndex(s => s.channel_id === targetId);
    const removedSettings = settingsIdx >= 0;
    if (removedSettings) db.channel_settings.splice(settingsIdx, 1);

    // 2. Re-assign campaigns that belonged to the stale channel → caller's real channel
    const CAMPAIGN_TABLES = ['abandoned_cart_campaigns'];
    const migrated = {};
    for (const table of CAMPAIGN_TABLES) {
      if (!Array.isArray(db[table])) continue;
      let n = 0;
      for (const doc of db[table]) {
        if (doc.channel_id === targetId) { doc.channel_id = realId; n++; }
      }
      if (n > 0) migrated[table] = n;
    }

    db.save();
    console.log(`[Settings] Deleted channel ${targetId}, migrated to ${realId}:`, migrated);
    res.json({ success: true, deleted_channel: targetId, settings_removed: removedSettings, campaigns_migrated: migrated });
  } catch (e) {
    next(e);
  }
});

router.post('/sync-catalog', async (req, res, next) => {
  try {
    const db = getDb();
    const channelId = req.headers['x-channel-id'] || '';
    const row = db.channel_settings.find(s => s.channel_id === channelId);
    const s = JSON.parse(row?.settings || '{}');
    const shopUrl = s.shop_url || process.env.SHOP_URL;
    if (!shopUrl) return res.status(400).json({ error: 'shop_url not configured in Settings' });
    await triggerCatalogSeed(shopUrl, channelId);
    const count = (db.product_catalog || []).filter(p => p.channel_id === channelId).length;
    res.json({ success: true, products_in_catalog: count });
  } catch (error) {
    next(error);
  }
});

router.post('/test-whatsapp', async (req, res, next) => {
  try {
    const db = getDb();
    const channelId = req.headers['x-channel-id'] || '';
    const row = db.channel_settings.find(s => s.channel_id === channelId);
    const s = JSON.parse(row?.settings || '{}');

    // DB-only — find exact channel then fallback to any non-demo channel with credentials
    let token = null, phoneId = null;
    const rows2 = db.channel_settings || [];
    const findCreds2 = (row) => { try { const s2 = JSON.parse(row?.settings || '{}'); return s2.whatsapp_token && s2.whatsapp_phone_id ? s2 : null; } catch { return null; } };
    let cs2 = (channelId && channelId !== 'demo') ? findCreds2(rows2.find(r => r.channel_id === channelId)) : null;
    if (!cs2) cs2 = rows2.filter(r => r.channel_id !== 'demo').map(r => findCreds2(r)).find(Boolean);
    if (cs2) { token = cs2.whatsapp_token; phoneId = cs2.whatsapp_phone_id; }

    if (!token || !phoneId) {
      return res.json({ success: false, error: 'WhatsApp token or Phone ID not configured in Settings' });
    }

    // Verify credentials by fetching phone number info from Meta
    const url = `https://graph.facebook.com/v25.0/${phoneId}?fields=verified_name,display_phone_number,quality_rating,status`;
    const metaRes = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    const data = await metaRes.json();

    if (!metaRes.ok) {
      return res.json({
        success: false,
        error: `Meta API error ${metaRes.status}: ${JSON.stringify(data?.error || data)}`,
        hint: data?.error?.code === 190
          ? 'Token is expired or invalid. Regenerate it from Meta Business Manager → System Users.'
          : data?.error?.code === 100
          ? 'Phone Number ID is wrong. Use the numeric ID from Meta Developer Console, not the display number.'
          : null,
        phone_id_used: phoneId,
        token_prefix: token.substring(0, 12) + '...',
      });
    }

    res.json({
      success: true,
      verified_name: data.verified_name,
      display_phone_number: data.display_phone_number,
      quality_rating: data.quality_rating,
      status: data.status,
      phone_id_used: phoneId,
      token_prefix: token.substring(0, 12) + '...',
    });
  } catch (error) {
    next(error);
  }
});

export { router as settingsRoutes };
