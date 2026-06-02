<div align="center">
  <img src="https://raw.githubusercontent.com/sanishkumar/VoiceGIS/main/demo/favicon.svg" width="120" height="120" alt="VoiceGIS Logo" />
  <h1>VoiceGIS</h1>
  <p><strong>A Real-World Hybrid Voice Interface for Web GIS</strong></p>
  
  <p>
    <a href="https://www.npmjs.com/package/voicegis"><img src="https://img.shields.io/npm/v/voicegis" alt="NPM Version" /></a>
    <img src="https://img.shields.io/bundlephobia/minzip/voicegis" alt="Bundle Size" />
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" />
  </p>
</div>

---

**VoiceGIS** is a JavaScript library that adds powerful voice-control capabilities to web-based maps (Leaflet and OpenLayers). It uses a **hybrid architecture** with multiple deployment profiles—ranging from fast online cloud STT, to robust on-device AI (Whisper), down to constrained offline edge keyword spotting.

## 🚀 Why Hybrid? (Reality Check)

Browser-based speech recognition is a game of tradeoffs between bandwidth, accuracy, and latency. VoiceGIS embraces this reality:

1. **Web Speech API (Cloud)**: Convenient, instant, and highly accurate. However, it is often cloud‑backed and not fully under app control (audio may leave the device). Furthermore, it is only natively supported in some browsers (e.g., Chrome/Edge) and not fully supported in Firefox/Safari. It typically does not work offline.
2. **Browser-Only Whisper (On-Device)**: Provides excellent offline accuracy and privacy, but involves downloading a large model (on the order of a few-dozen MB for `tiny.en`, and 2-3x larger for `base.en`) and is compute-heavy. It is best used as an advanced or offline-fallback option.
3. **TF.js Command Mode (Edge KWS)**: Tiny, instantaneous keyword spotting engines are what real edge/embedded systems use for always-on commands. While limited to a fixed vocabulary, it operates flawlessly offline on constrained devices without massive downloads.

VoiceGIS's default `auto` strategy seamlessly routes between these engines depending on the user's connection and browser capabilities.

## 📦 Engine Profiles

| Profile | Engine Layer | Best For | Tradeoffs |
| --- | --- | --- | --- |
| **Auto (Hybrid)** | `VoiceGIS` orchestrator | Consumer web apps | Switches dynamically between Cloud and Whisper based on network. |
| **Online Cloud** | `WebSpeechEngine` | Fast, low-latency UX | Requires internet; audio may be sent to third-party cloud. |
| **Offline Advanced** | `WhisperEngine` | Privacy, offline fields | Requires downloading 40MB+ model; high CPU usage. |
| **Offline Command** | `TfjsEngine` | Constrained devices | Only understands a small, fixed set of GIS commands. |
| **Private Server** | `WhisperServerEngine` | Enterprise / Secure Intranets | Requires hosting your own Whisper API backend. |

## 📦 Installation

```bash
npm install voicegis
```

*(Note: `leaflet` or `ol` are peer dependencies. Install the one you plan to use.)*

## ⏱️ Quickstart

### 1. Auto Mode (Recommended)

```javascript
import { VoiceGIS } from 'voicegis';

const app = new VoiceGIS({
  mapEngine: 'leaflet',
  mapContainerId: 'map',
  speechEngine: 'auto', // Intelligently routes between WebSpeech and Whisper
  autoExecute: true
});

await app.initSpeech();
app.start();
```

### 2. Private Server Mode

If you are hosting your own Whisper endpoint (e.g. `whisper.cpp` server):

```javascript
import { VoiceGIS } from 'voicegis';

const app = new VoiceGIS({
  speechEngine: 'server',
  autoExecute: true
});

// Configure the backend API URL
app.speech.apiUrl = 'http://localhost:8000/transcribe';

await app.initSpeech();
app.start();
```

### 3. Explicit Offline Command Mode

```javascript
import { VoiceGIS } from 'voicegis';

const app = new VoiceGIS({
  speechEngine: 'tfjs', // Forces the tiny edge keyword spotter
  autoExecute: true
});

await app.initSpeech();
app.start();
```

## 📖 Architecture & Advanced Usage

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for a deep dive into the internal modules, state management, and deployment profiles.

## 🛠️ Limitations & Future Work

- **TF.js Engine**: The current `TfjsEngine` acts as a limited "Offline Command Mode" and is not a purpose-trained Keyword Spotting (KWS) model for VoiceGIS. A future iteration could train a custom small model specifically tuned to GIS commands.
- **Server Engine**: The `WhisperServerEngine` acts as an HTTP client stub. The actual Python/Go backend server implementation is out of scope for the core library.

## 📝 License

MIT © Sanish Kumar
