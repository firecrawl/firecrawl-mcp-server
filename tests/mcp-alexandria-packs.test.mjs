import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { EXCHANGE_KEY_REQUIRED_MESSAGE, callExpectingError, startStdio, startStdioWithApi, toolText } from './helpers/exchange-mcp.mjs';
import { CAPABILITY_HIT } from './helpers/exchange-api.mjs';

const PACK_IDS = ['creators', 'marketing', 'prospecting', 'jobs', 'investing', 'shopping', 'travel', 'fantasy'];
const PACK_FILES = PACK_IDS.map((id) => JSON.parse(readFileSync(new URL(`../src/packs/${id}.json`, import.meta.url), 'utf8')));
const CALL_SHAPES = JSON.parse(readFileSync(new URL('../src/packs/calls.json', import.meta.url), 'utf8'));
const callPacks = (client, args) => client.request('tools/call', { name: 'firecrawl_packs', arguments: args });

test('packs are listed with a description that names each pack and its handoff', async (t) => {
  const { client, init } = await startStdioWithApi(t);
  const { tools } = await client.request('tools/list', {});
  const tool = tools.find((item) => item.name === 'firecrawl_packs');
  assert.ok(tool);
  assert.equal(tool.annotations.readOnlyHint, true);
  assert.match(tool.description, /^Start here when the task fits one of these packs\./);
  for (const definition of PACK_FILES) assert.ok(tool.description.includes(`- ${definition.id}: ${definition.when}`));
  assert.match(tool.description, /firecrawl_find_tools.*firecrawl_scrape/);
  assert.deepEqual(tool.inputSchema.properties.pack.enum, PACK_IDS);
  assert.match(init.instructions, /For requests about creators and social media, marketing research, .*, fantasy football, call firecrawl_packs before searching/);
  assert.deepEqual(Object.keys(tool.inputSchema.properties), ['pack']);
  assert.deepEqual(Object.keys(tool.outputSchema.properties).sort(), ['examples', 'pack', 'packs', 'page', 'providers', 'skill', 'summary', 'title']);
});

test('no arguments lists packs; pack loads provider context and guidance without an API call', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const list = toolText(await callPacks(client, {}));
  assert.deepEqual(list.packs.map((pack) => pack.id), PACK_IDS);
  assert.deepEqual(list.packs[0].nextTool, { name: 'firecrawl_packs', arguments: { pack: 'creators' } });

  for (const definition of PACK_FILES) {
    const result = await callPacks(client, { pack: definition.id });
    const pack = toolText(result);
    assert.deepEqual(result.structuredContent, pack);
    assert.equal(pack.pack, definition.id);
    assert.deepEqual(pack.skill, definition.skill);
    assert.deepEqual(pack.examples, definition.examples);
    assert.equal(pack.examples.length, 2);
    assert.deepEqual(pack.providers.map((provider) => provider.id), definition.providers.map((provider) => provider.id));
    for (const provider of pack.providers) {
      assert.ok(provider.summary && provider.capabilities.length);
      assert.deepEqual(provider.nextTool, {
        name: 'firecrawl_find_tools',
        arguments: { providers: [provider.id], expand: [], includeCosts: true },
      });
    }
    for (const removed of ['task', 'askFirst', 'recipes', 'otherRecipes']) {
      assert.equal(Object.hasOwn(pack, removed), false);
    }
    assert.match(pack.skill.join(' '), /reuse|reusing/i);
    assert.match(pack.skill.join(' '), /only.*materially/i);
    assert.match(pack.skill.join(' '), /includeCosts: true/);
    assert.match(pack.skill.join(' '), /firecrawl_scrape/);
  }
  await callExpectingError(client, { name: 'firecrawl_packs', arguments: { pack: 'unknown' } });
  await callExpectingError(client, { name: 'firecrawl_packs', arguments: { task: 'who to start' } });
  assert.equal(api.requests.length, 0);
});

