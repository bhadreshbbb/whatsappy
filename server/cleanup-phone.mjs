/**
 * One-time cleanup script — removes all DB records for a given phone number.
 * Usage:  node cleanup-phone.mjs 919106862019
 */
import { MongoClient } from 'mongodb';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
require('dotenv').config();

const rawPhone = process.argv[2] || '919106862019';

// Build all variants to match
const digits = rawPhone.replace(/^\+/, '');
const short   = digits.replace(/^91/, '');  // 10-digit without country code
const phones  = [...new Set([digits, `+${digits}`, short])];
console.log('Removing records matching phones:', phones);

const TABLES = [
  'website_visitors',
  'cart_events',
  'purchase_history',
  'product_views',
  'abandoned_cart_executions',
  'campaign_locks',
  'chat_conversations',
  'order_responses',
  'searches',
  'custom_events',
  'user_sessions',
];

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI not set in .env'); process.exit(1); }

  // Strip unknown query params that old driver versions reject (e.g. appNameDemo)
  const cleanUri = uri.replace(/[?&]appNameDemo=[^&]*/i, '').replace(/\?$/, '');
  const client = new MongoClient(cleanUri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  console.log('Connected to MongoDB\n');
  const db = client.db('whatsway');

  let total = 0;

  for (const table of TABLES) {
    const col = db.collection(table);
    const r = await col.deleteMany({ phone: { $in: phones } });
    if (r.deletedCount > 0) {
      console.log(`  ✓ ${table}: deleted ${r.deletedCount}`);
      total += r.deletedCount;
    } else {
      console.log(`  · ${table}: 0`);
    }
  }

  // chat_messages can also have from/to/conversation_id = phone
  const msgCol = db.collection('chat_messages');
  const mr = await msgCol.deleteMany({
    $or: [
      { phone:           { $in: phones } },
      { from:            { $in: phones } },
      { to:              { $in: phones } },
      { conversation_id: { $in: phones } },
    ]
  });
  if (mr.deletedCount > 0) {
    console.log(`  ✓ chat_messages: deleted ${mr.deletedCount}`);
    total += mr.deletedCount;
  } else {
    console.log(`  · chat_messages: 0`);
  }

  await client.close();
  console.log(`\nTotal deleted: ${total}`);
  console.log('Done. Restart the server so in-memory cache reloads fresh data from MongoDB.');
}

run().catch(e => { console.error(e.message); process.exit(1); });
