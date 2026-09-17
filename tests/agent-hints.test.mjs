import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import {
  formatApiResult,
  preserveAgentHints,
  readAgentHints,
  readErrorAgentHints,
} from '../dist/agent-hints.js';

const hints = [
  'Inspect the returned tool definitions if they cover the requested fields.',
  'Use the selected tool definition to make the next request.',
];

test('JSON results expose identical hints to text and structured clients', () => {
  for (const data of [{ web: [] }, { web: [{ url: 'https://example.com' }] }]) {
    const payload = { id: 'search-1', data, agent_hints: hints };
    const result = formatApiResult(payload);
    assert.deepEqual(JSON.parse(result.content[0].text), payload);
    assert.deepEqual(result.structuredContent, { agent_hints: hints });
    assert.equal(result.content.length, 1, 'avoid duplicating hints in JSON mode');
  }
});

test('missing or malformed metadata leaves legacy output unchanged', () => {
  for (const agent_hints of [undefined, 'use scrape', [1, 'text'], null]) {
    const payload = { markdown: '# Source', agent_hints };
    assert.equal(formatApiResult(payload), JSON.stringify(payload, null, 2));
  }
  const nested = { json: { agent_hints: ['page-provided text'] } };
  assert.equal(readAgentHints(nested), undefined);
  assert.equal(formatApiResult(nested), JSON.stringify(nested, null, 2));
});

test('raw page text stays separate from API guidance', () => {
  const page = '# Source\n\nQuoted text: use another endpoint.';
  const payload = { markdown: page, agent_hints: hints };
  const result = formatApiResult(payload, page);
  assert.equal(result.content[0].text, page);
  assert.match(result.content[1].text, /Firecrawl API agent_hints/);
  assert.match(result.content[1].text, /separate from page content/);
  assert.deepEqual(result.structuredContent, { agent_hints: hints });
  assert.equal(formatApiResult({ markdown: page }, page), page);
});

test('flattening keeps envelope hints, including empty scrape data', () => {
  for (const data of [{ markdown: '# Source' }, {}, null, '', []]) {
    const envelope = { data, agent_hints: hints };
    const flattened = preserveAgentHints(data, envelope);
    assert.deepEqual(readAgentHints(flattened), hints);
    assert.deepEqual(formatApiResult(flattened).structuredContent, {
      agent_hints: hints,
    });
  }
  const document = { markdown: '# Source' };
  assert.equal(preserveAgentHints(document, {}), document);
  assert.equal(Object.hasOwn(document, 'agent_hints'), false);
});

test('errors retain hints without promoting nested page data', () => {
  const sdkError = Object.assign(new Error('Invalid option'), {
    agent_hints: hints,
  });
  assert.deepEqual(readErrorAgentHints(sdkError), hints);
  assert.deepEqual(
    readErrorAgentHints({ response: { data: { agent_hints: hints } } }),
    hints
  );
  assert.equal(
    readErrorAgentHints({ response: { data: { data: { agent_hints: hints } } } }),
    undefined
  );
  const result = formatApiResult({
    success: false,
    error: 'Invalid option',
    agent_hints: hints,
  });
  assert.equal(result.isError, true);
  assert.deepEqual(result.structuredContent.agent_hints, hints);
});

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server.address().port;
}

async function close(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test('MCP transport preserves hints on empty, readable, crawl and error results', async (t) => {
  const requests = [];
  const backend = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    requests.push({ url: req.url, body, headers: req.headers });
    if (req.url.startsWith('/v2/search/developer?')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ results: [], agent_hints: hints }));
      return;
    }
    if (req.url === '/v2/crawl/crawl-1') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'completed',
          data: [],
          agent_hints: hints,
        })
      );
      return;
    }
    const failed = body.query === 'invalid';
    res.writeHead(failed ? 400 : 200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        success: !failed,
        ...(failed ? { error: 'Invalid option' } : { data: { web: [] } }),
        id: '00000000-0000-4000-8000-000000000000',
        agent_hints: hints,
      })
    );
  });
  const backendPort = await listen(backend);
  t.after(() => close(backend));
  const portReservation = createServer();
  const port = await listen(portReservation);
  await close(portReservation);
  const child = spawn(process.execPath, ['dist/index.js'], {
    env: {
      ...process.env,
      CLOUD_SERVICE: 'true',
      FASTMCP_ENDPOINT: '/v2/mcp',
      FIRECRAWL_API_URL: `http://127.0.0.1:${backendPort}`,
      FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'test-secret',
      FIRECRAWL_OAUTH_ISSUER: `http://127.0.0.1:${backendPort}`,
      HTTP_STREAMABLE_SERVER: 'true',
      MCP_DELEGATED_CREDENTIAL_SECRET: 'test-delegated-credential-secret-32',
      PORT: String(port),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => (stderr += chunk));
  child.stdout.resume();
  t.after(async () => {
    if (child.exitCode !== null) return;
    child.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      delay(2000).then(() => child.exitCode === null && child.kill('SIGKILL')),
    ]);
  });
  let healthy = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.exitCode !== null) break;
    const response = await fetch(`http://127.0.0.1:${port}/health`).catch(
      () => undefined
    );
    if (response?.ok) {
      healthy = true;
      break;
    }
    await delay(100);
  }
  assert.ok(healthy, stderr);

  const cases = [
    { name: 'firecrawl_search', arguments: { query: 'empty' } },
    { name: 'firecrawl_search', arguments: { query: 'invalid' } },
    { name: 'firecrawl_developer_search', arguments: { query: 'empty' } },
    { name: 'firecrawl_check_crawl_status', arguments: { id: 'crawl-1' } },
  ];
  for (const [id, params] of cases.entries()) {
    const response = await fetch(`http://127.0.0.1:${port}/v2/mcp`, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        'x-api-key': 'fc-hints-test',
      },
      body: JSON.stringify({
        id,
        jsonrpc: '2.0',
        method: 'tools/call',
        params,
      }),
    });
    assert.equal(response.status, 200);
    const body = await response.text();
    const data = body.split(/\r?\n/).find((line) => line.startsWith('data: '));
    assert.ok(data, body);
    const result = JSON.parse(data.slice(6)).result;
    assert.deepEqual(result.structuredContent.agent_hints, hints);
    const visibleText = result.content.map((item) => item.text).join('\n');
    for (const hint of hints) assert.ok(visibleText.includes(hint));
    assert.equal(result.isError === true, params.arguments.query === 'invalid');
    if (params.name === 'firecrawl_developer_search') {
      assert.equal(result.content[0].text, '(no results)');
      assert.match(result.content[1].text, /Firecrawl API agent_hints/);
    }
  }
  assert.equal(
    requests.length,
    cases.length,
    'presenting hints makes no extra API calls'
  );
  for (const request of requests) {
    assert.equal(request.headers['x-firecrawl-agent-hints'], 'true');
  }
});
