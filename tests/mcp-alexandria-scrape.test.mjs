import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { startStdioWithApi, callExpectingError, toolText } from './helpers/exchange-mcp.mjs';
import { EXCHANGE_CALL } from './helpers/exchange-api.mjs';

test('firecrawl_scrape with alexandria posts the v2 batch and returns the envelope untouched', async (t) => {
  const { api, client } = await startStdioWithApi(t);

  const result = await client.request('tools/call', {
    arguments: {
      alexandria: [
        { ...EXCHANGE_CALL, version: ' 1.2.3 ' },
        { provider: 'fred', capability: 'series/missing' },
      ],
    },
    name: 'firecrawl_scrape',
  });

  assert.equal(api.requests.length, 1);
  assert.equal(api.requests[0].method, 'POST');
  assert.equal(api.requests[0].url, '/v2/scrape');
  assert.equal(
    api.requests[0].headers.authorization,
    'Bearer fc-exchange-test'
  );
  assert.deepEqual(api.requests[0].body, {
    alexandria: [
      { ...EXCHANGE_CALL, version: '1.2.3' },
      { provider: 'fred', capability: 'series/missing' },
    ],
    origin: `mcp-firecrawl-mcp-exchange@${JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version}`,
  });
  assert.deepEqual(Object.keys(api.requests[0].body).sort(), [
    'alexandria',
    'origin',
  ]);

  const payload = toolText(result);
  assert.equal(payload.requestId, api.requests[0].headers['x-request-id']);
  assert.match(payload.requestId, /^[A-Za-z0-9._:-]{1,128}$/);
  const retry = await client.request('tools/call', {
    name: 'firecrawl_scrape',
    arguments: {
      alexandria: api.requests[0].body.alexandria,
      requestId: payload.requestId,
    },
  });
  assert.equal(toolText(retry).requestId, payload.requestId);
  assert.equal(api.requests[1].headers['x-request-id'], payload.requestId);
  assert.deepEqual(api.requests[1].body, api.requests[0].body);
  assert.equal(payload.success, true);
  assert.equal(payload.scrape_id, '11111111-1111-4111-8111-111111111111');
  assert.equal(payload.data.creditsCost, 1);
  assert.equal(payload.data.alexandria.length, 2);
  assert.equal(payload.data.alexandria[0].creditsCost, 1);
  assert.equal(payload.data.alexandria[0].records, 1);
  assert.equal(payload.data.alexandria[1].error.code, 'capability_not_found');
});

test('firecrawl_scrape rejects url with alexandria, neither, extra options, and oversized batches without calling the API', async (t) => {
  const { api, client } = await startStdioWithApi(t);

  const invalid = [
    { url: 'https://example.com/', alexandria: [EXCHANGE_CALL] },
    {},
    { alexandria: [EXCHANGE_CALL], formats: ['markdown'] },
    { alexandria: [] },
    { alexandria: Array.from({ length: 11 }, () => EXCHANGE_CALL) },
    { alexandria: [{ provider: 'fred' }] },
    { alexandria: [{ ...EXCHANGE_CALL, version: '   ' }] },
  ];
  for (const args of invalid) {
    await callExpectingError(client, {
      arguments: args,
      name: 'firecrawl_scrape',
    });
  }
  assert.equal(api.requests.length, 0);
});

const largeAlexandria = (text = 'x'.repeat(90_000)) => ({
  success: true,
  data: { creditsCost: 5, alexandria: [{ ...EXCHANGE_CALL, data: { text } }] },
});

test('oversized Alexandria results hand off only after retention is confirmed and nextTool works', async (t) => {
  const { api, client } = await startStdioWithApi(t, { largeResult: largeAlexandria(), bashRecovery: 'available' });
  const result = toolText(await client.request('tools/call', { name: 'firecrawl_scrape', arguments: { alexandria: EXCHANGE_CALL } }));
  assert.equal(result.delivery, 'retained');
  assert.equal(result.inlineTokenBudget, 20000);
  assert(result.estimatedTokens > 20000);
  assert(JSON.stringify(result).length < 2000);
  assert.equal(result.creditsCost, 5);
  assert.equal(api.requests.length, 2);
  assert.equal(api.requests[1].body.alexandria.options.requestId, result.requestId);
  assert.notEqual(api.requests[1].headers['x-request-id'], result.requestId);
  assert.equal(api.requests[1].headers.authorization, 'Bearer fc-exchange-test');
  const followup = toolText(await client.request('tools/call', result.nextTool));
  assert.equal(followup.data.alexandria[0].data.workspaceId, 'retained-workspace');
  assert.equal(api.requests.length, 3);
});

test('unavailable or partially retained responses remain intact', async (t) => {
  for (const bashRecovery of ['missing', 'partial']) {
    const payload = largeAlexandria();
    const { api, client } = await startStdioWithApi(t, { largeResult: payload, bashRecovery });
    const result = toolText(await client.request('tools/call', { name: 'firecrawl_scrape', arguments: { alexandria: EXCHANGE_CALL } }));
    assert.deepEqual(result.data, payload.data);
    assert.equal(result.delivery, undefined);
    assert.equal(api.requests.length, 2);
  }
});

