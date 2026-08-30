/**
 * End-to-end tests for the MCP server.
 *
 * These drive a real MCP client over an in-memory transport, so the tools are
 * exercised through the protocol rather than by calling handlers directly.
 * The service is a stub: the point is the safety behaviour, which must not
 * depend on a third party being up.
 *
 *   node --test test/
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createVoiceGisMcpServer } from '../src/server.js';

const FILTERING = [
  'http://www.opengis.net/spec/ogcapi-features-3/1.0/conf/filter',
  'http://www.opengis.net/spec/ogcapi-features-3/1.0/conf/features-filter',
  'http://www.opengis.net/spec/cql2/1.0/conf/cql2-text',
  'http://www.opengis.net/spec/cql2/1.0/conf/basic-cql2',
  'http://www.opengis.net/spec/cql2/1.0/conf/advanced-comparison-operators',
  'http://www.opengis.net/spec/cql2/1.0/conf/basic-spatial-functions',
];

const AIRPORTS = [
  { type: 'Feature', id: 'a1', properties: { name: 'Sumburgh Airport', elevation: 6 }, geometry: { type: 'Point', coordinates: [-1.29, 59.87] } },
  { type: 'Feature', id: 'a2', properties: { name: 'Heathrow Airport', elevation: 25 }, geometry: { type: 'Point', coordinates: [-0.45, 51.47] } },
  { type: 'Feature', id: 'a3', properties: { name: 'Barra Landing Strip', elevation: 2 }, geometry: { type: 'Point', coordinates: [-7.44, 57.02] } },
];

/** A stub service that honours the filters it is sent. */
function stubService({ conformsTo = FILTERING } = {}) {
  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(url);
    const json = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => '' });

    if (url.includes('/conformance')) return json({ conformsTo });
    if (url.includes('/queryables')) {
      return json({
        properties: {
          name: { type: 'string' },
          elevation: { type: 'integer' },
          geom: { format: 'geometry-point' },
        },
      });
    }
    if (url.includes('/collections/airports/items')) {
      const parsed = new URL(url);
      const filter = parsed.searchParams.get('filter');
      let features = AIRPORTS;
      const like = filter && filter.match(/name LIKE '%(.+)%'/);
      if (like) {
        features = AIRPORTS.filter((f) => f.properties.name.includes(like[1]));
      }
      return json({
        type: 'FeatureCollection',
        features,
        numberMatched: features.length,
        links: [],
      });
    }
    if (url.includes('/collections')) {
      return json({ collections: [{ id: 'airports', title: 'Airports' }] });
    }
    return { ok: false, status: 404, text: async () => 'no' };
  };
  return { fetchImpl, requests };
}

