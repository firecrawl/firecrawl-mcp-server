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

const BUDGET = 900_000;
const CAPPED_USER_AGENT = 'baseten-tool-bank/1.0';

// Ten scraped results of about 180 KB of markdown each: a search response of
// about 1.8 MB, as a search with scrapeOptions returns for long pages.
function largeSearchResponse() {
  const web = Array.from({ length: 10 }, (_, i) => ({
    url: `https://example.com/page-${i}`,
    title: `Page ${i}`,
    description: `Description of page ${i}`,
    position: i + 1,
    markdown: `# Page ${i}\n\n${'Row | "quoted" value | é ü 🔥\n'.repeat(6_000)}`,
    links: Array.from({ length: 200 }, (_, j) => `https://example.com/page-${i}/link-${j}`),
    metadata: { title: `Page ${i}`, statusCode: 200 },
  }));
  return { success: true, data: { web }, creditsUsed: 10, id: '00000000-0000-4000-8000-000000000000' };
}

function smallSearchResponse() {
  return {
    success: true,
    data: { web: [{ url: 'https://example.com/', title: 'Example Domain', description: 'Example', markdown: '# Example' }] },
    creditsUsed: 1,
    id: '00000000-0000-4000-8000-000000000001',
  };
}

async function startServer(t, searchResponse) {
  const api = createServer(async (req, res) => {
    for await (const chunk of req) void chunk;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(req.url === '/v2/search' ? searchResponse : { success: true }));
  });
  await new Promise((resolve) => api.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => api.close(resolve)));

  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: `http://127.0.0.1:${api.address().port}`,
    FIRECRAWL_OAUTH_ISSUER: `http://127.0.0.1:${api.address().port}`,
    FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'test-secret',
    HTTP_STREAMABLE_SERVER: 'true',
    PORT: String(port),
  });
  t.after(() => stopChild(child));
  await waitForHealth(port, child);

  return async (userAgent) => {
    const response = await fetch(`http://127.0.0.1:${port}/v2/mcp`, {
      body: JSON.stringify({
        id: 1,
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'firecrawl_search',
          arguments: { query: 'example', limit: 10, scrapeOptions: { formats: ['markdown', 'links'] } },
        },
      }),
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        'x-api-key': 'fc-byte-budget-test',
        ...(userAgent ? { 'user-agent': userAgent } : {}),
      },
      method: 'POST',
    });
    assert.equal(response.status, 200);
    const result = parseSseJson(await response.text()).result;
    assert.notEqual(result.isError, true, JSON.stringify(result).slice(0, 500));
    return result;
  };
}

const resultBytes = (result) => Buffer.byteLength(JSON.stringify(result));

test('a 1.8 MB search result comes back under the byte budget for a capped client', async (t) => {
  const payload = largeSearchResponse();
  const search = await startServer(t, payload);
  const before = Buffer.byteLength(JSON.stringify(payload));
  assert.ok(before > 1_700_000, `fixture is ${before} bytes`);

  const result = await search(CAPPED_USER_AGENT);
  const after = resultBytes(result);
  assert.ok(after <= BUDGET, `result is ${after} bytes`);
  assert.ok(after > BUDGET * 0.9, `result uses only ${after} of ${BUDGET} bytes`);

  const body = JSON.parse(result.content[0].text);
  assert.deepEqual(result.structuredContent, body);
  assert.match(body.warning, /Page content was cut to keep this response under 900000 bytes/);
  assert.equal(body.data.web.length, 10);
  for (const [i, item] of body.data.web.entries()) {
    const original = payload.data.web[i];
    assert.equal(item.url, original.url);
    assert.deepEqual(item.metadata, original.metadata);
    assert.match(item.truncated, /^markdown cut to fit the response size limit\. Call firecrawl_scrape/);
    assert.match(
      item.markdown,
      new RegExp(`\\[Truncated: \\d+ of ${original.markdown.length} characters shown\\. Call firecrawl_scrape on ${original.url} for the full page\\.\\]$`)
    );
    assert.ok(original.markdown.startsWith(item.markdown.slice(0, item.markdown.lastIndexOf('\n\n[Truncated'))));
    assert.deepEqual(item.links, original.links);
  }
});

test('when results alone overflow the budget, the lowest-ranked ones are left out', async (t) => {
  const web = Array.from({ length: 100 }, (_, i) => ({
    url: `https://example.com/${i}`,
    title: `Result ${i}`,
    metadata: { note: 'x'.repeat(10_000) },
  }));
  const search = await startServer(t, { success: true, data: { web } });
  const result = await search(CAPPED_USER_AGENT);
  assert.ok(resultBytes(result) <= BUDGET, `result is ${resultBytes(result)} bytes`);
  const body = JSON.parse(result.content[0].text);
  assert.ok(body.data.web.length > 0 && body.data.web.length < 100);
  assert.deepEqual(body.data.web, web.slice(0, body.data.web.length));
  assert.match(body.warning, new RegExp(`${100 - body.data.web.length} lower-ranked results were left out`));
});

test('the capped client gets the same bytes back when the result already fits', async (t) => {
  const payload = smallSearchResponse();
  const search = await startServer(t, payload);
  const result = await search(CAPPED_USER_AGENT);
  assert.equal(result.content[0].text, JSON.stringify(payload));
  assert.deepEqual(result.structuredContent, payload);
});

test('every other client gets the large result byte for byte unchanged', async (t) => {
  const payload = largeSearchResponse();
  const search = await startServer(t, payload);
  for (const userAgent of [undefined, 'node', 'Claude-User/1.0', 'python-httpx/0.28.1', 'baseten/1.0', 'tool-bank/1.0']) {
    const result = await search(userAgent);
    assert.equal(result.content[0].text, JSON.stringify(payload), String(userAgent));
    assert.deepEqual(result.structuredContent, payload, String(userAgent));
  }
});
