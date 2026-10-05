// Contract snapshots: the tool surface, schemas, annotations, server
// instructions and HTTP surface of every way the server can be started. These
// pin current behaviour so refactors of the server's construction can prove
// they changed nothing.
//
// Regenerate after an intentional change:
//   pnpm run build && UPDATE_CONTRACT_SNAPSHOTS=1 node --test tests/contract-snapshot.test.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import test, { after } from 'node:test';
import {
  getFreePort,
  parseSseJson,
  spawnServer,
  startStdio,
  stopChild,
  waitForHealth,
} from './helpers/exchange-mcp.mjs';

const UPDATE = process.env.UPDATE_CONTRACT_SNAPSHOTS === '1';
const SNAPSHOT_DIR = new URL('./contract-snapshots/', import.meta.url);
const UNREACHABLE_API_URL = 'http://127.0.0.1:9';
const SEARCH_ENDPOINT = '/v2/mcp-search';
const SEARCH_RESOURCE = 'https://mcp.firecrawl.dev/v2/mcp-search';
const ACCOUNT_ENDPOINT = '/v2/mcp-oauth';
const CLIENT_INFO = { name: 'firecrawl-contract-snapshot', version: '1.0.0' };
const PROTOCOL_VERSION = '2025-06-18';

// Every variable that selects a mode, cleared so the parent environment cannot
// leak into a snapshot.
const BASE_ENV = {
  CLOUD_SERVICE: '',
  FASTMCP_ENDPOINT: '',
  FIRECRAWL_API_KEY: '',
  FIRECRAWL_API_URL: '',
  FIRECRAWL_DISABLE_ENDPOINT_FEEDBACK: '',
  FIRECRAWL_DISABLE_SEARCH_FEEDBACK: '',
  FIRECRAWL_MCP_RESOURCE_URL: '',
  FIRECRAWL_MCP_SEARCH_ENABLED: '',
  FIRECRAWL_MCP_SEARCH_ENDPOINT: '',
  FIRECRAWL_MCP_SEARCH_OAUTH_ONLY: '',
  FIRECRAWL_MCP_SEARCH_PORT: '',
  FIRECRAWL_MCP_SEARCH_RESOURCE_URL: '',
  FIRECRAWL_NO_ENDPOINT_FEEDBACK: '',
  FIRECRAWL_NO_SEARCH_FEEDBACK: '',
  FIRECRAWL_OAUTH_INTROSPECT_SECRET: '',
  FIRECRAWL_OAUTH_ISSUER: '',
  FIRECRAWL_OAUTH_TOKEN: '',
  HOST: '127.0.0.1',
  HTTP_STREAMABLE_SERVER: '',
  KEYLESS_PROXY_SECRET: '',
  OPENAI_APPS_CHALLENGE_TOKEN: '',
  PORT: '',
  SSE_LOCAL: '',
};

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const LOCAL_PORT = /http:\/\/127\.0\.0\.1:\d+/g;

/** Replace values that differ between runs (ids, ports, the package version). */
function normalize(value) {
  return JSON.parse(
    JSON.stringify(value)
      .replace(UUID, '<uuid>')
      .replace(LOCAL_PORT, 'http://127.0.0.1:<port>')
  );
}

function initializeContract(result) {
  return normalize({
    capabilities: result.capabilities,
    instructions: result.instructions,
    protocolVersion: result.protocolVersion,
    serverInfo: { ...result.serverInfo, version: '<version>' },
  });
}

// Tool definitions repeat across modes, so each snapshot lists tools as
// `name@hash` and the definitions live once in tool-definitions.json.
const TOOL_CATALOG_FILE = new URL('tool-definitions.json', SNAPSHOT_DIR);
const toolCatalog = new Map();
let committedCatalog;

function toolKey(tool) {
  const hash = createHash('sha256')
    .update(JSON.stringify(tool))
    .digest('hex')
    .slice(0, 12);
  return `${tool.name}@${hash}`;
}

function catalogTools(value) {
  if (Array.isArray(value)) return value.map(catalogTools);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'tools' && Array.isArray(entry)) {
      out[key] = entry.map((tool) => {
        const keyed = toolKey(tool);
        toolCatalog.set(keyed, tool);
        return keyed;
      });
    } else {
      out[key] = catalogTools(entry);
    }
  }
  return out;
}

