!function() {
  var config = window.WhatswayConfig || {};
  var baseUrl = config.baseUrl || '';

  var sessionId = sessionStorage.getItem('ww_session');
  if (!sessionId) {
    sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
    sessionStorage.setItem('ww_session', sessionId);
  }

  function getDeviceType() {
    var ua = navigator.userAgent;
    if (/tablet|ipad|playbook|silk/i.test(ua)) return 'tablet';
    if (/mobile|iphone|android|iemobile|blackberry|opera mini|opera mobi|windows phone/i.test(ua)) return 'mobile';
    return 'desktop';
  }

  function getBrowser() {
    var ua = navigator.userAgent;
    if (ua.indexOf('Firefox') > -1) return 'Firefox';
    if (ua.indexOf('Chrome') > -1) return 'Chrome';
    if (ua.indexOf('Safari') > -1) return 'Safari';
    if (ua.indexOf('Edge') > -1) return 'Edge';
    return 'Other';
  }

  function getOS() {
    var ua = navigator.userAgent;
    if (ua.indexOf('Win') > -1) return 'Windows';
    if (ua.indexOf('Mac') > -1) return 'MacOS';
    if (ua.indexOf('Linux') > -1) return 'Linux';
    if (ua.indexOf('Android') > -1) return 'Android';
    if (ua.indexOf('iOS') > -1 || ua.indexOf('iPhone') > -1) return 'iOS';
    return 'Other';
  }

  function track(type, data) {
    data = data || {};
    data.sessionId = sessionId;
    data.type = type;
    data.channelId = config.channelId || 'demo';

    // Bridge with backend routing: /api/tracking/
    var endpoint = baseUrl + '/api/tracking/' + type;
    
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      keepalive: true
    }).catch(function() {});
  }

  function trackVisitor() {
    var deviceType = getDeviceType();
    var browser = getBrowser();
    var os = getOS();

    track('visitor', {
      deviceType: deviceType,
      browser: browser,
      os: os,
      url: window.location.href,
      pageTitle: document.title,
      language: navigator.language || navigator.userLanguage,
      screen_res: window.screen.width + 'x' + window.screen.height,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });
  }

  var WhatsWay = {
    identify: function(data) {
      if (!data || !data.phone) return;
      track('identify', {
        phone: data.phone,
        name: data.name || '',
        email: data.email || ''
      });
    },

    trackAddToCart: function(data) {
      if (!data) return;
      track('cart', {
        cartId: data.cartId || 'cart_' + Date.now(),
        products: data.products || [],
        totalAmount: data.totalAmount || 0,
        currency: data.currency || config.currency || null,
        // Auto-enrichment
        product_name: data.product_name || document.title,
        product_image: data.product_image || (document.querySelector('meta[property="og:image"]')?.content),
        product_url: data.product_url || window.location.href,
        cart_url: data.cart_url || (window.location.origin + '/cart')
      });
    },

    trackProductView: function(data) {
      if (!data) return;
      track('product', {
        eventType: 'product_viewed',
        product: data.product || {},
        product_name: data.product_name || document.title,
        product_image: data.product_image || (document.querySelector('meta[property="og:image"]')?.content),
        product_url: data.product_url || window.location.href,
        product_price: data.product_price || 0,
        currency: data.currency || config.currency || null
      });
    },

    trackCheckout: function(data) {
      if (!data || !data.eventType) return;
      track('checkout', {
        eventType: data.eventType,
        cartId: data.cartId || '',
        orderId: data.orderId || '',
        totalAmount: data.totalAmount || 0
      });
    }
  };

  window.WhatsWay = WhatsWay;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', trackVisitor);
  } else {
    trackVisitor();
  }

  window.addEventListener('beforeunload', function() {
    track('visitor', {
      deviceType: getDeviceType(),
      browser: getBrowser(),
      os: getOS(),
      pageUrl: window.location.href
    });
  });
}();
