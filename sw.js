
// Service Worker para Conferente Pro PWA
// Optimizado para offline-first con estrategia cache-then-network

const CACHE_NAME = 'conferente-pro-v3';
const RUNTIME_CACHE = 'conferente-runtime-v3';
const IMAGE_CACHE = 'conferente-images-v3';

const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/index.css'
];

// Install Event: Cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching static assets');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting()) // Activate immediately
  );
});

// Activate Event: Clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (![CACHE_NAME, RUNTIME_CACHE, IMAGE_CACHE].includes(cacheName)) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Claim clients immediately
  );
});

// Fetch Event: Cache-then-Network strategy
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip external APIs (Google Gemini, Vision API, etc.)
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('google.com')) {
    return; // Let browser handle it
  }

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Image caching strategy
  if (request.destination === 'image') {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(cache => {
        return cache.match(request).then(response => {
          if (response) return response;
          
          return fetch(request).then(response => {
            if (response && response.status === 200) {
              const responseToCache = response.clone();
              cache.put(request, responseToCache);
            }
            return response;
          }).catch(() => {
            // Return offline image placeholder
            return new Response('<svg></svg>', { 
              headers: { 'Content-Type': 'image/svg+xml' } 
            });
          });
        });
      })
    );
    return;
  }

  // Default cache-then-network strategy
  event.respondWith(
    caches.match(request).then(response => {
      if (response) {
        console.log('[SW] Cache hit:', url.pathname);
        return response;
      }

      return fetch(request.clone()).then(response => {
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }

        const responseToCache = response.clone();
        caches.open(RUNTIME_CACHE).then(cache => {
          cache.put(request, responseToCache);
        });

        return response;
      }).catch(error => {
        console.error('[SW] Fetch failed:', url.pathname, error);
        // Return offline page or cached response
        return caches.match('/index.html');
      });
    })
  );
});

// Background Sync for failed requests (future enhancement)
self.addEventListener('sync', event => {
  if (event.tag === 'sync-records') {
    event.waitUntil(
      // Sync logic here
      Promise.resolve()
    );
  }
});
