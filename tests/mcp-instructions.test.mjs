import assert from 'node:assert/strict';
import test from 'node:test';
import { startFakeExchangeApi } from './helpers/exchange-api.mjs';
import {
  getFreePort,
  parseSseJson,
  spawnServer,
  startStdio,
  stopChild,
  waitForHealth,
} from './helpers/exchange-mcp.mjs';
import { assertInstructionsMatchTools } from './helpers/instructions.mjs';

const FULL_PREFIX = /^Firecrawl gives agents live web data/;
const KEYLESS_PREFIX = /^Firecrawl keyless access is usage-limited/;
const SEARCH_PREFIX = /^Firecrawl Search: web, developer, and research search/;

function rpc(port, endpoint, { id, method, params = {}, headers = {} }) {
  return fetch(`http://127.0.0.1:${port}${endpoint}`, {
    body: JSON.stringify({ id, jsonrpc: '2.0', method, params }),
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      ...headers,
    },
    method: 'POST',
  });
}

async function rpcResult(port, endpoint, request) {
  const response = await rpc(port, endpoint, request);
  assert.equal(response.status, 200, `${request.method} returned ${response.status}`);
  return parseSseJson(await response.text()).result;
}

async function httpSession(port, endpoint, headers) {
  const init = await rpcResult(port, endpoint, {
    id: 1,
    method: 'initialize',
    params: {
      capabilities: {},
      clientInfo: { name: 'firecrawl-instructions-test', version: '0.0.0' },
      protocolVersion: '2025-06-18',
    },
    headers,
  });
  const { tools } = await rpcResult(port, endpoint, { id: 2, method: 'tools/list', headers });
  return { instructions: init.instructions, tools };
}

async function startHosted(t) {
  const api = await startFakeExchangeApi();
  t.after(() => api.close());
  const port = await getFreePort();
  const searchPort = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    HTTP_STREAMABLE_SERVER: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_KEY: '',
    FIRECRAWL_OAUTH_TOKEN: '',
    FIRECRAWL_API_URL: api.url,
    KEYLESS_PROXY_SECRET: 'keyless-secret',
    PORT: String(port),
    FIRECRAWL_MCP_SEARCH_PORT: String(searchPort),
  });
  t.after(() => stopChild(child));
  await waitForHealth(port, child);
  await waitForHealth(searchPort, child);
  return { api, port, searchPort };
}

test('stdio sessions get the instructions for the tools they can use', async (t) => {
  const api = await startFakeExchangeApi();
  t.after(() => api.close());
  for (const [label, env, prefix] of [
    ['stdio with an API key', { FIRECRAWL_API_KEY: 'fc-test', FIRECRAWL_API_URL: '' }, FULL_PREFIX],
    ['stdio self-hosted', { FIRECRAWL_API_KEY: '', FIRECRAWL_OAUTH_TOKEN: '', FIRECRAWL_API_URL: api.url }, FULL_PREFIX],
    ['stdio keyless', { FIRECRAWL_API_KEY: '', FIRECRAWL_OAUTH_TOKEN: '', FIRECRAWL_API_URL: '' }, KEYLESS_PREFIX],
  ]) {
    const { client, init } = await startStdio(t, { CLOUD_SERVICE: 'false', ...env });
    const { tools } = await client.request('tools/list', {});
    assert.match(init.instructions, prefix, label);
    assertInstructionsMatchTools(init.instructions, tools, label);
  }
});

test('local HTTP sessions, which always carry a key or API URL, get the full instructions', async (t) => {
  const port = await getFreePort();
  const child = spawnServer({
    HTTP_STREAMABLE_SERVER: 'true',
    HOST: '127.0.0.1',
    CLOUD_SERVICE: 'false',
    FIRECRAWL_API_KEY: '',
    FIRECRAWL_OAUTH_TOKEN: '',
    FIRECRAWL_API_URL: '',
    PORT: String(port),
  });
  t.after(() => stopChild(child));
  await waitForHealth(port, child);
  for (const [label, headers] of [
    ['local HTTP with x-api-key', { 'x-api-key': 'fc-local-test' }],
    ['local HTTP with a bearer key', { authorization: 'Bearer fc-local-test' }],
  ]) {
    const { instructions, tools } = await httpSession(port, '/mcp', headers);
    assert.match(instructions, FULL_PREFIX, label);
    assertInstructionsMatchTools(instructions, tools, label);
  }
});

