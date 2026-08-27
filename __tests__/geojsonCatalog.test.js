import { OPERATION, PLAN_STATUS } from '../src/core/constants.js';
import { SpatialCatalog } from '../src/core/SpatialCatalog.js';
import { SpatialCommandCompiler } from '../src/core/SpatialCommandCompiler.js';
import { catalogFromGeoJSON } from '../src/adapters/geojsonCatalog.js';
import { createGeoJSONAdapter } from '../src/adapters/geojson.js';

const point = (coordinates, properties) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates },
  properties,
});

const collection = (features) => ({ type: 'FeatureCollection', features });

const CITIES = collection([
  point([4.9, 52.4], { name: 'Amsterdam', pop_max: 1_031_000, founded: '1275-10-27' }),
  point([4.5, 51.9], { name: 'Rotterdam', pop_max: 1_004_000, founded: '1340-06-07' }),
]);

describe('catalogFromGeoJSON', () => {
  it('derives layers and typed fields from a feature collection', () => {
    const { catalog, layers, warnings } = catalogFromGeoJSON({ cities: CITIES });

    expect(warnings).toEqual([]);
    expect(catalog.layers).toHaveLength(1);

    const [layer] = catalog.layers;
    expect(layer.id).toBe('cities');
    expect(layer.fields).toEqual([
      { id: 'name', type: 'string' },
      { id: 'pop_max', type: 'number', aliases: ['pop max'] },
      { id: 'founded', type: 'date' },
    ]);
    expect(layers).toEqual([
      { id: 'cities', fieldCount: 3, featureCount: 2, geometryCount: 2 },
    ]);
  });

  it('accepts a bare collection and names the layer', () => {
    expect(catalogFromGeoJSON(CITIES).catalog.layers[0].id).toBe('features');
    expect(catalogFromGeoJSON(CITIES, { layerId: 'towns' }).catalog.layers[0].id).toBe('towns');
    expect(catalogFromGeoJSON([point([0, 0], { a: 1 })]).catalog.layers[0].id).toBe('features');
  });

  it('produces a catalog SpatialCatalog accepts, resolving spoken names', () => {
    const { catalog } = catalogFromGeoJSON(
      { dutch_windmills: CITIES },
      { labels: { dutch_windmills: 'Windmills' } }
    );
    const resolved = new SpatialCatalog(catalog);

    expect(resolved.resolveLayer('dutch windmills').layer.id).toBe('dutch_windmills');
    expect(resolved.resolveLayer('Windmills').layer.id).toBe('dutch_windmills');
    expect(resolved.resolveField('dutch_windmills', 'pop max').field.id).toBe('pop_max');
  });

  describe('type inference', () => {
    it('leaves a property with disagreeing types undeclared', () => {
      const { catalog, warnings } = catalogFromGeoJSON({
        sites: collection([
          point([0, 0], { code: 12 }),
          point([1, 1], { code: 'AB-9' }),
        ]),
      });

      expect(catalog.layers[0].fields).toEqual([{ id: 'code' }]);
      expect(warnings).toContainEqual(expect.stringContaining('mixes number and string'));
    });

    it('treats dates as strings when the column also holds free text', () => {
      const { catalog, warnings } = catalogFromGeoJSON({
        sites: collection([
          point([0, 0], { opened: '2024-03-01' }),
          point([1, 1], { opened: 'unknown' }),
        ]),
      });

      expect(catalog.layers[0].fields).toEqual([{ id: 'opened', type: 'string' }]);
      expect(warnings).toEqual([]);
    });

    it('excludes properties holding objects, arrays, or non-finite numbers', () => {
      const { catalog, warnings } = catalogFromGeoJSON({
        sites: collection([
          point([0, 0], { name: 'a', tags: ['x'], meta: { k: 1 }, ratio: Number.NaN }),
        ]),
      });

      expect(catalog.layers[0].fields).toEqual([{ id: 'name', type: 'string' }]);
      expect(warnings).toHaveLength(3);
      for (const property of ['tags', 'meta', 'ratio']) {
        expect(warnings).toContainEqual(expect.stringContaining(`"${property}"`));
      }
    });

    it('ignores nulls rather than letting them widen a type', () => {
      const { catalog } = catalogFromGeoJSON({
        sites: collection([
          point([0, 0], { pop: 10 }),
          point([1, 1], { pop: null }),
        ]),
      });

      expect(catalog.layers[0].fields).toEqual([{ id: 'pop', type: 'number' }]);
    });
  });

  describe('capabilities', () => {
    it('offers spatial operations on a layer that has geometry', () => {
      const [layer] = catalogFromGeoJSON({ cities: CITIES }).catalog.layers;

      expect(layer.capabilities).toContain(OPERATION.QUERY_SPATIAL_SELECT);
      expect(layer.capabilities).toContain(OPERATION.ANALYSIS_BUFFER);
      expect(layer.capabilities).toContain(OPERATION.QUERY_FILTER);
    });

    it('withholds them from a layer whose features carry none', () => {
      const { catalog, warnings } = catalogFromGeoJSON({
        readings: collection([
          { type: 'Feature', geometry: null, properties: { value: 3 } },
          { type: 'Feature', geometry: null, properties: { value: 4 } },
        ]),
      });
      const [layer] = catalog.layers;

      expect(layer.capabilities).not.toContain(OPERATION.QUERY_SPATIAL_SELECT);
      expect(layer.capabilities).not.toContain(OPERATION.ANALYSIS_BUFFER);
      expect(layer.capabilities).toContain(OPERATION.QUERY_FILTER);
      expect(warnings).toContainEqual(expect.stringContaining('carries geometry'));
    });
  });

  describe('layer selection', () => {
    it('honours include and exclude', () => {
      const source = { cities: CITIES, ports: CITIES, rivers: CITIES };

      expect(catalogFromGeoJSON(source, { include: ['cities'] }).catalog.layers)
        .toHaveLength(1);
      expect(catalogFromGeoJSON(source, { exclude: ['rivers'] }).catalog.layers.map((l) => l.id))
        .toEqual(['cities', 'ports']);
    });

    it('drops an alias another layer already answers to', () => {
      const { catalog } = catalogFromGeoJSON({
        city_parks: CITIES,
        'city parks': CITIES,
      });

      expect(catalog.layers[0].aliases).toBeUndefined();
      expect(() => new SpatialCatalog(catalog)).not.toThrow();
    });

    it('lists an empty layer with no fields and says so', () => {
      const { catalog, warnings } = catalogFromGeoJSON({ pending: collection([]) });

      expect(catalog.layers[0].fields).toEqual([]);
      expect(warnings).toContainEqual(expect.stringContaining('no features'));
    });
  });

  describe('sampling', () => {
    it('reports when types came from a sample rather than the whole file', () => {
      const { warnings } = catalogFromGeoJSON({ cities: CITIES }, { sampleSize: 1 });

      expect(warnings).toContainEqual(expect.stringContaining('first 1 of 2 features'));
    });

    it('rejects a nonsensical sample size', () => {
      expect(() => catalogFromGeoJSON(CITIES, { sampleSize: 0 })).toThrow(TypeError);
      expect(() => catalogFromGeoJSON(CITIES, { sampleSize: -5 })).toThrow(TypeError);
    });
  });

  describe('versioning', () => {
    it('is stable for the same schema and changes when the schema does', () => {
      const first = catalogFromGeoJSON({ cities: CITIES }).catalog.version;
      const again = catalogFromGeoJSON({ cities: CITIES }).catalog.version;
      const altered = catalogFromGeoJSON({
        cities: collection([point([0, 0], { name: 'x', extra: 1 })]),
      }).catalog.version;

      expect(first).toBe(again);
      expect(first).not.toBe(altered);
      expect(first.startsWith('geojson:')).toBe(true);
    });

    it('accepts an explicit version', () => {
      expect(catalogFromGeoJSON(CITIES, { version: 'cities-7' }).catalog.version)
        .toBe('cities-7');
    });
  });

  describe('refusals', () => {
    it('rejects input that is not GeoJSON', () => {
      expect(() => catalogFromGeoJSON(null)).toThrow(TypeError);
      expect(() => catalogFromGeoJSON('a string')).toThrow(TypeError);
      expect(() => catalogFromGeoJSON({ type: 'Polygon', coordinates: [] }))
        .toThrow(/received "Polygon"/);
    });

    it('rejects a layer whose value is not a collection', () => {
      expect(() => catalogFromGeoJSON({ cities: { nope: true } }))
        .toThrow(/must be a FeatureCollection/);
    });

    it('refuses to build a catalog with no layers left', () => {
      expect(() => catalogFromGeoJSON({ cities: CITIES }, { include: ['missing'] }))
        .toThrow(/nothing to build a catalog from/);
    });
  });

  it('compiles a command against the catalog it derived', async () => {
    const { catalog } = catalogFromGeoJSON({ cities: CITIES });
    const compiler = new SpatialCommandCompiler({ catalog });

    const plan = await compiler.compile('show cities');

    expect(plan.status).toBe(PLAN_STATUS.READY);
    expect(plan.operations[0].type).toBe(OPERATION.LAYER_VISIBILITY);
    expect(plan.operations[0].target).toMatchObject({ kind: 'layer', layerId: 'cities' });
  });

  it('feeds an adapter that executes against the same data', () => {
    const { catalog } = catalogFromGeoJSON({ cities: CITIES });
    const adapter = createGeoJSONAdapter({ catalog, layers: { cities: CITIES } });

    expect(adapter.capabilities).toContain(OPERATION.QUERY_FILTER);
    expect(adapter.getState().layers.cities.total).toBe(2);
  });
});
