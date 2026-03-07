# VoiceGIS — Usage Guide

## Quick Start

### Run the demo locally

```bash
# Serve from the repo root (Python)
python3 -m http.server 8080
# Then open: http://localhost:8080/public/
```

Or with Node.js:
```bash
npx serve .
```

### Use as an npm library

```bash
npm install voicegis   # once published
```

```js
import { SpeechEngine, MapController, parseCommand, EvaluationTracker } from 'voicegis';
```

---

## Modules

### `SpeechEngine`

Handles voice recognition. Supports two backends:
- **Web Speech API** (`ENGINE_TYPE.WEB_SPEECH`) — full sentence recognition, online/offline depending on browser
- **TensorFlow.js** (`ENGINE_TYPE.TFJS`) — lightweight keyword spotting, fully offline

```js
import { SpeechEngine, ENGINE_TYPE } from './src/speechEngine.js';

const engine = new SpeechEngine({
  engine: ENGINE_TYPE.WEB_SPEECH,       // or ENGINE_TYPE.TFJS
  onResult(text, isFinal) {
    if (isFinal) console.log('Said:', text);
  },
  onError(err) { console.error(err); },
  onStart()    { console.log('Listening…'); },
  onEnd()      { console.log('Stopped'); },
  tfjsThreshold: 0.85,    // confidence cutoff for TF.js (raised from 0.75 to cut noise)
  tfjsCooldownMs: 1500,   // ms debounce between consecutive identical TF.js detections
});

await engine.init();
engine.start();   // begin listening
engine.stop();    // stop listening
engine.toggle();  // toggle on/off
```

#### Choosing an engine

| | Web Speech API | TF.js |
|---|---|---|
| **Accuracy** | High (cloud ASR) | Low–medium (fixed keywords only) |
| **Internet required** | Yes (Chrome/Edge) | No (fully offline) |
| **Supported vocabulary** | Free-form sentences | ~10 fixed keywords |
| **Noise sensitivity** | Low | High |
| **Best for** | General use | Strict offline requirement |

#### Reducing TF.js noise

The TF.js engine can produce false positives in noisy environments. Mitigations built-in:
- **Threshold 0.85** — only fire when the model is ≥85% confident (was 0.75).
- **Debounce 1500 ms** — suppress the same word if it repeats within 1.5 s.
- **overlapFactor 0.3** — fewer callback invocations per second vs. the default 0.5.

To tune further:
```js
new SpeechEngine({ engine: ENGINE_TYPE.TFJS, tfjsThreshold: 0.92, tfjsCooldownMs: 2500 });
```

---

### `parseCommand(text)`

Converts a recognised speech string into a structured action object.

```js
import { parseCommand, INTENT } from './src/commandParser.js';

const result = parseCommand('zoom to Ahmedabad');
// result → {
//   intent:     'go_to',
//   payload:    { place: 'ahmedabad', coords: [23.0225, 72.5714] },
//   raw:        'zoom to Ahmedabad',
//   confidence: 0.9
// }

switch (result.intent) {
  case INTENT.ZOOM_IN:    /* ... */ break;
  case INTENT.GO_TO:      /* result.payload.coords */ break;
  case INTENT.SHOW_LAYER: /* result.payload.layerId */ break;
  // …
}
```

**Supported intents:**

| Intent | Trigger example |
|---|---|
| `zoom_in`    | "zoom in", "magnify" |
| `zoom_out`   | "zoom out", "shrink" |
| `go_to`      | "go to Paris", "zoom to Mumbai", "show me New York" |
| `show_layer` | "show satellite", "add NASA layer" |
| `hide_layer` | "hide satellite", "remove terrain" |
| `add_marker` | "add marker", "add marker at my location" |
| `switch_map` | "switch to OpenLayers", "switch to Leaflet" |
| `reset_view` | "reset view", "home" |
| `unknown`    | unrecognised utterance |

---

### `MapController`

Provides a unified API over Leaflet and OpenLayers.

