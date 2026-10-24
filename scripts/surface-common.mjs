// Shared pieces of the surface-diff scripts: a mock Firecrawl API, a launcher
// for a built server, value normalisation and a structural diff.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export const API_KEY = 'fc-surface-test';

export const SCRAPE_URL = 'https://example.com/';

// firecrawl_scrape URLs that make the mock API answer with an error status.
export const STATUS_URLS = {
  401: 'https://status.example/401',
  402: 'https://status.example/402',
  429: 'https://status.example/429',
  500: 'https://status.example/500',
};

const STATUS_BODIES = {
  401: { success: false, error: 'Unauthorized: Invalid token' },
  402: {
    success: false,
    error:
      'Insufficient credits to perform this request. For more credits, you can upgrade your plan at https://firecrawl.dev/pricing.',
  },
  429: {
    success: false,
    error:
      'Rate limit exceeded. Consumed (req/min): 2, Remaining (req/min): 0. Please retry after 30s.',
  },
  500: { success: false, error: 'Internal server error' },
};

/**
 * Mock Firecrawl API. Records every request so a recording can show what the
 * server sent upstream for each case.
 */
export async function startMockApi() {
  const requests = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    req.setEncoding('utf8');
    for await (const chunk of req) raw += chunk;
    let body;
    try {
      body = raw ? JSON.parse(raw) : undefined;
    } catch {
      body = raw;
    }
    requests.push({ method: req.method, url: req.url, headers: req.headers, body });
    const json = (status, payload) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    };
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');

    if (req.method === 'POST' && url.pathname === '/v2/scrape') {
      const status = Object.entries(STATUS_URLS).find(
        ([, value]) => value === body?.url
      )?.[0];
      if (status) return json(Number(status), STATUS_BODIES[status]);
      if (body?.url) {
        return json(200, {
          success: true,
          data: {
            markdown: '# Scraped fixture',
            metadata: {
              scrapeId: '00000000-0000-4000-8000-000000000010',
              sourceURL: body.url,
            },
          },
        });
      }
      return json(400, { success: false, error: 'url is required' });
    }
    if (req.method === 'POST' && url.pathname === '/v2/search') {
      return json(200, {
        success: true,
        data: { web: [{ title: 'Example Domain', url: SCRAPE_URL }] },
        creditsUsed: 1,
        id: '00000000-0000-4000-8000-000000000000',
      });
    }
    json(404, { success: false, error: `Unhandled ${req.method} ${url.pathname}` });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    port: server.address().port,
    requests,
    /** Requests received since `mark` (an index taken from `requests.length`). */
    since: (mark) => requests.slice(mark).map(upstreamSummary),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

const UPSTREAM_HEADER_SKIP = new Set(['host', 'connection', 'content-length']);

function upstreamSummary(request) {
  return {
    method: request.method,
    url: request.url,
    authorization: request.headers.authorization ?? null,
    headerNames: Object.keys(request.headers)
      .filter((name) => !UPSTREAM_HEADER_SKIP.has(name))
      .sort(),
    body: request.body ?? null,
  };
}

export async function getFreePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

/**
 * Accepts a package directory (holding dist/index.js and package.json) or a
 * dist directory (holding index.js, with package.json one level up).
 */
export function resolveServerEntry(dir) {
  const absolute = path.resolve(dir);
  const entry = [
    path.join(absolute, 'dist', 'index.js'),
    path.join(absolute, 'index.js'),
  ].find((candidate) => existsSync(candidate));
  if (!entry) throw new Error(`No dist/index.js or index.js under ${absolute}`);
  const packageJson = path.join(path.dirname(entry), '..', 'package.json');
  const version = existsSync(packageJson)
    ? JSON.parse(readFileSync(packageJson, 'utf8')).version
    : undefined;
  return { entry, version };
}

// Every variable that selects a mode, cleared so the caller's environment
// cannot leak into a recording.
export const BASE_ENV = {
  CLOUD_SERVICE: '',
  FASTMCP_ENDPOINT: '',
  FIRECRAWL_API_KEY: '',
  FIRECRAWL_API_URL: '',
  FIRECRAWL_DISABLE_ENDPOINT_FEEDBACK: '',
  FIRECRAWL_DISABLE_SEARCH_FEEDBACK: '',
  FIRECRAWL_INTEGRATION: '',
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
  MCP_DELEGATED_CREDENTIAL_SECRET: 'surface-diff-delegated-credential-secret',
  PORT: '',
  SSE_LOCAL: '',
};

