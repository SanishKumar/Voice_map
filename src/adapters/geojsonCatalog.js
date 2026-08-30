/**
 * Derive a VoiceGIS catalog from GeoJSON that is already in hand.
 *
 * `catalogFromOgcService` removed the need to hand-write a catalog, but it
 * still required a live, conformant OGC API - Features endpoint. Most people
 * evaluating this library have a file, not a service. This builder closes
 * that gap: point it at a FeatureCollection and it names the layer, types the
 * fields, and declares the operations that can honestly be performed.
 *
 * Type inference is deliberately timid. A property whose values disagree
 * across features is declared with no type rather than the type of whichever
 * feature happened to come first, and a property holding objects or arrays is
 * left out entirely — the predicate engine cannot compare those, and a field
 * that silently matches nothing is the same confident wrong answer that
 * unconformant filtering produces.
 *
 * Capabilities are narrowed per layer for the same reason. A layer whose
 * features carry no geometry cannot answer a proximity query or a buffer, so
 * those operations are not offered on it. Narrowing needs evidence, though:
 * an empty layer keeps them, since nothing was inspected either way.
 *
 * Whatever the source data looks like, the catalog handed back is one
 * `SpatialCatalog` will accept. Names that collide case-insensitively are
 * dropped with a warning rather than left to throw, because a caller cannot
 * hand-edit a catalog that was derived.
 *
 * @module adapters/geojsonCatalog
 */

import { OPERATION } from '../core/constants.js';
import { GEOJSON_ADAPTER_CAPABILITIES } from './geojson.js';
import { AdapterEvaluationError } from './predicate.js';
import { aliasesFor, claimAliases, fingerprint } from './catalogUtils.js';

/**
 * Operations that need geometry to mean anything.
 * @type {readonly string[]}
 */
const SPATIAL_OPERATIONS = Object.freeze([
  OPERATION.QUERY_SPATIAL_SELECT,
  OPERATION.ANALYSIS_BUFFER,
]);

/** An ISO-8601 date or date-time, which is how GeoJSON carries dates. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

const isIsoDate = (value) => ISO_DATE.test(value) && !Number.isNaN(Date.parse(value));

function featuresOf(data, layerId) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (data.type === 'FeatureCollection') return data.features || [];
  if (data.type === 'Feature') return [data];
  throw new AdapterEvaluationError(
    `Layer "${layerId}" must be a FeatureCollection, a Feature, or an array of features.`,
    { layerId, received: data?.type ?? typeof data }
  );
}

/**
 * Classify one observed value.
 *
 * `structured` is kept distinct from the primitive kinds because it
 * disqualifies a field rather than merely widening its type.
 */
function kindOf(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? 'number' : 'structured';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string') return isIsoDate(value) ? 'date' : 'string';
  return 'structured';
}

/**
 * Reduce the kinds observed for one property to a catalog field type.
 *
 * A date is a specialisation of a string, so a column of dates that also
 * holds a few free-text values is still usefully a string. Any other
 * disagreement yields no type at all.
 */
function resolveType(kinds) {
  if (kinds.size === 0) return { type: undefined, mixed: false };
  if (kinds.size === 1) return { type: [...kinds][0], mixed: false };
  if (kinds.size === 2 && kinds.has('date') && kinds.has('string')) {
    return { type: 'string', mixed: false };
  }
  return { type: undefined, mixed: true };
}

/** Walk a layer's features once, collecting everything the catalog needs. */
function describeLayer(layerId, features, sampleSize) {
  const limit = Math.min(features.length, sampleSize);
  /** @type {Map<string, Set<string>>} */
  const properties = new Map();
  let withGeometry = 0;
  let unnamed = 0;

  for (let i = 0; i < limit; i += 1) {
    const feature = features[i];
    if (feature?.geometry) withGeometry += 1;

    // An array would enumerate as fields named "0" and "1", which is a catalog
    // describing nothing that exists.
    const bag = feature?.properties;
    if (!bag || typeof bag !== 'object' || Array.isArray(bag)) continue;

    for (const [name, value] of Object.entries(bag)) {
      if (!name.trim()) {
        unnamed += 1;
        continue;
      }
      if (value === null || value === undefined) continue;

      let kinds = properties.get(name);
      if (!kinds) {
        kinds = new Set();
        properties.set(name, kinds);
      }
      kinds.add(kindOf(value));
    }
  }

  return { properties, withGeometry, unnamed, sampled: limit };
}

/**
 * Build a catalog from GeoJSON already loaded into memory.
 *
 * @param {object|object[]|Record<string, object>} source - A FeatureCollection,
 *   an array of features, or a map of layer id to either of those. A layer may
 *   also be given as `{ data, label }`.
 * @param {object} [options]
 * @param {string} [options.layerId] - Layer id when `source` is a bare
 *   collection. Defaults to `'features'`.
 * @param {Record<string, string>} [options.labels] - Human labels by layer id.
 * @param {string[]} [options.include] - Only these layer ids.
 * @param {string[]} [options.exclude] - Skip these layer ids.
 * @param {number} [options.sampleSize] - Features scanned per layer for type
 *   inference. Defaults to every feature.
 * @param {string} [options.version] - Overrides the derived catalog version.
 * @returns {{
 *   catalog: import('../core/types.js').CatalogDefinition,
 *   layers: Array<{id:string, label?:string, fieldCount:number, featureCount:number, geometryCount:number}>,
 *   warnings: string[],
 * }}
 */
