/**
 * commandParser.test.js — unit tests for src/commandParser.js
 */

import {
  parseCommand,
  resolveCity,
  resolveLayer,
  INTENT,
  CITY_COORDS,
  LAYER_ALIASES,
} from '../src/commandParser.js';

// ---------------------------------------------------------------------------
// resolveCity
// ---------------------------------------------------------------------------

describe('resolveCity', () => {
  test('returns coords for a known city (lowercase)', () => {
    expect(resolveCity('paris')).toEqual([48.8566, 2.3522]);
  });

  test('lowercases input before lookup', () => {
    // resolveCity normalises the input itself
    expect(resolveCity('Paris')).toEqual([48.8566, 2.3522]);
  });

  test('returns null for unknown city', () => {
    expect(resolveCity('atlantis')).toBeNull();
  });

  test('returns null for empty input', () => {
    expect(resolveCity('')).toBeNull();
    expect(resolveCity(null)).toBeNull();
  });

  test('multi-word city names resolve', () => {
    expect(resolveCity('new york')).toEqual([40.7128, -74.006]);
    expect(resolveCity('los angeles')).toEqual([34.0522, -118.2437]);
  });
});

// ---------------------------------------------------------------------------
// resolveLayer
// ---------------------------------------------------------------------------

describe('resolveLayer', () => {
  test('resolves canonical alias', () => {
    expect(resolveLayer('osm')).toBe('osm');
    expect(resolveLayer('nasa')).toBe('nasa');
  });

  test('resolves friendly aliases', () => {
    expect(resolveLayer('satellite')).toBe('nasa');
    expect(resolveLayer('road view')).toBe('osm');
    expect(resolveLayer('terrain')).toBe('terrain');
  });

  test('returns null for unknown alias', () => {
    expect(resolveLayer('unknown-layer')).toBeNull();
  });

  test('returns null for empty / null input', () => {
    expect(resolveLayer('')).toBeNull();
    expect(resolveLayer(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseCommand — zoom
// ---------------------------------------------------------------------------

describe('parseCommand — zoom', () => {
  test('zoom in', () => {
    const r = parseCommand('zoom in');
    expect(r.intent).toBe(INTENT.ZOOM_IN);
    expect(r.confidence).toBeGreaterThan(0);
  });

  test('zoom out', () => {
    const r = parseCommand('zoom out');
    expect(r.intent).toBe(INTENT.ZOOM_OUT);
  });

  test('magnify → zoom in', () => {
    expect(parseCommand('magnify the map').intent).toBe(INTENT.ZOOM_IN);
  });

  test('shrink → zoom out', () => {
    expect(parseCommand('shrink the map').intent).toBe(INTENT.ZOOM_OUT);
  });
});

// ---------------------------------------------------------------------------
// parseCommand — go to
// ---------------------------------------------------------------------------

describe('parseCommand — go to', () => {
  test('go to <city>', () => {
    const r = parseCommand('go to paris');
    expect(r.intent).toBe(INTENT.GO_TO);
    expect(r.payload.place).toBe('paris');
    expect(r.payload.coords).toEqual(CITY_COORDS.paris);
  });

  test('zoom to <city>', () => {
    const r = parseCommand('zoom to ahmedabad');
    expect(r.intent).toBe(INTENT.GO_TO);
    expect(r.payload.coords).toEqual(CITY_COORDS.ahmedabad);
  });

  test('fly to <city>', () => {
    const r = parseCommand('fly to tokyo');
    expect(r.intent).toBe(INTENT.GO_TO);
    expect(r.payload.place).toBe('tokyo');
  });

  test('show me <city>', () => {
    const r = parseCommand('show me london');
    expect(r.intent).toBe(INTENT.GO_TO);
  });

  test('unknown city → unknown intent', () => {
    const r = parseCommand('go to atlantis');
    expect(r.intent).toBe(INTENT.UNKNOWN);
  });
});

// ---------------------------------------------------------------------------
// parseCommand — layers
// ---------------------------------------------------------------------------

describe('parseCommand — show/hide layer', () => {
  test('show satellite', () => {
    const r = parseCommand('show satellite');
    expect(r.intent).toBe(INTENT.SHOW_LAYER);
    expect(r.payload.layerId).toBe('nasa');
  });

  test('show NASA layer', () => {
    const r = parseCommand('show NASA layer');
    expect(r.intent).toBe(INTENT.SHOW_LAYER);
    expect(r.payload.layerId).toBe('nasa');
  });

  test('show road view', () => {
    const r = parseCommand('show road view');
    expect(r.intent).toBe(INTENT.SHOW_LAYER);
    expect(r.payload.layerId).toBe('osm');
  });

  test('hide satellite', () => {
    const r = parseCommand('hide satellite');
    expect(r.intent).toBe(INTENT.HIDE_LAYER);
    expect(r.payload.layerId).toBe('nasa');
  });

  test('remove terrain', () => {
    const r = parseCommand('remove terrain');
    expect(r.intent).toBe(INTENT.HIDE_LAYER);
    expect(r.payload.layerId).toBe('terrain');
  });
});

// ---------------------------------------------------------------------------
// parseCommand — markers
// ---------------------------------------------------------------------------

describe('parseCommand — add marker', () => {
  test('add marker', () => {
    const r = parseCommand('add marker');
    expect(r.intent).toBe(INTENT.ADD_MARKER);
    expect(r.payload.useCurrentLocation).toBe(false);
  });

  test('add marker at my location', () => {
    const r = parseCommand('add marker at my location');
    expect(r.intent).toBe(INTENT.ADD_MARKER);
    expect(r.payload.useCurrentLocation).toBe(true);
  });

  test('drop a pin here', () => {
    const r = parseCommand('drop a pin here');
    expect(r.intent).toBe(INTENT.ADD_MARKER);
    expect(r.payload.useCurrentLocation).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseCommand — switch map engine
// ---------------------------------------------------------------------------

describe('parseCommand — switch map', () => {
  test('switch to openlayers', () => {
    const r = parseCommand('switch to openlayers');
    expect(r.intent).toBe(INTENT.SWITCH_MAP);
    expect(r.payload.engine).toBe('openlayers');
  });

  test('switch to leaflet', () => {
    const r = parseCommand('switch to leaflet');
    expect(r.intent).toBe(INTENT.SWITCH_MAP);
    expect(r.payload.engine).toBe('leaflet');
  });
});

// ---------------------------------------------------------------------------
// parseCommand — reset
// ---------------------------------------------------------------------------

describe('parseCommand — reset view', () => {
  test('reset view', () => {
    expect(parseCommand('reset view').intent).toBe(INTENT.RESET_VIEW);
  });

  test('home', () => {
    expect(parseCommand('home').intent).toBe(INTENT.RESET_VIEW);
  });
});

// ---------------------------------------------------------------------------
// parseCommand — edge cases
// ---------------------------------------------------------------------------

describe('parseCommand — edge cases', () => {
  test('empty string → unknown', () => {
    expect(parseCommand('').intent).toBe(INTENT.UNKNOWN);
  });

  test('null → unknown', () => {
    expect(parseCommand(null).intent).toBe(INTENT.UNKNOWN);
  });

  test('completely random text → unknown', () => {
    expect(parseCommand('the quick brown fox').intent).toBe(INTENT.UNKNOWN);
  });

  test('raw text is preserved in result', () => {
    const r = parseCommand('Zoom In Please');
    expect(r.raw).toBe('Zoom In Please');
  });
});
