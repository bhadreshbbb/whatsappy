-- ============================================================
-- WhatsCart Pro - Ecommerce Tracking & Automation Tables
-- ============================================================

-- Website Visitors Tracking
CREATE TABLE IF NOT EXISTS website_visitors (
  id VARCHAR PRIMARY KEY,
  channel_id VARCHAR NOT NULL,
  session_id VARCHAR(128) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(255),
  name VARCHAR(255),
  ip_address VARCHAR(45),
  country VARCHAR(100),
  country_code VARCHAR(5),
  state VARCHAR(100),
  city VARCHAR(100),
  timezone VARCHAR(64),
  language VARCHAR(20),
  page_url TEXT,
  page_title VARCHAR(500),
  referrer TEXT,
  user_agent TEXT,
  device_type VARCHAR(30),
  metadata JSONB DEFAULT '{}',
  visited_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(channel_id, session_id)
);

CREATE INDEX IF NOT EXISTS wv_channel_idx ON website_visitors(channel_id);
CREATE INDEX IF NOT EXISTS wv_phone_idx ON website_visitors(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS wv_session_idx ON website_visitors(session_id);
CREATE INDEX IF NOT EXISTS wv_visited_at_idx ON website_visitors(visited_at DESC);
CREATE INDEX IF NOT EXISTS wv_city_idx ON website_visitors(city) WHERE city IS NOT NULL;
CREATE INDEX IF NOT EXISTS wv_language_idx ON website_visitors(language) WHERE language IS NOT NULL;

-- Cart Events (Add to cart, checkout, abandoned)
CREATE TABLE IF NOT EXISTS cart_events (
  id VARCHAR PRIMARY KEY,
  channel_id VARCHAR NOT NULL,
  session_id VARCHAR(128),
  phone VARCHAR(20),
  email VARCHAR(255),
  name VARCHAR(255),
  event_type VARCHAR(30) NOT NULL,
  cart_id VARCHAR(128),
  order_id VARCHAR(128),
  currency VARCHAR(10) DEFAULT 'INR',
  total_amount NUMERIC(12,2),
  products JSONB DEFAULT '[]',
  quantity INTEGER DEFAULT 0,
  ip_address VARCHAR(45),
  country VARCHAR(100),
  country_code VARCHAR(5),
  state VARCHAR(100),
  city VARCHAR(100),
  language VARCHAR(20),
  timezone VARCHAR(64),
  whatsapp_sent BOOLEAN DEFAULT FALSE,
  whatsapp_sent_at TIMESTAMP,
  campaign_id VARCHAR,
  recovered BOOLEAN DEFAULT FALSE,
  recovered_at TIMESTAMP,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ce_channel_idx ON cart_events(channel_id);
CREATE INDEX IF NOT EXISTS ce_phone_idx ON cart_events(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS ce_event_type_idx ON cart_events(event_type);
CREATE INDEX IF NOT EXISTS ce_session_idx ON cart_events(session_id);
CREATE INDEX IF NOT EXISTS ce_cart_id_idx ON cart_events(cart_id);
CREATE INDEX IF NOT EXISTS ce_created_at_idx ON cart_events(created_at DESC);
CREATE INDEX IF NOT EXISTS ce_abandoned_idx ON cart_events(channel_id, event_type, whatsapp_sent, recovered) 
  WHERE event_type IN ('add_to_cart', 'checkout_started');

-- Purchase History
CREATE TABLE IF NOT EXISTS purchase_history (
  id VARCHAR PRIMARY KEY,
  channel_id VARCHAR NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(255),
  name VARCHAR(255),
  order_id VARCHAR(128) NOT NULL,
  currency VARCHAR(10) DEFAULT 'INR',
  total_amount NUMERIC(12,2),
  products JSONB DEFAULT '[]',
  ip_address VARCHAR(45),
  country VARCHAR(100),
  city VARCHAR(100),
  language VARCHAR(20),
  whatsapp_sent BOOLEAN DEFAULT FALSE,
  whatsapp_sent_at TIMESTAMP,
  metadata JSONB DEFAULT '{}',
  purchased_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(channel_id, order_id)
);

CREATE INDEX IF NOT EXISTS ph_channel_idx ON purchase_history(channel_id);
CREATE INDEX IF NOT EXISTS ph_phone_idx ON purchase_history(phone);
CREATE INDEX IF NOT EXISTS ph_purchased_at_idx ON purchase_history(purchased_at DESC);

-- Page Views
CREATE TABLE IF NOT EXISTS page_views (
  id VARCHAR PRIMARY KEY,
  channel_id VARCHAR NOT NULL,
  session_id VARCHAR(128) NOT NULL,
  url TEXT NOT NULL,
  page_title VARCHAR(500),
  viewed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pv_session_idx ON page_views(session_id);
CREATE INDEX IF NOT EXISTS pv_viewed_at_idx ON page_views(viewed_at DESC);

-- Product Views
CREATE TABLE IF NOT EXISTS product_views (
  id VARCHAR PRIMARY KEY,
  channel_id VARCHAR NOT NULL,
  session_id VARCHAR(128) NOT NULL,
  product JSONB NOT NULL,
  event_type VARCHAR(50) DEFAULT 'product_viewed',
  viewed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pv_session_idx ON product_views(session_id);

-- Searches
CREATE TABLE IF NOT EXISTS searches (
  id VARCHAR PRIMARY KEY,
  channel_id VARCHAR NOT NULL,
  session_id VARCHAR(128) NOT NULL,
  query VARCHAR(500) NOT NULL,
  results_count INTEGER DEFAULT 0,
  filters JSONB DEFAULT '{}',
  searched_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS s_session_idx ON searches(session_id);
CREATE INDEX IF NOT EXISTS s_searched_at_idx ON searches(searched_at DESC);

-- Custom Events
CREATE TABLE IF NOT EXISTS custom_events (
  id VARCHAR PRIMARY KEY,
  channel_id VARCHAR NOT NULL,
  session_id VARCHAR(128),
  event_name VARCHAR(100) NOT NULL,
  properties JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ce_event_name_idx ON custom_events(event_name);
CREATE INDEX IF NOT EXISTS ce_created_at_idx ON custom_events(created_at DESC);

-- Campaign Templates
CREATE TABLE IF NOT EXISTS message_templates (
  id VARCHAR PRIMARY KEY,
  channel_id VARCHAR NOT NULL,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(50) DEFAULT 'custom',
  language VARCHAR(20) DEFAULT 'en',
  components JSONB DEFAULT '[]',
  variables JSONB DEFAULT '[]',
  preview TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mt_channel_idx ON message_templates(channel_id);
CREATE INDEX IF NOT EXISTS mt_category_idx ON message_templates(category);
CREATE INDEX IF NOT EXISTS mt_language_idx ON message_templates(language);

-- Abandoned Cart Campaigns
CREATE TABLE IF NOT EXISTS abandoned_cart_campaigns (
  id VARCHAR PRIMARY KEY,
  channel_id VARCHAR NOT NULL,
  created_by VARCHAR,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  campaign_type VARCHAR(50) DEFAULT 'abandoned_cart',
  target_segment VARCHAR(50) DEFAULT 'all',
  filters JSONB DEFAULT '{}',
  schedule_type VARCHAR(20) DEFAULT 'immediate',
  delay_hours INTEGER DEFAULT 1,
  scheduled_at TIMESTAMP,
  cron_expression VARCHAR(100),
  template_id VARCHAR,
  template_name VARCHAR,
  template_language VARCHAR(20),
  template_components JSONB DEFAULT '[]',
  include_product_recommendation BOOLEAN DEFAULT TRUE,
  max_products INTEGER DEFAULT 3,
  is_active BOOLEAN DEFAULT TRUE,
  status VARCHAR(20) DEFAULT 'draft',
  last_run_at TIMESTAMP,
  next_run_at TIMESTAMP,
  total_sent INTEGER DEFAULT 0,
  total_delivered INTEGER DEFAULT 0,
  total_read INTEGER DEFAULT 0,
  total_clicked INTEGER DEFAULT 0,
  total_converted INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS acc_channel_idx ON abandoned_cart_campaigns(channel_id);
CREATE INDEX IF NOT EXISTS acc_type_idx ON abandoned_cart_campaigns(campaign_type);
CREATE INDEX IF NOT EXISTS acc_status_idx ON abandoned_cart_campaigns(status);
CREATE INDEX IF NOT EXISTS acc_active_idx ON abandoned_cart_campaigns(is_active) WHERE is_active = TRUE;

-- Campaign Executions
CREATE TABLE IF NOT EXISTS abandoned_cart_executions (
  id VARCHAR PRIMARY KEY,
  campaign_id VARCHAR NOT NULL,
  cart_event_id VARCHAR,
  phone VARCHAR(20) NOT NULL,
  name VARCHAR(255),
  email VARCHAR(255),
  language VARCHAR(20),
  country VARCHAR(100),
  state VARCHAR(100),
  city VARCHAR(100),
  products JSONB DEFAULT '[]',
  total_amount NUMERIC(12,2),
  whatsapp_message_id VARCHAR,
  status VARCHAR(30) DEFAULT 'pending',
  error_message TEXT,
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  read_at TIMESTAMP,
  clicked_at TIMESTAMP,
  recovered_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ace_campaign_idx ON abandoned_cart_executions(campaign_id);
CREATE INDEX IF NOT EXISTS ace_phone_idx ON abandoned_cart_executions(phone);
CREATE INDEX IF NOT EXISTS ace_status_idx ON abandoned_cart_executions(status);
CREATE INDEX IF NOT EXISTS ace_sent_at_idx ON abandoned_cart_executions(sent_at DESC);

-- User Sessions
CREATE TABLE IF NOT EXISTS user_sessions (
  id VARCHAR PRIMARY KEY,
  channel_id VARCHAR NOT NULL,
  session_id VARCHAR(128) NOT NULL,
  user_id VARCHAR,
  phone VARCHAR(20),
  email VARCHAR(255),
  started_at TIMESTAMP DEFAULT NOW(),
  last_activity_at TIMESTAMP DEFAULT NOW(),
  events_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS us_session_idx ON user_sessions(session_id);
CREATE INDEX IF NOT EXISTS us_user_idx ON user_sessions(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS us_last_activity_idx ON user_sessions(last_activity_at DESC);

-- Settings
CREATE TABLE IF NOT EXISTS channel_settings (
  channel_id VARCHAR PRIMARY KEY,
  settings JSONB DEFAULT '{}',
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default settings
INSERT INTO channel_settings (channel_id, settings) 
VALUES ('demo', '{
  "storeName": "My Ecommerce Store",
  "storeUrl": "https://mystore.com",
  "timezone": "Asia/Kolkata",
  "currency": "INR",
  "abandonedCartHours": 1,
  "maxRetries": 3,
  "autoDetect": true,
  "whatsappBusinessId": "",
  "whatsappPhone": ""
}')
ON CONFLICT (channel_id) DO NOTHING;

-- Seed default templates
INSERT INTO message_templates (id, channel_id, name, category, language, components, variables, preview)
VALUES 
  ('tpl_hi_cart', 'demo', 'Cart Recovery - Hindi', 'abandoned_cart', 'hi',
   '[{"type": "body", "text": "नमस्ते {{customer_name}}! 👋\n\nआपका कार्ट अभी भी रुका हुआ है। आपने चुना:\n\n{{product_list}}\n\n💰 कुल: ₹{{total_amount}}\n\n🛒 अपना कार्ट पूरा करें और ₹{{discount}} की बचत करें!"}]',
   '["customer_name", "product_list", "total_amount", "discount"]',
   'नमस्ते Rahul! आपका कार्ट अभी भी रुका हुआ है...'),
  
  ('tpl_en_cart', 'demo', 'Cart Recovery - English', 'abandoned_cart', 'en',
   '[{"type": "body", "text": "Hi {{customer_name}}! 👋\n\nYour cart is waiting for you:\n\n{{product_list}}\n\n💰 Total: ₹{{total_amount}}\n\n🛒 Complete your purchase and save ₹{{discount}}!"}]',
   '["customer_name", "product_list", "total_amount", "discount"]',
   'Hi! Your cart is waiting for you...'),
  
  ('tpl_ta_cart', 'demo', 'Cart Recovery - Tamil', 'abandoned_cart', 'ta',
   '[{"type": "body", "text": "வணக்கம் {{customer_name}}! 🙏\n\nஉங்கள் கார்ட் உங்களைக் காத்திருக்கிறது:\n\n{{product_list}}\n\n💰 மொத்தம்: ₹{{total_amount}}\n\n🛒 உங்கள் வாங்குதலை முடிக்கவும்!"}]',
   '["customer_name", "product_list", "total_amount"]',
   'வணக்கம்! உங்கள் கார்ட் உங்களைக் காத்திருக்கிறது...'),
  
  ('tpl_te_cart', 'demo', 'Cart Recovery - Telugu', 'abandoned_cart', 'te',
   '[{"type": "body", "text": "స్వాగతం {{customer_name}}! 👋\n\nమీ కార్ట్ మీ కోసం వేచి ఉంది:\n\n{{product_list}}\n\n💰 మొత్తం: ₹{{total_amount}}\n\n🛒 మీ కొనుగోలును పూర్తి చేయండి!"}]',
   '["customer_name", "product_list", "total_amount"]',
   'స్వాగతం! మీ కార్ట్ మీ కోసం వేచి ఉంది...'),
  
  ('tpl_en_welcome', 'demo', 'Welcome - English', 'welcome', 'en',
   '[{"type": "body", "text": "Welcome {{customer_name}}! 🎉\n\nThank you for visiting us!\n\n🌟 Check out our latest products:\n\n{{product_list}}\n\nUse code WELCOME10 for 10% off!"}]',
   '["customer_name", "product_list"]',
   'Welcome! Thank you for visiting us!'),
  
  ('tpl_en_winback', 'demo', 'Win Back - English', 'win_back', 'en',
   '[{"type": "body", "text": "Hi {{customer_name}}! 💝\n\nWe miss you!\n\nIt''s been {{days_since}} days since your last visit.\n\n🎁 Here''s a special offer just for you:\n\n{{offer_details}}"}]',
   '["customer_name", "days_since", "offer_details"]',
   'We miss you! Here''s a special offer...')
ON CONFLICT DO NOTHING;

-- Seed default campaigns
INSERT INTO abandoned_cart_campaigns (id, channel_id, name, description, campaign_type, schedule_type, delay_hours, is_active, template_id, template_name, template_language)
VALUES
  ('camp_1h', 'demo', '1 Hour Reminder', 'Send reminder 1 hour after cart abandonment', 'abandoned_cart', 'delayed', 1, true, 'tpl_en_cart', 'Cart Recovery - English', 'en'),
  ('camp_24h', 'demo', '24 Hour Reminder', 'Final recovery attempt after 24 hours', 'abandoned_cart', 'delayed', 24, true, 'tpl_hi_cart', 'Cart Recovery - Hindi', 'hi'),
  ('camp_72h', 'demo', '72 Hour Final Nudge', 'Last chance recovery after 3 days', 'abandoned_cart', 'delayed', 72, true, 'tpl_en_cart', 'Cart Recovery - English', 'en')
ON CONFLICT DO NOTHING;