export function catalogFromGeoJSON(source, options = {}) {
  if (!source || typeof source !== 'object') {
    throw new TypeError('GeoJSON data is required to derive a catalog.');
  }

  const isBare = Array.isArray(source)
    || source.type === 'FeatureCollection'
    || source.type === 'Feature';

  // A bare geometry is GeoJSON but carries no properties to derive fields
  // from. Saying so beats treating its "type" key as a layer name.
  if (!isBare && typeof source.type === 'string') {
    throw new TypeError(
      `A catalog needs a FeatureCollection, a Feature, or a map of layers; received "${source.type}".`
    );
  }
  /** @type {Record<string, object>} */
  const entries = isBare ? { [options.layerId || 'features']: source } : source;

  const sampleSize = options.sampleSize ?? Number.POSITIVE_INFINITY;
  if (!(sampleSize > 0)) {
    throw new TypeError('options.sampleSize must be a positive number.');
  }

  let requested = Object.keys(entries);
  if (options.include) {
    const wanted = new Set(options.include);
    requested = requested.filter((id) => wanted.has(id));
  }
  if (options.exclude) {
    const unwanted = new Set(options.exclude);
    requested = requested.filter((id) => !unwanted.has(id));
  }

  const warnings = [];

  // Names resolve case-insensitively, so "Cities" and "cities" are one name to
  // a speaker and SpatialCatalog rejects the pair outright. Dropping the later
  // one costs a layer and says so; keeping it would throw on a whole catalog
  // the caller cannot edit, because this one was derived rather than written.
  const ids = [];
  const seenLayers = new Map();
  for (const id of requested) {
    const key = id.trim().toLowerCase();
    if (!key) {
      warnings.push('A layer with a blank name was skipped; every layer needs an id.');
      continue;
    }
    const owner = seenLayers.get(key);
    if (owner !== undefined) {
      warnings.push(
        `Layer "${id}" is another spelling of "${owner}" and was skipped; `
        + 'layer names resolve case-insensitively.'
      );
      continue;
    }
    seenLayers.set(key, id);
    ids.push(id);
  }

  // Layer names are unique across the catalog; field names only within a layer.
  const claimedLayers = new Set(seenLayers.keys());
  const layers = [];
  const summary = [];

  for (const layerId of ids) {
    const entry = entries[layerId];
    const wrapped = entry && !Array.isArray(entry) && !entry.type && 'data' in entry;
    const features = featuresOf(wrapped ? entry.data : entry, layerId);
    const label = options.labels?.[layerId] ?? (wrapped ? entry.label : undefined);

    const { properties, withGeometry, unnamed, sampled } = describeLayer(
      layerId, features, sampleSize
    );

    if (features.length === 0) {
      warnings.push(
        `Layer "${layerId}" holds no features, so it is listed with no fields. `
        + 'Load its data before compiling commands against it.'
      );
    }
    if (sampled < features.length) {
      warnings.push(
        `Only the first ${sampled} of ${features.length} features in "${layerId}" were read, `
        + 'so field types are derived from a sample.'
      );
    }
    if (unnamed > 0) {
      warnings.push(`Layer "${layerId}" has ${unnamed} blank property names; they were skipped.`);
    }

    const fields = [];
    const claimedFields = new Set([...properties.keys()].map((name) => name.toLowerCase()));
    const seenFields = new Map();

    for (const [name, kinds] of properties) {
      // Same case-insensitive collision as layers, one scope down. A shapefile
      // converted to GeoJSON routinely carries both NAME and name.
      const key = name.toLowerCase();
      const owner = seenFields.get(key);
      if (owner !== undefined) {
        warnings.push(
          `Property "${name}" on layer "${layerId}" is another spelling of "${owner}" `
          + 'and was skipped; field names resolve case-insensitively.'
        );
        continue;
      }
      seenFields.set(key, name);

      if (kinds.has('structured')) {
        warnings.push(
          `Property "${name}" on layer "${layerId}" holds objects, arrays, or non-finite `
          + 'numbers, which cannot be compared. It is not exposed as a field.'
        );
        continue;
      }

      const { type, mixed } = resolveType(kinds);
      if (mixed) {
        warnings.push(
          `Property "${name}" on layer "${layerId}" mixes ${[...kinds].sort().join(' and ')} `
          + 'values, so it is exposed without a declared type.'
        );
      }

      const aliases = claimAliases(claimedFields, aliasesFor(name));
      fields.push({
        id: name,
        ...(type ? { type } : {}),
        ...(aliases.length > 0 ? { aliases } : {}),
      });
    }

    // Narrowing needs evidence of absent geometry, which an empty layer does
    // not provide. Withholding there would quietly cripple the common pattern
    // of declaring a layer now and calling setLayerData once the fetch lands.
    const hasGeometry = withGeometry > 0;
    const inspected = sampled > 0;
    if (inspected && !hasGeometry) {
      warnings.push(
        `No feature in "${layerId}" carries geometry, so proximity selection and buffering `
        + 'are not offered on it.'
      );
    }

    const capabilities = GEOJSON_ADAPTER_CAPABILITIES.filter(
      (operation) => hasGeometry || !inspected || !SPATIAL_OPERATIONS.includes(operation)
    );

    const aliases = claimAliases(claimedLayers, aliasesFor(layerId, label));
    layers.push({
      id: layerId,
      ...(label ? { label } : {}),
      ...(aliases.length > 0 ? { aliases } : {}),
      fields,
      capabilities,
    });
    summary.push({
      id: layerId,
      ...(label ? { label } : {}),
      fieldCount: fields.length,
      featureCount: features.length,
      geometryCount: withGeometry,
    });
  }

  if (layers.length === 0) {
    throw new AdapterEvaluationError(
      'No layers were found, so there is nothing to build a catalog from.',
      { layerIds: Object.keys(entries) }
    );
  }

  return {
    catalog: {
      version: options.version || `geojson:${fingerprint(layers)}`,
      layers,
    },
    layers: summary,
    warnings,
  };
}
