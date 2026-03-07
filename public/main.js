/**
 * main.js — VoiceGIS demo entry point (ES module)
 *
 * Wires together:
 *   SpeechEngine  → SpeechEngine recognises speech and emits text
 *   parseCommand  → converts text to structured action
 *   MapController → executes the action on the map
 *   EvaluationTracker → records metrics
 */

import { SpeechEngine, ENGINE_TYPE }  from '../src/speechEngine.js';
import { parseCommand, INTENT }        from '../src/commandParser.js';
import { MapController, MAP_ENGINE }   from '../src/mapController.js';
import { EvaluationTracker }           from '../src/evaluation.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let currentMapEngine = MAP_ENGINE.LEAFLET;
let speechEngine     = null;
let mapController    = null;
const tracker        = new EvaluationTracker();

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const voiceBtn       = document.getElementById('voice-btn');
const voiceLabel     = document.getElementById('voice-label');
const engineSelect   = document.getElementById('engine-select');
const mapSelect      = document.getElementById('map-select');
const transcriptEl   = document.getElementById('transcript');
const commandLog     = document.getElementById('command-log');
const helpBtn        = document.getElementById('help-btn');
const helpModal      = document.getElementById('help-modal');
const modalCloseBtn  = document.getElementById('modal-close-btn');
const mapOverlay     = document.getElementById('map-overlay');
const overlayMsg     = document.getElementById('overlay-msg');
const notifContainer = document.getElementById('notif-container');

// status bar
const statusEngine   = document.getElementById('status-engine');
const statusMap      = document.getElementById('status-map');
const statusCoords   = document.getElementById('status-coords');
const statusZoom     = document.getElementById('status-zoom');

// stats
const statTotal      = document.getElementById('stat-total');
const statRecognized = document.getElementById('stat-recognized');
const statUnknown    = document.getElementById('stat-unknown');
const statAccuracy   = document.getElementById('stat-accuracy');
const statConfidence = document.getElementById('stat-confidence');
const statLatency    = document.getElementById('stat-latency');
const statSession    = document.getElementById('stat-session');

// ---------------------------------------------------------------------------
// Map initialisation
// ---------------------------------------------------------------------------

function initMap(engine) {
  if (mapController) {
    mapController.destroy();
  }

  // Show the correct container
  const leafletDiv = document.getElementById('leaflet-map');
  const olDiv      = document.getElementById('ol-map');

  if (engine === MAP_ENGINE.OPENLAYERS) {
    leafletDiv.style.display = 'none';
    olDiv.style.display      = 'block';
  } else {
    olDiv.style.display      = 'none';
    leafletDiv.style.display = 'block';
  }

  const containerId = engine === MAP_ENGINE.OPENLAYERS ? 'ol-map' : 'leaflet-map';

  mapController = new MapController({
    engine,
    containerId,
    onAction: handleMapAction,
  });
  mapController.init();
  currentMapEngine = engine;

  statusMap.textContent = `Map: ${engine === MAP_ENGINE.LEAFLET ? 'Leaflet' : 'OpenLayers'}`;

  // Track zoom / coords on move
  if (engine === MAP_ENGINE.LEAFLET) {
    mapController._map.on('moveend', updateStatusBar);
    mapController._map.on('zoomend', updateStatusBar);
  } else {
    mapController._map.getView().on('change', updateStatusBar);
  }

  updateStatusBar();
  syncLayerToggles();
}

function updateStatusBar() {
  if (!mapController || !mapController._map) return;

  if (currentMapEngine === MAP_ENGINE.LEAFLET) {
    const c = mapController._map.getCenter();
    statusCoords.textContent = `Lat/Lng: ${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}`;
    statusZoom.textContent   = `Zoom: ${mapController._map.getZoom()}`;
  } else {
    const ol = window.ol;
    const view  = mapController._map.getView();
    const coord = ol.proj.toLonLat(view.getCenter());
    statusCoords.textContent = `Lat/Lng: ${coord[1].toFixed(4)}, ${coord[0].toFixed(4)}`;
    statusZoom.textContent   = `Zoom: ${Math.round(view.getZoom())}`;
  }
}

// ---------------------------------------------------------------------------
// Layer toggles (sidebar checkboxes ↔ map)
// ---------------------------------------------------------------------------

function syncLayerToggles() {
  document.querySelectorAll('[data-layer]').forEach((cb) => {
    cb.onchange = () => {
      if (cb.checked) {
        mapController.showLayer(cb.dataset.layer);
      } else {
        mapController.hideLayer(cb.dataset.layer);
      }
    };
  });
}

function setLayerCheckbox(layerId, checked) {
  const cb = document.querySelector(`[data-layer="${layerId}"]`);
  if (cb) cb.checked = checked;
}

// ---------------------------------------------------------------------------
// Speech engine initialisation
// ---------------------------------------------------------------------------

