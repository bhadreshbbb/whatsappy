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

      res.json({
        visitors:     visitors.length,
        cartEvents:   carts.length,
        recovered:    carts.filter(c=>c.recovered).length,
        messagesSent: execs.filter(e => campaigns.find(c=>c.id===e.campaign_id)).length,
        byDay:     Object.entries(byDayMap).map(([day,visitors])=>({day,visitors})),
        cartByDay: Object.entries(cartByDayMap).map(([day,carts])=>({day,carts})),
        topCities,
        campaignPerf: campaigns.map(c=>({ name:c.name, total_sent:c.total_sent||0, total_recovered:c.total_recovered||0 })),
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
};
