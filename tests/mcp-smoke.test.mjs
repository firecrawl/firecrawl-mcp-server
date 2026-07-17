import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import net from 'node:net';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

async function getFreePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.equal(typeof address, 'object');
  const port = address.port;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

async function waitFor(condition, message) {
  let lastValue;
  for (let i = 0; i < 60; i += 1) {
    lastValue = await condition();
    if (lastValue) return lastValue;
    await delay(100);
  }
  throw new Error(message);
}

async function waitForHealth(port, child) {
  const url = `http://127.0.0.1:${port}/health`;
  let lastError;
  for (let i = 0; i < 60; i += 1) {
    if (child.exitCode !== null) {
      throw new Error(
        `server exited early with code ${child.exitCode}; stdout=${child.__stdout ?? ''}; stderr=${child.__stderr ?? ''}`
      );
    }
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = new Error(`health returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw lastError ?? new Error('server did not become healthy');
}

function parseSseJson(body) {
  const dataLine = body
    .split(/\r?\n/)
    .find((line) => line.startsWith('data: '));
  assert.ok(dataLine, `Missing SSE data line in body: ${body}`);
  return JSON.parse(dataLine.slice('data: '.length));
}

function parseActionTraces(stderr) {
  return stderr
    .split(/\r?\n/)
    .filter((line) => line.includes('[MCP_ACTION]'))
    .map((line) => JSON.parse(line.slice(line.indexOf('{'))));
}

function assertNoTypeError(stderr) {
  assert.equal(stderr.includes('TypeError'), false, stderr);
}

const HOSTED_LOG_SENTINELS = {
  arg: 'review-argument-sentinel',
  credential: 'fc-review-secret',
  ip: '8.8.4.44',
  url: 'https://example.com/private?token=leak-sentinel',
};

const CLIENT_IDENTITY_SENTINELS = {
  arg: '--firecrawl-review-arg-sentinel',
  bearer: 'Bearer client-bearer-secret',
  fc: 'fc-client-secret',
  fco: 'fco_client_secret',
  ipv4: '203.0.113.99',
  ipv6: '2001:db8:abcd::99',
  url: 'https://evil.example/private?token=client-leak',
};

function assertNoHostedLogSentinelLeaks(child) {
  const combined = `${child.__stdout ?? ''}\n${child.__stderr ?? ''}`;
  for (const [name, sentinel] of Object.entries(HOSTED_LOG_SENTINELS)) {
    assert.equal(
      combined.includes(sentinel),
      false,
      `${name} sentinel leaked in hosted process logs:\n${combined}`
    );
  }
  assertNoTypeError(combined);
}

function assertNoClientIdentitySentinelLeaks(value, label) {
  const serialized =
    typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  for (const [name, sentinel] of Object.entries(CLIENT_IDENTITY_SENTINELS)) {
    assert.equal(
      serialized.includes(sentinel),
      false,
      `${name} client identity sentinel leaked in ${label}:\n${serialized}`
    );
  }
}

function spawnServer(env) {
  const child = spawn(process.execPath, ['dist/index.js'], {
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stderr.setEncoding('utf8');
  child.stdout.setEncoding('utf8');
  child.__stderr = '';
  child.__stdout = '';
  child.stderr.on('data', (chunk) => {
    child.__stderr += chunk;
  });
  child.stdout.on('data', (chunk) => {
    child.__stdout += chunk;
  });
  return child;
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(2_000).then(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
    }),
  ]);
}

async function startFakeFirecrawlApi() {
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = '';
    req.setEncoding('utf8');
    for await (const chunk of req) body += chunk;

    const contentType = req.headers['content-type'] ?? '';
    const parsedBody = body
      ? contentType.includes('application/x-www-form-urlencoded')
        ? Object.fromEntries(new URLSearchParams(body))
        : JSON.parse(body)
      : undefined;
    requests.push({
      body: parsedBody,
      headers: req.headers,
      method: req.method,
      url: req.url,
    });

    if (req.method === 'POST' && req.url === '/api/oauth/introspect') {
      const token = parsedBody?.token ?? '';
      const active = token.startsWith('fc-') && !token.includes('invalid');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify(
          active
            ? {
                active: true,
                api_key: token,
                api_key_id: '123',
                scope: 'firecrawl:global',
                team_id: '00000000-0000-4000-8000-000000000001',
              }
            : { active: false }
        )
      );
      return;
    }

    if (req.method === 'POST' && req.url === '/v2/search') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          creditsUsed: 1,
          data: {
            web: [
              {
                title: 'Example Domain',
                url: 'https://example.com/',
              },
            ],
          },
          id: '00000000-0000-4000-8000-000000000000',
          success: true,
        })
      );
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: `Unhandled ${req.method} ${req.url}` }));
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.equal(typeof address, 'object');

  return {
    requests,
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

// A single fake origin that stands in for BOTH the Firecrawl OAuth issuer
// (token introspection + keyless eligibility) AND the Firecrawl API. Every
// request is recorded so tests can assert what the MCP server forwarded.
async function startFakeFirecrawlBackend(options = {}) {
  const {
    apiKeyFromIntrospection = 'fc-from-introspection',
    introspectionMetadata = {
      api_key_id: '123',
      aud: 'https://mcp.firecrawl.dev/v2/mcp',
      scope: 'firecrawl:global',
      client_id: 'dyn_test_client',
      sub: '00000000-0000-4000-8000-000000000002',
      team_id: '00000000-0000-4000-8000-000000000001',
    },
    keylessEligible = false,
    searchStatus = 200,
  } = options;
  const requests = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    req.setEncoding('utf8');
    for await (const chunk of req) raw += chunk;

    const contentType = req.headers['content-type'] ?? '';
    let parsedBody;
    if (raw && contentType.includes('application/json')) {
      parsedBody = JSON.parse(raw);
    } else if (
      raw &&
      contentType.includes('application/x-www-form-urlencoded')
    ) {
      parsedBody = Object.fromEntries(new URLSearchParams(raw));
    }
    requests.push({
      body: parsedBody,
      headers: req.headers,
      method: req.method,
      raw,
      url: req.url,
    });

    // OAuth token introspection (issuer origin).
    if (req.method === 'POST' && req.url === '/api/oauth/introspect') {
      const token = parsedBody?.token ?? '';
      const active =
        (token.startsWith('fco_') || token.startsWith('fc-')) &&
        !token.includes('invalid') &&
        !token.includes('revoked');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify(
          active
            ? {
                active: true,
                api_key: token.startsWith('fc-')
                  ? token
                  : apiKeyFromIntrospection,
                ...introspectionMetadata,
              }
            : { active: false }
        )
      );
      return;
    }

    if (req.method === 'POST' && req.url === '/v2/mcp/action-logs') {
      if (req.headers.authorization !== 'Bearer action-log-secret') {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized', success: false }));
        return;
      }
      res.writeHead(202, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: 'mcp_action_log_1', success: true }));
      return;
    }

    // Keyless free-tier eligibility (secret-gated, read-only).
    if (req.method === 'GET' && req.url === '/v2/keyless/eligibility') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ eligible: keylessEligible }));
      return;
    }

    if (req.method === 'POST' && req.url === '/v2/search') {
      if (searchStatus !== 200) {
        res.writeHead(searchStatus, {
          'content-type': 'application/json',
          ...(searchStatus === 429 ? { 'retry-after': '7' } : {}),
        });
        res.end(JSON.stringify({ error: 'search failed', success: false }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          creditsUsed: 1,
          data: {
            web: [{ title: 'Example Domain', url: 'https://example.com/' }],
          },
          id: '00000000-0000-4000-8000-000000000000',
          success: true,
        })
      );
      return;
    }

    if (req.method === 'POST' && req.url === '/v2/scrape') {
      const metadata = { sourceURL: parsedBody?.url };
      if (String(parsedBody?.url ?? '').includes('token=leak-sentinel')) {
        metadata.scrapeId = 'scrape-review-session';
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          data: {
            markdown: '# Example Domain',
            metadata,
          },
          success: true,
        })
      );
      return;
    }

    if (req.method === 'POST' && req.url === '/v2/parse/upload-url') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          data: {
            expiresAt: '2026-07-10T13:00:00.000Z',
            headers: { 'x-upload-token': 'upload-token' },
            maxSizeBytes: 10_000_000,
            method: 'PUT',
            uploadRef: 'upload-ref-keyless-1',
            uploadUrl: 'https://uploads.firecrawl.dev/keyless-1',
          },
          success: true,
        })
      );
      return;
    }

    if (req.method === 'POST' && req.url === '/v2/parse') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          data: {
            markdown: '# Parsed keyless upload',
            metadata: { uploadRef: parsedBody?.uploadRef },
          },
          success: true,
        })
      );
      return;
    }

    if (req.method === 'POST' && req.url === '/v2/map') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          links: [{ title: 'Mapped', url: parsedBody?.url }],
          success: true,
        })
      );
      return;
    }

    if (req.method === 'POST' && req.url === '/v2/crawl') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'crawl-review-session',
          success: true,
          url: parsedBody?.url,
        })
      );
      return;
    }

    if (req.method === 'GET' && req.url === '/v2/crawl/crawl-review-session') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          completed: 1,
          data: [{ markdown: '# Crawled' }],
          status: 'completed',
          success: true,
          total: 1,
        })
      );
      return;
    }

    if (
      req.method === 'POST' &&
      req.url === '/v2/scrape/scrape-review-session/interact'
    ) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ output: 'ok', success: true }));
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: `Unhandled ${req.method} ${req.url}` }));
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.equal(typeof address, 'object');

  return {
    requests,
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function httpToolCall(
  port,
  { endpoint = '/v2/mcp', id, headers, params }
) {
  return fetch(`http://127.0.0.1:${port}${endpoint}`, {
    body: JSON.stringify({ id, jsonrpc: '2.0', method: 'tools/call', params }),
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      ...headers,
    },
    method: 'POST',
  });
}

async function httpInitialize(port, { id, headers, clientInfo }) {
  return fetch(`http://127.0.0.1:${port}/v2/mcp`, {
    body: JSON.stringify({
      id,
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        capabilities: {},
        clientInfo,
        protocolVersion: '2025-06-18',
      },
    }),
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      ...headers,
    },
    method: 'POST',
  });
}