test('below-budget results, errors, utility calls and URL scrapes bypass retention', async (t) => {
  for (const [payload, args] of [
    [largeAlexandria('small'), { alexandria: EXCHANGE_CALL }],
    [{ ...largeAlexandria(), success: false }, { alexandria: EXCHANGE_CALL }],
    [largeAlexandria(), { alexandria: { provider: 'firecrawl', capability: 'bash', options: { workspaceId: 'existing', command: 'cat response.json' } } }],
    [largeAlexandria(), { url: 'https://example.com' }],
  ]) {
    const { api, client } = await startStdioWithApi(t, { largeResult: payload, bashRecovery: 'available' });
    const result = toolText(await client.request('tools/call', { name: 'firecrawl_scrape', arguments: args }));
    const expectedData = args.alexandria?.capability === 'bash'
      ? { alexandria: [{ provider: 'firecrawl', capability: 'bash', data: {
          workspaceId: 'retained-workspace', exitCode: 0,
          stdout: JSON.stringify(payload.data.alexandria.map(item => [item.provider, item.capability])),
          idleTtlSeconds: 300,
        } }] }
      : payload.data;
    assert.deepEqual(args.url ? result : result.data, expectedData);
    assert.equal(result.delivery, undefined);
    assert.equal(api.requests.length, 1);
  }
});

test('Alexandria responses drop upstream source URLs unless FIRECRAWL_MCP_SHOW_SOURCE_URLS=true', async (t) => {
  const { client } = await startStdioWithApi(t);
  const scrape = toolText(await client.request('tools/call', { name: 'firecrawl_scrape', arguments: { alexandria: [EXCHANGE_CALL] } }));
  const record = scrape.data.alexandria[0].data;
  assert.equal(record.observations[0].value, '320.1');
  assert.equal('source_url' in record.observations[0], false);
  assert.equal('source_urls' in record, false);
  const search = toolText(await client.request('tools/call', { name: 'firecrawl_search', arguments: { query: 'cpi', sources: ['alexandria'] } }));
  const hit = search.data.tools[0];
  assert.equal(hit.provider, 'fred');
  assert.equal('source_url' in hit.example.response, false);
  // Schema entries are not URL values and stay in the contract.
  assert.deepEqual(hit.response.fields.source_url, { type: 'string' });
  const found = toolText(await client.request('tools/call', { name: 'firecrawl_find_tools', arguments: { providers: ['fred'] } }));
  const item = found.data.alexandria[0].data.items[0];
  assert.equal(item.provider, 'fred');
  assert.equal('source_url' in item.example.response, false);
  assert.deepEqual(item.response.fields.source_url, { type: 'string' });
  // Retained-result projections through firecrawl/bash are text; JSON lines are stripped structurally, other text has the values blanked.
  const jsonl = toolText(await client.request('tools/call', { name: 'firecrawl_scrape', arguments: { alexandria: { provider: 'firecrawl', capability: 'bash', options: { workspaceId: 'retained-workspace', command: 'jq -c . response.jsonl' } } } }));
  const lines = jsonl.data.alexandria[0].data.stdout.split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(lines, [{ date: '2026-01-01' }, { date: '2026-02-01' }]);
  const text = toolText(await client.request('tools/call', { name: 'firecrawl_scrape', arguments: { alexandria: { provider: 'firecrawl', capability: 'bash', options: { workspaceId: 'retained-workspace', command: 'grep date response.json' } } } }));
  assert.doesNotMatch(text.data.alexandria[0].data.stdout, /stlouisfed/);
  assert.match(text.data.alexandria[0].data.stdout, /"source_url": "\[hidden\]"/);
});

test('FIRECRAWL_MCP_SHOW_SOURCE_URLS=true keeps upstream source URLs', async (t) => {
  const { client } = await startStdioWithApi(t, { env: { FIRECRAWL_MCP_SHOW_SOURCE_URLS: 'true' } });
  const scrape = toolText(await client.request('tools/call', { name: 'firecrawl_scrape', arguments: { alexandria: [EXCHANGE_CALL] } }));
  assert.match(scrape.data.alexandria[0].data.observations[0].source_url, /stlouisfed/);
  const search = toolText(await client.request('tools/call', { name: 'firecrawl_search', arguments: { query: 'cpi', sources: ['alexandria'] } }));
  assert.match(search.data.tools[0].example.response.source_url, /stlouisfed/);
  const found = toolText(await client.request('tools/call', { name: 'firecrawl_find_tools', arguments: { providers: ['fred'] } }));
  assert.match(found.data.alexandria[0].data.items[0].example.response.source_url, /stlouisfed/);
  const text = toolText(await client.request('tools/call', { name: 'firecrawl_scrape', arguments: { alexandria: { provider: 'firecrawl', capability: 'bash', options: { workspaceId: 'retained-workspace', command: 'grep date response.json' } } } }));
  assert.match(text.data.alexandria[0].data.stdout, /stlouisfed/);
});
