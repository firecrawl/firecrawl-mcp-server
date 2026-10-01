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

function rpc(port, endpoint, { id, method, params = {}, headers = {} }) {
  return fetch(`http://127.0.0.1:${port}${endpoint}`, {
    body: JSON.stringify({ id, jsonrpc: '2.0', method, params }),
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      ...headers,
    },
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
  });
}

async function rpcResult(port, endpoint, request) {
  const response = await rpc(port, endpoint, request);
  assert.equal(response.status, 200, `${request.method} returned ${response.status}`);
  return parseSseJson(await response.text()).result;
}

async function httpSession(port, endpoint, headers) {
  await rpcResult(port, endpoint, {
    id: 1,
    method: 'initialize',
    params: {
      capabilities: {},
      clientInfo: { name: 'firecrawl-read-only-test', version: '0.0.0' },
      protocolVersion: '2025-06-18',
    },
    headers,
  });
  const { tools } = await rpcResult(port, endpoint, { id: 2, method: 'tools/list', headers });
  return { tools };
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

test('hosted scrape is read-only and preserves existing profile and search options', async (t) => {
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
    assert.doesNotMatch(scrape.description, /overwrite its stored state/, label);
  }

  const { tools } = await httpSession(port, '/v2/mcp', headers);
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  assert.equal(byName.get('firecrawl_agent').annotations.readOnlyHint, false);
  assert.equal(byName.get('firecrawl_search').annotations.readOnlyHint, true);
  assert.equal(tools.some((tool) => /terms/.test(tool.name)), false, 'no tool accepts terms');

  for (const [surfacePort, endpoint] of [[port, '/v2/mcp'], [searchPort, '/v2/mcp-search']]) {
    for (const profile of [{ name: 'saved-login' }, { name: 'saved-login', saveChanges: true }]) {
      const scraped = await rpcResult(surfacePort, endpoint, {
        id: 3,
        method: 'tools/call',
        params: {
          name: 'firecrawl_scrape',
          arguments: { url: 'https://example.com/account', profile, actions: [{ type: 'click', selector: '#submit' }] },
        },
        headers,
      });
      assert.notEqual(scraped.isError, true, JSON.stringify(scraped));
      assert.deepEqual(api.requests.at(-1).body.profile, profile, 'profile options remain unchanged');
      assert.equal(api.requests.at(-1).body.actions, undefined);
    }
  }

  const searched = await rpcResult(port, '/v2/mcp', {
    id: 4,
    method: 'tools/call',
    params: {
      name: 'firecrawl_search',
      arguments: { query: 'account documentation', scrapeOptions: { profile: { name: 'saved-login', saveChanges: true }, actions: [{ type: 'click', selector: '#submit' }] } },
    },
    headers,
  });
  assert.notEqual(searched.isError, true, JSON.stringify(searched));
  assert.deepEqual(api.requests.at(-1).body.scrapeOptions.profile, { name: 'saved-login', saveChanges: true });
  assert.equal(api.requests.at(-1).body.scrapeOptions.actions, undefined);

  const { client } = await startStdio(t, { CLOUD_SERVICE: 'false', FIRECRAWL_API_KEY: 'fc-test', FIRECRAWL_API_URL: api.url });
  const localTools = (await client.request('tools/list', {})).tools;
  const local = localTools.find((tool) => tool.name === 'firecrawl_scrape');
  assert.equal(local.annotations.readOnlyHint, false);
  assert.ok(local.inputSchema.properties.actions, 'local scrape keeps browser actions');
  assert.ok(local.inputSchema.properties.profile.properties.saveChanges, 'local scrape keeps profile options');
  const localSearch = localTools.find((tool) => tool.name === 'firecrawl_search');
  assert.equal(localSearch.annotations.readOnlyHint, true, 'local search annotation remains unchanged');
});

test('hosted scrape refuses terms acceptance on both surfaces and points to the dashboard', async (t) => {
  const { api, port, searchPort } = await startHosted(t);
  for (const [surfacePort, endpoint] of [[port, '/v2/mcp'], [searchPort, '/v2/mcp-search']]) {
    const acceptance = { provider: 'firecrawl', capability: 'terms/accept', options: { provider: 'benzinga', version: 'v1', digest: 'a'.repeat(64), confirmed: true } };
    for (const alexandria of [
      acceptance,
      [{ ...acceptance, provider: ' Firecrawl ', capability: 'Terms/Accept' }],
      [{ provider: 'firecrawl', capability: 'terms/revoke', options: { provider: 'benzinga' } }],
      [{ provider: 'fred', capability: 'finance/series' }, acceptance],
    ]) {
      const before = api.requests.length;
      const result = await rpcResult(surfacePort, endpoint, {
        id: 5,
        method: 'tools/call',
        params: {
          name: 'firecrawl_scrape',
          arguments: { alexandria },
        },
        headers: { 'x-api-key': 'fc-hosted-test' },
      });
      assert.equal(result.isError, true, endpoint);
      assert.match(result.content[0].text, /accepted in the Firecrawl dashboard, not through this connection.*https:\/\/www\.firecrawl\.dev\/app\/settings\?tab=data-sources/, endpoint);
      assert.equal(api.requests.length, before, 'the whole batch is refused before any API call');
    }
    const shown = await rpcResult(surfacePort, endpoint, {
      id: 6,
      method: 'tools/call',
      params: { name: 'firecrawl_scrape', arguments: { alexandria: { provider: 'firecrawl', capability: 'terms/show', options: { provider: 'benzinga' } } } },
      headers: { 'x-api-key': 'fc-hosted-test' },
    });
    assert.notEqual(shown.isError, true, JSON.stringify(shown));
    assert.equal(api.requests.at(-1).body.alexandria.capability, 'terms/show');
  }
});
