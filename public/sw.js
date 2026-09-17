// NiagaPOS Service Worker (SES v4.5 Compliant)
const CACHE_NAME = 'niagapos-pwa-v1';
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
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_PRECACHE).catch((err) => {
        console.debug('Service Worker precache partial warning:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return response;
        })
        .catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
    })
  );
});
