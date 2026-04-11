// ──────────────────────────────────────────────
// Complete in-memory mock data & CRUD store
// v4 - Full-Stack Automation & Real-time Recovery
// ──────────────────────────────────────────────

const LANG_NAMES = { hi: "Hindi", en: "English", gu: "Gujarati", mr: "Marathi", bn: "Bengali", ta: "Tamil", te: "Telugu", ur: "Urdu", ar: "Arabic", "hi-IN": "Hindi", "en-US": "English", "en-GB": "English" };

const cities = [
  { city: 'Mumbai',    country: 'India', code: 'IN', state: 'Maharashtra', lang: 'hi' },
  { city: 'Delhi',     country: 'India', code: 'IN', state: 'Delhi',       lang: 'hi' },
  { city: 'Bangalore', country: 'India', code: 'IN', state: 'Karnataka',   lang: 'en' },
];
const names = ['Priya Sharma','Rahul Patel','Amit Kumar','Sneha Reddy','Vikram Singh'];
const productsList = [
  { name:'Blue Kurti',     price:799,  image:'https://picsum.photos/seed/bluekurti/400/300',    url:'https://shop.example.com/products/blue-kurti'    },
  { name:'Red Saree',      price:2499, image:'https://picsum.photos/seed/redsaree/400/300',     url:'https://shop.example.com/products/red-saree'     },
  { name:'Lehenga Choli',  price:5999, image:'https://picsum.photos/seed/lehenga/400/300',      url:'https://shop.example.com/products/lehenga-choli' },
];

const visitors   = [];
const cartEvents = [];
const campaigns  = [];
const templates  = [];

// ── Seed Templates ──
templates.push(
  { id: 1, name:'Abandoned Cart Recovery', category:'abandoned_cart', language:'en', header_type:'image', header_image_url:'{{product_image}}', body_text:'Hi {{name}}! 👋 You left {{product_name}} in your cart. Shop now before it sells out!', buttons: JSON.stringify([{ type:'url', text:'Complete Purchase', url:'{{cart_url}}' }]) },
  { id: 2, name:'Top Recommendations For You', category:'product_recom', language:'en', body_text:'Hi {{name}}! 🌟 Check out these trending items!', carousel_cards: JSON.stringify([{ image:'https://picsum.photos/seed/bluekurti/400/300', title:'Blue Kurti', url:'/products/blue' }, { image:'https://picsum.photos/seed/redsaree/400/300', title:'Red Saree', url:'/products/red' }]) },
  { id: 3, name:'VIP Purchase Gallery', category:'post_purchase', language:'en', body_text:'Hi {{name}}! 💖 We hope you are loving your new {{product_name}}! Since you have great taste, we thought you might also like these matching arrivals. Which one is your favorite? 👇', carousel_cards: JSON.stringify([{ image:'https://picsum.photos/seed/blue/400/300', title:'Mirror Kurti', url:'{{product_url}}' }, { image:'https://picsum.photos/seed/red/400/300', title:'Silk Saree', url:'{{product_url}}' }, { image:'https://picsum.photos/seed/lehenga/400/300', title:'Royal Lehenga', url:'{{product_url}}' }]) },
  { id: 4, name:'Post-Purchase Thank You', category:'post_purchase', language:'en', body_text:'Hi {{name}}! 💖 Thank you for your recent purchase. Here are some items you might love next!', buttons: JSON.stringify([{ type:'url', text:'Shop New Arrivals', url:'{{product_url}}' }]) }
);

// ── Seed Campaigns ──
// Starting with a clean slate - User will create their own campaigns.
// ──────────────────────────────────────────────────────────────────

