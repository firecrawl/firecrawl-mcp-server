import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import {
  getFreePort,
  parseSseJson,
  spawnServer,
  stopChild,
  waitForHealth,
} from './helpers/exchange-mcp.mjs';

const CRAWL_ID = 'crawl-1';

async function startCrawlApi(startRefusal) {
  const requests = [];
  let statusReads = 0;
  const server = createServer(async (req, res) => {
    for await (const _chunk of req);
    requests.push({ url: req.url, at: Date.now() });
    const base = `http://127.0.0.1:${server.address().port}`;
    const json = (status, payload, headers = {}) => {
      res.writeHead(status, { 'content-type': 'application/json', ...headers });
      res.end(JSON.stringify(payload));
    };
    if (req.method === 'POST' && req.url === '/v2/crawl') {
      if (startRefusal) return json(startRefusal.status, { success: false, error: startRefusal.error });
      return json(200, { success: true, id: CRAWL_ID });
    }
    if (req.url === `/v2/crawl/${CRAWL_ID}?skip=1`) {
      return json(200, { success: true, data: [{ markdown: 'page two' }], next: null });
    }
    if (req.url === `/v2/crawl/${CRAWL_ID}`) {
      statusReads += 1;
      if (statusReads === 2) {
        return json(429, { success: false, error: 'Rate limit exceeded.', retry_after_seconds: 1 }, { 'retry-after': '1' });
      }
      const done = statusReads >= 3;
      return json(200, {
        success: true,
        status: done ? 'completed' : 'scraping',
        completed: done ? 2 : 1,
        total: 2,
        data: [{ markdown: 'page one' }],
        next: `${base}/v2/crawl/${CRAWL_ID}?skip=1`,
      });
    }
    json(404, { success: false, error: `Unhandled ${req.method} ${req.url}` });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    requests,
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function callCrawl(t, api) {
  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    HTTP_STREAMABLE_SERVER: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_KEY: '',
    FIRECRAWL_OAUTH_TOKEN: '',
    FIRECRAWL_API_URL: api.url,
    FIRECRAWL_MCP_SEARCH_ENABLED: 'false',
    PORT: String(port),
  });
  t.after(() => stopChild(child));
  await waitForHealth(port, child);
  const response = await fetch(`http://127.0.0.1:${port}/v2/mcp`, {
    body: JSON.stringify({
      id: 1,
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: 'firecrawl_crawl', arguments: { url: 'https://example.com' } },
    }),
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'x-api-key': 'fc-hosted-test',
    },
    method: 'POST',
    signal: AbortSignal.timeout(20_000),
  });
  assert.equal(response.status, 200);
  return parseSseJson(await response.text());
}

for (const refusal of [
  {
    status: 402,
    error: 'Insufficient credits to perform this request. For more credits, you can upgrade your plan at https://firecrawl.dev/pricing or try changing the request limit to a lower value.',
  },
  {
    status: 429,
    error: 'Rate limit exceeded. Consumed (req/min): 2, Remaining (req/min): 0. Please retry after 30s.',
  },
]) {
  test(`a crawl the API refuses with ${refusal.status} relays the API's reason`, async (t) => {
    const api = await startCrawlApi(refusal);
    t.after(() => api.close());
    const message = await callCrawl(t, api);
    assert.equal(message.result?.isError, true, JSON.stringify(message));
    const text = message.result.content[0].text;
    assert.ok(text.includes(refusal.error), text);
    assert.doesNotMatch(text, /Request failed with status code/);
    assert.equal(message.result.structuredContent?.status, refusal.status, JSON.stringify(message.result));
    assert.equal(message.result.structuredContent?.code, 'exchange_error');
    assert.equal(api.requests.filter(({ url }) => url.startsWith(`/v2/crawl/${CRAWL_ID}`)).length, 0);
  });
}

test('crawl waits out a rate-limited status read and pages results only once it ends', async (t) => {
  const api = await startCrawlApi();
  t.after(() => api.close());
  const message = await callCrawl(t, api);
  assert.notEqual(message.result?.isError, true, JSON.stringify(message));
  const result = JSON.parse(message.result.content[0].text);
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.data.map((doc) => doc.markdown), ['page one', 'page two']);
  const statusReads = api.requests.filter(({ url }) => url === `/v2/crawl/${CRAWL_ID}`);
  assert.equal(statusReads.length, 3);
  assert.ok(statusReads[2].at - statusReads[1].at >= 1000, 'the read after a 429 waits for Retry-After');
  assert.equal(api.requests.filter(({ url }) => url.endsWith('?skip=1')).length, 1);
});
