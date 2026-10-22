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

test('unmatched discovery inputs carry a ready fallback tool call', async (t) => {
  const { client } = await startStdioWithApi(t);
  const call = arguments_ => client.request('tools/call', { name: 'firecrawl_find_tools', arguments: arguments_ });
  const reddit = 'https://www.reddit.com/r/programming/';
  const fred = 'https://fred.stlouisfed.org/series/CPIAUCSL';
  const mixed = toolText(await call({ urls: [reddit, fred] })).data.alexandria[0].data;
  assert.deepEqual(mixed.inputs[0].fallbackTool, { name: 'firecrawl_scrape', arguments: { url: reddit } });
  assert.equal(mixed.inputs[0].reason, 'no_provider');
  assert.deepEqual(mixed.inputs[1], { input: fred, type: 'url', status: 'matched', match: 'host', providers: ['fred'] });
  const query = toolText(await call({ query: 'Kazakhstan public procurement notices' })).data.alexandria[0].data;
  assert.deepEqual(query.inputs[0].fallbackTool, { name: 'firecrawl_search', arguments: { query: 'Kazakhstan public procurement notices' } });
  const pdf = 'https://example.com/report.pdf';
  const unmapped = toolText(await call({ urls: [pdf] })).data.alexandria[0].data.inputs[0];
  assert.deepEqual(unmapped.fallback, { endpoint: '/v2/parse', body: { url: pdf } });
  assert.equal('fallbackTool' in unmapped, false);
  const browse = toolText(await call({ providers: ['fred'] })).data.alexandria[0].data;
  assert.equal('inputs' in browse, false);
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
