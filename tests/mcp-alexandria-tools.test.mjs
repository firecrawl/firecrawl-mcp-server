import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LEGACY_SURFACE,
  callExpectingError,
  startStdioWithApi,
  toolText,
} from './helpers/exchange-mcp.mjs';
import { EXCHANGE_CALL, TERMS_REQUIRED_BODY } from './helpers/exchange-api.mjs';

const call = (client, name, args) => client.request('tools/call', { name, arguments: args });

test('the full surface lists alexandria_library_read and alexandria_library_search, and firecrawl_scrape lists a page URL only', async (t) => {
  const { client, init } = await startStdioWithApi(t);
  const { tools } = await client.request('tools/list', {});
  const byName = new Map(tools.map((tool) => [tool.name, tool]));

  for (const name of ['alexandria_library_read', 'alexandria_library_search', 'firecrawl_search', 'firecrawl_scrape'])
    assert.equal(byName.get(name)?._meta?.['anthropic/alwaysLoad'], true, name);
  assert.equal(byName.has('firecrawl_find_tools'), false);

  const scrape = byName.get('firecrawl_scrape');
  assert.equal('alexandria' in scrape.inputSchema.properties, false);
  assert.equal('requestId' in scrape.inputSchema.properties, false);
  assert.deepEqual(scrape.inputSchema.required, ['url']);
  assert.doesNotMatch(scrape.description, /firecrawl_find_tools|in place of `url`/);
  assert.match(scrape.description, /typed records in one `alexandria_library_read` call/);

  const execute = byName.get('alexandria_library_read').inputSchema;
  assert.deepEqual(execute.required, ['calls']);
  assert.deepEqual(Object.keys(execute.properties).sort(), ['calls', 'requestId', 'timeout']);
  assert.equal(execute.properties.calls.maxItems, 10);
  assert.deepEqual(execute.properties.calls.items.required, ['provider', 'capability']);
  assert.deepEqual(Object.keys(byName.get('alexandria_library_search').inputSchema.properties), ['command']);
  // The category folders are named, so a first command can open one directly.
  assert.match(byName.get('alexandria_library_search').description, /Category folders: agriculture, ai-models, .*companies, .*real-estate, .*sports, travel; `ls \/library` shows any added since/);

  const copy = [init.instructions, ...tools.map((tool) => JSON.stringify(tool))].join('\n');
  assert.doesNotMatch(copy, /firecrawl_find_tools|Find Tools|firecrawl_scrape with (an )?alexandria/);
  assert.match(init.instructions, /alexandria_library_search/);
  assert.match(init.instructions, /alexandria_library_read with calls: \[\{provider, capability, options\}\] runs up to ten capabilities/);
});

test('alexandria_library_read posts its calls, across providers, and returns one result for each', async (t) => {
  const { api, client } = await startStdioWithApi(t);

  const payload = toolText(await call(client, 'alexandria_library_read', { calls: [{ ...EXCHANGE_CALL, version: ' 1.2.3 ' }], toolDetail: 'full' }));
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
  const many = toolText(await call(client, 'alexandria_library_read', { calls, requestId: 'retry-1', timeout: 20_000 }));
  assert.deepEqual(api.requests[1].body.alexandria, calls);
  assert.equal(api.requests[1].headers['x-request-id'], 'retry-1');
  assert.equal(api.requests[1].body.timeout, 20_000);
  assert.equal(many.success, true);
  assert.equal(many.data.alexandria.length, calls.length);
});

test('alexandria_library_read reads the shapes it does not list as calls and refuses what it cannot run', async (t) => {
  const { api, client } = await startStdioWithApi(t);

  // The firecrawl_scrape body, one call as the arguments themselves, and one call not in an array.
  for (const args of [{ alexandria: EXCHANGE_CALL }, { alexandria: [EXCHANGE_CALL] }, EXCHANGE_CALL, { calls: EXCHANGE_CALL }]) {
    assert.equal(toolText(await call(client, 'alexandria_library_read', args)).success, true);
    assert.deepEqual(api.requests.at(-1).body.alexandria, [EXCHANGE_CALL]);
  }
  await call(client, 'alexandria_library_read', { alexandria: [EXCHANGE_CALL, EXCHANGE_CALL], requestId: 'batch-1' });
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
    await callExpectingError(client, { name: 'alexandria_library_read', arguments: args });
  }
  assert.equal(api.requests.length, sent);
});