test('HTTP cloud transport preserves Firecrawl OAuth and well-known routes', async (t) => {
  const backend = await startFakeFirecrawlBackend();
  t.after(() => backend.close());
  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FIRECRAWL_API_URL: backend.url,
    HTTP_STREAMABLE_SERVER: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'test-secret',
    FIRECRAWL_OAUTH_ISSUER: backend.url,
    OPENAI_APPS_CHALLENGE_TOKEN: 'challenge-123',
    PORT: String(port),
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  t.after(() => stopChild(child));

  const health = await waitForHealth(port, child);
  assert.equal(await health.text(), 'ok');

  const challenge = await fetch(
    `http://127.0.0.1:${port}/.well-known/openai-apps-challenge`
  );
  assert.equal(challenge.status, 200);
  assert.equal(await challenge.text(), 'challenge-123');

  const prm = await fetch(
    `http://127.0.0.1:${port}/.well-known/oauth-protected-resource`
  );
  assert.equal(prm.status, 200);
  assert.deepEqual(await prm.json(), {
    authorization_servers: [backend.url],
    bearer_methods_supported: ['header'],
    resource: 'https://mcp.firecrawl.dev/v2/mcp',
    resource_name: 'Firecrawl MCP',
    scopes_supported: ['firecrawl:global'],
  });

  const unauthenticated = await fetch(`http://127.0.0.1:${port}/v2/mcp`, {
    body: JSON.stringify({
      id: 1,
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {},
    }),
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
    },
    method: 'POST',
  });
  assert.equal(unauthenticated.status, 200);
  assert.equal(unauthenticated.headers.has('www-authenticate'), false);
  const unauthenticatedMessage = parseSseJson(await unauthenticated.text());
  assert.ok(
    unauthenticatedMessage.result.tools.some(
      (tool) => tool.name === 'firecrawl_search'
    )
  );

  const initialize = await fetch(`http://127.0.0.1:${port}/v2/mcp`, {
    body: JSON.stringify({
      id: 2,
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        capabilities: {},
        clientInfo: { name: 'firecrawl-http-smoke', version: '0.0.0' },
        protocolVersion: '2025-06-18',
      },
    }),
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'x-api-key': 'fc-test',
    },
    method: 'POST',
  });
  assert.equal(initialize.status, 200);
  assert.match(
    initialize.headers.get('content-type') ?? '',
    /text\/event-stream/
  );
  const initializeMessage = parseSseJson(await initialize.text());
  assert.equal(initializeMessage.result.serverInfo.name, 'firecrawl-fastmcp');

  const toolsList = await fetch(`http://127.0.0.1:${port}/v2/mcp`, {
    body: JSON.stringify({
      id: 3,
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {},
    }),
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'x-api-key': 'fc-test',
    },
    method: 'POST',
  });
  assert.equal(toolsList.status, 200);
  const toolsMessage = parseSseJson(await toolsList.text());
  const httpToolNames = toolsMessage.result.tools.map((tool) => tool.name);
  assert.ok(httpToolNames.includes('firecrawl_scrape'));
  assert.ok(httpToolNames.includes('firecrawl_search'));
  assert.ok(httpToolNames.includes('firecrawl_parse'));

  assertNoTypeError(stderr);
});

test('HTTP cloud transport calls Firecrawl API with authenticated session', async (t) => {
  const fakeApi = await startFakeFirecrawlApi();
  t.after(() => fakeApi.close());

  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: fakeApi.url,
    FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'introspect-secret',
    FIRECRAWL_OAUTH_ISSUER: fakeApi.url,
    HTTP_STREAMABLE_SERVER: 'true',
    PORT: String(port),
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  t.after(() => stopChild(child));

  await waitForHealth(port, child);

  const toolCall = await fetch(`http://127.0.0.1:${port}/v2/mcp`, {
    body: JSON.stringify({
      id: 4,
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        arguments: { limit: 1, query: 'example domain' },
        name: 'firecrawl_search',
      },
    }),
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'x-api-key': 'fc-http-test',
    },
    method: 'POST',
  });
  assert.equal(toolCall.status, 200);

  const message = parseSseJson(await toolCall.text());
  const result = message.result;
  assert.notEqual(result.isError, true);
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].type, 'text');
  assert.deepEqual(JSON.parse(result.content[0].text), {
    creditsUsed: 1,
    data: {
      web: [
        {
          title: 'Example Domain',
          url: 'https://example.com/',
        },
      ],
    },
    id: '00000000-0000-4000-8000-000000000000',
    success: true,
  });

  const searchRequest = fakeApi.requests.find(
    (request) => request.url === '/v2/search'
  );
  assert.ok(searchRequest);
  assert.equal(searchRequest.method, 'POST');
  assert.equal(
    searchRequest.headers.authorization,
    'Bearer fc-http-test'
  );
  assert.deepEqual(searchRequest.body, {
    limit: 1,
    origin: 'mcp-fastmcp',
    query: 'example domain',
  });
  assert.equal(
    fakeApi.requests.some(
      (request) =>
        request.url === '/api/oauth/introspect' &&
        request.body?.token === 'fc-http-test'
    ),
    true
  );
  assertNoTypeError(stderr);
});

class StdioMcpClient {
  #buffer = '';
  #child;
  #id = 0;
  #pending = new Map();

  constructor(child) {
    this.#child = child;
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => this.#onData(chunk));
    child.once('exit', (code, signal) => {
      const error = new Error(
        `MCP server exited: code=${code} signal=${signal}`
      );
      for (const { reject } of this.#pending.values()) reject(error);
      this.#pending.clear();
    });
  }

  notify(method, params = {}) {
    this.#write({ jsonrpc: '2.0', method, params });
  }

  request(method, params = {}) {
    const id = ++this.#id;
    this.#write({ id, jsonrpc: '2.0', method, params });
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`Timed out waiting for ${method}`));
      }, 10_000);
      this.#pending.set(id, {
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
  }

  #onData(chunk) {
    this.#buffer += chunk;
    while (true) {
      const newline = this.#buffer.indexOf('\n');
      if (newline === -1) return;
      const line = this.#buffer.slice(0, newline).replace(/\r$/, '');
      this.#buffer = this.#buffer.slice(newline + 1);
      if (!line.trim()) continue;
      const message = JSON.parse(line);
      if (message.id !== undefined && this.#pending.has(message.id)) {
        const pending = this.#pending.get(message.id);
        this.#pending.delete(message.id);
        if (message.error)
          pending.reject(new Error(JSON.stringify(message.error)));
        else pending.resolve(message.result);
      }
    }
  }

  #write(message) {
    this.#child.stdin.write(`${JSON.stringify(message)}\n`);
  }
}

