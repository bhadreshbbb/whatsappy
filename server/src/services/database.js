import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../../data');
const dbPath = path.join(dataDir, 'whatsway.json');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// ── MongoDB Atlas support (persistent cloud database) ──────────────────────
// When MONGODB_URI is set the JSON file is only used as local fallback.
let mongoCollection = null;

async function initMongo() {
  if (!process.env.MONGODB_URI) return;
  try {
    const { MongoClient } = await import('mongodb');
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const mdb = client.db('whatsway');
    mongoCollection = mdb.collection('appdata');
    console.log('[DB] Connected to MongoDB Atlas');
  } catch (e) {
    console.error('[DB] MongoDB connection failed, using JSON file:', e.message);
    mongoCollection = null;
  }
}

async function loadFromMongo() {
  if (!mongoCollection) return false;
  try {
    const doc = await mongoCollection.findOne({ _id: 'main' });
    if (doc) {
      const { _id, ...data } = doc;
      db = { ...db, ...data };
      if (!db.product_catalog) db.product_catalog = [];
      if (!db.chat_conversations) db.chat_conversations = [];
      if (!db.chat_messages) db.chat_messages = [];
      if (!db.gallery_folders) db.gallery_folders = [];
      if (!db.gallery_images) db.gallery_images = [];
      if (!db.meta_templates) db.meta_templates = [];
      if (!db._counters) db._counters = {};
      console.log('[DB] Loaded from MongoDB Atlas');
      return true;
    }
  } catch (e) {
    console.error('[DB] MongoDB load error:', e.message);
  }
  return false;
}

async function saveToMongo() {
  if (!mongoCollection) return;
  try {
    await mongoCollection.replaceOne(
      { _id: 'main' },
      { _id: 'main', ...db },
      { upsert: true }
    );
  } catch (e) {
    console.error('[DB] MongoDB save error:', e.message);
  }
}

let db = {
  website_visitors: [],
  cart_events: [],
  purchase_history: [],
  page_views: [],
  product_views: [],
  searches: [],
  custom_events: [],
  message_templates: [],
  abandoned_cart_campaigns: [],
  abandoned_cart_executions: [],
  user_sessions: [],
  channel_settings: [],
  product_catalog: [],   // Shopify product catalog per channel
  chat_conversations: [], // WhatsApp chat conversations
  chat_messages: [],      // WhatsApp chat messages
  gallery_folders: [],    // Media gallery folders
  gallery_images: [],     // Uploaded images with Meta media IDs
  meta_templates: [],     // WhatsApp templates submitted to Meta for approval
  _counters: {}
};

function loadDb() {
  if (fs.existsSync(dbPath)) {
    try {
      const data = fs.readFileSync(dbPath, 'utf8');
      const loaded = JSON.parse(data);
      // Merge loaded data into default schema so new fields are always present
      db = { ...db, ...loaded };
      if (!db.product_catalog) db.product_catalog = [];
      if (!db.chat_conversations) db.chat_conversations = [];
      if (!db.chat_messages) db.chat_messages = [];
      if (!db.gallery_folders) db.gallery_folders = [];
      if (!db.gallery_images) db.gallery_images = [];
      if (!db.meta_templates) db.meta_templates = [];
      if (!db._counters) db._counters = {};
    } catch (e) {
      console.error('Error loading DB:', e);
    }
  }

  // ── Seed shop_url from SHOP_URL env variable if not already set ──────────
  const envShopUrl = process.env.SHOP_URL;
  if (envShopUrl) {
    if (!db.channel_settings) db.channel_settings = [];
    let row = db.channel_settings.find(s => s.channel_id === 'demo');
    if (!row) { row = { channel_id: 'demo', settings: '{}' }; db.channel_settings.push(row); }
    try {
      const s = JSON.parse(row.settings || '{}');
      if (!s.shop_url) {
        s.shop_url = envShopUrl.replace(/\/$/, '');
        row.settings = JSON.stringify(s);
        console.log(`[DB] Seeded shop_url from env: ${s.shop_url}`);
      }
    } catch (_) {}
  }
}

function saveDb() {
  // Save to MongoDB Atlas if connected (non-blocking)
  if (mongoCollection) {
    saveToMongo().catch(() => {});
    return;
  }
  // Fallback: save to local JSON file
  try {
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error('Error saving DB:', e);
  }
}

export function getDb() {
  return {
    website_visitors: db.website_visitors,
    cart_events: db.cart_events,
    purchase_history: db.purchase_history,
    page_views: db.page_views,
    product_views: db.product_views,
    searches: db.searches,
    custom_events: db.custom_events,
    message_templates: db.message_templates,
    abandoned_cart_campaigns: db.abandoned_cart_campaigns,
    abandoned_cart_executions: db.abandoned_cart_executions,
    user_sessions: db.user_sessions,
    channel_settings: db.channel_settings,
    product_catalog: db.product_catalog,
    chat_conversations: db.chat_conversations,
    chat_messages: db.chat_messages,
    gallery_folders: db.gallery_folders,
    gallery_images: db.gallery_images,
    meta_templates: db.meta_templates,
    prepare: (sql) => ({
      get: (...params) => executeQuery(sql, params, 'get'),
      all: (...params) => executeQuery(sql, params, 'all'),
      run: (...params) => executeQuery(sql, params, 'run'),
    }),
    exec: (sql) => { saveDb(); },
    transaction: (fn) => fn(),
    save: () => { saveDb(); }
  };
}

