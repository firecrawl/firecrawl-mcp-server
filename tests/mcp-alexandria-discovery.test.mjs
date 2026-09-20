import assert from 'node:assert/strict';
import test from 'node:test';
import { startStdioWithApi, callExpectingError, toolText } from './helpers/exchange-mcp.mjs';

test('firecrawl_exchange_discover builds every catalogue route and the semantic index route', async (t) => {
  const { api, client } = await startStdioWithApi(t);

  const cases = [
    [{}, '/exchange/discover', {}],
    [
      { q: 'balance sheet', limit: 3 },
      '/exchange/discover',
      { q: 'balance sheet', limit: '3' },
    ],
    [{ cohort: 'finance' }, '/exchange/discover/finance', {}],
    [
      { cohort: 'finance', expand: 'all' },
      '/exchange/discover/finance',
      { expand: 'all' },
    ],
    [
      { cohort: 'finance', provider: 'fred' },
      '/exchange/discover/finance/fred',
      {},
    ],
    [
      {
        cohort: 'finance',
        provider: 'fred',
        capability: 'series/observations',
      },
      '/exchange/discover/finance/fred/series/observations',
      {},
    ],
    [
      { cohort: 'web data', provider: 'a/b' },
      '/exchange/discover/web%20data/a%2Fb',
      {},
    ],
    [
      { cohort: 'finance', provider: 'fred.v2', capability: 'series/.obs' },
      '/exchange/discover/finance/fred.v2/series/.obs',
      {},
    ],
  ];

  for (const [args, expectedPath, expectedQuery] of cases) {
    const before = api.requests.length;
    const result = await client.request('tools/call', {
      arguments: args,
      name: 'firecrawl_exchange_discover',
    });
    assert.equal(api.requests.length, before + 1, JSON.stringify(args));
    const request = api.requests[before];
    assert.equal(request.method, 'GET');
    assert.equal(request.headers.authorization, 'Bearer fc-exchange-test');
    assert.equal(request.headers['x-origin'], 'mcp-fastmcp');
    const sent = new URL(request.url, 'http://127.0.0.1');
    assert.equal(sent.pathname, expectedPath, JSON.stringify(args));
    assert.deepEqual(
      Object.fromEntries(sent.searchParams),
      expectedQuery,
      JSON.stringify(args)
    );
    const payload = toolText(result);
    assert.equal(payload.path, expectedPath);
  }
});


test('firecrawl_exchange_discover refuses dot segments and expand off the cohort route before any request', async (t) => {
  const { api, client } = await startStdioWithApi(t);

  const dotted = [
    { cohort: '..' },
    { cohort: '.' },
    { cohort: 'finance', provider: '..' },
    { cohort: 'finance', provider: 'fred', capability: '../../foo' },
    { cohort: 'finance', provider: 'fred', capability: 'series/./obs' },
  ];
  for (const args of dotted) {
    const result = await callExpectingError(client, {
      arguments: args,
      name: 'firecrawl_exchange_discover',
    });
    assert.equal(result.transportError, undefined, JSON.stringify(args));
    assert.match(result.content[0].text, /"\." and "\.\." are not accepted/);
  }

  const expandOffCohort = [
    { expand: 'all' },
    { cohort: 'finance', provider: 'fred', expand: 'all' },
    {
      cohort: 'finance',
      provider: 'fred',
      capability: 'series/observations',
      expand: 'all',
    },
  ];
  for (const args of expandOffCohort) {
    const result = await callExpectingError(client, {
      arguments: args,
      name: 'firecrawl_exchange_discover',
    });
    assert.equal(result.transportError, undefined, JSON.stringify(args));
    assert.match(
      result.content[0].text,
      /expand applies on a cohort route only/
    );
  }
  assert.equal(api.requests.length, 0);
});


test('firecrawl_exchange_discover refuses q off the index route and incomplete walks before any request', async (t) => {
  const { api, client } = await startStdioWithApi(t);

  const invalid = [
    { q: 'balance sheet', cohort: 'finance' },
    { q: 'balance sheet', cohort: 'finance', provider: 'fred' },
    { provider: 'fred' },
    { capability: 'series/observations' },
    { cohort: 'finance', capability: 'series/observations' },
    { limit: 3 },
    { q: 'balance sheet', limit: 0 },
    { q: 'balance sheet', limit: 25 },
    { cohort: 'finance', expand: 'none' },
  ];
  for (const args of invalid) {
    const result = await callExpectingError(client, {
      arguments: args,
      name: 'firecrawl_exchange_discover',
    });
    if (args.q && args.cohort && !result.transportError) {
      assert.match(result.content[0].text, /index route only/);
    }
  }
  assert.equal(api.requests.length, 0);
});