async function connect(options = {}) {
  const { fetchImpl } = options.service || stubService();
  const { server, summary } = await createVoiceGisMcpServer({
    serviceUrl: 'https://example.org/ogc',
    fetch: fetchImpl,
    ...options,
  });

  const client = new Client({ name: 'test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return { client, summary };
}

const parse = (result) => JSON.parse(result.content[0].text);

test('exposes the three tools and a catalog resource', async () => {
  const { client } = await connect();

  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((tool) => tool.name).sort(),
    ['describe_data', 'preview_command', 'run_command']
  );

  const { resources } = await client.listResources();
  assert.equal(resources[0].uri, 'voicegis://catalog');
});

test('describe_data grounds the agent in what actually exists', async () => {
  const { client } = await connect();
  const described = parse(await client.callTool({ name: 'describe_data', arguments: {} }));

  assert.equal(described.layers.length, 1);
  assert.equal(described.layers[0].id, 'airports');
  assert.deepEqual(
    described.layers[0].fields.map((field) => field.id).sort(),
    ['elevation', 'name']
  );
  // The geometry queryable is not offered as something to filter on.
  assert.ok(!described.layers[0].fields.some((field) => field.id === 'geom'));
  assert.deepEqual(described.permissionsGranted, ['view', 'query']);
});

test('run_command compiles, executes and returns a receipt', async () => {
  const { client } = await connect();
  const result = parse(await client.callTool({
    name: 'run_command',
    arguments: { request: 'show airports where name contains Airport' },
  }));

  assert.equal(result.executed, true);
  assert.equal(result.status, 'succeeded');
  const filter = result.results.find((entry) => entry.type === 'query.filter');
  assert.equal(filter.value.returned, 2, 'Sumburgh and Heathrow, not Barra');
});

test('run_command can return the matching features', async () => {
  const { client } = await connect();
  const result = parse(await client.callTool({
    name: 'run_command',
    arguments: { request: 'show airports where name contains Barra', includeFeatures: true },
  }));

  assert.equal(result.features.airports.length, 1);
  assert.equal(result.features.airports[0].properties.name, 'Barra Landing Strip');
});

test('a field that does not exist is refused, and nothing runs', async () => {
  const { client } = await connect();
  const result = parse(await client.callTool({
    name: 'run_command',
    arguments: { request: 'show airports where runway_length is greater than 2000' },
  }));

  assert.equal(result.executed, false);
  assert.equal(result.status, 'needs_input');
  assert.ok(result.issues.some((issue) => issue.code === 'unknown_field'));
  assert.match(result.hint, /describe_data/);
});

test('a layer that does not exist is refused', async () => {
  const { client } = await connect();
  const result = parse(await client.callTool({
    name: 'run_command',
    arguments: { request: 'show helipads where name contains x' },
  }));

  assert.equal(result.executed, false);
  assert.equal(result.status, 'needs_input');
});

test('an operation the operator did not permit is blocked before it runs', async () => {
  const { client } = await connect();
  const result = parse(await client.callTool({
    name: 'run_command',
    arguments: { request: 'export airports as geojson' },
  }));

  assert.equal(result.executed, false);
  assert.equal(result.status, 'blocked');
  assert.ok(result.issues.some((issue) => issue.code === 'policy_denied'));
  assert.match(result.reason, /does not permit/);
});

test('the same request succeeds when the operator grants the permission', async () => {
  const { client } = await connect({ permissions: ['view', 'query', 'export'] });
  const result = parse(await client.callTool({
    name: 'run_command',
    arguments: { request: 'show airports where name contains Airport' },
  }));
  assert.equal(result.executed, true);

  const exported = parse(await client.callTool({
    name: 'run_command',
    arguments: { request: 'export airports as geojson' },
  }));
  assert.equal(exported.executed, true);
  assert.equal(exported.status, 'succeeded');
});

test('preview_command shows the plan without executing it', async () => {
  const service = stubService();
  const { client } = await connect({ service });
  const before = service.requests.length;

  const preview = parse(await client.callTool({
    name: 'preview_command',
    arguments: { request: 'show airports where name contains Airport' },
  }));

  assert.equal(preview.wouldExecute, true);
  assert.equal(preview.operations.at(-1).type, 'query.filter');
  // Compiling touches the catalog only; no items request was made.
  const itemRequests = service.requests.slice(before).filter((url) => url.includes('/items'));
  assert.equal(itemRequests.length, 0);
});

test('a service that cannot filter exposes no query operations', async () => {
  const service = stubService({
    conformsTo: [
      'http://www.opengis.net/spec/cql2/1.0/conf/cql2-text',
      'http://www.opengis.net/spec/cql2/1.0/conf/basic-cql2',
    ],
  });
  const { client, summary } = await connect({ service });

  assert.equal(summary.conformance.canFilter, false);
  const described = parse(await client.callTool({ name: 'describe_data', arguments: {} }));
  assert.ok(!described.layers[0].operations.includes('query.filter'));
  assert.ok(described.serviceLimitations.join(' ').includes('does not advertise'));

  // And a filter request is refused rather than silently returning everything.
  const result = parse(await client.callTool({
    name: 'run_command',
    arguments: { request: 'show airports where name contains Airport' },
  }));
  assert.equal(result.executed, false);
});

test('the catalog resource is readable', async () => {
  const { client } = await connect();
  const read = await client.readResource({ uri: 'voicegis://catalog' });
  const catalog = JSON.parse(read.contents[0].text);

  assert.equal(catalog.layers[0].id, 'airports');
  assert.match(catalog.version, /^ogc:example\.org:/);
});

/* ====================================================================== *
 * Local GeoJSON source
 *
 * The service path requires a live, conformant endpoint, which is the
 * single biggest barrier to trying this. A file has to reach the same
 * safety behaviour: grounded in what the data actually contains, and
 * refusing everything else.
 * ====================================================================== */

const CITIES = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'Amsterdam', pop_max: 1031000, founded: '1275-10-27' }, geometry: { type: 'Point', coordinates: [4.9, 52.4] } },
    { type: 'Feature', properties: { name: 'Rotterdam', pop_max: 1004000, founded: '1340-06-07' }, geometry: { type: 'Point', coordinates: [4.5, 51.9] } },
    { type: 'Feature', properties: { name: 'Utrecht', pop_max: 639000, founded: '1122-06-02' }, geometry: { type: 'Point', coordinates: [5.1, 52.1] } },
  ],
};

