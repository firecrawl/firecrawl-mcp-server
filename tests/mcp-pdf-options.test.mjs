// pdfOptions reach the API as the pdf parser's options whether or not the
// caller also lists `parsers`, from every tool that takes them.
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createFirecrawlMcpServer } from '../dist/server.js';
import {
  getFreePort,
  parseSseJson,
  spawnServer,
  startStdio,
  stopChild,
  waitForHealth,
} from './helpers/exchange-mcp.mjs';

const CAPPED = [{ type: 'pdf', maxPages: 2 }];
const PDF_URL = 'https://example.com/paper.pdf';

async function startRecordingApi(t) {
  const requests = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks);
    const contentType = req.headers['content-type'] ?? '';
    let body;
    if (contentType.includes('multipart/form-data')) {
      const form = await new Response(raw, { headers: { 'content-type': contentType } }).formData();
      body = JSON.parse(form.get('options'));
    } else if (raw.length > 0) {
      body = JSON.parse(raw.toString('utf8'));
    }
    requests.push({ url: req.url, body });
    const json = (payload) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    };
    if (req.method === 'POST' && req.url === '/v2/scrape') {
      return json({ success: true, data: { markdown: '# Paper', metadata: { scrapeId: 'job-1' } } });
    }
    if (req.method === 'POST' && req.url === '/v2/scrape/job-1/interact') {
      return json({ success: true, sessionId: 'session-1', output: 'Done.', exitCode: 0 });
    }
    if (req.method === 'POST' && req.url === '/v2/search') {
      return json({ success: true, data: { web: [] }, creditsUsed: 0, id: 'search-1' });
    }
    if (req.method === 'POST' && req.url === '/v2/crawl') {
      return json({ success: true, id: 'crawl-1' });
    }
    if (req.method === 'GET' && req.url === '/v2/crawl/crawl-1') {
      return json({ success: true, status: 'completed', completed: 1, total: 1, data: [{ markdown: '# Paper' }], next: null });
    }
    if (req.method === 'POST' && req.url === '/v2/parse/upload-url') {
      return json({
        success: true,
        data: { method: 'PUT', uploadRef: 'upload-ref', uploadUrl: 'https://uploads.invalid/upload', headers: {} },
      });
    }
    if (req.method === 'POST' && req.url === '/v2/parse') {
      return json({ success: true, data: { markdown: '# Paper', metadata: { scrapeId: 'parse-1' } } });
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: `Unhandled ${req.method} ${req.url}` }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    lastBody: (url) => requests.filter((request) => request.url === url).at(-1)?.body,
  };
}

