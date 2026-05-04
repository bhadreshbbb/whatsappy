import jwt from 'jsonwebtoken';
import { getDb } from '../services/database.js';

const JWT_SECRET = process.env.JWT_SECRET || 'whatsway_jwt_secret_change_in_production';

export function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;

    let channelId = decoded.channelId;

    // JWT missing channelId (old token issued before auth upgrade) — look up from DB
    if (!channelId && decoded.userId) {
      try {
        const db = getDb();
        const user = db.users.find(u => u.id === decoded.userId);
        if (user?.channel_id) {
          channelId = user.channel_id;
          console.log(`[Auth] channelId recovered from DB for user ${decoded.userId}: ${channelId}`);
        }
      } catch (_) {}
    }

    if (!channelId) {
      console.warn(`[Auth] WARNING: no channelId for user ${decoded.userId || decoded.email} — dashboard will show demo data`);
    }

    req.headers['x-channel-id'] = channelId || '';
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
