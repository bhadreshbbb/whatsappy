import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../services/database.js';

const JWT_SECRET  = process.env.JWT_SECRET || 'whatsway_jwt_secret_change_in_production';
const JWT_EXPIRES = '30d';

function generateChannelId() {
  return 'ch_' + uuidv4().replace(/-/g, '').slice(0, 12);
}

function makeToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, channelId: user.channel_id, name: user.name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

function safeUser(user) {
  return { id: user.id, email: user.email, name: user.name, channelId: user.channel_id, plan: user.plan || 'free' };
}

export const authController = {
  async signup(req, res, next) {
    try {
      const db = getDb();
      const { email, password, name, shop_url } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }

      if (!db.users) db.users = [];

      const existing = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
      if (existing) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const channelId    = generateChannelId();

      const user = {
        id:            uuidv4(),
        email:         email.toLowerCase().trim(),
        password_hash: passwordHash,
        name:          (name || email.split('@')[0]).trim(),
        channel_id:    channelId,
        plan:          'free',
        created_at:    new Date().toISOString(),
      };

      db.users.push(user);

      // Create default channel settings for this merchant
      if (!db.channel_settings) db.channel_settings = [];
      if (!db.channel_settings.find(s => s.channel_id === channelId)) {
        db.channel_settings.push({
          channel_id: channelId,
          settings: JSON.stringify({ shop_url: shop_url || '', product_url_slug: '/products' }),
          updated_at: new Date().toISOString(),
        });
      }

      db.save();

      const token = makeToken(user);
      res.status(201).json({ token, user: safeUser(user) });
    } catch (error) {
      next(error);
    }
  },

  async login(req, res, next) {
    try {
      const db = getDb();
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      if (!db.users) db.users = [];

      const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase().trim());
      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const token = makeToken(user);
      res.json({ token, user: safeUser(user) });
    } catch (error) {
      next(error);
    }
  },

  async me(req, res, next) {
    try {
      const db = getDb();
      const user = (db.users || []).find(u => u.id === req.user.userId);
      if (!user) return res.status(404).json({ error: 'User not found' });
      res.json(safeUser(user));
    } catch (error) {
      next(error);
    }
  },

  async changePassword(req, res, next) {
    try {
      const db = getDb();
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'currentPassword and newPassword are required' });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters' });
      }

      const userIdx = (db.users || []).findIndex(u => u.id === req.user.userId);
      if (userIdx < 0) return res.status(404).json({ error: 'User not found' });

      const user = db.users[userIdx];
      const valid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

      db.users[userIdx].password_hash = await bcrypt.hash(newPassword, 10);
      db.users[userIdx].updated_at = new Date().toISOString();
      db.save();

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },
};
