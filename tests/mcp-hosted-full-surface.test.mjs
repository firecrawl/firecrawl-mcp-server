import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import net from 'node:net';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { assertAgentMetadataPolicy } from '../scripts/agent-metadata-policy.mjs';


// Hosted-mode (CLOUD_SERVICE=true) behaviour of the full tool surface.

async function getFreePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

async function waitForHealth(port, child) {
  const url = `http://127.0.0.1:${port}/health`;
  let lastError;
  for (let i = 0; i < 60; i += 1) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early with code ${child.exitCode}`);
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
    env: {
      ...process.env,
      MCP_DELEGATED_CREDENTIAL_SECRET:
        'test-mcp-delegated-credential-secret-32',
      ...env,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stderr.setEncoding('utf8');
  child.stdout.setEncoding('utf8');
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

// Fake origin standing in for both the Firecrawl API (/v2/search) and the OAuth
// issuer (/api/oauth/introspect). Introspection echoes a configurable audience
// so audience-enforcement can be exercised.
async function startFakeBackend(options = {}) {
  const {
    apiKeyFromIntrospection = 'fc-from-introspection',
    introspectionAud,
  } = options;
  const requests = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    req.setEncoding('utf8');
    for await (const chunk of req) raw += chunk;

    const contentType = req.headers['content-type'] ?? '';
    let body;
    if (raw && contentType.includes('application/json')) {
      body = JSON.parse(raw);
    } else if (raw && contentType.includes('application/x-www-form-urlencoded')) {
      body = Object.fromEntries(new URLSearchParams(raw));
    }
    requests.push({ body, headers: req.headers, method: req.method, url: req.url });

    if (req.method === 'POST' && req.url === '/api/oauth/introspect') {
      const token = body?.token ?? '';
      const active = /^(?:fco_|fc-)/.test(token) && !token.includes('invalid');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify(
          active
            ? {
                active: true,
                api_key: token.startsWith('fc-')
                  ? token
                  : apiKeyFromIntrospection,
                credential_purpose: token.startsWith('fco_')
                  ? 'hosted_mcp_oauth'
                  : 'general',
                scope: 'firecrawl:global',
                ...(introspectionAud ? { aud: introspectionAud } : {}),
              }
            : { active: false }
        )
      );
      return;
    }

    // Core, not introspection, decides whether a forwarded API key is valid.
    if (/Bearer fc-\S*invalid/.test(req.headers.authorization ?? '')) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized: Invalid token', success: false }));
      return;
    }

    if (req.method === 'GET' && req.url?.startsWith('/v2/search/developer')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          results: [
            {
              id: 'issue:firecrawl/firecrawl#1',
              passages: [{ text: 'The matched passage.' }],
              title: 'Fix the retry loop',
              url: 'https://github.com/firecrawl/firecrawl/issues/1',
            },
          ],
        })
      );
      return;
    }

    if (req.method === 'GET' && req.url?.startsWith('/v2/search/gov')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          data: {
            web: [
              {
                description: 'The matched snippet.',
                position: 1,
                title: '21 CFR Part 101 -- Food Labeling',
                url: 'https://www.ecfr.gov/current/title-21/part-101',
              },
            ],
          },
        })
      );
      return;
    }

    if (req.method === 'POST' && req.url === '/v2/scrape') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          scrape_id: 'scrape-1',
          requestId: req.headers['x-request-id'] ?? 'req-1',
          data: {
            creditsCost: 1,
            alexandria: [
              {
                provider: 'particle',
                capability: 'podcasts/episodes/search',
                creditsCost: 1,
                data: { episodes: [] },
              },
            ],
          },
        })
      );
      return;
    }

    if (req.method === 'POST' && req.url === '/v2/search') {
      // The developer category returns developer-tagged hits in the standard
      // web group, matching the live Search response shape.
      const wantsDeveloper = (body?.categories ?? []).some((category) =>
        typeof category === 'string'
          ? category === 'developer'
          : category?.type === 'developer'
      );
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          creditsUsed: 1,
          data: {
            web: wantsDeveloper
              ? [
                  {
                    category: 'developer',
                    description: 'The matched passage.',
                    title: 'Fix the retry loop',
                    url: 'https://github.com/firecrawl/firecrawl/issues/1',
                  },
                ]
              : [{ title: 'Example Domain', url: 'https://example.com/' }],
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
  const { port } = server.address();
  return {
    requests,
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

// Spawn a hosted server with both the full and search instances running, and
// wait until the search instance is healthy. Returns ports + a stderr accessor.
async function startHostedServer(t, extraEnv = {}) {
  const defaultBackend = await startFakeBackend();
  t.after(() => defaultBackend.close());
  const fullPort = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    HTTP_STREAMABLE_SERVER: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'test-secret',
    KEYLESS_PROXY_SECRET: 'delegation-secret',
    FIRECRAWL_API_URL: defaultBackend.url,
    FIRECRAWL_OAUTH_ISSUER: defaultBackend.url,
    PORT: String(fullPort),
    ...extraEnv,
  });
  let stderr = '';
  let stdout = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  t.after(() => stopChild(child));
  await waitForHealth(fullPort, child);
  return {
    backendRequests: defaultBackend.requests,
    child,
    fullPort,
    issuerUrl: extraEnv.FIRECRAWL_OAUTH_ISSUER ?? defaultBackend.url,
    getStderr: () => stderr,
    getStdout: () => stdout,
  };
}

function jsonRpc(port, endpoint, { id, method, params = {}, headers = {} }) {
  return fetch(`http://127.0.0.1:${port}${endpoint}`, {
    body: JSON.stringify({ id, jsonrpc: '2.0', method, params }),
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'user-agent': 'firecrawl-search-profile-test/1.0.0',
      ...headers,
    },
    method: 'POST',
  });
}