test('each pack context stays within its size budget without inline contracts or prices', async (t) => {
  const { client } = await startStdioWithApi(t);
  for (const { id } of PACK_FILES) {
    const text = (await callPacks(client, { pack: id })).content[0].text;
    assert.ok(text.length <= 8000, `${id} context is ${text.length} chars`);
    assert.doesNotMatch(text, /"creditsCost"|"options"|"response"/);
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

test('search, find_tools and page scrapes lead with ready calls from the packs of matched providers', async (t) => {
  const { client } = await startStdioWithApi(t, {
    searchTools: [CAPABILITY_HIT, { ...CAPABILITY_HIT, provider: 'similarweb', capability: 'web/traffic' }],
    findToolsItems: [{ id: 'startwho-com/fantasy-sports-rankings/projections', provider: 'startwho-com', capability: 'fantasy-sports-rankings/projections' }],
  });
  const search = toolText(await client.request('tools/call', { name: 'firecrawl_search', arguments: { query: 'competitor traffic' } }));
  assert.equal(Object.keys(search.data)[0], 'packs');
  assert.deepEqual(search.data.packs.map((pack) => pack.pack), ['marketing', 'investing']);
  const investing = search.data.packs[1];
  assert.equal(investing.title, 'Stocks, earnings and economic data');
  assert.match(investing.note, /prefer these provider calls over reading web pages/);
  assert.deepEqual(investing.providers.map((entry) => entry.provider), ['fred']);
  const calls = investing.providers[0].calls;
  assert.deepEqual(investing.guide, { name: 'firecrawl_packs', arguments: { pack: 'investing' } });
  const fred = PACK_FILES.find((pack) => pack.id === 'investing').providers.find((provider) => provider.id === 'fred');
  assert.equal(investing.providers[0].about, fred.summary);
  assert.deepEqual(calls.map((entry) => entry.call.arguments.alexandria.capability), [...new Set(['series/observations', ...fred.capabilities])].slice(0, 4));
  const shape = CALL_SHAPES['fred/series/observations'];
  assert.deepEqual(calls[0], { name: shape.name, call: { name: 'firecrawl_scrape', arguments: { alexandria: { provider: 'fred', capability: 'series/observations', options: shape.options } } }, inputs: shape.inputs });

  const page = toolText(await client.request('tools/call', { name: 'firecrawl_find_tools', arguments: { query: 'half-PPR projections' } })).data.alexandria[0].data;
  assert.equal(Object.keys(page)[0], 'packs');
  assert.deepEqual(page.packs.map((pack) => pack.pack), ['fantasy']);
  assert.deepEqual(page.packs[0].providers[0].calls[0].call.arguments.alexandria, { provider: 'startwho-com', capability: 'fantasy-sports-rankings/projections', options: CALL_SHAPES['startwho-com/fantasy-sports-rankings/projections'].options });
  const providers = toolText(await client.request('tools/call', { name: 'firecrawl_find_tools', arguments: { categories: ['sports'] } })).data.alexandria[0].data;
  assert.deepEqual(providers.packs.map((pack) => pack.pack), ['fantasy']);

  const scraped = toolText(await client.request('tools/call', { name: 'firecrawl_scrape', arguments: { url: 'https://www.bestbuy.com/site/switch-2' } }));
  assert.equal(Object.keys(scraped)[0], 'packs');
  assert.deepEqual(scraped.packs.map((pack) => pack.pack), ['shopping']);
  assert.deepEqual(scraped.packs[0].providers.map((entry) => entry.provider), ['bestbuy-com']);
  const other = toolText(await client.request('tools/call', { name: 'firecrawl_scrape', arguments: { url: 'https://example.com/' } }));
  assert.equal(other.packs, undefined);
});

test('every pack capability has a call shape', () => {
  const refs = PACK_FILES.flatMap((pack) => pack.providers.flatMap((provider) => provider.capabilities.map((capability) => `${provider.id}/${capability}`)));
  assert.deepEqual(refs.filter((ref) => !CALL_SHAPES[ref]), []);
  assert.deepEqual(Object.keys(CALL_SHAPES).filter((ref) => !refs.includes(ref)), []);
});

test('results without pack providers carry no pack calls', async (t) => {
  const { client } = await startStdioWithApi(t, { searchTools: [{ ...CAPABILITY_HIT, provider: 'census-gov', capability: 'census/data' }] });
  const search = toolText(await client.request('tools/call', { name: 'firecrawl_search', arguments: { query: 'cpi' } }));
  assert.equal(search.data.packs, undefined);
});
