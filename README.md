# VoiceGIS 🗺️🎙️

> **Voice-Enabled Geospatial Map Web Application (Proof-of-Concept)**  
> Offline-first voice command interface for Leaflet & OpenLayers web GIS applications.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Features

- 🎙️ **Voice-activated map control** — speak commands to navigate, zoom, add layers, place markers
- 🧠 **Dual recognition engines** — Web Speech API (sentences) + TensorFlow.js (offline keyword spotting)
- 🗺️ **Leaflet & OpenLayers** — switch between rendering engines on the fly
- 🛰️ **Public WMS layers** — OSM, NASA GIBS BlueMarble, Copernicus Land Cover, OpenTopoMap
- 📊 **Evaluation dashboard** — accuracy %, confidence scores, latency tracking, JSON/CSV export
- 🔌 **Modular library** — drop into any existing web GIS project

---

## Voice Commands

| Say… | Action |
|---|---|
| "Zoom in" / "Zoom out" | Zoom the map |
| "Go to Paris" | Fly to a known city |
| "Zoom to Ahmedabad" | Navigate to Ahmedabad |
| "Show me New York" | Navigate to New York |
| "Show satellite" | Enable NASA GIBS layer |
| "Show road view" | Enable OSM street layer |
| "Show terrain" | Enable topographic layer |
| "Show Bhuvan" | Enable Bhuvan India WMS (may fail due to CORS) |
| "Hide satellite" | Remove a layer |
| "Add marker" | Drop a pin at current view |
| "Add marker at my location" | Geolocate & place marker |
| "Switch to OpenLayers" | Switch map engine |
| "Reset view" | Return to world overview |

---

## Project Structure

```
Voice_map/
├── public/            # Standalone demo web app
│   ├── index.html     # Main demo UI
│   ├── style.css      # App styles
│   └── main.js        # Demo entry point (ES module)
├── src/               # Reusable library modules
│   ├── speechEngine.js   # Voice recognition (TF.js + Web Speech API)
│   ├── commandParser.js  # Text → map action intent parser
│   ├── mapController.js  # Leaflet / OpenLayers map controller
│   ├── evaluation.js     # Metrics & accuracy tracking
│   └── index.js          # Library entry point
├── __tests__/         # Jest unit tests
│   ├── commandParser.test.js
│   ├── evaluation.test.js
│   └── speechEngine.test.js
├── examples/
│   └── basic-leaflet.html  # Minimal integration example
├── docs/
│   ├── usage.md        # Usage guide & examples
│   └── api.md          # Full API reference
└── package.json
```

---

## Quick Start

### Run the demo

```bash
# Clone the repo
git clone https://github.com/SanishKumar/Voice_map.git
cd Voice_map

# Serve from the project root (Python)
python3 -m http.server 8080

# Then open:
# http://localhost:8080/public/
```

Or with Node.js:
```bash
npx serve .
# Open: http://localhost:3000/public/
```

### Use as a library in your project

```js
import {
  SpeechEngine,    // voice recognition
  parseCommand,    // text → intent
  MapController,   // map actions
  EvaluationTracker,
} from './src/index.js';

// 1. Set up the map
const map = new MapController({ engine: 'leaflet', containerId: 'my-map' });
map.init();

// 2. Set up voice recognition
const speech = new SpeechEngine({
  onResult(text, isFinal) {
    if (!isFinal) return;
    const cmd = parseCommand(text);
    if (cmd.intent === 'go_to') map.goTo(cmd.payload.coords);
    if (cmd.intent === 'zoom_in') map.zoomIn();
    // handle all intents…
  },
});
await speech.init();
speech.start();
```

See [`docs/usage.md`](docs/usage.md) for the full usage guide and [`docs/api.md`](docs/api.md) for the API reference.

---

## Speech Engine Guide

The app supports two voice recognition engines selectable in the toolbar:

### 1 · Web Speech API (default, recommended)

The **Web Speech API** is the default engine and works best for general purpose, free-form voice commands. It sends audio to the browser's cloud speech service (Google in Chrome, Microsoft in Edge) and returns full sentences. This gives significantly more accurate recognition for place names, layer names, and free-text commands.

**Best practices:**
- Use Chrome or Edge for full API support.
- Speak clearly and at a normal pace.
- Allow microphone permission when the browser prompts.
- Works with interim (in-progress) transcripts shown in the toolbar.

**Limitations:**
- Requires an internet connection on most browsers (Chrome/Edge use cloud ASR).
- Firefox does not support the Web Speech API.
- The microphone permission must be granted each session.

### 2 · TensorFlow.js (offline keyword spotting)

The **TF.js engine** uses the `@tensorflow-models/speech-commands` model for fully offline recognition. It detects a fixed set of short keywords (`up`, `down`, `left`, `right`, `go`, `stop`, `yes`, `no`) and maps them to map actions.

