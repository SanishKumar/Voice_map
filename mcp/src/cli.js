#!/usr/bin/env node
/**
 * Start the VoiceGIS MCP server over stdio.
 *
 * Diagnostics go to stderr: stdout carries the JSON-RPC stream and anything
 * else written there corrupts the session.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createVoiceGisMcpServer, DEFAULT_PERMISSIONS } from './server.js';

const USAGE = `
voicegis-mcp — query a spatial data service in plain language, safely.

Usage:
  voicegis-mcp --service <url> [options]
  voicegis-mcp --file <path> [--file <path> ...] [options]

Options:
  --service <url>       OGC API - Features landing page.
  --file <path>         GeoJSON file to serve. One layer per file, named after
                        the file. Repeatable. Use instead of --service.
  --allow <perms>       Comma-separated permissions to grant.
                        Default: ${DEFAULT_PERMISSIONS.join(',')}
                        Available: view, query, analysis, export
  --include <ids>       Only expose these layer ids.
  --exclude <ids>       Skip these layer ids.
  --limit <n>           Page size requested from the service. Default 500.
                        --service only.
  --max-pages <n>       Safety bound on pagination. Default 20.
                        --service only.
  --help                Show this message.

Examples:
  voicegis-mcp --service https://demo.ldproxy.net/zoomstack
  voicegis-mcp --file ./cities.geojson --file ./rivers.geojson

The agent gets exactly the permissions granted here. Requests naming anything
outside the catalog derived from the data are refused rather than guessed at.
`;

const REPEATABLE = new Set(['file']);

function parseArgs(argv) {
  /** @type {Record<string, string|boolean|string[]>} */
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const name = token.slice(2);
    const next = argv[i + 1];
    const value = next && !next.startsWith('--') ? next : true;
    if (value !== true) i += 1;

    if (REPEATABLE.has(name) && value !== true) {
      const existing = flags[name];
      flags[name] = Array.isArray(existing) ? [...existing, value] : [value];
    } else {
      flags[name] = value;
    }
  }
  return flags;
}

const list = (value) => (typeof value === 'string'
  ? value.split(',').map((part) => part.trim()).filter(Boolean)
  : undefined);

async function main() {
  const flags = parseArgs(process.argv.slice(2));

  const files = Array.isArray(flags.file) ? flags.file : undefined;

  if (flags.help || (!flags.service && !files)) {
    process.stderr.write(USAGE);
    process.exit(flags.help ? 0 : 1);
  }
  if (flags.service && files) {
    process.stderr.write('[voicegis-mcp] pass --service or --file, not both.\n');
    process.exit(1);
  }

  const log = (message) => process.stderr.write(`[voicegis-mcp] ${message}\n`);

  const { server, summary } = await createVoiceGisMcpServer({
    serviceUrl: flags.service ? String(flags.service) : undefined,
    files,
    permissions: list(flags.allow) || [...DEFAULT_PERMISSIONS],
    include: list(flags.include),
    exclude: list(flags.exclude),
    limit: flags.limit ? Number(flags.limit) : undefined,
    maxPages: flags['max-pages'] ? Number(flags['max-pages']) : undefined,
    log,
  });

  log(`${summary.layers} layer(s) ready; permissions: ${summary.permissions.join(', ')}`);
  if (!summary.conformance.canFilter) {
    log('this service does not support filtering, so query tools are limited');
  }

  await server.connect(new StdioServerTransport());
  log('listening on stdio');
}

main().catch((error) => {
  process.stderr.write(`[voicegis-mcp] failed to start: ${error.message}\n`);
  process.exit(1);
});