async function listToolDefinitions(port, endpoint, headers) {
  const res = await jsonRpc(port, endpoint, {
    id: 1,
    method: 'tools/list',
    headers,
  });
  assert.equal(res.status, 200, `tools/list returned ${res.status}`);
  const message = parseSseJson(await res.text());
  return message.result.tools;
}

async function initializeProfile(port, endpoint, headers) {
  const res = await jsonRpc(port, endpoint, {
    id: 0,
    method: 'initialize',
    params: {
      capabilities: {},
      clientInfo: { name: 'firecrawl-search-profile-test', version: '1.0.0' },
      protocolVersion: '2025-06-18',
    },
    headers,
  });
  assert.equal(res.status, 200, `initialize returned ${res.status}`);
  return parseSseJson(await res.text()).result;
}

async function listTools(port, endpoint, headers) {
  const tools = await listToolDefinitions(port, endpoint, headers);
  return tools.map((tool) => tool.name);
}

test('the hidden github tool answers cached callers with a DEPRECATED_TOOL payload', async (t) => {
  const backend = await startFakeBackend();
  t.after(() => backend.close());
  const { fullPort } = await startHostedServer(t, {
    FIRECRAWL_API_URL: backend.url,
  });

  // Not on tools/list, but a session that cached the old list must get a
  // pointer to the replacement, not unknown tool.
  const res = await jsonRpc(fullPort, '/v2/mcp', {
    id: 9,
    method: 'tools/call',
    params: {
      arguments: { query: 'milvus hybrid search' },
      name: 'firecrawl_research_search_github',
    },
    headers: { 'x-api-key': 'fc-test' },
  });
  const message = parseSseJson(await res.text());
  assert.equal(message.result?.isError, true, JSON.stringify(message));
  assert.equal(message.result.structuredContent.code, 'DEPRECATED_TOOL');
  assert.equal(
    message.result.structuredContent.replacement.name,
    'firecrawl_developer_search'
  );
  assert.equal(
    backend.requests.some((r) => r.url.includes('/research/github')),
    false,
    'must not reach the upstream endpoint'
  );
});

