import assert from 'node:assert/strict';
import test from 'node:test';
import { ALEXANDRIA_RESULTS_URI, alexandriaViews } from '../dist/mcp-apps.js';
import { startFakeExchangeApi } from './helpers/exchange-api.mjs';
import { startStdio, toolText } from './helpers/exchange-mcp.mjs';

async function start(t, env = {}) {
  const api = await startFakeExchangeApi();
  t.after(() => api.close());
  return startStdio(t, {
    CLOUD_SERVICE: 'false',
    FIRECRAWL_API_KEY: 'fc-exchange-test',
    FIRECRAWL_API_URL: api.url,
    ...env,
  });
}

test('without FIRECRAWL_MCP_APPS, scrape has no UI and no resource is listed', async (t) => {
  const { client } = await start(t);
  const { tools } = await client.request('tools/list', {});
  assert.equal(tools.find((tool) => tool.name === 'firecrawl_scrape')._meta?.ui, undefined);
  const listed = await client.request('resources/list', {}).then((r) => r.resources, () => []);
  assert.deepEqual(listed, []);
});

test('with FIRECRAWL_MCP_APPS, scrape links the Alexandria results view', async (t) => {
  const { client } = await start(t, { FIRECRAWL_MCP_APPS: 'true' });
  const { tools } = await client.request('tools/list', {});
  const scrape = tools.find((tool) => tool.name === 'firecrawl_scrape');
  assert.deepEqual(scrape._meta.ui, { resourceUri: ALEXANDRIA_RESULTS_URI });
  assert.equal(scrape._meta['anthropic/alwaysLoad'], true);

  const { resources } = await client.request('resources/list', {});
  assert.deepEqual(resources.map((r) => r.uri), [ALEXANDRIA_RESULTS_URI]);
  const { contents } = await client.request('resources/read', { uri: ALEXANDRIA_RESULTS_URI });
  assert.equal(contents[0].mimeType, 'text/html;profile=mcp-app');
  assert.deepEqual(contents[0]._meta, { ui: { prefersBorder: true } });
  assert.match(contents[0].text, /ui\/initialize/);
  assert.doesNotMatch(contents[0].text, /<script src=|https?:\/\/[^'"\s]*\.(js|css)/);

  const result = await client.request('tools/call', {
    name: 'firecrawl_scrape',
    arguments: { alexandria: { provider: 'fred', capability: 'series/observations', options: {} } },
  });
  assert.equal(toolText(result).data.alexandria[0].provider, 'fred');
});

test('views tabulate each call and chart a numeric column', () => {
  const views = alexandriaViews({
    data: {
      alexandria: [
        { provider: 'firecrawl', capability: 'find-tools', data: { items: [{ id: 'x' }] } },
        {
          provider: 'fred',
          capability: 'series/observations',
          creditsCost: 1,
          data: {
            series: 'GDP',
            observations: [
              { date: '2026-01-01', value: '320.1', meta: { a: 1 } },
              { date: '2026-04-01', value: '324.5' },
            ],
          },
        },
        { provider: 'fred', capability: 'series/missing', error: { code: 'capability_not_found', message: 'Unknown capability' } },
      ],
    },
  });
  assert.deepEqual(views, [
    {
      provider: 'fred',
      capability: 'series/observations',
      creditsCost: 1,
      columns: ['date', 'value'],
      rows: [
        { date: '2026-01-01', value: '320.1' },
        { date: '2026-04-01', value: '324.5' },
      ],
      chart: { label: 'date', value: 'value' },
    },
    { provider: 'fred', capability: 'series/missing', creditsCost: undefined, error: 'Unknown capability', columns: [], rows: [] },
  ]);
  assert.deepEqual(alexandriaViews({ data: { markdown: '# page' } }), []);
});
