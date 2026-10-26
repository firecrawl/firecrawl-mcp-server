#!/usr/bin/env node
// Records the raw HTTP surface of a built server (status, selected headers and
// normalised bodies for a fixed battery of requests) so two builds can be
// compared.
//
//   node scripts/http-surface-diff.mjs <dirA>                 print the recording
//   node scripts/http-surface-diff.mjs <dirA> --out a.json    write the recording
//   node scripts/http-surface-diff.mjs <dirA> <dirB>          diff, exit 1 on change
//
// A dir is a package directory holding dist/index.js and package.json (for
// example the repository root after `pnpm build`), or a recording .json.
import http from 'node:http';
import {
  API_KEY,
  SCRAPE_URL,
  STATUS_URLS,
  getFreePort,
  normalize,
  parseSseFrames,
  resolveServerEntry,
  runCli,
  spawnServer,
  startMockApi,
  stopChild,
  waitForHealth,
} from './surface-common.mjs';

const ORIGIN = 'https://client.example';
const PROTOCOL_VERSION = '2025-06-18';
const CLIENT_INFO = { name: 'surface-diff', version: '1.0.0' };
const MAX_BODY_BYTES = 1024 * 1024;
const RECORDED_HEADERS = [
  'access-control-allow-credentials',
  'access-control-allow-headers',
  'access-control-allow-methods',
  'access-control-allow-origin',
  'access-control-expose-headers',
  'access-control-max-age',
  'allow',
  'cache-control',
  'connection',
  'content-type',
  'mcp-protocol-version',
  'mcp-session-id',
  'vary',
  'www-authenticate',
];

function pickHeaders(headers) {
  const out = {};
  for (const name of RECORDED_HEADERS) {
    if (headers[name] !== undefined) out[name] = headers[name];
  }
  for (const name of Object.keys(headers).sort()) {
    if (name.startsWith('access-control-') && !(name in out)) {
      out[name] = headers[name];
    }
  }
  return out;
}

function decodeBody(contentType, text) {
  if (!text) return null;
  if (/text\/event-stream/.test(contentType ?? '')) {
    return { sse: parseSseFrames(text) };
  }
  try {
    return { json: JSON.parse(text) };
  } catch {
    return { text };
  }
}

/**
 * One raw HTTP exchange. A streaming response is read until it ends, until
 * `maxFrames` SSE frames arrived, or until `timeoutMs` passes.
 */
function exchange(port, { method = 'GET', path, headers = {}, body, maxFrames, timeoutMs = 10_000, keepOpen = false }) {
  return new Promise((resolve, reject) => {
    const payload =
      body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
    const request = http.request(
      {
        host: '127.0.0.1',
        port,
        method,
        path,
        headers: {
          ...(payload !== undefined ? { 'content-length': Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (response) => {
        clearTimeout(headerTimer);
        let text = '';
        let settled = false;
        response.setEncoding('utf8');
        const finish = (reason) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          const result = {
            status: response.statusCode,
            headers: pickHeaders(response.headers),
            body: decodeBody(response.headers['content-type'], text),
          };
          if (reason !== 'end') result.streamCut = reason;
          if (keepOpen) {
            result.stream = createFrameReader(response, text);
          } else {
            response.destroy();
          }
          resolve(result);
        };
        const timer = setTimeout(() => finish('timeout'), timeoutMs);
        response.on('data', (chunk) => {
          text += chunk;
          if (maxFrames && parseSseFrames(text.replace(/\r?\n[^\n]*$/, '')).length >= maxFrames && /\n\n$/.test(text)) {
            finish('frames');
          }
        });
        response.on('end', () => finish('end'));
        response.on('error', () => finish('error'));
      }
    );
    const headerTimer = setTimeout(
      () => request.destroy(new Error(`${method} ${path}: no response within ${timeoutMs} ms`)),
      timeoutMs
    );
    request.on('error', (error) => {
      clearTimeout(headerTimer);
      reject(error);
    });
    if (payload !== undefined) request.write(payload);
    request.end();
  });
}

/** Reads further SSE frames from a response left open by `exchange`. */
function createFrameReader(response, consumed) {
  let buffer = '';
  let offset = consumed.length;
  void offset;
  const waiters = [];
  response.on('data', (chunk) => {
    buffer += chunk;
    flush();
  });
  function flush() {
    while (waiters.length) {
      const match = /\r?\n\r?\n/.exec(buffer);
      if (!match) return;
      const end = match.index + match[0].length;
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end);
      waiters.shift().resolve(parseSseFrames(block)[0] ?? null);
    }
  }
  return {
    next(timeoutMs = 5_000) {
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          const index = waiters.findIndex((waiter) => waiter.resolve === done);
          if (index !== -1) waiters.splice(index, 1);
          resolve({ timeout: true });
        }, timeoutMs);
        const done = (frame) => {
          clearTimeout(timer);
          resolve(frame);
        };
        waiters.push({ resolve: done });
        flush();
      });
    },
    close() {
      response.destroy();
    },
  };
}

