# VoiceGIS 🗺️🎙️

> **Voice-Enabled Geospatial Map Web Application (Proof-of-Concept)**  
> Offline-first voice command interface for Leaflet & OpenLayers web GIS applications.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Features

- 🎙️ **Voice-activated map control** — speak commands to navigate, zoom, add layers, place markers
- 🧠 **Dual recognition engines** — Web Speech API (sentences) + TensorFlow.js (offline keyword spotting)
- 🗺️ **Leaflet & OpenLayers** — switch between rendering engines on the fly
- 🛰️ **Public WMS layers** — OSM, NASA GIBS, Bhuvan (NRSC), Copernicus
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
| "Show Bhuvan" | Enable Bhuvan India WMS |
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

## WMS Sources

| Layer | URL | Provider |
|---|---|---|
| OSM | `https://tile.openstreetmap.org` | OpenStreetMap |
| NASA GIBS | `https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi` | NASA Worldview |
| Bhuvan | `https://bhuvan-vec2.nrsc.gov.in/bhuvan/wms` | NRSC / ISRO |
| Copernicus | `https://image.discomap.eea.europa.eu/arcgis/services/Corine/CLC2018_WM/MapServer/WmsServer` | EEA / Copernicus Land Monitoring |
| OpenTopoMap | `https://tile.opentopomap.org` | OpenTopoMap |

> **Note:** The original Copernicus vito.be endpoint was replaced because `land.copernicus.vgt.vito.be` is no longer publicly reachable (ERR_NAME_NOT_RESOLVED). The EEA endpoint above serves the same CORINE Land Cover 2018 dataset.

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

## License

MIT
