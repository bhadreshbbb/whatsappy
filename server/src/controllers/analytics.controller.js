import { getDb } from '../services/database.js';
import { getLanguageFromGeo } from '../utils/geoLanguage.js';

export const analyticsController = {

  async getDashboard(req, res, next) {
    try {
      const db = getDb();
      const channelId = req.headers['x-channel-id'] || 'demo';
      const visitors  = db.website_visitors.filter(v => v.channel_id === channelId);
      const carts     = db.cart_events.filter(c => c.channel_id === channelId);
      const campaigns = db.abandoned_cart_campaigns.filter(c => c.channel_id === channelId);
      const revenue   = db.purchase_history.filter(p => p.channel_id === channelId);
      const today     = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const thisWeek  = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000);
      const thisMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      res.json({
        visitors: {
          total:      visitors.length,
          today:      visitors.filter(v => new Date(v.visited_at) >= today).length,
          this_week:  visitors.filter(v => new Date(v.visited_at) >= thisWeek).length,
          this_month: visitors.filter(v => new Date(v.visited_at) >= thisMonth).length,
        },
        carts: {
          total:       carts.length,
          abandoned:   carts.filter(c => !c.whatsapp_sent && !c.recovered).length,
          recovered:   carts.filter(c => c.recovered).length,
          recoveryRate: carts.length > 0 ? ((carts.filter(c => c.recovered).length / carts.length) * 100).toFixed(1) : 0,
        },
        campaigns: {
          total:      campaigns.length,
          active:     campaigns.filter(c => c.is_active).length,
          total_sent: campaigns.reduce((a, c) => a + (c.total_sent || 0), 0),
        },
        revenue: {
          recovered: revenue.reduce((a, p) => a + (p.total_amount || 0), 0),
          potential: carts.filter(c => !c.recovered).length * 2000,
        },
      });
    } catch (error) { next(error); }
  },

  // ── Main overview (byDay, cities, campaign perf) ──────────────────────────
  async getAnalytics(req, res, next) {
    try {
      const db        = getDb();
      const channelId = req.headers['x-channel-id'] || 'demo';
      const days      = parseInt(req.query.period) || 7;
      const since     = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const allVisitors = db.website_visitors.filter(v => v.channel_id === channelId);
      const allCarts    = db.cart_events.filter(c => c.channel_id === channelId);
      const campaigns   = db.abandoned_cart_campaigns.filter(c => c.channel_id === channelId);
      const execs       = db.abandoned_cart_executions || [];

      const visitors = allVisitors.filter(v => new Date(v.visited_at) >= since);
      const carts    = allCarts.filter(c => new Date(c.created_at) >= since);

      // byDay
      const byDayMap = {}; const cartByDayMap = {};
      for (let i = 0; i < days; i++) {
        const d = new Date(Date.now() - (days - 1 - i) * 24 * 60 * 60 * 1000);
        const key = d.toISOString().slice(0, 10);
        byDayMap[key] = 0; cartByDayMap[key] = 0;
      }
      visitors.forEach(v => { const k = (v.visited_at||'').slice(0,10); if (k in byDayMap) byDayMap[k]++; });
      carts.forEach(c => { const k = (c.created_at||'').slice(0,10); if (k in cartByDayMap) cartByDayMap[k]++; });

      // Cities
      const cityCount = {};
      allVisitors.forEach(v => { const c = v.city || 'Unknown'; cityCount[c] = (cityCount[c]||0)+1; });
      const topCities = Object.entries(cityCount).map(([city,cnt])=>({city,cnt}))
        .sort((a,b)=>b.cnt-a.cnt).slice(0,10);

      // ── Funnel status breakdown (all-time for channel) ──
      const funnel = {
        active:              allVisitors.filter(v => v.status === 'active').length,
        product_view:        allVisitors.filter(v => v.status === 'product_view').length,
        abandoned_cart:      allVisitors.filter(v => v.status === 'abandoned_cart').length,
        abandoned_checkout:  allVisitors.filter(v => v.status === 'abandoned_checkout').length,
        followup_complete:   allVisitors.filter(v => v.status === 'followup_complete').length,
        purchased:           allVisitors.filter(v => v.status === 'purchased').length,
      };

      res.json({
        visitors:     visitors.length,
        cartEvents:   carts.length,
        recovered:    carts.filter(c=>c.recovered).length,
        messagesSent: execs.filter(e => campaigns.find(c=>c.id===e.campaign_id)).length,
        byDay:     Object.entries(byDayMap).map(([day,visitors])=>({day,visitors})),
        cartByDay: Object.entries(cartByDayMap).map(([day,carts])=>({day,carts})),
        topCities,
        campaignPerf: campaigns.map(c=>({ name:c.name, total_sent:c.total_sent||0, total_recovered:c.total_recovered||0 })),
        funnel,
      });
    } catch (error) { next(error); }
  },

  // ── Page analytics — time on page, scroll depth, bounce rate ─────────────
  async getPageAnalytics(req, res, next) {
    try {
      const db        = getDb();
      const channelId = req.headers['x-channel-id'] || 'demo';
      const days      = parseInt(req.query.days) || 30;
      const since     = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const pageViews = (db.page_views || []).filter(p =>
        p.channel_id === channelId && p.viewed_at >= since
      );

      // Group by URL
      const byUrl = {};
      pageViews.forEach(p => {
        const url = p.url || 'Unknown';
        if (!byUrl[url]) byUrl[url] = { url, title: p.page_title || '', sessions: new Set(), views: 0,
          totalDuration: 0, totalScroll: 0, totalEngagement: 0, exits: 0, scrollCount: 0 };
        byUrl[url].views++;
        byUrl[url].sessions.add(p.session_id);
        byUrl[url].totalDuration    += p.duration_sec    || 0;
        byUrl[url].totalScroll      += p.max_scroll_pct  || 0;
        byUrl[url].totalEngagement  += p.engagement_score|| 0;
        if (p.exit_event) byUrl[url].exits++;
        if ((p.max_scroll_pct || 0) > 0) byUrl[url].scrollCount++;
      });

      const pages = Object.values(byUrl).map(p => ({
        url:              p.url,
        title:            p.title,
        views:            p.views,
        unique_visitors:  p.sessions.size,
        avg_duration_sec: p.views ? Math.round(p.totalDuration / p.views) : 0,
        avg_scroll_pct:   p.views ? Math.round(p.totalScroll   / p.views) : 0,
        avg_engagement:   p.views ? Math.round(p.totalEngagement/p.views) : 0,
        exit_rate:        p.views ? Math.round((p.exits / p.views) * 100) : 0,
        bounce_rate:      p.sessions.size ? Math.round(
          ([...p.sessions].filter(sid =>
            pageViews.filter(pv => pv.session_id === sid).length === 1
          ).length / p.sessions.size) * 100) : 0,
      })).sort((a, b) => b.views - a.views);

      res.json({ pages, total_views: pageViews.length });
    } catch (error) { next(error); }
  },

  // ── City analytics ────────────────────────────────────────────────────────
  async getCityAnalytics(req, res, next) {
    try {
      const db        = getDb();
      const channelId = req.headers['x-channel-id'] || 'demo';
      const days      = parseInt(req.query.days) || 30;
      const since     = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const visitors = (db.website_visitors || []).filter(v =>
        v.channel_id === channelId && v.visited_at >= since
      );

      const byCity = {};
      visitors.forEach(v => {
        const key = `${v.city||'Unknown'}|||${v.state||''}|||${v.country||''}`;
        if (!byCity[key]) byCity[key] = {
          city: v.city||'Unknown', state: v.state||'', country: v.country||'',
          visitors: 0, with_phone: 0, carts: 0, purchases: 0, total_engagement: 0, score_count: 0
        };
        byCity[key].visitors++;
        if (v.phone) byCity[key].with_phone++;
        if (['abandoned_cart','abandoned_checkout','cart_followup_complete'].includes(v.status)) byCity[key].carts++;
        if (v.status === 'purchased') byCity[key].purchases++;
        if (v.engagement_score) { byCity[key].total_engagement += v.engagement_score; byCity[key].score_count++; }
      });

      const cities = Object.values(byCity).map(c => ({
        ...c,
        avg_engagement: c.score_count ? Math.round(c.total_engagement / c.score_count) : 0,
        conversion_rate: c.visitors ? ((c.purchases / c.visitors) * 100).toFixed(1) : 0,
      })).sort((a, b) => b.visitors - a.visitors);

      res.json({ cities });
    } catch (error) { next(error); }
  },

  // ── Contact power scores — ranked by engagement ───────────────────────────
  async getContactPower(req, res, next) {
    try {
      const db        = getDb();
      const channelId = req.headers['x-channel-id'] || 'demo';
      const days      = parseInt(req.query.days) || 30;
      const since     = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const limit     = Math.min(parseInt(req.query.limit) || 50, 200);

      const visitors = (db.website_visitors || []).filter(v =>
        v.channel_id === channelId && v.phone && v.visited_at >= since
      );

      const pageViews = (db.page_views || []).filter(p => p.channel_id === channelId && p.viewed_at >= since);
      const carts     = (db.cart_events || []).filter(c => c.channel_id === channelId);

      const contacts = visitors.map(v => {
        // All page views for this visitor
        const pvs = pageViews.filter(p => p.session_id === v.session_id);
        const avgScroll   = pvs.length ? Math.round(pvs.reduce((s,p)=>s+(p.max_scroll_pct||0),0)/pvs.length) : 0;
        const totalTime   = pvs.reduce((s,p)=>s+(p.duration_sec||0),0) + (v.total_time_sec||0);
        const avgEngage   = v.engagement_score || (pvs.length ? Math.round(pvs.reduce((s,p)=>s+(p.engagement_score||0),0)/pvs.length) : 0);
        const cartCount   = carts.filter(c=>(c.session_id===v.session_id||(v.phone&&c.phone===v.phone))).length;
        const pageCount   = v.total_page_views || pvs.length;

        // Power score (0–100):
        // engagement (40%) + cart intent (25%) + time on site (20%) + pages visited (15%)
        const engScore    = Math.min(avgEngage, 100) * 0.40;
        const cartScore   = Math.min(cartCount * 25, 100) * 0.25;
        const timeScore   = Math.min(totalTime / 3, 100) * 0.20;   // 300s = max
        const pageScore   = Math.min(pageCount * 10, 100) * 0.15;  // 10 pages = max
        const powerScore  = Math.round(engScore + cartScore + timeScore + pageScore);

        return {
          phone:          v.phone,
          name:           v.name || '',
          city:           v.city || '',
          state:          v.state || '',
          device:         v.device_type || '',
          language:       v.language || '',
          status:         v.status || 'active',
          power_score:    powerScore,
          engagement_score: avgEngage,
          avg_scroll_pct: avgScroll,
          total_time_sec: totalTime,
          page_views:     pageCount,
          cart_events:    cartCount,
          last_seen:      v.visited_at,
          top_pages:      pvs.sort((a,b)=>b.engagement_score-a.engagement_score).slice(0,3).map(p=>({ url:p.url, title:p.page_title, score:p.engagement_score })),
        };
      });

      // Sort by power score desc
      contacts.sort((a, b) => b.power_score - a.power_score);

      res.json({ contacts: contacts.slice(0, limit), total: contacts.length });
    } catch (error) { next(error); }
  },

  // ── Device / OS / Browser breakdown ─────────────────────────────────────
  async getDeviceBreakdown(req, res, next) {
    try {
      const db        = getDb();
      const channelId = req.headers['x-channel-id'] || 'demo';
      const days      = parseInt(req.query.days) || 30;
      const since     = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const visitors = (db.website_visitors || []).filter(v =>
        v.channel_id === channelId && v.visited_at >= since
      );

      const count = (arr, key) => {
        const m = {};
        arr.forEach(v => { const k = v[key] || 'Unknown'; m[k] = (m[k]||0)+1; });
        return Object.entries(m).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);
      };

      res.json({
        devices:  count(visitors, 'device_type'),
        browsers: count(visitors, 'browser'),
        os:       count(visitors, 'os'),
        languages: count(visitors, 'language'),
      });
    } catch (error) { next(error); }
  },

  // ── Scroll / engagement heatmap by page ──────────────────────────────────
  async getEngagementStats(req, res, next) {
    try {
      const db        = getDb();
      const channelId = req.headers['x-channel-id'] || 'demo';
      const days      = parseInt(req.query.days) || 7;
      const since     = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const pvs = (db.page_views || []).filter(p =>
        p.channel_id === channelId && p.viewed_at >= since && p.duration_sec > 0
      );

      // Overall stats
      const totalViews  = pvs.length;
      const avgDuration = totalViews ? Math.round(pvs.reduce((s,p)=>s+(p.duration_sec||0),0)/totalViews) : 0;
      const avgScroll   = totalViews ? Math.round(pvs.reduce((s,p)=>s+(p.max_scroll_pct||0),0)/totalViews) : 0;
      const avgEngage   = totalViews ? Math.round(pvs.reduce((s,p)=>s+(p.engagement_score||0),0)/totalViews) : 0;

      // Scroll depth buckets: 0-25, 25-50, 50-75, 75-100
      const buckets = { '0–25%': 0, '25–50%': 0, '50–75%': 0, '75–100%': 0 };
      pvs.forEach(p => {
        const s = p.max_scroll_pct || 0;
        if (s <= 25)      buckets['0–25%']++;
        else if (s <= 50) buckets['25–50%']++;
        else if (s <= 75) buckets['50–75%']++;
        else              buckets['75–100%']++;
      });
      const scrollBuckets = Object.entries(buckets).map(([range,count])=>({ range, count, pct: totalViews ? Math.round(count/totalViews*100) : 0 }));

      // Engagement score distribution
      const engBuckets = { '0–20 Cold': 0, '21–40 Low': 0, '41–60 Medium': 0, '61–80 High': 0, '81–100 Hot': 0 };
      pvs.forEach(p => {
        const e = p.engagement_score || 0;
        if (e <= 20)      engBuckets['0–20 Cold']++;
        else if (e <= 40) engBuckets['21–40 Low']++;
        else if (e <= 60) engBuckets['41–60 Medium']++;
        else if (e <= 80) engBuckets['61–80 High']++;
        else              engBuckets['81–100 Hot']++;
      });
      const engDistribution = Object.entries(engBuckets).map(([label,count])=>({ label, count }));

      // Duration buckets
      const durBuckets = { '<10s Bounce': 0, '10–30s': 0, '30–60s': 0, '1–3min': 0, '3min+ Deep': 0 };
      pvs.forEach(p => {
        const d = p.duration_sec || 0;
        if (d < 10)       durBuckets['<10s Bounce']++;
        else if (d < 30)  durBuckets['10–30s']++;
        else if (d < 60)  durBuckets['30–60s']++;
        else if (d < 180) durBuckets['1–3min']++;
        else              durBuckets['3min+ Deep']++;
      });
      const durationBuckets = Object.entries(durBuckets).map(([label,count])=>({ label, count }));

      res.json({ totalViews, avgDuration, avgScroll, avgEngage, scrollBuckets, engDistribution, durationBuckets });
    } catch (error) { next(error); }
  },

  // ── Top-language helper ────────────────────────────────────────────────────
  async getTopLanguage(req, res, next) {
    try {
      const db        = getDb();
      const channelId = req.headers['x-channel-id'] || 'demo';
      const visitors  = db.website_visitors.filter(v => v.channel_id === channelId);
      const counts    = {};
      for (const v of visitors) {
        const lang = v.language || getLanguageFromGeo(v.city, v.state, v.country_code);
        counts[lang] = (counts[lang]||0) + 1;
      }
      const breakdown = Object.entries(counts).map(([lang,count])=>({lang,count})).sort((a,b)=>b.count-a.count);
      res.json({ topLang: breakdown[0]?.lang || 'en', total: visitors.length, breakdown });
    } catch (error) { next(error); }
  },

  // ── Brand Intelligence ─────────────────────────────────────────────────────
  // Deep analytics: peak hours heatmap, conversion funnel, audience segments,
  // product intelligence, Meta ad scheduling recommendations
  async getBrandIntel(req, res, next) {
    try {
      const db        = getDb();
      const channelId = req.headers['x-channel-id'] || 'demo';
      const days      = parseInt(req.query.days) || 30;
      const since     = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const visitors  = (db.website_visitors  || []).filter(v => v.channel_id === channelId);
      const visRecent = visitors.filter(v => v.visited_at >= since);
      const carts     = (db.cart_events       || []).filter(c => c.channel_id === channelId);
      const cartsR    = carts.filter(c => c.created_at >= since);
      const pvs       = (db.product_views     || []).filter(p => p.channel_id === channelId && p.created_at >= since);
      const purchases = (db.purchase_history  || []).filter(p => p.channel_id === channelId && p.purchased_at >= since);
      const pageViews = (db.page_views        || []).filter(p => p.channel_id === channelId && p.viewed_at >= since);
      const execs     = (db.abandoned_cart_executions || []);

      const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      const HOUR_LABELS = Array.from({length:24},(_,i)=> i===0?'12am': i<12?`${i}am`: i===12?'12pm':`${i-12}pm`);

      // ── 1. Hourly activity heatmap (visitors + cart events combined) ──────
      // Grid: hour(0-23) × day(0-6 Sun-Sat) → intensity count
      const heatmap = Array.from({length:24}, () => Array(7).fill(0));
      const hourTotals = Array(24).fill(0);
      const dayTotals  = Array(7).fill(0);

      [...visRecent, ...cartsR].forEach(e => {
        const dt = new Date(e.visited_at || e.created_at);
        if (isNaN(dt)) return;
        const h = dt.getHours();
        const d = dt.getDay();
        heatmap[h][d]++;
        hourTotals[h]++;
        dayTotals[d]++;
      });

      // Find peak hours (top 5 by total activity)
      const sortedHours = hourTotals
        .map((count, h) => ({ h, count }))
        .sort((a, b) => b.count - a.count);

      const peakHours = sortedHours.slice(0, 5).map(({ h, count }) => {
        // Ad recommendation based on hour
        const rec =
          h >= 20 || h <= 2  ? 'Evening prime time — highest purchase intent' :
          h >= 12 && h <= 14 ? 'Lunch break — high mobile browsing' :
          h >= 7  && h <= 9  ? 'Morning commute — great for awareness ads' :
          h >= 15 && h <= 18 ? 'After work — strong engagement window' :
          'Off-peak — lower CPM, good for retargeting';
        return { hour: h, label: HOUR_LABELS[h], count, recommendation: rec };
      });

      // Best days to run ads
      const sortedDays = dayTotals
        .map((count, d) => ({ day: DAY_NAMES[d], count, index: d }))
        .sort((a, b) => b.count - a.count);

      // Build heatmap rows for frontend
      const heatmapRows = Array.from({length:24}, (_, h) => ({
        hour:  HOUR_LABELS[h],
        hourNum: h,
        total: hourTotals[h],
        days:  DAY_NAMES.map((day, d) => ({ day, count: heatmap[h][d] })),
      }));

      // ── 2. Conversion funnel ──────────────────────────────────────────────
      const totalVisitors  = visRecent.length;
      const totalPVs       = new Set(pvs.map(p => p.session_id)).size;
      const totalCarts     = new Set(cartsR.map(c => c.session_id)).size;
      const totalCheckouts = visRecent.filter(v => v.status === 'abandoned_checkout').length;
      const totalPurchases = purchases.length;
      const totalMessages  = execs.filter(e => {
        const ts = e.sent_at || '';
        return ts >= since;
      }).length;

      const funnel = [
        { stage: 'Visitors',      count: totalVisitors,  icon: 'users',   color: '#3b82f6' },
        { stage: 'Product Views', count: totalPVs,       icon: 'eye',     color: '#8b5cf6' },
        { stage: 'Add to Cart',   count: totalCarts,     icon: 'cart',    color: '#f97316' },
        { stage: 'Checkout',      count: totalCheckouts, icon: 'checkout',color: '#ec4899' },
        { stage: 'Purchased',     count: totalPurchases, icon: 'check',   color: '#22c55e' },
        { stage: 'WA Messages',   count: totalMessages,  icon: 'msg',     color: '#25d366' },
      ].map((s, i, arr) => ({
        ...s,
        drop_pct: i === 0 || !arr[i-1].count ? 0
          : Math.round((1 - s.count / arr[i-1].count) * 100),
        conv_pct: totalVisitors > 0 ? Math.round(s.count / totalVisitors * 100) : 0,
      }));

      // ── 3. Audience segments (Meta-ready) ─────────────────────────────────
      const hotBuyers       = visitors.filter(v => v.status === 'purchased').length;
      const cartAbandon     = visitors.filter(v => v.status === 'abandoned_cart' || v.status === 'abandoned_checkout').length;
      const productBrowsers = visitors.filter(v => v.status === 'product_view').length;
      const coldVisitors    = visitors.filter(v => v.status === 'active').length;
      const withPhone       = visitors.filter(v => v.phone).length;
      const highEngagement  = visitors.filter(v => (v.engagement_score || 0) >= 60).length;

      const segments = [
        {
          name: 'Purchasers', size: hotBuyers, color: '#22c55e', heat: 'Hot',
          description: 'Users who completed a purchase. Best for upsell & loyalty ads.',
          meta_objective: 'CONVERSIONS', meta_audience: 'Customer List Upload',
          cpm_estimate: '₹45–80', roas_potential: '4–8x',
          ad_copy_hint: 'Show complementary products to what they bought',
        },
        {
          name: 'Cart Abandoners', size: cartAbandon, color: '#f97316', heat: 'Hot',
          description: 'Added to cart but didn\'t buy. Highest conversion potential.',
          meta_objective: 'CONVERSIONS', meta_audience: 'Custom Audience — Cart Events',
          cpm_estimate: '₹60–100', roas_potential: '3–6x',
          ad_copy_hint: 'Urgency messaging: "Your cart is waiting" + discount offer',
        },
        {
          name: 'High Engagement', size: highEngagement, color: '#a855f7', heat: 'Warm',
          description: 'Engagement score ≥ 60. Deep readers, high brand interest.',
          meta_objective: 'TRAFFIC', meta_audience: 'Custom Audience — Website Visitors',
          cpm_estimate: '₹30–55', roas_potential: '2–4x',
          ad_copy_hint: 'Feature the exact pages/categories they spent time on',
        },
        {
          name: 'Product Browsers', size: productBrowsers, color: '#3b82f6', heat: 'Warm',
          description: 'Viewed product pages but didn\'t add to cart.',
          meta_objective: 'CATALOG_SALES', meta_audience: 'Dynamic Product Ads',
          cpm_estimate: '₹25–50', roas_potential: '2–3x',
          ad_copy_hint: 'Retarget with exact product they viewed + "Others also bought"',
        },
        {
          name: 'Identified (Phone)', size: withPhone, color: '#14b8a6', heat: 'Warm',
          description: 'Visitors who gave their phone number.',
          meta_objective: 'REACH', meta_audience: 'Customer List — Phone Upload',
          cpm_estimate: '₹20–40', roas_potential: '1.5–3x',
          ad_copy_hint: 'Sync phone list to Meta — high match rate for Indian numbers',
        },
        {
          name: 'Cold Visitors', size: coldVisitors, color: '#64748b', heat: 'Cold',
          description: 'Visited home/listing pages only, low engagement.',
          meta_objective: 'AWARENESS', meta_audience: 'Lookalike Audience',
          cpm_estimate: '₹10–25', roas_potential: '0.5–1.5x',
          ad_copy_hint: 'Brand awareness creative, not conversion. Build trust first.',
        },
      ];

      // ── 4. Product intelligence ───────────────────────────────────────────
      const productMap = {};
      pvs.forEach(p => {
        const key = p.product_name || p.product_url || 'Unknown';
        if (!productMap[key]) productMap[key] = {
          name: key, url: p.product_url||'', image: p.product_image||'',
          price: p.product_price||'', views: 0, carts: 0, purchases: 0,
          revenue: 0, sessions: new Set(),
        };
        productMap[key].views++;
        productMap[key].sessions.add(p.session_id);
      });
      cartsR.forEach(c => {
        const key = c.product_name || c.product_url || 'Unknown';
        if (productMap[key]) {
          productMap[key].carts++;
          productMap[key].revenue += Number(c.total_amount || 0);
        }
      });
      const topProducts = Object.values(productMap)
        .map(p => ({
          ...p,
          sessions: p.sessions.size,
          cart_rate: p.views > 0 ? Math.round(p.carts / p.views * 100) : 0,
          // Hot score: views×1 + carts×3 + revenue/1000
          hot_score: p.views + p.carts * 3 + Math.floor(p.revenue / 1000),
        }))
        .sort((a, b) => b.hot_score - a.hot_score)
        .slice(0, 10);

      // ── 5. Day-of-week trend (last N days) ────────────────────────────────
      const dayOfWeekData = DAY_NAMES.map((day, i) => ({
        day,
        visitors: visRecent.filter(v => new Date(v.visited_at).getDay() === i).length,
        carts:    cartsR.filter(c => new Date(c.created_at).getDay() === i).length,
      }));

      // ── 6. Hourly chart (collapsed across days) ───────────────────────────
      const hourlyChart = HOUR_LABELS.map((label, h) => ({
        label,
        h,
        activity: hourTotals[h],
      }));

      // ── 7. Returning vs new visitors ─────────────────────────────────────
      const sessionsByPhone = {};
      visitors.forEach(v => {
        if (v.phone) sessionsByPhone[v.phone] = (sessionsByPhone[v.phone]||0) + 1;
      });
      const returningCount = Object.values(sessionsByPhone).filter(c => c > 1).length;
      const newCount       = visitors.length - returningCount;

      // ── 8. Revenue intelligence ───────────────────────────────────────────
      const totalRevenue    = purchases.reduce((s, p) => s + Number(p.total_amount || 0), 0);
      const potentialRevenue= cartAbandon * (totalRevenue / Math.max(totalPurchases, 1) || 2000);
      const recoveredCarts  = carts.filter(c => c.recovered && c.created_at >= since).length;
      const avgOrderValue   = totalPurchases > 0 ? Math.round(totalRevenue / totalPurchases) : 0;

      // ── 9. Meta ads scheduling recommendation ─────────────────────────────
      const top3Hours = sortedHours.slice(0, 3).map(x => HOUR_LABELS[x.h]).join(', ');
      const top2Days  = sortedDays.slice(0, 2).map(x => x.day).join(' & ');
      const topCity   = Object.entries(
        visRecent.reduce((acc, v) => { const c = v.city||'Unknown'; acc[c]=(acc[c]||0)+1; return acc; }, {})
      ).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'your top city';

      const adRecommendations = [
        {
          type: 'timing',
          icon: 'clock',
          title: 'Best Ad Schedule',
          insight: `Peak activity is at ${top3Hours}`,
          action: `Schedule Meta ads to run ${top3Hours} for maximum impressions when your audience is active`,
          priority: 'HIGH',
        },
        {
          type: 'day',
          icon: 'calendar',
          title: 'Best Days',
          insight: `${top2Days} drive the most traffic`,
          action: `Increase ad budget by 30% on ${top2Days}. Reduce budget on lowest-traffic days to save spend`,
          priority: 'HIGH',
        },
        {
          type: 'retargeting',
          icon: 'target',
          title: 'Retarget Cart Abandoners',
          insight: `${cartAbandon} users abandoned their cart`,
          action: `Upload cart abandoner list to Meta → run Dynamic Product Ads with 10–15% discount for 3 days`,
          priority: 'HIGH',
        },
        {
          type: 'geo',
          icon: 'map',
          title: 'Geo Targeting',
          insight: `${topCity} has your highest visitor concentration`,
          action: `Pin Meta ad targeting to your top 5 cities. Avoid national targeting — it wastes budget on low-intent users`,
          priority: 'MEDIUM',
        },
        {
          type: 'lookalike',
          icon: 'users',
          title: 'Lookalike Audience',
          insight: `${hotBuyers} purchasers in your data`,
          action: `Upload purchaser phone list to Meta → create 1% Lookalike Audience → run acquisition campaign`,
          priority: 'MEDIUM',
        },
        {
          type: 'creative',
          icon: 'image',
          title: 'Creative Strategy',
          insight: topProducts[0] ? `"${topProducts[0].name}" is your hottest product` : 'Analyse top products',
          action: topProducts[0]
            ? `Feature "${topProducts[0].name}" in carousel ads — it has the highest view-to-cart rate`
            : 'Track product views to identify best-performing ad creatives',
          priority: 'MEDIUM',
        },
        {
          type: 'device',
          icon: 'mobile',
          title: 'Mobile-First Creative',
          insight: `${Math.round(visitors.filter(v=>v.device_type==='mobile').length / Math.max(visitors.length,1) * 100)}% of visitors are on mobile`,
          action: `Design 9:16 vertical video ads for Stories/Reels. Mobile users convert faster on simple, fast-loading creatives`,
          priority: 'LOW',
        },
        {
          type: 'frequency',
          icon: 'repeat',
          title: 'Ad Frequency Cap',
          insight: `Returning visitor rate: ${visitors.length > 0 ? Math.round(returningCount/visitors.length*100) : 0}%`,
          action: `Set Meta frequency cap to 3 impressions/week for retargeting. Above 4 impressions leads to ad fatigue and negative brand sentiment`,
          priority: 'LOW',
        },
      ];

      res.json({
        summary: {
          totalVisitors: visRecent.length,
          withPhone,
          cartAbandon,
          purchased: hotBuyers,
          avgOrderValue,
          totalRevenue,
          potentialRevenue: Math.round(potentialRevenue),
          returningVisitors: returningCount,
          newVisitors: newCount,
          returnRate: visitors.length > 0 ? Math.round(returningCount / visitors.length * 100) : 0,
        },
        heatmapRows,
        peakHours,
        sortedDays: sortedDays.map(d => ({ ...d, pct: visRecent.length > 0 ? Math.round(d.count / visRecent.length * 100) : 0 })),
        hourlyChart,
        dayOfWeekData,
        funnel,
        segments,
        topProducts,
        adRecommendations,
      });
    } catch (error) { next(error); }
  },
};