function rpcBody(id, method, params) {
  return { jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) };
}

function initializeParams(protocolVersion = PROTOCOL_VERSION) {
  return { protocolVersion, capabilities: {}, clientInfo: CLIENT_INFO };
}

const POST_HEADERS = {
  accept: 'application/json, text/event-stream',
  'content-type': 'application/json',
};

function post(ctx, body, { headers = {}, ...rest } = {}) {
  return exchange(ctx.port, {
    method: 'POST',
    path: ctx.endpoint,
    headers: { ...POST_HEADERS, ...ctx.auth, ...headers },
    body,
    ...rest,
  });
}

function postAfterInit(ctx, body, options = {}) {
  return post(ctx, body, {
    ...options,
    headers: { 'mcp-protocol-version': PROTOCOL_VERSION, ...options.headers },
  });
}

function callTool(ctx, name, args, options) {
  return postAfterInit(ctx, rpcBody(10, 'tools/call', { name, arguments: args }), options);
}

/** The battery every HTTP surface runs. Each case returns a recorded exchange. */
function battery() {
  return {
    'options-preflight': (ctx) =>
      exchange(ctx.port, {
        method: 'OPTIONS',
        path: ctx.endpoint,
        headers: {
          origin: ORIGIN,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type, authorization, mcp-protocol-version',
        },
      }),
    'initialize-with-origin': (ctx) =>
      post(ctx, rpcBody(1, 'initialize', initializeParams()), { headers: { origin: ORIGIN } }),
    'initialize-2024-11-05': (ctx) =>
      post(ctx, rpcBody(1, 'initialize', initializeParams('2024-11-05'))),
    'initialize-2025-11-25': (ctx) =>
      post(ctx, rpcBody(1, 'initialize', initializeParams('2025-11-25'))),
    'initialize-unsupported-version': (ctx) =>
      post(ctx, rpcBody(1, 'initialize', initializeParams('1999-01-01'))),
    'notification-initialized': (ctx) =>
      postAfterInit(ctx, { jsonrpc: '2.0', method: 'notifications/initialized' }),
    'get-endpoint': (ctx) =>
      exchange(ctx.port, {
        path: ctx.endpoint,
        headers: { accept: 'text/event-stream', ...ctx.auth },
        maxFrames: 1,
        timeoutMs: 1_500,
      }),
    'delete-endpoint': (ctx) =>
      exchange(ctx.port, { method: 'DELETE', path: ctx.endpoint, headers: { ...ctx.auth } }),
    'get-ping': (ctx) => exchange(ctx.port, { path: '/ping' }),
    'get-health': (ctx) => exchange(ctx.port, { path: '/health' }),
    'head-health': (ctx) => exchange(ctx.port, { method: 'HEAD', path: '/health' }),
    'get-ready': (ctx) => exchange(ctx.port, { path: '/ready' }),
    'get-oauth-protected-resource': (ctx) =>
      exchange(ctx.port, { path: '/.well-known/oauth-protected-resource' }),
    'get-oauth-protected-resource-endpoint': (ctx) =>
      exchange(ctx.port, { path: `/.well-known/oauth-protected-resource${ctx.endpoint}` }),
    'get-oauth-protected-resource-mcp': (ctx) =>
      exchange(ctx.port, { path: '/.well-known/oauth-protected-resource/mcp' }),
    'get-oauth-authorization-server': (ctx) =>
      exchange(ctx.port, { path: '/.well-known/oauth-authorization-server' }),
    'get-unknown-path': (ctx) => exchange(ctx.port, { path: '/no-such-path' }),
    'post-unknown-path': (ctx) =>
      exchange(ctx.port, {
        method: 'POST',
        path: '/no-such-path',
        headers: POST_HEADERS,
        body: rpcBody(1, 'ping'),
      }),
    'post-invalid-json': (ctx) => post(ctx, '{"jsonrpc": "2.0", "id": 1, "method":'),
    'post-not-jsonrpc': (ctx) => post(ctx, { hello: 'world' }),
    'post-body-too-large': (ctx) =>
      post(ctx, {
        ...rpcBody(1, 'tools/call', {
          name: 'firecrawl_scrape',
          arguments: { url: SCRAPE_URL, padding: 'x'.repeat(MAX_BODY_BYTES + 1024) },
        }),
      }),
    'post-wrong-content-type': (ctx) =>
      post(ctx, JSON.stringify(rpcBody(1, 'ping')), { headers: { 'content-type': 'text/plain' } }),
    'post-accept-json-only': (ctx) =>
      post(ctx, rpcBody(1, 'ping'), { headers: { accept: 'application/json' } }),
    'post-batch': (ctx) =>
      postAfterInit(ctx, [rpcBody(1, 'ping'), rpcBody(2, 'tools/list')]),
    'post-bad-protocol-version-header': (ctx) =>
      post(ctx, rpcBody(1, 'ping'), { headers: { 'mcp-protocol-version': '1999-01-01' } }),
    'post-bogus-session-id': (ctx) =>
      postAfterInit(ctx, rpcBody(1, 'ping'), { headers: { 'mcp-session-id': 'not-a-session' } }),
    'ping-without-session': (ctx) => postAfterInit(ctx, rpcBody(1, 'ping')),
    'tools-list': (ctx) => postAfterInit(ctx, rpcBody(2, 'tools/list')),
    'resources-list': (ctx) => postAfterInit(ctx, rpcBody(3, 'resources/list')),
    'prompts-list': (ctx) => postAfterInit(ctx, rpcBody(4, 'prompts/list')),
    'logging-set-level': (ctx) =>
      postAfterInit(ctx, rpcBody(5, 'logging/setLevel', { level: 'debug' })),
    'unknown-method': (ctx) => postAfterInit(ctx, rpcBody(6, 'no/such/method')),
    'tools-call-unknown-tool': (ctx) => callTool(ctx, 'no_such_tool', {}),
    'tools-call-invalid-args': (ctx) => callTool(ctx, 'firecrawl_scrape', { url: 123 }),
    'tools-call-scrape': (ctx) => callTool(ctx, 'firecrawl_scrape', { url: SCRAPE_URL }),
    ...Object.fromEntries(
      Object.entries(STATUS_URLS).map(([status, url]) => [
        `tools-call-scrape-api-${status}`,
        (ctx) => callTool(ctx, 'firecrawl_scrape', { url }, { timeoutMs: 60_000 }),
      ])
    ),
    'legacy-sse': legacySse,
    'legacy-messages-without-session': (ctx) =>
      exchange(ctx.port, {
        method: 'POST',
        path: '/messages',
        headers: { 'content-type': 'application/json', ...ctx.auth },
        body: rpcBody(1, 'ping'),
      }),
    'legacy-messages-bogus-session': (ctx) =>
      exchange(ctx.port, {
        method: 'POST',
        path: '/messages?sessionId=00000000-0000-4000-8000-00000000dead',
        headers: { 'content-type': 'application/json', ...ctx.auth },
        body: rpcBody(1, 'ping'),
      }),
  };
}

