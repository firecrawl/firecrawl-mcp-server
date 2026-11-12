import assert from 'node:assert/strict';
import test from 'node:test';
import { startStdioWithApi, toolText } from './helpers/exchange-mcp.mjs';
import { callToken, EXCHANGE_CALL } from './helpers/exchange-api.mjs';

const FEEDBACK = {
  endpoint: 'alexandria',
  rating: 'good',
  requestedWebsite: { url: 'https://example.com', requestedFunctionality: 'Read the series' },
  rationale: 'It worked.',
};

const execute = (client) => client.request('tools/call', { name: 'alexandria_library_read', arguments: { calls: [EXCHANGE_CALL] } });
const feedback = (client, args = {}) => client.request('tools/call', { name: 'firecrawl_feedback', arguments: { ...FEEDBACK, ...args } });
const feedbackBodies = (api) => api.requests.filter((request) => request.url === '/v2/feedback').map((request) => request.body);

test('call tokens are replaced by short refs in the tool output', async (t) => {
  const { client } = await startStdioWithApi(t, { feedbackTokens: true });
  const text = (await execute(client)).content[0].text;
  assert.doesNotMatch(text, /feedbackToken|fbk\./);
  const results = JSON.parse(text).data.alexandria;
  assert.deepEqual(results.map((item) => item.feedbackRef), ['c1', 'c2']);
});

test('feedback sends the session tokens and clears them on success', async (t) => {
  const { api, client } = await startStdioWithApi(t, { feedbackTokens: true });
  await execute(client);
  await execute(client);
  toolText(await feedback(client));
  assert.deepEqual(feedbackBodies(api)[0].tokens, [callToken(1, 0), callToken(1, 1), callToken(2, 0), callToken(2, 1)]);
  assert.equal(feedbackBodies(api)[0].callRatings, undefined);

  toolText(await feedback(client));
  assert.equal(feedbackBodies(api)[1].tokens, undefined);
});

test('callRatings map refs to tokens, and unknown refs are dropped with a note', async (t) => {
  const { api, client } = await startStdioWithApi(t, { feedbackTokens: true });
  await execute(client);
  const result = toolText(
    await feedback(client, {
      callRatings: [
        { ref: 'c1', rating: 'good' },
        { ref: 'c2', rating: 'bad' },
        { ref: 'c99', rating: 'bad' },
      ],
    })
  );
  assert.match(result.note, /c99/);
  assert.equal(result.success, true);
  const body = feedbackBodies(api)[0];
  assert.deepEqual(body.callRatings, [
    { token: callToken(1, 0), rating: 'good' },
    { token: callToken(1, 1), rating: 'bad' },
  ]);
  assert.deepEqual(body.tokens, [callToken(1, 0), callToken(1, 1)]);
});

test('tokens are kept when the feedback is rejected', async (t) => {
  const { api, client } = await startStdioWithApi(t, { feedbackTokens: true, rejectFirstFeedback: true });
  await execute(client);
  const rejected = toolText(await feedback(client));
  assert.equal(rejected.success, false);
  toolText(await feedback(client));
  assert.deepEqual(feedbackBodies(api)[1].tokens, [callToken(1, 0), callToken(1, 1)]);
});

test('rejectedTokens from the API is passed through to the agent', async (t) => {
  const { client } = await startStdioWithApi(t, { feedbackTokens: true, rejectedTokens: 2 });
  await execute(client);
  assert.equal(toolText(await feedback(client)).rejectedTokens, 2);
});

test('at most 20 tokens are sent and the oldest are dropped', async (t) => {
  const { api, client } = await startStdioWithApi(t, { feedbackTokens: true });
  for (let i = 0; i < 12; i += 1) await execute(client);
  toolText(await feedback(client));
  const { tokens } = feedbackBodies(api)[0];
  assert.equal(tokens.length, 20);
  assert.equal(tokens.at(-1), callToken(12, 1));
  assert.equal(tokens[0], callToken(3, 0));
});

test('retained results list the refs next to nextTool', async (t) => {
  const largeResult = {
    success: true,
    data: { creditsCost: 5, alexandria: [{ ...EXCHANGE_CALL, feedbackToken: callToken(1, 0), data: { text: 'x'.repeat(90_000) } }] },
  };
  const { api, client } = await startStdioWithApi(t, { largeResult, bashRecovery: 'available' });
  const text = (await execute(client)).content[0].text;
  assert.doesNotMatch(text, /fbk\./);
  const result = JSON.parse(text);
  assert.equal(result.delivery, 'retained');
  assert.deepEqual(result.feedbackRefs, [{ provider: 'fred', capability: 'series/observations', feedbackRef: 'c1' }]);
  toolText(await feedback(client));
  assert.deepEqual(feedbackBodies(api)[0].tokens, [callToken(1, 0)]);
});

test('without tokens the feedback body is unchanged', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  await execute(client);
  toolText(await feedback(client));
  const body = feedbackBodies(api)[0];
  assert.equal(body.tokens, undefined);
  assert.equal(body.callRatings, undefined);
});

test('find-tools tokens are not kept', async (t) => {
  const { api, client } = await startStdioWithApi(t, { feedbackTokens: true });
  const found = await client.request('tools/call', { name: 'firecrawl_find_tools', arguments: { providers: ['fred'] } });
  assert.doesNotMatch(found.content[0].text, /feedbackToken|fbk\./);
  assert.equal(toolText(found).data.alexandria[0].feedbackRef, undefined);
  toolText(await feedback(client));
  assert.equal(feedbackBodies(api)[0].tokens, undefined);
});

test('the feedback tool lists callRatings in its schema', async (t) => {
  const { client } = await startStdioWithApi(t);
  const { tools } = await client.request('tools/list', {});
  const tool = tools.find((entry) => entry.name === 'firecrawl_feedback');
  assert.equal(tool.inputSchema.properties.callRatings.maxItems, 20);
  assert.match(tool.description, /callRatings/);
});