test('stdio transport initializes and lists Firecrawl tools', async (t) => {
  const child = spawnServer({
    FIRECRAWL_API_KEY: 'fc-test',
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  t.after(() => stopChild(child));

  const client = new StdioMcpClient(child);
  const init = await client.request('initialize', {
    capabilities: {},
    clientInfo: { name: 'firecrawl-mcp-smoke', version: '0.0.0' },
    protocolVersion: '2025-06-18',
  });
  assert.equal(init.serverInfo.name, 'firecrawl-fastmcp');

  client.notify('notifications/initialized');
  const tools = await client.request('tools/list');
  const toolNames = tools.tools.map((tool) => tool.name);
  assert.ok(toolNames.includes('firecrawl_scrape'));
  assert.ok(toolNames.includes('firecrawl_search'));
  assert.ok(toolNames.includes('firecrawl_parse'));
  assertNoTypeError(stderr);
});

test('stdio local keyless still lists the full tool catalog', async (t) => {
  const child = spawnServer({
    FIRECRAWL_API_KEY: '',
    FIRECRAWL_API_URL: '',
    FIRECRAWL_OAUTH_TOKEN: '',
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  t.after(() => stopChild(child));

  const client = new StdioMcpClient(child);
  await client.request('initialize', {
    capabilities: {},
    clientInfo: { name: 'firecrawl-mcp-local-keyless', version: '0.0.0' },
    protocolVersion: '2025-06-18',
  });
  client.notify('notifications/initialized');

  const tools = await client.request('tools/list');
  const toolNames = tools.tools.map((tool) => tool.name);
  assert.ok(toolNames.includes('firecrawl_scrape'));
  assert.ok(toolNames.includes('firecrawl_search'));
  assert.ok(toolNames.includes('firecrawl_map'));
  assert.ok(toolNames.includes('firecrawl_parse'));
  assert.match(stderr, /running in keyless mode/);
  assertNoTypeError(stderr);
});

test('stdio transport calls Firecrawl API through a tool end to end', async (t) => {
  const fakeApi = await startFakeFirecrawlApi();
  t.after(() => fakeApi.close());

  const child = spawnServer({
    FIRECRAWL_API_KEY: 'fc-test',
    FIRECRAWL_API_URL: fakeApi.url,
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  t.after(() => stopChild(child));

  const client = new StdioMcpClient(child);
  await client.request('initialize', {
    capabilities: {},
    clientInfo: { name: 'firecrawl-mcp-tool-e2e', version: '0.0.0' },
    protocolVersion: '2025-06-18',
  });
  client.notify('notifications/initialized');

  const result = await client.request('tools/call', {
    arguments: { limit: 1, query: 'example domain' },
    name: 'firecrawl_search',
  });

  assert.equal(fakeApi.requests.length, 1);
  assert.equal(fakeApi.requests[0].method, 'POST');
  assert.equal(fakeApi.requests[0].url, '/v2/search');
  assert.equal(fakeApi.requests[0].headers.authorization, 'Bearer fc-test');
  assert.deepEqual(fakeApi.requests[0].body, {
    limit: 1,
    origin: 'mcp-fastmcp',
    query: 'example domain',
  });

  assert.notEqual(result.isError, true);
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].type, 'text');
  const toolPayload = JSON.parse(result.content[0].text);
  assert.deepEqual(toolPayload, {
    creditsUsed: 1,
    data: {
      web: [
        {
          title: 'Example Domain',
          url: 'https://example.com/',
        },
      ],
    },
    id: '00000000-0000-4000-8000-000000000000',
    success: true,
  });
  assertNoTypeError(stderr);
});

test('HTTP cloud transport swaps an fco_ OAuth token for its introspected API key (once)', async (t) => {
  const backend = await startFakeFirecrawlBackend({
    apiKeyFromIntrospection: 'fc-introspected-key',
  });
  t.after(() => backend.close());

  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: backend.url,
    FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'introspect-secret',
    FIRECRAWL_OAUTH_ISSUER: backend.url,
    HTTP_STREAMABLE_SERVER: 'true',
    PORT: String(port),
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  t.after(() => stopChild(child));

  await waitForHealth(port, child);

  const toolCall = await httpToolCall(port, {
    id: 10,
    headers: { authorization: 'Bearer fco_live_access_token' },
    params: {
      arguments: { limit: 1, query: 'example domain' },
      name: 'firecrawl_search',
    },
  });
  assert.equal(toolCall.status, 200);
  const message = parseSseJson(await toolCall.text());
  assert.notEqual(message.result.isError, true);

  const introspectCalls = backend.requests.filter(
    (r) => r.url === '/api/oauth/introspect'
  );
  const searchCalls = backend.requests.filter((r) => r.url === '/v2/search');

  // The raw fco_ token must be introspected exactly once per request (the
  // per-request memoization must dedupe repeated transport auth calls),
  // authenticated with the configured introspection secret, and the downstream
  // Firecrawl API call must carry the *introspected* API key, never the raw token.
  assert.equal(
    introspectCalls.length,
    1,
    'introspection should be called exactly once'
  );
  assert.equal(
    introspectCalls[0].headers.authorization,
    'Bearer introspect-secret'
  );
  assert.equal(introspectCalls[0].body.token, 'fco_live_access_token');
  assert.equal(introspectCalls[0].body.token_type_hint, 'access_token');

  assert.equal(searchCalls.length, 1);
  assert.equal(
    searchCalls[0].headers.authorization,
    'Bearer fc-introspected-key'
  );
  assertNoTypeError(stderr);
});

test('hosted OAuth audience gate accepts canonical string, slash, and array MCP audiences', async (t) => {
  const identity = {
    client_id: 'audience_test_client',
    sub: '00000000-0000-4000-8000-000000000012',
    team_id: '00000000-0000-4000-8000-000000000011',
  };
  const cases = [
    {
      ...identity,
      aud: 'https://mcp.firecrawl.dev/v2/mcp',
      scope: 'firecrawl:global',
    },
    {
      ...identity,
      aud: 'https://mcp.firecrawl.dev/v2/mcp/',
      scope: 'openid firecrawl:global',
    },
    {
      ...identity,
      aud: ['https://api.firecrawl.dev', 'https://mcp.firecrawl.dev/v2/mcp/'],
      scope: ['openid', 'firecrawl:global'],
    },
  ];

  for (const [index, introspectionMetadata] of cases.entries()) {
    const backend = await startFakeFirecrawlBackend({ introspectionMetadata });
    t.after(() => backend.close());

    const port = await getFreePort();
    const child = spawnServer({
      CLOUD_SERVICE: 'true',
      FASTMCP_ENDPOINT: '/v2/mcp',
      FIRECRAWL_API_URL: backend.url,
      FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'introspect-secret',
      FIRECRAWL_OAUTH_ISSUER: backend.url,
      HTTP_STREAMABLE_SERVER: 'true',
      PORT: String(port),
    });
    t.after(() => stopChild(child));
    await waitForHealth(port, child);

    const accepted = await httpToolCall(port, {
      id: 90 + index,
      headers: { authorization: `Bearer fco_mcp_audience_${index}` },
      params: {
        arguments: { limit: 1, query: 'example domain' },
        name: 'firecrawl_search',
      },
    });
    assert.equal(accepted.status, 200);
    const acceptedMessage = parseSseJson(await accepted.text());
    assert.notEqual(
      acceptedMessage.result.isError,
      true,
      JSON.stringify(acceptedMessage)
    );

    const searchCalls = backend.requests.filter((r) => r.url === '/v2/search');
    assert.equal(searchCalls.length, 1);
  }
});

test('hosted OAuth audience gate rejects API-audience fco replay before tool execution', async (t) => {
  const backend = await startFakeFirecrawlBackend({
    introspectionMetadata: {
      aud: 'https://api.firecrawl.dev',
      scope: 'firecrawl:global',
      client_id: 'dyn_api_audience_client',
      sub: '00000000-0000-4000-8000-000000000002',
      team_id: '00000000-0000-4000-8000-000000000001',
    },
  });
  t.after(() => backend.close());

  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: backend.url,
    FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'introspect-secret',
    FIRECRAWL_OAUTH_ISSUER: backend.url,
    HTTP_STREAMABLE_SERVER: 'true',
    PORT: String(port),
  });
  t.after(() => stopChild(child));
  await waitForHealth(port, child);

  const rejected = await httpToolCall(port, {
    id: 100,
    headers: { authorization: 'Bearer fco_api_audience_replay' },
    params: {
      arguments: { limit: 1, query: 'example domain' },
      name: 'firecrawl_search',
    },
  });
  assert.equal(rejected.status, 401);
  assert.match(rejected.headers.get('www-authenticate') ?? '', /^Bearer /);
  assert.match(rejected.headers.get('www-authenticate') ?? '', /invalid_token/);
  const body = await rejected.json();
  assert.equal(body.error, 'invalid_token');
  assert.match(body.error_description, /audience/);

  const introspectCalls = backend.requests.filter(
    (request) => request.url === '/api/oauth/introspect'
  );
  assert.equal(introspectCalls.length, 1);
  assert.equal(introspectCalls[0].body.token, 'fco_api_audience_replay');
  assert.equal(backend.requests.some((r) => r.url === '/v2/search'), false);
});

test('hosted OAuth audience gate rejects missing, malformed, unrelated, API audience, and unsupported scopes', async (t) => {
  const cases = [
    { aud: 'https://api.firecrawl.dev', scope: 'firecrawl:global' },
    { aud: 'https://example.com/not-firecrawl-mcp', scope: 'firecrawl:global' },
    { aud: undefined, scope: 'firecrawl:global' },
    { aud: 42, scope: 'firecrawl:global' },
    { aud: ['https://mcp.firecrawl.dev/v2/mcp', 42], scope: 'firecrawl:global' },
    { aud: 'https://mcp.firecrawl.dev/v2/mcp', scope: 'firecrawl:admin' },
    { aud: 'https://mcp.firecrawl.dev/v2/mcp', scope: undefined },
  ];

  for (const [index, introspectionMetadata] of cases.entries()) {
    const backend = await startFakeFirecrawlBackend({ introspectionMetadata });
    t.after(() => backend.close());

    const port = await getFreePort();
    const child = spawnServer({
      CLOUD_SERVICE: 'true',
      FASTMCP_ENDPOINT: '/v2/mcp',
      FIRECRAWL_API_URL: backend.url,
      FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'introspect-secret',
      FIRECRAWL_OAUTH_ISSUER: backend.url,
      HTTP_STREAMABLE_SERVER: 'true',
      PORT: String(port),
    });
    t.after(() => stopChild(child));
    await waitForHealth(port, child);

    const rejected = await httpToolCall(port, {
      id: 110 + index,
      headers: { authorization: `Bearer fco_wrong_binding_${index}` },
      params: {
        arguments: { limit: 1, query: 'example domain' },
        name: 'firecrawl_search',
      },
    });
    assert.equal(rejected.status, 401);
    assert.match(rejected.headers.get('www-authenticate') ?? '', /invalid_token/);
    assert.equal(backend.requests.some((r) => r.url === '/v2/search'), false);
  }
});

test('HTTP cloud transport rejects an inactive fco_ token with an OAuth challenge', async (t) => {
  const backend = await startFakeFirecrawlBackend();
  t.after(() => backend.close());

  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: backend.url,
    FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'introspect-secret',
    FIRECRAWL_OAUTH_ISSUER: backend.url,
    HTTP_STREAMABLE_SERVER: 'true',
    PORT: String(port),
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  t.after(() => stopChild(child));

  await waitForHealth(port, child);

  const toolCall = await httpToolCall(port, {
    id: 11,
    headers: { authorization: 'Bearer fco_invalid_token' },
    params: {
      arguments: { limit: 1, query: 'example domain' },
      name: 'firecrawl_search',
    },
  });

  assert.equal(toolCall.status, 401);
  const wwwAuthenticate = toolCall.headers.get('www-authenticate') ?? '';
  assert.match(wwwAuthenticate, /^Bearer /);
  assert.match(
    wwwAuthenticate,
    /resource_metadata="https:\/\/mcp\.firecrawl\.dev\/\.well-known\/oauth-protected-resource"/
  );
  assert.match(wwwAuthenticate, /error="invalid_token"/);
  const body = await toolCall.json();
  assert.equal(body.error, 'invalid_token');
  // The failed introspection must NOT leak downstream as an API call.
  assert.equal(
    backend.requests.some((r) => r.url === '/v2/search'),
    false
  );
  assertNoTypeError(stderr);
});

test('HTTP cloud transport treats revoked OAuth grants as 401 and allows reconnect', async (t) => {
  const backend = await startFakeFirecrawlBackend({
    apiKeyFromIntrospection: 'fc-reconnected-key',
  });
  t.after(() => backend.close());

  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: backend.url,
    FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'introspect-secret',
    FIRECRAWL_OAUTH_ISSUER: backend.url,
    HTTP_STREAMABLE_SERVER: 'true',
    PORT: String(port),
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  t.after(() => stopChild(child));

  await waitForHealth(port, child);

  const revokedCall = await httpToolCall(port, {
    id: 20,
    headers: { authorization: 'Bearer fco_revoked_token' },
    params: {
      arguments: { limit: 1, query: 'example domain' },
      name: 'firecrawl_search',
    },
  });
  assert.equal(revokedCall.status, 401);
  assert.match(
    revokedCall.headers.get('www-authenticate') ?? '',
    /error="invalid_token"/
  );
  assert.equal(
    backend.requests.some((r) => r.url === '/v2/search'),
    false
  );

  const reconnectedCall = await httpToolCall(port, {
    id: 21,
    headers: { authorization: 'Bearer fco_reconnected_token' },
    params: {
      arguments: { limit: 1, query: 'example domain' },
      name: 'firecrawl_search',
    },
  });
  assert.equal(reconnectedCall.status, 200);
  const message = parseSseJson(await reconnectedCall.text());
  assert.notEqual(message.result.isError, true);

  const introspectCalls = backend.requests.filter(
    (request) => request.url === '/api/oauth/introspect'
  );
  assert.deepEqual(
    introspectCalls.map((request) => request.body.token),
    ['fco_revoked_token', 'fco_reconnected_token']
  );
  const searchCalls = backend.requests.filter((r) => r.url === '/v2/search');
  assert.equal(searchCalls.length, 1);
  assert.equal(
    searchCalls[0].headers.authorization,
    'Bearer fc-reconnected-key'
  );
  assertNoTypeError(stderr);
});

test('HTTP cloud transport accepts the x-firecrawl-api-key header', async (t) => {
  const backend = await startFakeFirecrawlBackend();
  t.after(() => backend.close());

  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: backend.url,
    FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'introspect-secret',
    FIRECRAWL_OAUTH_ISSUER: backend.url,
    HTTP_STREAMABLE_SERVER: 'true',
    PORT: String(port),
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  t.after(() => stopChild(child));

  await waitForHealth(port, child);

  const toolCall = await httpToolCall(port, {
    id: 12,
    headers: { 'x-firecrawl-api-key': 'fc-header-key' },
    params: {
      arguments: { limit: 1, query: 'example domain' },
      name: 'firecrawl_search',
    },
  });
  assert.equal(toolCall.status, 200);
  const message = parseSseJson(await toolCall.text());
  assert.notEqual(message.result.isError, true);

  const searchCalls = backend.requests.filter((r) => r.url === '/v2/search');
  assert.equal(searchCalls.length, 1);
  assert.equal(searchCalls[0].headers.authorization, 'Bearer fc-header-key');
  assertNoTypeError(stderr);
});

test('HTTP cloud transport isolates non-API-key bearer credentials before keyless fallback', async (t) => {
  const backend = await startFakeFirecrawlBackend();
  t.after(() => backend.close());

  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: backend.url,
    FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'introspect-secret',
    FIRECRAWL_OAUTH_ISSUER: backend.url,
    HTTP_STREAMABLE_SERVER: 'true',
    PORT: String(port),
  });
  t.after(() => stopChild(child));
  await waitForHealth(port, child);

  const initialize = await fetch(`http://127.0.0.1:${port}/v2/mcp`, {
    body: JSON.stringify({
      id: 94,
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        capabilities: {},
        clientInfo: { name: 'firecrawl-invalid-credential-smoke', version: '0.0.0' },
        protocolVersion: '2025-06-18',
      },
    }),
    headers: {
      accept: 'application/json, text/event-stream',
      authorization: 'Bearer fcr_refresh_should_not_forward',
      'content-type': 'application/json',
    },
    method: 'POST',
  });
  assert.equal(initialize.status, 200);
  assert.equal(initialize.headers.has('www-authenticate'), false);
  assert.equal(backend.requests.some((r) => r.url === '/v2/search'), false);
  assert.equal(backend.requests.some((r) => r.url === '/v2/keyless/eligibility'), false);
});

