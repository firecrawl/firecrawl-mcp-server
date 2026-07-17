import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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

function spawnServer(env) {
  const child = spawn(process.execPath, ['dist/index.js'], {
    env: {
      ...process.env,
      CI: 'true',
      NODE_ENV: 'test',
      ...env,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.__stdout = '';
  child.__stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    child.__stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    child.__stderr += chunk;
  });
  return child;
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(1_000).then(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
    }),
  ]);
}

function parseSseJson(body) {
  const dataLine = body
    .split(/\r?\n/)
    .find((line) => line.startsWith('data: '));
  assert.ok(dataLine, `Missing SSE data line in body: ${body}`);
  return JSON.parse(dataLine.slice('data: '.length));
}

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
    introspectionStatus = 200,
    keylessEligible = false,
    keylessEligibilityHangs = false,
    searchRetryAfter = '60',
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
    } else if (raw && contentType.includes('application/x-www-form-urlencoded')) {
      parsedBody = Object.fromEntries(new URLSearchParams(raw));
    }

    requests.push({
      body: parsedBody,
      headers: req.headers,
      method: req.method,
      raw,
      url: req.url,
    });

    if (req.method === 'POST' && req.url === '/api/oauth/introspect') {
      if (introspectionStatus !== 200) {
        res.writeHead(introspectionStatus, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'temporary introspection failure' }));
        return;
      }
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

    if (req.method === 'GET' && req.url === '/v2/keyless/eligibility') {
      if (keylessEligibilityHangs) return;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ eligible: keylessEligible }));
      return;
    }

    if (req.method === 'POST' && req.url === '/v2/search') {
      if (searchStatus !== 200) {
        res.writeHead(searchStatus, {
          'content-type': 'application/json',
          ...(searchRetryAfter != null ? { 'retry-after': searchRetryAfter } : {}),
        });
        res.end(JSON.stringify({ error: 'quota exceeded', success: false }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          creditsUsed: 1,
          data: { web: [{ title: 'Example Domain', url: 'https://example.com/' }] },
          id: 'search-contract-1',
          success: true,
        })
      );
      return;
    }

    if (req.method === 'GET' && req.url?.startsWith('/v2/search/research/')) {
      const url = new URL(req.url, 'http://fake-firecrawl.test');
      const paper = {
        abstract: 'Attention models are useful for sequence transduction.',
        authors: 'A. Author, B. Researcher',
        categories: ['cs.CL'],
        createdDate: '2017-06-12',
        ids: { arxiv: ['1706.03762'] },
        paperId: 'arxiv:1706.03762',
        primaryId: 'arxiv:1706.03762',
        title: 'Attention Is All You Need',
        updateDate: '2017-06-13',
      };
      let responseBody;
      if (url.pathname === '/v2/search/research/papers') {
        responseBody = { results: [paper] };
      } else if (url.pathname === '/v2/search/research/papers/arxiv%3A1706.03762/similar') {
        responseBody = { note: 'contract related papers', poolSize: 1, results: [paper] };
      } else if (url.pathname === '/v2/search/research/papers/arxiv%3A1706.03762') {
        responseBody = url.searchParams.has('query')
          ? { passages: [{ text: 'The Transformer relies entirely on attention mechanisms.' }] }
          : { paper };
      } else if (url.pathname === '/v2/search/research/github') {
        responseBody = {
          results: [
            {
              contentMd: 'A repository README mentioning Firecrawl MCP research tools.',
              readmeUrl: 'https://github.com/firecrawl/firecrawl#readme',
              repo: 'firecrawl/firecrawl',
              resultType: 'repo_readme',
            },
          ],
        };
      } else {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: `Unhandled research endpoint ${req.url}` }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(responseBody));
      return;
    }

    if (req.method === 'POST' && req.url === '/v2/map') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ links: [{ url: parsedBody?.url }], success: true }));
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
    close: () => new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

function hostedEnv(port, backend, overrides = {}) {
  return {
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: backend.url,
    FIRECRAWL_MCP_ACTION_LOG_SECRET: 'action-log-secret',
    FIRECRAWL_MCP_ACTION_LOG_URL: `${backend.url}/v2/mcp/action-logs`,
    FIRECRAWL_MCP_RESOURCE_URL: 'https://mcp.firecrawl.dev/v2/mcp',
    FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'introspect-secret',
    FIRECRAWL_OAUTH_ISSUER: backend.url,
    HTTP_STREAMABLE_SERVER: 'true',
    KEYLESS_PROXY_SECRET: 'keyless-secret',
    PORT: String(port),
    ...overrides,
  };
}


const KEYLESS_TOOL_NAMES = new Set([
  'firecrawl_parse',
  'firecrawl_scrape',
  'firecrawl_search',
]);
const ANTHROPIC_SEARCH_PROFILE_TOOL_NAMES = [
  'firecrawl_research_inspect_paper',
  'firecrawl_research_read_paper',
  'firecrawl_research_related_papers',
  'firecrawl_research_search_github',
  'firecrawl_research_search_papers',
  'firecrawl_search',
];

const ANTHROPIC_SEARCH_PROFILE_TOKEN_METADATA = {
  api_key_id: '789',
  aud: 'https://mcp.firecrawl.dev/v2/mcp-search',
  scope: 'firecrawl:global',
  client_id: 'anthropic_search_client',
  sub: '00000000-0000-4000-8000-000000000006',
  team_id: '00000000-0000-4000-8000-000000000005',
};

const FROZEN_GENERIC_INSTRUCTIONS_SHA256 =
  '7e67b0d0fc16f7c99445799d6dbdc3840f5245060aa3241e49f85869c3fa901b';
const ANTHROPIC_SEARCH_INSTRUCTIONS_SHA256 =
  'cf1c1d6dad4913d73193bde96f74afa5f4ad774848bdaf7d61d9474125ead2ca';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function profileBackendRequestUrls(backend) {
  return backend.requests
    .filter((request) =>
      request.url !== '/api/oauth/introspect' &&
      request.url !== '/v2/mcp/action-logs'
    )
    .map((request) => request.url);
}

