import assert from 'node:assert/strict';
import test from 'node:test';
import { startStdioWithApi, toolText } from './helpers/exchange-mcp.mjs';

test('discovery progresses from categories to compact tools and selected contracts', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const call = arguments_ => client.request('tools/call', { name: 'firecrawl_find_tools', arguments: arguments_ });
  const { tools } = await client.request('tools/list', {});
  assert(tools.some(tool => tool.name === 'firecrawl_find_tools'));
  for (const name of ['firecrawl_search', 'firecrawl_scrape', 'firecrawl_find_tools'])
    assert.doesNotMatch(tools.find(tool => tool.name === name).description, /bash/i);
  for (const name of ['firecrawl_exchange_discover', 'firecrawl_skills_resolve', 'firecrawl_skill'])
    assert(!tools.some(tool => tool.name === name));
  const root = toolText(await call({ limit: 1 })).data.alexandria[0].data;
  assert.equal(root.level, 'categories');
  const next = toolText(await call(root.nextTool.arguments)).data.alexandria[0].data;
  assert.equal(next.items[0].id, 'finance');
  await call(root.items[0].nextTool.arguments);
  assert.equal(api.requests.at(-1).body.alexandria.options.level, 'providers');
  await call({ providers: ['particle'] });
  assert.equal(api.requests.at(-1).body.alexandria.options.expand, undefined);
  await call({ providers: ['particle'], capabilities: ['podcasts/episodes/search'] });
  assert.deepEqual(api.requests.at(-1).body.alexandria.options.expand, ['options', 'response', 'examples']);
});

test('find_tools validates urls at runtime without publishing a schema pattern', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const { tools } = await client.request('tools/list', {});
  const urls = tools.find(tool => tool.name === 'firecrawl_find_tools').inputSchema.properties.urls;
  assert.equal(urls.items.pattern, undefined);
  assert.equal(urls.items.format, undefined);

  const call = arguments_ => client.request('tools/call', { name: 'firecrawl_find_tools', arguments: arguments_ });
  await call({ urls: ['HTTPS://www.amazon.com/dp/B0CX23V2ZK'] });
  assert.deepEqual(api.requests.at(-1).body.alexandria.options.urls, ['HTTPS://www.amazon.com/dp/B0CX23V2ZK']);

  const before = api.requests.length;
  for (const url of ['www.amazon.com', 'https:www.amazon.com', 'ftp://example.com/file', 'javascript:alert(1)']) {
    const rejected = await call({ urls: [url] }).then(result => result, error => error);
    assert(rejected instanceof Error || rejected.isError, `expected ${url} to be rejected`);
  }
  assert.equal(api.requests.length, before);
});

test('discovery output never carries per-capability prices', async (t) => {
  const { client } = await startStdioWithApi(t);
  const call = arguments_ => client.request('tools/call', { name: 'firecrawl_find_tools', arguments: arguments_ });
  const priceKeys = ['creditsCost', 'perRecord', 'billing', 'recordsPerUnit', 'zeroDataRetentionCreditsCost'];
  const tools = toolText(await call({ providers: ['fred'] }));
  assert.equal('creditsCost' in tools.data, false);
  assert.equal('creditsCost' in tools.data.alexandria[0], false);
  const page = tools.data.alexandria[0].data;
  assert.equal(page.items[0].id, 'fred/series/observations');
  assert.equal(page.items[0].description, 'Observations for a series.');
  assert.equal(page.relatedTools[0].tools[0].tool.id, 'bls/series');
  for (const tool of [page.items[0], page.relatedTools[0].tools[0].tool])
    for (const key of priceKeys) assert.equal(key in tool, false, key);
  const categories = toolText(await call({ limit: 1 }));
  assert.doesNotMatch(JSON.stringify(categories), /creditsCost/);
});

test('includeCosts returns per-capability prices and carries through navigation', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const call = arguments_ => client.request('tools/call', { name: 'firecrawl_find_tools', arguments: arguments_ });
  const page = toolText(await call({ providers: ['fred'], includeCosts: true })).data.alexandria[0].data;
  assert.equal('includeCosts' in api.requests.at(-1).body.alexandria.options, false);
  assert.equal(page.items[0].creditsCost, 5);
  assert.equal(page.items[0].perRecord, true);
  assert.equal(page.relatedTools[0].tools[0].tool.creditsCost, 5);
  assert.equal(page.nextTool.arguments.includeCosts, true);
  const root = toolText(await call({ limit: 1, includeCosts: true })).data.alexandria[0].data;
  assert.equal(root.nextTool.arguments.includeCosts, true);
  assert.equal(root.items[0].nextTool.arguments.includeCosts, true);
});