// ── Seed Visitors ──
const locations = [
  { city: 'Mumbai',    state: 'Maharashtra', country: 'India', country_code: 'IN', lang: 'hi' },
  { city: 'Delhi',     state: 'Delhi',       country: 'India', country_code: 'IN', lang: 'hi' },
  { city: 'Bangalore', state: 'Karnataka',   country: 'India', country_code: 'IN', lang: 'en' },
  { city: 'Ahmedabad', state: 'Gujarat',     country: 'India', country_code: 'IN', lang: 'gu' },
  { city: 'Chennai',   state: 'Tamil Nadu',  country: 'India', country_code: 'IN', lang: 'ta' },
];

for (let i = 0; i < 40; i++) {
  const loc = locations[i % locations.length];
  const sessId = `sess_${i}`;
  const phone = `91${9000000000 + i}`;
  const firstSeen = new Date(Date.now() - i * 36e5).toISOString();

  visitors.push({
    id: i + 1, channel_id: 'demo', session_id: sessId, phone, name: names[i % 5],
    city: loc.city, state: loc.state, country: loc.country, country_code: loc.country_code, language: loc.lang,
    status: i < 5 ? 'purchased' : 'active',
    visited_at: firstSeen, created_at: firstSeen, page_views: Math.floor(Math.random() * 5) + 1,
    screen_res: '1920x1080', timezone: 'Asia/Kolkata'
  });

  if (i >= 5) {
    const pr = productsList[i % 3];
    cartEvents.push({
      id: i + 1, channel_id: 'demo', session_id: sessId, phone, name: names[i % 5],
      event_type: 'abandoned_cart', cart_id: `cart_${i}`,
      products: JSON.stringify([pr]), total_amount: pr.price,
      product_name: pr.name, product_image: pr.image, product_url: pr.url,
      whatsapp_sent: 0, recovered: 0, created_at: firstSeen
    });
  }
}

