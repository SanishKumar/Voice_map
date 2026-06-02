const CACHE_NAME = 'voicegis-v1';

// App shell resources to cache immediately
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './main.js',
  './manifest.json',
];

// External CDNs to cache dynamically
const CDN_URLS = [
  'unpkg.com',
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Caching app shell');
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME && !key.includes('transformers-cache')) {
            console.log('[ServiceWorker] Removing old cache', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Skip caching for API endpoints like Nominatim (geocoder handles its own caching),
  // map tiles (Leaflet/OL handles them or they are too many), and browser extensions.
  if (
    url.hostname.includes('nominatim') ||
    url.hostname.includes('tile.openstreetmap') ||
    url.hostname.includes('gibs.earthdata.nasa.gov') ||
    url.hostname.includes('bhuvan') ||
    url.protocol === 'chrome-extension:' ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  // 2. Cache-First strategy for external CDN libraries (they rarely change)
  const isCDN = CDN_URLS.some(domain => url.hostname.includes(domain));
  if (isCDN) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(event.request).then((networkResponse) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        });
      })
    );
    return;
  }

  // 3. Stale-While-Revalidate for app shell (HTML/CSS/JS)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, networkResponse.clone());
        });
        return networkResponse;
      }).catch(() => {
        // Network failed (offline)
        return cachedResponse;
      });

      return cachedResponse || fetchPromise;
    })
  );
});
