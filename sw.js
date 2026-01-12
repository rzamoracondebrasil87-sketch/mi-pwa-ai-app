
// Nombre de la cache
const CACHE_NAME = 'gemini-pwa-cache-v2';

// Archivos para cachear
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Instalar el Service Worker y cachear recursos
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        if (self && self.console && process?.env?.NODE_ENV !== 'production') {
          try { self.console.log('Cache abierto'); } catch (e) { /* ignore */ }
        }
        return cache.addAll(urlsToCache);
      })
  );
});

// Interceptar solicitudes y servir desde cache cuando sea posible
self.addEventListener('fetch', event => {
  // No cachear llamadas a la API de Google AI
  if (event.request.url.includes('generativelanguage.googleapis.com')) {
    return;
  }

  // Permitir cachear solicitudes de CDN (esm.sh, jsdelivr para Tesseract)
  // Tesseract descarga archivos .traineddata.gz que son vitales para el offline.
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - devolver la respuesta desde cache
        if (response) {
          return response;
        }
        
        const fetchRequest = event.request.clone();
        
        return fetch(fetchRequest).then(
          response => {
            // Verificar que la respuesta sea válida
            if(!response || response.status !== 200 || response.type !== 'basic' && response.type !== 'cors') {
              return response;
            }
            
            // Clonar la respuesta para cachearla
            const responseToCache = response.clone();
            
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
              
            return response;
          }
        );
      })
    );
});

// Limpiar caches antiguas al activar
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
