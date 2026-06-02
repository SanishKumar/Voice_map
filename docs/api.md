# VoiceGIS API Reference

VoiceGIS exports its modules under a top-level orchestrator class, as well as individual modules for advanced use cases.

---

## `VoiceGIS` Orchestrator

The main entry point for most applications.

```js
import { VoiceGIS } from 'voicegis';

const app = new VoiceGIS(options);
```

### Constructor options

| Option | Type | Default | Description |
|---|---|---|---|
| `mapEngine` | `string` | `'leaflet'` | `'leaflet'` or `'openlayers'` |
| `mapContainerId` | `string` | `'map'` | ID of the container `<div>` |
| `speechEngine` | `string` | `'webspeech'` | `'webspeech'`, `'whisper'`, or `'tfjs'` |
| `autoExecute` | `boolean` | `true` | If true, automatically executes parsed commands on the map |
| `onStateChange` | `(state: string) => void` | noop | Fired when the speech engine state changes |
| `onCommandParsed` | `(result, text) => void`| noop | Fired when a command is parsed |

### Methods

| Method | Returns | Description |
|---|---|---|
| `initSpeech()` | `Promise<void>` | Initializes the speech engine |
| `start()` | `void` | Starts listening for speech |
| `stop()` | `void` | Stops listening |
| `registerCommand(intent, regex, action)` | `void` | Registers a custom command |

---

## `parseCommand(text)`

The core NLP parser for turning transcripts into structured intents.

```js
import { parseCommand } from 'voicegis/parser';

const result = await parseCommand("fly to paris");
```

> **Note**: `parseCommand` is **asynchronous** because it may need to hit the Nominatim API for geocoding unknown cities.

### `CommandResult`

| Field | Type | Description |
|---|---|---|
| `intent` | `string` | One of the `INTENT` values |
| `payload` | `object` | Intent-specific data |
| `raw` | `string` | Original input text |
| `confidence` | `number` | Parser confidence 0–1 |

### Payload shapes per intent

| Intent | Payload |
|---|---|
| `zoom_in` | `{}` |
| `zoom_out` | `{}` |
| `go_to` | `{ place: string, coords: [lat, lng] }` |
| `show_layer` | `{ layerId: string, alias: string }` |
| `hide_layer` | `{ layerId: string, alias: string }` |
| `add_marker` | `{ useCurrentLocation: boolean }` |
| `switch_map` | `{ engine: 'leaflet' \| 'openlayers' }` |
| `reset_view` | `{}` |
| `unknown` | `{}` |

---

## `Geocoder`

A Nominatim API wrapper with LRU caching and rate limiting.

```js
import { Geocoder } from 'voicegis/parser';

const geocoder = new Geocoder({
  baseUrl: 'https://nominatim.openstreetmap.org/search',
  cacheSize: 50,
  rateLimitMs: 1100
});

const coords = await geocoder.geocode("Ahmedabad"); // [lat, lng]
```

---

## `WhisperEngine`

The on-device Transformers.js integration.

```js
import { WhisperEngine } from 'voicegis/engines';

const engine = new WhisperEngine({
  onResult: (text) => console.log(text),
  onModelProgress: (info) => console.log(`${info.status}: ${info.progress}%`)
});
await engine.init();
engine.start();
```

---

## `MapController`

```js
import { MapController } from 'voicegis/map';

const mapCtrl = new MapController({
  engine: 'leaflet',
  containerId: 'map'
});
mapCtrl.init();
mapCtrl.goTo([48.8566, 2.3522], 12, 'Paris');
```

See the [source code](https://github.com/sanishkumar/VoiceGIS) for full class definitions.
