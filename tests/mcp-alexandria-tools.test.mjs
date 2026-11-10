import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LEGACY_ALEXANDRIA_TOOLS,
  callExpectingError,
  startStdioWithApi,
  toolText,
} from './helpers/exchange-mcp.mjs';
import { EXCHANGE_CALL, TERMS_REQUIRED_BODY } from './helpers/exchange-api.mjs';

const call = (client, name, args) => client.request('tools/call', { name, arguments: args });

test('the full surface lists alexandria_execute, and firecrawl_scrape takes a page only', async (t) => {
  const { client, init } = await startStdioWithApi(t);
  const { tools } = await client.request('tools/list', {});
  const byName = new Map(tools.map((tool) => [tool.name, tool]));

  for (const name of ['alexandria_execute', 'firecrawl_find_tools', 'firecrawl_search', 'firecrawl_scrape'])
    assert.equal(byName.get(name)?._meta?.['anthropic/alwaysLoad'], true, name);

  const scrape = byName.get('firecrawl_scrape');
  assert.equal('alexandria' in scrape.inputSchema.properties, false);
  assert.equal('requestId' in scrape.inputSchema.properties, false);
  assert.deepEqual(scrape.inputSchema.required, ['url']);
  assert.doesNotMatch(scrape.description, /in place of `url`/);
  assert.match(scrape.description, /does not run providers/);

  assert.deepEqual(byName.get('alexandria_execute').inputSchema.required, ['provider', 'capability']);

  // No copy on this surface still sends execution to firecrawl_scrape.
  const copy = [init.instructions, ...tools.map((tool) => JSON.stringify(tool))].join('\n');
  assert.doesNotMatch(copy, /firecrawl_scrape with (an )?alexandria|execution through firecrawl_scrape/);
  assert.match(byName.get('firecrawl_find_tools').description, /execution through alexandria_execute/);
  assert.match(init.instructions, /alexandria_execute with \{provider, capability, options\}/);
});

test('alexandria_execute posts one capability and returns its envelope', async (t) => {
  const { api, client } = await startStdioWithApi(t);

  const payload = toolText(await call(client, 'alexandria_execute', { ...EXCHANGE_CALL, version: ' 1.2.3 ', toolDetail: 'full' }));
  assert.equal(api.requests.length, 1);
  assert.equal(api.requests[0].url, '/v2/scrape');
  assert.deepEqual(Object.keys(api.requests[0].body).sort(), ['alexandria', 'origin']);
  // One call, not a batch, and the option carried over from search is dropped.
  assert.deepEqual(api.requests[0].body.alexandria, { ...EXCHANGE_CALL, version: '1.2.3' });
  assert.equal(payload.success, true);
  assert.equal(payload.requestId, api.requests[0].headers['x-request-id']);
  assert.equal('creditsCost' in payload.data.alexandria[0], false);

  await call(client, 'alexandria_execute', { ...EXCHANGE_CALL, requestId: 'retry-1', timeout: 20_000 });
  assert.equal(api.requests[1].headers['x-request-id'], 'retry-1');
  assert.equal(api.requests[1].body.timeout, 20_000);
});

test('alexandria_execute reads one legacy alexandria body as its arguments and refuses what it cannot run', async (t) => {
  const { api, client } = await startStdioWithApi(t);

  for (const alexandria of [EXCHANGE_CALL, [EXCHANGE_CALL]]) {
    assert.equal(toolText(await call(client, 'alexandria_execute', { alexandria })).success, true);
    assert.deepEqual(api.requests.at(-1).body.alexandria, EXCHANGE_CALL);
  }
  const sent = api.requests.length;

  const batch = await callExpectingError(client, { name: 'alexandria_execute', arguments: { alexandria: [EXCHANGE_CALL, EXCHANGE_CALL] } });
  assert.match(batch.content[0].text, /one capability per call/);

  for (const args of [
    {},
    { provider: 'fred' },
    // Options belong under `options`; a flat option is named, not dropped.
    { provider: 'fred', capability: 'series/observations', series_id: 'CPIAUCSL' },
    { ...EXCHANGE_CALL, url: 'https://example.com' },
    { provider: 'firecrawl', capability: 'terms/accept', options: { provider: 'benzinga' } },
  ]) {
    await callExpectingError(client, { name: 'alexandria_execute', arguments: args });
  }
  assert.equal(api.requests.length, sent);
});