test('alexandria_library_search runs a command in firecrawl/library and returns its output as text', async (t) => {
  const { api, client } = await startStdioWithApi(t);

  const result = await call(client, 'alexandria_library_search', { command: ' grep -ril "cpi" /library | head -20 ' });
  assert.notEqual(result.isError, true);
  assert.deepEqual(api.requests[0].body.alexandria, {
    provider: 'firecrawl',
    capability: 'library',
    options: { command: 'grep -ril "cpi" /library | head -20' },
  });
  assert.equal(result.content[0].text, '/library/finance/fred/series/observations.md');
  assert.deepEqual(result.structuredContent, {
    stdout: '/library/finance/fred/series/observations.md\n',
    stderr: '',
    exitCode: 0,
    catalogueVersion: 'v1',
  });

  for (const args of [{}, { command: '   ' }, { command: 'x'.repeat(4097) }, { command: 'ls', query: 'cpi' }])
    await callExpectingError(client, { name: 'alexandria_library_search', arguments: args });
  assert.equal(api.requests.length, 1);
});

test('alexandria_library_search reports an empty result, stderr, cut output and a failed command', async (t) => {
  const entry = (data) => ({ library: { provider: 'firecrawl', capability: 'library', creditsCost: 0, data } });

  const empty = await startStdioWithApi(t, entry({ stdout: '', stderr: '', exitCode: 1, catalogueVersion: 'v1' }));
  const none = await call(empty.client, 'alexandria_library_search', { command: 'grep -ril nothing /library' });
  assert.notEqual(none.isError, true);
  assert.equal(none.content[0].text, '[no output; exit code 1]');
  assert.equal(none.structuredContent.exitCode, 1);

  const cut = await startStdioWithApi(t, entry({ stdout: 'a\nb\n', stderr: 'stdout cut at 30000 of 90000 characters\n', exitCode: 0, truncated: true, catalogueVersion: 'v1' }));
  const long = await call(cut.client, 'alexandria_library_search', { command: 'cat /library/*/*/*.md' });
  assert.equal(long.content[0].text, 'a\nb\n[stderr] stdout cut at 30000 of 90000 characters');
  assert.equal(long.structuredContent.truncated, true);

  const failed = await startStdioWithApi(t, { library: { provider: 'firecrawl', capability: 'library', error: { code: 'library_command_timeout', message: 'The command ran past its deadline.' } } });
  const timeout = await callExpectingError(failed.client, { name: 'alexandria_library_search', arguments: { command: 'grep -r a /' } });
  assert.match(timeout.content[0].text, /ran past its deadline/);
});

test('a refused library command reaches the agent with the message that says what to do', async (t) => {
  const message = 'The command used too much memory. Narrow it to one category or provider folder, or search with grep -r instead of piping every file through cat.';
  for (const status of [422, 503]) {
    const { client } = await startStdioWithApi(t, { apiStatus: status, apiError: message });
    const refused = await callExpectingError(client, { name: 'alexandria_library_search', arguments: { command: 'cat $(find /library -type f) | wc -c' } });
    assert.match(refused.content[0].text, /too much memory.*grep -r/, String(status));
    // Nothing in the refusal sends the agent to another tool, or asks for an argument this tool does not take.
    assert.doesNotMatch(refused.content[0].text, /alexandria_library_read|firecrawl_scrape|Reuse this ID|requestId/, String(status));
    assert.match(refused.content[0].text, /Request ID: \S+\.$/, String(status));
  }
});

test('firecrawl_scrape still runs an alexandria body it no longer lists', async (t) => {
  const { api, client } = await startStdioWithApi(t);

  // One call and a batch run as they did before alexandria_library_read existed.
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
  assert.equal(blocked.structuredContent.nextTool.name, 'alexandria_library_read');
});

