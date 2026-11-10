import assert from 'node:assert/strict';
import test from 'node:test';
import { LEGACY_ALEXANDRIA_TOOLS, startStdio, startStdioWithApi, toolText } from './helpers/exchange-mcp.mjs';
import { EXCHANGE_CALL, startFakeExchangeApi } from './helpers/exchange-api.mjs';

const largeAlexandria = () => ({
  success: true,
  data: { creditsCost: 5, alexandria: [{ ...EXCHANGE_CALL, data: { text: 'x'.repeat(90_000) } }] },
});

function assertFeedbackHint(payload) {
  assert.equal(payload.feedbackTool?.name, 'firecrawl_feedback');
  assert.equal(payload.feedbackTool.arguments.endpoint, 'alexandria');
  assert.match(payload.feedbackTool.arguments.requestedWebsite.url, /website/i);
  assert.match(payload.feedbackTool.arguments.objective, /goal/i);
  assert.match(payload.feedbackTool.when, /^After task completion, within 20 minutes of your last Alexandria call/i);
}

test('Alexandria selection metadata omits feedback workflow', async (t) => {
  const { client, init } = await startStdioWithApi(t);
  assert.doesNotMatch(init.instructions, /firecrawl_feedback|feedbackTool|Alexandria quality feedback/i);
  const { tools } = await client.request('tools/list', {});
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  assert(byName.has('firecrawl_feedback'));
  assert.match(
    byName.get('firecrawl_feedback').description,
    /alexandria.*eligible feedback can refund 1 credit.*daily caps per website and per team/is
  );
  assert.doesNotMatch(byName.get('firecrawl_feedback').description, /no credit refund|no job-age deadline/i);
  assert.match(byName.get('firecrawl_feedback').description, /within 20 minutes of the team's latest Alexandria/i);
  for (const name of ['firecrawl_scrape', 'alexandria_library_read', 'alexandria_library_search', 'firecrawl_search']) {
    assert.doesNotMatch(byName.get(name).description, /firecrawl_feedback|feedbackTool|Alexandria quality feedback/i, name);
  }
});

test('Alexandria executions and discovery results carry the feedback hint; utility calls do not', async (t) => {
  const { client } = await startStdioWithApi(t);
  const call = (name, args) => client.request('tools/call', { name, arguments: args });

  const executed = toolText(await call('alexandria_library_read', { calls: [EXCHANGE_CALL] }));
  assertFeedbackHint(executed);
  assert.equal(executed.success, true);

  const bash = toolText(
    await call('alexandria_library_read', { calls: [{ provider: 'firecrawl', capability: 'bash', options: { workspaceId: 'existing', command: 'cat response.json' } }] })
  );
  assert.equal(bash.feedbackTool, undefined);

  const library = await call('alexandria_library_search', { command: 'ls /library' });
  assert.notEqual(library.isError, true, JSON.stringify(library));
  assert.equal(library.structuredContent.feedbackTool, undefined);
});

test('legacy discovery results carry the feedback hint', async (t) => {
  const { client } = await startStdioWithApi(t, { env: LEGACY_ALEXANDRIA_TOOLS });
  const call = (name, args) => client.request('tools/call', { name, arguments: args });

  const categories = toolText(await call('firecrawl_find_tools', { limit: 1 }));
  assertFeedbackHint(categories);
  assert.equal(categories.data.alexandria[0].data.level, 'categories');

  const tools = toolText(await call('firecrawl_find_tools', { providers: ['particle'] }));
  assertFeedbackHint(tools);
});

test('retained Alexandria results keep the feedback hint next to nextTool', async (t) => {
  const { client } = await startStdioWithApi(t, { largeResult: largeAlexandria(), bashRecovery: 'available' });
  const result = toolText(await client.request('tools/call', { name: 'alexandria_library_read', arguments: { calls: [EXCHANGE_CALL] } }));
  assert.equal(result.delivery, 'retained');
  assert.equal(result.nextTool.name, 'alexandria_library_read');
  assertFeedbackHint(result);
});

test('no feedback hint is attached when the feedback tool is disabled by environment', async (t) => {
  const api = await startFakeExchangeApi({});
  t.after(() => api.close());
  const { client } = await startStdio(t, {
    FIRECRAWL_API_KEY: 'fc-exchange-test',
    FIRECRAWL_API_URL: api.url,
    FIRECRAWL_NO_ENDPOINT_FEEDBACK: '1',
    ...LEGACY_ALEXANDRIA_TOOLS,
  });
  const { tools } = await client.request('tools/list', {});
  assert.equal(tools.some((tool) => tool.name === 'firecrawl_feedback'), false);
  const executed = toolText(await client.request('tools/call', { name: 'firecrawl_scrape', arguments: { alexandria: EXCHANGE_CALL } }));
  assert.equal(executed.feedbackTool, undefined);
  const categories = toolText(await client.request('tools/call', { name: 'firecrawl_find_tools', arguments: { limit: 1 } }));
  assert.equal(categories.feedbackTool, undefined);
});
