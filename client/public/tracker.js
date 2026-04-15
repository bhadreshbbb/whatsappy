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
  function track(type, data, onResponse) {
    data = data || {};
    data.sessionId = sessionId;
    data.type = type;
    data.channelId = config.channelId || 'demo';
    fetch('https://whatsappy.onrender.com' + '/api/tracking/' + type, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      keepalive: true
    }).then(function(r) {
      return r.json();
    }).then(function(resp) {
      if (onResponse) onResponse(resp);
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
    }, function(resp) {
      // ── Browser console: full geo flow log ──────────────────────────────────
      var d = (resp && resp.debug) || {};
      var ok = d.city && d.city !== 'Unknown';
      console.groupCollapsed(
        '%c[WhatsWay] Visitor tracked  ' + (ok ? '✓ Geo OK' : '⚠ Geo Unknown'),
        'color:' + (ok ? '#4ade80' : '#fb923c') + ';font-weight:bold'
      );
      console.log('%cSession ID    %c' + (d.session   || sessionId),          'color:#64748b', 'color:#e2e8f0');
      console.log('%cIP Address    %c' + (d.ip        || '— not detected'),   'color:#64748b', d.ip  ? 'color:#4ade80' : 'color:#f87171');
      console.log('%cCity          %c' + (d.city      || '—'),                'color:#64748b', ok    ? 'color:#4ade80' : 'color:#f87171');
      console.log('%cState         %c' + (d.state     || '—'),                'color:#64748b', 'color:#e2e8f0');
      console.log('%cCountry       %c' + (d.country   || '—'),                'color:#64748b', 'color:#e2e8f0');
      console.log('%cTimezone      %c' + (d.timezone  || '—'),                'color:#64748b', 'color:#e2e8f0');
      console.log('%cLanguage      %c' + (d.language  || '—'),                'color:#64748b', 'color:#e2e8f0');
      console.log('%cGeo API step  %c' + (d.geoApiStep || '—'),               'color:#64748b', 'color:#94a3b8');
      console.log('%cHTTP status   %c' + (d.geoHttpStatus || '—'),            'color:#64748b', d.geoHttpStatus === 200 ? 'color:#4ade80' : 'color:#f87171');
      if (d.geoError) {
        console.error('%cGeo API error %c' + d.geoError,                      'color:#64748b', 'color:#f87171');
      }
      if (d.geoRawResponse) {
        console.log('%cfreeipapi raw response:', 'color:#64748b', d.geoRawResponse);
      }
      console.groupEnd();
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

  // ═══════════════════════════════════════════════════════════════════════════════
  // AUTO ADD-TO-CART DETECTION
  //
  // THREE strategies — only fires when item is CONFIRMED added (not just clicked):
  //
  //  Strategy 1 — Fetch interceptor  : catches /cart/add.js, wc-ajax=add_to_cart
  //                                    fires ONLY on HTTP 200 success response
  //  Strategy 2 — XHR interceptor    : same URLs, same success-only rule
  //  Strategy 3 — DOM cart count watch: MutationObserver on cart badge / success
  //                                    toasts; fires only when count increases or
  //                                    a success message appears in the DOM
  //
  //  A button-click sets a _pendingClick flag (with captured product data).
  //  Strategy 1/2 are preferred — if AJAX fires, button-click flag is cleared.
  //  Strategy 3 only fires if _pendingClick is set (someone clicked a button)
  //  AND the cart count/DOM actually changed — confirming the add succeeded.
  //  If 3 seconds pass after a button click with no confirmation, flag expires.
  // ═══════════════════════════════════════════════════════════════════════════════

  var _pendingClick    = null;   // { product, ts } — set on button click
  var _cartEventFired  = false;  // debounce: prevent double-fire within 1s
  var _lastCartCount   = -1;     // track cart item count for MutationObserver

  function _fireConfirmedCartEvent(productData) {
    if (_cartEventFired) return;
    _cartEventFired = true;
    setTimeout(function() { _cartEventFired = false; }, 1000);
    _pendingClick = null; // clear pending flag since we confirmed success

    var auto = productData || captureProductFromPage();
    var products = auto && auto.name
      ? [{ name: auto.name, price: auto.price || 0, image: auto.image || '', url: auto.url || window.location.href }]
      : [];
    var first = products[0] || {};
    track('cart', {
      cartId:        'cart_' + Date.now(),
      products:      products,
      totalAmount:   0,
      product_name:  first.name  || document.title,
      product_image: first.image || '',
      product_url:   first.url   || window.location.href,
      product_price: first.price || '',
      cart_url:      window.location.href,
    });
  }

  // ── Helper: read Shopify product data from response JSON ─────────────────────
  function _parseShopifyCartResponse(data) {
    if (!data) return null;
    // /cart/add.js returns the added item object: { id, title, price, featured_image, ... }
    if (data.title) {
      var price = data.price ? '₹' + (data.price / 100).toFixed(0) : '';
      var image = (data.featured_image && data.featured_image.url) ? data.featured_image.url : '';
      return { name: data.title, price: price, image: image, url: window.location.href };
    }
    return null;
  }

  // ── Strategy 1: Intercept fetch() ────────────────────────────────────────────
  // Only fires on HTTP 200 — failed adds (out of stock, etc.) are ignored.
  (function() {
    var _orig = window.fetch;
    window.fetch = function(input, init) {
      var url    = (typeof input === 'string') ? input : (input && input.url ? input.url : String(input));
      var method = ((init && init.method) || 'GET').toUpperCase();

      var isShopifyAdd = /\/cart\/add(\.js)?(\?|$)/i.test(url) && method === 'POST';
      var isWCAdd      = /wc-ajax=add_to_cart/i.test(url);

      if (isShopifyAdd || isWCAdd) {
        return _orig.apply(this, arguments).then(function(resp) {
          if (resp && resp.ok) {
            // Clone so caller can still read the body
            resp.clone().json().then(function(data) {
              _fireConfirmedCartEvent(_parseShopifyCartResponse(data));
            }).catch(function() {
              _fireConfirmedCartEvent(null); // success but JSON parse failed — still track
            });
          }
          // If resp.ok is false (e.g. 422 out-of-stock) we do NOT track.
          return resp;
        });
      }
      return _orig.apply(this, arguments);
    };
  })();

  // ── Strategy 2: Intercept XMLHttpRequest ─────────────────────────────────────
  // Same success-only rule: only fires when status is 200–299.
  (function() {
    var _origOpen = XMLHttpRequest.prototype.open;
    var _origSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url) {
      this._wwUrl    = String(url || '');
      this._wwMethod = (method || 'GET').toUpperCase();
      _origOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function(body) {
      var xhr = this;
      var isShopifyAdd = /\/cart\/add(\.js)?(\?|$)/i.test(xhr._wwUrl) && xhr._wwMethod === 'POST';
      var isWCAdd      = /wc-ajax=add_to_cart/i.test(xhr._wwUrl);

      if (isShopifyAdd || isWCAdd) {
        xhr.addEventListener('load', function() {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              var data = JSON.parse(xhr.responseText);
              _fireConfirmedCartEvent(_parseShopifyCartResponse(data));
            } catch(_) {
              _fireConfirmedCartEvent(null);
            }
          }
          // status 4xx/5xx (out-of-stock, validation error) → do NOT track
        });
      }
      _origSend.apply(this, arguments);
    };
  })();

  // ── Strategy 3: DOM cart-count watcher (non-AJAX / custom stores) ────────────
  // Fires only when:
  //  (a) a button click set _pendingClick within the last 3 seconds, AND
  //  (b) the cart count badge actually increased OR a success toast appeared.
  // This confirms the add was successful even on non-AJAX form-based stores.
  var CART_COUNT_SELECTORS = [
    '[data-cart-count]', '[data-item-count]', '[data-cart-item-count]',
    '.cart-count', '.cart__count', '.cart-items-count',
    '#CartCount', '#cart-count', '.CartCount',
    '.header__cart-toggle [aria-label]',
    '.mini-cart__count', '.cart-bubble',
  ];
  var CART_SUCCESS_SELECTORS = [
    '.cart-notification--visible', '[data-cart-notification].is-visible',
    '.woocommerce-message', '.added_to_cart',
    '.cart-added-message', '[data-added-to-cart]',
  ];

  function _readCartCount() {
    for (var i = 0; i < CART_COUNT_SELECTORS.length; i++) {
      var el = document.querySelector(CART_COUNT_SELECTORS[i]);
      if (el) {
        var n = parseInt(el.textContent || el.getAttribute('data-cart-count') || el.getAttribute('aria-label') || '0', 10);
        if (!isNaN(n)) return n;
      }
    }
    return -1;
  }

  function _checkDomCartConfirmation() {
    // Check if a success toast appeared
    for (var i = 0; i < CART_SUCCESS_SELECTORS.length; i++) {
      if (document.querySelector(CART_SUCCESS_SELECTORS[i])) {
        if (_pendingClick) _fireConfirmedCartEvent(_pendingClick.product);
        return;
      }
    }
    // Check if cart count increased
    var count = _readCartCount();
    if (count > _lastCartCount && _lastCartCount >= 0) {
      if (_pendingClick) _fireConfirmedCartEvent(_pendingClick.product);
    }
    if (count >= 0) _lastCartCount = count;
  }

  // Initialize cart count baseline
  if (document.readyState !== 'loading') {
    _lastCartCount = _readCartCount();
  } else {
    document.addEventListener('DOMContentLoaded', function() { _lastCartCount = _readCartCount(); });
  }

  // MutationObserver watches for DOM changes that indicate cart update
  (function() {
    var observer = new MutationObserver(function() {
      if (_pendingClick && (Date.now() - _pendingClick.ts) < 3000) {
        _checkDomCartConfirmation();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-cart-count', 'data-item-count'] });
  })();

  // WooCommerce fires a jQuery event when fragments refresh (cart updated)
  if (window.jQuery) {
    window.jQuery(document.body).on('wc_fragments_refreshed added_to_cart', function() {
      if (_pendingClick) _fireConfirmedCartEvent(_pendingClick.product);
    });
  }
  // Also listen via document event (works without jQuery)
  document.addEventListener('wc_cart_fragments_refreshed', function() {
    if (_pendingClick) _fireConfirmedCartEvent(_pendingClick.product);
  });

  // ── Button click detector — sets _pendingClick flag ONLY ─────────────────────
  // Does NOT fire a cart event by itself. It only marks "a button was clicked".
  // Confirmation must come from Strategy 1/2/3 above.
  var ADD_TO_CART_SELECTORS = [
    '[name="add"]',                          // Shopify default form input
    '[data-testid="add-to-cart"]',
    '[data-action="add-to-cart"]',
    '[data-add-to-cart]',
    '[data-button-action="add-to-cart"]',
    '.add_to_cart_button',                   // WooCommerce listing
    '.single_add_to_cart_button',            // WooCommerce product page
    'button[name="add-to-cart"]',
    'button[value="add-to-cart"]',
    'input[name="add-to-cart"]',
    '[data-cart-add]',
    '[data-btn-addtocart]',
  ];
  var ADD_CART_TEXT_RE = /^(add to cart|add to bag|add to basket|buy now|add item)$/i;

  document.addEventListener('click', function(e) {
    var el = e.target;
    for (var i = 0; i < 4 && el && el !== document.body; i++) {
      var tag = (el.tagName || '').toLowerCase();
      if (tag === 'button' || tag === 'a' || tag === 'input' || tag === 'div' || tag === 'span') {
        var matched = ADD_TO_CART_SELECTORS.some(function(sel) {
          try { return el.matches(sel); } catch(_) { return false; }
        });
        var text = (el.textContent || el.value || el.getAttribute('aria-label') || '').trim();
        var textMatch = (tag === 'button' || tag === 'a') && ADD_CART_TEXT_RE.test(text);

        if (matched || textMatch) {
          // Capture product data NOW (while we're on the product page)
          var product = captureProductFromPage();
          // Set a pending flag — confirmation must come from AJAX response or DOM change
          _pendingClick = { product: product, ts: Date.now() };
          // Auto-expire after 3 seconds if no confirmation arrives (add failed / user cancelled)
          setTimeout(function() {
            _pendingClick = null;
          }, 3000);
          break;
        }
      }
      el = el.parentElement;
    }
  }, { passive: true });

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

    // ── trackPurchase: call on order confirmation / thank you page ───────────
    trackPurchase: function(data) {
      if (!data) data = {};
      var products = data.products || captureCartProducts();
      track('purchase', {
        orderId:     data.orderId     || data.order_id    || '',
        products:    products,
        totalAmount: data.totalAmount || data.total       || 0,
        currency:    data.currency    || config.currency  || null,
        phone:       data.phone       || '',
      }, function() {
        console.log('%c[WhatsWay] Purchase tracked — status → purchased', 'color:#4ade80;font-weight:bold');
      });
    },
  };

  window.WhatsWay = WhatsWay;

  // ── Auto-detect purchase / thank-you page ─────────────────────────────────
  // Fires automatically on Shopify thank_you, WooCommerce order-received,
  // and common custom store patterns. No manual call needed.
  (function() {
    var url   = window.location.href.toLowerCase();
    var path  = window.location.pathname.toLowerCase();

    // Shopify: /checkout/thank_you  OR  /orders/<id>
    var isShopifyThankYou = /\/checkout\/thank_you/.test(path) || /\/orders\/[a-z0-9]+/.test(path);

    // WooCommerce: /checkout/order-received/
    var isWCThankYou = /\/checkout\/order-received\//.test(path) || /\/order-received\//.test(path);

    // Generic patterns: thank-you, thankyou, order-confirmed, order-success, payment-success
    var isGenericThankYou = /thank.?you|order.?confirm|order.?success|payment.?success|purchase.?complete/i.test(path + ' ' + document.title);

    if (isShopifyThankYou || isWCThankYou || isGenericThankYou) {
      // Pull order details from Shopify global or page
      var orderId     = '';
      var totalAmount = 0;
      var products    = [];

      // Shopify exposes order in window.Shopify.checkout
      if (window.Shopify && window.Shopify.checkout) {
        var co = window.Shopify.checkout;
        orderId     = co.order_id || co.name || '';
        totalAmount = parseFloat(co.total_price || 0);
        products    = (co.line_items || []).map(function(item) {
          return {
            name:  item.title || item.product_title || '',
            price: (item.price / 100) || 0,
            image: item.image || '',
            url:   item.url   || '',
          };
        });
      }

      // WooCommerce: order total from DOM
      if (!totalAmount) {
        var totalEl = document.querySelector('.woocommerce-order-overview__total .woocommerce-Price-amount, .order-total .amount');
        if (totalEl) totalAmount = parseFloat((totalEl.textContent || '').replace(/[^0-9.]/g, '')) || 0;
      }

      // Order ID from URL path (/orders/12345 or /order-received/12345)
      if (!orderId) {
        var m = path.match(/\/orders?\/([a-z0-9#\-]+)/i) || path.match(/order-received\/(\d+)/i);
        if (m) orderId = m[1];
      }

      // Auto-fire purchase event after DOM is ready (slight delay to let page settle)
      setTimeout(function() {
        WhatsWay.trackPurchase({ orderId: orderId, totalAmount: totalAmount, products: products });
      }, 500);
    }

    // Shopify: also listen for the checkout:complete JS event (fired by Shopify theme)
    document.addEventListener('checkout:complete', function(e) {
      var detail = (e && e.detail) || {};
      WhatsWay.trackPurchase({
        orderId:     detail.orderId || detail.order_id || '',
        totalAmount: detail.totalPrice || 0,
      });
    });

    // WooCommerce fires wc_order_received event
    document.addEventListener('wc_order_received', function(e) {
      var detail = (e && e.detail) || {};
      WhatsWay.trackPurchase({ orderId: detail.orderId || '', totalAmount: detail.total || 0 });
    });
  })();

  // Kick off after DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', trackVisitor);
  } else {
    trackVisitor();
  }
}();
