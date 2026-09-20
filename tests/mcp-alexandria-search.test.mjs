import assert from 'node:assert/strict';
import test from 'node:test';
import { startStdioWithApi, callExpectingError, toolText } from './helpers/exchange-mcp.mjs';
import { CAPABILITY_HIT } from './helpers/exchange-api.mjs';

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


test('firecrawl_search forwards the Alexandria source and passes tools and creditsUsed through', async (t) => {
  const { api, client } = await startStdioWithApi(t);

  const result = await client.request('tools/call', {
    arguments: {
      query: 'nvidia balance sheet',
      sources: [{ type: 'web' }, { type: 'exchange' }],
      limit: 5,
    },
    name: 'firecrawl_search',
  });

  assert.equal(api.requests.length, 1);
  assert.equal(api.requests[0].method, 'POST');
  assert.equal(api.requests[0].url, '/v2/search');
  assert.equal(
    api.requests[0].headers.authorization,
    'Bearer fc-exchange-test'
  );
  assert.deepEqual(api.requests[0].body, {
    query: 'nvidia balance sheet',
    sources: [{ type: 'web' }, { type: 'alexandria' }],
    domainTools: true,
    limit: 5,
    origin: 'mcp-fastmcp',
  });

  const payload = toolText(result);
  assert.deepEqual(payload.data.tools, [CAPABILITY_HIT]);
  assert.equal(payload.creditsUsed, 0);
  assert.equal(payload.id, '00000000-0000-4000-8000-000000000000');
});


test('firecrawl_search forwards bare-string sources verbatim, including sources: ["alexandria"]', async (t) => {
  const { api, client } = await startStdioWithApi(t);

  const cases = [
    ['exchange'],
    ['web', 'exchange'],
    ['news', { type: 'exchange' }],
  ];
  for (const sources of cases) {
    const before = api.requests.length;
    const result = await client.request('tools/call', {
      arguments: { query: 'nvidia balance sheet', sources },
      name: 'firecrawl_search',
    });
    assert.equal(api.requests.length, before + 1, JSON.stringify(sources));
    const request = api.requests[before];
    assert.equal(request.url, '/v2/search');
    assert.deepEqual(request.body, {
      query: 'nvidia balance sheet',
      domainTools: sources.some(source => ['web', 'news', 'images'].includes(typeof source === 'string' ? source : source.type)),
      sources: sources.map((source) =>
        source === 'exchange'
          ? 'alexandria'
          : source?.type === 'exchange'
            ? { ...source, type: 'alexandria' }
            : source
      ),
      origin: 'mcp-fastmcp',
    });
    assert.deepEqual(toolText(result).data.tools, [CAPABILITY_HIT]);
  }

  const invalid = await callExpectingError(client, {
    arguments: { query: 'nvidia', sources: ['catalogue'] },
    name: 'firecrawl_search',
  });
  assert.equal(invalid.isError, true);
  assert.equal(api.requests.length, cases.length);
});


test('tool detail is forwarded and invalid values are rejected locally', async (t) => {
  const {api,client}=await startStdioWithApi(t);
  for(const name of ['firecrawl_search','firecrawl_scrape']) {
    const base=name === 'firecrawl_search' ? {query:'records'} : {url:'https://example.com',domainTools:true};
    for(const toolDetail of ['summary','full']) {
      toolText(await client.request('tools/call',{name,arguments:{...base,toolDetail}}));
      assert.equal(api.requests.at(-1).body.toolDetail,toolDetail);
    }
    const count=api.requests.length;
    await callExpectingError(client,{name,arguments:{...base,toolDetail:'invalid'}});
    assert.equal(api.requests.length,count);
  }
});
