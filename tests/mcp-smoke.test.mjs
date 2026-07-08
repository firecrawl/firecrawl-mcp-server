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

    const parsedBody = body ? JSON.parse(body) : undefined;
    requests.push({
      body: parsedBody,
      headers: req.headers,
      method: req.method,
      url: req.url,
    });

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
      api_key_id: 123,
      aud: 'https://mcp.firecrawl.dev/v2/mcp',
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
                api_key: apiKeyFromIntrospection,
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
        res.writeHead(searchStatus, { 'content-type': 'application/json' });
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
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          data: {
            markdown: '# Example Domain',
            metadata: { sourceURL: parsedBody?.url },
          },
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

async function httpToolCall(port, { id, headers, params }) {
  return fetch(`http://127.0.0.1:${port}/v2/mcp`, {
    body: JSON.stringify({ id, jsonrpc: '2.0', method: 'tools/call', params }),
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      ...headers,
    },
    method: 'POST',
  });
}

test('HTTP cloud transport preserves Firecrawl OAuth and well-known routes', async (t) => {
  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    HTTP_STREAMABLE_SERVER: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'test-secret',
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
    authorization_servers: ['https://www.firecrawl.dev'],
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
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  assert.equal(unauthenticated.status, 401);
  assert.equal(
    unauthenticated.headers.get('www-authenticate'),
    'Bearer resource_metadata="https://mcp.firecrawl.dev/.well-known/oauth-protected-resource", error="invalid_token", error_description="Firecrawl credentials required: OAuth access token (Authorization: Bearer fco_...) or API key (x-firecrawl-api-key)"'
  );
  assert.deepEqual(await unauthenticated.json(), {
    error: 'invalid_token',
    error_description:
      'Firecrawl credentials required: OAuth access token (Authorization: Bearer fco_...) or API key (x-firecrawl-api-key)',
  });

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

  assert.equal(stderr.includes('TypeError'), false, stderr);
});

test('HTTP cloud transport calls Firecrawl API with authenticated session', async (t) => {
  const fakeApi = await startFakeFirecrawlApi();
  t.after(() => fakeApi.close());

  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: fakeApi.url,
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

  assert.equal(fakeApi.requests.length, 1);
  assert.equal(fakeApi.requests[0].method, 'POST');
  assert.equal(fakeApi.requests[0].url, '/v2/search');
  assert.equal(
    fakeApi.requests[0].headers.authorization,
    'Bearer fc-http-test'
  );
  assert.deepEqual(fakeApi.requests[0].body, {
    limit: 1,
    origin: 'mcp-fastmcp',
    query: 'example domain',
  });
  assert.equal(stderr.includes('TypeError'), false, stderr);
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
  assert.equal(stderr.includes('TypeError'), false, stderr);
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
  assert.equal(stderr.includes('TypeError'), false, stderr);
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
  assert.equal(stderr.includes('TypeError'), false, stderr);
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
  // per-request memoization must dedupe FastMCP's + mcp-proxy's auth calls),
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
  assert.equal(stderr.includes('TypeError'), false, stderr);
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
  assert.equal(stderr.includes('TypeError'), false, stderr);
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
  assert.equal(stderr.includes('TypeError'), false, stderr);
});

test('HTTP cloud transport accepts the x-firecrawl-api-key header', async (t) => {
  const backend = await startFakeFirecrawlBackend();
  t.after(() => backend.close());

  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: backend.url,
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
  assert.equal(stderr.includes('TypeError'), false, stderr);
});

test('HTTP cloud transport accepts bearer API-key fallback for headless clients', async (t) => {
  const backend = await startFakeFirecrawlBackend();
  t.after(() => backend.close());

  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: backend.url,
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
  assert.equal(stderr.includes('TypeError'), false, stderr);
});

test('HTTP cloud transport accepts the x-api-key header alias', async (t) => {
  const backend = await startFakeFirecrawlBackend();
  t.after(() => backend.close());

  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: backend.url,
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
  assert.equal(stderr.includes('TypeError'), false, stderr);
});

