// Protocol conformance across every supported MCP revision, over stdio and
// over Streamable HTTP (self-hosted HTTP mode): the handshake negotiates the
// requested revision, the tool list matches the contract snapshot for the
// mode, and a tool call round-trips content and structuredContent.
//
// Protocol revision 2026-07-28 is not served: server/discover is refused as
// it always was, and a 2.x client that probes for it falls back to 2025-11-25.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import test, { after } from 'node:test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import {
  getFreePort,
  spawnServer,
  stopChild,
  waitForHealth,
} from './helpers/exchange-mcp.mjs';

const REVISIONS = ['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25'];
const MODERN_REVISION = '2026-07-28';
const SERVER_NAME = 'firecrawl-fastmcp';
const CLIENT_INFO = { name: 'firecrawl-protocol-conformance', version: '1.0.0' };
const HTTP_ENDPOINT = '/mcp';
const SCRAPE_URL = 'https://example.com/';
const EXPECTED_SCRAPE = {
  markdown: '# Scraped fixture',
  metadata: {
    scrapeId: '00000000-0000-4000-8000-000000000010',
    sourceURL: SCRAPE_URL,
  },
};

// Every variable that selects a mode, cleared so the parent environment cannot
// change the mode under test.
const BASE_ENV = {
  CLOUD_SERVICE: '',
  FASTMCP_ENDPOINT: '',
  FIRECRAWL_API_KEY: '',
  FIRECRAWL_API_URL: '',
  FIRECRAWL_DISABLE_ENDPOINT_FEEDBACK: '',
  FIRECRAWL_DISABLE_SEARCH_FEEDBACK: '',
  FIRECRAWL_MCP_SEARCH_ENABLED: '',
  FIRECRAWL_NO_ENDPOINT_FEEDBACK: '',
  FIRECRAWL_NO_SEARCH_FEEDBACK: '',
  FIRECRAWL_OAUTH_TOKEN: '',
  HOST: '127.0.0.1',
  HTTP_STREAMABLE_SERVER: '',
  PORT: '',
  SSE_LOCAL: '',
};

async function snapshotContract(name) {
  const snapshot = JSON.parse(
    await readFile(new URL(`./contract-snapshots/${name}.json`, import.meta.url), 'utf8')
  );
  return {
    capabilities: snapshot.initialize.capabilities,
    toolNames: snapshot.tools.map((key) => key.slice(0, key.lastIndexOf('@'))),
  };
}

const STDIO_CONTRACT = await snapshotContract('stdio-self-hosted');
const HTTP_CONTRACT = await snapshotContract('http-self-hosted');

async function startMockApi() {
  const server = createServer(async (req, res) => {
    let raw = '';
    req.setEncoding('utf8');
    for await (const chunk of req) raw += chunk;
    if (req.method === 'POST' && req.url === '/v2/scrape') {
      const body = JSON.parse(raw);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          data: {
            ...EXPECTED_SCRAPE,
            metadata: { ...EXPECTED_SCRAPE.metadata, sourceURL: body.url },
          },
        })
      );
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: `Unhandled ${req.method} ${req.url}` }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

const api = await startMockApi();
const STDIO_ENV = { ...BASE_ENV, FIRECRAWL_API_URL: api.url };

const httpPort = await getFreePort();
const httpChild = spawnServer({
  ...BASE_ENV,
  FIRECRAWL_API_URL: api.url,
  HTTP_STREAMABLE_SERVER: 'true',
  PORT: String(httpPort),
});
after(async () => {
  await stopChild(httpChild);
  await api.close();
});
await waitForHealth(httpPort, httpChild);
const HTTP_URL = `http://127.0.0.1:${httpPort}${HTTP_ENDPOINT}`;

function initializeParams(protocolVersion) {
  return { protocolVersion, capabilities: {}, clientInfo: CLIENT_INFO };
}

function assertInitializeResult(result, revision, contract) {
  assert.equal(result.protocolVersion, revision);
  assert.equal(result.serverInfo?.name, SERVER_NAME);
  assert.equal(typeof result.serverInfo?.version, 'string');
  assert.deepEqual(result.capabilities, contract.capabilities);
}

