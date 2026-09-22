import assert from 'node:assert/strict';
import test from 'node:test';
import { startStdioWithApi, callExpectingError, toolText } from './helpers/exchange-mcp.mjs';

test('ordinary search defaults to web and both tool matches, with explicit opt-outs', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  for (const [overrides, sources, domainTools] of [
    [{}, ['web', 'alexandria'], true],
    [{ domainTools: false }, ['web', 'alexandria'], false],
    [{ sources: ['web'] }, ['web'], false],
    [{ sources: ['alexandria'] }, ['alexandria'], false],
    [{ sources: [{ type: 'alexandria' }] }, [{ type: 'alexandria' }], false],
    [{ sources: ['alexandria'], domainTools: true }, ['alexandria'], true],
  ]) {
    const result = await client.request('tools/call', {
      name: 'firecrawl_search',
      arguments: { query: 'company news', ...overrides },
    });
    assert.notEqual(result.isError, true);
    assert.equal(api.requests.at(-1).body.toolDetail, 'compact');
    assert.equal(toolText(result).data.tools[0].provider, 'fred');
    assert.deepEqual(api.requests.at(-1).body.sources, sources);
    assert.equal(api.requests.at(-1).body.domainTools, domainTools);
  }
});

test('default tools fall back only on discovery refusal; explicit tools and other errors remain errors', async (t) => {
  const { api, client } = await startStdioWithApi(t, {
    searchRefusal: 'Provider discovery requires access and does not support zero data retention.',
  });
  const result = await client.request('tools/call', {
    name: 'firecrawl_search', arguments: { query: 'company news' },
  });
  assert.notEqual(result.isError, true);
  assert.equal(api.requests.length, 2);
  assert.deepEqual(api.requests[1].body.sources, ['web']);
  assert.equal(api.requests[1].body.domainTools, false);
  for (const explicit of [{ sources: ['alexandria'] }, { domainTools: true }]) {
    const before = api.requests.length;
    await callExpectingError(client, {
      name: 'firecrawl_search', arguments: { query: 'company news', ...explicit },
    });
    assert.equal(api.requests.length, before + 1);
  }
  const other = await startStdioWithApi(t, { searchRefusal: 'Permission denied.' });
  await callExpectingError(other.client, {
    name: 'firecrawl_search', arguments: { query: 'company news' },
  });
  assert.equal(other.api.requests.length, 1);
});

test('toolDetail forwards valid values and rejects invalid values before API calls', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  for (const [name, args] of [
    ['firecrawl_search', { query: 'company news' }],
    ['firecrawl_scrape', { url: 'https://example.com' }],
  ]) {
    for (const toolDetail of ['compact', 'full']) {
      const result = await client.request('tools/call', { name, arguments: { ...args, toolDetail } });
      assert.notEqual(result.isError, true);
      assert.equal(api.requests.at(-1).body.toolDetail, toolDetail);
    }
    const before = api.requests.length;
    await callExpectingError(client, { name, arguments: { ...args, toolDetail: 'invalid' } });
    assert.equal(api.requests.length, before);
  }
});
