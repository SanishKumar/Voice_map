# VoiceGIS — Usage Guide

## Quick Start

### Using the Orchestrator API (Recommended)

The easiest way to use VoiceGIS is via the `VoiceGIS` orchestrator class, which wires up the Speech Engine, Parser, and Map Controller for you.

```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="https://unpkg.com/leaflet/dist/leaflet.css" />
</head>
<body>
  <div id="map" style="width: 100vw; height: 100vh;"></div>
  
  <script type="module">
    import { VoiceGIS } from 'voicegis';

    const app = new VoiceGIS({
      mapEngine: 'leaflet',
      mapContainerId: 'map',
      speechEngine: 'whisper', 
      autoExecute: true
    });

    await app.initSpeech();
    app.start(); // Start listening
  </script>
</body>
</html>
```

---

## Supported Voice Commands

VoiceGIS understands a wide variety of natural language commands. 

| Category | Examples |
|---|---|
| **Navigation** | "Go to Paris", "Fly to London", "Zoom to Ahmedabad", "Show me New York" |
| **Zooming** | "Zoom in", "Magnify", "Zoom out", "Shrink", "Reset view", "Home" |
| **Layers** | "Show satellite", "Add NASA layer", "Hide roads", "Remove terrain" |
| **Markers** | "Add marker", "Drop a pin", "Add marker at my location" |
| **Engine Switching** | "Switch to OpenLayers", "Switch to Leaflet" |

### How Fuzzy Matching Works

You don't need to pronounce place names or layers perfectly. The built-in Levenshtein fuzzy matcher will automatically correct minor typos or mispronunciations. 

For example:
- "Show satalite" → `satellite`
- "Fly to Amdavad" → `Ahmedabad`

---

## Custom Commands Plugin API

You can easily extend VoiceGIS to understand custom commands specific to your application using the `.registerCommand()` method.

```js
const app = new VoiceGIS({ ... });

app.registerCommand('TOGGLE_DARK_MODE', /(switch|toggle) (to )?(dark|light) (mode|theme)/i, (mapController, match) => {
  const mode = match[3].toLowerCase();
  if (mode === 'dark') {
    document.body.style.background = '#000';
  } else {
    document.body.style.background = '#fff';
  }
});
```

The callback receives the underlying `MapController` instance, so you can execute actions on the map:

```js
app.registerCommand('DRAW_CIRCLE', /draw (a )?circle/i, (mapController, match) => {
  const center = mapController._map.getCenter();
  window.L.circle([center.lat, center.lng], { radius: 500 }).addTo(mapController._adapter._leafletMap);
});
```

---

## Modular Usage

If you prefer to wire things up manually instead of using the `VoiceGIS` orchestrator, you can import individual modules:

```js
import { WhisperEngine } from 'voicegis/engines';
import { parseCommand } from 'voicegis/parser';
import { MapController } from 'voicegis/map';

// 1. Setup Map
const mapCtrl = new MapController({ engine: 'leaflet', containerId: 'map' });
mapCtrl.init();

// 2. Setup Engine
const engine = new WhisperEngine({
  async onResult(text, isFinal) {
    if (!isFinal) return;
    
    // 3. Parse and execute
    const result = await parseCommand(text);
    
    if (result.intent === 'go_to') {
      mapCtrl.goTo(result.payload.coords, 12, result.payload.place);
    }
  }
});

await engine.init();
engine.start();
```

---

## Choosing a Speech Engine

| Engine | `speechEngine` | Description | Internet Req? |
|---|---|---|---|
| **Whisper** | `'whisper'` | Uses Transformers.js to run OpenAI's Whisper model via WebAssembly/WebGPU. High accuracy, full dictation. | No (after initial model download) |
| **Web Speech** | `'webspeech'` | Uses native `webkitSpeechRecognition`. Fast, but relies on Apple/Google servers. | Yes |
| **TF.js** | `'tfjs'` | Uses `@tensorflow-models/speech-commands`. Extremely lightweight, but only recognizes ~10 fixed keywords. | No |

If building for field use without internet access, use `'whisper'`.

---

## Evaluation Tracker

VoiceGIS includes a built-in evaluation tracker to measure recognition accuracy and latency during testing.

```js
import { EvaluationTracker } from 'voicegis/evaluation';

const tracker = new EvaluationTracker();

// Record a command
tracker.recordCommand({
  raw: 'go to Paris',
  intent: 'go_to',
  payload: { place: 'paris', coords: [48.8566, 2.3522] },
  confidence: 0.98,
  latency: 120
});

// View Stats
console.log(tracker.getStats().accuracy); 
```
