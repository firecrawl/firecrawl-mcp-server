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

test('the full surface lists alexandria_execute, and firecrawl_scrape lists a page URL only', async (t) => {
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
  assert.match(scrape.description, /typed records in one `alexandria_execute` call/);

  const execute = byName.get('alexandria_execute').inputSchema;
  assert.deepEqual(execute.required, ['calls']);
  assert.deepEqual(Object.keys(execute.properties).sort(), ['calls', 'requestId', 'timeout']);
  assert.equal(execute.properties.calls.maxItems, 10);
  assert.deepEqual(execute.properties.calls.items.required, ['provider', 'capability']);

  // No copy on this surface still sends execution to firecrawl_scrape.
  const copy = [init.instructions, ...tools.map((tool) => JSON.stringify(tool))].join('\n');
  assert.doesNotMatch(copy, /firecrawl_scrape with (an )?alexandria|execution through firecrawl_scrape/);
  assert.match(byName.get('firecrawl_find_tools').description, /execution through alexandria_execute/);
  assert.match(init.instructions, /alexandria_execute with calls: \[\{provider, capability, options\}\] runs up to ten capabilities/);
});

test('alexandria_execute posts its calls, across providers, and returns one result for each', async (t) => {
  const { api, client } = await startStdioWithApi(t);

  const payload = toolText(await call(client, 'alexandria_execute', { calls: [{ ...EXCHANGE_CALL, version: ' 1.2.3 ' }], toolDetail: 'full' }));
  assert.equal(api.requests.length, 1);
  assert.equal(api.requests[0].url, '/v2/scrape');
  assert.deepEqual(Object.keys(api.requests[0].body).sort(), ['alexandria', 'origin']);
  // The option carried over from search is dropped.
  assert.deepEqual(api.requests[0].body.alexandria, [{ ...EXCHANGE_CALL, version: '1.2.3' }]);
  assert.equal(payload.success, true);
  assert.equal(payload.requestId, api.requests[0].headers['x-request-id']);
  assert.equal('creditsCost' in payload.data.alexandria[0], false);

  // Several providers in one request.
  const calls = [EXCHANGE_CALL, { provider: 'sec', capability: 'filings/search', options: { ticker: 'NVDA' } }];
  const many = toolText(await call(client, 'alexandria_execute', { calls, requestId: 'retry-1', timeout: 20_000 }));
  assert.deepEqual(api.requests[1].body.alexandria, calls);
  assert.equal(api.requests[1].headers['x-request-id'], 'retry-1');
  assert.equal(api.requests[1].body.timeout, 20_000);
  assert.equal(many.success, true);
  assert.equal(many.data.alexandria.length, calls.length);
});

test('alexandria_execute reads the shapes it does not list as calls and refuses what it cannot run', async (t) => {
  const { api, client } = await startStdioWithApi(t);

  // The firecrawl_scrape body, one call as the arguments themselves, and one call not in an array.
  for (const args of [{ alexandria: EXCHANGE_CALL }, { alexandria: [EXCHANGE_CALL] }, EXCHANGE_CALL, { calls: EXCHANGE_CALL }]) {
    assert.equal(toolText(await call(client, 'alexandria_execute', args)).success, true);
    assert.deepEqual(api.requests.at(-1).body.alexandria, [EXCHANGE_CALL]);
  }
  await call(client, 'alexandria_execute', { alexandria: [EXCHANGE_CALL, EXCHANGE_CALL], requestId: 'batch-1' });
  assert.deepEqual(api.requests.at(-1).body.alexandria, [EXCHANGE_CALL, EXCHANGE_CALL]);
  assert.equal(api.requests.at(-1).headers['x-request-id'], 'batch-1');
  const sent = api.requests.length;

  const termsAccept = { provider: 'firecrawl', capability: 'terms/accept', options: { provider: 'benzinga' } };
  for (const args of [
    {},
    { calls: [] },
    { calls: Array.from({ length: 11 }, () => EXCHANGE_CALL) },
    { calls: [{ provider: 'fred' }] },
    // Options belong under `options`; a flat option is named, not dropped.
    { calls: [{ provider: 'fred', capability: 'series/observations', series_id: 'CPIAUCSL' }] },
    { provider: 'fred', capability: 'series/observations', series_id: 'CPIAUCSL' },
    { calls: [EXCHANGE_CALL], url: 'https://example.com' },
    { calls: [EXCHANGE_CALL], provider: 'fred' },
    { provider: 'fred' },
    // The same holds inside a legacy body: an unknown key is refused, not dropped.
    { alexandria: { ...EXCHANGE_CALL, optionz: { series_id: 'CPIAUCSL' } } },
    { alexandria: [{ provider: 'fred' }] },
    // One terms write refuses the whole request.
    { calls: [termsAccept] },
    { calls: [EXCHANGE_CALL, termsAccept] },
  ]) {
    await callExpectingError(client, { name: 'alexandria_execute', arguments: args });
  }
  assert.equal(api.requests.length, sent);
});