async function httpCall(port, endpoint, name, args, headers = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${endpoint}`, {
    body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'tools/call', params: { name, arguments: args } }),
    headers: { accept: 'application/json, text/event-stream', 'content-type': 'application/json', ...headers },
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(response.status, 200);
  const message = parseSseJson(await response.text());
  assert.equal(message.error, undefined, `${name}: ${JSON.stringify(message.error)}`);
  assert.notEqual(message.result.isError, true, `${name}: ${JSON.stringify(message.result)}`);
  return message.result;
}

async function startHosted(t, api) {
  const port = await getFreePort();
  const searchPort = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    HTTP_STREAMABLE_SERVER: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_KEY: '',
    FIRECRAWL_OAUTH_TOKEN: '',
    FIRECRAWL_API_URL: api.url,
    PORT: String(port),
    FIRECRAWL_MCP_SEARCH_PORT: String(searchPort),
  });
  t.after(() => stopChild(child));
  await waitForHealth(port, child);
  await waitForHealth(searchPort, child);
  const headers = { 'x-api-key': 'fc-hosted-test' };
  return {
    full: (name, args) => httpCall(port, '/v2/mcp', name, args, headers),
    search: (name, args) => httpCall(searchPort, '/v2/mcp-search', name, args, headers),
  };
}

async function startLocal(t, api) {
  const { client } = await startStdio(t, {
    CLOUD_SERVICE: 'false',
    FIRECRAWL_API_KEY: 'fc-local-test',
    FIRECRAWL_API_URL: api.url,
  });
  return async (name, args) => {
    const result = await client.request('tools/call', { name, arguments: args });
    assert.notEqual(result.isError, true, `${name}: ${JSON.stringify(result)}`);
    return result;
  };
}

test('scrape sends pdfOptions as the pdf parser with or without parsers', async (t) => {
  const api = await startRecordingApi(t);
  const { full, search } = await startHosted(t, api);
  const local = await startLocal(t, api);

  for (const [surface, call] of [['stdio', local], ['hosted', full], ['hosted search surface', search]]) {
    for (const [args, parsers] of [
      [{ pdfOptions: { maxPages: 2 } }, CAPPED],
      [{ parsers: ['pdf'], pdfOptions: { maxPages: 2 } }, CAPPED],
      [{ parsers: [], pdfOptions: { maxPages: 2 } }, CAPPED],
      [{ parsers: [{ type: 'pdf', maxPages: 2 }] }, CAPPED],
      [{ parsers: ['pdf'] }, ['pdf']],
      [{ parsers: ['pdf'], pdfOptions: {} }, ['pdf']],
      [{ pdfOptions: {} }, undefined],
      [{}, undefined],
    ]) {
      const label = `${surface}: ${JSON.stringify(args)}`;
      await call('firecrawl_scrape', { url: PDF_URL, ...args });
      const body = api.lastBody('/v2/scrape');
      assert.equal(body.url, PDF_URL, label);
      assert.deepEqual(body.parsers, parsers, label);
      assert.equal('pdfOptions' in body, false, label);
    }
  }
});

test('nested scrapeOptions send pdfOptions as the pdf parser without parsers', async (t) => {
  const api = await startRecordingApi(t);
  const { full } = await startHosted(t, api);
  const local = await startLocal(t, api);
  const scrapeOptions = { pdfOptions: { maxPages: 2 } };

  for (const [surface, call] of [['stdio', local], ['hosted', full]]) {
    await call('firecrawl_search', { query: 'attention is all you need', scrapeOptions });
    assert.deepEqual(api.lastBody('/v2/search').scrapeOptions, { parsers: CAPPED }, `${surface} search`);

    await call('firecrawl_crawl', { url: 'https://example.com', limit: 1, scrapeOptions });
    assert.deepEqual(api.lastBody('/v2/crawl').scrapeOptions, { parsers: CAPPED }, `${surface} crawl`);

    await call('firecrawl_interact', { url: PDF_URL, prompt: 'Read the title', scrapeOptions });
    const opened = api.lastBody('/v2/scrape');
    assert.deepEqual(opened.parsers, CAPPED, `${surface} interact`);
    assert.equal('pdfOptions' in opened, false, `${surface} interact`);
  }
});

test('parse sends pdfOptions as the pdf parser without parsers', async (t) => {
  const api = await startRecordingApi(t);
  const { full } = await startHosted(t, api);
  const local = await startLocal(t, api);

  const dir = await mkdtemp(path.join(tmpdir(), 'firecrawl-mcp-parse-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const filePath = path.join(dir, 'paper.pdf');
  await writeFile(filePath, '%PDF-1.4\n');

  await local('firecrawl_parse', { filePath, pdfOptions: { maxPages: 2 } });
  const localBody = api.lastBody('/v2/parse');
  assert.deepEqual(localBody.parsers, CAPPED, 'local file');
  assert.equal('pdfOptions' in localBody, false, 'local file');

  const upload = JSON.parse(
    (await full('firecrawl_parse', { filePath: '/not-read-by-hosted-mcp/paper.pdf', pdfOptions: { maxPages: 2 } }))
      .content[0].text
  );
  assert.deepEqual(upload.nextToolCall.arguments, { uploadRef: 'upload-ref', pdfOptions: { maxPages: 2 } });
  await full('firecrawl_parse', upload.nextToolCall.arguments);
  const hostedBody = api.lastBody('/v2/parse');
  assert.equal(hostedBody.uploadRef, 'upload-ref');
  assert.deepEqual(hostedBody.parsers, CAPPED, 'hosted upload');
  assert.equal('pdfOptions' in hostedBody, false, 'hosted upload');
});

test('a session without an API key sends pdfOptions as the pdf parser too', async (t) => {
  const api = await startRecordingApi(t);
  const port = await getFreePort();
  const instance = createFirecrawlMcpServer({
    transport: 'httpStream',
    apiUrl: api.url,
    fileAccess: 'upload',
    unstable_hooks: { authenticate: async () => ({ authType: 'keyless' }) },
  });
  await instance.start({
    transportType: 'httpStream',
    httpStream: { port, host: '127.0.0.1', endpoint: '/mcp', stateless: true },
  });
  t.after(() => instance.stop());

  await httpCall(port, '/mcp', 'firecrawl_scrape', { url: PDF_URL, pdfOptions: { maxPages: 2 } });
  assert.deepEqual(api.lastBody('/v2/scrape').parsers, CAPPED);

  await httpCall(port, '/mcp', 'firecrawl_parse', { uploadRef: 'upload-ref', pdfOptions: { maxPages: 2 } });
  assert.deepEqual(api.lastBody('/v2/parse').parsers, CAPPED);
});