async function writeFixture(name, body) {
  const { mkdtemp, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'voicegis-mcp-'));
  const path = join(dir, name);
  await writeFile(path, JSON.stringify(body), 'utf8');
  return path;
}

async function connectFiles(files, options = {}) {
  const { server, summary } = await createVoiceGisMcpServer({
    files,
    ...options,
  });
  const client = new Client({ name: 'test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return { client, summary };
}

test('a GeoJSON file becomes a layer named after it', async () => {
  const path = await writeFixture('cities.geojson', CITIES);
  const { client, summary } = await connectFiles([path]);

  assert.equal(summary.layers, 1);
  assert.match(summary.catalogVersion, /^geojson:/);

  const described = parse(await client.callTool({ name: 'describe_data', arguments: {} }));
  assert.equal(described.layers[0].id, 'cities');
  assert.deepEqual(
    described.layers[0].fields.map((field) => field.id).sort(),
    ['founded', 'name', 'pop_max']
  );
  assert.equal(
    described.layers[0].fields.find((field) => field.id === 'pop_max').type,
    'number'
  );
});

test('a file-backed layer answers attribute and spatial queries', async () => {
  const path = await writeFixture('cities.geojson', CITIES);
  const { client } = await connectFiles([path]);

  const counted = parse(await client.callTool({
    name: 'run_command',
    arguments: { request: 'count cities' },
  }));
  assert.equal(counted.executed, true);
  assert.equal(counted.status, 'succeeded');
  const count = counted.results.find((result) => result.type === 'query.count');
  assert.equal(count.value.count, 3);

  const filtered = parse(await client.callTool({
    name: 'run_command',
    arguments: {
      request: 'show cities where pop_max is greater than 1000000',
      includeFeatures: true,
    },
  }));
  assert.equal(filtered.status, 'succeeded');
  assert.deepEqual(
    filtered.features.cities.map((feature) => feature.properties.name).sort(),
    ['Amsterdam', 'Rotterdam'],
    'Utrecht is under a million and must not come back'
  );

  const near = parse(await client.callTool({
    name: 'run_command',
    arguments: { request: 'select cities within 30 kilometers of cities' },
  }));
  assert.equal(near.executed, true, 'geometry is present, so spatial select is offered');
});

test('a file-backed layer refuses what the data does not contain', async () => {
  const path = await writeFixture('cities.geojson', CITIES);
  const { client } = await connectFiles([path]);

  const badField = parse(await client.callTool({
    name: 'preview_command',
    arguments: { request: 'filter cities where elevation is over 5' },
  }));
  assert.equal(badField.status, 'needs_input');
  assert.equal(badField.issues[0].code, 'unknown_field');

  const badLayer = parse(await client.callTool({
    name: 'preview_command',
    arguments: { request: 'count harbours' },
  }));
  assert.equal(badLayer.status, 'needs_input');
  assert.equal(badLayer.issues[0].code, 'unknown_layer');
});

test('several files become several layers', async () => {
  const cities = await writeFixture('cities.geojson', CITIES);
  const ports = await writeFixture('ports.geojson', CITIES);
  const { summary } = await connectFiles([cities, ports]);

  assert.equal(summary.layers, 2);
});

test('a source must be given, and only one kind', async () => {
  await assert.rejects(
    () => createVoiceGisMcpServer({}),
    /serviceUrl or at least one GeoJSON file/
  );
  await assert.rejects(
    () => createVoiceGisMcpServer({ serviceUrl: 'https://example.org', files: ['x.geojson'] }),
    /not both/
  );
});

test('an unreadable file is reported, not guessed at', async () => {
  await assert.rejects(
    () => createVoiceGisMcpServer({ files: ['./definitely-not-here.geojson'] }),
    /Could not read/
  );
});
