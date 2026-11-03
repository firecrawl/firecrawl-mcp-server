import assert from 'node:assert/strict';
import test from 'node:test';
import { startStdio, startStdioWithApi, callExpectingError, toolText } from './helpers/exchange-mcp.mjs';
import { startFakeExchangeApi } from './helpers/exchange-api.mjs';

test('search surfaces optional skill cards after web and tools', async (t) => {
  const { client } = await startStdioWithApi(t, {
    searchSkills: [
      { id: 'account-firmographic-waterfall', name: 'Waterfall', description: 'Firmographics.', source: 'official', similarity: 0.91, body: '# full body' },
      { id: 'provider:acme/research/brief', name: 'Brief', description: 'Write a brief.', source: 'provider', provider: 'acme', similarity: 0.8, files: ['SKILL.md'] },
    ],
  });
  const body = toolText(await client.request('tools/call', { name: 'firecrawl_search', arguments: { query: 'firmographics' } }));
  assert.deepEqual(Object.keys(body.data), ['web', 'tools', 'skills']);
  assert.equal(body.data.web[0].source, 'web');
  assert.equal(body.data.web[0].position, 1);
  assert.deepEqual(body.data.skills[0], {
    id: 'account-firmographic-waterfall',
    name: 'Waterfall',
    description: 'Firmographics.',
    source: 'official',
    similarity: 0.91,
    nextTool: { name: 'firecrawl_read_skill', arguments: { id: 'account-firmographic-waterfall' } },
  });
  assert.deepEqual(body.data.skills[1], {
    id: 'provider:acme/research/brief',
    name: 'Brief',
    description: 'Write a brief.',
    source: 'provider',
    provider: 'acme',
    similarity: 0.8,
    nextTool: { name: 'firecrawl_read_skill', arguments: { provider: 'acme', plugin: 'research', skill: 'brief' } },
  });
});

test('search without data.skills leaves the grouped result unchanged', async (t) => {
  const { client } = await startStdioWithApi(t);
  const body = toolText(await client.request('tools/call', { name: 'firecrawl_search', arguments: { query: 'company news' } }));
  assert.equal(Object.hasOwn(body.data, 'skills'), false);
  assert.deepEqual(Object.keys(body.data), ['tools']);
});

test('authenticated search always adds alexandria and keeps the requested sources', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  for (const [overrides, sources, domainTools] of [
    [{}, ['web', 'alexandria', 'alexandria-skills'], true],
    [{ sources: [] }, ['web', 'alexandria', 'alexandria-skills'], true],
    [{ domainTools: false }, ['web', 'alexandria', 'alexandria-skills'], false],
    [{ sources: ['web'] }, ['web', 'alexandria'], true],
    [{ sources: ['web'], domainTools: false }, ['web', 'alexandria'], false],
    [{ sources: ['news'] }, ['news', 'alexandria'], true],
    [{ sources: ['web', 'images'] }, ['web', 'images', 'alexandria'], true],
    [{ sources: [{ type: 'web' }] }, [{ type: 'web' }, { type: 'alexandria' }], true],
    [{ sources: ['web', 'alexandria'] }, ['web', 'alexandria'], true],
    [{ sources: ['web', 'exchange'] }, ['web', 'alexandria'], true],
    [{ sources: ['alexandria'] }, ['alexandria'], false],
    [{ sources: [{ type: 'alexandria' }] }, [{ type: 'alexandria' }], false],
    [{ sources: ['alexandria'], domainTools: true }, ['alexandria'], true],
    [{ categories: ['gov'] }, ['web', 'alexandria', 'alexandria-skills'], true],
    [{ sources: ['web', 'alexandria-skills'] }, ['web', 'alexandria-skills', 'alexandria'], true],
    [{ sources: [{ type: 'alexandria-skills' }] }, [{ type: 'alexandria-skills' }, { type: 'alexandria' }], false],
    [{ sources: ['web'], categories: ['developer'] }, ['web', 'alexandria'], true],
  ]) {
    const result = await client.request('tools/call', {
      name: 'firecrawl_search',
      arguments: { query: 'company news', ...overrides },
    });
    assert.notEqual(result.isError, true);
    assert.equal(api.requests.at(-1).body.toolDetail, 'compact');
    assert.equal(toolText(result).data.tools[0].provider, 'fred');
    assert.equal('creditsCost' in toolText(result).data.tools[0], false);
    assert.deepEqual(api.requests.at(-1).body.sources, sources, JSON.stringify(overrides));
    assert.equal(api.requests.at(-1).body.domainTools, domainTools, JSON.stringify(overrides));
  }
});

