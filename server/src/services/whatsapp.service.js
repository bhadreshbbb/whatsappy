/**
 * WhatsApp Cloud API Service
 * Calls Meta Graph API using credentials stored in Settings page (DB only).
 * Falls back to simulation log when not configured.
 * All credentials come from DB — no env var fallback for WhatsApp.
 */

import { getDb } from './database.js';

// channelId is optional — when provided, reads that channel's settings instead of [0]
function getCredentials(channelId = null) {
  // ALL credentials come from Settings page (DB only). No env vars for WhatsApp.
  try {
    const db   = getDb();
    const rows = db.channel_settings || [];

    // 1. Exact channel match — Settings saved for this channel
    if (channelId && channelId !== 'demo') {
      const row = rows.find(r => r.channel_id === channelId);
      if (row) {
        const s = JSON.parse(row.settings || '{}');
        if (s.whatsapp_token && s.whatsapp_phone_id) {
          console.log(`[Creds] channel="${channelId}" phoneId="${s.whatsapp_phone_id}"`);
          return { token: s.whatsapp_token, phoneId: s.whatsapp_phone_id, appId: s.whatsapp_app_id || null };
        }
      }
    }

    // 2. Any non-demo channel with credentials (for campaigns created before multi-login)
    for (const row of rows) {
      if (row.channel_id === 'demo') continue;
      try {
        const s = JSON.parse(row.settings || '{}');
        if (s.whatsapp_token && s.whatsapp_phone_id) {
          console.log(`[Creds] fallback channel="${row.channel_id}" phoneId="${s.whatsapp_phone_id}"`);
          return { token: s.whatsapp_token, phoneId: s.whatsapp_phone_id, appId: s.whatsapp_app_id || null };
        }
      } catch (_) {}
    }
  } catch (e) {
    console.error('[Creds] DB read error:', e.message);
  }

  console.error('[Creds] No credentials — add WhatsApp token in Settings page');
  return null;
}

async function callMetaApi(phoneId, token, body) {
  const url = `https://graph.facebook.com/v25.0/${phoneId}/messages`;
  console.log(`[MetaAPI] POST phoneId="${phoneId}" token="${token ? token.substring(0,15)+'...' : 'MISSING'}"`);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error(`[MetaAPI] FAILED ${res.status} phoneId="${phoneId}" error=${JSON.stringify(data?.error || data)}`);
    throw new Error(`Meta API error ${res.status}: ${JSON.stringify(data?.error || data)}`);
  }
  const wamid = data?.messages?.[0]?.id || null;
  return { wamid, raw: data };
}

