// Contract tests for the extension hooks of createFirecrawlMcpServer.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { z } from 'zod';
import { createFirecrawlMcpServer } from '../dist/server.js';
import { getFreePort, parseSseJson } from './helpers/exchange-mcp.mjs';

const ENDPOINT = '/mcp';

async function startFakeApi(t) {
  const requests = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    req.setEncoding('utf8');
    for await (const chunk of req) raw += chunk;
    requests.push({
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: raw,
    });
    res.writeHead(200, { 'content-type': 'application/json' });
    if (req.url?.startsWith('/v2/map')) {
      res.end(
        JSON.stringify({
          success: true,
          links: [{ url: 'https://example.com/a' }],
        })
      );
      return;
    }
    res.end(JSON.stringify({ success: true, data: [] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { url: `http://127.0.0.1:${server.address().port}`, requests };
}

async function startEmbedded(t, options) {
  const port = await getFreePort();
  const instance = createFirecrawlMcpServer({
    transport: 'httpStream',
    ...options,
  });
  await instance.start({
    transportType: 'httpStream',
    httpStream: {
      port,
      host: '127.0.0.1',
      endpoint: ENDPOINT,
      stateless: true,
    },
  });
  t.after(() => instance.server.stop());
  return port;
}

async function rpc(port, method, params = {}, headers = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${ENDPOINT}`, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({ id: 1, jsonrpc: '2.0', method, params }),
  });
  assert.equal(response.status, 200, `${method} returned ${response.status}`);
  return parseSseJson(await response.text()).result;
}

const callTool = (port, name, args = {}, headers) =>
  rpc(port, 'tools/call', { name, arguments: args }, headers);

const listTools = async (port, headers) =>
  (await rpc(port, 'tools/list', {}, headers)).tools.map((tool) => tool.name);

function extraTool(name, execute) {
  return {
    name,
    description: `Test tool ${name}.`,
    parameters: z.object({}),
    execute,
  };
}

test('a custom authenticate session reaches tool handlers with a per-call request ID', async (t) => {
  const port = await startEmbedded(t, {
    apiUrl: 'http://127.0.0.1:9',
    unstable_hooks: {
      authenticate: async (request) => ({
        authType: 'api-key',
        firecrawlApiKey: 'fc-embedded',
        tenant: request?.headers['x-tenant'],
      }),
      registerExtraTools: (registrar) => {
        registrar.addTool(
          extraTool('embed_whoami', async (_args, { session }) =>
            JSON.stringify({
              tenant: session.tenant,
              requestId: session.requestId,
            })
          )
        );
      },
    },
  });

  const result = await callTool(
    port,
    'embed_whoami',
    {},
    { 'x-tenant': 'acme' }
  );
  const body = JSON.parse(result.content[0].text);
  assert.equal(body.tenant, 'acme');
  assert.match(body.requestId, /^[0-9a-f-]{36}$/);
});

test('wrapTool sees built-in, module and extra tools', async (t) => {
  const seen = [];
  await startEmbedded(t, {
    apiUrl: 'http://127.0.0.1:9',
    unstable_hooks: {
      wrapTool: (tool) => {
        seen.push(tool.name);
        return tool;
      },
      registerExtraTools: (registrar) => {
        registrar.addTool(extraTool('embed_extra', async () => 'ok'));
      },
    },
  });
  for (const name of [
    'firecrawl_scrape',
    'firecrawl_search',
    'firecrawl_monitor_create',
    'firecrawl_research_search_papers',
    'firecrawl_developer_search',
    'firecrawl_credit_usage',
    'embed_extra',
  ]) {
    assert.ok(seen.includes(name), `wrapTool did not see ${name}`);
  }
});

test('onToolResult reports start and outcome with agent hints on success and error', async (t) => {
  const events = [];
  const port = await startEmbedded(t, {
    apiUrl: 'http://127.0.0.1:9',
    unstable_hooks: {
      onToolResult: (event) => events.push(event),
      registerExtraTools: (registrar) => {
        registrar.addTool(
          extraTool('embed_hinted', async () => ({
            content: [{ type: 'text', text: 'ok' }],
            structuredContent: { agent_hints: ['hint-on-success'] },
          }))
        );
        registrar.addTool(
          extraTool('embed_failing', async () => {
            throw Object.assign(new Error('boom'), {
              agent_hints: ['hint-on-error'],
            });
          })
        );
      },
    },
  });

  await callTool(port, 'embed_hinted');
  const failed = await callTool(port, 'embed_failing');
  assert.equal(failed.isError, true);

  const summary = events.map(({ tool, status, agentHints }) => ({
    tool,
    status,
    agentHints,
  }));
  assert.deepEqual(summary, [
    { tool: 'embed_hinted', status: 'started', agentHints: undefined },
    {
      tool: 'embed_hinted',
      status: 'success',
      agentHints: ['hint-on-success'],
    },
    { tool: 'embed_failing', status: 'started', agentHints: undefined },
    { tool: 'embed_failing', status: 'error', agentHints: ['hint-on-error'] },
  ]);
  const requestIds = new Set(events.map((event) => event.requestId));
  assert.equal(
    requestIds.size,
    2,
    'each call has one request ID across its events'
  );
});

test('toolFilter blocks built-in and module registrations but not extra tools', async (t) => {
  const blocked = new Set([
    'firecrawl_map',
    'firecrawl_monitor_create',
    'embed_extra',
  ]);
  const port = await startEmbedded(t, {
    apiUrl: 'http://127.0.0.1:9',
    unstable_hooks: {
      toolFilter: (name) => !blocked.has(name),
      registerExtraTools: (registrar, { builtInTool }) => {
        registrar.addTool(extraTool('embed_extra', async () => 'ok'));
        assert.equal(builtInTool('firecrawl_map')?.name, 'firecrawl_map');
      },
    },
  });
  const tools = await listTools(port);
  assert.equal(tools.includes('firecrawl_map'), false);
  assert.equal(tools.includes('firecrawl_monitor_create'), false);
  assert.ok(tools.includes('firecrawl_scrape'));
  assert.ok(tools.includes('firecrawl_monitor_list'));
  assert.ok(tools.includes('embed_extra'));
});

test('outboundRequest credential and headers reach SDK and fetch-based API calls', async (t) => {
  const api = await startFakeApi(t);
  const port = await startEmbedded(t, {
    apiUrl: api.url,
    apiKey: 'fc-configured',
    unstable_hooks: {
      outboundRequest: () => ({
        credential: 'fc-per-request',
        headers: { 'x-embedder-trace': 'trace-1' },
      }),
    },
  });

  const mapped = await callTool(port, 'firecrawl_map', {
    url: 'https://example.com',
  });
  assert.notEqual(mapped.isError, true, JSON.stringify(mapped));
  const listed = await callTool(port, 'firecrawl_monitor_list');
  assert.notEqual(listed.isError, true, JSON.stringify(listed));

  const sdkCall = api.requests.find((request) =>
    request.url.startsWith('/v2/map')
  );
  const fetchCall = api.requests.find((request) =>
    request.url.startsWith('/v2/monitor')
  );
  for (const [label, request] of [
    ['SDK', sdkCall],
    ['fetch', fetchCall],
  ]) {
    assert.ok(request, `${label} request was not made`);
    assert.equal(request.headers.authorization, 'Bearer fc-per-request', label);
    assert.equal(request.headers['x-embedder-trace'], 'trace-1', label);
  }
});

test('beforeKeylessRequest can refuse a keyless call before it is sent', async (t) => {
  const origins = [];
  const port = await startEmbedded(t, {
    unstable_hooks: {
      authenticate: async () => ({ authType: 'keyless' }),
      beforeKeylessRequest: async (_session, origin) => {
        origins.push(origin);
        throw new Error('keyless use refused by the embedder');
      },
    },
  });
  const result = await callTool(port, 'firecrawl_search', { query: 'example' });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /keyless use refused by the embedder/);
  assert.equal(origins.length, 1);
});

test('instructions, configureHttp and oauth metadata hooks shape the instance', async (t) => {
  let defaults;
  const port = await startEmbedded(t, {
    apiUrl: 'http://127.0.0.1:9',
    unstable_hooks: {
      instructions: (given) => {
        defaults = given;
        return 'Embedded instructions.';
      },
      configureHttp: (app) =>
        app.get('/embedded', (context) => context.text('embedded route')),
      oauth: {
        protectedResource: {
          authorizationServers: ['https://issuer.example'],
          resource: 'https://mcp.example/mcp',
          resourceName: 'Embedded',
        },
      },
    },
  });
  assert.equal(typeof defaults.authenticated, 'string');
  assert.equal(typeof defaults.keyless, 'string');

  const init = await rpc(port, 'initialize', {
    capabilities: {},
    clientInfo: { name: 'hooks-test', version: '1.0.0' },
    protocolVersion: '2025-06-18',
  });
  assert.equal(init.instructions, 'Embedded instructions.');

  const route = await fetch(`http://127.0.0.1:${port}/embedded`);
  assert.equal(await route.text(), 'embedded route');

  const metadata = await fetch(
    `http://127.0.0.1:${port}/.well-known/oauth-protected-resource`
  );
  assert.equal(metadata.status, 200);
  const body = await metadata.json();
  assert.equal(body.resource, 'https://mcp.example/mcp');
  assert.deepEqual(body.authorization_servers, ['https://issuer.example']);
});

test('a 401 from an added tool is not treated as a Firecrawl credential rejection', async (t) => {
  const port = await startEmbedded(t, {
    apiUrl: 'http://127.0.0.1:9',
    unstable_hooks: {
      authenticate: async () => ({
        authType: 'api-key',
        firecrawlApiKey: 'fc-embedded',
      }),
      registerExtraTools: (registrar) => {
        registrar.addTool(
          extraTool('embed_other_backend', async () => {
            throw Object.assign(
              new Error('other backend rejected the request'),
              {
                status: 401,
              }
            );
          })
        );
      },
    },
  });
  const result = await callTool(port, 'embed_other_backend');
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /other backend rejected the request/);
  assert.notEqual(result.structuredContent?.code, 'CREDENTIAL_INVALID');
});

// Feedback tools on a stdio instance that gets credentials only from hooks.
// The stdio transport owns the process's stdin and stdout, so each case runs
// in a child process.
async function startStdioEmbedder(t, hooksSource) {
  const { spawn } = await import('node:child_process');
  const serverUrl = new URL('../dist/server.js', import.meta.url).href;
  const child = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      // Every outbound request is reported on stderr so a test can assert
      // that none was made.
      `const realFetch = globalThis.fetch;
       globalThis.fetch = (input, init) => {
         process.stderr.write('FETCH ' + (input?.url ?? input) + '\\n');
         return realFetch(input, init);
       };
       const { createFirecrawlMcpServer } = await import(${JSON.stringify(serverUrl)});
       await createFirecrawlMcpServer({ unstable_hooks: ${hooksSource} })
         .start({ transportType: 'stdio' });`,
    ],
    {
      env: { ...process.env, FIRECRAWL_API_KEY: '', FIRECRAWL_API_URL: '' },
      stdio: ['pipe', 'pipe', 'pipe'],
    }
  );
  t.after(() => child.kill());
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  let buffer = '';
  const responses = new Map();
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      responses.get(message.id)?.(message);
    }
  });
  const request = (id, method, params = {}) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`timed out on ${method}`)),
        10_000
      );
      responses.set(id, (message) => {
        clearTimeout(timer);
        resolve(message.result);
      });
      child.stdin.write(
        `${JSON.stringify({ id, jsonrpc: '2.0', method, params })}\n`
      );
    });
  await request(1, 'initialize', {
    capabilities: {},
    clientInfo: { name: 'hooks-test', version: '1.0.0' },
    protocolVersion: '2025-06-18',
  });
  child.stdin.write(
    `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`
  );
  const { tools } = await request(2, 'tools/list');
  return {
    names: tools.map((tool) => tool.name),
    request,
    outboundRequests: () =>
      stderr.split('\n').filter((line) => line.startsWith('FETCH ')),
  };
}

