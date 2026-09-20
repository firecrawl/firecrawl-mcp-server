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
  assert(!tools.some(tool => tool.name === 'firecrawl_exchange_discover'));
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