function assertScrapeResult(result) {
  assert.notEqual(result.isError, true, JSON.stringify(result));
  assert.deepEqual(result.content, [
    { type: 'text', text: JSON.stringify(EXPECTED_SCRAPE, null, 2) },
  ]);
  assert.deepEqual(result.structuredContent, EXPECTED_SCRAPE);
}

// ---------------------------------------------------------------------------
// Raw JSON-RPC over stdio.

/** Newline-delimited JSON-RPC client over a spawned server's stdio. */
class RawStdioClient {
  #buffer = '';
  #child;
  #nextId = 1;
  #pending = new Map();

  constructor(child) {
    this.#child = child;
    child.stdout.on('data', (chunk) => {
      this.#buffer += chunk;
      let newline;
      while ((newline = this.#buffer.indexOf('\n')) !== -1) {
        const line = this.#buffer.slice(0, newline).trim();
        this.#buffer = this.#buffer.slice(newline + 1);
        if (!line) continue;
        const message = JSON.parse(line);
        const pending = this.#pending.get(message.id);
        if (pending && !message.method) {
          this.#pending.delete(message.id);
          pending(message);
        }
      }
    });
    child.once('exit', (code, signal) => {
      for (const resolve of this.#pending.values()) {
        resolve({ error: { code: 'EXIT', message: `server exited: ${code ?? signal}` } });
      }
      this.#pending.clear();
    });
  }

  notify(method, params) {
    this.#child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  }

  /** Resolves with the whole response message (result or error). */
  send(method, params, timeoutMs = 10_000) {
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`timed out waiting for ${method}`));
      }, timeoutMs);
      this.#pending.set(id, (message) => {
        clearTimeout(timer);
        resolve(message);
      });
      this.#child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  async request(method, params) {
    const message = await this.send(method, params);
    assert.equal(message.error, undefined, `${method}: ${JSON.stringify(message.error)}`);
    return message.result;
  }
}

function startRawStdio(t) {
  const child = spawnServer(STDIO_ENV);
  t.after(() => stopChild(child));
  return new RawStdioClient(child);
}

// ---------------------------------------------------------------------------
// Raw JSON-RPC over Streamable HTTP.

const INITIALIZE_HEADERS = {
  accept: 'application/json, text/event-stream',
  'content-type': 'application/json',
};

// Clients send MCP-Protocol-Version on every request after initialize from
// 2025-06-18 on; earlier revisions do not have the header.
function headersFor(revision) {
  return revision >= '2025-06-18'
    ? { ...INITIALIZE_HEADERS, 'mcp-protocol-version': revision }
    : INITIALIZE_HEADERS;
}

/** The JSON-RPC message answering `id` in a JSON or SSE response body. */
function responseMessage(response, body, id) {
  if ((response.headers.get('content-type') ?? '').includes('text/event-stream')) {
    for (const block of body.split(/\r?\n\r?\n/)) {
      const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (!data) continue;
      const message = JSON.parse(data);
      if (message.id === id && !message.method) return message;
    }
    assert.fail(`no response for id ${id} in SSE body: ${body}`);
  }
  const message = JSON.parse(body);
  assert.equal(message.id, id, body);
  return message;
}

function assertNoSessionHeader(response, label) {
  assert.equal(
    response.headers.get('mcp-session-id'),
    null,
    `${label} must not issue an mcp-session-id in stateless mode`
  );
}