async function initSpeechEngine(type) {
  if (speechEngine && speechEngine.isListening) {
    speechEngine.stop();
  }

  speechEngine = new SpeechEngine({
    engine: type,
    onResult: handleSpeechResult,
    onError:  handleSpeechError,
    onStart:  () => {
      voiceBtn.classList.add('listening');
      voiceLabel.textContent = 'Listening…';
    },
    onEnd: () => {
      voiceBtn.classList.remove('listening');
      voiceLabel.textContent = 'Start Listening';
    },
  });

  try {
    await speechEngine.init();
    statusEngine.textContent = `Engine: ${type === ENGINE_TYPE.TFJS ? 'TensorFlow.js' : 'Web Speech API'}`;
  } catch (err) {
    showNotif(`⚠ ${err.message}`, 'error');
    console.error(err);
  }
}

// ---------------------------------------------------------------------------
// Speech result handling
// ---------------------------------------------------------------------------

function handleSpeechResult(text, isFinal) {
  // Always show transcript, even interim
  transcriptEl.textContent = text;
  transcriptEl.className   = isFinal ? 'final' : 'interim';

  if (!isFinal) return;

  // Parse the final utterance
  const t0     = performance.now();
  const result = parseCommand(text);
  const parseTime = performance.now() - t0;

  // Execute map action
  const actionLatency = executeAction(result);

  // Record in tracker
  tracker.recordCommand({
    raw:        text,
    intent:     result.intent,
    payload:    result.payload,
    confidence: result.confidence,
    latency:    actionLatency + parseTime,
  });

  // Add to log
  addLogEntry(result, text);
  updateStats();
}

function handleSpeechError(err) {
  showNotif(`🎙️ ${err.message}`, 'error');
  console.warn('[Speech]', err);
}

// ---------------------------------------------------------------------------
// Map action execution
// ---------------------------------------------------------------------------

function executeAction(result) {
  const t0 = performance.now();

  switch (result.intent) {
    case INTENT.ZOOM_IN:
      mapController.zoomIn();
      showNotif('🔍 Zoomed in', 'success');
      break;

    case INTENT.ZOOM_OUT:
      mapController.zoomOut();
      showNotif('🔍 Zoomed out', 'success');
      break;

    case INTENT.GO_TO: {
      const { place, coords } = result.payload;
      mapController.goTo(coords, 12, place);
      showNotif(`✈ Going to ${place}`, 'success');
      break;
    }

    case INTENT.SHOW_LAYER: {
      const { layerId, alias } = result.payload;
      mapController.showLayer(layerId);
      setLayerCheckbox(layerId, true);
      showNotif(`🗂️ Showing ${alias || layerId} layer`, 'success');
      break;
    }

    case INTENT.HIDE_LAYER: {
      const { layerId, alias } = result.payload;
      mapController.hideLayer(layerId);
      setLayerCheckbox(layerId, false);
      showNotif(`🗂️ Hiding ${alias || layerId} layer`, 'info');
      break;
    }

    case INTENT.ADD_MARKER: {
      if (result.payload.useCurrentLocation) {
        mapController.addMarkerAtCurrentLocation()
          .then(([lat, lng]) => showNotif(`📍 Marker at ${lat.toFixed(4)}, ${lng.toFixed(4)}`, 'success'))
          .catch((err) => showNotif(`⚠ ${err.message}`, 'error'));
      } else {
        const c = mapController._map
          ? (currentMapEngine === MAP_ENGINE.LEAFLET
              ? mapController._map.getCenter()
              : (() => {
                  const ol = window.ol;
                  const coord = ol.proj.toLonLat(mapController._map.getView().getCenter());
                  return { lat: coord[1], lng: coord[0] };
                })())
          : { lat: 0, lng: 0 };
        mapController.addMarker([c.lat, c.lng], '📍 Marker');
        showNotif(`📍 Marker added`, 'success');
      }
      break;
    }

    case INTENT.SWITCH_MAP: {
      const newEngine = result.payload.engine === 'openlayers'
        ? MAP_ENGINE.OPENLAYERS
        : MAP_ENGINE.LEAFLET;
      if (newEngine !== currentMapEngine) {
        switchMapEngine(newEngine);
      } else {
        showNotif(`Already using ${result.payload.engine}`, 'info');
      }
      break;
    }

    case INTENT.RESET_VIEW:
      mapController.resetView();
      showNotif('🌍 View reset', 'info');
      break;

    default:
      showNotif(`❓ Command not recognised: "${result.raw}"`, 'error');
      break;
  }

  return performance.now() - t0;
}

// ---------------------------------------------------------------------------
// Map action callback (from MapController)
// ---------------------------------------------------------------------------

function handleMapAction({ action, latency }) {
  statusZoom.textContent = `Zoom: ${
    currentMapEngine === MAP_ENGINE.LEAFLET
      ? mapController._map.getZoom()
      : Math.round(mapController._map.getView().getZoom())
  }`;
}

// ---------------------------------------------------------------------------
// Engine switch
// ---------------------------------------------------------------------------

function switchMapEngine(newEngine) {
  overlayMsg.textContent = `Switching to ${newEngine === MAP_ENGINE.OPENLAYERS ? 'OpenLayers' : 'Leaflet'}…`;
  mapOverlay.classList.add('visible');

  setTimeout(() => {
    initMap(newEngine);
    mapSelect.value = newEngine;
    mapOverlay.classList.remove('visible');
    showNotif(`🗺️ Switched to ${newEngine === MAP_ENGINE.OPENLAYERS ? 'OpenLayers' : 'Leaflet'}`, 'success');
  }, 400);
}

