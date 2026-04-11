/**
 * WhatsCart Pro - Website Tracker v2.1
 * Enhanced data capture for granular template segments
 */

(function (window, document) {
  'use strict';

  var cfg = window.WhatsCartConfig || {};
  if (!cfg.apiKey || !cfg.channelId) {
    console.warn('[WhatsCart] Missing apiKey or channelId');
    return;
  }

  var BASE_URL = cfg.baseUrl || window.location.origin;
  var SESSION_KEY = '_wc_sid';
  var USER_KEY = '_wc_user';
  var VIEWS_KEY = '_wc_views';

  // ── Identity ──
  var sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = 'sess_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    localStorage.setItem(SESSION_KEY, sessionId);
  }

  var pageViews = parseInt(localStorage.getItem(VIEWS_KEY) || '0') + 1;
  localStorage.setItem(VIEWS_KEY, pageViews);

  var knownUser = JSON.parse(localStorage.getItem(USER_KEY) || '{}');

  function post(path, data) {
    var payload = Object.assign({
      channelId: cfg.channelId,
      sessionId: sessionId,
      url: window.location.href,
      referrer: document.referrer,
      language: navigator.language,
      deviceType: getDeviceType(),
      pageViews: pageViews
    }, knownUser, data);

    return fetch(BASE_URL + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.apiKey },
      body: JSON.stringify(payload),
      keepalive: true
    }).catch(function (e) { console.warn('[WhatsCart]', e.message); });
  }

  function getDeviceType() {
    var ua = navigator.userAgent;
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) return 'tablet';
    if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated/.test(ua)) return 'mobile';
    return 'desktop';
  }

  var urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('wc_ref') === 'wa') {
    post('/api/tracking/click', {
      eventType: 'whatsapp_click',
      campaignId: urlParams.get('wc_cid'),
      timestamp: Date.now()
    });
  }

  // ── Page Type Detection ──
  function detectPageType() {
    var path = window.location.pathname.toLowerCase();
    if (path === '/' || path === '' || path.includes('/collections') || path.includes('/search') || path.includes('/pages')) return 'listing';
    if (path.includes('/products/') && path.split('/').length > 2) return 'product';
    if (path.includes('/cart')) return 'cart';
    if (path.includes('/checkout')) return 'checkout';
    if (path.includes('/orders') || path.includes('/thank')) return 'confirmation';
    return 'listing';
  }

  // ── Automated Dynamic Catalog Scraper ──
  async function scrapeShopifyCarousel() {
    try {
      var isShopify = window.Shopify || document.querySelector('script[src*="shopify"]');
      if (isShopify) {
        var res = await fetch(window.location.origin + '/products.json?limit=12');
        var data = await res.json();
        if (data && data.products) {
          return data.products.map(function(p) {
            return {
              name: p.title,
              url: window.location.origin + '/products/' + p.handle,
              image: p.images && p.images[0] ? p.images[0].src : '',
              price: p.variants && p.variants[0] ? p.variants[0].price : '0.00'
            };
          });
        }
      }
    } catch(e) {}
    return [];
  }

  // ── Sync full product catalog to server (background) ──
  async function syncProductCatalog(products) {
    if (!products || products.length === 0) return;
    try {
      await fetch(BASE_URL + '/api/tracking/shopify-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.apiKey },
        body: JSON.stringify({ channelId: cfg.channelId, products: products }),
        keepalive: true
      });
    } catch(e) {}
  }

  // ── API ──
  window.WhatsCart = {
    identify: function (userData) {
      knownUser = Object.assign(knownUser, userData);
      localStorage.setItem(USER_KEY, JSON.stringify(knownUser));
      post('/api/tracking/identify', userData);
    },

    trackProductView: function (product) {
      var autoImg = document.querySelector('meta[property="og:image"]');
      post('/api/tracking/product', {
        eventType: 'product_viewed',
        product_name: product.name,
        product_price: product.price,
        product_image: product.image || (autoImg ? autoImg.content : ''),
        product_url: product.url ? new URL(product.url, window.location.origin).href : window.location.href,
        currency: product.currency || cfg.currency || null,
        category: product.category || 'general'
      });
    },

    trackAddToCart: function (cartData) {
      var firstProd = (cartData.products && cartData.products[0]) || {};
      var autoImg = document.querySelector('meta[property="og:image"]');
      var cartUrl = new URL('/cart', window.location.origin);
      cartUrl.searchParams.set('sid', sessionId);
      cartUrl.searchParams.set('wc_ref', 'wa_recovery');

      post('/api/tracking/cart', {
        eventType: 'add_to_cart',
        cartId: cartData.cartId || 'cart_' + sessionId,
        products: cartData.products || [],
        totalAmount: cartData.totalAmount || 0,
        currency: cartData.currency || cfg.currency || null,
        // ── Automated Variables for WhatsApp ──
        product_name: firstProd.name,
        product_price: firstProd.price || cartData.totalAmount,
        product_image: firstProd.image || (autoImg ? autoImg.content : ''),
        product_url: firstProd.url ? new URL(firstProd.url, window.location.origin).href : window.location.href,
        cart_url: cartUrl.href
      });
    },

    trackPurchase: function (data) {
      post('/api/tracking/purchase', {
        eventType: 'purchase_complete',
        orderId: data.orderId || 'ord_' + Date.now(),
        products: data.products || [],
        totalAmount: data.totalAmount || 0,
        currency: data.currency || cfg.currency || null
      });
      localStorage.setItem(VIEWS_KEY, '0');
    }
  };



  (async function() {
    var trendingItems = await scrapeShopifyCarousel();
    var pageType = detectPageType();

    // Track visitor with page type + scraped carousel
    post('/api/tracking/visitor', {
      pageTitle: document.title,
      pageType: pageType,
      language: navigator.languages ? navigator.languages[0] : navigator.language,
      screen_res: window.screen.width + 'x' + window.screen.height,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      shopify_carousel: JSON.stringify(trendingItems)
    });

    // Sync full catalog to server in background (so website_visit campaigns have products)
    if (trendingItems.length > 0) {
      syncProductCatalog(trendingItems);
    }
  })();

})(window, document);
