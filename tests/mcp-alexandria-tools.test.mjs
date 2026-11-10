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

test('the full surface lists alexandria_execute and alexandria_library_search, and firecrawl_scrape takes a page only', async (t) => {
  const { client, init } = await startStdioWithApi(t);
  const { tools } = await client.request('tools/list', {});
  const byName = new Map(tools.map((tool) => [tool.name, tool]));

  for (const name of ['alexandria_execute', 'alexandria_library_search', 'firecrawl_search', 'firecrawl_scrape'])
    assert.equal(byName.get(name)?._meta?.['anthropic/alwaysLoad'], true, name);
  assert.equal(byName.has('firecrawl_find_tools'), false);

  const scrape = byName.get('firecrawl_scrape');
  assert.equal('alexandria' in scrape.inputSchema.properties, false);
  assert.equal('requestId' in scrape.inputSchema.properties, false);
  assert.deepEqual(scrape.inputSchema.required, ['url']);
  assert.doesNotMatch(scrape.description, /firecrawl_find_tools|in place of `url`/);
  assert.match(scrape.description, /does not run providers/);

  assert.deepEqual(byName.get('alexandria_execute').inputSchema.required, ['provider', 'capability']);
  assert.deepEqual(Object.keys(byName.get('alexandria_library_search').inputSchema.properties), ['command']);

  const copy = [init.instructions, ...tools.map((tool) => JSON.stringify(tool))].join('\n');
  assert.doesNotMatch(copy, /firecrawl_find_tools|Find Tools|firecrawl_scrape with (an )?alexandria/);
  assert.match(init.instructions, /alexandria_library_search/);
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

test('firecrawl_find_tools stays callable for cached sessions and answers with the library command', async (t) => {
  const { api, client } = await startStdioWithApi(t);

  for (const [args, command] of [
    [{}, 'cat /library/README.md'],
    [{ categories: ['finance'] }, 'cat /library/finance/README.md'],
    [{ providers: ['fred'] }, 'cat /library/*/fred/README.md'],
    [{ providers: ['fred'], capabilities: ['series/observations'] }, 'cat /library/*/fred/series/observations.md'],
    [{ query: 'US 30-year mortgage rates' }, 'grep -rilE "year|mortgage|rates" /library | head -20'],
    [{ urls: ['https://www.redfin.com/city/1'] }, 'grep -ril "redfin.com" /library | head -20'],
    [{ urls: ['$(id).example'] }, 'cat /library/README.md'],
    // A name that would need quoting is never placed in a command.
    [{ providers: ['fred; rm -rf /'] }, 'cat /library/README.md'],
    [{ providers: ['../../etc'] }, 'cat /library/README.md'],
  ]) {
    const moved = await callExpectingError(client, { name: 'firecrawl_find_tools', arguments: args });
    assert.deepEqual(moved.structuredContent.nextTool, { name: 'alexandria_library_search', arguments: { command } });
    assert.match(moved.content[0].text, /replaced by alexandria_library_search/);
  }
  assert.equal(api.requests.length, 0);
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

test('legacy tool names keep firecrawl_find_tools and firecrawl_scrape with an alexandria body', async (t) => {
  const { api, client, init } = await startStdioWithApi(t, { env: LEGACY_ALEXANDRIA_TOOLS });
  const { tools } = await client.request('tools/list', {});
  const names = new Set(tools.map((tool) => tool.name));
  assert.equal(names.has('firecrawl_find_tools'), true);
  assert.equal(names.has('alexandria_execute'), false);
  assert.equal(names.has('alexandria_library_search'), false);
  assert.ok('alexandria' in tools.find((tool) => tool.name === 'firecrawl_scrape').inputSchema.properties);
  assert.doesNotMatch(init.instructions, /alexandria_execute|alexandria_library_search/);

  const payload = toolText(await call(client, 'firecrawl_scrape', { alexandria: [EXCHANGE_CALL] }));
  assert.equal(payload.success, true);
  assert.deepEqual(api.requests[0].body.alexandria, [EXCHANGE_CALL]);
  assert.equal(toolText(await call(client, 'firecrawl_find_tools', { providers: ['fred'] })).success, true);
  await callExpectingError(client, { name: 'alexandria_execute', arguments: EXCHANGE_CALL });
});
