import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { callExpectingError, startStdio } from './helpers/exchange-mcp.mjs';

const CRAWL_ID = 'crawl-zdr';
const THREAD_ID = '00000000-0000-4000-8000-000000000031';

async function startApi(t) {
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = '';
    req.setEncoding('utf8');
    for await (const chunk of req) body += chunk;
    requests.push({ method: req.method, url: req.url, body: body ? JSON.parse(body) : undefined });
    const json = (payload) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    };
    if (req.method === 'POST' && req.url === '/v2/crawl') return json({ success: true, id: CRAWL_ID });
    if (req.method === 'GET' && req.url === `/v2/crawl/${CRAWL_ID}`) {
      return json({ success: true, status: 'completed', completed: 1, total: 1, data: [{ markdown: 'page' }], next: null });
    }
    if (req.method === 'POST' && req.url === '/v2/agent') {
      return json({ success: true, id: '00000000-0000-4000-8000-000000000030', threadId: THREAD_ID, threadTurn: 1 });
    }
    if (req.method === 'POST' && req.url === '/v2/search') return json({ success: true, data: { web: [] } });
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: `Unhandled ${req.method} ${req.url}` }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { client } = await startStdio(t, {
    CLOUD_SERVICE: 'false',
    FIRECRAWL_API_KEY: 'fc-test',
    FIRECRAWL_API_URL: `http://127.0.0.1:${server.address().port}`,
  });
  const sent = (path) => requests.filter((request) => request.method === 'POST' && request.url === path);
  return { client, sent };
}

test('crawl and agent list zeroDataRetention at the top level and search and crawl no longer nest it', async (t) => {
  const { client } = await startApi(t);
  const { tools } = await client.request('tools/list');
  const input = Object.fromEntries(tools.map((tool) => [tool.name, tool.inputSchema]));

  assert.equal(input.firecrawl_crawl.properties.zeroDataRetention.type, 'boolean');
  assert.equal(input.firecrawl_agent.properties.zeroDataRetention.type, 'boolean');
  assert.equal(input.firecrawl_scrape.properties.zeroDataRetention.type, 'boolean');
  for (const name of ['firecrawl_crawl', 'firecrawl_search']) {
    const scrapeOptions = input[name].properties.scrapeOptions.properties;
    assert.ok(scrapeOptions.formats, `${name} scrapeOptions lost its other fields`);
    assert.equal('zeroDataRetention' in scrapeOptions, false, `${name} still nests zeroDataRetention`);
  }
  assert.equal('zeroDataRetention' in input.firecrawl_search.properties, false);
});

test('firecrawl_crawl sends zeroDataRetention at the top level of /v2/crawl', async (t) => {
  const { client, sent } = await startApi(t);
  const result = await client.request('tools/call', {
    name: 'firecrawl_crawl',
    arguments: { url: 'https://example.com', zeroDataRetention: true, scrapeOptions: { formats: ['markdown'] } },
  });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  const [crawl] = sent('/v2/crawl');
  assert.equal(crawl.body.zeroDataRetention, true);
  assert.deepEqual(crawl.body.scrapeOptions, { formats: ['markdown'] });

  await client.request('tools/call', { name: 'firecrawl_crawl', arguments: { url: 'https://example.com' } });
  assert.equal('zeroDataRetention' in sent('/v2/crawl').at(-1).body, false);
});

test('firecrawl_agent sends zeroDataRetention at the top level of /v2/agent', async (t) => {
  const { client, sent } = await startApi(t);
  for (const zeroDataRetention of [true, false]) {
    const result = await client.request('tools/call', {
      name: 'firecrawl_agent',
      arguments: { prompt: 'Find the example domain owner', zeroDataRetention },
    });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    assert.equal(sent('/v2/agent').at(-1).body.zeroDataRetention, zeroDataRetention);
  }

  await client.request('tools/call', {
    name: 'firecrawl_agent',
    arguments: { prompt: 'Find the example domain owner' },
  });
  assert.equal('zeroDataRetention' in sent('/v2/agent').at(-1).body, false);
});

test('firecrawl_agent refuses zeroDataRetention on a thread follow-up before calling the API', async (t) => {
  const { client, sent } = await startApi(t);
  const result = await callExpectingError(client, {
    name: 'firecrawl_agent',
    arguments: { prompt: 'Continue', threadId: THREAD_ID, zeroDataRetention: true },
  });
  assert.match(result.transportError?.message ?? result.content[0].text, /remove threadId/);
  assert.equal(sent('/v2/agent').length, 0);
});

test('a nested scrapeOptions.zeroDataRetention is refused with the supported alternative', async (t) => {
  const { client, sent } = await startApi(t);
  for (const [name, args, path, alternative] of [
    ['firecrawl_crawl', { url: 'https://example.com' }, '/v2/crawl', /top level of firecrawl_crawl/],
    ['firecrawl_search', { query: 'example' }, '/v2/search', /enterprise: \["zdr"\]/],
  ]) {
    const result = await callExpectingError(client, {
      name,
      arguments: { ...args, scrapeOptions: { formats: ['markdown'], zeroDataRetention: true } },
    });
    assert.match(result.content[0].text, /scrapeOptions\.zeroDataRetention is not supported/);
    assert.match(result.content[0].text, alternative);
    assert.equal(sent(path).length, 0, `${name} reached the API`);
  }
});
