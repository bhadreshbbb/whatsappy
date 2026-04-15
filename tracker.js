!function() {
  var config = window.WhatswayConfig || {};
  var baseUrl = config.baseUrl || '';

  // ── Session ──────────────────────────────────────────────────────────────────
  var sessionId = sessionStorage.getItem('ww_session');
  if (!sessionId) {
    sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
    sessionStorage.setItem('ww_session', sessionId);
  }

  // ── Device detection ─────────────────────────────────────────────────────────
  function getDeviceType() {
    var ua = navigator.userAgent;
    if (/tablet|ipad|playbook|silk/i.test(ua)) return 'tablet';
    if (/mobile|iphone|android|iemobile|blackberry|opera mini|opera mobi|windows phone/i.test(ua)) return 'mobile';
    return 'desktop';
  }
  function getBrowser() {
    var ua = navigator.userAgent;
    if (ua.indexOf('Firefox') > -1) return 'Firefox';
    if (ua.indexOf('Edg') > -1) return 'Edge';
    if (ua.indexOf('Chrome') > -1) return 'Chrome';
    if (ua.indexOf('Safari') > -1) return 'Safari';
    return 'Other';
  }
  function getOS() {
    var ua = navigator.userAgent;
    if (ua.indexOf('Win') > -1) return 'Windows';
    if (ua.indexOf('Mac') > -1) return 'MacOS';
    if (ua.indexOf('Android') > -1) return 'Android';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
    if (ua.indexOf('Linux') > -1) return 'Linux';
    return 'Other';
  }

  // ── Post helper ──────────────────────────────────────────────────────────────
  function track(type, data) {
    data = data || {};
    data.sessionId = sessionId;
    data.type = type;
    data.channelId = config.channelId || 'demo';
    fetch('https://whatsappy.onrender.com/' + 'api/tracking/' + type, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      keepalive: true
    }).catch(function() {});
  }

  // ── Page engagement tracking ─────────────────────────────────────────────────
  var pageStartTime  = Date.now();
  var maxScrollPct   = 0;
  var pageUrl        = window.location.href;
  var pageTitle      = document.title;
  var scrollEvents   = 0;
  var clickEvents    = 0;
  var activeTime     = 0;        // ms user was active (not idle)
  var lastActiveAt   = Date.now();
  var idleTimer      = null;
  var isIdle         = false;
  var pageViewId     = 'pv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

  // Track scroll depth
  function onScroll() {
    var scrolled   = window.scrollY || document.documentElement.scrollTop;
    var docHeight  = Math.max(
      document.body.scrollHeight, document.documentElement.scrollHeight,
      document.body.offsetHeight, document.documentElement.offsetHeight
    ) - window.innerHeight;
    if (docHeight > 0) {
      var pct = Math.round((scrolled / docHeight) * 100);
      if (pct > maxScrollPct) maxScrollPct = pct;
    }
    scrollEvents++;
    markActive();
  }

  // Track clicks
  function onPageClick() { clickEvents++; markActive(); }

  // Idle detection: if no activity for 30s, stop counting active time
  function markActive() {
    if (isIdle) { lastActiveAt = Date.now(); isIdle = false; }
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function() { isIdle = true; }, 30000);
  }

  // Compute engagement score 0–100
  // Weights: scroll depth (40%), active time ratio (30%), click density (20%), return visit (10%)
  function calcEngagementScore(durationSec, scrollDepth, clicks, scrollEvts) {
    var scrollScore  = Math.min(scrollDepth, 100) * 0.40;
    var activeRatio  = durationSec > 0 ? Math.min(activeTime / 1000 / durationSec, 1) : 0;
    var activeScore  = activeRatio * 100 * 0.30;
    var clickScore   = Math.min(clicks * 5, 100) * 0.20;        // 20 clicks = max
    var scrollDScore = Math.min(scrollEvts * 2, 100) * 0.10;    // 50 scrolls = max
    return Math.round(scrollScore + activeScore + clickScore + scrollDScore);
  }

  // Send page view data (called on leave OR periodically)
  function flushPageView(exit) {
    var now       = Date.now();
    var durationMs = now - pageStartTime;
    var durationSec = Math.round(durationMs / 1000);
    // Add remaining active time
    if (!isIdle) activeTime += (now - lastActiveAt);

    var score = calcEngagementScore(durationSec, maxScrollPct, clickEvents, scrollEvents);

    track('pageview', {
      pageViewId:    pageViewId,
      url:           pageUrl,
      pageTitle:     pageTitle,
      referrer:      document.referrer || '',
      durationSec:   durationSec,
      maxScrollPct:  maxScrollPct,
      scrollEvents:  scrollEvents,
      clickEvents:   clickEvents,
      activeTimeSec: Math.round(activeTime / 1000),
      engagementScore: score,
      exitEvent:     !!exit,
      deviceType:    getDeviceType(),
      browser:       getBrowser(),
      os:            getOS(),
      screenRes:     window.screen.width + 'x' + window.screen.height,
    });
  }

  // ── Initial visitor ping ─────────────────────────────────────────────────────
  function trackVisitor() {
    track('visitor', {
      deviceType:  getDeviceType(),
      browser:     getBrowser(),
      os:          getOS(),
      url:         window.location.href,
      pageTitle:   document.title,
      referrer:    document.referrer || '',
      language:    navigator.language || navigator.userLanguage,
      screen_res:  window.screen.width + 'x' + window.screen.height,
      timezone:    Intl.DateTimeFormat().resolvedOptions().timeZone
    });
  }

  // ── Attach listeners ──────────────────────────────────────────────────────────
  window.addEventListener('scroll',     onScroll,   { passive: true });
  document.addEventListener('click',    onPageClick, { passive: true });
  document.addEventListener('keydown',  markActive,  { passive: true });
  document.addEventListener('mousemove',markActive,  { passive: true });

  // Flush on page leave
  window.addEventListener('beforeunload', function() { flushPageView(true); });
  // Also flush on visibility hidden (tab switch / mobile background)
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') flushPageView(false);
  });
  // Periodic heartbeat every 30s (for long reads)
  setInterval(function() {
    if (!document.hidden) flushPageView(false);
  }, 30000);

  // ── Public API ────────────────────────────────────────────────────────────────
  var WhatsWay = {
    identify: function(data) {
      if (!data || !data.phone) return;
      track('identify', { phone: data.phone, name: data.name || '', email: data.email || '' });
    },
    trackAddToCart: function(data) {
      if (!data) return;
      track('cart', {
        cartId:        data.cartId || 'cart_' + Date.now(),
        products:      data.products || [],
        totalAmount:   data.totalAmount || 0,
        currency:      data.currency || config.currency || null,
        product_name:  data.product_name || document.title,
        product_image: data.product_image || (document.querySelector('meta[property="og:image"]') || {}).content,
        product_url:   data.product_url || window.location.href,
        cart_url:      data.cart_url || (window.location.origin + '/cart')
      });
    },
    trackProductView: function(data) {
      if (!data) return;
      track('product', {
        eventType:     'product_viewed',
        product:       data.product || {},
        product_name:  data.product_name || document.title,
        product_image: data.product_image || (document.querySelector('meta[property="og:image"]') || {}).content,
        product_url:   data.product_url || window.location.href,
        product_price: data.product_price || 0,
        currency:      data.currency || config.currency || null
      });
    },
    trackCheckout: function(data) {
      if (!data || !data.eventType) return;
      track('checkout', {
        eventType:   data.eventType,
        cartId:      data.cartId || '',
        orderId:     data.orderId || '',
        totalAmount: data.totalAmount || 0
      });
    }
  };

  window.WhatsWay = WhatsWay;

  // Kick off
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', trackVisitor);
  } else {
    trackVisitor();
  }
}();