const FEEDBACK_TOOLS = ['firecrawl_search_feedback', 'firecrawl_feedback'];

test('a stdio embedder authenticating through authenticate lists the feedback tools', async (t) => {
  const { names } = await startStdioEmbedder(
    t,
    `{ authenticate: async () => ({ authType: 'api-key', firecrawlApiKey: 'fc-embedded' }) }`
  );
  for (const name of FEEDBACK_TOOLS) assert.ok(names.includes(name), name);
});

test('a stdio embedder supplying credentials through outboundRequest lists the feedback tools', async (t) => {
  const { names } = await startStdioEmbedder(
    t,
    `{ outboundRequest: () => ({ credential: 'fc-per-request' }) }`
  );
  for (const name of FEEDBACK_TOOLS) assert.ok(names.includes(name), name);
});

test('a keyless session on a hooked stdio embedder neither lists nor runs the feedback tools', async (t) => {
  const { names, request, outboundRequests } = await startStdioEmbedder(
    t,
    `{ authenticate: async () => ({ authType: 'keyless' }) }`
  );
  assert.ok(names.includes('firecrawl_scrape'));
  for (const name of FEEDBACK_TOOLS)
    assert.equal(names.includes(name), false, name);
  // Calling a hidden tool by name is refused before any request is made.
  const called = await request(3, 'tools/call', {
    name: 'firecrawl_feedback',
    arguments: {
      endpoint: 'scrape',
      jobId: '00000000-0000-4000-8000-000000000000',
      rating: 'good',
    },
  });
  assert.equal(called.isError, true);
  assert.equal(called.structuredContent?.code, 'KEYLESS_TOOL_NOT_AVAILABLE');
  assert.deepEqual(outboundRequests(), []);
});
