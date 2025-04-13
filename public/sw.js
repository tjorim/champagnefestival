// Simple service worker for the Champagne Festival site
const CACHE_NAME = 'champagne-festival-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html',
  '/images/offline-placeholder.svg',
  '/assets/css/index.css',
  '/assets/js/framework.js',
  '/assets/js/index.js',
  '/assets/woff2/bootstrap-icons.woff2',
  '/images/og-image.jpg',
  '/sw.js', // Cache the service worker itself for better updates
];

// Install event - cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => {
          return name !== CACHE_NAME;
        }).map((name) => {
          return caches.delete(name);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache first, then network, with offline fallbacks
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return the response from the cached version
        if (response) {
          return response;
        }
        
        // Not in cache - fetch from network
        return fetch(event.request).then((networkResponse) => {
          // Don't cache third-party requests
          if (!event.request.url.startsWith(self.location.origin)) {
            return networkResponse;
          }
          
          // Clone the response
          const responseToCache = networkResponse.clone();
          
          // Only cache successful responses
          if (responseToCache.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          
          return networkResponse;
        })
        .catch(() => {
          // If both cache and network fail, return a fallback for HTML requests
          if (event.request.headers.get('Accept')?.includes('text/html')) {
            return caches.match('/offline.html');
          }
          
          // For images, return a placeholder
          if (event.request.headers.get('Accept')?.includes('image/')) {
            return caches.match('/images/offline-placeholder.svg');
          }
          
          // Return error response if no fallback is available
          return new Response('Network error occurred', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' }
          });
        });
      })
  );
});