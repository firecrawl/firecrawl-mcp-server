import assert from 'node:assert/strict';
import test from 'node:test';
import { LEGACY_SURFACE, startStdioWithApi, toolText } from './helpers/exchange-mcp.mjs';

const call = (client, name, args) => client.request('tools/call', { name, arguments: args });

const POINTER = {
  ifNotFound: {
    note: 'A note the API attached to this result.',
    call: {
      provider: 'example-provider',
      capability: 'example/capability',
      options: { need: '...', tried: [{ used: 'a', input: 'b', outcome: 'c' }] },
    },
  },
};

const REPORT_CALL = {
  provider: 'example-provider',
  capability: 'example/capability',
  options: {
    need: 'rows of a thing',
    tried: [
      { used: 'one', input: { q: 'x', filters: ['a', 'b'] }, outcome: 'empty' },
      { used: 'two', input: 'y', outcome: 'refused' },
    ],
    site: 'example.com',
  },
};

const results = {
  success: true,
  scrape_id: '11111111-1111-4111-8111-111111111111',
  data: {
    creditsCost: 0,
    alexandria: [
      { provider: 'example-provider', capability: 'example/failed', creditsCost: 0, error: { code: 'not_found', message: 'Nothing found', status: 404 }, nextStep: POINTER },
      { provider: 'example-provider', capability: 'example/empty', creditsCost: 0, data: { rows: [] }, records: 0, nextStep: POINTER },
      { provider: 'example-provider', capability: 'example/reply', creditsCost: 0, data: { logged: true, reference: 'ref_1', extra: { nested: [1, 2] } } },
    ],
  },
};

const assertKept = (result, raw) => {
  const [failed, empty, reply] = result.data.alexandria;
  assert.deepEqual(failed.nextStep, POINTER);
  assert.deepEqual(empty.nextStep, POINTER);
  assert.deepEqual(reply.data, results.data.alexandria[2].data);
  assert.deepEqual(raw.structuredContent.data.alexandria[0].nextStep, POINTER);
  assert.deepEqual(raw.structuredContent.data.alexandria[2].data, reply.data);
};

test('alexandria_library_read sends nested options unchanged and returns unknown result keys', async (t) => {
  const { api, client } = await startStdioWithApi(t, { largeResult: results });
  const calls = [REPORT_CALL, REPORT_CALL, REPORT_CALL];
  const raw = await call(client, 'alexandria_library_read', { calls });
  assert.deepEqual(api.requests[0].body.alexandria, calls);
  assertKept(toolText(raw), raw);
});

test('firecrawl_scrape with an alexandria body sends nested options unchanged and returns unknown result keys', async (t) => {
  const { api, client } = await startStdioWithApi(t, { largeResult: results });
  const calls = [REPORT_CALL, REPORT_CALL, REPORT_CALL];
  const raw = await call(client, 'firecrawl_scrape', { alexandria: calls });
  assert.deepEqual(api.requests[0].body.alexandria, calls);
  assertKept(toolText(raw), raw);
});

test('firecrawl_find_tools keeps an extra last item and its marks, on a surface that lists it', async (t) => {
  const item = (id, extra = {}) => ({ id, provider: 'example-provider', capability: id, description: 'd', perRecord: false, options: [{ name: 'q', type: 'string' }], ...extra });
  const page = { success: true, data: { creditsCost: 0, alexandria: [{ provider: 'firecrawl', capability: 'find-tools', creditsCost: 0, data: { level: 'tools', items: [item('a'), item('b'), item('last', { lastResort: true })], total: 3 } }] } };
  const { client } = await startStdioWithApi(t, { ...LEGACY_SURFACE, largeResult: page });
  const raw = await call(client, 'firecrawl_find_tools', { query: 'anything' });
  const { items } = toolText(raw).data.alexandria[0].data;
  assert.equal(items.length, 3);
  assert.equal(items.at(-1).lastResort, true);
  assert.deepEqual(items.at(-1).options, [{ name: 'q', type: 'string' }]);
  assert.equal(raw.structuredContent.data.alexandria[0].data.items.at(-1).lastResort, true);
});
