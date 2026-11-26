import assert from 'node:assert/strict';
import test from 'node:test';
import { startStdio, startStdioWithApi, toolText } from './helpers/exchange-mcp.mjs';
import { apiRef, callToken, EXCHANGE_CALL, startFakeExchangeApi } from './helpers/exchange-api.mjs';
import { localFeedbackRef, MAX_FEEDBACK_REF_LENGTH } from '../dist/alexandria-feedback-tokens.js';

const FEEDBACK = {
  endpoint: 'alexandria',
  rating: 'good',
  requestedWebsite: { url: 'https://example.com', requestedFunctionality: 'Read the series' },
  rationale: 'It worked.',
};

const execute = (client) => client.request('tools/call', { name: 'alexandria_library_read', arguments: { calls: [EXCHANGE_CALL] } });
const feedback = (client, args = {}) => client.request('tools/call', { name: 'firecrawl_feedback', arguments: { ...FEEDBACK, ...args } });
const feedbackBodies = (api) => api.requests.filter((request) => request.url === '/v2/feedback').map((request) => request.body);

test('every ref handed out fits a 32-character cached schema, with or without the API ref', async (t) => {
  assert.equal(MAX_FEEDBACK_REF_LENGTH, 32);
  for (const options of [{ feedbackTokens: true }, { feedbackTokens: true, feedbackRefs: true }, { feedbackRefs: true }]) {
    const { client } = await startStdioWithApi(t, options);
    const text = (await execute(client)).content[0].text;
    assert.doesNotMatch(text, /feedbackToken/);
    const refs = JSON.parse(text).data.alexandria.map((item) => item.feedbackRef);
    const expected = options.feedbackRefs
      ? [apiRef(1, 0), apiRef(1, 1)]
      : [localFeedbackRef(callToken(1, 0)), localFeedbackRef(callToken(1, 1))];
    assert.deepEqual(refs, expected);
    for (const ref of refs) assert.ok(ref.length <= MAX_FEEDBACK_REF_LENGTH, ref);
  }
});

test('a local ref is sent as its token on the process that holds it', async (t) => {
  const { api, client } = await startStdioWithApi(t, { feedbackTokens: true });
  const [call] = toolText(await execute(client)).data.alexandria;
  const result = toolText(await feedback(client, { callRatings: [{ ref: call.feedbackRef, rating: 'bad' }] }));
  assert.equal(result.note, undefined);
  assert.deepEqual(feedbackBodies(api)[0].callRatings, [{ token: callToken(1, 0), rating: 'bad' }]);
});

test('a local ref from another process, or from before signed refs, is reported back', async (t) => {
  const { api, client } = await startStdioWithApi(t, { feedbackTokens: true });
  const result = toolText(
    await feedback(client, { callRatings: [{ ref: localFeedbackRef('elsewhere'), rating: 'bad' }, { ref: 'c1', rating: 'good' }] })
  );
  assert.equal(result.note, `Ignored call ratings for unknown or expired refs: ${localFeedbackRef('elsewhere')}, c1.`);
  assert.equal(feedbackBodies(api)[0].callRatings, undefined);
});

test('a call rated by its API ref on another server instance keeps its rating', async (t) => {
  const api = await startFakeExchangeApi({ feedbackTokens: true, feedbackRefs: true });
  t.after(() => api.close());
  const env = { CLOUD_SERVICE: 'false', FIRECRAWL_API_KEY: 'fc-exchange-test', FIRECRAWL_API_URL: api.url };
  const first = await startStdio(t, env);
  const second = await startStdio(t, env);
  const [call] = toolText(await execute(first.client)).data.alexandria;
  const result = toolText(await feedback(second.client, { callRatings: [{ ref: call.feedbackRef, rating: 'bad' }] }));
  assert.equal(result.success, true);
  assert.deepEqual(feedbackBodies(api)[0].callRatings, [{ ref: apiRef(1, 0), rating: 'bad' }]);
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

test('signed tokens handed out as refs before this change are still sent as tokens', async (t) => {
  const { api, client } = await startStdioWithApi(t, { feedbackTokens: true });
  await execute(client);
  const result = toolText(
    await feedback(client, {
      callRatings: [
        { ref: callToken(1, 0), rating: 'good' },
        { ref: callToken(1, 1), rating: 'bad' },
      ],
    })
  );
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

test('an unverifiable ref is sent as given and the API rejection reaches the agent', async (t) => {
  const { api, client } = await startStdioWithApi(t, { rejectedTokens: 1 });
  const result = toolText(await feedback(client, { callRatings: [{ ref: 'v1.bad.sig', rating: 'bad' }] }));
  assert.equal(result.rejectedTokens, 1);
  assert.deepEqual(feedbackBodies(api)[0].callRatings, [{ token: 'v1.bad.sig', rating: 'bad' }]);
});

test('a rating by a short ref the API issued is sent as a ref', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  toolText(await feedback(client, { callRatings: [{ ref: 'aAbCdE12345', rating: 'good' }] }));
  assert.deepEqual(feedbackBodies(api)[0].callRatings, [{ ref: 'aAbCdE12345', rating: 'good' }]);
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
  const result = JSON.parse(text);
  assert.equal(result.delivery, 'retained');
  assert.deepEqual(result.feedbackRefs, [{ provider: 'fred', capability: 'series/observations', feedbackRef: localFeedbackRef(callToken(1, 0)) }]);
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
