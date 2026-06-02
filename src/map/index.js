/**
 * Map controller and layer management.
 *
 * Re-exports the unified map controller, adapters, and layer definitions:
 *   import { MapController, MAP_ENGINE, LAYER_DEFS } from 'voicegis/map';
 *
 * @module map
 */

export { MapController, MAP_ENGINE, LAYER_DEFS, DEFAULT_CENTER } from './MapController.js';
export { LeafletAdapter } from './LeafletAdapter.js';
export { OpenLayersAdapter } from './OpenLayersAdapter.js';
export { DEFAULT_ZOOM } from './layers.js';