test('HTTP cloud authenticated sessions expose the full Firecrawl tool surface', async (t) => {
  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
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
  assert.equal(stderr.includes('TypeError'), false, stderr);
});

test('HTTP cloud transport serves an eligible keyless client and forwards its IP', async (t) => {
  const backend = await startFakeFirecrawlBackend({ keylessEligible: true });
  t.after(() => backend.close());

  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: backend.url,
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
    headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' },
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
    '203.0.113.7'
  );
  assert.equal(
    eligibilityCalls[0].headers['x-firecrawl-keyless-secret'],
    'keyless-secret'
  );
  assert.equal(stderr.includes('TypeError'), false, stderr);
});

test('HTTP cloud tool calls emit safe MCP action traces', async (t) => {
  const backend = await startFakeFirecrawlBackend();
  t.after(() => backend.close());

  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: backend.url,
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

  const traces = stderr
    .split(/\r?\n/)
    .filter((line) => line.includes('[MCP_ACTION]'))
    .map((line) => JSON.parse(line.slice(line.indexOf('{'))));
  assert.equal(traces.length, 2);
  assert.deepEqual(
    traces.map((trace) => trace.status),
    ['started', 'success']
  );
  for (const trace of traces) {
    assert.equal(trace.toolName, 'firecrawl_search');
    assert.equal(trace.authType, 'api-key');
    assert.equal(trace.userAgent, 'TraceClient/1.0');
    assert.match(trace.requestId, /^[0-9a-f-]{36}$/);
    assert.notEqual(trace.requestId, 'req-trace-123');
    assert.notEqual(trace.requestId, 'spoofed-jsonrpc-request-id');
    assert.match(trace.timestamp, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(Object.hasOwn(trace, 'keylessClientIp'), false);
    assert.equal(JSON.stringify(trace).includes('fc-trace-key'), false);
  }
  assert.equal(stderr.includes('TypeError'), false, stderr);
});

test('HTTP cloud OAuth sessions dual-emit safe account-visible action logs', async (t) => {
  const backend = await startFakeFirecrawlBackend({
    apiKeyFromIntrospection: 'fc-introspected-key',
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

  const toolCall = await httpToolCall(port, {
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

  const actionLogCalls = await waitFor(() => {
    const calls = backend.requests.filter(
      (r) => r.url === '/v2/mcp/action-logs'
    );
    return calls.length === 2 ? calls : null;
  }, 'expected started/success action log calls');

  assert.deepEqual(
    actionLogCalls.map((request) => request.body.status),
    ['started', 'success']
  );
  for (const request of actionLogCalls) {
    assert.equal(request.headers.authorization, 'Bearer action-log-secret');
    assert.equal(request.body.team_id, '00000000-0000-4000-8000-000000000001');
    assert.equal(request.body.user_id, '00000000-0000-4000-8000-000000000002');
    assert.equal(request.body.api_key_id, 123);
    assert.equal(request.body.oauth_client_id, 'dyn_test_client');
    assert.equal(request.body.auth_type, 'oauth');
    assert.equal(request.body.tool_name, 'firecrawl_search');
    assert.equal(request.body.user_agent, 'Claude/2.0');
    assert.equal(request.body.resource, 'https://mcp.firecrawl.dev/v2/mcp');
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
  assert.equal(stderr.includes('TypeError'), false, stderr);
});

test('HTTP cloud bearer API-key sessions dual-emit safe action logs after metadata introspection', async (t) => {
  const backend = await startFakeFirecrawlBackend({
    apiKeyFromIntrospection: 'fc-api-key',
    introspectionMetadata: {
      api_key_id: 456,
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
    return calls.length === 2 ? calls : null;
  }, 'expected API-key action log calls');

  for (const request of actionLogCalls) {
    assert.equal(request.body.team_id, '00000000-0000-4000-8000-000000000003');
    assert.equal(request.body.api_key_id, 456);
    assert.equal(request.body.auth_type, 'api-key');
    assert.equal(request.body.tool_name, 'firecrawl_search');
    assert.equal(JSON.stringify(request.body).includes('fc-api-key'), false);
  }
});

test('HTTP cloud keyless sessions can call scrape without leaking raw IP in traces', async (t) => {
  const backend = await startFakeFirecrawlBackend({ keylessEligible: true });
  t.after(() => backend.close());

  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: backend.url,
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
      'x-forwarded-for': '203.0.113.22, 10.0.0.1',
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
    '203.0.113.22'
  );
  assert.equal(
    scrapeCalls[0].headers['x-firecrawl-keyless-secret'],
    'keyless-secret'
  );

  const traces = stderr
    .split(/\r?\n/)
    .filter((line) => line.includes('[MCP_ACTION]'))
    .map((line) => JSON.parse(line.slice(line.indexOf('{'))));
  assert.equal(traces.length, 2);
  for (const trace of traces) {
    assert.equal(trace.toolName, 'firecrawl_scrape');
    assert.equal(trace.authType, 'keyless');
    assert.equal(trace.userAgent, 'KeylessTraceClient/1.0');
    assert.match(trace.requestId, /^[0-9a-f-]{36}$/);
    assert.notEqual(trace.requestId, 'req-keyless-scrape');
    assert.equal(Object.hasOwn(trace, 'keylessClientIp'), false);
  }
  assert.equal(stderr.includes('203.0.113.22'), false);
  assert.equal(stderr.includes('keyless-secret'), false);
  assert.equal(stderr.includes('TypeError'), false, stderr);
});

test('HTTP cloud keyless sessions expose only scrape and search tools', async (t) => {
  const backend = await startFakeFirecrawlBackend({ keylessEligible: true });
  t.after(() => backend.close());

  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: backend.url,
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
      'x-forwarded-for': '203.0.113.18',
    },
    method: 'POST',
  });
  assert.equal(toolsList.status, 200);
  const toolsMessage = parseSseJson(await toolsList.text());
  const toolNames = toolsMessage.result.tools.map((tool) => tool.name).sort();
  assert.deepEqual(toolNames, ['firecrawl_scrape', 'firecrawl_search']);
  assert.equal(stderr.includes('TypeError'), false, stderr);
});

test('HTTP cloud transport challenges a keyless client with no forwarded IP', async (t) => {
  const backend = await startFakeFirecrawlBackend({ keylessEligible: true });
  t.after(() => backend.close());

  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: backend.url,
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
  // server must fall through to the OAuth challenge rather than grant keyless.
  const toolCall = await httpToolCall(port, {
    id: 14,
    headers: {},
    params: {
      arguments: { limit: 1, query: 'example domain' },
      name: 'firecrawl_search',
    },
  });
  assert.equal(toolCall.status, 401);
  assert.equal(
    backend.requests.some((r) => r.url === '/v2/search'),
    false
  );
  assert.equal(stderr.includes('TypeError'), false, stderr);
});

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
      'x-forwarded-for': '203.0.113.40',
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

  const traces = stderr
    .split(/\r?\n/)
    .filter((line) => line.includes('[MCP_ACTION]'))
    .map((line) => JSON.parse(line.slice(line.indexOf('{'))));
  assert.deepEqual(
    traces.map((trace) => trace.status),
    ['started', 'error']
  );
  assert.equal(traces[1].toolName, 'firecrawl_search');
  assert.match(traces[1].requestId, /^[0-9a-f-]{36}$/);
  assert.notEqual(traces[1].requestId, 'req-err-trace');
  // Even on the error path the trace must not leak the client IP or the secret.
  assert.equal(stderr.includes('203.0.113.40'), false);
  assert.equal(stderr.includes('keyless-secret'), false);
  assert.equal(stderr.includes('TypeError'), false, stderr);
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
  assert.equal(stderr.includes('TypeError'), false, stderr);
});

test('HTTP cloud keyless sessions cannot call a non-keyless tool', async (t) => {
  const backend = await startFakeFirecrawlBackend({ keylessEligible: true });
  t.after(() => backend.close());

  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: backend.url,
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
    headers: { 'x-forwarded-for': '203.0.113.41' },
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
  assert.equal(stderr.includes('TypeError'), false, stderr);
});
