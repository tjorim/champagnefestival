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
        console.log('Opened cache');
        return cache.addAll(ASSETS_TO_CACHE)
          .catch(error => {
            console.error('Failed to cache assets during installation:', error);
            // Optionally decide if installation should fail completely
            // For now, let's allow installation to continue
            return Promise.resolve();
          });
      })
      .then(() => self.skipWaiting())
      .catch(error => {
        // Handle potential errors during cache opening or skipWaiting
        console.error('Service Worker installation failed:', error);
      })
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
            // Return the promise chain to ensure it completes
            return caches.open(CACHE_NAME).then((cache) => {
              return cache.put(event.request, responseToCache)
                // Return the original network response after caching
                .then(() => networkResponse);
            });
          }

          // If not caching, return the original network response directly
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