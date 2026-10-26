// MCP Tasks and multi round-trip requests on protocol revision 2026-07-28,
// served when the embedder sets `modernProtocol`. The built-in tasks are
// checked on the wire with raw JSON-RPC, over HTTP and stdio; the embedder
// surface (deferred results, task handlers, input responses) is checked with
// the official SDK client where it consumes the result shape.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { z } from 'zod';
import { createFirecrawlMcpServer, inputRequired, acceptedContent } from '../dist/server.js';
import { getFreePort, parseSseJson } from './helpers/exchange-mcp.mjs';

const TASKS = 'io.modelcontextprotocol/tasks';
const AGENT_ID = '019a1b2c-3d4e-7f00-8a00-0000000000a1';
const CRAWL_ID = '019a1b2c-3d4e-7f00-8a00-0000000000c1';
const EXPIRES_AT = '2099-01-01T00:00:00.000Z';

async function startApi(t) {
  const requests = [];
  const state = {
    agent: { status: 'processing', creditsUsed: 12 },
    crawl: 'scraping',
    agentStatusCode: 200,
    crawlPageCode: 200,
  };
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push({
      method: req.method,
      url: req.url,
      auth: req.headers.authorization,
      body: body ? JSON.parse(body) : undefined,
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const json = (status, payload) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    };
    if (req.method === 'POST' && req.url === '/v2/agent') {
      if (body.includes('refuse-me'))
        return json(402, { success: false, error: 'Insufficient credits.' });
      return json(200, { success: true, id: AGENT_ID });
    }
    if (req.method === 'GET' && req.url === `/v2/agent/${AGENT_ID}`) {
      if (state.agentStatusCode !== 200)
        return json(state.agentStatusCode, {
          success: false,
          error: 'unavailable',
        });
      return json(200, {
        success: true,
        expiresAt: EXPIRES_AT,
        ...state.agent,
      });
    }
    if (req.method === 'DELETE' && req.url === `/v2/agent/${AGENT_ID}`)
      return json(200, { success: true });
    if (req.method === 'POST' && req.url === '/v2/crawl')
      return json(200, {
        success: true,
        id: CRAWL_ID,
        url: 'https://example.com',
      });
    if (req.method === 'GET' && req.url === `/v2/crawl/${CRAWL_ID}`) {
      const done = state.crawl !== 'scraping';
      return json(200, {
        success: true,
        status: state.crawl,
        completed: done ? 2 : 1,
        total: 2,
        expiresAt: EXPIRES_AT,
        data: [{ markdown: 'page one' }],
        next: done ? `${base}/v2/crawl/${CRAWL_ID}?skip=1` : null,
      });
    }
    if (req.method === 'GET' && req.url === `/v2/crawl/${CRAWL_ID}?skip=1`)
      return json(state.crawlPageCode, {
        success: true,
        data: [{ markdown: 'page two' }],
        next: null,
      });
    if (req.method === 'DELETE' && req.url === `/v2/crawl/${CRAWL_ID}`)
      return json(200, { status: 'cancelled' });
    json(404, { success: false, error: 'Job not found' });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { url: `http://127.0.0.1:${server.address().port}`, requests, state };
}

const NAME_FIELD = {
  'tools/call': 'name',
  'tasks/get': 'taskId',
  'tasks/update': 'taskId',
  'tasks/cancel': 'taskId',
};

/**
 * A 2026-07-28 caller speaking raw JSON-RPC: the SDK client does not consume
 * `resultType: "task"` yet, so the wire is checked directly.
 */
function envelope(tasks, legacy) {
  if (legacy) return undefined;
  return {
    'io.modelcontextprotocol/protocolVersion': '2026-07-28',
    'io.modelcontextprotocol/clientInfo': {
      name: 'tasks-test',
      version: '1.0.0',
    },
    'io.modelcontextprotocol/clientCapabilities': tasks
      ? { extensions: { [TASKS]: {} } }
      : {},
  };
}

async function startEmbedded(t, options) {
  const port = await getFreePort();
  const instance = createFirecrawlMcpServer({
    transport: 'httpStream',
    modernProtocol: true,
    ...options,
  });
  await instance.start({
    transportType: 'httpStream',
    httpStream: { port, host: '127.0.0.1', endpoint: '/v2/mcp', stateless: true },
  });
  t.after(() => instance.stop());
  return port;
}

async function connectHttp(t, api, { tasks = true, legacy = false } = {}) {
  const port = await startEmbedded(t, { apiUrl: api.url });
  return httpClient(port, '/v2/mcp', { tasks, legacy });
}

function httpClient(port, endpoint, { tasks = true, legacy = false } = {}) {
  let id = 0;
  return {
    async rpc(method, params = {}) {
      const name = params[NAME_FIELD[method]];
      const response = await fetch(`http://127.0.0.1:${port}${endpoint}`, {
        method: 'POST',
        headers: {
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
          'mcp-method': method,
          'mcp-protocol-version': legacy ? '2025-11-25' : '2026-07-28',
          ...(name ? { 'mcp-name': name } : {}),
          'x-api-key': 'fc-task-test',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: ++id,
          method,
          params: { ...params, _meta: envelope(tasks, legacy) },
        }),
        signal: AbortSignal.timeout(20_000),
      });
      const text = await response.text();
      return text.startsWith('{') ? JSON.parse(text) : parseSseJson(text);
    },
  };
}

