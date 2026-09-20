import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { startFakeExchangeApi } from './exchange-api.mjs';

const EXCHANGE_KEY_REQUIRED_MESSAGE =
  'Alexandria requires an API key on a team with Alexandria access';
const KEYLESS_TOOL_MESSAGE =
  'This tool needs a Firecrawl account.\n\nFix: Create an API key at https://www.firecrawl.dev/app/api-keys, then:\n- Set the header: Authorization: Bearer YOUR_API_KEY on https://mcp.firecrawl.dev/v2/mcp\nThen start a new session.';

async function getFreePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

async function waitForHealth(port, child) {
  let lastError;
  for (let i = 0; i < 60; i += 1) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
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

class StdioMcpClient {
  #buffer = '';
  #child;
  #id = 0;
  #pending = new Map();
  #failure;

  constructor(child) {
    this.#child = child;
    child.stdout.on('data', (chunk) => this.#onData(chunk));
    child.stdin.on('error', error => this.#fail(error));
    child.on('error', error => this.#fail(error));
    child.once('exit', (code, signal) => {
      const error = new Error(
        `MCP server exited: code=${code} signal=${signal}`
      );
      this.#fail(error);
    });
  }

  notify(method, params = {}) {
    this.#write({ jsonrpc: '2.0', method, params });
  }

  request(method, params = {}) {
    if (this.#failure) return Promise.reject(this.#failure);
    const id = ++this.#id;
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
      this.#write({ id, jsonrpc: '2.0', method, params });
    });
  }

  #fail(error) {
    this.#failure = error;
    for (const {reject} of this.#pending.values()) reject(error);
    this.#pending.clear();
  }

  #onData(chunk) {
    this.#buffer += chunk;
    while (true) {
      const newline = this.#buffer.indexOf('\n');
      if (newline === -1) return;
      const line = this.#buffer.slice(0, newline).replace(/\r$/, '');
      this.#buffer = this.#buffer.slice(newline + 1);
      if (!line.trim()) continue;
      let message;
      try { message = JSON.parse(line); }
      catch (error) { this.#fail(new Error(`Invalid MCP JSON: ${error.message}`)); return; }
      if (message.id !== undefined && this.#pending.has(message.id)) {
        const pending = this.#pending.get(message.id);
        this.#pending.delete(message.id);
        if (message.error)
          pending.reject(Object.assign(new Error(JSON.stringify(message.error)), {rpcError: message.error}));
        else pending.resolve(message.result);
      }
    }
  }

  #write(message) {
    try { this.#child.stdin.write(`${JSON.stringify(message)}\n`); }
    catch (error) { this.#fail(error); }
  }
}

async function startStdio(t, env) {
  const child = spawnServer(env);
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  t.after(() => stopChild(child));
  const client = new StdioMcpClient(child);
  const init = await client.request('initialize', {
    capabilities: {},
    clientInfo: { name: 'firecrawl-mcp-exchange', version: '0.0.0' },
    protocolVersion: '2025-06-18',
  });
  client.notify('notifications/initialized');
  return { client, init, getStderr: () => stderr };
}

async function startStdioWithApi(t, options = {}) {
  const api = await startFakeExchangeApi(options);
  t.after(() => api.close());
  const session = await startStdio(t, {
    FIRECRAWL_API_KEY: 'fc-exchange-test',
    FIRECRAWL_API_URL: api.url,
  });
  return { api, ...session };
}

// A tool call that fails either at schema validation (JSON-RPC error or an
// isError result, depending on the FastMCP version) or inside execute.
async function callExpectingError(client, params) {
  let result;
  try { result = await client.request('tools/call', params); }
  catch (error) {
    if (!Number.isInteger(error.rpcError?.code)) throw error;
    return { isError: true, transportError: error };
  }
  assert.equal(result.isError, true, JSON.stringify(result));
  return result;
}

function toolText(result) {
  assert.notEqual(result.isError, true, JSON.stringify(result));
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].type, 'text');
  return JSON.parse(result.content[0].text);
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


export { EXCHANGE_KEY_REQUIRED_MESSAGE, KEYLESS_TOOL_MESSAGE, getFreePort, waitForHealth, parseSseJson, spawnServer, stopChild, startStdio, startStdioWithApi, callExpectingError, toolText, httpToolCall };
