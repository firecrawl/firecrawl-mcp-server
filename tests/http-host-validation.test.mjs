// Host and Origin validation on the HTTP transports: with `allowedHosts` set,
// a request naming another host in `Host` or `Origin` gets 403 and CORS
// headers echo only allowed origins. The command line sets the list in local
// HTTP mode (loopback plus FIRECRAWL_MCP_ALLOWED_HOSTS) and leaves it unset
// with CLOUD_SERVICE=true. Embedders that don't pass the option are unchanged.
import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createFirecrawlMcpServer } from '../dist/server.js';
import { getFreePort, spawnServer, stopChild, waitForHealth } from './helpers/exchange-mcp.mjs';

const LOOPBACK = ['localhost', '127.0.0.1', '[::1]'];
const INITIALIZE = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'http-host-validation', version: '1.0.0' },
  },
});
const STREAM_HEADERS = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
};

async function start(t, allowedHosts, endpoint = '/mcp') {
  const port = await getFreePort();
  const instance = createFirecrawlMcpServer({ transport: 'httpStream', apiKey: 'fc-test' });
  await instance.start({
    transportType: 'httpStream',
    httpStream: { port, host: '127.0.0.1', endpoint, stateless: true, allowedHosts },
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
        response.on('end', () =>
          resolve({ status: response.statusCode, headers: response.headers, body: text })
        );
      }
    );
    request.on('error', reject);
    request.end(body);
  });
}

const initialize = (port, headers = {}) =>
  send(port, 'POST', '/mcp', { ...STREAM_HEADERS, ...headers }, INITIALIZE);

function assertForbidden(response, message) {
  assert.equal(response.status, 403);
  assert.equal(response.headers['access-control-allow-origin'], undefined);
  assert.deepEqual(JSON.parse(response.body), {
    error: { code: -32000, message },
    id: null,
    jsonrpc: '2.0',
  });
}

test('a rebinding-style request whose Host names another site is rejected', async (t) => {
  const port = await start(t, LOOPBACK);
  assertForbidden(
    await initialize(port, { host: `evil.com:${port}` }),
    `Forbidden: Host "evil.com:${port}" is not allowed`
  );
  assertForbidden(await initialize(port, { host: 'evil.com' }), 'Forbidden: Host "evil.com" is not allowed');
  assertForbidden(
    await send(port, 'GET', '/ready', { host: `evil.com:${port}` }),
    `Forbidden: Host "evil.com:${port}" is not allowed`
  );
  assertForbidden(
    await send(port, 'POST', '/health', { host: `evil.com:${port}` }),
    `Forbidden: Host "evil.com:${port}" is not allowed`
  );
  assertForbidden(
    await send(port, 'GET', '/sse', { host: 'localhost.evil.com' }),
    'Forbidden: Host "localhost.evil.com" is not allowed'
  );
});

test('/health answers any host, without a CORS allow for other origins', async (t) => {
  const port = await start(t, LOOPBACK);
  for (const method of ['GET', 'HEAD']) {
    const response = await send(port, method, '/health', {
      host: `10.1.2.3:${port}`,
      origin: 'https://evil.com',
    });
    assert.equal(response.status, 200, method);
    assert.equal(response.headers['access-control-allow-origin'], undefined, method);
  }
  const query = await send(port, 'GET', '/health?probe=1', { host: 'evil.com' });
  assert.equal(query.status, 200);
});

test('the health exception never covers an MCP endpoint served at the health path', async (t) => {
  const port = await start(t, LOOPBACK, '/health');
  assertForbidden(
    await send(port, 'GET', '/health', { host: 'evil.com', 'mcp-session-id': 'abc' }),
    'Forbidden: Host "evil.com" is not allowed'
  );
});

test('a rejected request logs a hint naming FIRECRAWL_MCP_ALLOWED_HOSTS', async (t) => {
  const port = await start(t, LOOPBACK);
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  t.after(() => (console.warn = original));
  await initialize(port, { host: 'mcp.lan' });
  await initialize(port, { host: 'localhost', origin: 'https://evil.com' });
  console.warn = original;
  assert.equal(warnings.length, 2, warnings.join('\n'));
  assert.match(warnings[0], /Forbidden: Host "mcp\.lan" is not allowed; to allow it, add its host name to FIRECRAWL_MCP_ALLOWED_HOSTS/);
  assert.match(warnings[1], /Forbidden: Origin "https:\/\/evil\.com" is not allowed; to allow it, add its host name to FIRECRAWL_MCP_ALLOWED_HOSTS/);
  for (const warning of warnings) assert.doesNotMatch(warning, /\n/);
});

test('loopback hosts are served in every port form', async (t) => {
  const port = await start(t, LOOPBACK);
  for (const host of [
    `localhost:${port}`,
    'localhost',
    'LOCALHOST',
    `127.0.0.1:${port}`,
    '127.0.0.1',
    `[::1]:${port}`,
    '[::1]',
    `[0:0:0:0:0:0:0:1]:${port}`,
  ]) {
    const response = await initialize(port, { host });
    assert.equal(response.status, 200, host);
    assert.match(response.body, /"protocolVersion"/, host);
  }
});