test('firecrawl_find_tools is unlisted and still answers', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const { tools } = await client.request('tools/list', {});
  assert.equal(tools.some((tool) => tool.name === 'firecrawl_find_tools'), false);

  // A session that listed tools before the change, or a prompt that names the tool, gets what it got.
  const categories = toolText(await call(client, 'firecrawl_find_tools', {}));
  assert.equal(categories.data.alexandria[0].data.level, 'categories');
  assert.equal(api.requests.at(-1).url, '/exchange/discover');

  const found = toolText(await call(client, 'firecrawl_find_tools', { providers: ['fred'] }));
  assert.equal(found.data.alexandria[0].data.level, 'tools');
  assert.deepEqual(api.requests.at(-1).body.alexandria, {
    provider: 'firecrawl',
    capability: 'find-tools',
    options: { providers: ['fred'], level: 'tools', limit: 20 },
  });
  assert.equal(found.data.alexandria[0].data.nextTool.name, 'firecrawl_find_tools');
});

test('follow-up calls on the full surface are addressed to alexandria_library_read', async (t) => {
  const terms = await startStdioWithApi(t);
  const blocked = await callExpectingError(terms.client, { name: 'alexandria_library_read', arguments: { calls: [{ provider: 'benzinga', capability: 'news/search' }] } });
  assert.deepEqual(blocked.structuredContent.nextTool, {
    name: 'alexandria_library_read',
    arguments: { calls: [{ provider: 'firecrawl', capability: 'terms/show', options: { provider: TERMS_REQUIRED_BODY.requiresAction.terms } }] },
  });
  assert.match(blocked.content[0].text, /Read the agreement with alexandria_library_read using calls: \[\{provider: "firecrawl", capability: "terms\/show"/);
  assert.match(blocked.content[0].text, /call alexandria_library_read again with the identical payload/);
  assert.doesNotMatch(blocked.content[0].text, /firecrawl_scrape/);
  const read = toolText(await terms.client.request('tools/call', blocked.structuredContent.nextTool));
  assert.equal(read.data.alexandria[0].data.terms.document, 'Review this agreement.');

  const large = { success: true, data: { creditsCost: 5, alexandria: [{ ...EXCHANGE_CALL, data: { text: 'x'.repeat(90_000) } }] } };
  const retained = await startStdioWithApi(t, { largeResult: large, bashRecovery: 'available' });
  const result = toolText(await call(retained.client, 'alexandria_library_read', { calls: [EXCHANGE_CALL] }));
  assert.equal(result.delivery, 'retained');
  assert.equal(result.nextTool.name, 'alexandria_library_read');
  assert.equal(result.nextTool.arguments.calls.length, 1);
  assert.equal(result.nextTool.arguments.calls[0].capability, 'bash');
  assert.equal(result.nextTool.arguments.calls[0].options.workspaceId, 'retained-workspace');
});

test('a surface whose tool filter leaves the new tools out keeps firecrawl_find_tools and firecrawl_scrape with an alexandria body', async (t) => {
  const { api, client, init } = await startStdioWithApi(t, LEGACY_SURFACE);
  const { tools } = await client.request('tools/list', {});
  const names = new Set(tools.map((tool) => tool.name));
  assert.equal(names.has('firecrawl_find_tools'), true);
  assert.equal(names.has('alexandria_library_read'), false);
  assert.equal(names.has('alexandria_library_search'), false);
  assert.ok('alexandria' in tools.find((tool) => tool.name === 'firecrawl_scrape').inputSchema.properties);
  assert.doesNotMatch(init.instructions, /alexandria_library_read|alexandria_library_search/);

  const payload = toolText(await call(client, 'firecrawl_scrape', { alexandria: [EXCHANGE_CALL] }));
  assert.equal(payload.success, true);
  assert.deepEqual(api.requests[0].body.alexandria, [EXCHANGE_CALL]);
  assert.equal(toolText(await call(client, 'firecrawl_find_tools', { providers: ['fred'] })).success, true);
  await callExpectingError(client, { name: 'alexandria_library_read', arguments: { calls: [EXCHANGE_CALL] } });
});
