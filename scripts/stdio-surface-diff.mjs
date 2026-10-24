#!/usr/bin/env node
// Records the stdio surface of a built server (every JSON-RPC message the
// server writes for a fixed battery of requests, normalised) so two builds can
// be compared.
//
//   node scripts/stdio-surface-diff.mjs <dirA>                 print the recording
//   node scripts/stdio-surface-diff.mjs <dirA> --out a.json    write the recording
//   node scripts/stdio-surface-diff.mjs <dirA> <dirB>          diff, exit 1 on change
//
// A dir is a package directory holding dist/index.js and package.json (for
// example the repository root after `pnpm build`), or a recording .json.
import { setTimeout as delay } from 'node:timers/promises';
import {
  API_KEY,
  SCRAPE_URL,
  STATUS_URLS,
  normalize,
  resolveServerEntry,
  runCli,
  spawnServer,
  startMockApi,
  stopChild,
} from './surface-common.mjs';

const REVISIONS = ['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25'];
const PROTOCOL_VERSION = '2025-06-18';
const CLIENT_INFO = { name: 'surface-diff', version: '1.0.0' };
// How long to keep collecting after a message that gets no reply.
const QUIET_MS = 400;

/** Line-delimited JSON-RPC over a child's stdio that keeps every message it receives. */
class RawStdio {
  #child;
  #buffer = '';
  #inbox = [];
  #waiters = [];
  #nextId = 1;