test('firecrawl_scrape still runs an alexandria body it no longer lists', async (t) => {
  const { api, client } = await startStdioWithApi(t);

  // One call and a batch run as they did before alexandria_execute existed.
  const one = toolText(await call(client, 'firecrawl_scrape', { alexandria: EXCHANGE_CALL }));
  assert.equal(one.success, true);
  assert.deepEqual(api.requests[0].body.alexandria, EXCHANGE_CALL);

  const batch = [EXCHANGE_CALL, { provider: 'fred', capability: 'series/missing' }];
  const many = toolText(await call(client, 'firecrawl_scrape', { alexandria: batch, requestId: 'batch-1', toolDetail: 'full' }));
  assert.equal(many.data.alexandria.length, 2);
  assert.deepEqual(api.requests[1].body.alexandria, batch);
  assert.equal(api.requests[1].headers['x-request-id'], 'batch-1');

  // Its refusals are unchanged too, and a refusal names the tool that was called.
  for (const args of [{}, { url: 'https://example.com/', alexandria: [EXCHANGE_CALL] }, { alexandria: [] }])
    await callExpectingError(client, { name: 'firecrawl_scrape', arguments: args });
  assert.equal(api.requests.length, 2);
  const blocked = await callExpectingError(client, { name: 'firecrawl_scrape', arguments: { alexandria: [{ provider: 'benzinga', capability: 'news/search' }] } });
  assert.match(blocked.content[0].text, /call firecrawl_scrape again with the identical payload/);
  assert.equal(blocked.structuredContent.nextTool.name, 'alexandria_execute');
});

test('follow-up calls on the full surface are addressed to alexandria_execute', async (t) => {
  const terms = await startStdioWithApi(t);
  const blocked = await callExpectingError(terms.client, { name: 'alexandria_execute', arguments: { calls: [{ provider: 'benzinga', capability: 'news/search' }] } });
  assert.deepEqual(blocked.structuredContent.nextTool, {
    name: 'alexandria_execute',
    arguments: { calls: [{ provider: 'firecrawl', capability: 'terms/show', options: { provider: TERMS_REQUIRED_BODY.requiresAction.terms } }] },
  });
  assert.match(blocked.content[0].text, /Read the agreement with alexandria_execute using calls: \[\{provider: "firecrawl", capability: "terms\/show"/);
  assert.match(blocked.content[0].text, /call alexandria_execute again with the identical payload/);
  assert.doesNotMatch(blocked.content[0].text, /firecrawl_scrape/);
  const read = toolText(await terms.client.request('tools/call', blocked.structuredContent.nextTool));
  assert.equal(read.data.alexandria[0].data.terms.document, 'Review this agreement.');

  const large = { success: true, data: { creditsCost: 5, alexandria: [{ ...EXCHANGE_CALL, data: { text: 'x'.repeat(90_000) } }] } };
  const retained = await startStdioWithApi(t, { largeResult: large, bashRecovery: 'available' });
  const result = toolText(await call(retained.client, 'alexandria_execute', { calls: [EXCHANGE_CALL] }));
  assert.equal(result.delivery, 'retained');
  assert.equal(result.nextTool.name, 'alexandria_execute');
  assert.equal(result.nextTool.arguments.calls.length, 1);
  assert.equal(result.nextTool.arguments.calls[0].capability, 'bash');
  assert.equal(result.nextTool.arguments.calls[0].options.workspaceId, 'retained-workspace');
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
  await callExpectingError(client, { name: 'alexandria_execute', arguments: { calls: [EXCHANGE_CALL] } });
});
