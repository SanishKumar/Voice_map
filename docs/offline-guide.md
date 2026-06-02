# VoiceGIS Offline & PWA Guide

One of the core features of VoiceGIS is its ability to run completely offline. This guide explains how to set up your project so it functions flawlessly without an internet connection.

## 1. On-Device Speech Recognition

To use VoiceGIS offline, you cannot use the `webspeech` engine (which requires an active internet connection to Apple/Google servers). You must use either `tfjs` or `whisper`.

- **`tfjs`**: Small download (~3MB), but only supports limited keywords. Best for simple apps.
- **`whisper`**: Downloads the Whisper AI model (~40MB ONNX format). Once cached, it supports full continuous dictation entirely offline.

```js
const app = new VoiceGIS({
  speechEngine: 'whisper' // Use whisper for offline capability
});
```

Transformers.js handles caching the Whisper model automatically via the browser's `Cache` API.

## 2. Setting Up a Service Worker

A Service Worker intercepts network requests and serves cached files when offline.

In your `index.html`:
```html
<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js');
    });
  }
</script>
```

In your `sw.js`:
```js
const CACHE_NAME = 'voicegis-cache-v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
```

## 3. Offline Geocoding

Nominatim (the default Geocoder) requires the internet to resolve place names to coordinates. If you are building an offline app, you should pre-configure the Geocoder with a list of important coordinates or supply your own custom offline resolver.

By default, VoiceGIS falls back to a hardcoded dictionary (`CITY_COORDS`) in `src/parser/CommandParser.js` when offline.

## 4. Map Tiles

Both Leaflet and OpenLayers fetch raster tiles from tile servers (e.g., OpenStreetMap) over the internet.
To have a true offline map:
- **Leaflet**: Use a plugin like `leaflet.offline` to cache tiles for specific areas.
- **OpenLayers**: Supply your own Vector Tiles or pre-downloaded GeoTIFFs stored locally.

> **Note**: Do not attempt to cache the `a.tile.openstreetmap.org` domain in your Service Worker, as it violates OSM's bulk usage policy.
