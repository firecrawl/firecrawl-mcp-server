import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { integrationFrom, withIntegration } from '../dist/integration.js';
import { startStdio } from './helpers/exchange-mcp.mjs';

test('the tag is the trimmed env value, and blank reads as unset', () => {
  assert.equal(integrationFrom(' _zed '), '_zed');
  assert.equal(integrationFrom(''), undefined);
  assert.equal(integrationFrom('   '), undefined);
  assert.equal(integrationFrom(undefined), undefined);
});

test('endpoints that accept the field get the tag, whatever the base URL or query', () => {
  for (const url of [
    '/v2/scrape',
    '/v2/batch/scrape',
    '/v2/crawl',
    '/v2/map',
    '/v2/search',
    '/v2/extract',
    '/v2/agent',
    '/v2/parse',
    '/v2/feedback',
    '/v2/scrape/job-1/interact',
    '/v2/search/job-1/feedback',
    'https://api.firecrawl.dev/v2/scrape?x=1',
    'http://127.0.0.1:3002/v2/map/',
  ]) {
    assert.deepEqual(
      withIntegration(url, { url: 'https://example.com' }, '_zed'),
      { url: 'https://example.com', integration: '_zed' },
      url
    );
  }
});

test('endpoints that reject unknown keys, unset tags and bodies that name one are left alone', () => {
  const body = { url: 'https://example.com' };
  for (const url of [
    '/v2/monitor',
    '/v2/crawl/params-preview',
    '/v2/parse/upload-url',
    '/v2/scrape/job-1',
    '/v1/scrape',
  ]) {
    assert.equal(withIntegration(url, body, '_zed'), body, url);
  }
  assert.equal(withIntegration('/v2/scrape', body, undefined), body);
  const named = { url: 'https://example.com', integration: '_other' };
  assert.equal(withIntegration('/v2/scrape', named, '_zed'), named);
});

async function startFakeApi(t) {
  const requests = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    req.setEncoding('utf8');
    for await (const chunk of req) raw += chunk;
    requests.push({ method: req.method, url: req.url, body: raw ? JSON.parse(raw) : undefined });
    res.writeHead(200, { 'content-type': 'application/json' });
    if (req.url?.startsWith('/v2/map')) {
      res.end(JSON.stringify({ success: true, links: [{ url: 'https://example.com/a' }] }));
      return;
    }
    if (req.url?.startsWith('/v2/scrape')) {
      res.end(JSON.stringify({ success: true, data: { markdown: '# Example' } }));
      return;
    }
    res.end(JSON.stringify({ success: true, data: [] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { url: `http://127.0.0.1:${server.address().port}`, requests };
}

async function callTools(t, env) {
  const api = await startFakeApi(t);
  const { client } = await startStdio(t, {
    CLOUD_SERVICE: 'false',
    FIRECRAWL_API_KEY: 'fc-integration-test',
    FIRECRAWL_API_URL: api.url,
    ...env,
  });
  for (const [name, args] of [
    ['firecrawl_scrape', { url: 'https://example.com', formats: ['markdown'] }],
    ['firecrawl_map', { url: 'https://example.com' }],
  ]) {
    const result = await client.request('tools/call', { name, arguments: args });
    assert.notEqual(result.isError, true, JSON.stringify(result));
  }
  const posts = api.requests.filter((request) => request.method === 'POST');
  assert.deepEqual(
    posts.map((request) => request.url.split('?')[0]),
    ['/v2/scrape', '/v2/map']
  );
  return posts;
}

test('FIRECRAWL_INTEGRATION tags the requests a stdio server sends', async (t) => {
  const posts = await callTools(t, { FIRECRAWL_INTEGRATION: '_zed' });
  for (const request of posts) {
    assert.equal(request.body.integration, '_zed', request.url);
    assert.match(request.body.origin, /^mcp-/, request.url);
  }
});

test('without FIRECRAWL_INTEGRATION no integration field is sent', async (t) => {
  const posts = await callTools(t, { FIRECRAWL_INTEGRATION: '' });
  for (const request of posts) {
    assert.equal('integration' in request.body, false, request.url);
  }
});
