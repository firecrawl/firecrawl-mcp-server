import assert from 'node:assert/strict';
import test from 'node:test';
import { EXCHANGE_KEY_REQUIRED_MESSAGE, KEYLESS_TOOL_MESSAGE, getFreePort, waitForHealth, parseSseJson, spawnServer, stopChild, startStdio, toolText, httpToolCall } from './helpers/exchange-mcp.mjs';
import { EXCHANGE_CALL, startFakeExchangeApi } from './helpers/exchange-api.mjs';

test('local keyless stdio refuses every Exchange path with the explanatory error and no network call', async (t) => {
  const { client } = await startStdio(t, {
    FIRECRAWL_API_KEY: '',
    FIRECRAWL_API_URL: '',
    FIRECRAWL_OAUTH_TOKEN: '',
  });

  for (const params of [
    {
      arguments: { query: 'nvidia', sources: [{ type: 'exchange' }] },
      name: 'firecrawl_search',
    },
    { arguments: { alexandria: [EXCHANGE_CALL] }, name: 'firecrawl_scrape' },
    { arguments: { categories: ['finance'] }, name: 'firecrawl_find_tools' },
    { arguments: {}, name: 'firecrawl_find_tools' },
    { arguments: { alexandria: [{ provider: 'firecrawl', capability: 'terms/show', options: { provider: 'benzinga' } }] }, name: 'firecrawl_scrape' },
    { arguments: { alexandria: [{ provider: 'firecrawl', capability: 'terms/accept', options: { provider: 'benzinga', version: 'v1', digest: 'a'.repeat(64), confirmed: true } }] }, name: 'firecrawl_scrape' },
  ]) {
    const result = await client.request('tools/call', params);
    assert.equal(result.isError, true, JSON.stringify(result));
    assert.equal(
      result.content[0].text,
      EXCHANGE_KEY_REQUIRED_MESSAGE,
      params.name
    );
    assert.equal(result.structuredContent.code, 'EXCHANGE_API_KEY_REQUIRED');
    assert.equal(
      result.structuredContent.message,
      EXCHANGE_KEY_REQUIRED_MESSAGE
    );
  }
});

test('hosted keyless sessions never reach the Exchange; an API key header does', async (t) => {
  const backend = await startFakeExchangeApi({ keylessEligible: true });
  t.after(() => backend.close());
  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FIRECRAWL_API_KEY: '',
    FIRECRAWL_OAUTH_TOKEN: '',
    FIRECRAWL_MCP_SEARCH_PORT: String(await getFreePort()),
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: backend.url,
    HTTP_STREAMABLE_SERVER: 'true',
    KEYLESS_PROXY_SECRET: 'keyless-secret',
    PORT: String(port),
  });
  t.after(() => stopChild(child));
  let startupError = ''; child.stderr.on('data', chunk => { startupError += chunk; });
  try { await waitForHealth(port, child); } catch (error) { throw new Error(`${error.message}: ${startupError}`); }
  const keylessHeaders = { 'x-forwarded-for': '8.8.8.7' };

  const listing = await fetch(`http://127.0.0.1:${port}/v2/mcp`, {
    body: JSON.stringify({
      id: 1,
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {},
    }),
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      ...keylessHeaders,
    },
    method: 'POST',
  });
  const listed = parseSseJson(await listing.text()).result.tools.map(
    (tool) => tool.name
  );
  assert.equal(listed.includes('firecrawl_find_tools'), false);
  assert.equal(listed.includes('firecrawl_scrape'), true);

  const discover = parseSseJson(
    await (
      await httpToolCall(port, {
        id: 2,
        headers: keylessHeaders,
        params: {
          arguments: { categories: ['finance'] },
          name: 'firecrawl_find_tools',
        },
      })
    ).text()
  ).result;
  assert.equal(discover.isError, true);
  assert.equal(discover.structuredContent.code, 'KEYLESS_TOOL_NOT_AVAILABLE');
  assert.equal(discover.content[0].text, KEYLESS_TOOL_MESSAGE);

  for (const params of [
    { arguments: { alexandria: [EXCHANGE_CALL] }, name: 'firecrawl_scrape' },
    {
      arguments: { query: 'nvidia', sources: [{ type: 'exchange' }] },
      name: 'firecrawl_search',
    },
  ]) {
    const result = parseSseJson(
      await (
        await httpToolCall(port, { id: 3, headers: keylessHeaders, params })
      ).text()
    ).result;
    assert.equal(result.isError, true, JSON.stringify(result));
    assert.equal(
      result.content[0].text,
      EXCHANGE_KEY_REQUIRED_MESSAGE,
      params.name
    );
    assert.equal(result.structuredContent.code, 'EXCHANGE_API_KEY_REQUIRED');
  }
  assert.equal(
    backend.requests.some(
      (request) => request.url !== '/v2/keyless/eligibility'
    ),
    false,
    'keyless sessions must not reach /v2/scrape, /v2/search, or /exchange/*'
  );

  const keyed = parseSseJson(
    await (
      await httpToolCall(port, {
        id: 4,
        headers: { 'x-api-key': 'fc-exchange-header' },
        params: {
          arguments: { alexandria: [EXCHANGE_CALL] },
          name: 'firecrawl_scrape',
        },
      })
    ).text()
  ).result;
  const payload = toolText(keyed);
  assert.equal(payload.data.creditsCost, 1);
  const scrapeCalls = backend.requests.filter(
    (request) => request.url === '/v2/scrape'
  );
  assert.equal(scrapeCalls.length, 1);
  assert.equal(
    scrapeCalls[0].headers.authorization,
    'Bearer fc-exchange-header'
  );
  assert.deepEqual(scrapeCalls[0].body, {
    alexandria: [EXCHANGE_CALL],
    origin: 'mcp-fastmcp',
  });
});
