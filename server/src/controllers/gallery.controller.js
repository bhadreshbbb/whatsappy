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
    const channelId = req.headers['x-channel-id'] || '';
    const { id } = req.params;

    // When served via public route as <img src>, channelId header is not sent.
    // Look up by id alone in that case — UUID is unguessable so security is maintained.
    const img = channelId
      ? (db.gallery_images || []).find(i => i.id === id && i.channel_id === channelId)
      : (db.gallery_images || []).find(i => i.id === id);
    if (!img) return res.status(404).json({ error: 'Image not found' });

    // ── Helper: proxy the original source URL as fallback ─────────────────────
    async function serveFromSourceUrl() {
      const srcUrl = img.source_url;
      if (!srcUrl || !srcUrl.startsWith('http')) {
        return res.status(502).json({ error: 'No source URL available for fallback' });
      }
      const srcRes = await fetch(srcUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'image/*' },
        signal: AbortSignal.timeout(10000),
      });
      if (!srcRes.ok) return res.status(502).json({ error: 'Could not fetch image from source URL' });
      res.setHeader('Content-Type', srcRes.headers.get('content-type') || img.mime_type || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      const buf = await srcRes.arrayBuffer();
      return res.send(Buffer.from(buf));
    }

    // ── Try Meta Graph API first (most up-to-date) ────────────────────────────
    const creds = getCredentials(channelId);
    if (creds && img.media_id) {
      try {
        // Step 1: Get the download URL from Meta
        const metaRes = await fetch(
          `https://graph.facebook.com/v25.0/${img.media_id}`,
          { headers: { Authorization: `Bearer ${creds.token}` }, signal: AbortSignal.timeout(8000) }
        );
        const metaData = await metaRes.json();
        if (metaRes.ok && metaData.url) {
          // Step 2: Download the actual image from Meta's CDN
          const imgRes = await fetch(metaData.url, {
            headers: { Authorization: `Bearer ${creds.token}` },
            signal: AbortSignal.timeout(10000),
          });
          if (imgRes.ok) {
            res.setHeader('Content-Type', img.mime_type || 'image/jpeg');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            const arrayBuffer = await imgRes.arrayBuffer();
            return res.send(Buffer.from(arrayBuffer));
          }
        }
        // Meta fetch failed — fall through to source_url
        console.warn(`[Gallery] Meta preview failed for ${id}, trying source_url`);
      } catch (metaErr) {
        console.warn(`[Gallery] Meta preview error for ${id}: ${metaErr.message}, trying source_url`);
      }
    }

    // ── Fallback: serve directly from the original product image URL ──────────
    return serveFromSourceUrl();
  } catch (err) {
    console.error('[Gallery] Preview error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

// ── Folders ────────────────────────────────────────────────────────────────

export function getFolders(req, res) {
  const db = getDb();
  const channelId = req.headers['x-channel-id'] || '';
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
  const channelId = req.headers['x-channel-id'] || '';
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
  const channelId = req.headers['x-channel-id'] || '';
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
  const channelId = req.headers['x-channel-id'] || '';
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
    const channelId = req.headers['x-channel-id'] || '';
    const { folderId } = req.params;

    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const folder = (db.gallery_folders || []).find(f => f.id === folderId && f.channel_id === channelId);
    if (!folder) return res.status(404).json({ error: 'Folder not found' });

    const { originalname, mimetype, buffer, size } = req.file;

    // Try resumable upload (returns file_handle "4:abcXYZ..." for template header_handle)
    // Falls back to regular media upload if App ID not configured
    let fileHandle = null;
    let mediaId = null;
    try {
      fileHandle = await whatsappService.uploadMediaResumable(buffer, originalname, mimetype, channelId);
      console.log(`[Gallery] Resumable upload → file_handle: ${fileHandle}`);
    } catch (resumableErr) {
      console.warn(`[Gallery] Resumable upload failed (${resumableErr.message}), falling back to /media upload`);
      mediaId = await whatsappService.uploadMedia(buffer, originalname, mimetype, channelId);
      console.log(`[Gallery] /media upload → media_id: ${mediaId}`);
    }

    const image = {
      id: uuidv4(),
      folder_id: folderId,
      channel_id: channelId,
      filename: originalname,
      mime_type: mimetype,
      size,
      file_handle: fileHandle,   // preferred — used in template header_handle
      media_id: mediaId,         // fallback / used for previewImage
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
  const channelId = req.headers['x-channel-id'] || '';
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
    const channelId = req.headers['x-channel-id'] || '';
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

    // Try resumable upload (returns file_handle for template header_handle)
    let fileHandle = null;
    let mediaId = null;
    try {
      fileHandle = await whatsappService.uploadMediaResumable(buffer, filename, mimeType, channelId);
      console.log(`[Gallery] Import resumable upload → file_handle: ${fileHandle}`);
    } catch (resumableErr) {
      console.warn(`[Gallery] Resumable upload failed (${resumableErr.message}), falling back to /media upload`);
      mediaId = await whatsappService.uploadMedia(buffer, filename, mimeType, channelId);
      console.log(`[Gallery] Import /media upload → media_id: ${mediaId}`);
    }

    if (!db.gallery_images) db.gallery_images = [];
    const image = {
      id: uuidv4(),
      folder_id: folderId,
      channel_id: channelId,
      filename,
      mime_type: mimeType,
      size: buffer.length,
      file_handle: fileHandle,   // preferred for template header_handle
      media_id: mediaId,         // fallback
      source_url: image_url,
      created_at: new Date().toISOString(),
    };

    db.gallery_images.push(image);
    db.save();

    console.log(`[Gallery] Imported from ${imageUrl} → handle: ${fileHandle || mediaId}`);
    res.json({ image });
  } catch (err) {
    console.error('[Gallery] Import URL error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
