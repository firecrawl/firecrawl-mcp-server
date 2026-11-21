import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getFreePort,
  parseSseJson,
  spawnServer,
  stopChild,
  waitForHealth,
} from './helpers/exchange-mcp.mjs';

const CLI_ENV = {
  CLOUD_SERVICE: '',
  FIRECRAWL_API_KEY: 'fc-test',
  FIRECRAWL_API_URL: '',
  FIRECRAWL_MCP_ALLOWED_HOSTS: '',
  FIRECRAWL_MCP_SEARCH_ENABLED: 'false',
  HOST: '127.0.0.1',
  HTTP_STREAMABLE_SERVER: 'true',
  SSE_LOCAL: '',
};

async function startCli(t, env = {}) {
  const port = await getFreePort();
  const child = spawnServer({ ...CLI_ENV, PORT: String(port), ...env });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  t.after(() => stopChild(child));
  await waitForHealth(port, child);
  return { port, getStderr: () => stderr };
}

async function postDiscover(port) {
  const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'mcp-method': 'server/discover',
      'mcp-protocol-version': '2026-07-28',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'server/discover',
      params: {
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientInfo': { name: 'cli-test', version: '1.0.0' },
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    }),
  });
  const text = await response.text();
  const payload = text.startsWith('{') ? JSON.parse(text) : parseSseJson(text);
  return { status: response.status, payload };
}

async function postLegacyInitialize(port) {
  const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'cli-test', version: '1.0.0' },
      },
    }),
  });
  const text = await response.text();
  const payload = text.startsWith('{') ? JSON.parse(text) : parseSseJson(text);
  return { status: response.status, payload };
}

test('CLI keeps modernProtocol off by default and rejects 2026-07-28 server/discover', async (t) => {
  const { port } = await startCli(t, { FIRECRAWL_MCP_MODERN_PROTOCOL: '' });
  const discover = await postDiscover(port);
  assert.equal(discover.status, 400);
  assert.ok(discover.payload.error);
});

test('FIRECRAWL_MCP_MODERN_PROTOCOL=true enables 2026-07-28 server/discover while preserving 2025-11-25 initialize', async (t) => {
  const { port, getStderr } = await startCli(t, { FIRECRAWL_MCP_MODERN_PROTOCOL: 'true' });
  const discover = await postDiscover(port);
  assert.equal(discover.status, 200);
  assert.ok(discover.payload.result?.supportedVersions?.includes('2026-07-28'));

  const legacy = await postLegacyInitialize(port);
  assert.equal(legacy.status, 200);
  assert.equal(legacy.payload.result?.protocolVersion, '2025-11-25');
  assert.equal(getStderr(), '');
});
