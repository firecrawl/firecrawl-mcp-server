import assert from 'node:assert/strict';
import test from 'node:test';
import { startStdioWithApi, callExpectingError, toolText } from './helpers/exchange-mcp.mjs';

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

test('tool inventory exposes current discovery without the legacy Exchange tool', async (t) => {
  const { client } = await startStdioWithApi(t);
  const { tools } = await client.request('tools/list', {});
  assert(tools.some(tool => tool.name === 'firecrawl_find_tools'));
  assert(!tools.some(tool => tool.name === 'firecrawl_exchange_discover'));
  for (const tool of tools) assert.doesNotMatch(tool.description, /Firecrawl Exchange|Legacy catalogue interface|Exchange execution/);
});
