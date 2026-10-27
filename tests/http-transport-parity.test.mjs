// HTTP transport edge cases kept from before the move to the official SDK:
// malformed Host headers, authentication results that reject the request, and
// the legacy HTTP+SSE message endpoint. A rejected /sse request now answers
// 401 like the stream endpoint (see http-auth.test.mjs).
import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createFirecrawlMcpServer } from '../dist/server.js';
import { getFreePort } from './helpers/exchange-mcp.mjs';

const ENDPOINT = '/mcp';
const INITIALIZE = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'http-transport-parity', version: '1.0.0' },
  },
});
const STREAM_HEADERS = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
};

async function start(t) {
  const port = await getFreePort();
  const instance = createFirecrawlMcpServer({
    transport: 'httpStream',
    apiKey: 'fc-test',
    unstable_hooks: {
      authenticate: async (request) => {
        const mode = request?.headers['x-test-auth'];
        if (mode === 'rejected') return { authenticated: false, error: 'Token revoked' };
        if (mode === 'rejected-silently') return { authenticated: false };
        return { authType: 'api-key', firecrawlApiKey: 'fc-test' };
      },
    },
  });
  await instance.start({
    transportType: 'httpStream',
    httpStream: { port, host: '127.0.0.1', endpoint: ENDPOINT, stateless: true },
  });
  t.after(() => instance.stop());
  return port;
}

function send(port, method, path, headers = {}, body) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { host: '127.0.0.1', port, method, path, headers, setHost: !('host' in headers) },
      (response) => {
        let text = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => (text += chunk));
        response.on('end', () => resolve({ status: response.statusCode, body: text }));
      }
    );
    request.on('error', reject);
    request.end(body);
  });
}

function openSse(port, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { host: '127.0.0.1', port, method: 'GET', path: '/sse', headers },
      (response) => {
        const events = [];
        let buffer = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          buffer += chunk;
          let end;
          while ((end = buffer.indexOf('\n\n')) !== -1) {
            events.push(buffer.slice(0, end));
            buffer = buffer.slice(end + 2);
          }
        });
        resolve({ status: response.statusCode, events, close: () => request.destroy() });
      }
    );
    request.on('error', reject);
    request.end();
  });
}

async function waitFor(predicate, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

test('a malformed Host header is answered with 400 and the server keeps serving', async (t) => {
  const port = await start(t);
  const malformed = await send(port, 'POST', ENDPOINT, { ...STREAM_HEADERS, host: 'a^b' }, INITIALIZE);
  assert.equal(malformed.status, 400);
  assert.equal(malformed.body, '');
  const health = await send(port, 'GET', '/health');
  assert.equal(health.status, 200);
  const initialize = await send(port, 'POST', ENDPOINT, STREAM_HEADERS, INITIALIZE);
  assert.equal(initialize.status, 200);
});

test('an authentication result with authenticated: false is rejected', async (t) => {
  const port = await start(t);
  const rejected = await send(
    port,
    'POST',
    ENDPOINT,
    { ...STREAM_HEADERS, 'x-test-auth': 'rejected' },
    INITIALIZE
  );
  assert.equal(rejected.status, 401);
  assert.deepEqual(JSON.parse(rejected.body), {
    error: { code: -32000, message: 'Token revoked' },
    id: 1,
    jsonrpc: '2.0',
  });
  const silent = await send(
    port,
    'POST',
    ENDPOINT,
    { ...STREAM_HEADERS, 'x-test-auth': 'rejected-silently' },
    INITIALIZE
  );
  assert.equal(silent.status, 401);
  assert.equal(JSON.parse(silent.body).error.message, 'Unauthorized: Authentication failed');
  const sse = await openSse(port, { 'x-test-auth': 'rejected' });
  sse.close();
  assert.equal(sse.status, 401);
});

test('legacy SSE: invalid JSON-RPC messages are refused and no pings are sent', async (t) => {
  const port = await start(t);
  const sse = await openSse(port);
  t.after(() => sse.close());
  await waitFor(() => sse.events.length > 0);
  const endpoint = sse.events[0].split('data: ')[1];
  const post = (body) => send(port, 'POST', endpoint, { 'content-type': 'application/json' }, body);

  for (const body of ['{"jsonrpc":"2.0"}', '{"jsonrpc":"2.0","id":9}', '[{"jsonrpc":"2.0","id":3,"method":"ping"}]', '{nope']) {
    const response = await post(body);
    assert.equal(response.status, 400, body);
    assert.equal(response.body, `Invalid message: ${body}`);
  }

  assert.equal((await post(INITIALIZE)).status, 202);
  assert.equal((await post('{"jsonrpc":"2.0","method":"notifications/initialized"}')).status, 202);
  await waitFor(() => sse.events.some((event) => event.includes('"protocolVersion"')));
  await new Promise((resolve) => setTimeout(resolve, 6_000));
  assert.ok(!sse.events.some((event) => event.includes('"method":"ping"')), 'no ping requests on the stream');
});