function toolNames(tools) {
  return tools.map((tool) => tool.name).sort();
}

function accountToolNamesFromRegisteredTools(tools) {
  return toolNames(tools).filter((name) => !KEYLESS_TOOL_NAMES.has(name));
}

async function mcpRequest(port, endpoint, { id = 1, method, params = {}, headers = {} } = {}) {
  return fetch(`http://127.0.0.1:${port}${endpoint}`, {
    body: JSON.stringify({ id, jsonrpc: '2.0', method, params }),
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      ...headers,
    },
    method: 'POST',
  });
}

async function initialize(port, endpoint, headers = {}) {
  return mcpRequest(port, endpoint, {
    id: 1,
    method: 'initialize',
    params: {
      capabilities: {},
      clientInfo: { name: 'hosted-contract-test', version: '0.0.0' },
      protocolVersion: '2025-06-18',
    },
    headers,
  });
}

async function parseMcpResponse(response) {
  const text = await response.text();
  return parseSseJson(text);
}

function extractStructuredPayload(message) {
  const result = message.result ?? message.error?.data;
  if (result?.structuredContent) return result.structuredContent;
  const content = result?.content ?? [];
  for (const item of content) {
    if (item?.type === 'text' && typeof item.text === 'string') {
      try {
        return JSON.parse(item.text);
      } catch {
        // Some clients receive prose plus embedded JSON. Keep scanning.
      }
    }
  }
  return result;
}

function assertRecoveryPayload(payload, expectedCode) {
  assert.equal(payload?.code, expectedCode);
  assert.equal(payload?.auth_mode, 'keyless');
  assert.match(payload?.request_id ?? '', /^[0-9a-f-]{36}$/);
  assert.equal(payload?.docs_url, 'https://docs.firecrawl.dev/mcp-server');
  assert.deepEqual(payload?.account, {
    auth_mode: 'keyless',
    connected: false,
    api_key_configured: false,
    safe_to_display: true,
  });
  assert.deepEqual(payload?.available_tools, [
    'firecrawl_scrape',
    'firecrawl_search',
    'firecrawl_parse',
  ]);
  assert.deepEqual(payload?.unavailable_without_account, [
    'firecrawl_crawl',
    'firecrawl_map',
    'firecrawl_extract',
    'firecrawl_agent',
    'firecrawl_interact',
    'firecrawl_monitor_create',
  ]);
  assert.equal(payload?.additional_unavailable_tool_count, 17);
  assert.match(payload?.message ?? '', /person is present/i);
  assert.match(payload?.message ?? '', /CI, servers, or unattended agents/i);
  assert.match(payload?.message ?? '', /free Firecrawl account/i);
  assert.match(payload?.message ?? '', /no credit card/i);
  assert.match(payload?.message ?? '', /monthly credits/i);
  const serialized = JSON.stringify(payload);
  for (const forbidden of ['team_id', 'teamId', 'user_id', 'userId', 'api_key_id', 'apiKeyId', 'oauth_client_id', 'oauthClientId']) {
    assert.equal(serialized.includes(forbidden), false, `${forbidden} must not appear in keyless recovery payload`);
  }
  const connect = payload?.next_actions?.find((action) => action.kind === 'connect_account');
  const apiKey = payload?.next_actions?.find((action) => action.kind === 'configure_api_key');
  assert.equal(connect?.requires_interactive_browser, true);
  assert.equal(connect?.connect_url, 'https://firecrawl.dev/connect/mcp');
  assert.equal(connect?.docs_url, 'https://docs.firecrawl.dev/mcp-server');
  assert.equal(apiKey?.requires_interactive_browser, false);
  assert.equal(apiKey?.header, 'Authorization: Bearer <FIRECRAWL_API_KEY>');
  assert.equal(apiKey?.docs_url, 'https://docs.firecrawl.dev/mcp-server');
  assert.equal(payload?.retryable, expectedCode === 'KEYLESS_QUOTA_EXHAUSTED');
}

test('/v2/mcp anonymous initialize and tools/list return 200 without OAuth challenges', async (t) => {
  const backend = await startFakeFirecrawlBackend({
    keylessEligibilityHangs: true,
  });
  t.after(() => backend.close());
  const port = await getFreePort();
  const child = spawnServer(hostedEnv(port, backend));
  t.after(() => stopChild(child));
  await waitForHealth(port, child);

  const initializeResponse = await initialize(port, '/v2/mcp');

  assert.equal(initializeResponse.status, 200);
  assert.equal(initializeResponse.headers.has('www-authenticate'), false);
  const initializeMessage = await parseMcpResponse(initializeResponse);
  assert.equal(initializeMessage.result.serverInfo.name, 'firecrawl-fastmcp');
  assert.match(initializeMessage.result.instructions ?? '', /keyless|Search|Scrape|Parse/i);
  assert.match(initializeMessage.result.instructions ?? '', /KEYLESS_TOOL_NOT_AVAILABLE/);

  const toolsListResponse = await mcpRequest(port, '/v2/mcp', {
    id: 2,
    method: 'tools/list',
  });

  assert.equal(toolsListResponse.status, 200);
  assert.equal(toolsListResponse.headers.has('www-authenticate'), false);
  const toolsListMessage = await parseMcpResponse(toolsListResponse);
  assert.deepEqual(
    toolsListMessage.result.tools.map((tool) => tool.name).sort(),
    ['firecrawl_parse', 'firecrawl_scrape', 'firecrawl_search']
  );
  assert.equal(
    backend.requests.some(
      (request) => request.url === '/v2/keyless/eligibility'
    ),
    false,
    'initialize and tools/list must not evaluate remote keyless eligibility'
  );
});

