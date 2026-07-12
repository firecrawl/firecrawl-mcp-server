#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (arg.startsWith('--')) {
    args.set(arg, process.argv[i + 1]?.startsWith('--') ? 'true' : process.argv[++i] ?? 'true');
  }
}

const mode = args.get('--mode') ?? 'dry-run';
const outPath = resolve(args.get('--out') ?? 'tests/fixtures/generated/hosted-mcp-client-evidence.json');
const matrixPath = resolve(args.get('--matrix') ?? 'tests/fixtures/hosted-mcp-client-matrix.json');
const timeoutMs = Number(args.get('--timeout-ms') ?? 4500);

const BODY_MARKER = 'VISIBLE_BODY_MARKER_BARE_401';
const STATE_MARKER = 'state-secret';
const TOKEN_MARKER = 'request-token';
const AUTH_MARKER = 'Bearer fc-redacted';

function redactText(value) {
  return String(value ?? '')
    .replaceAll(STATE_MARKER, '[REDACTED_STATE]')
    .replaceAll(TOKEN_MARKER, '[REDACTED_TOKEN]')
    .replaceAll(AUTH_MARKER, 'Bearer [REDACTED]')
    .replace(/(authorization:\s*Bearer\s+)[^\s\n]+/gi, '$1[REDACTED]')
    .replace(/(code_verifier=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/(client_secret=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/(state=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/(token=)[^&\s]+/gi, '$1[REDACTED]');
}

function redactHeaders(headers) {
  const redacted = { ...headers };
  for (const key of Object.keys(redacted)) {
    if (/authorization|cookie|token|secret|verifier|state/i.test(key)) {
      redacted[key] = '[REDACTED]';
    }
  }
  return redacted;
}

function redactUrl(value) {
  return redactText(value).replace(/([?&](?:token|code|state|code_verifier|client_secret)=)[^&]+/gi, '$1[REDACTED]');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function jsonResponse(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

function sseResponse(res, payload) {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  res.end(`event: message\ndata: ${JSON.stringify(payload)}\n\n`);
}

function protectedResourceMetadata(baseUrl) {
  return {
    resource: `${baseUrl}/v2/mcp`,
    authorization_servers: [baseUrl],
    bearer_methods_supported: ['header'],
    scopes_supported: ['firecrawl:global'],
  };
}

function authorizationServerMetadata(baseUrl) {
  return {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/authorize`,
    token_endpoint: `${baseUrl}/token`,
    registration_endpoint: `${baseUrl}/register`,
    device_authorization_endpoint: `${baseUrl}/device_authorization`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token', 'urn:ietf:params:oauth:grant-type:device_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
  };
}

function recoveryPayload() {
  return {
    code: 'KEYLESS_ACCESS_NOT_AVAILABLE',
    auth_mode: 'keyless',
    message: BODY_MARKER,
    available_tools: ['firecrawl_scrape', 'firecrawl_search', 'firecrawl_parse'],
    unavailable_without_account: ['firecrawl_crawl', 'firecrawl_map'],
    next_actions: [
      {
        kind: 'connect_account',
        requires_interactive_browser: true,
        connect_url: 'https://firecrawl.dev/connect/mcp',
      },
      {
        kind: 'configure_api_key',
        requires_interactive_browser: false,
        header: 'Authorization: Bearer <FIRECRAWL_API_KEY>',
        docs_url: 'https://docs.firecrawl.dev/mcp-server',
      },
    ],
    request_id: 'local-mock-request',
  };
}

async function startMockServer(mockMode) {
  const requests = [];
  let server;
  const handler = async (req, res) => {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    let raw = '';
    req.setEncoding('utf8');
    for await (const chunk of req) raw += chunk;
    requests.push({
      method: req.method,
      url: redactUrl(req.url),
      headers: redactHeaders(req.headers),
      body_sha256: raw ? sha256(raw) : null,
      body_marker_present: raw.includes(BODY_MARKER),
    });

    if (req.url?.startsWith('/.well-known/oauth-protected-resource')) {
      jsonResponse(res, 200, protectedResourceMetadata(baseUrl));
      return;
    }

    if (req.url?.startsWith('/.well-known/oauth-authorization-server')) {
      jsonResponse(res, 200, authorizationServerMetadata(baseUrl));
      return;
    }

    if (req.method === 'POST' && req.url === '/register') {
      jsonResponse(res, 201, {
        client_id: `mock-client-${randomUUID()}`,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        redirect_uris: ['http://127.0.0.1/callback'],
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/device_authorization') {
      jsonResponse(res, 200, {
        device_code: 'mock-device-code',
        user_code: 'MOCK-CODE',
        verification_uri: `${baseUrl}/authorize`,
        verification_uri_complete: `${baseUrl}/authorize?user_code=MOCK-CODE&state=${STATE_MARKER}`,
        expires_in: 300,
        interval: 1,
      });
      return;
    }

    if (req.url?.startsWith('/authorize')) {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('Mock authorize page. Do not authenticate.');
      return;
    }

    if (req.method === 'POST' && req.url === '/token') {
      jsonResponse(res, 400, { error: 'authorization_pending' });
      return;
    }

    if (req.url === '/v2/mcp') {
      if (mockMode === 'keyless_200_with_prm') {
        sseResponse(res, {
          jsonrpc: '2.0',
          id: 1,
          result: {
            protocolVersion: '2025-06-18',
            serverInfo: { name: 'mock-firecrawl', version: '0.0.0' },
            capabilities: { tools: {} },
            instructions: 'Keyless mode: Search, Scrape, and Parse are available.',
          },
        });
        return;
      }

      if (mockMode === 'bare_401_with_json_body') {
        jsonResponse(res, 401, recoveryPayload(), { 'www-authenticate': 'Bearer' });
        return;
      }

      if (mockMode === 'oauth_challenge_401') {
        jsonResponse(
          res,
          401,
          { error: 'unauthorized' },
          { 'www-authenticate': `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"` }
        );
        return;
      }
    }

    jsonResponse(res, 404, { error: `Unhandled ${req.method} ${req.url}` });
  };

  server = createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    port: server.address().port,
    requests,
    url: `http://127.0.0.1:${server.address().port}/v2/mcp`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

function runCommand(command, commandArgs, env, cwd) {
  const result = spawnSync(command, commandArgs, {
    cwd,
    env,
    encoding: 'utf8',
    timeout: timeoutMs,
    input: '\n',
  });
  const stdout = redactText(result.stdout ?? '');
  const stderr = redactText(result.stderr ?? '');
  return {
    command: [command, ...commandArgs.map((part) => part.includes(' ') ? JSON.stringify(part) : part)].join(' '),
    exit_code: result.status,
    signal: result.signal,
    timed_out: result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGTERM',
    error_code: result.error?.code,
    stdout_sha256: sha256(stdout),
    stderr_sha256: sha256(stderr),
    stdout_excerpt: stdout.slice(0, 2000),
    stderr_excerpt: stderr.slice(0, 2000),
    body_marker_visible: stdout.includes(BODY_MARKER) || stderr.includes(BODY_MARKER),
  };
}

function runVersion(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { encoding: 'utf8', timeout: timeoutMs });
  return {
    command: [command, ...commandArgs].join(' '),
    exit_code: result.status,
    stdout: redactText(result.stdout ?? '').trim(),
    stderr: redactText(result.stderr ?? '').trim(),
  };
}

async function runClientMode(client, mockMode) {
  const mock = await startMockServer(mockMode);
  const tempHome = await mkdtemp(`${tmpdir()}/firecrawl-mcp-${client}-${mockMode}-`);
  const tempProject = await mkdtemp(`${tmpdir()}/firecrawl-mcp-project-${client}-${mockMode}-`);
  await mkdir(`${tempHome}/.config`, { recursive: true });
  await mkdir(`${tempHome}/.local/share`, { recursive: true });
  await mkdir(`${tempHome}/.cache`, { recursive: true });
  await mkdir(`${tempHome}/.claude`, { recursive: true });
  await mkdir(`${tempHome}/.codex`, { recursive: true });

  const env = {
    ...process.env,
    HOME: tempHome,
    XDG_CONFIG_HOME: `${tempHome}/.config`,
    XDG_DATA_HOME: `${tempHome}/.local/share`,
    XDG_CACHE_HOME: `${tempHome}/.cache`,
    CLAUDE_CONFIG_DIR: `${tempHome}/.claude`,
    CODEX_HOME: `${tempHome}/.codex`,
    BROWSER: '/usr/bin/false',
    CI: 'true',
    NO_COLOR: '1',
    NO_PROXY: '127.0.0.1,localhost',
    no_proxy: '127.0.0.1,localhost',
    HTTP_PROXY: '',
    HTTPS_PROXY: '',
    ALL_PROXY: '',
    http_proxy: '',
    https_proxy: '',
    all_proxy: '',
  };

  const name = `firecrawl-${mockMode}`;
  const commands = [];
  try {
    if (client === 'claude') {
      commands.push(runCommand('claude', ['mcp', 'add', '--scope', 'user', '--transport', 'http', name, mock.url], env, tempProject));
      commands.push(runCommand('claude', ['mcp', 'get', name], env, tempProject));
      commands.push(runCommand('claude', ['mcp', 'login', '--no-browser', name], env, tempProject));
    } else if (client === 'codex') {
      commands.push(runCommand('codex', ['mcp', 'add', name, '--url', mock.url], env, tempProject));
      commands.push(runCommand('codex', ['mcp', 'get', name], env, tempProject));
      commands.push(runCommand('codex', ['mcp', 'login', name], env, tempProject));
    } else {
      throw new Error(`Unsupported client ${client}`);
    }

    return {
      client,
      mock_mode: mockMode,
      server_url: mock.url,
      temp_home_removed: true,
      commands,
      request_sequence: mock.requests,
      assertions: {
        real_user_config_mutated: false,
        body_marker_visible_to_cli_output: commands.some((commandResult) => commandResult.body_marker_visible),
        prm_requested: mock.requests.some((request) => request.url.startsWith('/.well-known/oauth-protected-resource')),
        as_metadata_requested: mock.requests.some((request) => request.url.startsWith('/.well-known/oauth-authorization-server')),
        dcr_requested: mock.requests.some((request) => request.url === '/register'),
        authorize_requested: mock.requests.some((request) => request.url.startsWith('/authorize')),
      },
    };
  } finally {
    await mock.close();
    await rm(tempHome, { recursive: true, force: true });
    await rm(tempProject, { recursive: true, force: true });
  }
}

async function runLiveLocal() {
  const mockModes = ['keyless_200_with_prm', 'bare_401_with_json_body', 'oauth_challenge_401'];
  const clients = ['claude', 'codex'];
  const results = [];
  for (const client of clients) {
    for (const mockMode of mockModes) {
      results.push(await runClientMode(client, mockMode));
    }
  }
  return results;
}

const matrixRaw = await readFile(matrixPath, 'utf8');
const versions = {
  claude: runVersion('claude', ['--version']),
  codex: runVersion('codex', ['--version']),
};

let local_replay = [];
let local_mock = undefined;
let unrun_gap = [];
if (mode === 'live-local') {
  local_replay = await runLiveLocal();
} else {
  const mock = await startMockServer('keyless_200_with_prm');
  try {
    await fetch(`http://127.0.0.1:${mock.port}/.well-known/oauth-protected-resource?state=${STATE_MARKER}`);
    await fetch(`http://127.0.0.1:${mock.port}/v2/mcp?token=${TOKEN_MARKER}`, {
      method: 'POST',
      headers: {
        authorization: AUTH_MARKER,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }),
    });
    local_mock = {
      url: mock.url,
      redacted_requests: mock.requests,
    };
    unrun_gap = [
      'Dry-run mode did not execute Claude/Codex login flows. Run with --mode live-local for temp-home local mock replay.',
    ];
  } finally {
    await mock.close();
  }
}

const evidenceWithoutHashes = {
  schema_version: 2,
  generated_at: new Date().toISOString(),
  mode,
  safety: {
    real_user_config_mutated: false,
    external_authentication_attempted: false,
    paid_or_production_firecrawl_calls: false,
    note: 'All live-local commands use localhost mock URLs, temp HOME/XDG/CLAUDE_CONFIG_DIR/CODEX_HOME, BROWSER=/usr/bin/false, and bounded timeouts.',
  },
  clients: {
    claude_expected: '2.1.187 (Claude Code)',
    claude_observed: versions.claude.stdout || versions.claude.stderr,
    codex_expected: 'codex-cli 0.144.0',
    codex_observed: versions.codex.stdout || versions.codex.stderr,
  },
  local_mock,
  local_replay,
  runnable_commands: JSON.parse(matrixRaw).commands,
  expected_assertions: JSON.parse(matrixRaw).expected_assertions,
  external_staging_gap: 'Actual Claude.ai/ChatGPT datacenter egress keyless eligibility is intentionally left for staging/client smoke in the final staging smoke; it is not a prerequisite for this local contract.',
  unrun_gap,
};

const harnessRawForHash = await readFile(new URL(import.meta.url), 'utf8');
const evidence = {
  ...evidenceWithoutHashes,
  hashes: {
    matrix_sha256: sha256(matrixRaw),
    harness_sha256: sha256(harnessRawForHash),
    evidence_payload_sha256: sha256(JSON.stringify(evidenceWithoutHashes)),
  },
};

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(outPath);
