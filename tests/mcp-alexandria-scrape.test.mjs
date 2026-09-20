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
    origin: 'mcp-fastmcp',
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
    assert.equal(result.delivery, undefined);
    assert.equal(api.requests.length, 1);
  }
});
