import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

const JOB = '00000000-0000-4000-8000-000000000050';
const MISSING = '00000000-0000-4000-8000-000000000051';
const BROKEN_PAGE = '00000000-0000-4000-8000-000000000052';
const FAILED_START = '00000000-0000-4000-8000-000000000053';
const HINT = 'Retry the crawl from the start.';

async function startFakeApi() {
  const server = createServer((req, res) => {
    const json = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    const origin = `http://${req.headers.host}`;
    if (req.url === `/v2/crawl/${MISSING}`) {
      return json(404, { success: false, error: 'Job not found' });
    }
    if (req.url === `/v2/crawl/${FAILED_START}`) {
      return json(200, {
        success: false,
        error: 'Crawl unavailable',
        agent_hints: [HINT],
      });
    }
    if (req.url === `/v2/crawl/${BROKEN_PAGE}`) {
      return json(200, {
        success: true,
        status: 'completed',
        completed: 2,
        total: 2,
        data: [{ markdown: 'one' }],
        next: `${origin}/v2/crawl/${BROKEN_PAGE}?skip=1`,
      });
    }
    if (req.url === `/v2/crawl/${BROKEN_PAGE}?skip=1`) {
      return json(200, {
        success: false,
        error: 'Page expired',
        agent_hints: [HINT],
      });
    }
    if (req.url === `/v2/crawl/${JOB}`) {
      return json(200, {
        success: true,
        status: 'completed',
        completed: 2,
        total: 2,
        data: [{ markdown: 'one' }],
        next: `${origin}/v2/crawl/${JOB}?skip=1`,
      });
    }
    if (req.url === `/v2/crawl/${JOB}?skip=1`) {
      return json(200, { success: true, data: [{ markdown: 'two' }] });
    }
    json(404, { error: `Unhandled ${req.method} ${req.url}` });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function startMcp(t, apiUrl) {
  const child = spawn(process.execPath, ['dist/index.js'], {
    env: { ...process.env, FIRECRAWL_API_KEY: 'fc-test', FIRECRAWL_API_URL: apiUrl },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  t.after(async () => {
    child.kill('SIGTERM');
    await Promise.race([new Promise((r) => child.once('exit', r)), delay(2_000)]);
  });
  child.stdout.setEncoding('utf8');
  let buffer = '';
  const pending = new Map();
  let nextId = 0;
  child.once('exit', (code, signal) => {
    const error = new Error(`MCP server exited: code=${code} signal=${signal}`);
    for (const { reject } of pending.values()) reject(error);
    pending.clear();
  });
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      const waiter = pending.get(message.id);
      if (!waiter) continue;
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result);
    }
  });
  const request = (method, params = {}) => {
    const id = ++nextId;
    child.stdin.write(`${JSON.stringify({ id, jsonrpc: '2.0', method, params })}\n`);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`timeout: ${method}`));
      }, 10_000);
      pending.set(id, {
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
      });
    });
  };
  await request('initialize', {
    capabilities: {},
    clientInfo: { name: 'crawl-status-test', version: '0.0.0' },
    protocolVersion: '2025-06-18',
  });
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  return (id) =>
    request('tools/call', { name: 'firecrawl_check_crawl_status', arguments: { id } });
}

test('firecrawl_check_crawl_status joins every page of a paginated crawl', async (t) => {
  const api = await startFakeApi();
  t.after(() => api.close());
  const check = await startMcp(t, api.url);

  const result = await check(JOB);
  assert.notEqual(result.isError, true);
  assert.deepEqual(
    result.structuredContent.data.map((doc) => doc.markdown),
    ['one', 'two']
  );
});

test('firecrawl_check_crawl_status reports the API error for an unknown crawl', async (t) => {
  const api = await startFakeApi();
  t.after(() => api.close());
  const check = await startMcp(t, api.url);

  const result = await check(MISSING);
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /Job not found/);
});

test('firecrawl_check_crawl_status fails when a result page cannot be read', async (t) => {
  const api = await startFakeApi();
  t.after(() => api.close());
  const check = await startMcp(t, api.url);

  const result = await check(BROKEN_PAGE);
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /Page expired/);
  assert.match(result.content.map((c) => c.text).join('\n'), new RegExp(HINT));
});

test('firecrawl_check_crawl_status reports a failure in the first response', async (t) => {
  const api = await startFakeApi();
  t.after(() => api.close());
  const check = await startMcp(t, api.url);

  const result = await check(FAILED_START);
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /Crawl unavailable/);
  assert.match(result.content.map((c) => c.text).join('\n'), new RegExp(HINT));
});