/** GET /sse, then initialize through POST /messages and read the reply off the stream. */
async function legacySse(ctx) {
  const open = await exchange(ctx.port, {
    path: '/sse',
    headers: { accept: 'text/event-stream', ...ctx.auth },
    maxFrames: 2,
    timeoutMs: 2_000,
    keepOpen: true,
  });
  const { stream, ...openRecord } = open;
  const frames = open.body?.sse ?? [];
  const endpointFrame = frames.find((frame) => frame.event === 'endpoint');
  if (!endpointFrame || typeof endpointFrame.data !== 'string') {
    stream?.close();
    return { open: openRecord };
  }
  const messagesPath = endpointFrame.data;
  const initialize = await exchange(ctx.port, {
    method: 'POST',
    path: messagesPath,
    headers: { 'content-type': 'application/json', ...ctx.auth },
    body: rpcBody(1, 'initialize', initializeParams()),
  });
  const initializeReply = await stream.next();
  const toolsList = await exchange(ctx.port, {
    method: 'POST',
    path: messagesPath,
    headers: { 'content-type': 'application/json', ...ctx.auth },
    body: rpcBody(2, 'tools/list'),
  });
  const toolsListReply = await stream.next();
  stream.close();
  return {
    open: openRecord,
    initialize,
    initializeReply,
    toolsList,
    toolsListReply: summarizeToolsListFrame(toolsListReply),
  };
}