  constructor(child) {
    this.#child = child;
    child.stdout.on('data', (chunk) => {
      this.#buffer += chunk;
      let newline;
      while ((newline = this.#buffer.indexOf('\n')) !== -1) {
        const line = this.#buffer.slice(0, newline).replace(/\r$/, '');
        this.#buffer = this.#buffer.slice(newline + 1);
        if (!line.trim()) continue;
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          message = { unparsedLine: line };
        }
        this.#inbox.push(message);
        for (const waiter of [...this.#waiters]) waiter();
      }
    });
  }

  write(line) {
    this.#child.stdin.write(`${line}\n`);
  }

  /** Sends a request and returns every message received until its response. */
  async request(method, params, { id = this.#nextId++, timeoutMs = 60_000 } = {}) {
    const start = this.#inbox.length;
    this.write(JSON.stringify({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) }));
    const done = () => this.#inbox.slice(start).some((message) => message.id === id && !message.method);
    if (!(await this.#waitFor(done, timeoutMs))) {
      return { messages: this.#inbox.slice(start), timedOut: true, exited: this.#exitInfo() };
    }
    return { messages: this.#inbox.slice(start) };
  }

  /** Sends raw text and returns whatever arrives within the quiet window. */
  async send(line, quietMs = QUIET_MS) {
    const start = this.#inbox.length;
    this.write(line);
    await delay(quietMs);
    const result = { messages: this.#inbox.slice(start) };
    const exited = this.#exitInfo();
    if (exited) result.exited = exited;
    return result;
  }

  #exitInfo() {
    const child = this.#child;
    if (child.exitCode === null && child.signalCode === null) return undefined;
    return { code: child.exitCode, signal: child.signalCode };
  }

  #waitFor(predicate, timeoutMs) {
    if (predicate()) return Promise.resolve(true);
    return new Promise((resolve) => {
      const finish = (value) => {
        clearTimeout(timer);
        this.#child.off('exit', onExit);
        this.#waiters = this.#waiters.filter((waiter) => waiter !== check);
        resolve(value);
      };
      const check = () => {
        if (predicate()) finish(true);
      };
      const onExit = () => setTimeout(() => finish(predicate()), 50);
      const timer = setTimeout(() => finish(false), timeoutMs);
      this.#child.once('exit', onExit);
      this.#waiters.push(check);
    });
  }
}

function initializeParams(protocolVersion = PROTOCOL_VERSION) {
  return { protocolVersion, capabilities: {}, clientInfo: CLIENT_INFO };
}

async function withServer(entry, env, run) {
  const child = spawnServer(entry, env);
  try {
    return await run(new RawStdio(child), child);
  } finally {
    await stopChild(child);
  }
}

// The full tool definitions are recorded once per mode under tools-list.
function toolNamesOnly(result) {
  return {
    ...result,
    messages: result.messages.map((message) =>
      Array.isArray(message.result?.tools)
        ? { ...message, result: { toolNames: message.result.tools.map((tool) => tool.name) } }
        : message
    ),
  };
}

async function fullBattery(stdio) {
  const out = {};
  out.initialize = await stdio.request('initialize', initializeParams());
  out['notification-initialized'] = await stdio.send(
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })
  );
  out['tools-list'] = await stdio.request('tools/list');
  out.ping = await stdio.request('ping');
  out['ping-string-id'] = await stdio.request('ping', undefined, { id: 'string-id' });
  out['logging-set-level'] = await stdio.request('logging/setLevel', { level: 'debug' });
  out['completion-complete-prompt'] = await stdio.request('completion/complete', {
    ref: { type: 'ref/prompt', name: 'no-such-prompt' },
    argument: { name: 'value', value: '' },
  });
  out['completion-complete-resource'] = await stdio.request('completion/complete', {
    ref: { type: 'ref/resource', uri: 'file:///no-such-resource' },
    argument: { name: 'value', value: '' },
  });
  out['resources-list'] = await stdio.request('resources/list');
  out['resources-templates-list'] = await stdio.request('resources/templates/list');
  out['prompts-list'] = await stdio.request('prompts/list');
  out['unknown-method'] = await stdio.request('no/such/method');
  out['unknown-notification'] = await stdio.send(
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/no-such-notification' })
  );
  out['invalid-json-line'] = await stdio.send('{"jsonrpc": "2.0", "id": 99, "method":');
  out['not-jsonrpc-line'] = await stdio.send(JSON.stringify({ hello: 'world' }));
  out['tools-call-unknown-tool'] = await stdio.request('tools/call', {
    name: 'no_such_tool',
    arguments: {},
  });
  out['tools-call-invalid-args'] = await stdio.request('tools/call', {
    name: 'firecrawl_scrape',
    arguments: { url: 123 },
  });
  out['tools-call-missing-args'] = await stdio.request('tools/call', {
    name: 'firecrawl_scrape',
  });
  out['tools-call-scrape'] = await stdio.request('tools/call', {
    name: 'firecrawl_scrape',
    arguments: { url: SCRAPE_URL },
  });
  for (const [status, url] of Object.entries(STATUS_URLS)) {
    out[`tools-call-scrape-api-${status}`] = await stdio.request('tools/call', {
      name: 'firecrawl_scrape',
      arguments: { url },
    });
  }
  out['initialize-again'] = toolNamesOnly(
    await stdio.request('initialize', initializeParams('2025-11-25'))
  );
  out['tools-list-after-second-initialize'] = toolNamesOnly(await stdio.request('tools/list'));
  return out;
}

async function runCase(api, run) {
  const mark = api.requests.length;
  let result;
  try {
    result = await run();
  } catch (error) {
    result = { error: String(error?.message ?? error) };
  }
  const upstream = api.since(mark);
  return upstream.length ? { ...result, upstream } : result;
}

/** Wraps each request in a battery so upstream calls are attributed to it. */
function attributing(stdio, api) {
  return {
    request: (...args) => runCase(api, () => stdio.request(...args)),
    send: (...args) => runCase(api, () => stdio.send(...args)),
  };
}

async function record(dir) {
  const { entry, version } = resolveServerEntry(dir);
  const api = await startMockApi();
  const cases = {};
  const apiKeyEnv = { FIRECRAWL_API_KEY: API_KEY, FIRECRAWL_API_URL: api.url };
  try {
    cases['api-key'] = await withServer(entry, apiKeyEnv, (stdio) =>
      fullBattery(attributing(stdio, api))
    );

    cases['self-hosted-no-key'] = await withServer(
      entry,
      { FIRECRAWL_API_URL: api.url },
      async (raw) => {
        const stdio = attributing(raw, api);
        return {
          initialize: await stdio.request('initialize', initializeParams()),
          'notification-initialized': await stdio.send(
            JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })
          ),
          'tools-list': await stdio.request('tools/list'),
          'tools-call-scrape': await stdio.request('tools/call', {
            name: 'firecrawl_scrape',
            arguments: { url: SCRAPE_URL },
          }),
          'tools-call-scrape-api-401': await stdio.request('tools/call', {
            name: 'firecrawl_scrape',
            arguments: { url: STATUS_URLS[401] },
          }),
        };
      }
    );

    // No key and no API URL: keyless mode. Only calls that stay local.
    cases.keyless = await withServer(entry, {}, async (stdio) => ({
      initialize: await stdio.request('initialize', initializeParams()),
      'notification-initialized': await stdio.send(
        JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })
      ),
      'tools-list': await stdio.request('tools/list'),
    }));

    // Requests before initialize, each on a fresh process.
    cases['before-initialize'] = {};
    for (const [name, method] of [
      ['tools-list', 'tools/list'],
      ['ping', 'ping'],
      ['tools-call-scrape', 'tools/call'],
    ]) {
      cases['before-initialize'][name] = await withServer(entry, apiKeyEnv, async (raw) => {
        const stdio = attributing(raw, api);
        const params =
          method === 'tools/call'
            ? { name: 'firecrawl_scrape', arguments: { url: SCRAPE_URL } }
            : undefined;
        const early = await stdio.request(method, params, { timeoutMs: 5_000 });
        return method === 'tools/list' ? toolNamesOnly(early) : early;
      });
    }

    // Initialize at every protocol revision, plus an unsupported one.
    cases.revisions = {};
    for (const revision of [...REVISIONS, '1999-01-01']) {
      cases.revisions[revision] = await withServer(entry, apiKeyEnv, async (stdio) => ({
        initialize: await stdio.request('initialize', initializeParams(revision)),
        'notification-initialized': await stdio.send(
          JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })
        ),
        'tools-list': toolNamesOnly(await stdio.request('tools/list')),
        'tools-call-scrape': await stdio.request('tools/call', {
          name: 'firecrawl_scrape',
          arguments: { url: SCRAPE_URL },
        }),
      }));
    }
  } finally {
    await api.close();
  }
  return {
    recordedWith: 'scripts/stdio-surface-diff.mjs',
    cases: normalize(cases, { version, ports: [api.port] }),
  };
}

await runCli(record, 'stdio-surface-diff.mjs');