**Tuning (to reduce noise):**
- The confidence threshold is set to **0.85** (higher = fewer false positives but may miss quiet speech).
- A **1.5 s debounce** prevents the same word from firing more than once per utterance.
- Adjust these in code:
  ```js
  const engine = new SpeechEngine({
    engine: ENGINE_TYPE.TFJS,
    tfjsThreshold: 0.85,     // default; raise above 0.85 to cut more noise (range 0–1)
    tfjsCooldownMs: 1500,    // default; increase to suppress more rapid-fire duplicates
  });
  ```
- Reduce background noise: use a close-talk or noise-cancelling microphone.
- Speak the keywords crisply in a quiet room.

**Limitations:**
- Only the ~10 built-in keywords are recognised; free-form sentences are ignored.
- The 18 MB TF.js model loads from CDN on first use (~2–5 s on fast connections).
- GPU acceleration (WebGL) is used when available; falls back to CPU.
- Even with the best settings, false positives can occur in noisy environments — use Web Speech API for a better experience in those cases.

---

## WMS Sources

| Layer | URL | Status |
|---|---|---|
| OSM | `https://tile.openstreetmap.org` | ✅ Always available |
| NASA GIBS | `https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi` | ✅ Public, no auth |
| Copernicus Land | `https://image.discomap.eea.europa.eu/…/WmsServer` | ⚠ May have CORS |
| Bhuvan (NRSC) | `https://bhuvan-vec2.nrsc.gov.in/bhuvan/wms` | ❌ CORS-blocked |
| OpenTopoMap | `https://tile.opentopomap.org` | ✅ Public |

### WMS Troubleshooting

**NASA GIBS shows a blank / black map**  
The layer uses `BlueMarble_NextGeneration`, a static composite product that does not require a `TIME` parameter. If you see black tiles, verify that:
1. You are using WMS version `1.1.1` (not 1.3.0) — NASA GIBS requires 1.1.1 with `SRS=EPSG:3857`.
2. The browser is not blocking the CDN request (check the Network tab in DevTools).
3. Try zooming to a mid-level zoom (8–12) where tile coverage is dense.

> **Daily/near-real-time products** such as `MODIS_Terra_CorrectedReflectance_TrueColor` require a `TIME=YYYY-MM-DD` WMS parameter. Without it, the server returns blank tiles. Use `BlueMarble_NextGeneration` for a static demo that always works.

**Copernicus Land Cover shows no tiles**  
The EEA ArcGIS endpoint may return CORS headers that block browser requests depending on the origin. When tiles fail to load, the layer is automatically unchecked and a notification is shown. To work around this:
- Run a local CORS proxy: `npx cors-anywhere` and point the WMS URL to `http://localhost:8080/https://image.discomap.eea.europa.eu/…`.
- Or use a browser extension that relaxes CORS for development.

**Bhuvan (NRSC) does not load**  
The Bhuvan WMS endpoint (`bhuvan-vec2.nrsc.gov.in`) does not send CORS headers, so browser requests from any other origin are blocked by the browser's same-origin policy. This is a server-side limitation that cannot be worked around without a CORS proxy or server-side request forwarding. The Bhuvan layer has been removed from the quick-start sidebar for this reason; it is still available in `LAYER_DEFS` for server-side or proxied use.

**General WMS debugging tips**
1. Open DevTools → Network tab and filter for `wms` or `GetMap` requests.
2. Look for HTTP 4xx/5xx responses, CORS policy errors, or DNS failures.
3. Paste the tile URL into a new browser tab — if it shows an image, WMS works; if it fails, the issue is CORS or network.
4. Check `console.warn` messages — `MapController` logs a warning the first time each layer fails.

---

## NPM Dependencies

| Package | Purpose |
|---|---|
| `leaflet` | Map rendering |
| `ol` (OpenLayers) | Map rendering |
| `@tensorflow/tfjs` | Machine learning runtime |
| `@tensorflow-models/speech-commands` | Offline keyword spotting |
| `onnxruntime-web` | Optional: ONNX model inference (Whisper Tiny) |

> **Browser note:** The demo works directly from CDN — no build step required.

---

## Architecture

```
Browser
  │
  ├─ SpeechEngine ──► Web Speech API  (full sentence, online/offline)
  │                └► TF.js Speech Commands  (keyword spotting, offline GPU)
  │
  ├─ parseCommand  ──► INTENT + payload (place, layerId, engine…)
  │
  ├─ MapController ──► Leaflet  or  OpenLayers
  │                     │
  │                     └─ showLayer / hideLayer / goTo / zoomIn / addMarker
  │
  └─ EvaluationTracker ──► accuracy, latency, JSON/CSV export
```

---

## Running Tests

```bash
npm install --legacy-peer-deps
npm test
```

Tests use Jest with native ESM (`--experimental-vm-modules`). No build step needed.

---

## License

MIT