test('firecrawl_scrape with an alexandria body names the alexandria_execute call and sends nothing', async (t) => {
  const { api, client } = await startStdioWithApi(t);

  const one = await callExpectingError(client, { name: 'firecrawl_scrape', arguments: { alexandria: EXCHANGE_CALL } });
  assert.deepEqual(one.structuredContent.nextTool, { name: 'alexandria_execute', arguments: EXCHANGE_CALL });
  assert.match(one.content[0].text, /firecrawl_scrape fetches pages only/);
  assert.ok(one.content[0].text.includes(JSON.stringify(one.structuredContent.nextTool)));

  const batch = await callExpectingError(client, { name: 'firecrawl_scrape', arguments: { alexandria: [EXCHANGE_CALL, { provider: 'fred', capability: 'series/search' }] } });
  assert.match(batch.content[0].text, /held 2 capabilities; send each in its own call/);
  assert.deepEqual(batch.structuredContent.nextTool.arguments, EXCHANGE_CALL);

  const malformed = await callExpectingError(client, { name: 'firecrawl_scrape', arguments: { alexandria: 'fred' } });
  assert.equal(malformed.structuredContent.nextTool, undefined);
  assert.equal(api.requests.length, 0);

  // The call it names runs.
  assert.equal(toolText(await client.request('tools/call', one.structuredContent.nextTool)).success, true);
});

test('follow-up calls on the full surface are addressed to alexandria_execute', async (t) => {
  const terms = await startStdioWithApi(t);
  const blocked = await callExpectingError(terms.client, { name: 'alexandria_execute', arguments: { provider: 'benzinga', capability: 'news/search' } });
  assert.deepEqual(blocked.structuredContent.nextTool, {
    name: 'alexandria_execute',
    arguments: { provider: 'firecrawl', capability: 'terms/show', options: { provider: TERMS_REQUIRED_BODY.requiresAction.terms } },
  });
  assert.match(blocked.content[0].text, /Read the agreement with alexandria_execute using \{provider: "firecrawl", capability: "terms\/show"/);
  assert.match(blocked.content[0].text, /call alexandria_execute again with the identical payload/);
  assert.doesNotMatch(blocked.content[0].text, /firecrawl_scrape/);
  const read = toolText(await terms.client.request('tools/call', blocked.structuredContent.nextTool));
  assert.equal(read.data.alexandria[0].data.terms.document, 'Review this agreement.');

  const large = { success: true, data: { creditsCost: 5, alexandria: [{ ...EXCHANGE_CALL, data: { text: 'x'.repeat(90_000) } }] } };
  const retained = await startStdioWithApi(t, { largeResult: large, bashRecovery: 'available' });
  const result = toolText(await call(retained.client, 'alexandria_execute', EXCHANGE_CALL));
  assert.equal(result.delivery, 'retained');
  assert.equal(result.nextTool.name, 'alexandria_execute');
  assert.equal(result.nextTool.arguments.capability, 'bash');
  assert.equal(result.nextTool.arguments.options.workspaceId, 'retained-workspace');
});

test('legacy mode keeps firecrawl_scrape with an alexandria body', async (t) => {
  const { api, client, init } = await startStdioWithApi(t, { env: LEGACY_ALEXANDRIA_TOOLS });
  const { tools } = await client.request('tools/list', {});
  const names = new Set(tools.map((tool) => tool.name));
  assert.equal(names.has('alexandria_execute'), false);
  assert.ok('alexandria' in tools.find((tool) => tool.name === 'firecrawl_scrape').inputSchema.properties);
  assert.doesNotMatch(init.instructions, /alexandria_execute/);

  const payload = toolText(await call(client, 'firecrawl_scrape', { alexandria: [EXCHANGE_CALL] }));
  assert.equal(payload.success, true);
  assert.deepEqual(api.requests[0].body.alexandria, [EXCHANGE_CALL]);
  assert.equal(toolText(await call(client, 'firecrawl_find_tools', { providers: ['fred'] })).success, true);
  await callExpectingError(client, { name: 'alexandria_execute', arguments: EXCHANGE_CALL });
});