test('zero data retention and anonymous searches do not get alexandria added', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  for (const enterprise of [['zdr'], ['anon']]) {
    await client.request('tools/call', {
      name: 'firecrawl_search',
      arguments: { query: 'company news', sources: ['web'], enterprise },
    });
    assert.deepEqual(api.requests.at(-1).body.sources, ['web']);
    assert.equal(api.requests.at(-1).body.domainTools, false);
  }
});

test('search without a credential sends only the requested sources', async (t) => {
  const api = await startFakeExchangeApi();
  t.after(() => api.close());
  const { client } = await startStdio(t, {
    CLOUD_SERVICE: 'false',
    FIRECRAWL_API_KEY: '',
    FIRECRAWL_OAUTH_TOKEN: '',
    FIRECRAWL_API_URL: api.url,
  });
  for (const [overrides, sources] of [[{}, ['web']], [{ sources: ['news'] }, ['news']], [{ sources: ['web', 'alexandria-skills'] }, ['web', 'alexandria-skills']]]) {
    const result = await client.request('tools/call', {
      name: 'firecrawl_search',
      arguments: { query: 'company news', ...overrides },
    });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    assert.deepEqual(api.requests.at(-1).body.sources, sources);
    assert.equal(api.requests.at(-1).body.domainTools, false);
  }
});

test('added alexandria falls back to the requested sources on discovery refusal; explicit tools and other errors remain errors', async (t) => {
  const { api, client } = await startStdioWithApi(t, {
    searchRefusal: 'Provider discovery requires access and does not support zero data retention.',
  });
  for (const [overrides, fallback] of [[{}, ['web']], [{ sources: ['news'] }, ['news']], [{ sources: [{ type: 'web' }] }, [{ type: 'web' }]]]) {
    const before = api.requests.length;
    const result = await client.request('tools/call', {
      name: 'firecrawl_search', arguments: { query: 'company news', ...overrides },
    });
    assert.notEqual(result.isError, true);
    assert.equal(api.requests.length, before + 2);
    assert.deepEqual(api.requests.at(-1).body.sources, fallback);
    assert.equal(api.requests.at(-1).body.domainTools, false);
  }
  for (const explicit of [{ sources: ['alexandria'] }, { sources: ['web', 'alexandria'] }, { domainTools: true }]) {
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

test('search relays the API error message whatever sources are requested', async (t) => {
  const apiError = 'Insufficient credits to perform this request. For more credits, you can upgrade your plan at https://firecrawl.dev/pricing.';
  const { client } = await startStdioWithApi(t, { apiStatus: 402, apiError });
  for (const overrides of [{}, { sources: ['web'] }, { sources: ['news'] }, { sources: ['alexandria'] }]) {
    const result = await callExpectingError(client, {
      name: 'firecrawl_search', arguments: { query: 'company news', ...overrides },
    });
    assert.match(result.content[0].text, /upgrade your plan at https:\/\/firecrawl\.dev\/pricing/, JSON.stringify(overrides));
  }
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

test('full firecrawl_search forwards domain filters as body fields without rewriting the query', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  for (const [field, domains] of [
    ['includeDomains', ['www.sport1.de', 'www.atptour.com']],
    ['excludeDomains', ['facebook.com', 'en.wikipedia.org']],
  ]) {
    const result = await client.request('tools/call', {
      name: 'firecrawl_search',
      arguments: { query: 'davis cup', sources: ['web'], [field]: domains },
    });
    assert.notEqual(result.isError, true);
    const body = api.requests.at(-1).body;
    assert.equal(body.query, 'davis cup');
    assert.deepEqual(body[field], domains);
  }
  const before = api.requests.length;
  await callExpectingError(client, {
    name: 'firecrawl_search',
    arguments: { query: 'davis cup', includeDomains: ['a.com'], excludeDomains: ['b.com'] },
  });
  assert.equal(api.requests.length, before);
});
