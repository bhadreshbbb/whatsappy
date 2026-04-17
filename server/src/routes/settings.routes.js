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
      const ei = db.product_catalog.findIndex(c => c.url === url);
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
    const channelId = req.headers['x-channel-id'] || 'demo';
    const settings = db.channel_settings.find(s => s.channel_id === channelId);
    res.json(settings ? JSON.parse(settings.settings || '{}') : {});
  } catch (error) {
    next(error);
  }
});

router.post('/', (req, res, next) => {
  try {
    const db = getDb();
    const channelId = req.headers['x-channel-id'] || 'demo';
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
router.post('/sync-catalog', async (req, res, next) => {
  try {
    const db = getDb();
    const channelId = req.headers['x-channel-id'] || 'demo';
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

router.post('/test-whatsapp', (req, res, next) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number required' });
    // Mock test — real integration would call Meta API here
    res.json({ success: true, message: `Test message sent to ${phone}` });
  } catch (error) {
    next(error);
  }
});

export { router as settingsRoutes };
