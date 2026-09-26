import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { startStdio, toolText } from './helpers/exchange-mcp.mjs';

// The v2 scrape body is a strict object: option keys the API does not name,
// such as the MCP-only jsonOptions/queryOptions/screenshotOptions/pdfOptions,
// are rejected with "Unrecognized key in body".
const V2_SCRAPE_KEYS = new Set([
  'url',
  'formats',
  'parsers',
  'onlyMainContent',
  'includeTags',
  'excludeTags',
  'waitFor',
  'mobile',
  'skipTlsVerification',
  'removeBase64Images',
  'location',
  'storeInCache',
  'zeroDataRetention',
  'maxAge',
  'proxy',
  'origin',
  'timeout',
]);

async function startFakeInteractApi(t) {
  const requests = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    req.setEncoding('utf8');
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : undefined;
    requests.push({ method: req.method, url: req.url, body });
    const json = (status, payload) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    };
    if (req.method === 'POST' && req.url === '/v2/scrape') {
      const unknown = Object.keys(body).filter(
        (key) => !V2_SCRAPE_KEYS.has(key)
      );
      if (unknown.length > 0) {
        return json(400, {
          success: false,
          error: `Unrecognized key in body: ${unknown.join(', ')}`,
        });
      }
      return json(200, {
        success: true,
        data: { markdown: '# hi', metadata: { scrapeId: 'scrape-1' } },
      });
    }
    if (req.method === 'POST' && req.url === '/v2/scrape/scrape-1/interact') {
      return json(200, { success: true, output: 'clicked' });
    }
    json(404, { success: false, error: `Unhandled ${req.method} ${req.url}` });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { requests, url: `http://127.0.0.1:${server.address().port}` };
}

test('firecrawl_interact url mode sends scrapeOptions in the v2 scrape shape', async (t) => {
  const api = await startFakeInteractApi(t);
  const { client } = await startStdio(t, {
    FIRECRAWL_API_KEY: 'fc-interact-test',
    FIRECRAWL_API_URL: api.url,
  });

  const result = await client.request('tools/call', {
    name: 'firecrawl_interact',
    arguments: {
      url: 'https://example.com/pricing',
      prompt: 'Click the annual toggle',
      scrapeOptions: {
        formats: ['markdown', 'json', 'query', 'screenshot'],
        jsonOptions: { prompt: 'Extract the plans' },
        queryOptions: { prompt: 'What does the Pro plan cost?' },
        screenshotOptions: { fullPage: true },
        parsers: ['pdf'],
        pdfOptions: { maxPages: 2 },
      },
    },
  });

  const payload = toolText(result);
  assert.equal(payload.scrapeId, 'scrape-1');
  assert.equal(payload.output, 'clicked');

  const scrape = api.requests.find((request) => request.url === '/v2/scrape');
  assert.deepEqual(scrape.body.formats, [
    'markdown',
    { type: 'json', prompt: 'Extract the plans' },
    { type: 'query', prompt: 'What does the Pro plan cost?', mode: 'freeform' },
    { type: 'screenshot', fullPage: true },
  ]);
  assert.deepEqual(scrape.body.parsers, [{ type: 'pdf', maxPages: 2 }]);
  for (const key of [
    'jsonOptions',
    'queryOptions',
    'screenshotOptions',
    'pdfOptions',
  ]) {
    assert.equal(key in scrape.body, false, key);
  }
});
