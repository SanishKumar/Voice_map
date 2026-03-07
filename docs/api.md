# VoiceGIS API Reference

## `SpeechEngine`

```
new SpeechEngine(options)
```

### Constructor options

| Option | Type | Default | Description |
|---|---|---|---|
| `engine` | `string` | `'webspeech'` | `ENGINE_TYPE.WEB_SPEECH` or `ENGINE_TYPE.TFJS` |
| `onResult` | `(text, isFinal) => void` | — | Fired on each recognition result |
| `onError` | `(Error) => void` | `console.error` | Fired on recognition error |
| `onStart` | `() => void` | noop | Fired when recognition starts |
| `onEnd` | `() => void` | noop | Fired when recognition ends |
| `tfjsThreshold` | `number` | `0.75` | Confidence threshold for TF.js keyword model (0–1) |

### Methods

| Method | Returns | Description |
|---|---|---|
| `init()` | `Promise<void>` | Load/initialise the chosen engine |
| `start()` | `void` | Begin listening |
| `stop()` | `void` | Stop listening |
| `toggle()` | `void` | Toggle start/stop |

### Properties

| Property | Type | Description |
|---|---|---|
| `isListening` | `boolean` | Whether engine is currently listening |

### Constants

```js
import { ENGINE_TYPE } from './src/speechEngine.js';
ENGINE_TYPE.WEB_SPEECH  // 'webspeech'
ENGINE_TYPE.TFJS        // 'tfjs'
```

---

## `parseCommand(text)`

```
parseCommand(text: string) → CommandResult
```

### `CommandResult`

| Field | Type | Description |
|---|---|---|
| `intent` | `string` | One of the `INTENT` values |
| `payload` | `object` | Intent-specific data (see below) |
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

### Helper exports

```js
import { resolveCity, resolveLayer, CITY_COORDS, LAYER_ALIASES, INTENT } from './src/commandParser.js';

resolveCity('paris')     // → [48.8566, 2.3522]
resolveLayer('road')     // → 'osm'
```

---

## `MapController`

```
new MapController(options)
```

### Constructor options

| Option | Type | Default | Description |
|---|---|---|---|
| `engine` | `string` | `'leaflet'` | `MAP_ENGINE.LEAFLET` or `MAP_ENGINE.OPENLAYERS` |
| `containerId` | `string` | `'map'` | ID of the container `<div>` |
| `onAction` | `(ActionEvent) => void` | noop | Called after each map mutation |

### `ActionEvent`

```js
{ action: string, latency: number, /* intent-specific fields */ }
```

### Methods

| Method | Returns | Description |
|---|---|---|
| `init()` | `void` | Create and render the map |
| `destroy()` | `void` | Destroy the map instance |
| `zoomIn()` | `void` | Increase zoom level by 1 |
| `zoomOut()` | `void` | Decrease zoom level by 1 |
| `goTo(latLng, zoom?, label?)` | `void` | Fly/pan to coordinates |
| `resetView()` | `void` | Return to default world view |
| `showLayer(layerId)` | `void` | Add/show a layer |
| `hideLayer(layerId)` | `void` | Remove/hide a layer |
| `addMarker(latLng, popupText?)` | `void` | Place a marker |
| `addMarkerAtCurrentLocation()` | `Promise<[lat,lng]>` | Geolocate and add marker |

### Constants

```js
import { MAP_ENGINE, LAYER_DEFS } from './src/mapController.js';
MAP_ENGINE.LEAFLET      // 'leaflet'
MAP_ENGINE.OPENLAYERS   // 'openlayers'
```

---

## `EvaluationTracker`

```
new EvaluationTracker()
```

### Methods

| Method | Returns | Description |
|---|---|---|
| `recordCommand(opts)` | `CommandRecord` | Add a command record |
| `markCorrection(correction, id?)` | `void` | Flag last/given record as incorrect |
| `getStats()` | `Stats` | Compute aggregate statistics |
| `exportJSON()` | `string` | JSON export of records + stats |
| `exportCSV()` | `string` | CSV export of records |
| `reset()` | `void` | Clear all records |

### `Stats`

| Field | Type | Description |
|---|---|---|
| `total` | `number` | Total commands |
| `recognized` | `number` | Commands with a known intent |
| `unknown` | `number` | Commands with `unknown` intent |
| `corrected` | `number` | User-corrected commands |
| `accuracy` | `number \| null` | `(recognized - corrected) / total` |
| `avgConfidence` | `number \| null` | Mean parser confidence |
| `avgLatency` | `number \| null` | Mean action execution time (ms) |
| `intentBreakdown` | `Record<string,number>` | Count per intent type |
| `sessionDurationMs` | `number` | Time since tracker creation |
