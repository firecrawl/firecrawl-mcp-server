import assert from 'node:assert/strict';
import test from 'node:test';
import { LEGACY_SURFACE, startStdioWithApi, toolText } from './helpers/exchange-mcp.mjs';
import { EXCHANGE_CALL } from './helpers/exchange-api.mjs';

// The API attaches nextStep to a provider answer. This server does not model the
// field, so it has to reach the agent unchanged inside data.alexandria.
const nextStep = {
  instruction: 'Next: once you have used this result, rate it with firecrawl_feedback if that tool is available. Eligible feedback can refund 1 credit.',
  tool: 'firecrawl_feedback',
  arguments: { endpoint: 'alexandria', rating: '<good|partial|bad>' },
};
const answer = () => ({
  success: true,
  data: {
    creditsCost: 1,
    alexandria: [{ provider: EXCHANGE_CALL.provider, capability: EXCHANGE_CALL.capability, creditsCost: 1, data: { price: 1 }, feedbackToken: 'v1.token.signature', nextStep }],
  },
});

for (const [surface, name, args] of [
  ['dedicated', 'alexandria_library_read', { calls: [EXCHANGE_CALL] }],
  ['legacy', 'firecrawl_scrape', { alexandria: EXCHANGE_CALL }],
]) {
  test(`${name} passes the API's nextStep through in text and structured content`, async (t) => {
    const { client } = await startStdioWithApi(t, { largeResult: answer(), ...(surface === 'legacy' ? LEGACY_SURFACE : {}) });
    const result = await client.request('tools/call', { name, arguments: args });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    const payload = toolText(result);
    assert.deepEqual(payload.data.alexandria[0].nextStep, nextStep);
    assert.deepEqual(result.structuredContent.data.alexandria[0].nextStep, nextStep);
    assert.equal(payload.data.alexandria[0].feedbackToken, undefined);
    assert.match(payload.data.alexandria[0].feedbackRef, /^c\d+$/);
    assert.deepEqual(payload.data.alexandria[0].data, { price: 1 });
    // One pointer at feedback per result: the API's replaces this server's own.
    assert.equal(payload.feedbackTool, undefined);
  });
}

test('an instance without the feedback tool drops the nextStep that points at it', async (t) => {
  const { client } = await startStdioWithApi(t, { largeResult: answer(), env: { FIRECRAWL_NO_ENDPOINT_FEEDBACK: '1' } });
  const { tools } = await client.request('tools/list', {});
  assert.equal(tools.some((tool) => tool.name === 'firecrawl_feedback'), false);
  const result = await client.request('tools/call', { name: 'alexandria_library_read', arguments: { calls: [EXCHANGE_CALL] } });
  const payload = toolText(result);
  assert.equal(payload.data.alexandria[0].nextStep, undefined);
  assert.equal(result.structuredContent.data.alexandria[0].nextStep, undefined);
  assert.deepEqual(payload.data.alexandria[0].data, { price: 1 });
  assert.equal(payload.feedbackTool, undefined);
});

test('a retained result keeps the feedback pointer, since its results are not inlined', async (t) => {
  const large = answer();
  large.data.alexandria[0].data = { text: 'x'.repeat(90_000) };
  const { client } = await startStdioWithApi(t, { largeResult: large, bashRecovery: 'available' });
  const payload = toolText(await client.request('tools/call', { name: 'alexandria_library_read', arguments: { calls: [EXCHANGE_CALL] } }));
  assert.equal(payload.delivery, 'retained');
  assert.equal(payload.feedbackTool.name, 'firecrawl_feedback');
  assert.match(payload.feedbackTool.when, /can refund 1 credit once per call and website/);
});

test('the feedback tool returns the API message that states the refund', async (t) => {
  const { client } = await startStdioWithApi(t);
  const result = await client.request('tools/call', {
    name: 'firecrawl_feedback',
    arguments: {
      endpoint: 'alexandria',
      rating: 'good',
      requestedWebsite: { url: 'https://fred.stlouisfed.org', requestedFunctionality: 'CPI observations' },
      rationale: 'Returned the series.',
    },
  });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  assert.equal(toolText(result).message, 'Feedback recorded. 1 credit refunded.');
  assert.equal(result.structuredContent.message, 'Feedback recorded. 1 credit refunded.');
});
