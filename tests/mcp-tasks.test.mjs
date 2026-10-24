import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import {
  getFreePort,
  parseSseJson,
  spawnServer,
  stopChild,
  waitForHealth,
} from './helpers/exchange-mcp.mjs';

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
      return json(200, {
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

async function connectHttp(t, api, { tasks = true, legacy = false } = {}) {
  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    HTTP_STREAMABLE_SERVER: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_KEY: '',
    FIRECRAWL_OAUTH_TOKEN: '',
    FIRECRAWL_API_URL: api.url,
    FIRECRAWL_MCP_SEARCH_ENABLED: 'false',
    PORT: String(port),
  });
  t.after(() => stopChild(child));
  await waitForHealth(port, child);
  let id = 0;
  return {
    url: `http://127.0.0.1:${port}/v2/mcp`,
    async rpc(method, params = {}) {
      const name = params[NAME_FIELD[method]];
      const response = await fetch(`http://127.0.0.1:${port}/v2/mcp`, {
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

async function connectStdio(t, api, { tasks = true, legacy = false } = {}) {
  const child = spawnServer({
    CLOUD_SERVICE: 'false',
    FIRECRAWL_API_KEY: 'fc-task-test',
    FIRECRAWL_API_URL: api.url,
  });
  t.after(() => stopChild(child));
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
    assert.ok(error, 'tasks/get is not served on the 2025 revisions');
  });
}
