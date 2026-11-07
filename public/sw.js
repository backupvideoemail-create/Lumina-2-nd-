/**
 * AI PRIME STUDIO — ULTRA-SAFE WHITELIST-ONLY SERVICE WORKER
 * 
 * Rules:
 * 1. Zero precaching of HTML ('/') - prevents stale web shells or broken session tokens.
 * 2. Whitelist-only caching of safe, versioned static assets (icons, Vite static chunks).
 * 3. Absolute network-only for:
 *    - All HTML navigation requests ('mode === navigate')
 *    - All /api/** requests (payment, quota, quote, auth, generations)
 *    - All customer uploads, media blobs, signed URLs
 *    - All Razorpay / Cashfree scripts and checkout flows
 *    - Any non-GET request
 */

const CACHE_NAME = 'lumina-static-v1.0.1';

// Explicitly allowlisted static assets
const STATIC_ASSETS_ALLOWLIST = [
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS_ALLOWLIST);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. Only intercept GET requests
  if (req.method !== 'GET') {
    return; // Pass through to network
  }

  // 2. ABSOLUTE NETWORK-ONLY: HTML navigations
  if (req.mode === 'navigate') {
    return; // Pass through to network
  }

  // 3. ABSOLUTE NETWORK-ONLY: All /api/ routes
  if (url.pathname.startsWith('/api/')) {
    return; // Pass through to network
  }

  // 4. ABSOLUTE NETWORK-ONLY: External gateways (Razorpay, Firebase, Cashfree, R2, etc.)
  if (url.origin !== self.location.origin) {
    return; // Pass through to network
  }

  // 5. ABSOLUTE NETWORK-ONLY: Sensitive or dynamic endpoints
  if (
    url.pathname.includes('/auth') ||
    url.pathname.includes('/checkout') ||
    url.pathname.includes('/webhook') ||
    url.pathname.includes('/uploads/') ||
    url.pathname.includes('/generations/') ||
    url.pathname.includes('/storage/')
  ) {
    return; // Pass through to network
  }

  // 6. Whitelist matching for static icons
  const isAllowlistedIcon = STATIC_ASSETS_ALLOWLIST.includes(url.pathname);

  // 7. Whitelist matching for same-origin versioned Vite build chunks (/assets/*.js, /assets/*.css)
  const isVersionedViteAsset = url.pathname.startsWith('/assets/') && /\.(js|css|woff2?|png|jpg|svg)$/.test(url.pathname);

  if (isAllowlistedIcon || isVersionedViteAsset) {
    event.respondWith(
      caches.match(req).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(req).then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, responseToCache);
          });
          return networkResponse;
        });
      })
    );
    return;
  }

  // Default fallback: direct network fetch without caching
});