test('HTTP cloud transport accepts bearer API-key fallback for headless clients', async (t) => {
  const backend = await startFakeFirecrawlBackend();
  t.after(() => backend.close());

  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: backend.url,
    FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'introspect-secret',
    FIRECRAWL_OAUTH_ISSUER: backend.url,
    HTTP_STREAMABLE_SERVER: 'true',
    PORT: String(port),
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  t.after(() => stopChild(child));

  await waitForHealth(port, child);

  const toolCall = await httpToolCall(port, {
    id: 15,
    headers: { authorization: 'Bearer fc-bearer-key' },
    params: {
      arguments: { limit: 1, query: 'example domain' },
      name: 'firecrawl_search',
    },
  });
  assert.equal(toolCall.status, 200);
  const message = parseSseJson(await toolCall.text());
  assert.notEqual(message.result.isError, true);

  const searchCalls = backend.requests.filter((r) => r.url === '/v2/search');
  assert.equal(searchCalls.length, 1);
  assert.equal(searchCalls[0].headers.authorization, 'Bearer fc-bearer-key');
  assertNoTypeError(stderr);
});

test('HTTP cloud transport accepts the x-api-key header alias', async (t) => {
  const backend = await startFakeFirecrawlBackend();
  t.after(() => backend.close());

  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: backend.url,
    FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'introspect-secret',
    FIRECRAWL_OAUTH_ISSUER: backend.url,
    HTTP_STREAMABLE_SERVER: 'true',
    PORT: String(port),
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  t.after(() => stopChild(child));

  await waitForHealth(port, child);

  const toolCall = await httpToolCall(port, {
    id: 16,
    headers: { 'x-api-key': 'fc-x-alias-key' },
    params: {
      arguments: { limit: 1, query: 'example domain' },
      name: 'firecrawl_search',
    },
  });
  assert.equal(toolCall.status, 200);
  const message = parseSseJson(await toolCall.text());
  assert.notEqual(message.result.isError, true);

  const searchCalls = backend.requests.filter((r) => r.url === '/v2/search');
  assert.equal(searchCalls.length, 1);
  assert.equal(searchCalls[0].headers.authorization, 'Bearer fc-x-alias-key');
  assertNoTypeError(stderr);
});

test('HTTP cloud authenticated sessions expose the full Firecrawl tool surface', async (t) => {
  const backend = await startFakeFirecrawlBackend();
  t.after(() => backend.close());
  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: backend.url,
    FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'introspect-secret',
    FIRECRAWL_OAUTH_ISSUER: backend.url,
    HTTP_STREAMABLE_SERVER: 'true',
    PORT: String(port),
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  t.after(() => stopChild(child));

  await waitForHealth(port, child);

  const toolsList = await fetch(`http://127.0.0.1:${port}/v2/mcp`, {
    body: JSON.stringify({
      id: 17,
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {},
    }),
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      authorization: 'Bearer fc-tool-surface-key',
    },
    method: 'POST',
  });
  assert.equal(toolsList.status, 200);
  const toolsMessage = parseSseJson(await toolsList.text());
  const toolNames = new Set(toolsMessage.result.tools.map((tool) => tool.name));

  for (const expected of [
    'firecrawl_scrape',
    'firecrawl_search',
    'firecrawl_map',
    'firecrawl_crawl',
    'firecrawl_extract',
    'firecrawl_parse',
    'firecrawl_agent',
    'firecrawl_monitor_create',
    'firecrawl_research_search_papers',
    'firecrawl_interact',
    'firecrawl_search_feedback',
    'firecrawl_feedback',
  ]) {
    assert.equal(
      toolNames.has(expected),
      true,
      `${expected} should be visible`
    );
  }
  assertNoTypeError(stderr);
});

test('HTTP cloud transport serves an eligible keyless client and forwards its IP', async (t) => {
  const backend = await startFakeFirecrawlBackend({ keylessEligible: true });
  t.after(() => backend.close());

  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: backend.url,
    FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'introspect-secret',
    FIRECRAWL_OAUTH_ISSUER: backend.url,
    HTTP_STREAMABLE_SERVER: 'true',
    KEYLESS_PROXY_SECRET: 'keyless-secret',
    PORT: String(port),
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  t.after(() => stopChild(child));

  await waitForHealth(port, child);

  const toolCall = await httpToolCall(port, {
    id: 13,
    headers: { 'x-forwarded-for': '8.8.8.7' },
    params: {
      arguments: { limit: 1, query: 'example domain' },
      name: 'firecrawl_search',
    },
  });
  assert.equal(toolCall.status, 200);
  const message = parseSseJson(await toolCall.text());
  assert.notEqual(message.result.isError, true);

  const eligibilityCalls = backend.requests.filter(
    (r) => r.url === '/v2/keyless/eligibility'
  );
  assert.equal(eligibilityCalls.length >= 1, true);
  // The client's real (left-most XFF) IP and the secret must gate eligibility.
  assert.equal(
    eligibilityCalls[0].headers['x-firecrawl-keyless-ip'],
    '8.8.8.7'
  );
  assert.equal(
    eligibilityCalls[0].headers['x-firecrawl-keyless-secret'],
    'keyless-secret'
  );
  assertNoTypeError(stderr);
});

