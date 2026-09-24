import assert from 'node:assert/strict';
import test from 'node:test';
import { startStdio, startStdioWithApi, toolText } from './helpers/exchange-mcp.mjs';
import { EXCHANGE_CALL, startFakeExchangeApi } from './helpers/exchange-api.mjs';

const largeAlexandria = () => ({
  success: true,
  data: { creditsCost: 5, alexandria: [{ ...EXCHANGE_CALL, data: { text: 'x'.repeat(90_000) } }] },
});

function assertFeedbackHint(payload) {
  assert.equal(payload.feedbackTool?.name, 'firecrawl_feedback');
  assert.equal(payload.feedbackTool.arguments.endpoint, 'alexandria');
  assert.match(payload.feedbackTool.arguments.requestedWebsite.url, /website/i);
  assert.match(payload.feedbackTool.when, /once per website/i);
}

test('server instructions and Alexandria tool descriptions point at firecrawl_feedback', async (t) => {
  const { client, init } = await startStdioWithApi(t);
  assert.match(init.instructions, /call firecrawl_feedback once per website with endpoint "alexandria"/);
  assert.match(init.instructions, /whether a capability ran or discovery found nothing for the website/);
  const { tools } = await client.request('tools/list', {});
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  assert(byName.has('firecrawl_feedback'));
  assert.match(byName.get('firecrawl_scrape').description, /feedbackTool.*firecrawl_feedback.*endpoint `alexandria`/s);
  assert.match(byName.get('firecrawl_find_tools').description, /feedbackTool.*firecrawl_feedback.*including when nothing covered it/s);
  assert.match(byName.get('firecrawl_search').description, /call firecrawl_feedback once per website/);
});

test('Alexandria executions and discovery results carry the feedback hint; utility calls do not', async (t) => {
  const { client } = await startStdioWithApi(t);
  const call = (name, args) => client.request('tools/call', { name, arguments: args });

  const executed = toolText(await call('firecrawl_scrape', { alexandria: EXCHANGE_CALL }));
  assertFeedbackHint(executed);
  assert.equal(executed.success, true);

  const categories = toolText(await call('firecrawl_find_tools', { limit: 1 }));
  assertFeedbackHint(categories);
  assert.equal(categories.data.alexandria[0].data.level, 'categories');

  const tools = toolText(await call('firecrawl_find_tools', { providers: ['particle'] }));
  assertFeedbackHint(tools);

  const bash = toolText(
    await call('firecrawl_scrape', {
      alexandria: { provider: 'firecrawl', capability: 'bash', options: { workspaceId: 'existing', command: 'cat response.json' } },
    })
  );
  assert.equal(bash.feedbackTool, undefined);
});

test('retained Alexandria results keep the feedback hint next to nextTool', async (t) => {
  const { client } = await startStdioWithApi(t, { largeResult: largeAlexandria(), bashRecovery: 'available' });
  const result = toolText(await client.request('tools/call', { name: 'firecrawl_scrape', arguments: { alexandria: EXCHANGE_CALL } }));
  assert.equal(result.delivery, 'retained');
  assert.equal(result.nextTool.name, 'firecrawl_scrape');
  assertFeedbackHint(result);
});

test('no feedback hint is attached when the feedback tool is disabled by environment', async (t) => {
  const api = await startFakeExchangeApi({});
  t.after(() => api.close());
  const { client } = await startStdio(t, {
    FIRECRAWL_API_KEY: 'fc-exchange-test',
    FIRECRAWL_API_URL: api.url,
    FIRECRAWL_NO_ENDPOINT_FEEDBACK: '1',
  });
  const { tools } = await client.request('tools/list', {});
  assert.equal(tools.some((tool) => tool.name === 'firecrawl_feedback'), false);
  const executed = toolText(await client.request('tools/call', { name: 'firecrawl_scrape', arguments: { alexandria: EXCHANGE_CALL } }));
  assert.equal(executed.feedbackTool, undefined);
  const categories = toolText(await client.request('tools/call', { name: 'firecrawl_find_tools', arguments: { limit: 1 } }));
  assert.equal(categories.feedbackTool, undefined);
});
