import { getDb } from '../services/database.js';
import { v4 as uuidv4 } from 'uuid';
import { whatsappService } from '../services/whatsapp.service.js';

// ── Get credentials (token, phoneId) from env or channel settings ──────────
function getCredentials(channelId) {
  const token  = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (token && phoneId) return { token, phoneId };
  try {
    const db = getDb();
    const row = db.channel_settings.find(s => s.channel_id === (channelId || 'demo')) || db.channel_settings[0];
    const s = JSON.parse(row?.settings || '{}');
    if (s?.whatsapp_token && s?.whatsapp_phone_id) return { token: s.whatsapp_token, phoneId: s.whatsapp_phone_id };
  } catch (_) {}
  return null;
}

// ── Image Preview — fetches from Meta using media_id ──────────────────────

export async function previewImage(req, res) {
  try {
    const db = getDb();
    const channelId = req.headers['x-channel-id'] || 'demo';
    const { id } = req.params;

    const img = (db.gallery_images || []).find(i => i.id === id && i.channel_id === channelId);
    if (!img) return res.status(404).json({ error: 'Image not found' });

    const creds = getCredentials(channelId);
    if (!creds) return res.status(400).json({ error: 'WhatsApp credentials not configured' });

    // Step 1: Get the download URL from Meta
    const metaRes = await fetch(
      `https://graph.facebook.com/v25.0/${img.media_id}`,
      { headers: { Authorization: `Bearer ${creds.token}` } }
    );
    const metaData = await metaRes.json();
    if (!metaRes.ok || !metaData.url) {
      return res.status(502).json({ error: 'Could not get image URL from Meta' });
    }

    // Step 2: Download the actual image from Meta's CDN
    const imgRes = await fetch(metaData.url, {
      headers: { Authorization: `Bearer ${creds.token}` }
    });
    if (!imgRes.ok) return res.status(502).json({ error: 'Could not download image from Meta' });

    // Step 3: Stream it back to the browser
    res.setHeader('Content-Type', img.mime_type || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // cache 1 day
    const arrayBuffer = await imgRes.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error('[Gallery] Preview error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

// ── Folders ────────────────────────────────────────────────────────────────

export function getFolders(req, res) {
  const db = getDb();
  const channelId = req.headers['x-channel-id'] || 'demo';
  const folders = (db.gallery_folders || [])
    .filter(f => f.channel_id === channelId)
    .map(f => ({
      ...f,
      imageCount: (db.gallery_images || []).filter(img => img.folder_id === f.id).length,
    }))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json({ folders });
}

export function createFolder(req, res) {
  const db = getDb();
  const channelId = req.headers['x-channel-id'] || 'demo';
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Folder name is required' });

  const exists = (db.gallery_folders || []).find(
    f => f.channel_id === channelId && f.name.toLowerCase() === name.trim().toLowerCase()
  );
  if (exists) return res.status(400).json({ error: 'Folder with this name already exists' });

  const folder = {
    id: uuidv4(),
    channel_id: channelId,
    name: name.trim(),
    created_at: new Date().toISOString(),
  };
  db.gallery_folders.push(folder);
  db.save();
  res.json({ folder });
}

export function deleteFolder(req, res) {
  const db = getDb();
  const channelId = req.headers['x-channel-id'] || 'demo';
  const { id } = req.params;

  const idx = (db.gallery_folders || []).findIndex(f => f.id === id && f.channel_id === channelId);
  if (idx === -1) return res.status(404).json({ error: 'Folder not found' });

  // Remove all images in folder
  db.gallery_images = (db.gallery_images || []).filter(img => img.folder_id !== id);
  db.gallery_folders.splice(idx, 1);
  db.save();
  res.json({ success: true });
}

// ── Images ─────────────────────────────────────────────────────────────────

export function getImages(req, res) {
  const db = getDb();
  const channelId = req.headers['x-channel-id'] || 'demo';
  const { folderId } = req.params;

  const folder = (db.gallery_folders || []).find(f => f.id === folderId && f.channel_id === channelId);
  if (!folder) return res.status(404).json({ error: 'Folder not found' });

  const images = (db.gallery_images || [])
    .filter(img => img.folder_id === folderId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json({ images });
}

export async function uploadImage(req, res) {
  try {
    const db = getDb();
    const channelId = req.headers['x-channel-id'] || 'demo';
    const { folderId } = req.params;

    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const folder = (db.gallery_folders || []).find(f => f.id === folderId && f.channel_id === channelId);
    if (!folder) return res.status(404).json({ error: 'Folder not found' });

    const { originalname, mimetype, buffer, size } = req.file;

    // Upload to Meta and get media ID using shared service
    const mediaId = await whatsappService.uploadMedia(buffer, originalname, mimetype);

    const image = {
      id: uuidv4(),
      folder_id: folderId,
      channel_id: channelId,
      filename: originalname,
      mime_type: mimetype,
      size,
      media_id: mediaId,
      created_at: new Date().toISOString(),
    };

    db.gallery_images.push(image);
    db.save();
    res.json({ image });
  } catch (err) {
    console.error('[Gallery] Upload error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export function deleteImage(req, res) {
  const db = getDb();
  const channelId = req.headers['x-channel-id'] || 'demo';
  const { id } = req.params;

  const idx = (db.gallery_images || []).findIndex(img => img.id === id && img.channel_id === channelId);
  if (idx === -1) return res.status(404).json({ error: 'Image not found' });

  db.gallery_images.splice(idx, 1);
  db.save();
  res.json({ success: true });
}

// ── Proxy external image — serve through our server to avoid CORS/hotlink ──
export async function proxyImage(req, res) {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'url param required' });

    let imageUrl = url;
    // Handle protocol-relative URLs
    if (imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;
    if (!imageUrl.startsWith('http')) return res.status(400).json({ error: 'Invalid URL' });

    const imgRes = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TRK-Bot/1.0)',
        'Accept': 'image/*,*/*',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!imgRes.ok) return res.status(502).json({ error: `Remote returned ${imgRes.status}` });

    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    res.send(buffer);
  } catch (err) {
    console.error('[Gallery] Proxy error:', err.message);
    res.status(502).json({ error: err.message });
  }
}

// ── Import image from external URL — downloads + uploads to Meta + gallery ──
export async function importImageFromUrl(req, res) {
  try {
    const db = getDb();
    const channelId = req.headers['x-channel-id'] || 'demo';
    const { image_url, folder_id } = req.body;

    if (!image_url) return res.status(400).json({ error: 'image_url is required' });

    let imageUrl = image_url;
    if (imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;
    if (!imageUrl.startsWith('http')) return res.status(400).json({ error: 'Invalid image URL' });

    // Ensure "Auto-Captured" folder exists
    let folderId = folder_id;
    if (!folderId) {
      if (!db.gallery_folders) db.gallery_folders = [];
      let autoFolder = db.gallery_folders.find(f => f.channel_id === channelId && f.name === 'Auto-Captured');
      if (!autoFolder) {
        autoFolder = { id: uuidv4(), channel_id: channelId, name: 'Auto-Captured', created_at: new Date().toISOString() };
        db.gallery_folders.push(autoFolder);
      }
      folderId = autoFolder.id;
    }

    // Download image server-side (bypasses browser CORS/hotlink restrictions)
    const { buffer, mimeType } = await whatsappService.downloadImage(imageUrl);

    // Derive a filename from the URL
    let filename = 'product.jpg';
    try {
      const p = new URL(imageUrl).pathname.split('/').filter(Boolean).pop() || 'product.jpg';
      filename = p.split('?')[0] || 'product.jpg';
    } catch (_) {}

    // Upload to Meta media endpoint to obtain a media_id for template header_handle
    const mediaId = await whatsappService.uploadMedia(buffer, filename, mimeType);

    if (!db.gallery_images) db.gallery_images = [];
    const image = {
      id: uuidv4(),
      folder_id: folderId,
      channel_id: channelId,
      filename,
      mime_type: mimeType,
      size: buffer.length,
      media_id: mediaId,
      source_url: image_url,
      created_at: new Date().toISOString(),
    };

    db.gallery_images.push(image);
    db.save();

    console.log(`[Gallery] Imported image from ${imageUrl} → media_id: ${mediaId}`);
    res.json({ image });
  } catch (err) {
    console.error('[Gallery] Import URL error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