export function spawnServer(entry, env) {
  const child = spawn(process.execPath, [entry], {
    cwd: path.dirname(path.dirname(entry)),
    env: { ...process.env, ...BASE_ENV, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  child.getStderr = () => stderr;
  return child;
}

export async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(2_000, undefined, { ref: false }).then(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
    }),
  ]);
}

export async function waitForHealth(port, child) {
  for (let i = 0; i < 100; i += 1) {
    if (child.exitCode !== null) {
      throw new Error(
        `server exited early with code ${child.exitCode}\n${child.getStderr()}`
      );
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return;
    } catch {
      // not listening yet
    }
    await delay(100);
  }
  throw new Error(
    `server on port ${port} did not become healthy\n${child.getStderr()}`
  );
}

/** Splits an SSE body into frames of { event, id, data }, parsing JSON data. */
export function parseSseFrames(text) {
  const frames = [];
  for (const block of text.split(/\r?\n\r?\n/)) {
    if (!block.trim()) continue;
    const frame = {};
    const data = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith(':')) {
        frame.comment = line.slice(1).trim();
        continue;
      }
      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
      if (field === 'data') data.push(value);
      else frame[field] = value;
    }
    if (data.length) {
      const joined = data.join('\n');
      try {
        frame.data = JSON.parse(joined);
      } catch {
        frame.data = joined;
      }
    }
    frames.push(frame);
  }
  return frames;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const LOCAL_ORIGIN = /(https?:\/\/)(127\.0\.0\.1|localhost|\[::1\]|0\.0\.0\.0):\d+/g;
const ISO_TIMESTAMP =
  /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})/g;
const HTTP_DATE =
  /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} GMT\b/g;
const EPOCH_MS = /(?<!\d)1\d{12}(?!\d)/g;
const DURATION_MS = /(?<![\w.])\d+(?:\.\d+)?ms\b/g;
// SSE event ids of the form <uuid>_<epoch ms>_<seq>_<random suffix>.
const SSE_EVENT_ID = /<uuid>_<epoch-ms>_\d+_[0-9a-z]+/gi;

/**
 * Replaces values that differ between runs or between builds of the same
 * code: uuids, local ports, timestamps, durations and the package version.
 */
export function normalize(value, { version, ports = [] } = {}) {
  const portPattern = ports.length
    ? new RegExp(`\\b(?:${ports.join('|')})\\b`, 'g')
    : undefined;
  const versionPattern = version
    ? new RegExp(`(?<![\\d.])${version.replace(/\./g, '\\.')}(?![\\d.])`, 'g')
    : undefined;
  const fixString = (input) => {
    let out = input
      .replace(UUID, '<uuid>')
      .replace(LOCAL_ORIGIN, '$1$2:<port>')
      .replace(ISO_TIMESTAMP, '<timestamp>')
      .replace(HTTP_DATE, '<http-date>')
      .replace(EPOCH_MS, '<epoch-ms>')
      .replace(DURATION_MS, '<duration>')
      .replace(SSE_EVENT_ID, '<event-id>');
    if (versionPattern) out = out.replace(versionPattern, '<version>');
    if (portPattern) out = out.replace(portPattern, '<port>');
    return out;
  };
  const walk = (input) => {
    if (typeof input === 'string') return fixString(input);
    if (Array.isArray(input)) return input.map(walk);
    if (input && typeof input === 'object') {
      const out = {};
      for (const [key, entry] of Object.entries(input)) out[key] = walk(entry);
      return out;
    }
    return input;
  };
  return walk(value);
}

// Arrays of objects with unique string names (tool lists) are compared by name
// so one inserted tool does not shift every later index.
function namedItems(list) {
  if (!list.length || !list.every((item) => typeof item?.name === 'string')) return undefined;
  const map = new Map(list.map((item) => [item.name, item]));
  return map.size === list.length ? map : undefined;
}