// ════════════════ MOCK REQUEST HANDLER ════════════════
export async function mockRequest(path, opts = {}) {
  const method = (opts.method || 'GET').toUpperCase();
  const body = opts.body ? JSON.parse(opts.body) : null;
  const [base, qs] = path.split('?');
  const params = new URLSearchParams(qs || '');
  const seg = base.split('/').filter(Boolean);

  await new Promise(r => setTimeout(r, 80));

  if (base === '/visitors/stats') {
    return { 
      total: visitors.length, 
      active: visitors.filter(v => v.status === 'active').length,
      recovered: cartEvents.filter(c => c.recovered).length,
      totalSent: campaigns.reduce((a,c)=>a+c.total_sent, 0)
    };
  }

  if (base === '/visitors') {
    const s = params.get('status');
    const city = params.get('city');
    const device = params.get('device');
    const srch = params.get('search')?.toLowerCase();
    const hasPhone = params.get('hasPhone') === 'true';

    let res = [...visitors];
    if (s) res = res.filter(v => v.status === s);
    if (city) res = res.filter(v => v.city === city);
    if (device) res = res.filter(v => v.device_type === device);
    if (hasPhone) res = res.filter(v => !!v.phone);
    if (srch) res = res.filter(v => 
      (v.name||'').toLowerCase().includes(srch) || 
      (v.city||'').toLowerCase().includes(srch) || 
      (v.phone||'').includes(srch)
    );
    
    return { visitors: res.slice(0, 50), total: res.length };
  }

  if (base === '/contacts') {
    const lang = params.get('language');
    const srch = params.get('search')?.toLowerCase();
    let res = visitors.filter(v => v.phone); // Only show identified contacts
    if (lang) res = res.filter(v => v.language === lang);
    if (srch) res = res.filter(v => (v.name||'').toLowerCase().includes(srch) || v.phone.includes(srch));
    return { contacts: res.slice(0, 50), total: res.length };
  }

  if (base === '/cart-events') {
    const s = params.get('status');
    let res = [...cartEvents];
    if (s === 'purchased') res = res.filter(c => c.recovered);
    else if (s === 'active') res = res.filter(c => !c.recovered);
    return { events: res.slice(0, 50), total: res.length };
  }

  if (base === '/templates') {
    if (method === 'GET') return templates;
    if (method === 'POST') {
      const t = { ...body, id: templates.length + 1, created_at: new Date().toISOString() };
      templates.push(t); return t;
    }
  }

  if (seg[0] === 'templates' && method === 'DELETE') {
    const idx = templates.findIndex(t => t.id === parseInt(seg[1]));
    if (idx >= 0) templates.splice(idx, 1);
    return { ok: true };
  }

  if (base === '/campaigns') {
    if (method === 'GET') return campaigns;
    if (method === 'POST') {
      const c = { ...body, id: campaigns.length + 1, total_sent: 0, total_recovered: 0, created_at: new Date().toISOString() };
      campaigns.push(c); return c;
    }
  }

  if (seg[0] === 'campaigns' && seg[2] === 'send' && method === 'POST') {
    const cam = campaigns.find(c => c.id === parseInt(seg[1]));
    if (cam) {
      // ── Simulate Recovery (Abandoned -> Purchased) ──
      const targetCarts = cartEvents.filter(c => !c.recovered && (cam.campaign_type === 'abandoned_cart' || cam.campaign_type === 'discount'));
      if (targetCarts.length > 0) {
        const recoverCount = Math.min(3, targetCarts.length);
        for (let i = 0; i < recoverCount; i++) {
           const c = targetCarts[Math.floor(Math.random() * targetCarts.length)];
           c.recovered = 1; c.whatsapp_sent = 1; cam.total_recovered += 1;
           const v = visitors.find(vis => vis.session_id === c.session_id);
           if (v) { v.status = 'purchased'; v.last_purchase_at = new Date().toISOString(); }
        }
      }
      // ── Simulate Post-Purchase Engagement (Purchased -> Repeat) ──
      if (cam.campaign_type === 'post_purchase') {
         const customers = visitors.filter(v => v.status === 'purchased');
         if (customers.length > 0) {
            cam.total_recovered += 1; // Simulate a repeat purchase
         }
      }
      cam.total_sent += 5;
      cam.last_run_at = new Date().toISOString();
    }
    return { ok: true, sent: 5 };
  }

  if (base === '/analytics') {
    const totalVis = visitors.length;
    const recovered = cartEvents.filter(c => c.recovered).length;
    const sent = campaigns.reduce((a,c)=>a+(c.total_sent||0), 0);
    const revenue = cartEvents.filter(c => c.recovered).reduce((a,c)=>a+(c.total_amount||0), 0);
    
    // Group by City for the Top Cities chart
    const cityMap = {};
    visitors.forEach(v => { if(v.city) cityMap[v.city] = (cityMap[v.city]||0)+1; });
    const topCities = Object.entries(cityMap)
      .map(([city, cnt]) => ({ city, cnt }))
      .sort((a,b)=>b.cnt-a.cnt).slice(0, 5);

    return {
      overview: { 
        totalVisitors: totalVis, 
        totalSent: sent, 
        recovered: recovered, 
        recoveryRate: totalVis > 0 ? ((recovered / totalVis) * 100).toFixed(1) : '0', 
        recoveredRevenue: revenue 
      },
      byDay: Array.from({length:7}, (_,i)=>({day:new Date(Date.now()-i*864e5).toLocaleDateString(), visitors: Math.floor(Math.random()*15)+5})).reverse(),
      topCities: topCities.length ? topCities : [{city:'Mumbai', cnt:12}, {city:'Delhi', cnt:8}]
    };
  }

  if (base === '/settings') return { channel_name: 'Mock Shop', whatsapp_phone: '+91 99999 88888' };

  if (base === '/tracking/identify' && method === 'POST') {
    const v = visitors.find(vis => vis.session_id === body.sessionId);
    if (v) { v.name = body.name; v.phone = body.phone; }
    return { ok: true };
  }

  return { error: 'Not found' };
}
