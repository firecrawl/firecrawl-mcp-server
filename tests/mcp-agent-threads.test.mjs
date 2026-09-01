import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

const THREAD_ID = '018f0000-0000-4000-8000-000000000000';
const BUSY_THREAD_ID = '018f0000-0000-4000-8000-0000000000b0';
const MISSING_THREAD_ID = '018f0000-0000-4000-8000-000000000404';
const LEGACY_THREAD_ID = '018f0000-0000-4000-8000-000000000400';
const APPROVAL_ID = '018f0000-0000-4000-8000-0000000000a1';
const ACTIVE_RUN_ID = '018f0000-0000-4000-8000-0000000000c1';

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
      const error = new Error(`MCP server exited: code=${code} signal=${signal}`);
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
        if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
        else pending.resolve(message.result);
      }
    }
  }

  #write(message) {
    this.#child.stdin.write(`${JSON.stringify(message)}\n`);
  }
}

// A fake /v2/agent surface with threads: it starts runs, refuses a busy thread,
// serves one thread, and 404s an unknown one.
async function startFakeAgentApi() {
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = '';
    req.setEncoding('utf8');
    for await (const chunk of req) body += chunk;
    const parsedBody = body ? JSON.parse(body) : undefined;
    requests.push({ body: parsedBody, method: req.method, url: req.url });

    const json = (status, payload) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    };

    if (req.method === 'POST' && req.url === '/v2/agent') {
      // An API predating threads: its request schema is strict, so it names
      // the key it did not recognize.
      if (parsedBody?.threadId === LEGACY_THREAD_ID) {
        json(400, {
          success: false,
          error: "Unrecognized key(s) in object: 'threadId'",
        });
        return;
      }
      if (parsedBody?.prompt === 'reject me') {
        json(400, { success: false, error: 'Prompt is not allowed' });
        return;
      }
      if (parsedBody?.threadId === BUSY_THREAD_ID) {
        json(409, {
          success: false,
          code: 'thread_busy',
          error: 'Thread already has a run in progress',
          runId: ACTIVE_RUN_ID,
        });
        return;
      }
      json(200, {
        success: true,
        id: '018f0000-0000-4000-8000-0000000000b2',
        threadId: parsedBody?.threadId ?? THREAD_ID,
        threadTurn: parsedBody?.threadId ? 2 : 1,
      });
      return;
    }

    if (req.method === 'GET' && req.url?.startsWith('/v2/agent/threads/')) {
      if (req.url.includes(MISSING_THREAD_ID)) {
        json(404, {
          success: false,
          code: 'thread_not_found',
          error: 'Thread not found',
        });
        return;
      }
      json(200, {
        success: true,
        thread: {
          id: THREAD_ID,
          status: 'idle',
          runs: [
            {
              id: '018f0000-0000-4000-8000-0000000000a2',
              turn: 1,
              mode: 'chat',
              prompt: "List Acme's pricing tiers",
              status: 'succeeded',
              message: 'Acme lists three tiers.',
              data: null,
            },
          ],
        },
      });
      return;
    }

    json(404, { error: `Unhandled ${req.method} ${req.url}` });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  return {
    requests,
    url: `http://127.0.0.1:${server.address().port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function startClient(t, fakeApi) {
  const child = spawnServer({
    FIRECRAWL_API_KEY: 'fc-test',
    FIRECRAWL_API_URL: fakeApi.url,
  });
  t.after(() => stopChild(child));
  const client = new StdioMcpClient(child);
  await client.request('initialize', {
    capabilities: {},
    clientInfo: { name: 'firecrawl-agent-threads', version: '0.0.0' },
    protocolVersion: '2025-06-18',
  });
  client.notify('notifications/initialized');
  return client;
}

function toolPayload(result) {
  assert.notEqual(result.isError, true, JSON.stringify(result));
  assert.equal(result.content[0].type, 'text');
  return JSON.parse(result.content[0].text);
}

test('firecrawl_agent forwards thread and exchange arguments and returns the thread id', async (t) => {
  const fakeApi = await startFakeAgentApi();
  t.after(() => fakeApi.close());
  const client = await startClient(t, fakeApi);

  const result = await client.request('tools/call', {
    arguments: {
      prompt: 'Which tier includes SSO?',
      threadId: THREAD_ID,
      mode: 'chat',
      effort: 'high',
      exchange: { enabled: true, maxCalls: 3, requireApproval: true },
    },
    name: 'firecrawl_agent',
  });

  assert.deepEqual(fakeApi.requests[0].body, {
    prompt: 'Which tier includes SSO?',
    threadId: THREAD_ID,
    mode: 'chat',
    effort: 'high',
    exchange: { enabled: true, maxCalls: 3, requireApproval: true },
    origin: 'mcp-fastmcp',
  });
  assert.deepEqual(toolPayload(result), {
    success: true,
    id: '018f0000-0000-4000-8000-0000000000b2',
    threadId: THREAD_ID,
    threadTurn: 2,
  });
});

test('firecrawl_agent sends the fixed reply and exchange.approve when a host approves', async (t) => {
  const fakeApi = await startFakeAgentApi();
  t.after(() => fakeApi.close());
  const client = await startClient(t, fakeApi);

  const approved = await client.request('tools/call', {
    arguments: {
      prompt: 'yes',
      threadId: THREAD_ID,
      approve: { approvalId: APPROVAL_ID, always: true },
    },
    name: 'firecrawl_agent',
  });
  toolPayload(approved);

  assert.deepEqual(fakeApi.requests[0].body, {
    prompt: 'Approved. Make that call, and nothing else.',
    threadId: THREAD_ID,
    exchange: { approve: { approvalId: APPROVAL_ID, always: true } },
    origin: 'mcp-fastmcp',
  });

  const declined = await client.request('tools/call', {
    arguments: {
      prompt: 'no',
      threadId: THREAD_ID,
      decline: { approvalId: APPROVAL_ID },
    },
    name: 'firecrawl_agent',
  });
  toolPayload(declined);

  assert.deepEqual(fakeApi.requests[1].body, {
    prompt:
      'Do not make that call. Answer from what you already have, or tell me what you would need.',
    threadId: THREAD_ID,
    exchange: { decline: { approvalId: APPROVAL_ID } },
    origin: 'mcp-fastmcp',
  });
});

test('a follow-up can clear the urls and schema it inherited', async (t) => {
  const fakeApi = await startFakeAgentApi();
  t.after(() => fakeApi.close());
  const client = await startClient(t, fakeApi);

  const result = await client.request('tools/call', {
    arguments: {
      prompt: 'Forget the pricing page and answer from the docs',
      threadId: THREAD_ID,
      urls: [],
      schema: null,
    },
    name: 'firecrawl_agent',
  });
  toolPayload(result);

  assert.deepEqual(fakeApi.requests[0].body, {
    prompt: 'Forget the pricing page and answer from the docs',
    threadId: THREAD_ID,
    urls: [],
    schema: null,
    origin: 'mcp-fastmcp',
  });
});

test('the clearing values are dropped when there is no thread to clear them on', async (t) => {
  const fakeApi = await startFakeAgentApi();
  t.after(() => fakeApi.close());
  const client = await startClient(t, fakeApi);

  const result = await client.request('tools/call', {
    arguments: {
      prompt: 'Find the top AI startups founded in 2024',
      urls: [],
      schema: null,
    },
    name: 'firecrawl_agent',
  });
  toolPayload(result);

  assert.deepEqual(fakeApi.requests[0].body, {
    prompt: 'Find the top AI startups founded in 2024',
    origin: 'mcp-fastmcp',
  });
});

test('firecrawl_agent without thread arguments sends the same body as before', async (t) => {
  const fakeApi = await startFakeAgentApi();
  t.after(() => fakeApi.close());
  const client = await startClient(t, fakeApi);

  const result = await client.request('tools/call', {
    arguments: {
      prompt: 'Find the top AI startups founded in 2024',
      urls: ['https://example.com/'],
    },
    name: 'firecrawl_agent',
  });
  toolPayload(result);

  assert.deepEqual(fakeApi.requests[0].body, {
    prompt: 'Find the top AI startups founded in 2024',
    urls: ['https://example.com/'],
    origin: 'mcp-fastmcp',
  });
});

test('firecrawl_agent_thread returns the conversation and forwards includeData', async (t) => {
  const fakeApi = await startFakeAgentApi();
  t.after(() => fakeApi.close());
  const client = await startClient(t, fakeApi);

  const result = await client.request('tools/call', {
    arguments: { threadId: THREAD_ID, includeData: true },
    name: 'firecrawl_agent_thread',
  });

  assert.equal(
    fakeApi.requests[0].url,
    `/v2/agent/threads/${THREAD_ID}?includeData=true`
  );
  const payload = toolPayload(result);
  assert.equal(payload.thread.id, THREAD_ID);
  assert.equal(payload.thread.runs[0].message, 'Acme lists three tiers.');
});

test('a busy thread comes back as text the model can act on, not a thrown error', async (t) => {
  const fakeApi = await startFakeAgentApi();
  t.after(() => fakeApi.close());
  const client = await startClient(t, fakeApi);

  const result = await client.request('tools/call', {
    arguments: { prompt: 'Which tier includes SSO?', threadId: BUSY_THREAD_ID },
    name: 'firecrawl_agent',
  });

  const payload = toolPayload(result);
  assert.equal(payload.success, false);
  assert.equal(payload.code, 'thread_busy');
  // The active run id is what lets the host poll instead of retry-looping.
  assert.match(payload.message, new RegExp(ACTIVE_RUN_ID));
  assert.match(payload.message, /firecrawl_agent_status on it or wait/);
});

test('an API without threads is reported as such, and other rejections still error', async (t) => {
  const fakeApi = await startFakeAgentApi();
  t.after(() => fakeApi.close());
  const client = await startClient(t, fakeApi);

  const unsupported = await client.request('tools/call', {
    arguments: {
      prompt: 'Which tier includes SSO?',
      threadId: LEGACY_THREAD_ID,
    },
    name: 'firecrawl_agent',
  });
  const payload = toolPayload(unsupported);
  assert.equal(payload.success, false);
  assert.match(payload.message, /does not support agent threads yet/);

  // Only thread and exchange rejections are answered in text; everything else
  // keeps reaching the host as a tool error.
  const rejected = await client.request('tools/call', {
    arguments: { prompt: 'reject me' },
    name: 'firecrawl_agent',
  });
  assert.equal(rejected.isError, true, JSON.stringify(rejected));
});

test('an unknown thread comes back as text from firecrawl_agent_thread', async (t) => {
  const fakeApi = await startFakeAgentApi();
  t.after(() => fakeApi.close());
  const client = await startClient(t, fakeApi);

  const result = await client.request('tools/call', {
    arguments: { threadId: MISSING_THREAD_ID },
    name: 'firecrawl_agent_thread',
  });

  const payload = toolPayload(result);
  assert.equal(payload.success, false);
  assert.equal(payload.code, 'thread_not_found');
  assert.match(payload.message, /start a new thread/);
});