test('search categories reject github before calling the API', async (t) => {
  const backend = await startFakeBackend();
  t.after(() => backend.close());
  const { fullPort } = await startHostedServer(t, {
    FIRECRAWL_API_URL: backend.url,
  });

  for (const [port, endpoint] of [[fullPort, '/v2/mcp']]) {
    const tools = await listToolDefinitions(port, endpoint, { 'x-api-key': 'fc-test' });
    const search = tools.find((tool) => tool.name === 'firecrawl_search');
    assert.deepEqual(search.inputSchema.properties.categories.items.enum, [
      'research', 'pdf', 'developer', 'gov',
    ]);
    const res = await jsonRpc(port, endpoint, {
      id: 40,
      method: 'tools/call',
      params: {
        name: 'firecrawl_search',
        arguments: { query: 'retry loop backoff', categories: ['github'] },
      },
      headers: { 'x-api-key': 'fc-test' },
    });
    const message = parseSseJson(await res.text());
    assert.ok(message.error || message.result?.isError, JSON.stringify(message));
  }
  assert.equal(backend.requests.some((r) => r.url === '/v2/search'), false);
});

test('full surface exposes its complete tool set', async (t) => {
  const { backendRequests, fullPort } = await startHostedServer(t);

  const names = await listTools(fullPort, '/v2/mcp', { 'x-api-key': 'fc-test' });
  assert.ok(names.includes('firecrawl_scrape'));
  assert.ok(names.includes('firecrawl_search'));
  assert.ok(names.includes('firecrawl_developer_search'));
  assert.ok(names.includes('firecrawl_gov_search'));
  assert.ok(names.includes('firecrawl_parse'));
  assert.equal(
    backendRequests.filter((request) => request.url === '/api/oauth/introspect').length,
    0,
    'the full route must not introspect raw API keys'
  );

  // The anonymous full surface accepts credentials but does not advertise
  // OAuth, so clients do not start login while configuring keyless MCP.
  const prm = await fetch(
    `http://127.0.0.1:${fullPort}/.well-known/oauth-protected-resource`
  );
  assert.equal(prm.status, 404);
});

test('full surface forwards optional search context only when supplied', async (t) => {
  const { backendRequests, fullPort } = await startHostedServer(t);
  const headers = { 'x-api-key': 'fc-test' };
  const call = async (arguments_) => {
    const response = await jsonRpc(fullPort, '/v2/mcp', {
      id: 15,
      method: 'tools/call',
      params: { name: 'firecrawl_search', arguments: arguments_ },
      headers,
    });
    assert.equal(response.status, 200);
    const message = parseSseJson(await response.text());
    assert.notEqual(message.result?.isError, true, JSON.stringify(message));
  };

  await call({ query: 'React memo docs', sources: ['web'] });
  await call({
    query: 'React memo docs',
    sources: ['web'],
    objective: 'Find official rerender guidance',
    clientModel: 'claude-sonnet-4-6',
  });

  const searches = backendRequests.filter((request) => request.url === '/v2/search');
  assert.equal(searches.length, 2);
  for (const field of ['objective', 'clientModel']) {
    assert.equal(field in searches[0].body, false);
  }
  assert.equal(searches[1].body.objective, 'Find official rerender guidance');
  assert.equal(searches[1].body.clientModel, 'claude-sonnet-4-6');
});

test('keyless full-surface instructions satisfy the same metadata policy gates', async (t) => {
  // FASTMCP_ENDPOINT '/v2/mcp' (not '/v2/mcp-oauth') makes this the keyless
  // profile, whose instructions must stay descriptive rather than becoming an
  // imperative routing playbook.
  const { fullPort } = await startHostedServer(t);
  const headers = { 'x-api-key': 'fc-keyless-metadata' };
  const initialize = await initializeProfile(fullPort, '/v2/mcp', headers);
  const tools = await listToolDefinitions(fullPort, '/v2/mcp', headers);

  assertAgentMetadataPolicy(
    [initialize.instructions, ...tools.map((tool) => tool.description ?? '')],
    assert
  );
});