// The full tool definitions are recorded once per surface under tools-list;
// the legacy transport only needs to show the same list arrived.
function summarizeToolsListFrame(frame) {
  const tools = frame?.data?.result?.tools;
  if (!Array.isArray(tools)) return frame;
  return { ...frame, data: { ...frame.data, result: { toolNames: tools.map((tool) => tool.name) } } };
}

async function runBattery(ctx, cases) {
  const out = {};
  for (const [name, run] of Object.entries(cases)) {
    const mark = ctx.api.requests.length;
    try {
      out[name] = await run(ctx);
    } catch (error) {
      out[name] = { error: String(error?.message ?? error) };
    }
    const upstream = ctx.api.since(mark);
    if (upstream.length) out[name] = { ...out[name], upstream };
  }
  return out;
}

async function record(dir) {
  const { entry, version } = resolveServerEntry(dir);
  const api = await startMockApi();
  const ports = [];
  const cases = {};
  // A surface that cannot start is recorded as such instead of aborting.
  const surface = async (names, { ports: waitPorts, vars }, run) => {
    const child = spawnServer(entry, vars);
    try {
      for (const port of waitPorts) await waitForHealth(port, child);
      await run();
    } catch (error) {
      for (const name of names) {
        cases[name] ??= { startError: String(error?.message ?? error).split('\n')[0] };
      }
    } finally {
      await stopChild(child);
    }
  };
  try {
    // Self-hosted HTTP: HTTP_STREAMABLE_SERVER with an API URL and key in the env.
    const port = await getFreePort();
    ports.push(port);
    await surface(
      ['self-hosted'],
      {
        ports: [port],
        vars: {
          HTTP_STREAMABLE_SERVER: 'true',
          FIRECRAWL_API_URL: api.url,
          FIRECRAWL_API_KEY: API_KEY,
          PORT: String(port),
        },
      },
      async () => {
        cases['self-hosted'] = await runBattery(
          { port, endpoint: '/mcp', auth: {}, api },
          battery()
        );
      }
    );

    // Hosted settings (CLOUD_SERVICE=true) with placeholder secrets: the full
    // surface on /v2/mcp and the search companion on its own port.
    const hostedPort = await getFreePort();
    const searchPort = await getFreePort();
    ports.push(hostedPort, searchPort);
    await surface(
      ['hosted', 'hosted-search'],
      {
        ports: [hostedPort, searchPort],
        vars: {
          CLOUD_SERVICE: 'true',
          HTTP_STREAMABLE_SERVER: 'true',
          FASTMCP_ENDPOINT: '/v2/mcp',
          FIRECRAWL_API_URL: api.url,
          FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'surface-diff-introspect-secret',
          FIRECRAWL_MCP_SEARCH_PORT: String(searchPort),
          PORT: String(hostedPort),
        },
      },
      async () => {
        const keyed = { authorization: `Bearer ${API_KEY}` };
        const hosted = { port: hostedPort, endpoint: '/v2/mcp', auth: keyed, api };
        cases.hosted = await runBattery(hosted, {
          ...battery(),
          'anonymous-tools-list': () =>
            postAfterInit({ ...hosted, auth: {} }, rpcBody(2, 'tools/list')),
          'anonymous-tools-call-scrape': () =>
            callTool({ ...hosted, auth: {} }, 'firecrawl_scrape', { url: SCRAPE_URL }),
          'invalid-bearer-tools-list': () =>
            postAfterInit(
              { ...hosted, auth: { authorization: 'Bearer not-a-firecrawl-key' } },
              rpcBody(2, 'tools/list')
            ),
          'x-firecrawl-api-key-tools-call-scrape': () =>
            callTool(
              { ...hosted, auth: { 'x-firecrawl-api-key': API_KEY } },
              'firecrawl_scrape',
              { url: SCRAPE_URL }
            ),
        });
        const search = { port: searchPort, endpoint: '/v2/mcp-search', auth: keyed, api };
        cases['hosted-search'] = await runBattery(search, {
          ...battery(),
          'anonymous-tools-list': () =>
            postAfterInit({ ...search, auth: {} }, rpcBody(2, 'tools/list')),
        });
      }
    );
  } finally {
    await api.close();
  }
  return {
    recordedWith: 'scripts/http-surface-diff.mjs',
    cases: normalize(cases, { version, ports: [...ports, api.port] }),
  };
}

await runCli(record, 'http-surface-diff.mjs');