function getNextId(table) {
  db._counters[table] = (db._counters[table] || 0) + 1;
  return db._counters[table];
}

function executeQuery(sql, params, mode) {
  const lowerSql = sql.toLowerCase().trim();
  
  if (mode === 'run') {
    if (lowerSql.includes('insert into website_visitors')) {
      const id = getNextId('website_visitors');
      const visitor = {
        id,
        channel_id: params[0],
        session_id: params[1],
        phone: params[2],
        email: params[3],
        name: params[4],
        ip_address: params[5],
        country: params[6],
        country_code: params[7],
        state: params[8],
        city: params[9],
        language: params[10],
        page_url: params[11],
        referrer: params[12],
        user_agent: params[13],
        device_type: params[14],
        visited_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      };
      
      const existingIdx = db.website_visitors.findIndex(v => v.channel_id === params[0] && v.session_id === params[1]);
      if (existingIdx >= 0) {
        db.website_visitors[existingIdx].visited_at = visitor.visited_at;
        db.website_visitors[existingIdx].page_url = visitor.page_url;
      } else {
        db.website_visitors.push(visitor);
      }
      saveDb();
      return { lastInsertRowid: id, changes: 1 };
    }
    
    if (lowerSql.includes('insert into cart_events')) {
      const id = getNextId('cart_events');
      const event = {
        id,
        channel_id: params[0],
        session_id: params[1],
        phone: params[2],
        email: params[3],
        name: params[4],
        event_type: params[5],
        cart_id: params[6],
        products: params[7],
        total_amount: params[8],
        currency: params[9],
        ip_address: params[10],
        country: params[11],
        city: params[12],
        language: params[13],
        whatsapp_sent: 0,
        recovered: 0,
        followup_count: 0,
        created_at: new Date().toISOString()
      };
      db.cart_events.push(event);
      saveDb();
      return { lastInsertRowid: id, changes: 1 };
    }
    
    if (lowerSql.includes('insert into abandoned_cart_campaigns')) {
      const id = getNextId('abandoned_cart_campaigns');
      const campaign = {
        id,
        channel_id: params[0],
        name: params[1],
        description: params[2],
        campaign_type: params[3],
        target_segment: params[4],
        filters: params[5],
        template_id: params[6],
        template_name: params[7],
        template_language: params[8],
        template_components: params[9],
        schedule_type: params[10],
        delay_hours: params[11],
        template_ids: params[12] || [], // New selectable template IDs
        is_active: 1,
        total_sent: 0,
        created_at: new Date().toISOString()
      };
      db.abandoned_cart_campaigns.push(campaign);
      saveDb();
      return { lastInsertRowid: id, changes: 1 };
    }
    
    if (lowerSql.includes('insert into message_templates')) {
      const id = getNextId('message_templates');
      const template = {
        id,
        channel_id: params[0],
        name: params[1],
        category: params[2],
        language: params[3],
        components: params[4],
        variables: params[5],
        preview: params[6],
        is_active: 1,
        created_at: new Date().toISOString()
      };
      db.message_templates.push(template);
      saveDb();
      return { lastInsertRowid: id, changes: 1 };
    }
    
    if (lowerSql.includes('insert into abandoned_cart_executions')) {
      const id = getNextId('abandoned_cart_executions');
      const exec = {
        id,
        campaign_id: params[0],
        cart_event_id: params[1],
        phone: params[2],
        name: params[3],
        language: params[4],
        country: params[5],
        city: params[6],
        products: params[7],
        whatsapp_message_id: params[8],
        status: params[9],
        sent_at: new Date().toISOString()
      };
      db.abandoned_cart_executions.push(exec);
      saveDb();
      return { lastInsertRowid: id, changes: 1 };
    }
    
    if (lowerSql.includes('insert into page_views')) {
      const id = getNextId('page_views');
      db.page_views.push({
        id,
        channel_id: params[0],
        session_id: params[1],
        url: params[2],
        page_title: params[3],
        viewed_at: new Date().toISOString()
      });
      saveDb();
      return { lastInsertRowid: id, changes: 1 };
    }
    
    if (lowerSql.includes('update website_visitors')) {
      const idx = db.website_visitors.findIndex(v => v.channel_id === params[3] && v.session_id === params[4]);
      if (idx >= 0) {
        if (params[0]) db.website_visitors[idx].phone = params[0];
        if (params[1]) db.website_visitors[idx].email = params[1];
        if (params[2]) db.website_visitors[idx].name = params[2];
      }
      saveDb();
      return { changes: idx >= 0 ? 1 : 0 };
    }
    
    if (lowerSql.includes('update cart_events')) {
      let changes = 0;
      if (lowerSql.includes('whatsapp_sent')) {
        const idx = db.cart_events.findIndex(c => c.id == params[1]);
        if (idx >= 0) {
          db.cart_events[idx].whatsapp_sent = 1;
          db.cart_events[idx].whatsapp_sent_at = new Date().toISOString();
          changes = 1;
        }
      }
      if (lowerSql.includes('recovered')) {
        const idx = db.cart_events.findIndex(c => c.cart_id === params[1]);
        if (idx >= 0) {
          db.cart_events[idx].recovered = 1;
          db.cart_events[idx].recovered_at = new Date().toISOString();
          changes = 1;
        }
      }
      saveDb();
      return { changes };
    }
    
    if (lowerSql.includes('update abandoned_cart_campaigns')) {
      const id = parseInt(params[params.length - 1]);
      const idx = db.abandoned_cart_campaigns.findIndex(c => c.id == id);
      if (idx >= 0) {
        db.abandoned_cart_campaigns[idx].total_sent = (db.abandoned_cart_campaigns[idx].total_sent || 0) + (params[0] || 0);
        db.abandoned_cart_campaigns[idx].last_run_at = new Date().toISOString();
      }
      saveDb();
      return { changes: idx >= 0 ? 1 : 0 };
    }
    
    if (lowerSql.includes('delete from abandoned_cart_campaigns')) {
      const id = parseInt(params[1]);
      const idx = db.abandoned_cart_campaigns.findIndex(c => c.id == id);
      if (idx >= 0) {
        db.abandoned_cart_campaigns.splice(idx, 1);
        saveDb();
        return { changes: 1 };
      }
      return { changes: 0 };
    }
    
    if (lowerSql.includes('delete from message_templates')) {
      const id = parseInt(params[1]);
      const idx = db.message_templates.findIndex(t => t.id == id);
      if (idx >= 0) {
        db.message_templates.splice(idx, 1);
        saveDb();
        return { changes: 1 };
      }
      return { changes: 0 };
    }
    
    saveDb();
    return { lastInsertRowid: 1, changes: 1 };
  }
  
  if (mode === 'get') {
    if (lowerSql.includes('from website_visitors')) {
      if (lowerSql.includes('count(*)')) {
        const channelId = params[0];
        const total = db.website_visitors.filter(v => v.channel_id === channelId).length;
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
        const active = db.website_visitors.filter(v => v.channel_id === channelId && new Date(v.visited_at) >= fiveMinAgo).length;
        const withPhone = db.website_visitors.filter(v => v.channel_id === channelId && v.phone).length;
        return { total, active, with_phone: withPhone };
      }
      const id = params[0];
      return db.website_visitors.find(v => v.id == id);
    }
    
    if (lowerSql.includes('from cart_events')) {
      if (lowerSql.includes('count(*)')) {
        const channelId = params[0];
        const total = db.cart_events.filter(c => c.channel_id === channelId).length;
        const recovered = db.cart_events.filter(c => c.channel_id === channelId && c.recovered).length;
        return { total, recovered };
      }
    }
    
    if (lowerSql.includes('from abandoned_cart_campaigns')) {
      const id = parseInt(params[0]);
      return db.abandoned_cart_campaigns.find(c => c.id == id);
    }
    
    if (lowerSql.includes('from message_templates')) {
      const id = parseInt(params[0]);
      return db.message_templates.find(t => t.id == id);
    }
    
    if (lowerSql.includes('sum(total_sent)')) {
      const channelId = params[0];
      const sum = db.abandoned_cart_campaigns.filter(c => c.channel_id === channelId).reduce((acc, c) => acc + (c.total_sent || 0), 0);
      return { sent: sum };
    }
    
    if (lowerSql.includes('sum(total_amount)')) {
      const channelId = params[0];
      const sum = db.purchase_history.filter(p => p.channel_id === channelId).reduce((acc, p) => acc + (p.total_amount || 0), 0);
      return { recovered: sum };
    }
    
    return null;
  }
  
  if (mode === 'all') {
    if (lowerSql.includes('from website_visitors')) {
      let results = [...db.website_visitors];
      if (params[0]) {
        results = results.filter(v => v.channel_id === params[0]);
      }
      results.sort((a, b) => new Date(b.visited_at).getTime() - new Date(a.visited_at).getTime());
      return results.slice(0, 50);
    }
    
    if (lowerSql.includes('from cart_events')) {
      let results = [...db.cart_events];
      if (params[0]) {
        results = results.filter(c => c.channel_id === params[0]);
      }
      results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return results.slice(0, 50);
    }
    
    if (lowerSql.includes('from abandoned_cart_campaigns')) {
      return db.abandoned_cart_campaigns.filter(c => c.channel_id === (params[0] || 'demo')).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    
    if (lowerSql.includes('from message_templates')) {
      let results = db.message_templates.filter(t => t.channel_id === (params[0] || 'demo'));
      results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return results;
    }
    
    if (lowerSql.includes('from abandoned_cart_executions')) {
      return db.abandoned_cart_executions.filter(e => e.campaign_id === params[0]).sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()).slice(0, 100);
    }
    
    if (lowerSql.includes('from page_views')) {
      return db.page_views.filter(p => p.session_id === params[0]).sort((a, b) => new Date(b.viewed_at).getTime() - new Date(a.viewed_at).getTime()).slice(0, 50);
    }
    
    return [];
  }
  
  return null;
}

