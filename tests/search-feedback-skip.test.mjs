// firecrawl_search_feedback answers late and duplicate feedback with a short
// final message, keeps every structured field, and leaves other outcomes as
// they were.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { startStdio } from './helpers/exchange-mcp.mjs';

const EXPIRED = '00000000-0000-4000-8000-000000000001';
const DUPLICATE = '00000000-0000-4000-8000-000000000002';
const INVALID = '00000000-0000-4000-8000-000000000003';
const ACCEPTED = '00000000-0000-4000-8000-000000000004';

const RESPONSES = {
  [EXPIRED]: [
    409,
    {
      success: false,
      error: 'Feedback must be submitted within 120 seconds of the search.',
      feedbackErrorCode: 'FEEDBACK_WINDOW_EXPIRED',
    },
  ],
  [DUPLICATE]: [
    200,
    {
      success: true,
      feedbackId: '00000000-0000-4000-8000-000000000100',
      creditsRefunded: 0,
      alreadySubmitted: true,
      creditsRefundedToday: 1,
      dailyRefundCap: 100,
      warning: 'Feedback was already submitted for this job; no additional refund issued.',
    },
  ],
  [INVALID]: [
    400,
    { success: false, error: 'Feedback must be substantive.', feedbackErrorCode: 'INVALID_BODY' },
  ],
  [ACCEPTED]: [
    200,
    { success: true, feedbackId: '00000000-0000-4000-8000-000000000101', creditsRefunded: 1 },
  ],
};

async function startApi(t) {
  const server = createServer(async (req, res) => {
    for await (const _chunk of req);
    const searchId = /^\/v2\/search\/([^/]+)\/feedback$/.exec(req.url)?.[1];
    const [status, body] = RESPONSES[searchId] ?? [404, { success: false, error: 'Not found' }];
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

async function startClient(t) {
  const { client } = await startStdio(t, {
    CLOUD_SERVICE: 'false',
    FIRECRAWL_API_KEY: 'fc-test',
    FIRECRAWL_API_URL: await startApi(t),
  });
  return (searchId) =>
    client.request('tools/call', {
      name: 'firecrawl_search_feedback',
      arguments: { searchId, rating: 'bad', querySuggestions: 'Use a narrower query' },
    });
}

test('the description asks for feedback right after each search', async (t) => {
  const { client } = await startStdio(t, {
    CLOUD_SERVICE: 'false',
    FIRECRAWL_API_KEY: 'fc-test',
    FIRECRAWL_API_URL: await startApi(t),
  });
  const { tools } = await client.request('tools/list', {});
  const description = tools.find((tool) => tool.name === 'firecrawl_search_feedback').description;
  assert.match(
    description,
    /Submit within 2 minutes of that search; call it right after each search, not batched at the end\. Late feedback is not recorded\./
  );
});

test('late feedback is a final skip that keeps the rejection fields', async (t) => {
  const call = await startClient(t);
  const result = await call(EXPIRED);
  const message = 'Feedback window passed for this search; skipped. Do not resend.';
  assert.notEqual(result.isError, true);
  assert.deepEqual(result.content, [{ type: 'text', text: message }]);
  assert.deepEqual(result.structuredContent, {
    success: false,
    status: 409,
    feedbackErrorCode: 'FEEDBACK_WINDOW_EXPIRED',
    error: 'Feedback must be submitted within 120 seconds of the search.',
    retryable: false,
    message,
  });
});

test('duplicate feedback is a final skip that keeps the API fields', async (t) => {
  const call = await startClient(t);
  const result = await call(DUPLICATE);
  const message = 'Feedback for this search was already recorded; skipped. Do not resend.';
  assert.notEqual(result.isError, true);
  assert.deepEqual(result.content, [{ type: 'text', text: message }]);
  assert.deepEqual(result.structuredContent, {
    ...RESPONSES[DUPLICATE][1],
    retryable: false,
    message,
  });
});

test('other rejections and accepted feedback keep their JSON answers', async (t) => {
  const call = await startClient(t);

  const invalid = await call(INVALID);
  const rejection = {
    success: false,
    status: 400,
    feedbackErrorCode: 'INVALID_BODY',
    error: 'Feedback must be substantive.',
    retryable: false,
  };
  assert.deepEqual(JSON.parse(invalid.content[0].text), rejection);
  assert.deepEqual(invalid.structuredContent, rejection);

  const accepted = await call(ACCEPTED);
  assert.deepEqual(JSON.parse(accepted.content[0].text), RESPONSES[ACCEPTED][1]);
  assert.deepEqual(accepted.structuredContent, RESPONSES[ACCEPTED][1]);
});
