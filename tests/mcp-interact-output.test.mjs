import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { startStdio } from './helpers/exchange-mcp.mjs';

// The interact response as /v2/scrape/:jobId/interact sends it: the browser
// session id and its links (browserSessionLinks in the API) next to the output.
const INTERACT_RESPONSE = {
  success: true,
  sessionId: 'session-live-1',
  cdpUrl: 'wss://browser.firecrawl.dev/cdp/session-live-1',
  liveViewUrl: 'https://liveview.firecrawl.dev/session-live-1',
  interactiveLiveViewUrl: 'https://liveview.firecrawl.dev/session-live-1?interactive=true',
  output: 'The page asks for a captcha.',
  stdout: '',
  result: '',
  stderr: '',
  exitCode: 0,
};

async function startFakeApi(t) {
  const requests = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    req.setEncoding('utf8');
    for await (const chunk of req) raw += chunk;
    requests.push({ method: req.method, url: req.url, body: raw ? JSON.parse(raw) : undefined });
    res.writeHead(200, { 'content-type': 'application/json' });
    if (req.method === 'POST' && req.url === '/v2/scrape/job-live/interact') {
      res.end(JSON.stringify(INTERACT_RESPONSE));
      return;
    }
    if (req.method === 'POST' && req.url === '/v2/scrape') {
      res.end(JSON.stringify({ success: true, data: { markdown: '# Login', metadata: { scrapeId: 'job-live' } } }));
      return;
    }
    res.writeHead(404);
    res.end(JSON.stringify({ success: false, error: `Unhandled ${req.method} ${req.url}` }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { url: `http://127.0.0.1:${server.address().port}`, requests };
}

test('interact structured output keeps the live view URLs the API returns', async (t) => {
  const api = await startFakeApi(t);
  const { client } = await startStdio(t, {
    CLOUD_SERVICE: 'false',
    FIRECRAWL_API_KEY: 'fc-interact-test',
    FIRECRAWL_API_URL: api.url,
  });

  const { tools } = await client.request('tools/list', {});
  const interact = tools.find((tool) => tool.name === 'firecrawl_interact');
  for (const key of ['sessionId', 'liveViewUrl', 'interactiveLiveViewUrl', 'cdpUrl']) {
    assert.ok(interact.outputSchema.properties[key], `${key} is declared in the output schema`);
  }
  assert.match(interact.description, /`interactiveLiveViewUrl`/);

  for (const args of [
    { scrapeId: 'job-live', prompt: 'Log in' },
    { url: 'https://example.com/login', prompt: 'Log in' },
  ]) {
    const result = await client.request('tools/call', { name: 'firecrawl_interact', arguments: args });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    const structured = result.structuredContent;
    assert.equal(structured.interactiveLiveViewUrl, INTERACT_RESPONSE.interactiveLiveViewUrl);
    assert.equal(structured.liveViewUrl, INTERACT_RESPONSE.liveViewUrl);
    assert.equal(structured.cdpUrl, INTERACT_RESPONSE.cdpUrl);
    assert.equal(structured.sessionId, INTERACT_RESPONSE.sessionId);
    assert.equal(structured.output, INTERACT_RESPONSE.output);
  }
  assert.equal(
    api.requests.filter((request) => request.url === '/v2/scrape/job-live/interact').length,
    2
  );
});