async function httpRpc(revision, { id, method, params, headers }) {
  const response = await fetch(HTTP_URL, {
    method: 'POST',
    headers: headers ?? headersFor(revision),
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  const body = await response.text();
  assert.equal(response.status, 200, `${method} returned ${response.status}: ${body}`);
  assertNoSessionHeader(response, method);
  const message = responseMessage(response, body, id);
  assert.equal(message.error, undefined, `${method}: ${JSON.stringify(message.error)}`);
  return message.result;
}

for (const revision of REVISIONS) {
  test(`stdio ${revision}: initialize, tools/list and tools/call`, async (t) => {
    const client = startRawStdio(t);
    const init = await client.request('initialize', initializeParams(revision));
    assertInitializeResult(init, revision, STDIO_CONTRACT);
    client.notify('notifications/initialized');

    const { tools } = await client.request('tools/list');
    assert.deepEqual(tools.map((tool) => tool.name), STDIO_CONTRACT.toolNames);

    assertScrapeResult(
      await client.request('tools/call', {
        name: 'firecrawl_scrape',
        arguments: { url: SCRAPE_URL },
      })
    );
  });

  test(`Streamable HTTP ${revision}: initialize, tools/list and tools/call`, async () => {
    const init = await httpRpc(revision, {
      id: 1,
      method: 'initialize',
      params: initializeParams(revision),
      headers: INITIALIZE_HEADERS,
    });
    assertInitializeResult(init, revision, HTTP_CONTRACT);

    const initialized = await fetch(HTTP_URL, {
      method: 'POST',
      headers: headersFor(revision),
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    });
    await initialized.arrayBuffer();
    assert.equal(initialized.status, 202);
    assertNoSessionHeader(initialized, 'notifications/initialized');

    const { tools } = await httpRpc(revision, { id: 2, method: 'tools/list' });
    assert.deepEqual(tools.map((tool) => tool.name), HTTP_CONTRACT.toolNames);

    assertScrapeResult(
      await httpRpc(revision, {
        id: 3,
        method: 'tools/call',
        params: { name: 'firecrawl_scrape', arguments: { url: SCRAPE_URL } },
      })
    );
  });
}

// ---------------------------------------------------------------------------
// 2026-07-28 is not served.

const DISCOVER_META = {
  'io.modelcontextprotocol/protocolVersion': MODERN_REVISION,
  'io.modelcontextprotocol/clientInfo': CLIENT_INFO,
  'io.modelcontextprotocol/clientCapabilities': {},
};

test(`Streamable HTTP ${MODERN_REVISION}: server/discover is refused as an unsupported revision`, async () => {
  const response = await fetch(HTTP_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'mcp-protocol-version': MODERN_REVISION,
      'mcp-method': 'server/discover',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'server/discover', params: { _meta: DISCOVER_META } }),
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message: `Bad Request: Unsupported protocol version: ${MODERN_REVISION} (supported versions: 2025-11-25, 2025-06-18, 2025-03-26, 2024-11-05, 2024-10-07)`,
    },
    id: null,
  });
});

test(`stdio ${MODERN_REVISION}: server/discover is an unknown method`, async (t) => {
  const child = spawnServer(STDIO_ENV);
  t.after(() => stopChild(child));
  const client = new RawStdioClient(child);
  const message = await client.send('server/discover', { _meta: DISCOVER_META }, 5_000);
  assert.deepEqual(message.error, { code: -32601, message: 'Method not found' });
});

function probingClient() {
  return new Client(CLIENT_INFO, {
    versionNegotiation: { mode: 'auto', probe: { timeoutMs: 10_000 } },
  });
}

async function assertFallback(client, toolNames) {
  assert.equal(client.getNegotiatedProtocolVersion(), '2025-11-25');
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((tool) => tool.name), toolNames);
  assertScrapeResult(
    await client.callTool({ name: 'firecrawl_scrape', arguments: { url: SCRAPE_URL } })
  );
}

test('Streamable HTTP: a 2.x client probing for 2026-07-28 falls back to 2025-11-25', { timeout: 60_000 }, async (t) => {
  const client = probingClient();
  t.after(() => client.close());
  await client.connect(new StreamableHTTPClientTransport(new URL(HTTP_URL)));
  await assertFallback(client, HTTP_CONTRACT.toolNames);
});

test('stdio: a 2.x client probing for 2026-07-28 falls back to 2025-11-25', { timeout: 60_000 }, async (t) => {
  const env = {
    ...process.env,
    MCP_DELEGATED_CREDENTIAL_SECRET: 'test-mcp-delegated-credential-secret-32',
    ...STDIO_ENV,
  };
  const client = probingClient();
  t.after(() => client.close());
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ['dist/index.js'],
      cwd: process.cwd(),
      env: Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined)),
      stderr: 'ignore',
    })
  );
  await assertFallback(client, STDIO_CONTRACT.toolNames);
});
