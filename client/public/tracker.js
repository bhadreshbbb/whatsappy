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
    fetch(baseUrl + '/api/tracking/' + type, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      keepalive: true
    }).catch(function() {});
  }

  // ── Meta tag helper ──────────────────────────────────────────────────────────
  function getMeta(prop) {
    var el = document.querySelector('meta[property="' + prop + '"]')
          || document.querySelector('meta[name="' + prop + '"]');
    return el ? (el.getAttribute('content') || '').trim() : '';
  }

  // ── Auto-capture: parse JSON-LD Product schema ────────────────────────────────
  function parseJsonLdProduct() {
    var scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (var i = 0; i < scripts.length; i++) {
      try {
        var json = JSON.parse(scripts[i].textContent);
        // Handle @graph wrapper
        var items = json['@graph'] ? json['@graph'] : [json];
        for (var j = 0; j < items.length; j++) {
          var item = items[j];
          if (item['@type'] !== 'Product') continue;
          var offer = Array.isArray(item.offers) ? item.offers[0] : (item.offers || {});
          var img = Array.isArray(item.image) ? item.image[0] : item.image;
          var imgUrl = (typeof img === 'string') ? img : (img && img.url ? img.url : '');
          var price = offer.price || '';
          var currency = offer.priceCurrency || getMeta('product:price:currency') || 'INR';
          if (price && !isNaN(String(price).replace(/[^0-9.]/g, ''))) {
            var sym = currency === 'INR' ? '₹' : (currency === 'USD' ? '$' : currency + ' ');
            price = sym + price;
          }
          return {
            name:  item.name  || '',
            price: price      || '',
            image: imgUrl     || '',
            url:   item.url   || window.location.href,
            description: (item.description || '').substring(0, 200),
          };
        }
      } catch(_) {}
    }
    return null;
  }

  // ── Auto-capture: read ALL product details from current page ─────────────────
  // Priority: JSON-LD > OpenGraph > Shopify meta > DOM fallback
  function captureProductFromPage() {
    // 1. JSON-LD (most reliable — used by Shopify, WooCommerce, etc.)
    var ld = parseJsonLdProduct();
    if (ld && ld.name) return ld;

    // 2. OpenGraph tags
    var name  = getMeta('og:title')  || getMeta('twitter:title')  || document.title || '';
    var image = getMeta('og:image')  || getMeta('twitter:image')  || '';
    var url   = getMeta('og:url')    || window.location.href;
    var priceRaw = getMeta('product:price:amount') || getMeta('og:price:amount') || '';
    var currency = getMeta('product:price:currency') || getMeta('og:price:currency') || 'INR';
    var price = '';
    if (priceRaw) {
      var sym = currency === 'INR' ? '₹' : (currency === 'USD' ? '$' : currency + ' ');
      price = sym + priceRaw;
    }

    // 3. Shopify-specific: price in page JSON or data attributes
    if (!price) {
      var priceEl = document.querySelector('[data-product-price]') ||
                    document.querySelector('.price__regular .price-item') ||
                    document.querySelector('.product__price') ||
                    document.querySelector('[itemprop="price"]');
      if (priceEl) price = (priceEl.textContent || priceEl.getAttribute('content') || '').trim();
    }

    // 4. DOM fallback for image (first prominent product image)
    if (!image) {
      var imgEl = document.querySelector('.product__media img, .product-single__photo img, [data-product-featured-image]');
      if (imgEl) image = imgEl.src || imgEl.getAttribute('data-src') || '';
    }

    return { name: name, price: price, image: image, url: url, description: '' };
  }

  // ── Auto-detect page type ────────────────────────────────────────────────────
  function detectPageType() {
    var url   = window.location.pathname.toLowerCase();
    var ogType = getMeta('og:type');

    // Product page
    if (ogType === 'product') return 'product';
    var ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (var i = 0; i < ldScripts.length; i++) {
      try {
        var json = JSON.parse(ldScripts[i].textContent);
        var items = json['@graph'] ? json['@graph'] : [json];
        for (var j = 0; j < items.length; j++) {
          if (items[j]['@type'] === 'Product') return 'product';
        }
      } catch(_) {}
    }
    if (/\/products\/|\/product\/|\/item\/|\/p\//.test(url)) return 'product';

    // Cart page
    if (/\/cart|\/basket|\/bag/.test(url)) return 'cart';

    // Collection / category / listing
    if (/\/collections\/|\/category\/|\/categories\/|\/search/.test(url)) return 'listing';

    return 'home';
  }

  // ── Auto-capture listing products (home / collection pages) ──────────────────
  function captureListingProducts() {
    var products = [];

    // JSON-LD ItemList
    var scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (var s = 0; s < scripts.length; s++) {
      try {
        var json = JSON.parse(scripts[s].textContent);
        if (json['@type'] === 'ItemList' && json.itemListElement) {
          json.itemListElement.forEach(function(item) {
            var el = item.item || item;
            if (el.name) {
              var img = Array.isArray(el.image) ? el.image[0] : el.image;
              products.push({
                name:  el.name || '',
                url:   el.url  || '',
                image: (typeof img === 'string' ? img : (img && img.url ? img.url : '')) || '',
                price: ''
              });
            }
          });
        }
      } catch(_) {}
    }

    // Shopify collection: read product JSON from page if present
    if (products.length === 0 && window.meta && window.meta.page && window.meta.page.pageType === 'collection') {
      // Shopify collections expose search results via window.searchResult or embedded JSON
    }

    // DOM-based: read product cards visible on page (Shopify theme pattern)
    if (products.length === 0) {
      var cards = document.querySelectorAll('[data-product-id], .product-card, .product-item, .product__grid-item');
      cards.forEach(function(card) {
        var nameEl  = card.querySelector('[data-product-name], .product-card__title, h2, h3');
        var priceEl = card.querySelector('[data-product-price], .price, .product-card__price');
        var imgEl   = card.querySelector('img[src], img[data-src]');
        var linkEl  = card.querySelector('a[href]');
        var name    = nameEl ? nameEl.textContent.trim() : '';
        if (name) {
          products.push({
            name:  name,
            price: priceEl ? priceEl.textContent.trim() : '',
            image: imgEl ? (imgEl.src || imgEl.getAttribute('data-src') || '') : '',
            url:   linkEl ? (linkEl.href || '') : window.location.href,
          });
        }
      });
    }

    return products.slice(0, 20); // cap at 20 products
  }

  // ── Auto-capture Shopify cart ─────────────────────────────────────────────────
  function captureCartProducts() {
    // Shopify exposes cart via window.Shopify.checkout or /cart.js
    if (window.Shopify && window.Shopify.checkout && window.Shopify.checkout.line_items) {
      return window.Shopify.checkout.line_items.map(function(item) {
        return {
          name:  item.title || item.product_title || '',
          price: (item.price / 100) || 0,
          image: item.image || '',
          url:   item.url || ''
        };
      });
    }
    // DOM-based cart table
    var rows = document.querySelectorAll('.cart__item, .cart-item, [data-cart-item]');
    var products = [];
    rows.forEach(function(row) {
      var nameEl  = row.querySelector('[data-cart-item-name], .cart__item-title, .cart-item__name, h3, h4');
      var priceEl = row.querySelector('[data-cart-item-price], .cart__price, .cart-item__price');
      var imgEl   = row.querySelector('img[src], img[data-src]');
      var linkEl  = row.querySelector('a[href]');
      var name = nameEl ? nameEl.textContent.trim() : '';
      if (name) {
        products.push({
          name:  name,
          price: priceEl ? priceEl.textContent.trim() : '',
          image: imgEl  ? (imgEl.src || imgEl.getAttribute('data-src') || '') : '',
          url:   linkEl ? linkEl.href : window.location.href,
        });
      }
    });
    return products;
  }

  // ── Page engagement tracking ─────────────────────────────────────────────────
  var pageStartTime  = Date.now();
  var maxScrollPct   = 0;
  var pageUrl        = window.location.href;
  var pageTitle      = document.title;
  var scrollEvents   = 0;
  var clickEvents    = 0;
  var activeTime     = 0;
  var lastActiveAt   = Date.now();
  var idleTimer      = null;
  var isIdle         = false;
  var pageViewId     = 'pv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

  function onScroll() {
    var scrolled  = window.scrollY || document.documentElement.scrollTop;
    var docHeight = Math.max(
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
  function onPageClick() { clickEvents++; markActive(); }
  function markActive() {
    if (isIdle) { lastActiveAt = Date.now(); isIdle = false; }
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function() { isIdle = true; }, 30000);
  }
  function calcEngagementScore(durationSec, scrollDepth, clicks, scrollEvts) {
    var scrollScore  = Math.min(scrollDepth, 100) * 0.40;
    var activeRatio  = durationSec > 0 ? Math.min(activeTime / 1000 / durationSec, 1) : 0;
    var activeScore  = activeRatio * 100 * 0.30;
    var clickScore   = Math.min(clicks * 5, 100) * 0.20;
    var scrollDScore = Math.min(scrollEvts * 2, 100) * 0.10;
    return Math.round(scrollScore + activeScore + clickScore + scrollDScore);
  }

  function flushPageView(exit) {
    var now        = Date.now();
    var durationMs = now - pageStartTime;
    var durationSec = Math.round(durationMs / 1000);
    if (!isIdle) activeTime += (now - lastActiveAt);
    var score = calcEngagementScore(durationSec, maxScrollPct, clickEvents, scrollEvents);
    track('pageview', {
      pageViewId:      pageViewId,
      url:             pageUrl,
      pageTitle:       pageTitle,
      referrer:        document.referrer || '',
      durationSec:     durationSec,
      maxScrollPct:    maxScrollPct,
      scrollEvents:    scrollEvents,
      clickEvents:     clickEvents,
      activeTimeSec:   Math.round(activeTime / 1000),
      engagementScore: score,
      exitEvent:       !!exit,
      deviceType:      getDeviceType(),
      browser:         getBrowser(),
      os:              getOS(),
      screenRes:       window.screen.width + 'x' + window.screen.height,
    });
  }

  // ── Initial visitor ping ──────────────────────────────────────────────────────
  function trackVisitor() {
    var pageType = detectPageType();

    // Auto-capture listing products on home/collection pages for catalog sync
    var listingProducts = [];
    if (pageType === 'home' || pageType === 'listing') {
      listingProducts = captureListingProducts();
    }

    track('visitor', {
      deviceType:       getDeviceType(),
      browser:          getBrowser(),
      os:               getOS(),
      url:              window.location.href,
      pageTitle:        document.title,
      referrer:         document.referrer || '',
      language:         navigator.language || navigator.userLanguage,
      screen_res:       window.screen.width + 'x' + window.screen.height,
      timezone:         Intl.DateTimeFormat().resolvedOptions().timeZone,
      page_type:        pageType,
      // Send auto-captured listing products for catalog sync
      shopify_carousel: listingProducts.length > 0 ? JSON.stringify(listingProducts) : undefined,
    });

    // Auto-track product view if on a product page and product data found
    if (pageType === 'product') {
      var auto = captureProductFromPage();
      if (auto && auto.name) {
        // Store for use when identify() is called
        window._wwAutoProduct = auto;
        // Track product view automatically
        WhatsWay.trackProductView({
          product_name:  auto.name,
          product_image: auto.image,
          product_url:   auto.url,
          product_price: auto.price,
        });
      }
    }
  }

  // ── Attach listeners ──────────────────────────────────────────────────────────
  window.addEventListener('scroll',     onScroll,    { passive: true });
  document.addEventListener('click',    onPageClick, { passive: true });
  document.addEventListener('keydown',  markActive,  { passive: true });
  document.addEventListener('mousemove',markActive,  { passive: true });
  window.addEventListener('beforeunload', function() { flushPageView(true); });
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') flushPageView(false);
  });
  setInterval(function() {
    if (!document.hidden) flushPageView(false);
  }, 30000);

  // ── Public API ────────────────────────────────────────────────────────────────
  var WhatsWay = {

    identify: function(data) {
      if (!data || !data.phone) return;
      // If we auto-detected a product earlier, link it to this user now
      var auto = window._wwAutoProduct || null;
      track('identify', {
        phone: data.phone,
        name:  data.name  || '',
        email: data.email || '',
        // Include auto-captured product so server can link it
        auto_product_name:  auto ? auto.name  : '',
        auto_product_image: auto ? auto.image : '',
        auto_product_url:   auto ? auto.url   : '',
        auto_product_price: auto ? auto.price : '',
      });
    },

    trackAddToCart: function(data) {
      if (!data) data = {};

      // Auto-capture product from current page to fill missing fields
      var auto = captureProductFromPage();

      // Enrich products array — ensure each item has name/price/image/url
      var products = (data.products || []).map(function(p) {
        return {
          name:  p.name  || '',
          price: p.price || 0,
          image: p.image || '',
          url:   p.url   || window.location.href,
        };
      });

      // If no products array, auto-capture from cart DOM or current page
      if (products.length === 0) {
        var cartItems = captureCartProducts();
        if (cartItems.length > 0) {
          products = cartItems;
        } else if (auto && auto.name) {
          products = [{ name: auto.name, price: auto.price || 0, image: auto.image || '', url: auto.url || window.location.href }];
        }
      }

      var first = products[0] || {};
      track('cart', {
        cartId:        data.cartId        || 'cart_' + Date.now(),
        products:      products,
        totalAmount:   data.totalAmount   || 0,
        currency:      data.currency      || config.currency || null,
        // Top-level convenience fields (auto-filled from products[0] or page capture)
        product_name:  data.product_name  || first.name  || auto.name  || document.title,
        product_image: data.product_image || first.image || auto.image || '',
        product_url:   data.product_url   || first.url   || auto.url   || window.location.href,
        product_price: data.product_price || first.price || auto.price || 0,
        cart_url:      data.cart_url      || window.location.href,
      });
    },

    trackProductView: function(data) {
      if (!data) data = {};

      // Auto-capture from page — fills everything not explicitly passed
      var auto = captureProductFromPage();

      track('product', {
        eventType:     'product_viewed',
        product:       data.product       || {},
        product_name:  data.product_name  || auto.name  || document.title,
        product_image: data.product_image || auto.image || '',
        product_url:   data.product_url   || auto.url   || window.location.href,
        product_price: data.product_price || auto.price || '',
        currency:      data.currency      || config.currency || null,
      });
    },

    trackCheckout: function(data) {
      if (!data || !data.eventType) return;
      track('checkout', {
        eventType:   data.eventType,
        cartId:      data.cartId      || '',
        orderId:     data.orderId     || '',
        totalAmount: data.totalAmount || 0,
      });
    },

    // Minimal call: WhatsWay.trackProductView() — auto-captures everything from page
    // Full call:    WhatsWay.trackProductView({ product_name:'...', product_price:'...', ... })
    // Cart call:    WhatsWay.trackAddToCart({ products:[{name,price,url}], totalAmount:799 })
    // Identify:     WhatsWay.identify({ phone:'+91...', name:'...' })
  };

  window.WhatsWay = WhatsWay;

  // Kick off after DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', trackVisitor);
  } else {
    trackVisitor();
  }
}();