test('HTTP cloud tool calls emit safe MCP action traces', async (t) => {
  const backend = await startFakeFirecrawlBackend();
  t.after(() => backend.close());

  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: backend.url,
    FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'introspect-secret',
    FIRECRAWL_OAUTH_ISSUER: backend.url,
    HTTP_STREAMABLE_SERVER: 'true',
    PORT: String(port),
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  t.after(() => stopChild(child));

  await waitForHealth(port, child);

  const toolCall = await httpToolCall(port, {
    id: 19,
    headers: {
      authorization: 'Bearer fc-trace-key',
      'user-agent': 'TraceClient/1.0',
      'x-request-id': 'req-trace-123',
    },
    params: {
      _meta: { requestId: 'spoofed-jsonrpc-request-id' },
      arguments: { limit: 1, query: 'example domain' },
      name: 'firecrawl_search',
    },
  });
  assert.equal(toolCall.status, 200);
  const message = parseSseJson(await toolCall.text());
  assert.notEqual(message.result.isError, true);

  const traces = parseActionTraces(stderr);
  assert.equal(traces.length, 2);
  assert.deepEqual(
    traces.map((trace) => trace.status),
    ['started', 'success']
  );
  for (const trace of traces) {
    assert.equal(trace.toolName, 'firecrawl_search');
    assert.equal(trace.authType, 'api-key');
    assert.equal(trace.userAgent, 'unknown');
    assert.equal(trace.clientName, 'unknown');
    assert.equal(Object.hasOwn(trace, 'clientVersion'), false);
    assert.match(trace.requestId, /^[0-9a-f-]{36}$/);
    assert.notEqual(trace.requestId, 'req-trace-123');
    assert.notEqual(trace.requestId, 'spoofed-jsonrpc-request-id');
    assert.match(trace.timestamp, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(Object.hasOwn(trace, 'keylessClientIp'), false);
    assert.equal(JSON.stringify(trace).includes('fc-trace-key'), false);
  }
  assertNoTypeError(stderr);
});

test('HTTP cloud action traces and remote logs canonicalize client identity', async (t) => {
  const backend = await startFakeFirecrawlBackend({
    apiKeyFromIntrospection: 'fc-known-client-key',
    introspectionMetadata: {
      api_key_id: '789',
      team_id: '00000000-0000-4000-8000-000000000004',
    },
  });
  t.after(() => backend.close());

  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: backend.url,
    FIRECRAWL_MCP_ACTION_LOG_SECRET: 'action-log-secret',
    FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'introspect-secret',
    FIRECRAWL_OAUTH_ISSUER: backend.url,
    HTTP_STREAMABLE_SERVER: 'true',
    PORT: String(port),
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  t.after(() => stopChild(child));

  await waitForHealth(port, child);

  const cases = [
    ['Claude/2.0', 'claude/2.0', 'claude', '2.0'],
    ['Cursor/1.2.3', 'cursor/1.2.3', 'cursor', '1.2.3'],
    ['Codex/0.42.0', 'codex/0.42.0', 'codex', '0.42.0'],
    ['ChatGPT/1.2026.101', 'chatgpt/1.2026.101', 'chatgpt', '1.2026.101'],
    ['GitHubCopilot/1.300.0', 'copilot/1.300.0', 'copilot', '1.300.0'],
    ['Windsurf/1.10.5', 'windsurf/1.10.5', 'windsurf', '1.10.5'],
    ['Warp/0.2026.7', 'warp/0.2026.7', 'warp', '0.2026.7'],
    ['OpenCode/0.9.1', 'opencode/0.9.1', 'opencode', '0.9.1'],
    ['Gemini/2.5', 'gemini/2.5', 'gemini', '2.5'],
    ['mcp-remote/0.1.15', 'mcp-remote/0.1.15', 'mcp-remote', '0.1.15'],
  ];

  for (const [userAgent, expectedUserAgent] of cases) {
    const toolCall = await httpToolCall(port, {
      id: `known-${userAgent}`,
      headers: {
        authorization: 'Bearer fc-known-client-key',
        'user-agent': userAgent,
      },
      params: {
        arguments: { limit: 1, query: 'example domain' },
        name: 'firecrawl_search',
      },
    });
    assert.equal(toolCall.status, 200);
    const message = parseSseJson(await toolCall.text());
    assert.notEqual(message.result.isError, true);

    const traces = parseActionTraces(stderr).slice(-2);
    assert.deepEqual(
      traces.map((trace) => trace.userAgent),
      [expectedUserAgent, expectedUserAgent]
    );
  }

  const actionLogCalls = await waitFor(() => {
    const calls = backend.requests.filter(
      (r) => r.url === '/v2/mcp/action-logs'
    );
    return calls.length === cases.length ? calls : null;
  }, 'expected canonical client identity action log calls');

  for (let i = 0; i < cases.length; i += 1) {
    const [, expectedUserAgent, expectedName, expectedVersion] = cases[i];
    for (const request of actionLogCalls.slice(i, i + 1)) {
      assert.equal(request.body.user_agent, expectedUserAgent);
      assert.equal(request.body.client_name, expectedName);
      assert.equal(request.body.client_version, expectedVersion);
    }
  }
  assertNoTypeError(stderr);
});

test('HTTP cloud action traces and remote logs drop malicious client identity input', async (t) => {
  const backend = await startFakeFirecrawlBackend({
    apiKeyFromIntrospection: 'fc-identity-key',
    introspectionMetadata: {
      api_key_id: '790',
      team_id: '00000000-0000-4000-8000-000000000005',
    },
  });
  t.after(() => backend.close());

  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: backend.url,
    FIRECRAWL_MCP_ACTION_LOG_SECRET: 'action-log-secret',
    FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'introspect-secret',
    FIRECRAWL_OAUTH_ISSUER: backend.url,
    HTTP_STREAMABLE_SERVER: 'true',
    PORT: String(port),
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  t.after(() => stopChild(child));

  await waitForHealth(port, child);

  const maliciousIdentity = Object.values(CLIENT_IDENTITY_SENTINELS).join(' ');
  const initialize = await httpInitialize(port, {
    id: 30,
    headers: {
      authorization: 'Bearer fc-identity-key',
      'user-agent': maliciousIdentity,
    },
    clientInfo: {
      name: `UnknownClient ${maliciousIdentity}`,
      version: `9.8.7 ${maliciousIdentity}`,
    },
  });
  assert.equal(initialize.status, 200);
  parseSseJson(await initialize.text());

  const toolCall = await httpToolCall(port, {
    id: 31,
    headers: {
      authorization: 'Bearer fc-identity-key',
      'user-agent': maliciousIdentity,
    },
    params: {
      arguments: { limit: 1, query: 'example domain' },
      name: 'firecrawl_search',
    },
  });
  assert.equal(toolCall.status, 200);
  const message = parseSseJson(await toolCall.text());
  assert.notEqual(message.result.isError, true);

  const traces = parseActionTraces(stderr);
  assert.equal(traces.length, 2);
  for (const trace of traces) {
    assert.equal(trace.userAgent, 'unknown');
    assert.equal(trace.clientName, 'unknown');
    assert.equal(Object.hasOwn(trace, 'clientVersion'), false);
  }

  const actionLogCalls = await waitFor(() => {
    const calls = backend.requests.filter(
      (r) => r.url === '/v2/mcp/action-logs'
    );
    return calls.length === 1 ? calls : null;
  }, 'expected malicious client identity action log calls');

  assertNoClientIdentitySentinelLeaks(stderr, 'process logs');
  for (const request of actionLogCalls) {
    assert.equal(request.body.user_agent, 'unknown');
    assert.equal(request.body.client_name, 'unknown');
    assert.equal(Object.hasOwn(request.body, 'client_version'), false);
    assertNoClientIdentitySentinelLeaks(request.body, 'remote action log body');
  }
  assertNoTypeError(stderr);
});

test('HTTP cloud OAuth sessions emit one terminal account-visible action log per tool call', async (t) => {
  const backend = await startFakeFirecrawlBackend({
    apiKeyFromIntrospection: 'fc-introspected-key',
  });
  t.after(() => backend.close());

  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp-oauth',
    FIRECRAWL_API_URL: backend.url,
    FIRECRAWL_MCP_RESOURCE_URL: 'https://mcp.firecrawl.dev/v2/mcp-oauth',
    FIRECRAWL_MCP_ACTION_LOG_SECRET: 'action-log-secret',
    FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'introspect-secret',
    FIRECRAWL_OAUTH_ISSUER: backend.url,
    HTTP_STREAMABLE_SERVER: 'true',
    PORT: String(port),
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  t.after(() => stopChild(child));

  await waitForHealth(port, child);

  const toolCall = await httpToolCall(port, {
    endpoint: '/v2/mcp-oauth',
    id: 20,
    headers: {
      authorization: 'Bearer fco_live_access_token',
      'user-agent': 'Claude/2.0',
    },
    params: {
      arguments: { limit: 1, query: 'example domain' },
      name: 'firecrawl_search',
    },
  });
  assert.equal(toolCall.status, 200);
  const message = parseSseJson(await toolCall.text());
  assert.notEqual(message.result.isError, true);

  const secondToolCall = await httpToolCall(port, {
    endpoint: '/v2/mcp-oauth',
    id: 201,
    headers: {
      authorization: 'Bearer fco_live_access_token',
      'user-agent': 'Claude/2.0',
    },
    params: {
      arguments: { limit: 1, query: 'second example' },
      name: 'firecrawl_search',
    },
  });
  assert.equal(secondToolCall.status, 200);
  assert.notEqual(
    parseSseJson(await secondToolCall.text()).result.isError,
    true
  );

  const actionLogCalls = await waitFor(() => {
    const calls = backend.requests.filter(
      (r) => r.url === '/v2/mcp/action-logs'
    );
    return calls.length === 2 ? calls : null;
  }, 'expected one terminal action log per tool call');

  assert.deepEqual(
    actionLogCalls.map((request) => request.body.status),
    ['success', 'success']
  );
  assert.notEqual(
    actionLogCalls[0].body.request_id,
    actionLogCalls[1].body.request_id
  );
  const localTraces = parseActionTraces(stderr);
  assert.deepEqual(
    localTraces.map((trace) => trace.status),
    ['started', 'success', 'started', 'success']
  );
  assert.equal(localTraces[0].requestId, localTraces[1].requestId);
  assert.equal(localTraces[2].requestId, localTraces[3].requestId);
  assert.notEqual(localTraces[0].requestId, localTraces[2].requestId);
  for (const request of actionLogCalls) {
    assert.equal(request.headers.authorization, 'Bearer action-log-secret');
    assert.equal(request.body.team_id, '00000000-0000-4000-8000-000000000001');
    assert.equal(request.body.user_id, '00000000-0000-4000-8000-000000000002');
    assert.equal(request.body.api_key_id, '123');
    assert.equal(request.body.oauth_client_id, 'dyn_test_client');
    assert.equal(request.body.auth_type, 'oauth');
    assert.equal(request.body.tool_name, 'firecrawl_search');
    assert.equal(request.body.user_agent, 'claude/2.0');
    assert.equal(request.body.client_name, 'claude');
    assert.equal(request.body.client_version, '2.0');
    assert.equal(
      request.body.resource,
      'https://mcp.firecrawl.dev/v2/mcp-oauth'
    );
    assert.equal(Object.hasOwn(request.body, 'args'), false);
    assert.equal(Object.hasOwn(request.body, 'url'), false);
    assert.equal(Object.hasOwn(request.body, 'token'), false);
    assert.equal(
      JSON.stringify(request.body).includes('fco_live_access_token'),
      false
    );
    assert.equal(
      JSON.stringify(request.body).includes('fc-introspected-key'),
      false
    );
  }
  assertNoTypeError(stderr);
});

test('HTTP cloud bearer API-key sessions emit strict terminal action logs after metadata introspection', async (t) => {
  const apiKeyId = '9007199254740993';
  const backend = await startFakeFirecrawlBackend({
    apiKeyFromIntrospection: 'fc-api-key',
    introspectionMetadata: {
      api_key_id: apiKeyId,
      client_id: 'must-not-be-sent-for-api-keys',
      sub: '00000000-0000-4000-8000-000000000099',
      team_id: '00000000-0000-4000-8000-000000000003',
    },
  });
  t.after(() => backend.close());

  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: backend.url,
    FIRECRAWL_MCP_ACTION_LOG_SECRET: 'action-log-secret',
    FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'introspect-secret',
    FIRECRAWL_OAUTH_ISSUER: backend.url,
    HTTP_STREAMABLE_SERVER: 'true',
    PORT: String(port),
  });
  t.after(() => stopChild(child));

  await waitForHealth(port, child);

  const toolCall = await httpToolCall(port, {
    id: 21,
    headers: { authorization: 'Bearer fc-api-key' },
    params: {
      arguments: { limit: 1, query: 'example domain' },
      name: 'firecrawl_search',
    },
  });
  assert.equal(toolCall.status, 200);
  const message = parseSseJson(await toolCall.text());
  assert.notEqual(message.result.isError, true);

  const introspectCalls = backend.requests.filter(
    (r) => r.url === '/api/oauth/introspect'
  );
  assert.equal(introspectCalls.length, 1);
  assert.equal(introspectCalls[0].body.token, 'fc-api-key');

  const actionLogCalls = await waitFor(() => {
    const calls = backend.requests.filter(
      (r) => r.url === '/v2/mcp/action-logs'
    );
    return calls.length === 1 ? calls : null;
  }, 'expected API-key action log calls');

  for (const request of actionLogCalls) {
    assert.equal(request.body.team_id, '00000000-0000-4000-8000-000000000003');
    assert.equal(request.body.api_key_id, apiKeyId);
    assert.equal(request.body.auth_type, 'api-key');
    assert.equal(request.body.tool_name, 'firecrawl_search');
    assert.equal(request.body.status, 'success');
    assert.equal(request.body.resource, 'https://mcp.firecrawl.dev/v2/mcp');
    assert.equal(Object.hasOwn(request.body, 'user_id'), false);
    assert.equal(Object.hasOwn(request.body, 'oauth_client_id'), false);
    assert.equal(JSON.stringify(request.body).includes('fc-api-key'), false);
  }
});