```js
import { MapController, MAP_ENGINE, LAYER_DEFS } from './src/mapController.js';

const ctrl = new MapController({
  engine:      MAP_ENGINE.LEAFLET,    // or MAP_ENGINE.OPENLAYERS
  containerId: 'my-map',             // id of the map div
  onAction({ action, latency }) {
    console.log(`${action} executed in ${latency.toFixed(1)} ms`);
  },
});

ctrl.init();

// Navigation
ctrl.goTo([48.8566, 2.3522], 12, 'Paris');
ctrl.zoomIn();
ctrl.zoomOut();
ctrl.resetView();

// Layers  (keys from LAYER_DEFS: 'osm', 'nasa', 'bhuvan', 'copernicus', 'terrain')
ctrl.showLayer('nasa');
ctrl.hideLayer('nasa');

// Markers
ctrl.addMarker([48.8566, 2.3522], 'Hello Paris');
await ctrl.addMarkerAtCurrentLocation();  // uses Geolocation API

// Cleanup
ctrl.destroy();
```

**Available layers:**

| id | Name | Source | Notes |
|---|---|---|---|
| `osm`        | OpenStreetMap       | `tile.openstreetmap.org` | ✅ Always works |
| `nasa`       | NASA GIBS Satellite | `gibs.earthdata.nasa.gov` | ✅ Static BlueMarble layer |
| `copernicus` | Copernicus Land     | `image.discomap.eea.europa.eu` | ⚠ May be blocked by CORS |
| `terrain`    | OpenTopoMap         | `tile.opentopomap.org` | ✅ Always works |
| `bhuvan`     | Bhuvan (NRSC India) | `bhuvan-vec2.nrsc.gov.in` | ❌ CORS-blocked in browsers |

> **Bhuvan note:** The Bhuvan WMS server does not send CORS headers, so browser requests
> from any origin other than its own domain are blocked. The layer is available in
> `LAYER_DEFS` for server-side or proxied integrations, but is not shown in the
> quick-start demo sidebar.

---

### `EvaluationTracker`

Tracks command recognition accuracy and action latency.

```js
import { EvaluationTracker } from './src/evaluation.js';

const tracker = new EvaluationTracker();

tracker.recordCommand({
  raw:        'go to Paris',
  intent:     'go_to',
  payload:    { place: 'paris', coords: [48.8566, 2.3522] },
  confidence: 0.9,
  latency:    42,            // ms
});

// Mark as incorrect (user corrected)
tracker.markCorrection('zoom_in');

const stats = tracker.getStats();
console.log(stats.accuracy);      // 0–1
console.log(stats.avgLatency);    // ms

// Export
const json = tracker.exportJSON();
const csv  = tracker.exportCSV();

tracker.reset();  // clear records
```

---

## Voice Command Examples

```
"Zoom in"
"Zoom out"
"Go to Paris"
"Zoom to Ahmedabad"
"Show me New York on the map"
"Fly to Tokyo"
"Show satellite"
"Show NASA layer"
"Show road view"
"Show terrain"
"Add Bhuvan layer"
"Hide satellite"
"Remove NASA"
"Add marker"
"Add marker at my location"
"Switch to OpenLayers"
"Switch to Leaflet"
"Reset view"
"Home"
```

---

## Supported Cities

Ahmedabad, Paris, New York, London, Tokyo, Mumbai, Delhi, Sydney, Beijing,
Moscow, Berlin, Los Angeles, Chicago, Toronto, Dubai, Singapore, Cairo,
Lagos, Nairobi, Sao Paulo, Buenos Aires, Mexico City, Bangalore, Kolkata,
Chennai, Hyderabad, Pune, Rome, Madrid, Amsterdam, Stockholm, Oslo, Seoul,
Kuala Lumpur, Bangkok, Jakarta, Manila, Karachi, Dhaka, Tehran, Istanbul,
Accra, Cape Town, Johannesburg.

To add more cities, extend `CITY_COORDS` in `src/commandParser.js`.

---

## Extending

### Add a new city

Edit `src/commandParser.js`:
```js
export const CITY_COORDS = {
  // ...existing entries...
  'your city': [lat, lng],
};
```

### Add a new layer

Edit `src/mapController.js`:
```js
export const LAYER_DEFS = {
  // ...existing entries...
  myLayer: {
    id: 'myLayer',
    label: 'My Custom Layer',
    type: 'wms',                                  // or 'tile'
    url:  'https://my-wms-server.example/wms',
    layers: 'my_layer_name',
    format: 'image/png',
    transparent: true,
    attribution: '© My Source',
  },
};
```

Then add a layer alias in `src/commandParser.js`:
```js
export const LAYER_ALIASES = {
  // ...
  'my layer': 'myLayer',
  'my custom': 'myLayer',
};
```