test('hosted sessions get instructions that match their own tool list', async (t) => {
  const { port, searchPort } = await startHosted(t);
  for (const [label, headers, prefix] of [
    ['hosted keyless', { 'x-forwarded-for': '8.8.8.8' }, KEYLESS_PREFIX],
    ['hosted with an API key', { 'x-api-key': 'fc-hosted-test' }, FULL_PREFIX],
    ['hosted with a malformed credential', { authorization: 'Bearer not-a-firecrawl-credential' }, KEYLESS_PREFIX],
  ]) {
    const { instructions, tools } = await httpSession(port, '/v2/mcp', headers);
    assert.match(instructions, prefix, label);
    assertInstructionsMatchTools(instructions, tools, label);
  }

  const search = await httpSession(searchPort, '/v2/mcp-search', { 'x-api-key': 'fc-hosted-test' });
  assert.match(search.instructions, SEARCH_PREFIX);
  assertInstructionsMatchTools(search.instructions, search.tools, 'search surface');
});

test('hosted scrape is read-only; local scrape and the research agent are not', async (t) => {
  const { api, port, searchPort } = await startHosted(t);
  const headers = { 'x-api-key': 'fc-hosted-test' };
  for (const [label, endpoint, surfacePort] of [
    ['hosted full surface', '/v2/mcp', port],
    ['search surface', '/v2/mcp-search', searchPort],
  ]) {
    const { tools } = await httpSession(surfacePort, endpoint, headers);
    const scrape = tools.find((tool) => tool.name === 'firecrawl_scrape');
    assert.equal(scrape.annotations.readOnlyHint, true, label);
    assert.equal(scrape.annotations.destructiveHint, false, label);
    assert.equal(scrape.inputSchema.properties.actions, undefined, `${label}: no browser actions`);
    assert.deepEqual(Object.keys(scrape.inputSchema.properties.profile.properties), ['name'], `${label}: profiles load read-only`);
    assert.doesNotMatch(scrape.description, /overwrite its stored state/, label);
  }

  const { tools } = await httpSession(port, '/v2/mcp', headers);
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  assert.equal(byName.get('firecrawl_agent').annotations.readOnlyHint, false);
  assert.deepEqual(
    Object.keys(byName.get('firecrawl_search').inputSchema.properties.scrapeOptions.properties.profile.properties),
    ['name']
  );
  assert.equal(tools.some((tool) => /terms/.test(tool.name)), false, 'no tool accepts terms');
  // Saving a profile stays available through interact.
  assert.ok(byName.get('firecrawl_interact').inputSchema.properties.scrapeOptions.properties.profile.properties.saveChanges);

  const scraped = await rpcResult(port, '/v2/mcp', {
    id: 3,
    method: 'tools/call',
    params: {
      name: 'firecrawl_scrape',
      arguments: { url: 'https://example.com/account', profile: { name: 'saved-login', saveChanges: true } },
    },
    headers,
  });
  assert.notEqual(scraped.isError, true, JSON.stringify(scraped));
  const sent = api.requests.find((request) => request.url === '/v2/scrape' && request.body?.url);
  assert.deepEqual(sent.body.profile, { name: 'saved-login', saveChanges: false });

  const { client } = await startStdio(t, { CLOUD_SERVICE: 'false', FIRECRAWL_API_KEY: 'fc-test', FIRECRAWL_API_URL: api.url });
  const local = (await client.request('tools/list', {})).tools.find((tool) => tool.name === 'firecrawl_scrape');
  assert.equal(local.annotations.readOnlyHint, false);
  assert.ok(local.inputSchema.properties.actions, 'local scrape keeps browser actions');
  assert.ok(local.inputSchema.properties.profile.properties.saveChanges, 'local scrape keeps writable profiles');
});

test('hosted scrape refuses terms acceptance on both surfaces and points to the dashboard', async (t) => {
  const { api, port, searchPort } = await startHosted(t);
  const before = api.requests.length;
  for (const [surfacePort, endpoint] of [[port, '/v2/mcp'], [searchPort, '/v2/mcp-search']]) {
    const result = await rpcResult(surfacePort, endpoint, {
      id: 4,
      method: 'tools/call',
      params: {
        name: 'firecrawl_scrape',
        arguments: {
          alexandria: [{ provider: 'firecrawl', capability: 'terms/accept', options: { provider: 'benzinga', version: 'v1', digest: 'a'.repeat(64), confirmed: true } }],
        },
      },
      headers: { 'x-api-key': 'fc-hosted-test' },
    });
    assert.equal(result.isError, true, endpoint);
    assert.match(result.content[0].text, /accepted in the Firecrawl dashboard, not through this connection.*https:\/\/www\.firecrawl\.dev\/app\/settings\?tab=data-sources/, endpoint);
  }
  assert.equal(api.requests.length, before, 'terms/accept never reaches the API through scrape');
});
