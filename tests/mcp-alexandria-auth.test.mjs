import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { EXCHANGE_KEY_REQUIRED_MESSAGE, getFreePort, waitForHealth, parseSseJson, spawnServer, stopChild, startStdio, startStdioWithApi, toolText, httpToolCall } from './helpers/exchange-mcp.mjs';
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

test('a hosted API key header reaches the Exchange', async (t) => {
  const backend = await startFakeExchangeApi();
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
    PORT: String(port),
  });
  t.after(() => stopChild(child));
  let startupError = ''; child.stderr.on('data', chunk => { startupError += chunk; });
  try { await waitForHealth(port, child); } catch (error) { throw new Error(`${error.message}: ${startupError}`); }
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
    origin: `mcp-ua-node@${JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version}`,
  });
});

test('rejected API keys return in-band errors without leaking credentials on Alexandria paths', async (t) => {
  const { api, client, getStderr } = await startStdioWithApi(t, { apiStatus: 401 });
  for (const params of [
    { name: 'firecrawl_find_tools', arguments: { categories: ['finance'] } },
    { name: 'firecrawl_search', arguments: { query: 'rates', sources: ['alexandria'] } },
    { name: 'firecrawl_scrape', arguments: { alexandria: [EXCHANGE_CALL] } },
    { name: 'firecrawl_scrape', arguments: { alexandria: [{ provider: 'firecrawl', capability: 'terms/show', options: { provider: 'benzinga' } }] } },
  ]) {
    const before = api.requests.length;
    const result = await client.request('tools/call', params);
    assert.equal(result.isError, true);
    assert.ok(api.requests.length > before);
    assert.doesNotMatch(JSON.stringify(result), /fc-exchange-test/);
  }
  assert.doesNotMatch(getStderr(), /fc-exchange-test/);
});