// Apply env-based overrides that should always win (e.g. SHOP_URL)
function applyEnvOverrides() {
  const envShopUrl = process.env.SHOP_URL;
  if (!envShopUrl) return;
  if (!db.channel_settings) db.channel_settings = [];
  let row = db.channel_settings.find(s => s.channel_id === 'demo');
  if (!row) { row = { channel_id: 'demo', settings: '{}' }; db.channel_settings.push(row); }
  try {
    const s = JSON.parse(row.settings || '{}');
    if (!s.shop_url) {
      s.shop_url = envShopUrl.replace(/\/$/, '');
      row.settings = JSON.stringify(s);
      console.log(`[DB] Applied SHOP_URL from env: ${s.shop_url}`);
    }
  } catch (_) {}
}

export async function initDb() {
  await initMongo();
  const loadedFromMongo = await loadFromMongo();
  if (!loadedFromMongo) loadDb();
  applyEnvOverrides();
  
  if (db.message_templates.length === 0) {
    db.message_templates = [
      {
        id: 1,
        channel_id: 'demo',
        name: 'Cart Recovery - Hindi',
        category: 'abandoned_cart',
        language: 'hi',
        components: JSON.stringify([{ type: 'body', text: 'नमस्ते {{customer_name}}! 👋\n\nआपका कार्ट अभी भी रुका हुआ है।\n\n🛍 {{product_list}}\n\n💰 कुल: ₹{{total_amount}}\n\n🛒 अपना कार्ट पूरा करें!' }]),
        variables: JSON.stringify(['customer_name', 'product_list', 'total_amount']),
        preview: 'नमस्ते Priya! आपका कार्ट अभी भी रुका हुआ है...',
        is_active: 1,
        created_at: new Date().toISOString()
      },
      {
        id: 2,
        channel_id: 'demo',
        name: 'Cart Recovery - English',
        category: 'abandoned_cart',
        language: 'en',
        components: JSON.stringify([{ type: 'body', text: 'Hi {{customer_name}}! 👋\n\nYour cart is waiting for you:\n\n{{product_list}}\n\n💰 Total: ₹{{total_amount}}\n\n🛒 Complete your purchase now!' }]),
        variables: JSON.stringify(['customer_name', 'product_list', 'total_amount']),
        preview: 'Hi! Your cart is waiting for you...',
        is_active: 1,
        created_at: new Date().toISOString()
      },
      {
        id: 3,
        channel_id: 'demo',
        name: 'Cart Recovery - Tamil',
        category: 'abandoned_cart',
        language: 'ta',
        components: JSON.stringify([{ type: 'body', text: 'வணக்கம் {{customer_name}}! 🙏\n\nஉங்கள் கார்ட் உங்களைக் காத்திருக்கிறது:\n\n{{product_list}}\n\n💰 மொத்தம்: ₹{{total_amount}}' }]),
        variables: JSON.stringify(['customer_name', 'product_list', 'total_amount']),
        preview: 'வணக்கம்! உங்கள் கார்ட் உங்களைக் காத்திருக்கிறது...',
        is_active: 1,
        created_at: new Date().toISOString()
      },
      {
        id: 4,
        channel_id: 'demo',
        name: 'Cart Recovery - Telugu',
        category: 'abandoned_cart',
        language: 'te',
        components: JSON.stringify([{ type: 'body', text: 'స్వాగతం {{customer_name}}! 👋\n\nమీ కార్ట్ మీ కోసం వేచి ఉంది:\n\n{{product_list}}\n\n💰 మొత్తం: ₹{{total_amount}}' }]),
        variables: JSON.stringify(['customer_name', 'product_list', 'total_amount']),
        preview: 'స్వాగతం! మీ కార్ట్ మీ కోసం వేచి ఉంది...',
        is_active: 1,
        created_at: new Date().toISOString()
      },
      {
        id: 5,
        channel_id: 'demo',
        name: 'Welcome - English',
        category: 'welcome',
        language: 'en',
        components: JSON.stringify([{ type: 'body', text: 'Welcome {{customer_name}}! 🎉\n\nThank you for visiting us!\n\n🌟 Check out our latest products.\n\nUse code WELCOME10 for 10% off!' }]),
        variables: JSON.stringify(['customer_name']),
        preview: 'Welcome! Thank you for visiting us!',
        is_active: 1,
        created_at: new Date().toISOString()
      },
      // 🛒 Abandoned Cart Follow-up Templates
      {
        id: 101, channel_id: 'demo', name: 'Cart Follow-up 1', category: 'abandoned_cart', language: 'en',
        components: JSON.stringify([{ type: 'body', text: 'Hi {{customer_name}}! 👋 Your cart is waiting. Use code CART10 for 10% off!' }]),
        variables: JSON.stringify(['customer_name']), preview: 'Hi! Your cart is waiting...', is_active: 1, created_at: new Date().toISOString()
      },
      {
        id: 102, channel_id: 'demo', name: 'Cart Follow-up 2', category: 'abandoned_cart', language: 'en',
        components: JSON.stringify([{ type: 'body', text: 'Still thinking? 🤔 Your items are selling fast! Complete your order now.' }]),
        variables: JSON.stringify(['customer_name']), preview: 'Still thinking? Your items...', is_active: 1, created_at: new Date().toISOString()
      },
      {
        id: 103, channel_id: 'demo', name: 'Cart Follow-up 3', category: 'abandoned_cart', language: 'en',
        components: JSON.stringify([{ type: 'body', text: 'Don\'t miss out! 😱 We saved your cart for you. Grab it before it\'s gone!' }]),
        variables: JSON.stringify(['customer_name']), preview: 'Don\'t miss out! We saved...', is_active: 1, created_at: new Date().toISOString()
      },
      {
        id: 104, channel_id: 'demo', name: 'Cart Follow-up 4', category: 'abandoned_cart', language: 'en',
        components: JSON.stringify([{ type: 'body', text: 'Final Call! 📢 This is your last chance to recover your cart with a special discount.' }]),
        variables: JSON.stringify(['customer_name']), preview: 'Final Call! This is your...', is_active: 1, created_at: new Date().toISOString()
      },
      // 🛍 Abandoned Product Follow-up Templates
      {
        id: 201, channel_id: 'demo', name: 'Product Follow-up 1', category: 'product_view', language: 'en',
        components: JSON.stringify([{ type: 'body', text: 'Hi {{customer_name}}! 👋 You were looking at {{product_name}}. Want to see more?' }]),
        variables: JSON.stringify(['customer_name', 'product_name']), preview: 'Hi! You were looking at...', is_active: 1, created_at: new Date().toISOString()
      },
      {
        id: 202, channel_id: 'demo', name: 'Product Follow-up 2', category: 'product_view', language: 'en',
        components: JSON.stringify([{ type: 'body', text: 'People also bought these! 🌟 Since you liked {{product_name}}, check these out.' }]),
        variables: JSON.stringify(['customer_name', 'product_name']), preview: 'People also bought these!', is_active: 1, created_at: new Date().toISOString()
      },
      {
        id: 203, channel_id: 'demo', name: 'Product Follow-up 3', category: 'product_view', language: 'en',
        components: JSON.stringify([{ type: 'body', text: 'Price Drop Alert? 📉 Just kidding, but {{product_name}} is at its best price right now!' }]),
        variables: JSON.stringify(['customer_name', 'product_name']), preview: 'Price Drop Alert?', is_active: 1, created_at: new Date().toISOString()
      },
      {
        id: 204, channel_id: 'demo', name: 'Product Follow-up 4', category: 'product_view', language: 'en',
        components: JSON.stringify([{ type: 'body', text: 'Last Look! 👀 {{product_name}} is still available. Shop before it sells out.' }]),
        variables: JSON.stringify(['name', 'product_name']), preview: 'Last Look! Shop before it...', is_active: 1, created_at: new Date().toISOString()
      },
      // 🏠 Website Visit — Product Recommendation Templates (home/listing page visitors)
      {
        id: 301, channel_id: 'demo', name: 'Visit Follow-up 1', category: 'website_visit', language: 'en',
        components: JSON.stringify([{ type: 'body', text: 'Hi {{name}}! 👋\n\nYou visited our store recently. Check out what\'s trending:\n\n{{product_list}}\n\n🛍 Tap to explore!' }]),
        variables: JSON.stringify(['name', 'product_list']), preview: 'Hi! You visited our store...', is_active: 1, created_at: new Date().toISOString()
      },
      {
        id: 302, channel_id: 'demo', name: 'Visit Follow-up 2', category: 'website_visit', language: 'en',
        components: JSON.stringify([{ type: 'body', text: 'Hey {{name}}! 🌟 Still looking for something special?\n\nWe picked this just for you:\n{{product_name}} — ₹{{product_price}}\n\n👆 Check it out now!' }]),
        variables: JSON.stringify(['name', 'product_name', 'product_price']), preview: 'Still looking for something?', is_active: 1, created_at: new Date().toISOString()
      },
      {
        id: 303, channel_id: 'demo', name: 'Visit Follow-up 3', category: 'website_visit', language: 'en',
        components: JSON.stringify([{ type: 'body', text: 'Don\'t miss out! 🔥 Our top picks are selling fast.\n\n{{product_list}}\n\n🎁 Order today for fastest delivery!' }]),
        variables: JSON.stringify(['name', 'product_list']), preview: 'Our top picks are selling fast!', is_active: 1, created_at: new Date().toISOString()
      },
      {
        id: 304, channel_id: 'demo', name: 'Visit Follow-up 4', category: 'website_visit', language: 'en',
        components: JSON.stringify([{ type: 'body', text: 'Last chance {{name}}! ⏰\n\nUse code VISIT10 for 10% off your first order.\n\n{{product_name}} is waiting for you. Shop now!' }]),
        variables: JSON.stringify(['name', 'product_name']), preview: 'Last chance! Use VISIT10...', is_active: 1, created_at: new Date().toISOString()
      },
      // 🔄 Post-Cart Upsell Templates (after 4 cart reminders failed)
      {
        id: 401, channel_id: 'demo', name: 'Post-Cart Upsell 1', category: 'post_cart_upsell', language: 'en',
        components: JSON.stringify([{ type: 'body', text: 'Hi {{name}}! 🌟\n\nWe have something you\'ll love:\n\n{{product_name}} — ₹{{product_price}}\n\n🛒 Tap to shop this exclusive pick!' }]),
        variables: JSON.stringify(['name', 'product_name', 'product_price', 'product_url']), preview: 'We have something you\'ll love!', is_active: 1, created_at: new Date().toISOString()
      },
      {
        id: 402, channel_id: 'demo', name: 'Post-Cart Upsell 2', category: 'post_cart_upsell', language: 'en',
        components: JSON.stringify([{ type: 'body', text: 'Hey {{name}}! 👀 Our bestsellers are almost sold out!\n\n{{product_name}} — ₹{{product_price}}\n\nGrab it before it\'s gone!' }]),
        variables: JSON.stringify(['name', 'product_name', 'product_price']), preview: 'Our bestsellers are almost sold out!', is_active: 1, created_at: new Date().toISOString()
      },
      {
        id: 403, channel_id: 'demo', name: 'Post-Cart Upsell 3', category: 'post_cart_upsell', language: 'en',
        components: JSON.stringify([{ type: 'body', text: 'Special just for you {{name}}! 🎁\n\nExclusive offer on {{product_name}}.\n₹{{product_price}} — Limited time only!\n\nShop now!' }]),
        variables: JSON.stringify(['name', 'product_name', 'product_price']), preview: 'Special just for you!', is_active: 1, created_at: new Date().toISOString()
      },
      {
        id: 404, channel_id: 'demo', name: 'Post-Cart Upsell 4', category: 'post_cart_upsell', language: 'en',
        components: JSON.stringify([{ type: 'body', text: 'Final recommendation {{name}}! 🔥\n\nUse code UPSELL15 for 15% off {{product_name}}.\n\nThis is your last chance at this price!' }]),
        variables: JSON.stringify(['name', 'product_name', 'product_price']), preview: 'Final recommendation!', is_active: 1, created_at: new Date().toISOString()
      }
    ];
  }
  
  if (false && db.abandoned_cart_campaigns.length === 0) {
    db.abandoned_cart_campaigns = [
      {
        id: 1,
        channel_id: 'demo',
        name: '1 Hour Reminder',
        description: 'Send reminder 1 hour after cart abandonment',
        campaign_type: 'abandoned_cart',
        target_segment: 'abandoned_cart',
        filters: '{}',
        template_id: 2,
        template_name: 'Cart Recovery - English',
        template_language: 'en',
        template_ids: [101, 102, 103, 104], // selectable templates for 4 stages
        template_components: JSON.stringify([{ type: 'body', text: 'Hi {{customer_name}}! 👋\n\nYour cart is waiting for you:\n\n{{product_list}}\n\n💰 Total: ₹{{total_amount}}\n\n🛒 Complete your purchase now!' }]),
        schedule_type: 'delayed',
        delay_hours: 1,
        is_active: 1,
        total_sent: 0,
        created_at: new Date().toISOString()
      },
      {
        id: 2,
        channel_id: 'demo',
        name: 'Product Follow-up Campaign',
        description: 'Auto follow-up for product views',
        campaign_type: 'product_view',
        target_segment: 'product_view',
        filters: '{}',
        template_id: 201,
        template_name: 'Product Follow-up 1',
        template_language: 'en',
        template_ids: [201, 202, 203, 204], // selectable templates for 4 stages
        template_components: JSON.stringify([{ type: 'body', text: 'Hi {{customer_name}}! 👋 You were looking at {{product_name}}.' }]),
        schedule_type: 'delayed',
        delay_hours: 24,
        is_active: 1,
        total_sent: 0,
        created_at: new Date().toISOString()
      },
      {
        id: 3,
        channel_id: 'demo',
        name: '72 Hour Final Nudge',
        description: 'Last chance recovery after 3 days',
        campaign_type: 'abandoned_cart',
        target_segment: 'abandoned_cart',
        filters: '{}',
        template_id: 104,
        template_name: 'Cart Follow-up 4',
        template_language: 'en',
        template_ids: [101, 102, 103, 104],
        template_components: JSON.stringify([{ type: 'body', text: 'Final Call! 📢' }]),
        schedule_type: 'delayed',
        delay_hours: 72,
        is_active: 1,
        total_sent: 0,
        created_at: new Date().toISOString()
      },
      {
        id: 4,
        channel_id: 'demo',
        name: 'Website Visit — Product Recommendations',
        description: 'Send product recommendations to visitors who only browsed home/listing pages',
        campaign_type: 'website_visit',
        target_segment: 'active_visitors',
        filters: '{}',
        template_id: 301,
        template_name: 'Website Visit Follow-up 1',
        template_language: 'en',
        template_ids: [301, 302, 303, 304],
        template_components: JSON.stringify([{ type: 'body', text: 'Hi {{name}}! 👋\n\nYou visited our store recently. Here are some products we think you\'ll love:\n\n{{product_list}}\n\n🛍 Shop now and get the best deals!' }]),
        schedule_type: 'delayed',
        delay_hours: 2,
        is_active: 1,
        total_sent: 0,
        created_at: new Date().toISOString()
      },
      {
        id: 5,
        channel_id: 'demo',
        name: 'Post-Cart Upsell',
        description: 'After 4 cart reminders with no purchase — send product recommendations to keep user engaged',
        campaign_type: 'post_cart_upsell',
        target_segment: 'cart_followup_complete',
        filters: '{}',
        template_id: 401,
        template_name: 'Post-Cart Upsell 1',
        template_language: 'en',
        template_ids: [401, 402, 403, 404],
        template_components: JSON.stringify([{ type: 'body', text: 'Hey {{name}}! 🌟\n\nWe know you\'ve been thinking about it. Here\'s something even better:\n\n{{product_name}} — ₹{{product_price}}\n\n🎁 Exclusive offer just for you. Tap to shop!' }]),
        schedule_type: 'delayed',
        delay_hours: 0,
        is_active: 1,
        total_sent: 0,
        created_at: new Date().toISOString()
      }
    ];
  }
  
  // Campaign seeding disabled — campaigns start empty for user to create

  // Always ensure new templates exist (idempotent by ID)
  const ensureTemplates = [
    { id: 301, channel_id: 'demo', name: 'Visit Follow-up 1', category: 'website_visit', language: 'en', components: JSON.stringify([{ type: 'body', text: 'Hi {{name}}! 👋\n\nYou visited our store recently. Check out what\'s trending:\n\n{{product_list}}\n\n🛍 Tap to explore!' }]), variables: JSON.stringify(['name', 'product_list']), preview: 'Hi! You visited our store...', is_active: 1, created_at: new Date().toISOString() },
    { id: 302, channel_id: 'demo', name: 'Visit Follow-up 2', category: 'website_visit', language: 'en', components: JSON.stringify([{ type: 'body', text: 'Hey {{name}}! 🌟 Still looking for something special?\n\nWe picked this just for you:\n{{product_name}} — ₹{{product_price}}\n\n👆 Check it out now!' }]), variables: JSON.stringify(['name', 'product_name', 'product_price']), preview: 'Still looking for something?', is_active: 1, created_at: new Date().toISOString() },
    { id: 303, channel_id: 'demo', name: 'Visit Follow-up 3', category: 'website_visit', language: 'en', components: JSON.stringify([{ type: 'body', text: 'Don\'t miss out! 🔥 Our top picks are selling fast.\n\n{{product_list}}\n\n🎁 Order today for fastest delivery!' }]), variables: JSON.stringify(['name', 'product_list']), preview: 'Our top picks are selling fast!', is_active: 1, created_at: new Date().toISOString() },
    { id: 304, channel_id: 'demo', name: 'Visit Follow-up 4', category: 'website_visit', language: 'en', components: JSON.stringify([{ type: 'body', text: 'Last chance {{name}}! ⏰\n\nUse code VISIT10 for 10% off your first order.\n\n{{product_name}} is waiting for you. Shop now!' }]), variables: JSON.stringify(['name', 'product_name']), preview: 'Last chance! Use VISIT10...', is_active: 1, created_at: new Date().toISOString() },
    { id: 401, channel_id: 'demo', name: 'Post-Cart Upsell 1', category: 'post_cart_upsell', language: 'en', components: JSON.stringify([{ type: 'body', text: 'Hi {{name}}! 🌟\n\nWe have something you\'ll love:\n\n{{product_name}} — ₹{{product_price}}\n\n🛒 Tap to shop this exclusive pick!' }]), variables: JSON.stringify(['name', 'product_name', 'product_price', 'product_url']), preview: 'We have something you\'ll love!', is_active: 1, created_at: new Date().toISOString() },
    { id: 402, channel_id: 'demo', name: 'Post-Cart Upsell 2', category: 'post_cart_upsell', language: 'en', components: JSON.stringify([{ type: 'body', text: 'Hey {{name}}! 👀 Our bestsellers are almost sold out!\n\n{{product_name}} — ₹{{product_price}}\n\nGrab it before it\'s gone!' }]), variables: JSON.stringify(['name', 'product_name', 'product_price']), preview: 'Our bestsellers are almost sold out!', is_active: 1, created_at: new Date().toISOString() },
    { id: 403, channel_id: 'demo', name: 'Post-Cart Upsell 3', category: 'post_cart_upsell', language: 'en', components: JSON.stringify([{ type: 'body', text: 'Special just for you {{name}}! 🎁\n\nExclusive offer on {{product_name}}.\n₹{{product_price}} — Limited time only!\n\nShop now!' }]), variables: JSON.stringify(['name', 'product_name', 'product_price']), preview: 'Special just for you!', is_active: 1, created_at: new Date().toISOString() },
    { id: 404, channel_id: 'demo', name: 'Post-Cart Upsell 4', category: 'post_cart_upsell', language: 'en', components: JSON.stringify([{ type: 'body', text: 'Final recommendation {{name}}! 🔥\n\nUse code UPSELL15 for 15% off {{product_name}}.\n\nThis is your last chance at this price!' }]), variables: JSON.stringify(['name', 'product_name', 'product_price']), preview: 'Final recommendation!', is_active: 1, created_at: new Date().toISOString() }
  ];
  for (const tpl of ensureTemplates) {
    if (!db.message_templates.find(t => t.id === tpl.id)) {
      db.message_templates.push(tpl);
    }
  }

  seedDummyData();
  saveDb();
  console.log('Database initialized with dummy data!');
}

