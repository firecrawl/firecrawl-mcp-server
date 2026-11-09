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
  output: 'The page is ready.',
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
      res.end(JSON.stringify({ success: true, data: { markdown: '# Start', metadata: { scrapeId: 'job-live' } } }));
      return;
    }
    res.writeHead(404);
    res.end(JSON.stringify({ success: false, error: `Unhandled ${req.method} ${req.url}` }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { url: `http://127.0.0.1:${server.address().port}`, requests };
}

test('interact output keeps the live view URLs and leaves out cdpUrl', async (t) => {
  const api = await startFakeApi(t);
  const { client } = await startStdio(t, {
    CLOUD_SERVICE: 'false',
    FIRECRAWL_API_KEY: 'fc-interact-test',
    FIRECRAWL_API_URL: api.url,
  });

  const { tools } = await client.request('tools/list', {});
  const interact = tools.find((tool) => tool.name === 'firecrawl_interact');
  for (const key of ['sessionId', 'liveViewUrl', 'interactiveLiveViewUrl']) {
    assert.ok(interact.outputSchema.properties[key], `${key} is declared in the output schema`);
  }
  assert.equal(interact.outputSchema.properties.cdpUrl, undefined, 'cdpUrl is not declared in the output schema');
  assert.match(interact.description, /`interactiveLiveViewUrl`/);
  assert.doesNotMatch(interact.description, /captcha/i);
  assert.doesNotMatch(interact.description, /login/i);

  for (const { args, scrapedUrls } of [
    { args: { scrapeId: 'job-live', prompt: 'Open the menu' }, scrapedUrls: [] },
    { args: { url: 'https://example.com/start', prompt: 'Open the menu' }, scrapedUrls: ['https://example.com/start'] },
  ]) {
    const before = api.requests.length;
    const result = await client.request('tools/call', { name: 'firecrawl_interact', arguments: args });
    const scrapes = api.requests
      .slice(before)
      .filter((request) => request.method === 'POST' && request.url === '/v2/scrape');
    assert.deepEqual(
      scrapes.map((request) => request.body?.url),
      scrapedUrls,
      'url mode scrapes the given URL once; scrapeId mode does not scrape'
    );
    assert.notEqual(result.isError, true, JSON.stringify(result));
    const structured = result.structuredContent;
    assert.equal(structured.interactiveLiveViewUrl, INTERACT_RESPONSE.interactiveLiveViewUrl);
    assert.equal(structured.liveViewUrl, INTERACT_RESPONSE.liveViewUrl);
    assert.equal(structured.sessionId, INTERACT_RESPONSE.sessionId);
    assert.equal(structured.output, INTERACT_RESPONSE.output);
    assert.equal('cdpUrl' in structured, false, 'structuredContent leaves out cdpUrl');
    const text = result.content.map((part) => part.text ?? '').join('\n');
    assert.doesNotMatch(text, /cdpUrl/, 'text content leaves out cdpUrl');
    assert.equal(text.includes(INTERACT_RESPONSE.cdpUrl), false, 'text content leaves out the CDP URL');
    assert.equal(text.includes(INTERACT_RESPONSE.interactiveLiveViewUrl), true, 'text content keeps the interactive live view URL');
  }
  assert.equal(
    api.requests.filter((request) => request.url === '/v2/scrape/job-live/interact').length,
    2
  );
});