async function readCommittedCatalog() {
  committedCatalog ??= JSON.parse(await readFile(TOOL_CATALOG_FILE, 'utf8'));
  return committedCatalog;
}

after(async () => {
  if (!UPDATE) return;
  await mkdir(SNAPSHOT_DIR, { recursive: true });
  const sorted = Object.fromEntries(
    [...toolCatalog.entries()].sort(([a], [b]) => a.localeCompare(b))
  );
  await writeFile(TOOL_CATALOG_FILE, `${JSON.stringify(sorted, null, 2)}\n`);
});

/** Tool keys by snapshot path and tool name, e.g. `sessions.apiKey/firecrawl_scrape`. */
function toolKeysByPath(value, path = '', out = new Map()) {
  if (!value || typeof value !== 'object') return out;
  for (const [key, entry] of Object.entries(value)) {
    const entryPath = path ? `${path}.${key}` : key;
    if (key === 'tools' && Array.isArray(entry)) {
      for (const toolKey of entry) {
        out.set(
          `${path}/${toolKey.slice(0, toolKey.lastIndexOf('@'))}`,
          toolKey
        );
      }
    } else {
      toolKeysByPath(entry, entryPath, out);
    }
  }
  return out;
}

// Shows the changed definition itself rather than only its new hash.
async function assertToolDefinitions(name, actual, expected) {
  const catalog = await readCommittedCatalog();
  const expectedKeys = toolKeysByPath(expected);
  for (const [path, key] of toolKeysByPath(actual)) {
    if (key in catalog) continue;
    assert.deepEqual(
      toolCatalog.get(key),
      catalog[expectedKeys.get(path)],
      `Tool definition ${path} changed in contract snapshot ${name}. If the change is intentional, regenerate with UPDATE_CONTRACT_SNAPSHOTS=1.`
    );
  }
}

async function matchSnapshot(name, actual) {
  const file = new URL(`${name}.json`, SNAPSHOT_DIR);
  const normalized = catalogTools(normalize(actual));
  if (UPDATE) {
    await mkdir(SNAPSHOT_DIR, { recursive: true });
    await writeFile(file, `${JSON.stringify(normalized, null, 2)}\n`);
    return;
  }
  let expected;
  try {
    expected = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      assert.fail(
        `Missing contract snapshot ${name}.json; run with UPDATE_CONTRACT_SNAPSHOTS=1 to create it.`
      );
    }
    throw error;
  }
  await assertToolDefinitions(name, normalized, expected);
  assert.deepEqual(
    normalized,
    expected,
    `Contract snapshot ${name}.json changed. If the change is intentional, regenerate it with UPDATE_CONTRACT_SNAPSHOTS=1.`
  );
}

function rpc(port, endpoint, { id, method, params = {}, headers = {} }) {
  return fetch(`http://127.0.0.1:${port}${endpoint}`, {
    body: JSON.stringify({ id, jsonrpc: '2.0', method, params }),
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'user-agent': 'firecrawl-contract-snapshot/1.0.0',
      ...headers,
    },
    method: 'POST',
  });
}

async function rpcResult(port, endpoint, request) {
  const response = await rpc(port, endpoint, request);
  const body = await response.text();
  assert.equal(
    response.status,
    200,
    `${request.method} returned ${response.status}: ${body}`
  );
  const message = parseSseJson(body);
  return message.error ? { error: message.error } : message.result;
}

async function httpSurface(port, endpoint, headers) {
  const initialize = await rpcResult(port, endpoint, {
    id: 0,
    method: 'initialize',
    params: {
      capabilities: {},
      clientInfo: CLIENT_INFO,
      protocolVersion: PROTOCOL_VERSION,
    },
    headers,
  });
  const { tools } = await rpcResult(port, endpoint, {
    id: 1,
    method: 'tools/list',
    headers,
  });
  return { initialize: initializeContract(initialize), tools };
}

async function httpCall(port, endpoint, headers, name, args) {
  return rpcResult(port, endpoint, {
    id: 2,
    method: 'tools/call',
    params: { arguments: args, name },
    headers,
  });
}

