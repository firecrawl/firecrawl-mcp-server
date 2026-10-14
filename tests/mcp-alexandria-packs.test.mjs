import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { EXCHANGE_KEY_REQUIRED_MESSAGE, callExpectingError, startStdio, startStdioWithApi, toolText } from './helpers/exchange-mcp.mjs';
import { CAPABILITY_HIT } from './helpers/exchange-api.mjs';

const PACK_FILES = ['fantasy', 'marketing'].map((id) => JSON.parse(readFileSync(new URL(`../src/packs/${id}.json`, import.meta.url), 'utf8')));
const callPacks = (client, args) => client.request('tools/call', { name: 'firecrawl_packs', arguments: args });

test('packs are listed with a description that names each pack and its handoff', async (t) => {
  const { client, init } = await startStdioWithApi(t);
  const { tools } = await client.request('tools/list', {});
  const tool = tools.find((item) => item.name === 'firecrawl_packs');
  assert.ok(tool);
  assert.equal(tool.annotations.readOnlyHint, true);
  assert.match(tool.description, /^Use this when the user wants help with fantasy football: /);
  assert.match(tool.description, /marketing research: /);
  assert.match(tool.description, /firecrawl_find_tools.*firecrawl_scrape/);
  assert.deepEqual(tool.inputSchema.properties.pack.enum, ['fantasy', 'marketing']);
  assert.match(init.instructions, /For fantasy football or marketing research, firecrawl_packs returns a playbook/);
});

test('no arguments lists packs; pack returns its playbook; task selects one recipe; no API call is made', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const list = toolText(await callPacks(client, {}));
  assert.deepEqual(list.packs.map((pack) => pack.id), ['fantasy', 'marketing']);
  assert.deepEqual(list.packs[0].nextTool, { name: 'firecrawl_packs', arguments: { pack: 'fantasy' } });

  const fantasy = toolText(await callPacks(client, { pack: 'fantasy' }));
  assert.equal(fantasy.recipes.length, 5);
  assert.ok(fantasy.askFirst.length > 0 && fantasy.rules.length > 0);
  assert.equal(fantasy.otherRecipes, undefined);
  assert.equal(fantasy.nextTool.name, 'firecrawl_find_tools');
  assert.ok(fantasy.nextTool.arguments.providers.includes('draftsharks-com'));
  assert.ok(fantasy.nextTool.arguments.capabilities.includes('fantasy-sports-rankings/weekly_rankings'));
  assert.ok(!('keywords' in fantasy.recipes[0]));

  const competitors = toolText(await callPacks(client, { pack: 'marketing', task: 'Compare notion.so and linear.app traffic channels' }));
  assert.deepEqual(competitors.recipes.map((recipe) => recipe.id), ['competitors']);
  assert.deepEqual(competitors.otherRecipes.map((recipe) => recipe.id), ['content', 'partners', 'page-history']);
  assert.deepEqual(competitors.nextTool.arguments, {
    providers: ['similarweb', 'web-archive-org', 'firecrawl-trends'],
    capabilities: ['web/traffic', 'channels/share', 'captures/history', 'captures/content', 'trends/suggestions', 'trends/related_queries'],
    expand: ['options', 'response'],
  });

  assert.equal(toolText(await callPacks(client, { pack: 'fantasy', task: 'draft' })).recipes[0].id, 'draft');
  const inferred = toolText(await callPacks(client, { task: 'which podcasts should we sponsor?' }));
  assert.equal(inferred.pack, 'marketing');
  assert.equal(inferred.recipes[0].id, 'partners');

  const unmatched = toolText(await callPacks(client, { pack: 'fantasy', task: 'zzz' }));
  assert.match(unmatched.message, /No recipe matched/);
  assert.equal(unmatched.recipes.length, 5);
  assert.deepEqual(toolText(await callPacks(client, { task: 'zzz' })).packs.map((pack) => pack.id), ['fantasy', 'marketing']);

  await callExpectingError(client, { name: 'firecrawl_packs', arguments: { pack: 'unknown' } });
  assert.equal(api.requests.length, 0);
});

test('every pack playbook stays within its size budget', async (t) => {
  const { client } = await startStdioWithApi(t);
  for (const { id, recipes } of PACK_FILES) {
    const text = (await callPacks(client, { pack: id })).content[0].text;
    assert.ok(text.length <= 8000, `${id} playbook is ${text.length} chars`);
    for (const recipe of recipes) {
      const one = (await callPacks(client, { pack: id, task: recipe.id })).content[0].text;
      assert.ok(one.length <= 5000, `${id}/${recipe.id} is ${one.length} chars`);
    }
  }
});

test('local keyless stdio refuses packs exactly like firecrawl_find_tools', async (t) => {
  const { client } = await startStdio(t, { FIRECRAWL_API_KEY: '', FIRECRAWL_API_URL: '', FIRECRAWL_OAUTH_TOKEN: '' });
  const { tools } = await client.request('tools/list', {});
  assert.equal(tools.some((tool) => tool.name === 'firecrawl_packs'), tools.some((tool) => tool.name === 'firecrawl_find_tools'));
  for (const name of ['firecrawl_find_tools', 'firecrawl_packs']) {
    const result = await client.request('tools/call', { name, arguments: {} });
    assert.equal(result.isError, true);
    assert.equal(result.content[0].text, EXCHANGE_KEY_REQUIRED_MESSAGE);
    assert.equal(result.structuredContent.code, 'EXCHANGE_API_KEY_REQUIRED');
  }
});

test('search and find_tools results point at the packs of matched providers', async (t) => {
  const { client } = await startStdioWithApi(t, {
    searchTools: [CAPABILITY_HIT, { ...CAPABILITY_HIT, provider: 'similarweb', capability: 'web/traffic' }],
    findToolsItems: [{ id: 'startwho-com/fantasy-sports-rankings/projections', provider: 'startwho-com', capability: 'fantasy-sports-rankings/projections' }],
  });
  const search = toolText(await client.request('tools/call', { name: 'firecrawl_search', arguments: { query: 'competitor traffic' } }));
  assert.deepEqual(search.data.packs, [{ pack: 'marketing', title: 'Marketing research', nextTool: { name: 'firecrawl_packs', arguments: { pack: 'marketing' } } }]);
  const page = toolText(await client.request('tools/call', { name: 'firecrawl_find_tools', arguments: { query: 'half-PPR projections' } })).data.alexandria[0].data;
  assert.deepEqual(page.packs.map((pack) => pack.pack), ['fantasy']);
  const providers = toolText(await client.request('tools/call', { name: 'firecrawl_find_tools', arguments: { categories: ['sports'] } })).data.alexandria[0].data;
  assert.deepEqual(providers.packs.map((pack) => pack.pack), ['fantasy']);
});

test('results without pack providers carry no pointer', async (t) => {
  const { client } = await startStdioWithApi(t);
  const search = toolText(await client.request('tools/call', { name: 'firecrawl_search', arguments: { query: 'cpi' } }));
  assert.equal(search.data.packs, undefined);
});