test('HTTP cloud rejects malformed API-key IDs from introspection', async (t) => {
  const backend = await startFakeFirecrawlBackend({
    apiKeyFromIntrospection: 'fc-malformed-id-key',
    introspectionMetadata: {
      api_key_id: '9007199254740993x',
      team_id: '00000000-0000-4000-8000-000000000003',
    },
  });
  t.after(() => backend.close());

  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: backend.url,
    FIRECRAWL_MCP_ACTION_LOG_SECRET: 'action-log-secret',
    FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'introspect-secret',
    FIRECRAWL_OAUTH_ISSUER: backend.url,
    HTTP_STREAMABLE_SERVER: 'true',
    PORT: String(port),
  });
  t.after(() => stopChild(child));

  await waitForHealth(port, child);
  const toolCall = await httpToolCall(port, {
    id: 22,
    headers: { authorization: 'Bearer fc-malformed-id-key' },
    params: {
      arguments: { limit: 1, query: 'example domain' },
      name: 'firecrawl_search',
    },
  });
  assert.equal(toolCall.status, 200);
  assert.notEqual(parseSseJson(await toolCall.text()).result.isError, true);

  await delay(100);
  assert.equal(
    backend.requests.filter((request) => request.url === '/v2/mcp/action-logs')
      .length,
    0
  );
});

test('HTTP cloud authenticated failures emit one remote error action log', async (t) => {
  const backend = await startFakeFirecrawlBackend({
    apiKeyFromIntrospection: 'fc-error-key',
    introspectionMetadata: {
      api_key_id: '457',
      team_id: '00000000-0000-4000-8000-000000000006',
    },
    searchStatus: 500,
  });
  t.after(() => backend.close());

  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: backend.url,
    FIRECRAWL_MCP_ACTION_LOG_SECRET: 'action-log-secret',
    FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'introspect-secret',
    FIRECRAWL_OAUTH_ISSUER: backend.url,
    HTTP_STREAMABLE_SERVER: 'true',
    PORT: String(port),
  });
  t.after(() => stopChild(child));
  await waitForHealth(port, child);

  const toolCall = await httpToolCall(port, {
    id: 211,
    headers: { authorization: 'Bearer fc-error-key' },
    params: {
      arguments: { limit: 1, query: 'example domain' },
      name: 'firecrawl_search',
    },
  });
  assert.equal(toolCall.status, 200);
  assert.equal(parseSseJson(await toolCall.text()).result.isError, true);

  const [actionLog] = await waitFor(() => {
    const calls = backend.requests.filter(
      (request) => request.url === '/v2/mcp/action-logs'
    );
    return calls.length === 1 ? calls : null;
  }, 'expected one remote error action log');
  assert.equal(actionLog.body.status, 'error');
  assert.equal(actionLog.body.auth_type, 'api-key');
  assert.equal(actionLog.body.api_key_id, '457');
  assert.match(actionLog.body.request_id, /^[0-9a-f-]{36}$/);
});

test('HTTP cloud keyless sessions can call scrape without leaking raw IP in traces', async (t) => {
  const backend = await startFakeFirecrawlBackend({ keylessEligible: true });
  t.after(() => backend.close());

  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: backend.url,
    FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'introspect-secret',
    FIRECRAWL_OAUTH_ISSUER: backend.url,
    HTTP_STREAMABLE_SERVER: 'true',
    KEYLESS_PROXY_SECRET: 'keyless-secret',
    PORT: String(port),
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  t.after(() => stopChild(child));

  await waitForHealth(port, child);

  const toolCall = await httpToolCall(port, {
    id: 22,
    headers: {
      'user-agent': 'KeylessTraceClient/1.0',
      'x-forwarded-for': '8.8.8.22',
      'x-request-id': 'req-keyless-scrape',
    },
    params: {
      arguments: { formats: ['markdown'], url: 'https://example.com/' },
      name: 'firecrawl_scrape',
    },
  });
  assert.equal(toolCall.status, 200);
  const message = parseSseJson(await toolCall.text());
  assert.notEqual(message.result.isError, true);
  assert.deepEqual(JSON.parse(message.result.content[0].text), {
    markdown: '# Example Domain',
    metadata: { sourceURL: 'https://example.com/' },
  });

  const scrapeCalls = backend.requests.filter(
    (request) => request.url === '/v2/scrape'
  );
  assert.equal(scrapeCalls.length, 1);
  assert.equal(
    scrapeCalls[0].headers['x-firecrawl-keyless-ip'],
    '8.8.8.22'
  );
  assert.equal(
    scrapeCalls[0].headers['x-firecrawl-keyless-secret'],
    'keyless-secret'
  );

  const traces = parseActionTraces(stderr);
  assert.equal(traces.length, 2);
  for (const trace of traces) {
    assert.equal(trace.toolName, 'firecrawl_scrape');
    assert.equal(trace.authType, 'keyless');
    assert.equal(trace.userAgent, 'unknown');
    assert.equal(trace.clientName, 'unknown');
    assert.equal(Object.hasOwn(trace, 'clientVersion'), false);
    assert.match(trace.requestId, /^[0-9a-f-]{36}$/);
    assert.notEqual(trace.requestId, 'req-keyless-scrape');
    assert.equal(Object.hasOwn(trace, 'keylessClientIp'), false);
  }
  assert.equal(stderr.includes('8.8.8.22'), false);
  assert.equal(stderr.includes('keyless-secret'), false);
  assertNoTypeError(stderr);
});

test('HTTP cloud hosted tool logs redact scrape map crawl interact inputs', async (t) => {
  const backend = await startFakeFirecrawlBackend();
  t.after(() => backend.close());

  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: backend.url,
    FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'introspect-secret',
    FIRECRAWL_OAUTH_ISSUER: backend.url,
    HTTP_STREAMABLE_SERVER: 'true',
    PORT: String(port),
  });
  t.after(() => stopChild(child));

  await waitForHealth(port, child);

  const commonHeaders = {
    authorization: `Bearer ${HOSTED_LOG_SENTINELS.credential}`,
    'x-forwarded-for': HOSTED_LOG_SENTINELS.ip,
  };

  for (const [id, name, args] of [
    [31, 'firecrawl_scrape', {
      formats: ['markdown'],
      includeTags: [HOSTED_LOG_SENTINELS.arg],
      url: HOSTED_LOG_SENTINELS.url,
    }],
    [32, 'firecrawl_map', {
      search: HOSTED_LOG_SENTINELS.arg,
      url: HOSTED_LOG_SENTINELS.url,
    }],
    [33, 'firecrawl_crawl', {
      prompt: HOSTED_LOG_SENTINELS.arg,
      pollInterval: 0.01,
      timeout: 2,
      url: HOSTED_LOG_SENTINELS.url,
    }],
    [34, 'firecrawl_interact', {
      prompt: HOSTED_LOG_SENTINELS.arg,
      url: HOSTED_LOG_SENTINELS.url,
    }],
  ]) {
    const toolCall = await httpToolCall(port, {
      id,
      headers: commonHeaders,
      params: { arguments: args, name },
    });
    assert.equal(toolCall.status, 200, name);
    const message = parseSseJson(await toolCall.text());
    assert.notEqual(message.result.isError, true, name);
  }

  await delay(100);
  assertNoHostedLogSentinelLeaks(child);
});

test('HTTP cloud keyless sessions expose the executable triad and gate account tools', async (t) => {
  const backend = await startFakeFirecrawlBackend({ keylessEligible: true });
  t.after(() => backend.close());

  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: backend.url,
    FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'introspect-secret',
    FIRECRAWL_OAUTH_ISSUER: backend.url,
    HTTP_STREAMABLE_SERVER: 'true',
    KEYLESS_PROXY_SECRET: 'keyless-secret',
    PORT: String(port),
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  t.after(() => stopChild(child));

  await waitForHealth(port, child);

  const toolsList = await fetch(`http://127.0.0.1:${port}/v2/mcp`, {
    body: JSON.stringify({
      id: 18,
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {},
    }),
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'x-forwarded-for': '8.8.8.18',
    },
    method: 'POST',
  });
  assert.equal(toolsList.status, 200);
  const toolsMessage = parseSseJson(await toolsList.text());
  assert.deepEqual(
    toolsMessage.result.tools.map((tool) => tool.name).sort(),
    ['firecrawl_parse', 'firecrawl_scrape', 'firecrawl_search']
  );

  const mapCall = await httpToolCall(port, {
    id: 19,
    headers: { 'x-forwarded-for': '8.8.8.18' },
    params: {
      arguments: { url: 'https://example.com' },
      name: 'firecrawl_map',
    },
  });
  assert.equal(mapCall.status, 200);
  const mapMessage = parseSseJson(await mapCall.text());
  assert.equal(mapMessage.result?.isError, true);
  assert.equal(
    mapMessage.result?.structuredContent?.code,
    'KEYLESS_TOOL_NOT_AVAILABLE'
  );
  assert.equal(backend.requests.some((r) => r.url === '/v2/map'), false);
  assertNoTypeError(stderr);
});