test('an Origin of another site gets no CORS allow', async (t) => {
  const port = await start(t, LOOPBACK);
  assertForbidden(
    await initialize(port, { host: `localhost:${port}`, origin: 'https://evil.com' }),
    'Forbidden: Origin "https://evil.com" is not allowed'
  );
  assertForbidden(
    await send(port, 'OPTIONS', '/mcp', {
      host: `localhost:${port}`,
      origin: 'https://evil.com',
      'access-control-request-method': 'POST',
    }),
    'Forbidden: Origin "https://evil.com" is not allowed'
  );
  assertForbidden(
    await initialize(port, { host: `localhost:${port}`, origin: 'null' }),
    'Forbidden: Origin "null" is not allowed'
  );
});

test('an allowed Origin is echoed instead of a wildcard', async (t) => {
  const port = await start(t, LOOPBACK);
  const preflight = await send(port, 'OPTIONS', '/mcp', {
    host: `localhost:${port}`,
    origin: 'http://localhost:6274',
    'access-control-request-method': 'POST',
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers['access-control-allow-origin'], 'http://localhost:6274');
  assert.equal(preflight.headers.vary, 'Origin');
  const response = await initialize(port, {
    host: `127.0.0.1:${port}`,
    origin: 'http://127.0.0.1:6274',
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers['access-control-allow-origin'], 'http://127.0.0.1:6274');
});

test('allowedHosts entries may be host names, host:port pairs, IPv6 literals or URLs', async (t) => {
  const port = await start(t, ['mcp.internal:8080', '::1', 'https://app.example.com/path', ' 10.0.0.5 ']);
  for (const host of [`mcp.internal:${port}`, '[::1]', '10.0.0.5']) {
    assert.equal((await initialize(port, { host })).status, 200, host);
  }
  const response = await initialize(port, { host: 'mcp.internal', origin: 'https://app.example.com' });
  assert.equal(response.status, 200);
  assert.equal(response.headers['access-control-allow-origin'], 'https://app.example.com');
  assert.equal((await initialize(port, { host: `localhost:${port}` })).status, 403);
});

test("allowedHosts ['*'] turns the check off", async (t) => {
  const port = await start(t, ['*']);
  const response = await initialize(port, { host: 'evil.com', origin: 'https://evil.com' });
  assert.equal(response.status, 200);
  assert.equal(response.headers['access-control-allow-origin'], '*');
});

test('without allowedHosts every host and origin is served as before', async (t) => {
  const port = await start(t, undefined);
  const response = await initialize(port, { host: 'evil.com', origin: 'https://evil.com' });
  assert.equal(response.status, 200);
  assert.equal(response.headers['access-control-allow-origin'], '*');
  assert.equal(response.headers.vary, undefined);
});

const CLI_ENV = {
  CLOUD_SERVICE: '',
  FIRECRAWL_API_KEY: 'fc-test',
  FIRECRAWL_API_URL: '',
  FIRECRAWL_MCP_ALLOWED_HOSTS: '',
  FASTMCP_ENDPOINT: '',
  FIRECRAWL_MCP_SEARCH_ENABLED: 'false',
  HOST: '127.0.0.1',
  HTTP_STREAMABLE_SERVER: 'true',
  SSE_LOCAL: '',
};

async function startCli(t, env = {}) {
  const port = await getFreePort();
  const child = spawnServer({ ...CLI_ENV, PORT: String(port), ...env });
  t.after(() => stopChild(child));
  await waitForHealth(port, child);
  return port;
}

test('the command line checks Host and Origin in local HTTP mode', async (t) => {
  const port = await startCli(t);
  assertForbidden(
    await initialize(port, { host: `evil.com:${port}` }),
    `Forbidden: Host "evil.com:${port}" is not allowed`
  );
  assertForbidden(
    await initialize(port, { host: `localhost:${port}`, origin: 'https://evil.com' }),
    'Forbidden: Origin "https://evil.com" is not allowed'
  );
  const response = await initialize(port, { host: `localhost:${port}`, origin: 'http://localhost:6274' });
  assert.equal(response.status, 200);
  assert.equal(response.headers['access-control-allow-origin'], 'http://localhost:6274');
});

test('FIRECRAWL_MCP_ALLOWED_HOSTS adds hosts to the local list', async (t) => {
  const port = await startCli(t, { FIRECRAWL_MCP_ALLOWED_HOSTS: 'mcp.lan, 192.168.1.20' });
  assert.equal((await initialize(port, { host: `mcp.lan:${port}` })).status, 200);
  assert.equal((await initialize(port, { host: '192.168.1.20' })).status, 200);
  assert.equal((await initialize(port, { host: `localhost:${port}` })).status, 200);
  assert.equal((await initialize(port, { host: 'evil.com' })).status, 403);
});

test('CLOUD_SERVICE=true keeps answering any host with a wildcard CORS header', async (t) => {
  const port = await startCli(t, { CLOUD_SERVICE: 'true', HTTP_STREAMABLE_SERVER: '' });
  const response = await send(port, 'GET', '/health', { host: 'mcp.example.com', origin: 'https://evil.com' });
  assert.equal(response.status, 200);
  assert.equal(response.headers['access-control-allow-origin'], '*');
});