test('firecrawl_exchange_discover relays a 501 semantic_not_configured with its code', async (t) => {
  const { api, client } = await startStdioWithApi(t);

  const result = await callExpectingError(client, {
    arguments: { q: 'unindexed' },
    name: 'firecrawl_exchange_discover',
  });
  assert.equal(api.requests.length, 1);
  assert.equal(result.transportError, undefined);
  assert.equal(result.content[0].text, 'Semantic discovery is not configured.');
  assert.equal(result.structuredContent.code, 'semantic_not_configured');
  assert.equal(result.structuredContent.status, 501);
});


test('Find Tools uses scrape for contextual lookup, chaining and pagination', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const options = {providers: ['particle'], capabilities: ['podcasts/episodes/search'], expand: ['options', 'response'], limit: 2, offset: 2};
  const response = await client.request('tools/call', {name: 'firecrawl_find_tools', arguments: options});
  const call = {provider: 'firecrawl', capability: 'find-tools', options: {...options, level: 'tools'}};
  assert.equal(api.requests[0].url, '/v2/scrape');
  assert.deepEqual(api.requests[0].body.alexandria, call);
  assert.equal(toolText(response).data.creditsCost, 0);
  const next = toolText(response).data.alexandria[0].data.next;
  await client.request('tools/call', {name: 'firecrawl_scrape', arguments: {alexandria: next, requestId: 'walk-1'}});
  assert.deepEqual(api.requests[1].body.alexandria, next);
  assert.equal(api.requests[1].headers['x-request-id'], 'walk-1');
  const before = api.requests.length;
  for (const arguments_ of [{sources: ['alexandria']}, {query: 'podcasts', sources: [{type: 'alexandria', mode: 'browse'}]}]) {
    await callExpectingError(client, {name: 'firecrawl_search', arguments: arguments_});
  }
  assert.equal(api.requests.length, before);
});


test('Find Tools starts with categories and follows category pagination without dropping scope', async (t) => {
  const {api, client} = await startStdioWithApi(t);
  const call = args => client.request('tools/call', {name:'firecrawl_find_tools', arguments:args});
  const root = toolText(await call({limit:1})).data.alexandria[0].data;
  assert.equal(api.requests[0].url, '/exchange/discover');
  assert.equal(root.level, 'categories');
  assert.equal(root.total, 2);
  assert.equal(root.items[0].id, 'people');
  assert.deepEqual(root.items[0].nextTool, {name:'firecrawl_find_tools',arguments:{categories:['people'],level:'providers',limit:1}});
  const second = toolText(await call(root.nextTool.arguments)).data.alexandria[0].data;
  assert.equal(second.items[0].id, 'finance');
  assert.equal(second.nextTool, undefined);
  await call(root.items[0].nextTool.arguments);
  assert.deepEqual(api.requests[2].body.alexandria.options,{categories:['people'],level:'providers',limit:1});
});


test('Find Tools infers compact provider tools and full selected contracts while respecting overrides', async (t) => {
  const {api, client} = await startStdioWithApi(t);
  for (const [args,expected] of [
    [{query:'company records',expand:[]},{query:'company records',expand:[],level:'tools',limit:20}],
    [{providers:['particle']},{providers:['particle'],level:'tools',limit:20}],
    [{categories:['podcasts'],providers:['particle'],capabilities:['podcasts/episodes/search']},{categories:['podcasts'],providers:['particle'],capabilities:['podcasts/episodes/search'],level:'tools',limit:20,expand:['options','response','examples']}],
    [{providers:['particle'],capabilities:['podcasts/episodes/search'],expand:[]},{providers:['particle'],capabilities:['podcasts/episodes/search'],level:'tools',limit:20,expand:[]}],
    [{providers:['particle'],level:'groups'},{providers:['particle'],level:'groups',limit:20}],
  ]) {
    const result=toolText(await client.request('tools/call',{name:'firecrawl_find_tools',arguments:args}));
    assert.deepEqual(api.requests.at(-1).body.alexandria.options,expected);
    assert.deepEqual(result.data.alexandria[0].data.nextTool.arguments,{...expected,offset:4});
  }
  const before=api.requests.length;
  await callExpectingError(client,{name:'firecrawl_find_tools',arguments:{level:'categories',providers:['particle']}});
  assert.equal(api.requests.length,before);
});


test('Find Tools trims queries and rejects whitespace before reaching the API', async (t) => {
  const {api,client}=await startStdioWithApi(t);
  const result=await client.request('tools/call',{name:'firecrawl_find_tools',arguments:{query:'  company records  '}});
  assert.notEqual(result.isError,true);
  assert.equal(api.requests.at(-1).body.alexandria.options.query,'company records');
  const count=api.requests.length;
  await callExpectingError(client,{name:'firecrawl_find_tools',arguments:{query:' \t\n '}});
  assert.equal(api.requests.length,count);
});