function seedDummyData() {
  if (db.website_visitors.length > 0) return;
  
  const cities = [
    { city: 'Mumbai', country: 'India', code: 'IN', state: 'Maharashtra', lang: 'hi' },
    { city: 'Delhi', country: 'India', code: 'IN', state: 'Delhi', lang: 'hi' },
    { city: 'Bangalore', country: 'India', code: 'IN', state: 'Karnataka', lang: 'en' },
    { city: 'Chennai', country: 'India', code: 'IN', state: 'Tamil Nadu', lang: 'ta' },
    { city: 'Hyderabad', country: 'India', code: 'IN', state: 'Telangana', lang: 'te' },
    { city: 'Ahmedabad', country: 'India', code: 'IN', state: 'Gujarat', lang: 'gu' },
    { city: 'Pune', country: 'India', code: 'IN', state: 'Maharashtra', lang: 'hi' },
    { city: 'Surat', country: 'India', code: 'IN', state: 'Gujarat', lang: 'gu' },
    { city: 'Kolkata', country: 'India', code: 'IN', state: 'West Bengal', lang: 'bn' },
    { city: 'New York', country: 'USA', code: 'US', state: 'NY', lang: 'en' },
  ];

  const names = ['Priya Sharma', 'Rahul Patel', 'Amit Kumar', 'Sneha Reddy', 'Vikram Singh', 'Ananya Gupta', 'Rajesh Verma', 'Kavita Joshi', 'Suresh Nair', 'Meera Iyer'];
  const products = [
    { name: 'Blue Kurti', price: 799 },
    { name: 'Red Saree', price: 2499 },
    { name: 'Lehenga Choli', price: 5999 },
    { name: 'Cotton Shirt', price: 599 },
    { name: 'Denim Jeans', price: 1299 },
    { name: 'Silk Kurta', price: 1899 },
    { name: 'Anarkali Suit', price: 3499 },
    { name: 'Palazzo Set', price: 999 },
  ];
  const devices = ['mobile', 'desktop', 'tablet'];
  const browsers = ['Chrome', 'Firefox', 'Safari', 'Edge'];

  for (let i = 0; i < 150; i++) {
    const loc = cities[Math.floor(Math.random() * cities.length)];
    const name = names[Math.floor(Math.random() * names.length)];
    const sessionId = `sess_${Date.now()}_${i}`;
    const phone = `91${Math.floor(Math.random() * 9000000000 + 1000000000)}`;
    const device = devices[Math.floor(Math.random() * devices.length)];
    const browser = browsers[Math.floor(Math.random() * browsers.length)];
    const daysAgo = Math.floor(Math.random() * 30);
    const visitedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();

    db.website_visitors.push({
      id: i + 1,
      channel_id: 'demo',
      session_id: sessionId,
      phone: phone,
      email: `${name.toLowerCase().replace(' ', '.')}@email.com`,
      name: name,
      ip_address: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
      country: loc.country,
      country_code: loc.code,
      state: loc.state,
      city: loc.city,
      language: loc.lang,
      device_type: device,
      browser: browser,
      page_url: 'https://shop.example.com/products',
      visited_at: visitedAt,
      created_at: visitedAt
    });

    const cartProducts = [];
    let total = 0;
    const numProducts = Math.floor(Math.random() * 3) + 1;
    for (let j = 0; j < numProducts; j++) {
      const prod = products[Math.floor(Math.random() * products.length)];
      cartProducts.push({ ...prod, quantity: Math.floor(Math.random() * 3) + 1 });
      total += prod.price * cartProducts[cartProducts.length - 1].quantity;
    }

    const eventTypes = ['add_to_cart', 'checkout_started'];
    const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
    const recovered = Math.random() > 0.7 ? 1 : 0;
    const whatsappSent = recovered || Math.random() > 0.5 ? 1 : 0;

    db.cart_events.push({
      id: i + 1,
      channel_id: 'demo',
      session_id: sessionId,
      phone: phone,
      email: `${name.toLowerCase().replace(' ', '.')}@email.com`,
      name: name,
      event_type: eventType,
      cart_id: `cart_${sessionId}`,
      products: JSON.stringify(cartProducts),
      total_amount: total,
      currency: 'INR',
      country: loc.country,
      city: loc.city,
      language: loc.lang,
      whatsapp_sent: whatsappSent,
      recovered: recovered,
      followup_count: whatsappSent ? 1 : 0,
      created_at: visitedAt
    });
  }
  
  db._counters['website_visitors'] = 150;
  db._counters['cart_events'] = 150;
  
  console.log('Seeded 150 visitors with cart data!');
}