async function readBody(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function getRoute(port, path) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`);
  return { body: await readBody(response), status: response.status };
}

async function unauthenticatedList(port, endpoint) {
  const response = await rpc(port, endpoint, { id: 9, method: 'tools/list' });
  const body = await readBody(response);
  return {
    body:
      typeof body === 'string' && body.startsWith('event:')
        ? parseSseJson(body)
        : body,
    status: response.status,
    wwwAuthenticate: response.headers.get('www-authenticate'),
  };
}

async function startHttp(t, env, waitPort) {
  const port = await getFreePort();
  const child = spawnServer({ ...BASE_ENV, PORT: String(port), ...env });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  t.after(() => stopChild(child));
  try {
    await waitForHealth(waitPort ?? port, child);
  } catch (error) {
    throw new Error(`${error.message}\n${stderr}`);
  }
  return { port, child, getStderr: () => stderr };
}

async function stdioContract(t, env, calls = []) {
  const { client, init } = await startStdio(t, { ...BASE_ENV, ...env });
  const { tools } = await client.request('tools/list');
  const results = {};
  for (const [name, args] of calls) {
    results[name] = await client.request('tools/call', {
      arguments: args,
      name,
    });
  }
  return { initialize: initializeContract(init), tools, calls: results };
}

/** Stands in for the OAuth issuer's token introspection endpoint. */
async function startFakeIssuer(audience) {
  const server = createServer(async (req, res) => {
    let raw = '';
    req.setEncoding('utf8');
    for await (const chunk of req) raw += chunk;
    if (req.method === 'POST' && req.url === '/api/oauth/introspect') {
      const token = new URLSearchParams(raw).get('token') ?? '';
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify(
          token.startsWith('fco_')
            ? {
                active: true,
                api_key: 'fc-from-introspection',
                aud: audience,
                credential_purpose: 'hosted_mcp_oauth',
                scope: 'firecrawl:global',
              }
            : { active: false }
        )
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
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test('contract: stdio with an API key', async (t) => {
  await matchSnapshot(
    'stdio-api-key',
    await stdioContract(t, { FIRECRAWL_API_KEY: 'fc-contract' }, [
      ['firecrawl_extract', { urls: ['https://example.com'] }],
    ])
  );
});

test('contract: stdio without credentials (keyless)', async (t) => {
  await matchSnapshot(
    'stdio-keyless',
    await stdioContract(t, {}, [
      ['firecrawl_map', { url: 'https://example.com' }],
    ])
  );
});

test('contract: stdio against a self-hosted API URL', async (t) => {
  await matchSnapshot(
    'stdio-self-hosted',
    await stdioContract(t, { FIRECRAWL_API_URL: UNREACHABLE_API_URL })
  );
});

test('contract: local HTTP against a self-hosted API URL', async (t) => {
  const { port } = await startHttp(t, {
    FIRECRAWL_API_URL: UNREACHABLE_API_URL,
    HTTP_STREAMABLE_SERVER: 'true',
  });
  await matchSnapshot('http-self-hosted', {
    ...(await httpSurface(port, '/mcp', {})),
    routes: {
      health: await getRoute(port, '/health'),
      oauthProtectedResource: await getRoute(
        port,
        '/.well-known/oauth-protected-resource'
      ),
      ready: await getRoute(port, '/ready'),
    },
  });
});

test('contract: hosted full surface (API key, keyless, invalid credential) and search companion', async (t) => {
  const searchPort = await getFreePort();
  const { port, child } = await startHttp(t, {
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: UNREACHABLE_API_URL,
    FIRECRAWL_MCP_SEARCH_PORT: String(searchPort),
    FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'contract-introspect-secret',
    HTTP_STREAMABLE_SERVER: 'true',
    KEYLESS_PROXY_SECRET: 'contract-keyless-secret',
    OPENAI_APPS_CHALLENGE_TOKEN: 'contract-challenge-token',
  });
  await waitForHealth(searchPort, child);
  const keyed = { authorization: 'Bearer fc-contract' };
  const invalid = { authorization: 'Bearer not-a-firecrawl-key' };

  await matchSnapshot('hosted-full', {
    sessions: {
      apiKey: await httpSurface(port, '/v2/mcp', keyed),
      keyless: await httpSurface(port, '/v2/mcp', {}),
      invalidCredential: await httpSurface(port, '/v2/mcp', invalid),
    },
    calls: {
      apiKeyDeprecatedExtract: await httpCall(
        port,
        '/v2/mcp',
        keyed,
        'firecrawl_extract',
        {
          urls: ['https://example.com'],
        }
      ),
      keylessAccountOnlyTool: await httpCall(
        port,
        '/v2/mcp',
        {},
        'firecrawl_map',
        {
          url: 'https://example.com',
        }
      ),
      invalidCredentialSearch: await httpCall(
        port,
        '/v2/mcp',
        invalid,
        'firecrawl_search',
        {
          query: 'example',
        }
      ),
    },
    routes: {
      health: await getRoute(port, '/health'),
      oauthProtectedResource: await getRoute(
        port,
        '/.well-known/oauth-protected-resource'
      ),
      openAiAppsChallenge: await getRoute(
        port,
        '/.well-known/openai-apps-challenge'
      ),
      ready: await getRoute(port, '/ready'),
    },
  });

  await matchSnapshot('hosted-search-companion', {
    session: await httpSurface(searchPort, SEARCH_ENDPOINT, keyed),
    unauthenticated: await unauthenticatedList(searchPort, SEARCH_ENDPOINT),
    routes: {
      health: await getRoute(searchPort, '/health'),
      oauthProtectedResource: await getRoute(
        searchPort,
        `/.well-known/oauth-protected-resource${SEARCH_ENDPOINT}`
      ),
      openAiAppsChallenge: await getRoute(
        searchPort,
        '/.well-known/openai-apps-challenge'
      ),
      ready: await getRoute(searchPort, '/ready'),
    },
  });
});

test('contract: hosted account surface (/v2/mcp-oauth)', async (t) => {
  const { port } = await startHttp(t, {
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: ACCOUNT_ENDPOINT,
    FIRECRAWL_API_URL: UNREACHABLE_API_URL,
    FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'contract-introspect-secret',
    HTTP_STREAMABLE_SERVER: 'true',
  });
  await matchSnapshot('hosted-account', {
    session: await httpSurface(port, ACCOUNT_ENDPOINT, {
      authorization: 'Bearer fc-contract',
    }),
    unauthenticated: await unauthenticatedList(port, ACCOUNT_ENDPOINT),
    routes: {
      oauthProtectedResource: await getRoute(
        port,
        `/.well-known/oauth-protected-resource${ACCOUNT_ENDPOINT}`
      ),
      ready: await getRoute(port, '/ready'),
    },
  });
});

test('contract: hosted primary search surface (/v2/mcp-search, OAuth only)', async (t) => {
  const issuer = await startFakeIssuer(SEARCH_RESOURCE);
  t.after(() => issuer.close());
  const { port } = await startHttp(t, {
    CLOUD_SERVICE: 'true',
    FASTMCP_ENDPOINT: SEARCH_ENDPOINT,
    FIRECRAWL_API_URL: UNREACHABLE_API_URL,
    FIRECRAWL_MCP_SEARCH_OAUTH_ONLY: 'true',
    FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'contract-introspect-secret',
    FIRECRAWL_OAUTH_ISSUER: issuer.url,
    HTTP_STREAMABLE_SERVER: 'true',
  });
  await matchSnapshot('hosted-search-primary', {
    session: await httpSurface(port, SEARCH_ENDPOINT, {
      authorization: 'Bearer fco_contract',
    }),
    unauthenticated: await unauthenticatedList(port, SEARCH_ENDPOINT),
    apiKeyRejected: await (async () => {
      const response = await rpc(port, SEARCH_ENDPOINT, {
        id: 3,
        method: 'tools/list',
        headers: { authorization: 'Bearer fc-contract' },
      });
      return {
        body: await readBody(response),
        status: response.status,
        wwwAuthenticate: response.headers.get('www-authenticate'),
      };
    })(),
    routes: {
      oauthProtectedResource: await getRoute(
        port,
        `/.well-known/oauth-protected-resource${SEARCH_ENDPOINT}`
      ),
      ready: await getRoute(port, '/ready'),
    },
  });
});
