// NiagaPOS Service Worker (Network-First Strategy with Cache Invalidation)
const CACHE_NAME = 'niagapos-pwa-v2.4';

const ASSETS_TO_PRECACHE = [
  '/',
  '/index.html',
  '/site.webmanifest',
  '/manifest.json',
  'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/NiagaPOS/favicon.svg',
  'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/NiagaPOS/favicon.ico',
  'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/NiagaPOS/favicon-96x96.png',
  'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/NiagaPOS/favicon-48x48.png',
  'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/NiagaPOS/favicon-32x32.png',
  'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/NiagaPOS/favicon-16x16.png',
  'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/NiagaPOS/apple-touch-icon.png',
  'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/NiagaPOS/android-chrome-192x192.png',
  'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/NiagaPOS/android-chrome-512x512.png',
  'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/NiagaPOS/web-app-manifest-192x192.png',
  'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/NiagaPOS/web-app-manifest-512x512.png',
  'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/NiagaPOS/mstile-150x150.png'
];

self.addEventListener('install', (event) => {
  // Force active immediately
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_PRECACHE).catch((err) => {
        console.debug('Service Worker precache partial warning:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Network-First for HTML/JS/CSS navigation and code requests so updates are immediate
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // For app navigation and local scripts, use Network-First to ensure instant freshness
  const isNavigation = event.request.mode === 'navigate';
  const isLocalAsset = url.origin === self.location.origin;

  if (isNavigation || isLocalAsset) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          // Fallback to cache when offline
          return caches.match(event.request).then((cached) => {
            if (cached) return cached;
            if (isNavigation) return caches.match('/index.html');
          });
        })
    );
    return;
  }

  // Cache-first for external static logos/icons
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      });
    })
  );
});