test('/v2/mcp bounds lazy eligibility checks and returns visible recovery', async (t) => {
  const backend = await startFakeFirecrawlBackend({
    keylessEligibilityHangs: true,
  });
  t.after(() => backend.close());
  const port = await getFreePort();
  const child = spawnServer(
    hostedEnv(port, backend, { KEYLESS_ELIGIBILITY_TIMEOUT_MS: '50' })
  );
  t.after(() => stopChild(child));
  await waitForHealth(port, child);

  const startedAt = Date.now();
  const response = await mcpRequest(port, '/v2/mcp', {
    id: 32,
    method: 'tools/call',
    params: {
      name: 'firecrawl_search',
      arguments: { query: 'bounded eligibility timeout' },
    },
    headers: { 'x-forwarded-for': '8.8.8.8' },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.has('www-authenticate'), false);
  assert.ok(
    Date.now() - startedAt < 1_000,
    'eligibility timeout must be bounded'
  );
  const message = await parseMcpResponse(response);
  assertRecoveryPayload(
    extractStructuredPayload(message),
    'KEYLESS_ACCESS_NOT_AVAILABLE'
  );
  assert.equal(
    backend.requests.filter(
      (request) => request.url === '/v2/keyless/eligibility'
    ).length,
    1,
    'the first allowed keyless tool call must evaluate eligibility lazily'
  );
});

test('/v2/mcp recovery metadata matches the registered account-tool complement', async (t) => {
  const backend = await startFakeFirecrawlBackend({ keylessEligible: false });
  t.after(() => backend.close());
  const port = await getFreePort();
  const child = spawnServer(hostedEnv(port, backend));
  t.after(() => stopChild(child));
  await waitForHealth(port, child);

  const accountToolsResponse = await mcpRequest(port, '/v2/mcp', {
    id: 30,
    method: 'tools/list',
    headers: { authorization: 'Bearer fc-account-tools-key' },
  });
  assert.equal(accountToolsResponse.status, 200);
  const accountToolsMessage = await parseMcpResponse(accountToolsResponse);
  const registeredTools = accountToolsMessage.result.tools;
  const registeredAccountTools = accountToolNamesFromRegisteredTools(registeredTools);

  assert.ok(
    registeredAccountTools.includes('firecrawl_monitor_get'),
    'account-tool derivation must include registered monitor tools beyond stale names'
  );
  assert.ok(
    registeredAccountTools.includes('firecrawl_research_read_paper'),
    'account-tool derivation must include registered research tools beyond stale names'
  );

  for (const tool of registeredTools) {
    assert.equal(
      tool._meta?.requires_auth === true,
      !KEYLESS_TOOL_NAMES.has(tool.name),
      `${tool.name} requires_auth must match the keyless triad complement`
    );
  }

  const deniedResponse = await mcpRequest(port, '/v2/mcp', {
    id: 31,
    method: 'tools/call',
    params: {
      name: 'firecrawl_search',
      arguments: { query: 'metadata contract test' },
    },
    headers: { 'x-forwarded-for': '203.0.113.42' },
  });
  assert.equal(deniedResponse.status, 200);
  const deniedMessage = await parseMcpResponse(deniedResponse);
  const payload = extractStructuredPayload(deniedMessage);
  assertRecoveryPayload(payload, 'KEYLESS_ACCESS_NOT_AVAILABLE');
  assert.equal(
    payload.unavailable_without_account.length +
      payload.additional_unavailable_tool_count,
    registeredAccountTools.length,
    'recovery metadata must account for every registered tool outside the keyless triad'
  );
});

test('/v2/mcp keyless denial is a visible structured recovery result', async (t) => {
  const backend = await startFakeFirecrawlBackend({ keylessEligible: false });
  t.after(() => backend.close());
  const port = await getFreePort();
  const child = spawnServer(hostedEnv(port, backend));
  t.after(() => stopChild(child));
  await waitForHealth(port, child);

  const response = await mcpRequest(port, '/v2/mcp', {
    id: 2,
    method: 'tools/call',
    params: {
      name: 'firecrawl_search',
      arguments: { query: 'firecrawl contract test' },
    },
    headers: { 'x-forwarded-for': '203.0.113.42' },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.has('www-authenticate'), false);
  const message = await parseMcpResponse(response);
  assert.equal(message.result?.isError, true);
  assertRecoveryPayload(extractStructuredPayload(message), 'KEYLESS_ACCESS_NOT_AVAILABLE');
});

test('/v2/mcp keyless recovery request_id is server-generated and not spoofed', async (t) => {
  const backend = await startFakeFirecrawlBackend({ keylessEligible: false });
  t.after(() => backend.close());
  const port = await getFreePort();
  const child = spawnServer(hostedEnv(port, backend));
  t.after(() => stopChild(child));
  await waitForHealth(port, child);

  const response = await mcpRequest(port, '/v2/mcp', {
    id: 22,
    method: 'tools/call',
    params: {
      name: 'firecrawl_search',
      arguments: { query: 'spoofed request id' },
      _meta: { requestId: 'spoofed-json-rpc-request-id' },
    },
    headers: {
      'x-forwarded-for': '203.0.113.42',
      'x-request-id': 'spoofed-http-request-id',
    },
  });

  assert.equal(response.status, 200);
  const message = await parseMcpResponse(response);
  const payload = extractStructuredPayload(message);
  assertRecoveryPayload(payload, 'KEYLESS_ACCESS_NOT_AVAILABLE');
  assert.notEqual(payload.request_id, 'spoofed-http-request-id');
  assert.notEqual(payload.request_id, 'spoofed-json-rpc-request-id');
});

test('OAuth protected-resource metadata uses independent endpoint resources', async (t) => {
  const backend = await startFakeFirecrawlBackend();
  t.after(() => backend.close());

  const keylessPort = await getFreePort();
  const keyless = spawnServer(hostedEnv(keylessPort, backend));
  t.after(() => stopChild(keyless));
  await waitForHealth(keylessPort, keyless);
  const keylessPrm = await fetch(
    `http://127.0.0.1:${keylessPort}/.well-known/oauth-protected-resource`
  );
  assert.equal(keylessPrm.status, 200);
  assert.equal((await keylessPrm.json()).resource, 'https://mcp.firecrawl.dev/v2/mcp');

  const oauthPort = await getFreePort();
  const oauth = spawnServer(
    hostedEnv(oauthPort, backend, {
      FASTMCP_ENDPOINT: '/v2/mcp-oauth',
      FIRECRAWL_MCP_RESOURCE_URL: 'https://mcp.firecrawl.dev/v2/mcp-oauth',
    })
  );
  t.after(() => stopChild(oauth));
  await waitForHealth(oauthPort, oauth);

  const oauthPrm = await fetch(
    `http://127.0.0.1:${oauthPort}/.well-known/oauth-protected-resource/v2/mcp-oauth`
  );
  assert.equal(oauthPrm.status, 200);
  const oauthMetadata = await oauthPrm.json();
  assert.equal(oauthMetadata.resource, 'https://mcp.firecrawl.dev/v2/mcp-oauth');
  assert.notEqual(oauthMetadata.resource, 'https://mcp.firecrawl.dev/v2/mcp');

  const searchPort = await getFreePort();
  const search = spawnServer(
    hostedEnv(searchPort, backend, {
      FASTMCP_ENDPOINT: '/v2/mcp-search',
      FIRECRAWL_MCP_RESOURCE_URL: 'https://mcp.firecrawl.dev/v2/mcp-search',
    })
  );
  t.after(() => stopChild(search));
  await waitForHealth(searchPort, search);

  const searchPrm = await fetch(
    `http://127.0.0.1:${searchPort}/.well-known/oauth-protected-resource/v2/mcp-search`
  );
  assert.equal(searchPrm.status, 200);
  const searchMetadata = await searchPrm.json();
  assert.equal(searchMetadata.resource, 'https://mcp.firecrawl.dev/v2/mcp-search');
  assert.notEqual(searchMetadata.resource, 'https://mcp.firecrawl.dev/v2/mcp');
  assert.notEqual(searchMetadata.resource, 'https://mcp.firecrawl.dev/v2/mcp-oauth');
});

test('/v2/mcp-oauth anonymous challenge points at its own PRM and omits invalid_token', async (t) => {
  const backend = await startFakeFirecrawlBackend();
  t.after(() => backend.close());
  const port = await getFreePort();
  const child = spawnServer(
    hostedEnv(port, backend, {
      FASTMCP_ENDPOINT: '/v2/mcp-oauth',
      FIRECRAWL_MCP_RESOURCE_URL: 'https://mcp.firecrawl.dev/v2/mcp-oauth',
    })
  );
  t.after(() => stopChild(child));
  await waitForHealth(port, child);

  const response = await initialize(port, '/v2/mcp-oauth');

  assert.equal(response.status, 401);
  const challenge = response.headers.get('www-authenticate') ?? '';
  assert.match(
    challenge,
    /^Bearer resource_metadata="https:\/\/mcp\.firecrawl\.dev\/\.well-known\/oauth-protected-resource\/v2\/mcp-oauth"$/
  );
  assert.equal(challenge.includes('invalid_token'), false);
  assert.equal(challenge.includes('error_description'), false);
});

test('/v2/mcp-search anonymous challenge points at its own PRM and omits invalid_token', async (t) => {
  const backend = await startFakeFirecrawlBackend();
  t.after(() => backend.close());
  const port = await getFreePort();
  const child = spawnServer(
    hostedEnv(port, backend, {
      FASTMCP_ENDPOINT: '/v2/mcp-search',
      FIRECRAWL_MCP_RESOURCE_URL: 'https://mcp.firecrawl.dev/v2/mcp-search',
    })
  );
  t.after(() => stopChild(child));
  await waitForHealth(port, child);

  const response = await initialize(port, '/v2/mcp-search');

  assert.equal(response.status, 401);
  const challenge = response.headers.get('www-authenticate') ?? '';
  assert.match(
    challenge,
    /^Bearer resource_metadata="https:\/\/mcp\.firecrawl\.dev\/\.well-known\/oauth-protected-resource\/v2\/mcp-search"$/
  );
  assert.equal(challenge.includes('invalid_token'), false);
  assert.equal(challenge.includes('error_description'), false);
});

test('/v2/mcp-search exposes exactly the Anthropic six-tool profile without scrapeOptions', async (t) => {
  const backend = await startFakeFirecrawlBackend({
    introspectionMetadata: ANTHROPIC_SEARCH_PROFILE_TOKEN_METADATA,
  });
  t.after(() => backend.close());
  const port = await getFreePort();
  const child = spawnServer(
    hostedEnv(port, backend, {
      FASTMCP_ENDPOINT: '/v2/mcp-search',
      FIRECRAWL_MCP_RESOURCE_URL: 'https://mcp.firecrawl.dev/v2/mcp-search',
    })
  );
  t.after(() => stopChild(child));
  await waitForHealth(port, child);

  const response = await mcpRequest(port, '/v2/mcp-search', {
    id: 57,
    method: 'tools/list',
    headers: { authorization: 'Bearer fco_search_profile_token' },
  });

  assert.equal(response.status, 200);
  const message = await parseMcpResponse(response);
  assert.deepEqual(toolNames(message.result.tools), ANTHROPIC_SEARCH_PROFILE_TOOL_NAMES);
  const searchTool = message.result.tools.find((tool) => tool.name === 'firecrawl_search');
  assert.ok(searchTool, 'search profile must expose firecrawl_search');
  assert.equal(JSON.stringify(searchTool).includes('scrapeOptions'), false);
  assert.equal(JSON.stringify(searchTool).includes('enterprise'), false);

  const initializeResponse = await initialize(port, '/v2/mcp-search', {
    authorization: 'Bearer fco_search_profile_token',
  });
  assert.equal(initializeResponse.status, 200);
  const initializeMessage = await parseMcpResponse(initializeResponse);
  const serializedContextBytes = Buffer.byteLength(
    JSON.stringify({
      instructions: initializeMessage.result.instructions ?? '',
      tools: message.result.tools,
    })
  );
  assert.ok(
    serializedContextBytes <= 10_800,
    `marketplace initialize metadata is ${serializedContextBytes} bytes; hard ceiling is 10800 (~2.7k estimated tokens)`
  );
});

test('hosted profile instructions are byte-frozen and capability-honest', async (t) => {
  const backend = await startFakeFirecrawlBackend({
    introspectionMetadata: ANTHROPIC_SEARCH_PROFILE_TOKEN_METADATA,
  });
  t.after(() => backend.close());

  for (const profile of [
    {
      endpoint: '/v2/mcp',
      expectedHash: FROZEN_GENERIC_INSTRUCTIONS_SHA256,
      headers: {},
      overrides: {},
    },
    {
      endpoint: '/v2/mcp-oauth',
      expectedHash: FROZEN_GENERIC_INSTRUCTIONS_SHA256,
      headers: { authorization: 'Bearer fc-account-instructions' },
      overrides: {
        FASTMCP_ENDPOINT: '/v2/mcp-oauth',
        FIRECRAWL_MCP_RESOURCE_URL: 'https://mcp.firecrawl.dev/v2/mcp-oauth',
      },
    },
    {
      endpoint: '/v2/mcp-search',
      expectedHash: ANTHROPIC_SEARCH_INSTRUCTIONS_SHA256,
      headers: { authorization: 'Bearer fco_search_instructions' },
      overrides: {
        FASTMCP_ENDPOINT: '/v2/mcp-search',
        FIRECRAWL_MCP_RESOURCE_URL: 'https://mcp.firecrawl.dev/v2/mcp-search',
      },
    },
  ]) {
    const port = await getFreePort();
    const child = spawnServer(hostedEnv(port, backend, profile.overrides));
    t.after(() => stopChild(child));
    await waitForHealth(port, child);

    const response = await initialize(port, profile.endpoint, profile.headers);
    assert.equal(response.status, 200, profile.endpoint);
    const message = await parseMcpResponse(response);
    const instructions = message.result.instructions ?? '';
    assert.equal(sha256(instructions), profile.expectedHash, profile.endpoint);

    if (profile.endpoint === '/v2/mcp-search') {
      assert.match(instructions, /six read-only search and research tools/i);
      assert.doesNotMatch(
        instructions,
        /\bscrap(?:e|ing)|\bcrawl(?:ing)?|\bmonitor|\binteract/i
      );
      assert.match(instructions, /stay offline/i);
    }
  }
});

test('/v2/mcp-search rejects every Firecrawl API-key header because the profile is OAuth-only', async (t) => {
  const backend = await startFakeFirecrawlBackend({
    introspectionMetadata: ANTHROPIC_SEARCH_PROFILE_TOKEN_METADATA,
  });
  t.after(() => backend.close());
  const port = await getFreePort();
  const child = spawnServer(
    hostedEnv(port, backend, {
      FASTMCP_ENDPOINT: '/v2/mcp-search',
      FIRECRAWL_MCP_RESOURCE_URL: 'https://mcp.firecrawl.dev/v2/mcp-search',
    })
  );
  t.after(() => stopChild(child));
  await waitForHealth(port, child);

  for (const [index, headers] of [
    { authorization: 'Bearer fc-api-key-must-not-enter-marketplace' },
    { 'x-firecrawl-api-key': 'fc-api-key-must-not-enter-marketplace' },
    { 'x-api-key': 'fc-api-key-must-not-enter-marketplace' },
  ].entries()) {
    const response = await mcpRequest(port, '/v2/mcp-search', {
      id: 571 + index,
      method: 'tools/list',
      headers,
    });
    assert.equal(response.status, 401);
    assert.match(response.headers.get('www-authenticate') ?? '', /invalid_token/);
  }
});

const SEARCH_PROFILE_TOOL_CALL_CASES = [
  {
    name: 'firecrawl_search',
    args: {
      query: 'Firecrawl MCP research tools',
      categories: ['github', 'research'],
      scrapeOptions: { formats: ['markdown'] },
      enterprise: ['zdr'],
    },
    expectedUrl: '/v2/search',
  },
  {
    name: 'firecrawl_research_search_papers',
    args: { query: 'attention mechanisms', k: 1 },
    expectedUrl: '/v2/search/research/papers?query=attention+mechanisms&k=1',
  },
  {
    name: 'firecrawl_research_inspect_paper',
    args: { paperId: 'arxiv:1706.03762' },
    expectedUrl: '/v2/search/research/papers/arxiv%3A1706.03762',
  },
  {
    name: 'firecrawl_research_related_papers',
    args: { seed_ids: ['arxiv:1706.03762'], intent: 'transformers', mode: 'similar', k: 1 },
    expectedUrl: '/v2/search/research/papers/arxiv%3A1706.03762/similar?intent=transformers&mode=similar&k=1',
  },
  {
    name: 'firecrawl_research_read_paper',
    args: { paperId: 'arxiv:1706.03762', question: 'What mechanism is used?', k: 1 },
    expectedUrl: '/v2/search/research/papers/arxiv%3A1706.03762?query=What+mechanism+is+used%3F&k=1',
  },
  {
    name: 'firecrawl_research_search_github',
    args: { query: 'Firecrawl MCP', k: 1 },
    expectedUrl: '/v2/search/research/github?query=Firecrawl+MCP&k=1',
  },
];

test('/v2/mcp-search executes every allowed profile tool only against search/research endpoints', async (t) => {
  const backend = await startFakeFirecrawlBackend({
    introspectionMetadata: ANTHROPIC_SEARCH_PROFILE_TOKEN_METADATA,
  });
  t.after(() => backend.close());
  const port = await getFreePort();
  const child = spawnServer(
    hostedEnv(port, backend, {
      FASTMCP_ENDPOINT: '/v2/mcp-search',
      FIRECRAWL_MCP_RESOURCE_URL: 'https://mcp.firecrawl.dev/v2/mcp-search',
    })
  );
  t.after(() => stopChild(child));
  await waitForHealth(port, child);

  for (const [index, call] of SEARCH_PROFILE_TOOL_CALL_CASES.entries()) {
    const response = await mcpRequest(port, '/v2/mcp-search', {
      id: 570 + index,
      method: 'tools/call',
      params: { name: call.name, arguments: call.args },
      headers: { authorization: 'Bearer fco_search_profile_token' },
    });
    assert.equal(response.status, 200, `${call.name} HTTP status`);
    const message = await parseMcpResponse(response);
    assert.notEqual(message.result?.isError, true, `${call.name} should not return an MCP tool error`);
  }

  const urls = profileBackendRequestUrls(backend);
  for (const expectedUrl of SEARCH_PROFILE_TOOL_CALL_CASES.map((call) => call.expectedUrl)) {
    assert.ok(urls.includes(expectedUrl), `missing backend request ${expectedUrl}; saw ${urls.join(', ')}`);
  }
  assert.equal(
    backend.requests.some((request) => request.url === '/v2/scrape' || request.url === '/v2/map'),
    false,
    'search profile tools must not dispatch arbitrary URL fetch/scrape/map requests'
  );
  const searchRequest = backend.requests.find((request) => request.url === '/v2/search');
  assert.ok(searchRequest, 'firecrawl_search should call /v2/search');
  assert.equal(
    Object.hasOwn(searchRequest.body ?? {}, 'scrapeOptions'),
    false,
    'mcp-search must strip/omit scrapeOptions before dispatching firecrawl_search'
  );
  assert.equal(
    Object.hasOwn(searchRequest.body ?? {}, 'enterprise'),
    false,
    'mcp-search must strip/omit enterprise before dispatching firecrawl_search'
  );
});

test('/v2/mcp-search rejects legacy /v2/mcp OAuth audience by default', async (t) => {
  const backend = await startFakeFirecrawlBackend({
    introspectionMetadata: {
      api_key_id: '790',
      aud: 'https://mcp.firecrawl.dev/v2/mcp',
      scope: 'firecrawl:global',
      client_id: 'legacy_client',
      sub: '00000000-0000-4000-8000-000000000008',
      team_id: '00000000-0000-4000-8000-000000000007',
    },
  });
  t.after(() => backend.close());
  const port = await getFreePort();
  const child = spawnServer(
    hostedEnv(port, backend, {
      FASTMCP_ENDPOINT: '/v2/mcp-search',
      FIRECRAWL_MCP_RESOURCE_URL: 'https://mcp.firecrawl.dev/v2/mcp-search',
    })
  );
  t.after(() => stopChild(child));
  await waitForHealth(port, child);

  const response = await mcpRequest(port, '/v2/mcp-search', {
    id: 58,
    method: 'tools/list',
    headers: { authorization: 'Bearer fco_legacy_search_profile_token' },
  });

  assert.equal(response.status, 401);
  const challenge = response.headers.get('www-authenticate') ?? '';
  assert.match(challenge, /resource_metadata="https:\/\/mcp\.firecrawl\.dev\/\.well-known\/oauth-protected-resource\/v2\/mcp-search"/);
  assert.match(challenge, /error="invalid_token"/);
});

test('/v2/mcp-search rejects non-profile tool calls without upstream execution', async (t) => {
  const backend = await startFakeFirecrawlBackend({
    introspectionMetadata: {
      api_key_id: '791',
      aud: 'https://mcp.firecrawl.dev/v2/mcp-search',
      scope: 'firecrawl:global',
      client_id: 'anthropic_search_client',
      sub: '00000000-0000-4000-8000-000000000010',
      team_id: '00000000-0000-4000-8000-000000000009',
    },
  });
  t.after(() => backend.close());
  const port = await getFreePort();
  const child = spawnServer(
    hostedEnv(port, backend, {
      FASTMCP_ENDPOINT: '/v2/mcp-search',
      FIRECRAWL_MCP_RESOURCE_URL: 'https://mcp.firecrawl.dev/v2/mcp-search',
    })
  );
  t.after(() => stopChild(child));
  await waitForHealth(port, child);

  const response = await mcpRequest(port, '/v2/mcp-search', {
    id: 59,
    method: 'tools/call',
    params: {
      name: 'firecrawl_scrape',
      arguments: { url: 'https://example.com/' },
    },
    headers: { authorization: 'Bearer fco_search_profile_token' },
  });

  assert.equal(response.status, 200);
  const message = await parseMcpResponse(response);
  assert.equal(extractStructuredPayload(message)?.code, 'TOOL_NOT_AVAILABLE_IN_PROFILE');
  assert.equal(
    backend.requests.some((request) => request.url === '/v2/scrape'),
    false
  );
});

test('/v2/mcp-oauth accepts validated Bearer API keys as an account-door credential', async (t) => {
  const backend = await startFakeFirecrawlBackend();
  t.after(() => backend.close());
  const port = await getFreePort();
  const child = spawnServer(
    hostedEnv(port, backend, {
      FASTMCP_ENDPOINT: '/v2/mcp-oauth',
      FIRECRAWL_MCP_RESOURCE_URL: 'https://mcp.firecrawl.dev/v2/mcp-oauth',
    })
  );
  t.after(() => stopChild(child));
  await waitForHealth(port, child);

  const response = await mcpRequest(port, '/v2/mcp-oauth', {
    id: 5,
    method: 'tools/call',
    params: {
      name: 'firecrawl_search',
      arguments: { query: 'api key on oauth door' },
    },
    headers: { authorization: 'Bearer fc-account-door-key' },
  });

  assert.equal(response.status, 200);
  const message = await parseMcpResponse(response);
  assert.equal(message.result?.isError, undefined);
  assert.equal(backend.requests.some((request) => request.url === '/v2/search'), true);
  assert.equal(
    backend.requests.some(
      (request) =>
        request.url === '/api/oauth/introspect' &&
        request.body?.token === 'fc-account-door-key'
    ),
    true
  );
});

test('/v2/mcp-oauth gives an invalid API key a correction-only session', async (t) => {
  const backend = await startFakeFirecrawlBackend();
  t.after(() => backend.close());
  const port = await getFreePort();
  const child = spawnServer(
    hostedEnv(port, backend, {
      FASTMCP_ENDPOINT: '/v2/mcp-oauth',
      FIRECRAWL_MCP_RESOURCE_URL: 'https://mcp.firecrawl.dev/v2/mcp-oauth',
    })
  );
  t.after(() => stopChild(child));
  await waitForHealth(port, child);

  const initializeResponse = await initialize(port, '/v2/mcp-oauth', {
    authorization: 'Bearer fc-invalid-account-door-key',
  });
  assert.equal(initializeResponse.status, 200);
  assert.equal(initializeResponse.headers.has('www-authenticate'), false);

  const toolsResponse = await mcpRequest(port, '/v2/mcp-oauth', {
    id: 51,
    method: 'tools/list',
    headers: { authorization: 'Bearer fc-invalid-account-door-key' },
  });
  assert.equal(toolsResponse.status, 200);
  const toolsMessage = await parseMcpResponse(toolsResponse);
  assert.deepEqual(toolsMessage.result.tools, []);

  const callResponse = await mcpRequest(port, '/v2/mcp-oauth', {
    id: 52,
    method: 'tools/call',
    params: {
      name: 'firecrawl_search',
      arguments: { query: 'must not execute' },
    },
    headers: { authorization: 'Bearer fc-invalid-account-door-key' },
  });
  assert.equal(callResponse.status, 200);
  assert.equal(callResponse.headers.has('www-authenticate'), false);
  const callMessage = await parseMcpResponse(callResponse);
  assert.equal(callMessage.result?.isError, true);
  assert.equal(
    extractStructuredPayload(callMessage)?.code,
    'CREDENTIAL_INVALID'
  );
  assert.equal(
    backend.requests.some((request) => request.url === '/v2/search'),
    false
  );
});

test('/v2/mcp-oauth reports API-key validation outages without an OAuth challenge', async (t) => {
  const backend = await startFakeFirecrawlBackend({ introspectionStatus: 503 });
  t.after(() => backend.close());
  const port = await getFreePort();
  const child = spawnServer(
    hostedEnv(port, backend, {
      FASTMCP_ENDPOINT: '/v2/mcp-oauth',
      FIRECRAWL_MCP_RESOURCE_URL: 'https://mcp.firecrawl.dev/v2/mcp-oauth',
    })
  );
  t.after(() => stopChild(child));
  await waitForHealth(port, child);

  const response = await initialize(port, '/v2/mcp-oauth', {
    authorization: 'Bearer fc-temporarily-unverifiable',
  });
  assert.equal(response.status, 503);
  assert.equal(response.headers.has('www-authenticate'), false);
  assert.equal(response.headers.get('retry-after'), '5');
  assert.deepEqual(await response.json(), {
    code: 'CREDENTIAL_VALIDATION_UNAVAILABLE',
    error: 'temporarily_unavailable',
    error_description:
      'Firecrawl credential validation is temporarily unavailable.',
  });
});

test('/v2/mcp-oauth accepts legacy /v2/mcp OAuth audience by default', async (t) => {
  const backend = await startFakeFirecrawlBackend({
    introspectionMetadata: {
      api_key_id: '456',
      aud: 'https://mcp.firecrawl.dev/v2/mcp',
      scope: 'firecrawl:global',
      client_id: 'legacy_client',
      sub: '00000000-0000-4000-8000-000000000004',
      team_id: '00000000-0000-4000-8000-000000000003',
    },
  });
  t.after(() => backend.close());
  const port = await getFreePort();
  const child = spawnServer(
    hostedEnv(port, backend, {
      FASTMCP_ENDPOINT: '/v2/mcp-oauth',
      FIRECRAWL_MCP_RESOURCE_URL: 'https://mcp.firecrawl.dev/v2/mcp-oauth',
    })
  );
  t.after(() => stopChild(child));
  await waitForHealth(port, child);

  const response = await mcpRequest(port, '/v2/mcp-oauth', {
    id: 6,
    method: 'tools/call',
    params: {
      name: 'firecrawl_search',
      arguments: { query: 'legacy oauth audience' },
    },
    headers: { authorization: 'Bearer fco_legacy_access_token' },
  });

  assert.equal(response.status, 200);
  const message = await parseMcpResponse(response);
  assert.equal(message.result?.isError, undefined);
  assert.equal(backend.requests.some((request) => request.url === '/v2/search'), true);
});

test('/v2/mcp invalid presented Bearer gets a correction-only session without keyless downgrade', async (t) => {
  const backend = await startFakeFirecrawlBackend({ keylessEligible: false });
  t.after(() => backend.close());
  const port = await getFreePort();
  const child = spawnServer(hostedEnv(port, backend));
  t.after(() => stopChild(child));
  await waitForHealth(port, child);

  const response = await initialize(port, '/v2/mcp', {
    authorization: 'Bearer not-a-firecrawl-token',
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.has('www-authenticate'), false);
  const toolsResponse = await mcpRequest(port, '/v2/mcp', {
    id: 61,
    method: 'tools/list',
    headers: { authorization: 'Bearer not-a-firecrawl-token' },
  });
  const toolsMessage = await parseMcpResponse(toolsResponse);
  assert.deepEqual(toolsMessage.result.tools, []);
  const callResponse = await mcpRequest(port, '/v2/mcp', {
    id: 62,
    method: 'tools/call',
    params: {
      name: 'firecrawl_search',
      arguments: { query: 'must not execute' },
    },
    headers: { authorization: 'Bearer not-a-firecrawl-token' },
  });
  const callMessage = await parseMcpResponse(callResponse);
  assert.equal(extractStructuredPayload(callMessage)?.code, 'CREDENTIAL_INVALID');
  assert.equal(
    backend.requests.some((request) => request.url === '/api/oauth/introspect'),
    false,
    'unclassifiable bearer token must not be sent to OAuth introspection'
  );
  assert.equal(
    backend.requests.some((request) => request.url === '/v2/keyless/eligibility'),
    false,
    'invalid presented credentials must not be downgraded to keyless eligibility'
  );
});

test('direct keyless call to hidden account tool returns structured recovery without upstream execution', async (t) => {
  const backend = await startFakeFirecrawlBackend({ keylessEligible: true });
  t.after(() => backend.close());
  const port = await getFreePort();
  const child = spawnServer(hostedEnv(port, backend));
  t.after(() => stopChild(child));
  await waitForHealth(port, child);

  const cases = [
    {
      name: 'firecrawl_map',
      arguments: { url: 'https://example.com' },
      forbiddenPath: '/v2/map',
    },
    {
      name: 'firecrawl_monitor_run',
      arguments: { id: 'monitor-123' },
      forbiddenPath: '/v2/monitor',
    },
    {
      name: 'firecrawl_research_inspect_paper',
      arguments: { paperId: 'arxiv:2401.00001' },
      forbiddenPath: '/v2/search/research',
    },
  ];

  for (const [index, hiddenTool] of cases.entries()) {
    const response = await mcpRequest(port, '/v2/mcp', {
      id: 8 + index,
      method: 'tools/call',
      params: {
        name: hiddenTool.name,
        arguments: hiddenTool.arguments,
      },
      headers: { 'x-forwarded-for': '8.8.8.8' },
    });

    assert.equal(response.status, 200);
    const message = await parseMcpResponse(response);
    assert.equal(message.result?.isError, true);
    assertRecoveryPayload(
      extractStructuredPayload(message),
      'KEYLESS_TOOL_NOT_AVAILABLE'
    );
    assert.equal(
      backend.requests.some((request) => request.url?.startsWith(hiddenTool.forbiddenPath)),
      false,
      `${hiddenTool.name} must not reach upstream ${hiddenTool.forbiddenPath}`
    );
  }
});

test('direct keyless call to an unregistered tool remains unknown', async (t) => {
  const backend = await startFakeFirecrawlBackend({ keylessEligible: true });
  t.after(() => backend.close());
  const port = await getFreePort();
  const child = spawnServer(hostedEnv(port, backend));
  t.after(() => stopChild(child));
  await waitForHealth(port, child);

  const response = await mcpRequest(port, '/v2/mcp', {
    id: 88,
    method: 'tools/call',
    params: { name: 'firecrawl_not_registered', arguments: {} },
    headers: { 'x-forwarded-for': '8.8.8.8' },
  });

  assert.equal(response.status, 200);
  const message = await parseMcpResponse(response);
  assert.match(
    message.error?.message ?? '',
    /Unknown tool: firecrawl_not_registered/
  );
});

test('keyless gated-tool recovery precedes account-tool argument validation', async (t) => {
  const backend = await startFakeFirecrawlBackend({ keylessEligible: true });
  t.after(() => backend.close());
  const port = await getFreePort();
  const child = spawnServer(hostedEnv(port, backend));
  t.after(() => stopChild(child));
  await waitForHealth(port, child);

  for (const [index, argumentsValue] of [
    { url: 'https://example.com' },
    {},
    { url: 123 },
  ].entries()) {
    const response = await mcpRequest(port, '/v2/mcp', {
      id: 90 + index,
      method: 'tools/call',
      params: { name: 'firecrawl_map', arguments: argumentsValue },
      headers: { 'x-forwarded-for': '8.8.8.8' },
    });

    assert.equal(response.status, 200);
    const message = await parseMcpResponse(response);
    assert.equal(message.result?.isError, true);
    assertRecoveryPayload(
      extractStructuredPayload(message),
      'KEYLESS_TOOL_NOT_AVAILABLE'
    );
  }

  assert.equal(
    backend.requests.some((request) => request.url?.startsWith('/v2/map')),
    false,
    'gated tool arguments must not reach the upstream API'
  );
});

test('application quota 429 is translated to structured MCP recovery, not an OAuth challenge', async (t) => {
  const backend = await startFakeFirecrawlBackend({
    keylessEligible: true,
    searchStatus: 429,
  });
  t.after(() => backend.close());
  const port = await getFreePort();
  const child = spawnServer(hostedEnv(port, backend));
  t.after(() => stopChild(child));
  await waitForHealth(port, child);

  const response = await mcpRequest(port, '/v2/mcp', {
    id: 9,
    method: 'tools/call',
    params: {
      name: 'firecrawl_search',
      arguments: { query: 'quota contract' },
    },
    headers: { 'x-forwarded-for': '8.8.4.4' },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.has('www-authenticate'), false);
  const message = await parseMcpResponse(response);
  assert.equal(message.result?.isError, true);
  const payload = extractStructuredPayload(message);
  assertRecoveryPayload(payload, 'KEYLESS_QUOTA_EXHAUSTED');
  assert.equal(payload.rate_limit_layer, 'application');
  assert.equal(payload.retry_after_seconds, 60);
});

test('application quota 429 without Retry-After stays retryable without inventing a delay', async (t) => {
  const backend = await startFakeFirecrawlBackend({
    keylessEligible: true,
    searchRetryAfter: null,
    searchStatus: 429,
  });
  t.after(() => backend.close());
  const port = await getFreePort();
  const child = spawnServer(hostedEnv(port, backend));
  t.after(() => stopChild(child));
  await waitForHealth(port, child);

  const response = await mcpRequest(port, '/v2/mcp', {
    id: 10,
    method: 'tools/call',
    params: {
      name: 'firecrawl_search',
      arguments: { query: 'quota no retry-after' },
    },
    headers: { 'x-forwarded-for': '8.8.4.4' },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.has('www-authenticate'), false);
  const message = await parseMcpResponse(response);
  const payload = extractStructuredPayload(message);
  assertRecoveryPayload(payload, 'KEYLESS_QUOTA_EXHAUSTED');
  assert.equal(payload.rate_limit_layer, 'application');
  assert.equal(Object.hasOwn(payload, 'retry_after_seconds'), false);
});