/** Path-level differences between two JSON values. */
export function diffValues(a, b, at = '$', out = []) {
  if (Object.is(a, b)) return out;
  const kind = (value) =>
    value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  if (kind(a) !== kind(b) || (kind(a) !== 'object' && kind(a) !== 'array')) {
    out.push({ path: at, a, b });
    return out;
  }
  if (kind(a) === 'array') {
    const byName = namedItems(a) && namedItems(b);
    if (byName) {
      for (const name of new Set([...byName.keys(), ...namedItems(a).keys()])) {
        diffValues(namedItems(a).get(name), byName.get(name), at + '[name=' + name + ']', out);
      }
      return out;
    }
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
      if (i >= a.length) out.push({ path: `${at}[${i}]`, a: undefined, b: b[i] });
      else if (i >= b.length) out.push({ path: `${at}[${i}]`, a: a[i], b: undefined });
      else diffValues(a[i], b[i], `${at}[${i}]`, out);
    }
    return out;
  }
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const child = /^[A-Za-z_$][\w$]*$/.test(key)
      ? `${at}.${key}`
      : `${at}[${JSON.stringify(key)}]`;
    if (!Object.hasOwn(b, key)) out.push({ path: child, a: a[key], b: undefined });
    else if (!Object.hasOwn(a, key)) out.push({ path: child, a: undefined, b: b[key] });
    else diffValues(a[key], b[key], child, out);
  }
  return out;
}

function preview(value, limit = 600) {
  if (value === undefined) return '(absent)';
  const text = JSON.stringify(value);
  return text.length > limit ? `${text.slice(0, limit)}… (${text.length} chars)` : text;
}

export function formatDiff(differences, labels) {
  return differences
    .map(
      ({ path: at, a, b }) =>
        `${at}\n  - ${labels[0]}: ${preview(a)}\n  + ${labels[1]}: ${preview(b)}`
    )
    .join('\n\n');
}

/**
 * Shared CLI: <script> <dirA> [<dirB>] [--out file] [--out-b file].
 * One directory writes its recording; two print the differences and set exit
 * code 1 when there are any. A recording .json from an earlier run can stand
 * in for either directory.
 */
export async function runCli(record, scriptName) {
  const args = process.argv.slice(2);
  const options = {};
  const inputs = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--out') options.out = args[++i];
    else if (args[i] === '--out-b') options.outB = args[++i];
    else if (args[i] === '--help' || args[i] === '-h') options.help = true;
    else inputs.push(args[i]);
  }
  if (options.help || inputs.length < 1 || inputs.length > 2) {
    console.error(
      [
        `usage: node scripts/${scriptName} <dirA> [<dirB>] [--out a.json] [--out-b b.json]`,
        'A dir is a package directory (dist/index.js + package.json) or a dist directory;',
        'a recording .json from an earlier run may replace either dir.',
        'One input: print the recording, or write it to --out.',
        'Two inputs: print the differences; exit code 1 when there are any.',
      ].join('\n')
    );
    process.exit(2);
  }
  const load = async (input, out) => {
    if (input.endsWith('.json')) return JSON.parse(readFileSync(input, 'utf8'));
    const recording = await record(input);
    if (out) await writeFile(out, `${JSON.stringify(recording, null, 2)}\n`);
    return recording;
  };
  const a = await load(inputs[0], options.out);
  if (inputs.length === 1) {
    if (options.out) console.error(`wrote ${options.out}`);
    else process.stdout.write(`${JSON.stringify(a, null, 2)}\n`);
    return;
  }
  const b = await load(inputs[1], options.outB);
  const differences = diffValues(a.cases, b.cases, 'cases');
  if (!differences.length) {
    console.log(`No differences across ${Object.keys(a.cases).length} case groups.`);
    return;
  }
  console.log(formatDiff(differences, inputs));
  const perCase = new Map();
  for (const { path: at } of differences) {
    const key = at.match(/^cases(?:\.[\w$]+|\[[^\]]+\]){1,2}/)?.[0] ?? at;
    perCase.set(key, (perCase.get(key) ?? 0) + 1);
  }
  console.log('\nDifferences per case:');
  for (const [key, count] of perCase) console.log('  ' + key + ': ' + count);
  console.log(`\n${differences.length} difference(s).`);
  process.exitCode = 1;
}