test('HTTP cloud keyless parse phase 1 mints upload-url without API key or local file read', async (t) => {
  const backend = await startFakeFirecrawlBackend({ keylessEligible: true });
  t.after(() => backend.close());

  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: backend.url,
    FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'introspect-secret',
    FIRECRAWL_OAUTH_ISSUER: backend.url,
    HTTP_STREAMABLE_SERVER: 'true',
    KEYLESS_PROXY_SECRET: 'keyless-secret',
    PORT: String(port),
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  t.after(() => stopChild(child));

  await waitForHealth(port, child);

  const toolCall = await httpToolCall(port, {
    id: 42,
    headers: {
      'x-forwarded-for': '8.8.8.42',
      'x-request-id': 'req-keyless-parse-upload-url',
    },
    params: {
      arguments: {
        contentType: 'application/pdf',
        declaredSizeBytes: 12345,
        filePath: '/definitely/not/read/keyless-report.pdf',
        formats: ['markdown'],
        parsers: ['pdf'],
        zeroDataRetention: true,
      },
      name: 'firecrawl_parse',
    },
  });
  assert.equal(toolCall.status, 200);
  const message = parseSseJson(await toolCall.text());
  assert.notEqual(message.result.isError, true);
  const payload = JSON.parse(message.result.content[0].text);
  assert.equal(payload.success, true);
  assert.equal(payload.mode, 'hosted-upload-ref-awaiting-upload');
  assert.equal(payload.upload.uploadRef, 'upload-ref-keyless-1');
  assert.match(
    payload.upload.command,
    /--upload-file '\/definitely\/not\/read\/keyless-report\.pdf'/
  );
  assert.equal(payload.upload.command.includes('fc-'), false);
  assert.deepEqual(payload.nextToolCall, {
    arguments: {
      formats: ['markdown'],
      parsers: ['pdf'],
      uploadRef: 'upload-ref-keyless-1',
      zeroDataRetention: true,
    },
    name: 'firecrawl_parse',
  });

  const uploadUrlCalls = backend.requests.filter(
    (request) => request.url === '/v2/parse/upload-url'
  );
  assert.equal(uploadUrlCalls.length, 1);
  assert.equal(uploadUrlCalls[0].headers.authorization, undefined);
  assert.equal(
    uploadUrlCalls[0].headers['x-firecrawl-keyless-ip'],
    '8.8.8.42'
  );
  assert.equal(
    uploadUrlCalls[0].headers['x-firecrawl-keyless-secret'],
    'keyless-secret'
  );
  assert.deepEqual(uploadUrlCalls[0].body, {
    contentType: 'application/pdf',
    declaredSizeBytes: 12345,
    filename: 'keyless-report.pdf',
  });
  assert.equal(
    backend.requests.some((request) => request.url === '/v2/parse'),
    false
  );

  const traces = parseActionTraces(stderr);
  assert.deepEqual(
    traces.map((trace) => trace.status),
    ['started', 'success']
  );
  for (const trace of traces) {
    assert.equal(trace.toolName, 'firecrawl_parse');
    assert.equal(trace.authType, 'keyless');
    assert.equal(Object.hasOwn(trace, 'keylessClientIp'), false);
    assert.notEqual(trace.requestId, 'req-keyless-parse-upload-url');
  }
  assert.equal(stderr.includes('8.8.8.42'), false);
  assert.equal(stderr.includes('keyless-secret'), false);
  assertNoTypeError(stderr);
});

test('HTTP cloud keyless parse phase 2 forwards uploadRef without API key', async (t) => {
  const backend = await startFakeFirecrawlBackend({ keylessEligible: true });
  t.after(() => backend.close());

  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: backend.url,
    FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'introspect-secret',
    FIRECRAWL_OAUTH_ISSUER: backend.url,
    HTTP_STREAMABLE_SERVER: 'true',
    KEYLESS_PROXY_SECRET: 'keyless-secret',
    PORT: String(port),
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  t.after(() => stopChild(child));

  await waitForHealth(port, child);

  const toolCall = await httpToolCall(port, {
    id: 43,
    headers: {
      'x-forwarded-for': '8.8.8.43',
      'x-request-id': 'req-keyless-parse-upload-ref',
    },
    params: {
      arguments: {
        formats: ['markdown'],
        parsers: ['pdf'],
        uploadRef: 'upload-ref-keyless-1',
        zeroDataRetention: true,
      },
      name: 'firecrawl_parse',
    },
  });
  assert.equal(toolCall.status, 200);
  const message = parseSseJson(await toolCall.text());
  assert.notEqual(message.result.isError, true);
  assert.deepEqual(JSON.parse(message.result.content[0].text), {
    data: {
      markdown: '# Parsed keyless upload',
      metadata: { uploadRef: 'upload-ref-keyless-1' },
    },
    success: true,
  });

  const parseCalls = backend.requests.filter(
    (request) => request.url === '/v2/parse'
  );
  assert.equal(parseCalls.length, 1);
  assert.equal(parseCalls[0].headers.authorization, undefined);
  assert.equal(
    parseCalls[0].headers['x-firecrawl-keyless-ip'],
    '8.8.8.43'
  );
  assert.equal(
    parseCalls[0].headers['x-firecrawl-keyless-secret'],
    'keyless-secret'
  );
  assert.deepEqual(parseCalls[0].body, {
    formats: ['markdown'],
    origin: 'mcp-fastmcp',
    parsers: ['pdf'],
    uploadRef: 'upload-ref-keyless-1',
    zeroDataRetention: true,
  });
  assert.equal(
    backend.requests.some((request) => request.url === '/v2/parse/upload-url'),
    false
  );

  const traces = parseActionTraces(stderr);
  assert.deepEqual(
    traces.map((trace) => trace.status),
    ['started', 'success']
  );
  for (const trace of traces) {
    assert.equal(trace.toolName, 'firecrawl_parse');
    assert.equal(trace.authType, 'keyless');
    assert.equal(Object.hasOwn(trace, 'keylessClientIp'), false);
    assert.notEqual(trace.requestId, 'req-keyless-parse-upload-ref');
  }
  assert.equal(stderr.includes('8.8.8.43'), false);
  assert.equal(stderr.includes('keyless-secret'), false);
  assertNoTypeError(stderr);
});

test('HTTP cloud keyless rejects nested or private forwarded IP identity', async (t) => {
  const backend = await startFakeFirecrawlBackend({ keylessEligible: true });
  t.after(() => backend.close());

  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: backend.url,
    FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'introspect-secret',
    FIRECRAWL_OAUTH_ISSUER: backend.url,
    HTTP_STREAMABLE_SERVER: 'true',
    KEYLESS_PROXY_SECRET: 'keyless-secret',
    PORT: String(port),
  });
  t.after(() => stopChild(child));
  await waitForHealth(port, child);

  for (const xff of ['8.8.8.8, 10.0.0.1', '10.0.0.1', '::1']) {
    const response = await httpToolCall(port, {
      id: 95,
      headers: { 'x-forwarded-for': xff },
      params: {
        arguments: { limit: 1, query: 'example domain' },
        name: 'firecrawl_search',
      },
    });
    assert.equal(response.status, 200, xff);
    const message = parseSseJson(await response.text());
    assert.equal(message.result?.isError, true, xff);
    assert.match(JSON.stringify(message.result), /KEYLESS_ACCESS_NOT_AVAILABLE/);
  }
  assert.equal(backend.requests.some((r) => r.url === '/v2/search'), false);
});

test('HTTP cloud transport returns structured keyless recovery with no forwarded IP', async (t) => {
  const backend = await startFakeFirecrawlBackend({ keylessEligible: true });
  t.after(() => backend.close());

  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: backend.url,
    FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'introspect-secret',
    FIRECRAWL_OAUTH_ISSUER: backend.url,
    HTTP_STREAMABLE_SERVER: 'true',
    KEYLESS_PROXY_SECRET: 'keyless-secret',
    PORT: String(port),
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  t.after(() => stopChild(child));

  await waitForHealth(port, child);

  // No x-forwarded-for and no credential: per-IP cap is unenforceable, so the
  // server keeps transport headless-safe and returns model-visible recovery.
  const toolCall = await httpToolCall(port, {
    id: 14,
    headers: {},
    params: {
      arguments: { limit: 1, query: 'example domain' },
      name: 'firecrawl_search',
    },
  });
  assert.equal(toolCall.status, 200);
  const message = parseSseJson(await toolCall.text());
  assert.equal(message.result?.isError, true);
  assert.match(JSON.stringify(message.result), /KEYLESS_ACCESS_NOT_AVAILABLE/);
  assert.equal(
    backend.requests.some((r) => r.url === '/v2/search'),
    false
  );
  assertNoTypeError(stderr);
});

for (const [status, expectedCode] of [
  [401, 'KEYLESS_ACCESS_NOT_AVAILABLE'],
  [403, 'KEYLESS_ACCESS_NOT_AVAILABLE'],
  [429, 'KEYLESS_QUOTA_EXHAUSTED'],
]) {
  test(`HTTP cloud keyless tool calls convert upstream ${status} into structured recovery`, async (t) => {
    const backend = await startFakeFirecrawlBackend({
      keylessEligible: true,
      searchStatus: status,
    });
    t.after(() => backend.close());

    const port = await getFreePort();
    const child = spawnServer({
      CLOUD_SERVICE: 'true',
      FASTMCP_ENDPOINT: '/v2/mcp',
      FIRECRAWL_API_URL: backend.url,
      FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'introspect-secret',
      FIRECRAWL_OAUTH_ISSUER: backend.url,
      HTTP_STREAMABLE_SERVER: 'true',
      KEYLESS_PROXY_SECRET: 'keyless-secret',
      PORT: String(port),
    });
    t.after(() => stopChild(child));
    await waitForHealth(port, child);

    const toolCall = await httpToolCall(port, {
      id: `upstream-${status}`,
      headers: { 'x-forwarded-for': '8.8.8.41' },
      params: {
        arguments: { limit: 1, query: 'example domain' },
        name: 'firecrawl_search',
      },
    });
    assert.equal(toolCall.status, 200);
    const message = parseSseJson(await toolCall.text());
    assert.equal(message.result?.isError, true);
    assert.match(JSON.stringify(message.result), new RegExp(expectedCode));
    if (status === 429) {
      assert.match(JSON.stringify(message.result), /retry_after_seconds[^}]*7/);
    }
  });
}

test('HTTP cloud tool calls emit an error action trace when the tool throws', async (t) => {
  // Keyless search routes through keylessPost, which throws on a non-2xx
  // upstream — the deterministic way to drive the execute wrapper's catch path.
  const backend = await startFakeFirecrawlBackend({
    keylessEligible: true,
    searchStatus: 500,
  });
  t.after(() => backend.close());

  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: backend.url,
    FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'introspect-secret',
    FIRECRAWL_OAUTH_ISSUER: backend.url,
    HTTP_STREAMABLE_SERVER: 'true',
    KEYLESS_PROXY_SECRET: 'keyless-secret',
    PORT: String(port),
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  t.after(() => stopChild(child));

  await waitForHealth(port, child);

  const toolCall = await httpToolCall(port, {
    id: 40,
    headers: {
      'x-forwarded-for': '8.8.8.40',
      'x-request-id': 'req-err-trace',
    },
    params: {
      arguments: { limit: 1, query: 'example domain' },
      name: 'firecrawl_search',
    },
  });
  // The upstream failure surfaces as an MCP tool error, not a transport failure.
  assert.equal(toolCall.status, 200);
  const message = parseSseJson(await toolCall.text());
  assert.equal(message.result.isError, true);

  const traces = parseActionTraces(stderr);
  assert.deepEqual(
    traces.map((trace) => trace.status),
    ['started', 'error']
  );
  assert.equal(traces[1].toolName, 'firecrawl_search');
  assert.match(traces[1].requestId, /^[0-9a-f-]{36}$/);
  assert.notEqual(traces[1].requestId, 'req-err-trace');
  // Even on the error path the trace must not leak the client IP or the secret.
  assert.equal(stderr.includes('8.8.8.40'), false);
  assert.equal(stderr.includes('keyless-secret'), false);
  assertNoTypeError(stderr);
});