// ---------------------------------------------------------------------------
// Log
// ---------------------------------------------------------------------------

function addLogEntry(result, raw) {
  // Remove placeholder text on first entry
  if (commandLog.querySelector('[style]')) commandLog.innerHTML = '';

  const entry   = document.createElement('div');
  const isKnown = result.intent !== INTENT.UNKNOWN;
  entry.className = `log-entry ${isKnown ? 'success' : 'error'}`;

  const time = new Date().toLocaleTimeString();
  entry.innerHTML = `
    <div class="log-time">${time}</div>
    <div class="log-raw">"${escapeHtml(raw)}"</div>
    <div class="log-intent">${isKnown ? result.intent : '❓ unknown'}</div>
    <div class="log-msg">${formatPayload(result.payload)}</div>
  `;

  commandLog.prepend(entry);
}

function formatPayload(payload) {
  if (!payload || Object.keys(payload).length === 0) return '';
  if (payload.place) return `→ ${payload.place}`;
  if (payload.layerId) return `→ layer: ${payload.layerId}`;
  if (payload.engine) return `→ engine: ${payload.engine}`;
  if (payload.useCurrentLocation) return '→ current location';
  return '';
}

// ---------------------------------------------------------------------------
// Stats update
// ---------------------------------------------------------------------------

function updateStats() {
  const s = tracker.getStats();
  statTotal.textContent      = s.total;
  statRecognized.textContent = s.recognized;
  statUnknown.textContent    = s.unknown;
  statAccuracy.textContent   = s.accuracy !== null ? `${(s.accuracy * 100).toFixed(1)}%` : '—';
  statConfidence.textContent = s.avgConfidence !== null ? s.avgConfidence.toFixed(2) : '—';
  statLatency.textContent    = s.avgLatency !== null ? `${s.avgLatency.toFixed(1)} ms` : '—';

  const sec  = Math.floor(s.sessionDurationMs / 1000);
  const mins = Math.floor(sec / 60);
  statSession.textContent    = mins > 0 ? `${mins}m ${sec % 60}s` : `${sec}s`;
}

// Update session timer every second
setInterval(updateStats, 1000);

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

function showNotif(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `notif ${type}`;
  el.textContent = msg;
  notifContainer.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------------

// Voice toggle button
voiceBtn.addEventListener('click', () => speechEngine && speechEngine.toggle());

// Keyboard shortcut: Space toggles listening when not in an input
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') {
    e.preventDefault();
    speechEngine && speechEngine.toggle();
  }
});

// Engine selector
engineSelect.addEventListener('change', () => {
  const type = engineSelect.value === 'tfjs' ? ENGINE_TYPE.TFJS : ENGINE_TYPE.WEB_SPEECH;
  initSpeechEngine(type);
});

// Map selector
mapSelect.addEventListener('change', () => {
  const newEngine = mapSelect.value === 'openlayers' ? MAP_ENGINE.OPENLAYERS : MAP_ENGINE.LEAFLET;
  if (newEngine !== currentMapEngine) switchMapEngine(newEngine);
});

// Quick action buttons
document.getElementById('btn-zoom-in').addEventListener('click',  () => mapController.zoomIn());
document.getElementById('btn-zoom-out').addEventListener('click', () => mapController.zoomOut());
document.getElementById('btn-reset').addEventListener('click',    () => mapController.resetView());
document.getElementById('btn-locate').addEventListener('click',   () =>
  mapController.addMarkerAtCurrentLocation()
    .catch((e) => showNotif(`⚠ ${e.message}`, 'error'))
);

// Sidebar tabs
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// Help modal
helpBtn.addEventListener('click', () => helpModal.classList.add('open'));
modalCloseBtn.addEventListener('click', () => helpModal.classList.remove('open'));
helpModal.addEventListener('click', (e) => {
  if (e.target === helpModal) helpModal.classList.remove('open');
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') helpModal.classList.remove('open');
});

// Export buttons
document.getElementById('export-json').addEventListener('click', () => {
  const data = tracker.exportJSON();
  downloadFile(data, 'voicegis-session.json', 'application/json');
});
document.getElementById('export-csv').addEventListener('click', () => {
  const data = tracker.exportCSV();
  downloadFile(data, 'voicegis-session.csv', 'text/csv');
});
document.getElementById('reset-stats').addEventListener('click', () => {
  tracker.reset();
  commandLog.innerHTML = '<div style="color:var(--text-muted);font-size:.8rem;text-align:center;padding:20px 0;">No commands yet.</div>';
  updateStats();
});

function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

(async () => {
  initMap(MAP_ENGINE.LEAFLET);
  await initSpeechEngine(ENGINE_TYPE.WEB_SPEECH);
  updateStats();
  showNotif('🗺️ VoiceGIS ready — click 🎙️ or press Space to start', 'info');
})();
