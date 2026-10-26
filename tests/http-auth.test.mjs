// Authentication and request validation on the HTTP transports and stdio:
// both HTTP endpoints answer an authentication failure with 401, the Host
// header is checked before credentials, IPv6 hosts work, WWW-Authenticate
// stays a valid single-line header, and stdio refuses to start when
// authentication fails.
import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createFirecrawlMcpServer } from '../dist/server.js';
import { getFreePort } from './helpers/exchange-mcp.mjs';

const ENDPOINT = '/mcp';
const RESOURCE = 'https://mcp.example.test';
const INITIALIZE = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'http-auth', version: '1.0.0' },
  },
});
const STREAM_HEADERS = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
};

function authenticate(calls = []) {
  return async (request) => {
    calls.push(request?.headers?.host);
    const mode = request?.headers['x-test-auth'];
    if (mode === 'throw') throw new Error('Firecrawl credentials required');
    if (mode === 'throw-multiline') throw new Error('first line\r\nsecond "line" \u00e9\\');
    if (mode === 'rejected') return { authenticated: false, error: 'Token revoked' };
    return { authType: 'api-key', firecrawlApiKey: 'fc-test' };
  };
}

async function start(t, { host = '127.0.0.1', calls } = {}) {
  const port = await getFreePort();
  const instance = createFirecrawlMcpServer({
    transport: 'httpStream',
    apiKey: 'fc-test',
    unstable_hooks: {
      authenticate: authenticate(calls),
      oauth: {
        protectedResource: { resource: RESOURCE, authorizationServers: [RESOURCE] },
      },
    },
  });
  await instance.start({
    transportType: 'httpStream',
    httpStream: { port, host, endpoint: ENDPOINT, stateless: true },
  });
  t.after(() => instance.stop());
  return port;
}

function send(port, method, path, headers = {}, body, connectHost = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { host: connectHost, port, method, path, headers, setHost: !('host' in headers) },
      (response) => {
        let text = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => (text += chunk));
        response.on('end', () =>
          resolve({ status: response.statusCode, headers: response.headers, body: text })
        );
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
        let text = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => (text += chunk));
        response.on('end', () =>
          resolve({ status: response.statusCode, headers: response.headers, body: text })
        );
        if (response.statusCode === 200) {
          resolve({ status: 200, headers: response.headers, body: '' });
          request.destroy();
        }
      }
    );
    request.on('error', reject);
    request.end();
  });
}

test('/sse answers an authentication error with 401, like the stream endpoint', async (t) => {
  const port = await start(t);
  for (const mode of ['throw', 'rejected']) {
    const stream = await send(port, 'POST', ENDPOINT, { ...STREAM_HEADERS, 'x-test-auth': mode }, INITIALIZE);
    const sse = await openSse(port, { 'x-test-auth': mode });
    assert.equal(stream.status, 401, mode);
    assert.equal(sse.status, 401, mode);
    const message = mode === 'throw' ? 'Firecrawl credentials required' : 'Token revoked';
    assert.deepEqual(JSON.parse(sse.body), { error: { code: -32000, message }, id: null, jsonrpc: '2.0' });
    assert.equal(sse.headers['content-type'], 'application/json');
    assert.equal(sse.headers['www-authenticate'], stream.headers['www-authenticate']);
    assert.match(sse.headers['www-authenticate'], /^Bearer resource_metadata="https:\/\/mcp\.example\.test\/\.well-known\/oauth-protected-resource", error="invalid_token"/);
  }
  const ok = await openSse(port);
  assert.equal(ok.status, 200);
});

test('WWW-Authenticate stays one valid header line for any error message', async (t) => {
  const port = await start(t);
  const headers = { 'x-test-auth': 'throw-multiline' };
  const stream = await send(port, 'POST', ENDPOINT, { ...STREAM_HEADERS, ...headers }, INITIALIZE);
  const sse = await openSse(port, headers);
  for (const response of [stream, sse]) {
    assert.equal(response.status, 401);
    assert.equal(
      response.headers['www-authenticate'],
      `Bearer resource_metadata="${RESOURCE}/.well-known/oauth-protected-resource", error="invalid_token", error_description="first line second \\"line\\"  \\\\"`
    );
    assert.equal(JSON.parse(response.body).error.message, 'first line\r\nsecond "line" \u00e9\\');
  }
});

test('the Host header is validated before credentials are checked', async (t) => {
  const calls = [];
  const port = await start(t, { calls });
  for (const host of ['a^b', 'a@b', 'a/b', 'example.com:80:80', '[::1', '']) {
    const response = await send(
      port,
      'POST',
      ENDPOINT,
      { ...STREAM_HEADERS, host, 'x-test-auth': 'rejected' },
      INITIALIZE
    );
    assert.equal(response.status, 400, JSON.stringify(host));
    assert.equal(response.body, '');
  }
  assert.deepEqual(calls, []);
});

test('IPv6 and mixed-case Host headers are accepted', async (t) => {
  const port = await start(t);
  for (const host of [
    `[::1]:${port}`,
    '[::1]',
    `[0:0:0:0:0:0:0:1]:${port}`,
    '[2001:DB8::1]:443',
    'EXAMPLE.COM:8080',
    'Example.com',
    `127.0.0.1:${port}`,
  ]) {
    const response = await send(port, 'POST', ENDPOINT, { ...STREAM_HEADERS, host }, INITIALIZE);
    assert.equal(response.status, 200, host);
  }
});

test('a server bound to an IPv6 address serves its HTTP routes', async (t) => {
  const port = await start(t, { host: '::' });
  const health = await send(port, 'GET', '/health', {}, undefined, '::1');
  assert.equal(health.status, 200);
  assert.equal(health.body, 'ok');
  const metadata = await send(port, 'GET', '/.well-known/oauth-protected-resource', {}, undefined, '::1');
  assert.equal(metadata.status, 200);
  assert.equal(JSON.parse(metadata.body).resource, RESOURCE);
  const initialize = await send(port, 'POST', ENDPOINT, STREAM_HEADERS, INITIALIZE, '::1');
  assert.equal(initialize.status, 200);
});

test('authentication errors are logged through the server logger', async (t) => {
  const port = await start(t);
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args);
  t.after(() => {
    console.error = original;
  });
  await send(port, 'POST', ENDPOINT, { ...STREAM_HEADERS, 'x-test-auth': 'throw' }, INITIALIZE);
  await openSse(port, { 'x-test-auth': 'throw' });
  console.error = original;
  const authLogs = logged.filter((args) => args.includes('[FastMCP error] Authentication error:'));
  assert.equal(authLogs.length, 2);
  for (const args of authLogs) assert.equal(args[0], '[ERROR]');
});

test('stdio refuses to start when authentication fails', async () => {
  for (const [hook, message] of [
    [async () => { throw new Error('Invalid API key'); }, 'Invalid API key'],
    [async () => ({ authenticated: false, error: 'Token revoked' }), 'Token revoked'],
    [async () => undefined, 'Authentication failed'],
  ]) {
    const instance = createFirecrawlMcpServer({
      transport: 'stdio',
      unstable_hooks: { authenticate: hook },
    });
    await assert.rejects(instance.start({ transportType: 'stdio' }), {
      message: `Authentication failed for stdio transport: ${message}`,
    });
  }
});