test('HTTP cloud scrape rejects non-public and credentialed URLs before API calls', async (t) => {
  const backend = await startFakeFirecrawlBackend();
  t.after(() => backend.close());

  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: backend.url,
    FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'introspect-secret',
    FIRECRAWL_OAUTH_ISSUER: backend.url,
    HTTP_STREAMABLE_SERVER: 'true',
    PORT: String(port),
  });
  t.after(() => stopChild(child));
  await waitForHealth(port, child);

  for (const url of [
    'http://localhost/',
    'http://127.0.0.1/',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
    'http://[2002:7f00:1::1]/',
    'http://[64:ff9b::7f00:1]/',
    'http://169.254.169.254/latest/meta-data/',
    'https://user:pass@example.com/',
  ]) {
    const response = await httpToolCall(port, {
      id: 96,
      headers: { authorization: 'Bearer fc-url-guard' },
      params: {
        arguments: { formats: ['markdown'], url },
        name: 'firecrawl_scrape',
      },
    });
    assert.equal(response.status, 200, url);
    const message = parseSseJson(await response.text());
    assert.equal(message.result.isError, true, url);
  }
  assert.equal(backend.requests.some((r) => r.url === '/v2/scrape'), false);
});

test('HTTP cloud readiness separates liveness from launch-required configuration', async (t) => {
  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    HTTP_STREAMABLE_SERVER: 'true',
    PORT: String(port),
  });
  t.after(() => stopChild(child));
  await waitForHealth(port, child);

  const unready = await fetch(`http://127.0.0.1:${port}/ready`);
  assert.equal(unready.status, 503);
  const body = await unready.json();
  assert.equal(body.ok, false);
  assert.ok(body.failures.some((failure) => failure.includes('FIRECRAWL_API_URL')));

  const missingKeylessPort = await getFreePort();
  const missingKeylessChild = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: 'https://api.firecrawl.dev',
    FIRECRAWL_MCP_ACTION_LOG_SECRET: 'action-log-secret',
    FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'introspect-secret',
    HTTP_STREAMABLE_SERVER: 'true',
    PORT: String(missingKeylessPort),
  });
  t.after(() => stopChild(missingKeylessChild));
  await waitForHealth(missingKeylessPort, missingKeylessChild);

  const missingKeyless = await fetch(
    `http://127.0.0.1:${missingKeylessPort}/ready`
  );
  assert.equal(missingKeyless.status, 503);
  const missingKeylessBody = await missingKeyless.json();
  assert.equal(missingKeylessBody.ok, false);
  assert.deepEqual(missingKeylessBody.failures, [
    'KEYLESS_PROXY_SECRET is required',
  ]);

  const readyPort = await getFreePort();
  const readyChild = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: 'https://api.firecrawl.dev',
    FIRECRAWL_MCP_ACTION_LOG_SECRET: 'action-log-secret',
    FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'introspect-secret',
    HTTP_STREAMABLE_SERVER: 'true',
    KEYLESS_PROXY_SECRET: 'keyless-secret',
    PORT: String(readyPort),
  });
  t.after(() => stopChild(readyChild));
  await waitForHealth(readyPort, readyChild);

  const ready = await fetch(`http://127.0.0.1:${readyPort}/ready`);
  assert.equal(ready.status, 200);
  assert.deepEqual(await ready.json(), { ok: true });

  const keylessWrongResourcePort = await getFreePort();
  const keylessWrongResourceChild = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: 'https://api.firecrawl.dev',
    FIRECRAWL_MCP_ACTION_LOG_SECRET: 'action-log-secret',
    FIRECRAWL_MCP_RESOURCE_URL: 'https://mcp.firecrawl.dev/v2/mcp-oauth',
    FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'introspect-secret',
    HTTP_STREAMABLE_SERVER: 'true',
    KEYLESS_PROXY_SECRET: 'keyless-secret',
    PORT: String(keylessWrongResourcePort),
  });
  t.after(() => stopChild(keylessWrongResourceChild));
  await waitForHealth(keylessWrongResourcePort, keylessWrongResourceChild);

  const keylessWrongResource = await fetch(
    `http://127.0.0.1:${keylessWrongResourcePort}/ready`
  );
  assert.equal(keylessWrongResource.status, 503);
  const keylessWrongResourceBody = await keylessWrongResource.json();
  assert.deepEqual(keylessWrongResourceBody.failures, [
    'FIRECRAWL_MCP_RESOURCE_URL must equal https://mcp.firecrawl.dev/v2/mcp when FASTMCP_ENDPOINT is /v2/mcp',
  ]);

  const spoofedOriginPort = await getFreePort();
  const spoofedOriginChild = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp-search',
    FIRECRAWL_API_URL: 'https://api.firecrawl.dev',
    FIRECRAWL_MCP_ACTION_LOG_SECRET: 'action-log-secret',
    FIRECRAWL_MCP_RESOURCE_URL: 'https://attacker.example/v2/mcp-search',
    FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'introspect-secret',
    HTTP_STREAMABLE_SERVER: 'true',
    PORT: String(spoofedOriginPort),
  });
  t.after(() => stopChild(spoofedOriginChild));
  await waitForHealth(spoofedOriginPort, spoofedOriginChild);

  const spoofedOrigin = await fetch(
    `http://127.0.0.1:${spoofedOriginPort}/ready`
  );
  assert.equal(spoofedOrigin.status, 503);
  assert.deepEqual((await spoofedOrigin.json()).failures, [
    'FIRECRAWL_MCP_RESOURCE_URL must equal https://mcp.firecrawl.dev/v2/mcp-search when FASTMCP_ENDPOINT is /v2/mcp-search',
  ]);

  const oauthReadyPort = await getFreePort();
  const oauthReadyChild = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp-oauth',
    FIRECRAWL_API_URL: 'https://api.firecrawl.dev',
    FIRECRAWL_MCP_ACTION_LOG_SECRET: 'action-log-secret',
    FIRECRAWL_MCP_RESOURCE_URL: 'https://mcp.firecrawl.dev/v2/mcp-oauth',
    FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'introspect-secret',
    HTTP_STREAMABLE_SERVER: 'true',
    PORT: String(oauthReadyPort),
  });
  t.after(() => stopChild(oauthReadyChild));
  await waitForHealth(oauthReadyPort, oauthReadyChild);

  const oauthReady = await fetch(`http://127.0.0.1:${oauthReadyPort}/ready`);
  assert.equal(oauthReady.status, 200);
  assert.deepEqual(await oauthReady.json(), { ok: true });

  const oauthWrongResourcePort = await getFreePort();
  const oauthWrongResourceChild = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp-oauth',
    FIRECRAWL_API_URL: 'https://api.firecrawl.dev',
    FIRECRAWL_MCP_ACTION_LOG_SECRET: 'action-log-secret',
    FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'introspect-secret',
    HTTP_STREAMABLE_SERVER: 'true',
    PORT: String(oauthWrongResourcePort),
  });
  t.after(() => stopChild(oauthWrongResourceChild));
  await waitForHealth(oauthWrongResourcePort, oauthWrongResourceChild);

  const oauthWrongResource = await fetch(
    `http://127.0.0.1:${oauthWrongResourcePort}/ready`
  );
  assert.equal(oauthWrongResource.status, 503);
  const oauthWrongResourceBody = await oauthWrongResource.json();
  assert.deepEqual(oauthWrongResourceBody.failures, [
    'FIRECRAWL_MCP_RESOURCE_URL must equal https://mcp.firecrawl.dev/v2/mcp-oauth when FASTMCP_ENDPOINT is /v2/mcp-oauth',
  ]);
});

test('stdio transport does not emit MCP action traces', async (t) => {
  const fakeApi = await startFakeFirecrawlApi();
  t.after(() => fakeApi.close());

  const child = spawnServer({
    FIRECRAWL_API_KEY: 'fc-test',
    FIRECRAWL_API_URL: fakeApi.url,
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  t.after(() => stopChild(child));

  const client = new StdioMcpClient(child);
  await client.request('initialize', {
    capabilities: {},
    clientInfo: { name: 'stdio-trace-guard', version: '0.0.0' },
    protocolVersion: '2025-06-18',
  });
  client.notify('notifications/initialized');
  const result = await client.request('tools/call', {
    arguments: { limit: 1, query: 'example domain' },
    name: 'firecrawl_search',
  });
  assert.notEqual(result.isError, true);

  // Action traces are a hosted/HTTP concern; stdio must stay silent so local
  // runs don't spray audit JSON (or request metadata) into the user's console.
  assert.equal(stderr.includes('[MCP_ACTION]'), false, stderr);
  assertNoTypeError(stderr);
});

test('HTTP cloud keyless sessions cannot call a non-keyless tool', async (t) => {
  const backend = await startFakeFirecrawlBackend({ keylessEligible: true });
  t.after(() => backend.close());

  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: backend.url,
    FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'introspect-secret',
    FIRECRAWL_OAUTH_ISSUER: backend.url,
    HTTP_STREAMABLE_SERVER: 'true',
    KEYLESS_PROXY_SECRET: 'keyless-secret',
    PORT: String(port),
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  t.after(() => stopChild(child));

  await waitForHealth(port, child);

  // A keyless client that ignores tools/list and directly calls a gated tool
  // must be rejected by canAccess at call time, not merely hidden from listing.
  const toolCall = await httpToolCall(port, {
    id: 41,
    headers: { 'x-forwarded-for': '8.8.8.41' },
    params: {
      arguments: { url: 'https://example.com' },
      name: 'firecrawl_map',
    },
  });
  const bodyText = await toolCall.text();
  let mapSucceeded = false;
  try {
    const message = parseSseJson(bodyText);
    mapSucceeded =
      Boolean(message.result) &&
      message.result.isError !== true &&
      /"links"/.test(JSON.stringify(message.result));
  } catch {
    mapSucceeded = false;
  }
  assert.equal(
    mapSucceeded,
    false,
    `keyless map call must be rejected: ${bodyText.slice(0, 200)}`
  );
  // The gated tool must never reach the upstream API for a keyless session.
  assert.equal(
    backend.requests.some((r) => r.url === '/v2/map'),
    false
  );
  assertNoTypeError(stderr);
});