export const whatsappService = {
  /**
   * Send a plain text message (used by Chat UI admin replies)
   */
  async sendTextMessage(phone, text, channelId = null) {
    const clean = String(phone).replace(/\D/g, '');
    const to = clean.startsWith('91') ? clean : `91${clean}`;
    const creds = getCredentials(channelId);

    if (creds) {
      console.log(`[WhatsApp] → ${to}: "${text.substring(0, 60)}..."`);
      const result = await callMetaApi(creds.phoneId, creds.token, {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text, preview_url: false },
      });
      console.log(`[WhatsApp] ✓ Sent wamid: ${result.wamid}`);
      return { wamid: result.wamid };
    }

    // No credentials — simulation mode
    const mockId = `mock_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[WhatsApp SIM] → ${to}: "${text.substring(0, 60)}"`);
    return { wamid: mockId };
  },

  /**
   * Send a template message (used by automation/campaigns)
   * components: [{type:'body', text:'...'}, ...]
   * variables: key/value map to fill {{placeholders}}
   */
  async sendMessage(phone, components, variables, channelId = null) {
    const clean = String(phone).replace(/\D/g, '');
    const to = clean.startsWith('91') ? clean : `91${clean}`;

    // Resolve the final message text by filling variables into the body component
    const bodyComp = components?.find(c => c.type === 'body');
    let messageText = bodyComp?.text || '';
    if (variables) {
      for (const [key, val] of Object.entries(variables)) {
        if (val !== null && val !== undefined) {
          messageText = messageText.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(val));
        }
      }
    }

    const creds = getCredentials(channelId);

    if (creds) {
      // With real credentials: send as plain text (most reliable for custom templates)
      // For approved Meta templates, you'd use type:'template' instead
      console.log(`[WhatsApp] Campaign → ${to}: "${messageText.substring(0, 60)}..."`);
      try {
        const result = await callMetaApi(creds.phoneId, creds.token, {
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: messageText, preview_url: false },
        });
        console.log(`[WhatsApp] ✓ Campaign sent wamid: ${result.wamid}`);
        return { messageId: result.wamid, resolvedText: messageText };
      } catch (err) {
        console.error(`[WhatsApp] ✗ Campaign send failed for ${to}:`, err.message);
        // Still return so automation can record it
        return { messageId: null, resolvedText: messageText };
      }
    }

    // Simulation mode
    const mockId = `mock_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[WhatsApp SIM] Campaign → ${to}: "${messageText.substring(0, 70)}"`);
    return { messageId: mockId, resolvedText: messageText };
  },

  /**
   * Send a Meta approved template message (type: "template").
   * Used for product recommendation carousel campaigns.
   * templatePayload = output of buildSendMessagePayload() — the full body object.
   * The "to" field is overwritten with the cleaned phone number.
   */
  async sendTemplateMessage(phone, templatePayload, channelId = null) {
    const clean = String(phone).replace(/\D/g, '');
    const to = clean.startsWith('91') ? clean : `91${clean}`;
    const body = { ...templatePayload, to };
    const tplName = templatePayload?.template?.name || 'unknown';
    const langCode = templatePayload?.template?.language?.code || 'en_US';

    // Build ordered list of channels to try: requested channelId first, then others
    // This ensures 401 from one channel automatically falls back to another
    const db = getDb();
    const rows = db.channel_settings || [];
    const allCreds = [];
    // 1. Requested channel first (exact match)
    if (channelId && channelId !== 'demo') {
      const row = rows.find(r => r.channel_id === channelId);
      if (row) {
        try {
          const s = JSON.parse(row.settings || '{}');
          if (s.whatsapp_token && s.whatsapp_phone_id)
            allCreds.push({ channelId: row.channel_id, token: s.whatsapp_token, phoneId: s.whatsapp_phone_id });
        } catch (_) {}
      }
    }
    // 2. Other non-demo channels as fallback
    for (const row of rows) {
      if (row.channel_id === 'demo' || row.channel_id === channelId) continue;
      try {
        const s = JSON.parse(row.settings || '{}');
        if (s.whatsapp_token && s.whatsapp_phone_id)
          allCreds.push({ channelId: row.channel_id, token: s.whatsapp_token, phoneId: s.whatsapp_phone_id });
      } catch (_) {}
    }

    if (allCreds.length > 0) {
      let lastErr = null;
      for (const creds of allCreds) {
        try {
          console.log(`[WhatsApp] Template "${tplName}" (${langCode}) → ${to} via channel "${creds.channelId}"`);
          const result = await callMetaApi(creds.phoneId, creds.token, body);
          console.log(`[WhatsApp] ✓ Template sent wamid: ${result.wamid}`);
          return { messageId: result.wamid, resolvedText: `[Carousel: ${tplName}]`, wamid: result.wamid };
        } catch (err) {
          lastErr = err;
          if (err.message.includes('401')) {
            console.warn(`[WhatsApp] 401 on channel "${creds.channelId}" — trying next channel`);
            continue; // try next channel
          }
          throw err; // non-401 errors are not credential issues
        }
      }
      throw lastErr; // all channels exhausted
    }

    // Simulation mode — no credentials in DB
    const mockId = `tpl_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    console.log(`[WhatsApp SIM] Template "${tplName}" → ${to}`);
    return { messageId: mockId, resolvedText: `[Carousel: ${tplName}]` };
  },

  // kept for backward compat
  async sendTemplate(phone, templateName, language, components) {
    console.log(`[WhatsApp] Template "${templateName}" → ${phone}`);
    return { messageId: `tpl_${Date.now()}` };
  },

  async uploadMedia(buffer, filename, mimeType, channelId = null) {
    const creds = getCredentials(channelId);
    if (!creds) throw new Error('WhatsApp credentials not configured.');

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
    if (!res.ok) throw new Error(`Meta Media API error: ${JSON.stringify(data?.error || data)}`);
    return data.id;
  },

  /**
   * Upload image via Meta Resumable Upload API (2-step).
   * Returns a file_handle like "4:abcXYZ..." for use in template header_handle.
   * Requires App ID (whatsapp_app_id in Settings).
   *
   * Step 1: POST /{APP_ID}/uploads  → upload session id
   * Step 2: POST /{sessionId}       → file handle "h"
   */
  async uploadMediaResumable(buffer, filename, mimeType, channelId = null) {
    const creds = getCredentials(channelId);
    if (!creds) throw new Error('WhatsApp credentials not configured.');
    if (!creds.appId) throw new Error('App ID not configured. Add it in Settings → WhatsApp → App ID.');

    // Step 1 — create upload session
    const sessionRes = await fetch(
      `https://graph.facebook.com/v25.0/${creds.appId}/uploads`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${creds.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_name: filename,
          file_type: mimeType,
          file_length: buffer.length,
        }),
      }
    );
    const sessionData = await sessionRes.json();
    if (!sessionRes.ok || !sessionData.id) {
      throw new Error(`Resumable upload session failed: ${JSON.stringify(sessionData?.error || sessionData)}`);
    }
    const uploadSessionId = sessionData.id; // e.g. "upload:XXXXXXX"
    console.log(`[WhatsApp] Resumable upload session: ${uploadSessionId}`);

    // Step 2 — upload file bytes
    const uploadRes = await fetch(
      `https://graph.facebook.com/v25.0/${uploadSessionId}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `OAuth ${creds.token}`,
          'file_offset': '0',
          'Content-Type': mimeType,
        },
        body: buffer,
      }
    );
    const uploadData = await uploadRes.json();
    if (!uploadRes.ok || !uploadData.h) {
      throw new Error(`Resumable upload failed: ${JSON.stringify(uploadData?.error || uploadData)}`);
    }

    const fileHandle = uploadData.h; // e.g. "4:abcXYZ..."
    console.log(`[WhatsApp] Resumable upload complete → file_handle: ${fileHandle}`);
    return fileHandle;
  },

  async downloadImage(url) {
    console.log(`[WhatsApp] Downloading image: ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download image from ${url}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    
    // Guess mime type from header or extension
    let mimeType = res.headers.get('content-type') || 'image/jpeg';
    if (url.toLowerCase().endsWith('.png')) mimeType = 'image/png';
    else if (url.toLowerCase().endsWith('.webp')) mimeType = 'image/webp';
    
    return { buffer, mimeType };
  },

  formatMessage(template, variables) {
    let out = template;
    for (const [k, v] of Object.entries(variables)) {
      out = out.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
    }
    return out;
  },
};