const STDIO_FIXTURE = fileURLToPath(new URL('./fixtures/modern-stdio.mjs', import.meta.url));

async function connectStdio(t, api, { tasks = true, legacy = false } = {}) {
  const child = spawn(process.execPath, [STDIO_FIXTURE], {
    env: { ...process.env, FIRECRAWL_API_URL: api.url },
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  t.after(() => child.kill());
  child.stdout.setEncoding('utf8');
  const pending = new Map();
  let buffer = '';
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    for (let at = buffer.indexOf('\n'); at >= 0; at = buffer.indexOf('\n')) {
      const line = buffer.slice(0, at).trim();
      buffer = buffer.slice(at + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      pending.get(message.id)?.(message);
    }
  });
  let id = 0;
  return {
    rpc(method, params = {}) {
      const request = {
        jsonrpc: '2.0',
        id: ++id,
        method,
        params: { ...params, _meta: envelope(tasks, legacy) },
      };
      return new Promise((resolve) => {
        pending.set(request.id, resolve);
        child.stdin.write(`${JSON.stringify(request)}\n`);
      });
    },
  };
}

function result(message) {
  assert.ok(message.result, JSON.stringify(message));
  return message.result;
}

const callTool = async (mcp, name, args) =>
  result(await mcp.rpc('tools/call', { name, arguments: args }));
const getTask = async (mcp, taskId) =>
  result(await mcp.rpc('tasks/get', { taskId }));

for (const [transport, connect] of [
  ['HTTP', connectHttp],
  ['stdio', connectStdio],
]) {
  test(`${transport}: server/discover advertises the tasks extension on 2026-07-28`, async (t) => {
    const mcp = await connect(t, await startApi(t));
    const discovered = result(await mcp.rpc('server/discover'));
    assert.deepEqual(discovered.capabilities.extensions, { [TASKS]: {} });
    const { tools } = result(await mcp.rpc('tools/list'));
    const agent = tools.find((tool) => tool.name === 'firecrawl_agent');
    assert.ok(
      agent.outputSchema.properties.data,
      'an agent task ends with the research result, so its schema names data'
    );
  });

  test(`${transport}: firecrawl_agent runs as a task through to its result`, async (t) => {
    const api = await startApi(t);
    const mcp = await connect(t, api);
    const task = await callTool(mcp, 'firecrawl_agent', {
      prompt: 'Find the founders of Firecrawl',
    });
    assert.equal(task.resultType, 'task');
    assert.match(task.taskId, new RegExp(`^fc-agent-[0-9a-z]+-${AGENT_ID}$`));
    assert.equal(task.status, 'working');
    assert.equal(task.ttlMs, null);
    assert.equal(task.pollIntervalMs, 5000);
    const post = api.requests.find((r) => r.method === 'POST');
    assert.equal(post.body.prompt, 'Find the founders of Firecrawl');
    assert.equal(post.auth, 'Bearer fc-task-test');

    const working = await getTask(mcp, task.taskId);
    assert.equal(working.resultType, 'complete');
    assert.equal(working.status, 'working');
    assert.equal(
      working.statusMessage,
      'Research in progress, 12 credits used so far.'
    );
    assert.equal(working.createdAt, task.createdAt);
    assert.equal(
      working.ttlMs,
      Date.parse(EXPIRES_AT) - Date.parse(task.createdAt)
    );
    assert.equal(working.result, undefined);

    api.state.agentStatusCode = 503;
    const unreadable = await getTask(mcp, task.taskId);
    assert.equal(unreadable.status, 'working');
    assert.match(unreadable.statusMessage, /HTTP 503/);
    assert.equal(unreadable.pollIntervalMs, 10_000);
    api.state.agentStatusCode = 200;

    api.state.agent = {
      status: 'completed',
      data: { founders: ['Caleb', 'Eric', 'Nick'] },
      creditsUsed: 40,
      internalOnly: true,
    };
    const done = await getTask(mcp, task.taskId);
    assert.equal(done.status, 'completed');
    assert.notEqual(done.result.isError, true);
    assert.deepEqual(done.result.structuredContent.data, {
      founders: ['Caleb', 'Eric', 'Nick'],
    });
    assert.equal(
      done.result.structuredContent.internalOnly,
      undefined,
      'structured content follows the advertised schema'
    );
    assert.equal(JSON.parse(done.result.content[0].text).status, 'completed');
  });

  test(`${transport}: a failed agent run completes the task with an isError result`, async (t) => {
    const api = await startApi(t);
    const mcp = await connect(t, api);
    const task = await callTool(mcp, 'firecrawl_agent', {
      prompt: 'Long research',
    });
    api.state.agent = {
      status: 'failed',
      stopReason: 'credit_limit_reached',
      partial: { rows: 3 },
    };
    const failed = await getTask(mcp, task.taskId);
    assert.equal(failed.status, 'completed');
    assert.equal(failed.result.isError, true);
    assert.match(failed.result.content[0].text, /stopped at its credit limit/);
  });

  test(`${transport}: firecrawl_crawl returns a task without waiting, then completes with every page`, async (t) => {
    const api = await startApi(t);
    const mcp = await connect(t, api);
    const task = await callTool(mcp, 'firecrawl_crawl', {
      url: 'https://example.com',
    });
    assert.equal(task.resultType, 'task');
    assert.match(task.taskId, new RegExp(`^fc-crawl-[0-9a-z]+-${CRAWL_ID}$`));
    assert.equal(task.pollIntervalMs, 3000);
    assert.equal(
      api.requests.filter((r) => r.method === 'GET').length,
      0,
      'no status poll before the task is returned'
    );

    const working = await getTask(mcp, task.taskId);
    assert.equal(working.status, 'working');
    assert.equal(working.statusMessage, 'Crawling: 1 of 2 pages done.');

    api.state.crawl = 'completed';
    api.state.crawlPageCode = 503;
    const unreadable = await getTask(mcp, task.taskId);
    assert.equal(unreadable.status, 'working', 'a failed page read leaves the task working');
    assert.match(unreadable.statusMessage, /HTTP 503/);

    api.state.crawlPageCode = 200;
    const done = await getTask(mcp, task.taskId);
    assert.equal(done.status, 'completed');
    assert.deepEqual(done.result.structuredContent.data, [
      { markdown: 'page one' },
      { markdown: 'page two' },
    ]);
  });

  test(`${transport}: tasks/cancel stops the job and an unknown task is invalid params`, async (t) => {
    const api = await startApi(t);
    const mcp = await connect(t, api);
    const task = await callTool(mcp, 'firecrawl_crawl', {
      url: 'https://example.com',
    });
    assert.equal(
      result(await mcp.rpc('tasks/cancel', { taskId: task.taskId })).resultType,
      'complete'
    );
    assert.ok(
      api.requests.some(
        (r) => r.method === 'DELETE' && r.url === `/v2/crawl/${CRAWL_ID}`
      )
    );
    api.state.crawl = 'cancelled';
    assert.equal((await getTask(mcp, task.taskId)).status, 'cancelled');
    assert.equal(
      result(
        await mcp.rpc('tasks/update', {
          taskId: task.taskId,
          inputResponses: {},
        })
      ).resultType,
      'complete'
    );

    for (const taskId of [
      'not-a-task',
      `fc-agent-${Date.now().toString(36)}-missing-job`,
    ]) {
      for (const method of ['tasks/get', 'tasks/cancel']) {
        const { error } = await mcp.rpc(method, { taskId });
        assert.equal(error?.code, -32602, `${method} ${taskId}`);
        assert.match(error.message, /Task not found/);
      }
    }
  });

  test(`${transport}: a refused start answers with the plain tool result`, async (t) => {
    const mcp = await connect(t, await startApi(t));
    const refused = await callTool(mcp, 'firecrawl_agent', {
      prompt: 'refuse-me',
    });
    assert.equal(refused.resultType, 'complete');
    assert.equal(refused.isError, true);
    assert.match(refused.content[0].text, /Insufficient credits/);
  });

  test(`${transport}: a client that does not declare the extension gets the plain call`, async (t) => {
    const api = await startApi(t);
    const mcp = await connect(t, api, { tasks: false });
    api.state.crawl = 'completed';
    const plain = await callTool(mcp, 'firecrawl_crawl', {
      url: 'https://example.com',
    });
    assert.equal(plain.resultType, 'complete');
    assert.equal(plain.structuredContent.status, 'completed');
    const { error } = await mcp.rpc('tasks/get', {
      taskId: `fc-crawl-${Date.now().toString(36)}-${CRAWL_ID}`,
    });
    assert.equal(error?.code, -32021);
    assert.deepEqual(error.data.requiredCapabilities, {
      extensions: { [TASKS]: {} },
    });
  });

  test(`${transport}: 2025-era clients see no tasks extension and the original schemas`, async (t) => {
    const mcp = await connect(t, await startApi(t), { legacy: true });
    const init = result(
      await mcp.rpc('initialize', {
        protocolVersion: '2025-11-25',
        capabilities: { extensions: { [TASKS]: {} } },
        clientInfo: { name: 'tasks-test', version: '1.0.0' },
      })
    );
    assert.equal(init.capabilities.extensions, undefined);
    const { tools } = result(await mcp.rpc('tools/list'));
    const agent = tools.find((tool) => tool.name === 'firecrawl_agent');
    assert.equal(agent.outputSchema.properties.data, undefined);
    const { error } = await mcp.rpc('tasks/get', {
      taskId: `fc-crawl-${Date.now().toString(36)}-${CRAWL_ID}`,
    });
    assert.equal(error?.code, -32601, 'tasks/get is not served on the 2025 revisions');
  });
}

test('task methods reach onToolResult, and taskResult decorates only a completed task', async (t) => {
  const api = await startApi(t);
  const events = [];
  const decorated = [];
  const port = await getFreePort();
  const instance = createFirecrawlMcpServer({
    apiUrl: api.url,
    apiKey: 'fc-task-test',
    transport: 'httpStream',
    modernProtocol: true,
    unstable_hooks: {
      onToolResult: (event) =>
        events.push({
          tool: event.tool,
          status: event.status,
          requestId: event.requestId,
        }),
      taskResult: async ({ tool, jobId, result, session, client }) => {
        decorated.push({
          tool,
          jobId,
          hasSession: Boolean(session),
          client: client.version?.name,
        });
        return {
          ...result,
          structuredContent: {
            ...result.structuredContent,
            agent_hints: ['decorated'],
          },
        };
      },
    },
  });
  await instance.start({
    transportType: 'httpStream',
    httpStream: { port, host: '127.0.0.1', endpoint: '/mcp', stateless: true },
  });
  t.after(() => instance.stop());
  const mcp = httpClient(port, '/mcp');

  const task = await callTool(mcp, 'firecrawl_agent', { prompt: 'p' });
  assert.equal(task.resultType, 'task');
  assert.equal((await getTask(mcp, task.taskId)).status, 'working');
  assert.equal(decorated.length, 0, 'a running task is not decorated');

  api.state.agent = { status: 'completed', data: { answer: 42 } };
  const done = await getTask(mcp, task.taskId);
  assert.deepEqual(done.result.structuredContent.agent_hints, ['decorated']);
  assert.deepEqual(decorated, [
    {
      tool: 'firecrawl_agent',
      jobId: AGENT_ID,
      hasSession: true,
      client: 'tasks-test',
    },
  ]);
  result(await mcp.rpc('tasks/cancel', { taskId: task.taskId }));

  assert.deepEqual(
    events.map(({ tool, status }) => `${tool} ${status}`),
    [
      'firecrawl_agent started',
      'firecrawl_agent success',
      'tasks/get:firecrawl_agent started',
      'tasks/get:firecrawl_agent success',
      'tasks/get:firecrawl_agent started',
      'tasks/get:firecrawl_agent success',
      'tasks/cancel:firecrawl_agent started',
      'tasks/cancel:firecrawl_agent success',
    ]
  );
  assert.equal(
    new Set(events.map((event) => event.requestId)).size,
    4,
    'one request ID per call'
  );

  const { error } = await mcp.rpc('tasks/get', {
    taskId: `fc-crawl-${Date.now().toString(36)}-missing-job`,
  });
  assert.equal(error?.code, -32602);
  assert.deepEqual(
    events.slice(-2).map(({ tool, status }) => `${tool} ${status}`),
    ['tasks/get:firecrawl_crawl started', 'tasks/get:firecrawl_crawl error']
  );
});

const CONFIRM_SCHEMA = {
  type: 'object',
  properties: { confirm: { type: 'boolean' } },
  required: ['confirm'],
};

/**
 * An embedder's tools: one that asks for confirmation through a multi
 * round-trip request, and one that answers with its own task, served by a
 * task handler that asks for approval before it completes.
 */
function embedderHooks(seen) {
  const tasks = new Map();
  return {
    registerExtraTools: (registrar, context) => {
      registrar.addTool({
        name: 'test_deploy',
        description: 'Deploys after the user confirms.',
        parameters: z.object({ env: z.string() }),
        execute: async ({ env }, toolContext) => {
          seen.push({ tool: 'test_deploy', mcp: toolContext.mcp });
          const confirmed = acceptedContent(toolContext.mcp?.inputResponses, 'confirm');
          if (confirmed?.confirm !== true) {
            return inputRequired({
              inputRequests: {
                confirm: inputRequired.elicit({
                  message: `Deploy to ${env}?`,
                  requestedSchema: CONFIRM_SCHEMA,
                }),
              },
              requestState: `deploy:${env}`,
            });
          }
          return {
            content: [{ type: 'text', text: `deployed ${env} from ${toolContext.mcp.requestState}` }],
          };
        },
      });
      registrar.addTool({
        name: 'test_job',
        description: 'Starts a job that runs as a task.',
        parameters: z.object({}),
        execute: async (_args, toolContext) => {
          const taskId = `emb-${tasks.size + 1}`;
          const createdAt = new Date().toISOString();
          tasks.set(taskId, {
            owner: toolContext.session?.firecrawlApiKey,
            status: 'input_required',
            createdAt,
          });
          return {
            resultType: 'task',
            taskId,
            status: 'working',
            createdAt,
            lastUpdatedAt: createdAt,
            ttlMs: 60_000,
            pollIntervalMs: 500,
          };
        },
      });
      context.addTaskHandler({
        owns: (taskId) => taskId.startsWith('emb-'),
        async get(taskId, caller) {
          const task = tasks.get(taskId);
          if (!task || task.owner !== caller.session?.firecrawlApiKey) return undefined;
          seen.push({ get: taskId, client: caller.client.version?.name });
          const base = { createdAt: task.createdAt, ttlMs: 60_000, pollIntervalMs: 500 };
          if (task.status === 'input_required') {
            return {
              ...base,
              status: 'input_required',
              statusMessage: 'Waiting for approval.',
              inputRequests: {
                approve: inputRequired.elicit({
                  message: 'Spend 50 more credits?',
                  requestedSchema: CONFIRM_SCHEMA,
                }),
              },
            };
          }
          if (task.status === 'completed') {
            return {
              ...base,
              status: 'completed',
              result: { content: [{ type: 'text', text: 'job done' }], structuredContent: { ok: true } },
            };
          }
          return { ...base, status: task.status };
        },
        async update(taskId, inputResponses, caller) {
          const task = tasks.get(taskId);
          if (!task || task.owner !== caller.session?.firecrawlApiKey) return false;
          if (acceptedContent(inputResponses, 'approve')?.confirm === true) task.status = 'completed';
          return true;
        },
        async cancel(taskId, caller) {
          const task = tasks.get(taskId);
          if (!task || task.owner !== caller.session?.firecrawlApiKey) return false;
          task.status = 'cancelled';
          return true;
        },
      });
    },
  };
}

test('an embedder tool asks for input with a multi round-trip request, through the official SDK client', async (t) => {
  const seen = [];
  const port = await startEmbedded(t, {
    apiKey: 'fc-task-test',
    unstable_hooks: embedderHooks(seen),
  });
  const client = new Client(
    { name: 'mrtr-test', version: '1.0.0' },
    {
      capabilities: { elicitation: { form: {} } },
      versionNegotiation: { mode: { pin: '2026-07-28' } },
    }
  );
  const prompts = [];
  client.setRequestHandler('elicitation/create', async (request) => {
    prompts.push(request.params.message);
    return { action: 'accept', content: { confirm: true } };
  });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/v2/mcp`)));
  t.after(() => client.close());
  assert.equal(client.getNegotiatedProtocolVersion?.() ?? '2026-07-28', '2026-07-28');

  const result = await client.callTool({ name: 'test_deploy', arguments: { env: 'staging' } });
  assert.equal(result.content[0].text, 'deployed staging from deploy:staging');
  assert.deepEqual(prompts, ['Deploy to staging?']);
  assert.equal(seen.length, 2);
  assert.equal(seen[0].mcp.inputResponses, undefined);
  assert.ok(seen[0].mcp.clientCapabilities.elicitation, 'the declared capabilities reach the tool');
  assert.equal(seen[1].mcp.requestState, 'deploy:staging');
  assert.deepEqual(seen[1].mcp.inputResponses.confirm, { action: 'accept', content: { confirm: true } });
});

test('an embedder tool on a 2025-era call cannot defer its result', async (t) => {
  const port = await startEmbedded(t, {
    apiKey: 'fc-task-test',
    unstable_hooks: embedderHooks([]),
  });
  const mcp = httpClient(port, '/v2/mcp', { legacy: true });
  result(
    await mcp.rpc('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'tasks-test', version: '1.0.0' },
    })
  );
  const answered = await callTool(mcp, 'test_deploy', { env: 'staging' });
  assert.equal(answered.isError, true);
  assert.match(answered.content[0].text, /needs protocol revision 2026-07-28/);
});

test('an embedder task asks for input through tasks/get and tasks/update, then completes', async (t) => {
  const seen = [];
  const port = await startEmbedded(t, {
    apiKey: 'fc-task-test',
    unstable_hooks: embedderHooks(seen),
  });
  const mcp = httpClient(port, '/v2/mcp');
  const task = await callTool(mcp, 'test_job', {});
  assert.equal(task.resultType, 'task');
  assert.equal(task.taskId, 'emb-1');

  const waiting = await getTask(mcp, 'emb-1');
  assert.equal(waiting.resultType, 'complete');
  assert.equal(waiting.status, 'input_required');
  assert.equal(waiting.inputRequests.approve.method, 'elicitation/create');
  assert.ok(waiting.lastUpdatedAt);
  assert.deepEqual(seen.at(-1), { get: 'emb-1', client: 'tasks-test' });

  const ack = result(
    await mcp.rpc('tasks/update', {
      taskId: 'emb-1',
      inputResponses: { approve: { action: 'accept', content: { confirm: true } } },
    })
  );
  assert.equal(ack.resultType, 'complete');
  const done = await getTask(mcp, 'emb-1');
  assert.equal(done.status, 'completed');
  assert.deepEqual(done.result.structuredContent, { ok: true });

  const second = await callTool(mcp, 'test_job', {});
  result(await mcp.rpc('tasks/cancel', { taskId: second.taskId }));
  assert.equal((await getTask(mcp, second.taskId)).status, 'cancelled');

  for (const method of ['tasks/get', 'tasks/update', 'tasks/cancel']) {
    const { error } = await mcp.rpc(method, { taskId: 'emb-99', inputResponses: {} });
    assert.equal(error?.code, -32602, method);
  }
});

test('an embedder task is refused to a client that did not declare the extension', async (t) => {
  const port = await startEmbedded(t, {
    apiKey: 'fc-task-test',
    unstable_hooks: embedderHooks([]),
  });
  const mcp = httpClient(port, '/v2/mcp', { tasks: false });
  const { error } = await mcp.rpc('tools/call', { name: 'test_job', arguments: {} });
  assert.equal(error?.code, -32021);
  assert.deepEqual(error.data.requiredCapabilities, { extensions: { [TASKS]: {} } });
});

test('without modernProtocol, server/discover is refused as before', async (t) => {
  const port = await startEmbedded(t, { apiKey: 'fc-task-test', modernProtocol: false });
  const { error } = await httpClient(port, '/v2/mcp').rpc('server/discover');
  assert.ok(error, 'server/discover is not served');
});
