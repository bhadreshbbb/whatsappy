import { getDb } from '../services/database.js';
import { v4 as uuidv4 } from 'uuid';

function getCredentials() {
  const token   = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (token && phoneId) return { token, phoneId };
  try {
    const db = getDb();
    const row = db.channel_settings[0];
    const s = JSON.parse(row?.settings || '{}');
    if (s?.whatsapp_token && s?.whatsapp_phone_id) {
      return { token: s.whatsapp_token, phoneId: s.whatsapp_phone_id };
    }
  } catch (_) {}
  return null;
}

async function uploadToMeta(buffer, filename, mimeType) {
  const creds = getCredentials();
  if (!creds) throw new Error('WhatsApp credentials not configured. Add token and Phone ID in Settings.');

  // Use native FormData + Blob (Node.js 18+ built-in, works with native fetch)
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mimeType);
  form.append('file', new Blob([buffer], { type: mimeType }), filename);

  const res = await fetch(
    `https://graph.facebook.com/v25.0/${creds.phoneId}/media`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${creds.token}` },
      body: form,
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`Meta API error: ${JSON.stringify(data?.error || data)}`);
  return data.id;
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

    // Upload to Meta and get media ID
    const mediaId = await uploadToMeta(buffer, originalname, mimetype);

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
