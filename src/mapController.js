/**
 * mapController.js
 * Unified map controller supporting Leaflet and OpenLayers.
 *
 * Usage:
 *   const ctrl = new MapController({ engine: 'leaflet', containerId: 'map' });
 *   ctrl.init();
 *   ctrl.goTo([48.8566, 2.3522], 12, 'Paris');
 *   ctrl.zoomIn();
 *   ctrl.showLayer('nasa');
 */

export const MAP_ENGINE = {
  LEAFLET: 'leaflet',
  OPENLAYERS: 'openlayers',
};

/** Public WMS / tile layer definitions. */
export const LAYER_DEFS = {
  osm: {
    id: 'osm',
    label: 'OpenStreetMap',
    type: 'tile',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
  nasa: {
    id: 'nasa',
    label: 'NASA GIBS Satellite',
    type: 'wms',
    url: 'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi',
    layers: 'MODIS_Terra_CorrectedReflectance_TrueColor',
    format: 'image/jpeg',
    transparent: false,
    // WMS 1.1.1 with SRS is required by NASA GIBS; 1.3.0 uses CRS and may return blank tiles.
    version: '1.1.1',
    attribution: 'Imagery provided by services from the Global Imagery Browse Services (GIBS), operated by the NASA/GSFC/Earth Science Data and Information System (ESDIS) with funding provided by NASA/HQ.',
    crs: 'EPSG:3857',
  },
  bhuvan: {
    id: 'bhuvan',
    label: 'Bhuvan (NRSC India)',
    type: 'wms',
    // Note: Bhuvan WMS may have CORS restrictions for cross-origin browser requests.
    url: 'https://bhuvan-vec2.nrsc.gov.in/bhuvan/wms',
    layers: 'india_vmap0',
    format: 'image/png',
    transparent: true,
    version: '1.1.1',
    attribution: '© NRSC/ISRO Bhuvan',
  },
  copernicus: {
    id: 'copernicus',
    label: 'Copernicus Land Cover',
    type: 'wms',
    // The original vito.be endpoint (land.copernicus.vgt.vito.be) is no longer publicly
    // reachable and causes ERR_NAME_NOT_RESOLVED. Replaced with the EEA-hosted CORINE
    // Land Cover 2018 WMS, which is the same Copernicus land-cover product served from a
    // stable, publicly accessible EEA endpoint.
    url: 'https://image.discomap.eea.europa.eu/arcgis/services/Corine/CLC2018_WM/MapServer/WmsServer',
    layers: '0',
    format: 'image/png',
    transparent: true,
    version: '1.1.1',
    attribution: '© EEA / Copernicus Land Monitoring Service',
  },
  terrain: {
    id: 'terrain',
    label: 'OpenTopoMap (Terrain)',
    type: 'tile',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution:
      'Map data: © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Map style: © <a href="https://opentopomap.org">OpenTopoMap</a>',
    maxZoom: 17,
  },
};

/** Map CRS identifiers to Leaflet CRS objects. */
const LEAFLET_CRS_MAP = {
  'EPSG:3857': 'EPSG3857',
  'EPSG:4326': 'EPSG4326',
  'EPSG:900913': 'EPSG900913',
};

/** Default map center: Ahmedabad, India [lat, lng]. */
export const DEFAULT_CENTER = [23.0225, 72.5714];

const DEFAULT_ZOOM = 3;

export class MapController {
  /**
   * @param {object}   options
   * @param {string}   [options.engine]        - MAP_ENGINE.LEAFLET or MAP_ENGINE.OPENLAYERS
   * @param {string}   [options.containerId]   - DOM id for the map div
   * @param {function} [options.onAction]      - Callback fired after each map action
   * @param {function} [options.onLayerError]  - Callback fired when a WMS/tile layer fails to load.
   *                                             Receives { layerId, label, error }.
   */
  constructor(options = {}) {
    this.engine = options.engine || MAP_ENGINE.LEAFLET;
    this.containerId = options.containerId || 'map';
    this.onAction = options.onAction || (() => {});
    // Optional callback for layer load failures (network, DNS, CORS, etc.)
    this.onLayerError = options.onLayerError || null;

    this._map = null;
    this._layers = {};       // id → layer object
    this._markers = [];
    this._activeBasemap = 'osm';
    // Track layers that have already triggered an error notification this session
    // so we do not flood the user with one notification per failed tile.
    this._failedLayers = new Set();
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /** Initialise and render the map. */
  init() {
    if (this.engine === MAP_ENGINE.OPENLAYERS) {
      this._initOL();
    } else {
      this._initLeaflet();
    }
    this.showLayer('osm');
  }

  /** Destroy the current map instance (used when switching engines). */
  destroy() {
    if (!this._map) return;

    if (this.engine === MAP_ENGINE.LEAFLET) {
      this._map.remove();
    } else {
      this._map.setTarget(null);
    }

    this._map = null;
    this._layers = {};
    this._markers = [];
    this._failedLayers.clear();
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  /** Zoom in by one level. */
  zoomIn() {
    this._mutate('zoomIn', () => {
      if (this.engine === MAP_ENGINE.LEAFLET) {
        this._map.zoomIn();
      } else {
        const view = this._map.getView();
        view.animate({ zoom: view.getZoom() + 1, duration: 300 });
      }
    });
  }

  /** Zoom out by one level. */
  zoomOut() {
    this._mutate('zoomOut', () => {
      if (this.engine === MAP_ENGINE.LEAFLET) {
        this._map.zoomOut();
      } else {
        const view = this._map.getView();
        view.animate({ zoom: view.getZoom() - 1, duration: 300 });
      }
    });
  }

  /**
   * Fly / pan to a location.
   * @param {[number, number]} latLng - [latitude, longitude]
   * @param {number} [zoom]
   * @param {string} [label]
   */
  goTo(latLng, zoom = 12, label = '') {
    this._mutate('goTo', () => {
      if (this.engine === MAP_ENGINE.LEAFLET) {
        this._map.flyTo(latLng, zoom, { animate: true, duration: 1.5 });
      } else {
        const ol = window.ol;
        const view = this._map.getView();
        const coord = ol.proj.fromLonLat([latLng[1], latLng[0]]);
        view.animate({ center: coord, zoom, duration: 1500 });
      }
    }, { latLng, zoom, label });
  }

  /**
   * Reset map to default world view.
   */
  resetView() {
    this._mutate('resetView', () => {
      if (this.engine === MAP_ENGINE.LEAFLET) {
        this._map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      } else {
        const ol = window.ol;
        const view = this._map.getView();
        view.animate({
          center: ol.proj.fromLonLat([DEFAULT_CENTER[1], DEFAULT_CENTER[0]]),
          zoom: DEFAULT_ZOOM,
          duration: 800,
        });
      }
    });
  }

  /**
   * Show (or add) a layer by its id.
   * @param {string} layerId - One of the keys in LAYER_DEFS
   */
  showLayer(layerId) {
    const def = LAYER_DEFS[layerId];
    if (!def) {
      console.warn('[MapController] Unknown layer:', layerId);
      return;
    }

    this._mutate('showLayer', () => {
      if (this._layers[layerId]) {
        // Layer already added — make it visible
        if (this.engine === MAP_ENGINE.LEAFLET) {
          if (!this._map.hasLayer(this._layers[layerId])) {
            this._map.addLayer(this._layers[layerId]);
          }
        } else {
          this._layers[layerId].setVisible(true);
        }
        return;
      }

      // Create and add the layer
      if (this.engine === MAP_ENGINE.LEAFLET) {
        const layer = this._createLeafletLayer(def);
        layer.addTo(this._map);
        this._layers[layerId] = layer;
      } else {
        const layer = this._createOLLayer(def);
        this._map.addLayer(layer);
        this._layers[layerId] = layer;
      }
    }, { layerId, label: def.label });
  }

  /**
   * Hide / remove a layer by its id.
   * @param {string} layerId
   */
  hideLayer(layerId) {
    if (!this._layers[layerId]) return;
    const def = LAYER_DEFS[layerId];

    this._mutate('hideLayer', () => {
      if (this.engine === MAP_ENGINE.LEAFLET) {
        if (this._map.hasLayer(this._layers[layerId])) {
          this._map.removeLayer(this._layers[layerId]);
        }
      } else {
        this._layers[layerId].setVisible(false);
      }
    }, { layerId, label: def ? def.label : layerId });
    // Clear the error-reported flag so if the user re-enables this layer later
    // a fresh error notification can be shown if it still fails.
    this._failedLayers.delete(layerId);
  }

  /**
   * Add a marker at a given position.
   * @param {[number, number]} latLng
   * @param {string} [popupText]
   */
  addMarker(latLng, popupText = '') {
    this._mutate('addMarker', () => {
      if (this.engine === MAP_ENGINE.LEAFLET) {
        const marker = window.L.marker(latLng).addTo(this._map);
        if (popupText) marker.bindPopup(popupText).openPopup();
        this._markers.push(marker);
      } else {
        const ol = window.ol;
        const feature = new ol.Feature({
          geometry: new ol.geom.Point(ol.proj.fromLonLat([latLng[1], latLng[0]])),
        });
        feature.setStyle(
          new ol.style.Style({
            image: new ol.style.Icon({
              src: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon.png',
              anchor: [0.5, 1],
            }),
          })
        );
        const source = new ol.source.Vector({ features: [feature] });
        const layer = new ol.layer.Vector({ source });
        this._map.addLayer(layer);
        this._markers.push(layer);
      }
    }, { latLng });
  }

  /**
   * Add a marker at the user's current geolocation.
   * @returns {Promise<[number, number]>} Resolves with [lat, lng]
   */
  addMarkerAtCurrentLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const latLng = [pos.coords.latitude, pos.coords.longitude];
          this.goTo(latLng, 14, 'My Location');
          this.addMarker(latLng, '📍 You are here');
          resolve(latLng);
        },
        (err) => reject(new Error(`Geolocation error: ${err.message}`))
      );
    });
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  _initLeaflet() {
    const L = window.L;
    this._map = L.map(this.containerId, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
    });
  }

  _initOL() {
    const ol = window.ol;
    this._map = new ol.Map({
      target: this.containerId,
      view: new ol.View({
        center: ol.proj.fromLonLat([DEFAULT_CENTER[1], DEFAULT_CENTER[0]]),
        zoom: DEFAULT_ZOOM,
      }),
      controls: ol.control.defaults.defaults(),
      layers: [],
    });
  }

  _createLeafletLayer(def) {
    const L = window.L;
    if (def.type === 'wms') {
      const layer = L.tileLayer.wms(def.url, {
        layers: def.layers,
        format: def.format || 'image/png',
        transparent: def.transparent !== false,
        attribution: def.attribution,
        // Use the version from the layer definition, or default to 1.1.1 if not specified,
        // which is broadly compatible with public WMS services.
        version: def.version || '1.1.1',
        crs: def.crs ? window.L.CRS[LEAFLET_CRS_MAP[def.crs] || def.crs] : undefined,
      });

      // Attach a tile-error handler so network/DNS/CORS failures are caught and
      // surfaced to the user instead of silently failing.  Only report once per
      // layer per session to avoid notification spam (one error per visible tile).
      layer.on('tileerror', (e) => {
        if (!this._failedLayers.has(def.id)) {
          this._failedLayers.add(def.id);
          console.warn(
            `[MapController] WMS layer "${def.id}" failed to load tiles from ${def.url}.`,
            'Possible causes: endpoint unreachable, DNS failure, CORS, or incorrect layer name.',
            e.error || e,
          );
          if (this.onLayerError) {
            this.onLayerError({
              layerId: def.id,
              label: def.label,
              error: e.error || new Error('WMS tile load failed'),
            });
          }
        }
      });

      return layer;
    }
    return L.tileLayer(def.url, {
      attribution: def.attribution,
      maxZoom: def.maxZoom || 18,
    });
  }

  _createOLLayer(def) {
    const ol = window.ol;
    if (def.type === 'wms') {
      const source = new ol.source.TileWMS({
        url: def.url,
        params: {
          LAYERS: def.layers,
          TILED: true,
          FORMAT: def.format || 'image/png',
          // Pass the WMS version declared in the layer definition.  NASA GIBS
          // requires 1.1.1; many ArcGIS-based services also prefer 1.1.1.
          VERSION: def.version || '1.1.1',
        },
        attributions: def.attribution,
        serverType: 'mapserver',
      });

      // Attach a source-level error handler so tile load failures are caught
      // and reported to the user without throwing JS exceptions.
      source.on('tileloaderror', (e) => {
        if (!this._failedLayers.has(def.id)) {
          this._failedLayers.add(def.id);
          console.warn(
            `[MapController] WMS layer "${def.id}" failed to load tiles from ${def.url}.`,
            'Possible causes: endpoint unreachable, DNS failure, CORS, or incorrect layer name.',
            e,
          );
          if (this.onLayerError) {
            this.onLayerError({
              layerId: def.id,
              label: def.label,
              error: new Error('WMS tile load failed'),
            });
          }
        }
      });

      return new ol.layer.Tile({
        source,
        properties: { id: def.id },
      });
    }
    // XYZ tile — OpenLayers XYZ source uses the same {z}/{x}/{y} template as
    // Leaflet, so we only need to handle the Leaflet-specific {s} subdomain.
    const tileUrl = def.url.replace('{s}', 'a');
    return new ol.layer.Tile({
      source: new ol.source.XYZ({
        url: tileUrl,
        maxZoom: def.maxZoom || 18,
        attributions: def.attribution,
      }),
      properties: { id: def.id },
    });
  }

  /** Execute a map mutation and emit an onAction event. */
  _mutate(action, fn, extra = {}) {
    if (!this._map) {
      console.warn(`[MapController] Cannot execute "${action}": map not initialised.`);
      return;
    }
    const t0 = performance.now();
    fn();
    const latency = performance.now() - t0;
    this.onAction({ action, latency, ...extra });
  }
}
