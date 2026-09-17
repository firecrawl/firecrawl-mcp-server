import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import net from 'node:net';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { assertAgentMetadataPolicy } from '../scripts/agent-metadata-policy.mjs';

const EXCHANGE_KEY_REQUIRED_MESSAGE =
  'Alexandria requires an API key on a team with Alexandria access';
const KEYLESS_TOOL_MESSAGE =
  'This tool needs a Firecrawl account.\n\nFix: Create an API key at https://www.firecrawl.dev/app/api-keys, then:\n- Set the header: Authorization: Bearer YOUR_API_KEY on https://mcp.firecrawl.dev/v2/mcp\nThen start a new session.';

const CAPABILITY_HIT = {
  provider: 'fred',
  capability: 'series/observations',
  concept: 'series/observations',
  cohorts: ['finance'],
  creditsCost: 1,
  similarity: 0.8123,
};

const EXCHANGE_CALL = {
  provider: 'fred',
  capability: 'series/observations',
  options: { series_id: 'CPIAUCSL' },
};

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

// Stands in for the Firecrawl API's Exchange surface (and, for the hosted
// tests, the OAuth issuer's keyless eligibility check). Every request is
// recorded so tests can assert the exact outbound bodies and paths.
const TERMS_REQUIRED_BODY = {
  success: false,
  code: "THIRD_PARTY_DATA_TERMS_REQUIRED",
  error:
    "An organization admin must accept the benzinga provider's terms (version 2026-09-12-placeholder) before this request can run. Accept them at https://www.firecrawl.dev/app/alexandria/benzinga",
  requiresAction: {
    type: "accept_terms",
    terms: "benzinga",
    version: "2026-09-12-placeholder",
    url: "https://www.firecrawl.dev/app/alexandria/benzinga",
  },
};

async function startFakeExchangeApi(options = {}) {
  const { keylessEligible = false } = options;
  const requests = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    req.setEncoding('utf8');
    for await (const chunk of req) raw += chunk;
    const parsedBody =
      raw && (req.headers['content-type'] ?? '').includes('application/json')
        ? JSON.parse(raw)
        : undefined;
    requests.push({
      body: parsedBody,
      headers: req.headers,
      method: req.method,
      url: req.url,
    });
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const json = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    if (req.method === 'GET' && url.pathname === '/v2/keyless/eligibility') {
      return json(200, { eligible: keylessEligible });
    }

    if (req.method === 'GET' && url.pathname === '/exchange/provider-terms' && options.termsRaw401) {
      res.writeHead(401, { 'content-type': 'text/plain' });
      return res.end(options.termsRaw401 === 'empty' ? '' : 'Unauthorized');
    }
    if (req.method === 'GET' && url.pathname === '/exchange/provider-terms')
      return json(options.termsStatus ?? 200, options.termsCatalog ?? { providers: [{ provider: 'benzinga', name: 'Benzinga', required: true, terms: { version: 'v1', digest: 'a'.repeat(64), document: 'Review this agreement.' } }] });
    if (req.method === 'POST' && url.pathname === '/exchange/provider-terms/accept') {
      if (parsedBody.version === 'stale') return json(409, { success: false, code: 'TERMS_VERSION_MISMATCH', error: 'Read the latest terms.', requiresAction: { url: 'https://www.firecrawl.dev/app/alexandria/benzinga' }, currentVersion: 'v2' });
      if (parsedBody.provider === 'authority') return json(403, { success: false, code: 'PROVIDER_TERMS_AUTHORITY_REQUIRED', error: 'An admin must verify authority.', requiresAction: { url: 'https://www.firecrawl.dev/app/alexandria/authority' } });
      return json(200, { success: true, provider: parsedBody.provider, accepted: true });
    }

    if (url.pathname === '/exchange/skills/resolve')
      return json(200, { skills: [{ id: 'particle-podcasts' }] });
    if (url.pathname === '/exchange/skills/particle-podcasts/SKILL.md') {
      res.writeHead(200, { 'content-type': 'text/markdown' });
      return res.end('# Particle podcasts');
    }
    if (req.method === 'POST' && url.pathname === '/v2/search') {
      if (options.searchRefusal && (parsedBody.domainTools || parsedBody.sources?.includes('alexandria'))) {
        return json(403, { success: false, error: options.searchRefusal });
      }

      return json(200, {
        success: true,
        data: { tools: [CAPABILITY_HIT] },
        creditsUsed: 0,
        id: '00000000-0000-4000-8000-000000000000',
      });
    }

    if (req.method === 'POST' && url.pathname === '/v2/scrape') {
      if (parsedBody.alexandria?.provider === 'firecrawl') return json(200, {success:true, data:{creditsCost:0, alexandria:[{provider:'firecrawl',capability:'find-tools',creditsCost:0,data:{level:'tools',items:[],total:4,next:{provider:'firecrawl',capability:'find-tools',options:{...parsedBody.alexandria.options, offset:4}}}}]}});

      if (parsedBody?.alexandria?.[0]?.provider === 'locked') {
        return json(403, {
          success: false,
          error: 'Exchange is not enabled for this team.',
        });
      }
      if (parsedBody?.alexandria?.[0]?.provider === 'benzinga') {
        return json(403, TERMS_REQUIRED_BODY);
      }
      if (parsedBody?.alexandria?.[0]?.provider === 'inflight') {
        return json(409, {
          success: false,
          code: 'request_in_flight',
          chargeId: 'chg_0123456789',
          error: 'A request with this x-request-id is still in flight.',
        });
      }
      if (parsedBody?.alexandria) {
        return json(200, {
          success: true,
          scrape_id: '11111111-1111-4111-8111-111111111111',
          data: {
            alexandria: [
              {
                provider: 'fred',
                capability: 'series/observations',
                creditsCost: 1,
                data: {
                  observations: [{ date: '2026-01-01', value: '320.1' }],
                },
                records: 1,
                upstreamStatus: 200,
              },
              {
                provider: 'fred',
                capability: 'series/missing',
                error: {
                  code: 'capability_not_found',
                  message: 'Unknown capability',
                  status: 404,
                },
              },
            ],
            creditsCost: 1,
          },
        });
      }
      if (parsedBody?.url === 'https://benzinga.example/news') {
        return json(403, TERMS_REQUIRED_BODY);
      }
      if (parsedBody?.url) {
        return json(200, {
          success: true,
          data: parsedBody.domainTools
            ? { markdown: '# hi', tools: [CAPABILITY_HIT] }
            : { markdown: '# hi' },
        });
      }
      return json(400, { success: false, error: 'url is required' });
    }

    if (req.method === 'GET' && url.pathname.startsWith('/exchange/discover')) {
      if (url.searchParams.get('q') === 'unindexed') {
        return json(501, {
          success: false,
          error: 'Semantic discovery is not configured.',
          code: 'semantic_not_configured',
        });
      }
      return json(200, {
        success: true,
        cohorts: [{cohort:'people',about:'People profiles',providers:1},{cohort:'finance',about:'Financial data',providers:2}],
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
      });
    }

    json(404, { success: false, error: `Unhandled ${req.method} ${req.url}` });
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

class StdioMcpClient {
  #buffer = '';
  #child;
  #id = 0;
  #pending = new Map();

  constructor(child) {
    this.#child = child;
    child.stdout.on('data', (chunk) => this.#onData(chunk));
    child.once('exit', (code, signal) => {
      const error = new Error(
        `MCP server exited: code=${code} signal=${signal}`
      );
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
        if (message.error)
          pending.reject(new Error(JSON.stringify(message.error)));
        else pending.resolve(message.result);
      }
    }
  }

  #write(message) {
    this.#child.stdin.write(`${JSON.stringify(message)}\n`);
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
  try {
    const result = await client.request('tools/call', params);
    assert.equal(result.isError, true, JSON.stringify(result));
    return result;
  } catch (error) {
    return { isError: true, transportError: error };
  }
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

test('exchange tool metadata: discover is listed, scrape url is optional, language passes policy', async (t) => {
  const { client, init, getStderr } = await startStdio(t, {
    FIRECRAWL_API_KEY: 'fc-exchange-test',
  });
  const tools = await client.request('tools/list');
  const byName = new Map(tools.tools.map((tool) => [tool.name, tool]));

  const discover = byName.get('firecrawl_exchange_discover');
  assert.ok(discover, 'firecrawl_exchange_discover must be listed with a key');
  assert.equal(discover.annotations.readOnlyHint, true);
  assert.deepEqual(discover.inputSchema.required ?? [], []);
  assert.match(
    discover.description,
    /walk the catalogue.*search semantically with `q`/is
  );
  assert.match(discover.description, /firecrawl_scrape.*`alexandria`/s);

  const scrape = byName.get('firecrawl_scrape');
  assert.equal((scrape.inputSchema.required ?? []).includes('url'), false);
  assert.ok('alexandria' in scrape.inputSchema.properties);
  assert.match(
    scrape.description,
    /request identifies a page and needs its content or defined fields/i
  );
  assert.match(scrape.description, /Alexandria mode.*data\.alexandria/is);

  const search = byName.get('firecrawl_search');
  const sourceForms = search.inputSchema.properties.sources.items.anyOf;
  assert.ok(
    sourceForms
      .find((form) => form.type === 'string')
      .enum.includes('alexandria')
  );
  assert.equal(sourceForms.some(form => form.properties?.level), false);
  assert.match(search.description, /data\.tools/);
  const find = byName.get('firecrawl_find_tools');
  assert.equal(find.annotations.readOnlyHint, true);
  assert.deepEqual(find.inputSchema.properties.level.enum, ['categories', 'providers', 'groups', 'tools']);

  assertAgentMetadataPolicy(
    [init.instructions, ...tools.tools.map((tool) => tool.description)].join(
      '\n'
    ),
    assert
  );
  assert.equal(getStderr().includes('TypeError'), false, getStderr());
});

test('ordinary search defaults to web and both tool matches, with explicit opt-outs', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  for (const [overrides, sources, domainTools] of [
    [{}, ['web', 'alexandria'], true],
    [{ domainTools: false }, ['web', 'alexandria'], false],
    [{ sources: ['web'] }, ['web'], false],
  ]) {
    const result = await client.request('tools/call', {
      name: 'firecrawl_search',
      arguments: { query: 'company news', ...overrides },
    });
    assert.notEqual(result.isError, true);
    assert.deepEqual(api.requests.at(-1).body.sources, sources);
    assert.equal(api.requests.at(-1).body.domainTools, domainTools);
  }
});

test('default tools fall back only on discovery refusal; explicit tools and other errors remain errors', async (t) => {
  const { api, client } = await startStdioWithApi(t, {
    searchRefusal: 'Provider discovery requires access and does not support zero data retention.',
  });
  const result = await client.request('tools/call', {
    name: 'firecrawl_search', arguments: { query: 'company news' },
  });
  assert.notEqual(result.isError, true);
  assert.equal(api.requests.length, 2);
  assert.deepEqual(api.requests[1].body.sources, ['web']);
  assert.equal(api.requests[1].body.domainTools, false);
  for (const explicit of [{ sources: ['alexandria'] }, { domainTools: true }]) {
    const before = api.requests.length;
    await callExpectingError(client, {
      name: 'firecrawl_search', arguments: { query: 'company news', ...explicit },
    });
    assert.equal(api.requests.length, before + 1);
  }
  const other = await startStdioWithApi(t, { searchRefusal: 'Permission denied.' });
  await callExpectingError(other.client, {
    name: 'firecrawl_search', arguments: { query: 'company news' },
  });
  assert.equal(other.api.requests.length, 1);
});

test('firecrawl_search forwards the exchange source and passes data.exchange and creditsUsed through', async (t) => {
  const { api, client } = await startStdioWithApi(t);

  const result = await client.request('tools/call', {
    arguments: {
      query: 'nvidia balance sheet',
      sources: [{ type: 'web' }, { type: 'exchange' }],
      limit: 5,
    },
    name: 'firecrawl_search',
  });

  assert.equal(api.requests.length, 1);
  assert.equal(api.requests[0].method, 'POST');
  assert.equal(api.requests[0].url, '/v2/search');
  assert.equal(
    api.requests[0].headers.authorization,
    'Bearer fc-exchange-test'
  );
  assert.deepEqual(api.requests[0].body, {
    query: 'nvidia balance sheet',
    sources: [{ type: 'web' }, { type: 'alexandria' }],
    domainTools: true,
    limit: 5,
    origin: 'mcp-fastmcp',
  });

  const payload = toolText(result);
  assert.deepEqual(payload.data.tools, [CAPABILITY_HIT]);
  assert.equal(payload.creditsUsed, 0);
  assert.equal(payload.id, '00000000-0000-4000-8000-000000000000');
});

test('firecrawl_search forwards bare-string sources verbatim, including the acceptance call sources: ["exchange"]', async (t) => {
  const { api, client } = await startStdioWithApi(t);

  const cases = [
    ['exchange'],
    ['web', 'exchange'],
    ['news', { type: 'exchange' }],
  ];
  for (const sources of cases) {
    const before = api.requests.length;
    const result = await client.request('tools/call', {
      arguments: { query: 'nvidia balance sheet', sources },
      name: 'firecrawl_search',
    });
    assert.equal(api.requests.length, before + 1, JSON.stringify(sources));
    const request = api.requests[before];
    assert.equal(request.url, '/v2/search');
    assert.deepEqual(request.body, {
      query: 'nvidia balance sheet',
      domainTools: true,
      sources: sources.map((source) =>
        source === 'exchange'
          ? 'alexandria'
          : source?.type === 'exchange'
            ? { ...source, type: 'alexandria' }
            : source
      ),
      origin: 'mcp-fastmcp',
    });
    assert.deepEqual(toolText(result).data.tools, [CAPABILITY_HIT]);
  }

  const invalid = await callExpectingError(client, {
    arguments: { query: 'nvidia', sources: ['catalogue'] },
    name: 'firecrawl_search',
  });
  assert.equal(invalid.isError, true);
  assert.equal(api.requests.length, cases.length);
});

test('firecrawl_scrape with alexandria posts the v2 batch and returns the envelope untouched', async (t) => {
  const { api, client } = await startStdioWithApi(t);

  const result = await client.request('tools/call', {
    arguments: {
      alexandria: [
        EXCHANGE_CALL,
        { provider: 'fred', capability: 'series/missing' },
      ],
    },
    name: 'firecrawl_scrape',
  });

  assert.equal(api.requests.length, 1);
  assert.equal(api.requests[0].method, 'POST');
  assert.equal(api.requests[0].url, '/v2/scrape');
  assert.equal(
    api.requests[0].headers.authorization,
    'Bearer fc-exchange-test'
  );
  assert.deepEqual(api.requests[0].body, {
    alexandria: [
      EXCHANGE_CALL,
      { provider: 'fred', capability: 'series/missing' },
    ],
    origin: 'mcp-fastmcp',
  });
  assert.deepEqual(Object.keys(api.requests[0].body).sort(), [
    'alexandria',
    'origin',
  ]);

  const payload = toolText(result);
  assert.equal(payload.requestId, api.requests[0].headers['x-request-id']);
  assert.match(payload.requestId, /^[A-Za-z0-9._:-]{1,128}$/);
  const retry = await client.request('tools/call', {
    name: 'firecrawl_scrape',
    arguments: {
      alexandria: api.requests[0].body.alexandria,
      requestId: payload.requestId,
    },
  });
  assert.equal(toolText(retry).requestId, payload.requestId);
  assert.equal(api.requests[1].headers['x-request-id'], payload.requestId);
  assert.deepEqual(api.requests[1].body, api.requests[0].body);
  assert.equal(payload.success, true);
  assert.equal(payload.scrape_id, '11111111-1111-4111-8111-111111111111');
  assert.equal(payload.data.creditsCost, 1);
  assert.equal(payload.data.alexandria.length, 2);
  assert.equal(payload.data.alexandria[0].creditsCost, 1);
  assert.equal(payload.data.alexandria[0].records, 1);
  assert.equal(payload.data.alexandria[1].error.code, 'capability_not_found');
});

test('firecrawl_scrape with domainTools sends domainTools and passes data.tools through', async (t) => {
  const { api, client } = await startStdioWithApi(t);

  const result = await client.request('tools/call', {
    arguments: { url: 'https://example.com', domainTools: true },
    name: 'firecrawl_scrape',
  });

  assert.equal(api.requests.length, 1);
  assert.equal(api.requests[0].url, '/v2/scrape');
  assert.equal(api.requests[0].body.domainTools, true);
  const payload = toolText(result);
  assert.deepEqual(payload.tools, [CAPABILITY_HIT]);
});

test('firecrawl_scrape rejects url with alexandria, neither, extra options, and oversized batches without calling the API', async (t) => {
  const { api, client } = await startStdioWithApi(t);

  const invalid = [
    { url: 'https://example.com/', alexandria: [EXCHANGE_CALL] },
    {},
    { alexandria: [EXCHANGE_CALL], formats: ['markdown'] },
    { alexandria: [] },
    { alexandria: Array.from({ length: 11 }, () => EXCHANGE_CALL) },
    { alexandria: [{ provider: 'fred' }] },
  ];
  for (const args of invalid) {
    await callExpectingError(client, {
      arguments: args,
      name: 'firecrawl_scrape',
    });
  }
  assert.equal(api.requests.length, 0);
});

test('provider terms tools read and accept exact reviewed terms only with confirmation', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const read = toolText(await client.request('tools/call', { name: 'firecrawl_terms_show', arguments: { provider: 'benzinga' } }));
  assert.equal(read.terms.document, 'Review this agreement.');
  assert.equal(read.terms.digest, 'a'.repeat(64));
  assert.match(read.guidance, /explicit authorization/);
  assert.equal(api.requests[0].method, 'GET');
  assert.equal(api.requests[0].url, '/exchange/provider-terms');
  const args = { provider: 'benzinga', version: read.terms.version, digest: read.terms.digest, confirmed: true };
  for (const invalid of [{ ...args, confirmed: false }, { ...args, confirmed: undefined }, { ...args, version: '' }, { ...args, digest: 'invalid' }])
    await callExpectingError(client, { name: 'firecrawl_terms_accept', arguments: invalid });
  assert.equal(api.requests.length, 1, 'invalid confirmation must never contact the API');
  const accepted = toolText(await client.request('tools/call', { name: 'firecrawl_terms_accept', arguments: args }));
  assert.equal(accepted.success, true);
  assert.deepEqual(api.requests[1].body, args);
  assert.equal(api.requests[1].method, 'POST');
  assert.equal(api.requests[1].url, '/exchange/provider-terms/accept');
  assert.equal(api.requests[1].headers.authorization, 'Bearer fc-exchange-test');
  for (const [options, status, code] of [[{ ...args, version: 'stale' }, 409, 'TERMS_VERSION_MISMATCH'], [{ ...args, provider: 'authority' }, 403, 'PROVIDER_TERMS_AUTHORITY_REQUIRED']]) {
    const before = api.requests.length;
    const error = await callExpectingError(client, { name: 'firecrawl_terms_accept', arguments: options });
    assert.equal(error.structuredContent.status, status);
    assert.equal(error.structuredContent.code, code);
    assert.ok(error.structuredContent.requiresAction.url);
    assert.equal(api.requests.length, before + 1, 'acceptance must not be automatically retried');
  }
});

test('terms reads explain eligibility failures and reject empty or malformed catalogs without leaking credentials', async (t) => {
  for (const options of [
    { termsCatalog: {} },
    { termsCatalog: { providers: [] } },
    { termsCatalog: { success: false, error: 'Team not enabled.', code: 'team_disabled' }, termsStatus: 403 },
  ]) {
    const { api, client } = await startStdioWithApi(t, options);
    const error = await callExpectingError(client, { name: 'firecrawl_terms_show', arguments: { provider: 'benzinga' } });
    assert.equal(error.isError, true);
    assert.doesNotMatch(JSON.stringify(error), /fc-exchange-test/);
    assert.equal(api.requests.length, 1);
    if (!options.termsStatus) {
      assert.match(error.content[0].text, options.termsCatalog.providers ? /Provider not found/ : /invalid catalog/);
    }
    if (options.termsStatus === 403) {
      assert.equal(error.structuredContent.code, 'team_disabled');
      assert.match(error.structuredContent.guidance, /https:\/\/www.firecrawl.dev\/app\/settings\?tab=data-sources/);
    }
  }
});

test('firecrawl_scrape relays an Exchange 403 as an explanatory tool error', async (t) => {
  const { api, client } = await startStdioWithApi(t);

  const result = await callExpectingError(client, {
    arguments: { alexandria: [{ provider: 'locked', capability: 'finance/x' }] },
    name: 'firecrawl_scrape',
  });
  assert.equal(api.requests.length, 1);
  assert.equal(result.transportError, undefined, 'a 403 must surface in-band');
  assert.match(result.content[0].text, /Exchange is not enabled for this team/);
  assert.equal(result.structuredContent.status, 403);
  assert.equal(result.structuredContent.code, 'exchange_error');
});

test('firecrawl_scrape relays an Alexandria THIRD_PARTY_DATA_TERMS_REQUIRED as a human handoff', async (t) => {
  const { api, client } = await startStdioWithApi(t);

  const result = await callExpectingError(client, {
    arguments: {
      alexandria: [{ provider: 'benzinga', capability: 'news', options: { tickers: 'AAPL' } }],
    },
    name: 'firecrawl_scrape',
  });
  assert.equal(api.requests.length, 1);
  assert.equal(result.transportError, undefined, 'a 403 must surface in-band');
  assert.match(result.content[0].text, /https:\/\/www\.firecrawl\.dev\/app\/alexandria\/benzinga/);
  assert.match(result.content[0].text, /admin/);
  assert.equal(result.structuredContent.code, 'THIRD_PARTY_DATA_TERMS_REQUIRED');
  assert.equal(result.structuredContent.status, 403);
  assert.deepEqual(
    result.structuredContent.requiresAction,
    TERMS_REQUIRED_BODY.requiresAction
  );
  const requestId = api.requests[0].headers['x-request-id'];
  assert.equal(result.structuredContent.requestId, requestId);
  assert.deepEqual(result.structuredContent.next_actions, [
    {
      kind: 'human_action_required',
      action: 'accept_terms',
      who: 'organization_admin',
      url: TERMS_REQUIRED_BODY.requiresAction.url,
      provider: 'benzinga',
      version: '2026-09-12-placeholder',
    },
    {
      kind: 'retry_same_request',
      tool: 'firecrawl_scrape',
      requestId,
      after: 'human_action_required',
    },
  ]);
});

test('plain-URL firecrawl_scrape relays the same Alexandria terms handoff from the SDK error', async (t) => {
  const { api, client } = await startStdioWithApi(t);

  const result = await callExpectingError(client, {
    arguments: { url: 'https://benzinga.example/news' },
    name: 'firecrawl_scrape',
  });
  assert.equal(api.requests.length, 1);
  assert.equal(result.transportError, undefined, 'a 403 must surface in-band');
  assert.match(result.content[0].text, /https:\/\/www\.firecrawl\.dev\/app\/alexandria\/benzinga/);
  assert.match(result.content[0].text, /admin/);
  assert.equal(result.structuredContent.code, 'THIRD_PARTY_DATA_TERMS_REQUIRED');
  assert.deepEqual(
    result.structuredContent.requiresAction,
    TERMS_REQUIRED_BODY.requiresAction
  );
  assert.equal(result.structuredContent.next_actions[1].tool, 'firecrawl_scrape');
  assert.equal(result.structuredContent.requestId, undefined);
  assert.equal(result.structuredContent.next_actions[1].requestId, undefined);
  assert.doesNotMatch(result.content[0].text, /and requestId/);
});

test('firecrawl_scrape relays a reserved 409 billing error with its code and chargeId', async (t) => {
  const { api, client } = await startStdioWithApi(t);

  const result = await callExpectingError(client, {
    arguments: {
      alexandria: [{ provider: 'inflight', capability: 'finance/x' }],
    },
    name: 'firecrawl_scrape',
  });
  assert.equal(api.requests.length, 1);
  assert.equal(result.transportError, undefined, 'a 409 must surface in-band');
  assert.match(
    result.content[0].text,
    /A request with this x-request-id is still in flight/
  );
  assert.deepEqual(result.structuredContent, {
    code: 'request_in_flight',
    status: 409,
    message: 'A request with this x-request-id is still in flight.',
    chargeId: 'chg_0123456789',
    requestId: api.requests[0].headers['x-request-id'],
  });
});

test('firecrawl_exchange_discover builds every catalogue route and the semantic index route', async (t) => {
  const { api, client } = await startStdioWithApi(t);

  const cases = [
    [{}, '/exchange/discover', {}],
    [
      { q: 'balance sheet', limit: 3 },
      '/exchange/discover',
      { q: 'balance sheet', limit: '3' },
    ],
    [{ cohort: 'finance' }, '/exchange/discover/finance', {}],
    [
      { cohort: 'finance', expand: 'all' },
      '/exchange/discover/finance',
      { expand: 'all' },
    ],
    [
      { cohort: 'finance', provider: 'fred' },
      '/exchange/discover/finance/fred',
      {},
    ],
    [
      {
        cohort: 'finance',
        provider: 'fred',
        capability: 'series/observations',
      },
      '/exchange/discover/finance/fred/series/observations',
      {},
    ],
    [
      { cohort: 'web data', provider: 'a/b' },
      '/exchange/discover/web%20data/a%2Fb',
      {},
    ],
    [
      { cohort: 'finance', provider: 'fred.v2', capability: 'series/.obs' },
      '/exchange/discover/finance/fred.v2/series/.obs',
      {},
    ],
  ];

  for (const [args, expectedPath, expectedQuery] of cases) {
    const before = api.requests.length;
    const result = await client.request('tools/call', {
      arguments: args,
      name: 'firecrawl_exchange_discover',
    });
    assert.equal(api.requests.length, before + 1, JSON.stringify(args));
    const request = api.requests[before];
    assert.equal(request.method, 'GET');
    assert.equal(request.headers.authorization, 'Bearer fc-exchange-test');
    assert.equal(request.headers['x-origin'], 'mcp-fastmcp');
    const sent = new URL(request.url, 'http://127.0.0.1');
    assert.equal(sent.pathname, expectedPath, JSON.stringify(args));
    assert.deepEqual(
      Object.fromEntries(sent.searchParams),
      expectedQuery,
      JSON.stringify(args)
    );
    const payload = toolText(result);
    assert.equal(payload.path, expectedPath);
  }
});

test('firecrawl_exchange_discover refuses dot segments and expand off the cohort route before any request', async (t) => {
  const { api, client } = await startStdioWithApi(t);

  const dotted = [
    { cohort: '..' },
    { cohort: '.' },
    { cohort: 'finance', provider: '..' },
    { cohort: 'finance', provider: 'fred', capability: '../../foo' },
    { cohort: 'finance', provider: 'fred', capability: 'series/./obs' },
  ];
  for (const args of dotted) {
    const result = await callExpectingError(client, {
      arguments: args,
      name: 'firecrawl_exchange_discover',
    });
    assert.equal(result.transportError, undefined, JSON.stringify(args));
    assert.match(result.content[0].text, /"\." and "\.\." are not accepted/);
  }

  const expandOffCohort = [
    { expand: 'all' },
    { cohort: 'finance', provider: 'fred', expand: 'all' },
    {
      cohort: 'finance',
      provider: 'fred',
      capability: 'series/observations',
      expand: 'all',
    },
  ];
  for (const args of expandOffCohort) {
    const result = await callExpectingError(client, {
      arguments: args,
      name: 'firecrawl_exchange_discover',
    });
    assert.equal(result.transportError, undefined, JSON.stringify(args));
    assert.match(
      result.content[0].text,
      /expand applies on a cohort route only/
    );
  }
  assert.equal(api.requests.length, 0);
});

test('firecrawl_exchange_discover refuses q off the index route and incomplete walks before any request', async (t) => {
  const { api, client } = await startStdioWithApi(t);

  const invalid = [
    { q: 'balance sheet', cohort: 'finance' },
    { q: 'balance sheet', cohort: 'finance', provider: 'fred' },
    { provider: 'fred' },
    { capability: 'series/observations' },
    { cohort: 'finance', capability: 'series/observations' },
    { limit: 3 },
    { q: 'balance sheet', limit: 0 },
    { q: 'balance sheet', limit: 25 },
    { cohort: 'finance', expand: 'none' },
  ];
  for (const args of invalid) {
    const result = await callExpectingError(client, {
      arguments: args,
      name: 'firecrawl_exchange_discover',
    });
    if (args.q && args.cohort && !result.transportError) {
      assert.match(result.content[0].text, /index route only/);
    }
  }
  assert.equal(api.requests.length, 0);
});

test('firecrawl_exchange_discover relays a 501 semantic_not_configured with its code', async (t) => {
  const { api, client } = await startStdioWithApi(t);

  const result = await callExpectingError(client, {
    arguments: { q: 'unindexed' },
    name: 'firecrawl_exchange_discover',
  });
  assert.equal(api.requests.length, 1);
  assert.equal(result.transportError, undefined);
  assert.equal(result.content[0].text, 'Semantic discovery is not configured.');
  assert.equal(result.structuredContent.code, 'semantic_not_configured');
  assert.equal(result.structuredContent.status, 501);
});

test('local keyless stdio refuses every Exchange path with the explanatory error and no network call', async (t) => {
  const { client } = await startStdio(t, {
    FIRECRAWL_API_KEY: '',
    FIRECRAWL_API_URL: '',
    FIRECRAWL_OAUTH_TOKEN: '',
  });

  for (const params of [
    {
      arguments: { query: 'nvidia', sources: [{ type: 'exchange' }] },
      name: 'firecrawl_search',
    },
    { arguments: { alexandria: [EXCHANGE_CALL] }, name: 'firecrawl_scrape' },
    { arguments: { cohort: 'finance' }, name: 'firecrawl_exchange_discover' },
    { arguments: {}, name: 'firecrawl_exchange_discover' },
    { arguments: { provider: 'benzinga' }, name: 'firecrawl_terms_show' },
    { arguments: { provider: 'benzinga', version: 'v1', digest: 'a'.repeat(64), confirmed: true }, name: 'firecrawl_terms_accept' },
  ]) {
    const result = await client.request('tools/call', params);
    assert.equal(result.isError, true, JSON.stringify(result));
    assert.equal(
      result.content[0].text,
      EXCHANGE_KEY_REQUIRED_MESSAGE,
      params.name
    );
    assert.equal(result.structuredContent.code, 'EXCHANGE_API_KEY_REQUIRED');
    assert.equal(
      result.structuredContent.message,
      EXCHANGE_KEY_REQUIRED_MESSAGE
    );
  }
});

test('hosted keyless sessions never reach the Exchange; an API key header does', async (t) => {
  const backend = await startFakeExchangeApi({ keylessEligible: true });
  t.after(() => backend.close());
  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FIRECRAWL_API_KEY: '',
    FIRECRAWL_OAUTH_TOKEN: '',
    FIRECRAWL_MCP_SEARCH_PORT: String(await getFreePort()),
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_URL: backend.url,
    HTTP_STREAMABLE_SERVER: 'true',
    KEYLESS_PROXY_SECRET: 'keyless-secret',
    PORT: String(port),
  });
  t.after(() => stopChild(child));
  let startupError = ''; child.stderr.on('data', chunk => { startupError += chunk; });
  try { await waitForHealth(port, child); } catch (error) { throw new Error(`${error.message}: ${startupError}`); }
  const keylessHeaders = { 'x-forwarded-for': '8.8.8.7' };

  const listing = await fetch(`http://127.0.0.1:${port}/v2/mcp`, {
    body: JSON.stringify({
      id: 1,
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {},
    }),
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      ...keylessHeaders,
    },
    method: 'POST',
  });
  const listed = parseSseJson(await listing.text()).result.tools.map(
    (tool) => tool.name
  );
  assert.equal(listed.includes('firecrawl_exchange_discover'), false);
  assert.equal(listed.includes('firecrawl_scrape'), true);

  const discover = parseSseJson(
    await (
      await httpToolCall(port, {
        id: 2,
        headers: keylessHeaders,
        params: {
          arguments: { cohort: 'finance' },
          name: 'firecrawl_exchange_discover',
        },
      })
    ).text()
  ).result;
  assert.equal(discover.isError, true);
  assert.equal(discover.structuredContent.code, 'KEYLESS_TOOL_NOT_AVAILABLE');
  assert.equal(discover.content[0].text, KEYLESS_TOOL_MESSAGE);

  for (const params of [
    { arguments: { alexandria: [EXCHANGE_CALL] }, name: 'firecrawl_scrape' },
    {
      arguments: { query: 'nvidia', sources: [{ type: 'exchange' }] },
      name: 'firecrawl_search',
    },
  ]) {
    const result = parseSseJson(
      await (
        await httpToolCall(port, { id: 3, headers: keylessHeaders, params })
      ).text()
    ).result;
    assert.equal(result.isError, true, JSON.stringify(result));
    assert.equal(
      result.content[0].text,
      EXCHANGE_KEY_REQUIRED_MESSAGE,
      params.name
    );
    assert.equal(result.structuredContent.code, 'EXCHANGE_API_KEY_REQUIRED');
  }
  assert.equal(
    backend.requests.some(
      (request) => request.url !== '/v2/keyless/eligibility'
    ),
    false,
    'keyless sessions must not reach /v2/scrape, /v2/search, or /exchange/*'
  );

  const keyed = parseSseJson(
    await (
      await httpToolCall(port, {
        id: 4,
        headers: { 'x-api-key': 'fc-exchange-header' },
        params: {
          arguments: { alexandria: [EXCHANGE_CALL] },
          name: 'firecrawl_scrape',
        },
      })
    ).text()
  ).result;
  const payload = toolText(keyed);
  assert.equal(payload.data.creditsCost, 1);
  const scrapeCalls = backend.requests.filter(
    (request) => request.url === '/v2/scrape'
  );
  assert.equal(scrapeCalls.length, 1);
  assert.equal(
    scrapeCalls[0].headers.authorization,
    'Bearer fc-exchange-header'
  );
  assert.deepEqual(scrapeCalls[0].body, {
    alexandria: [EXCHANGE_CALL],
    origin: 'mcp-fastmcp',
  });
});

test('Find Tools uses scrape for contextual lookup, chaining and pagination', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const options = {providers: ['particle'], capabilities: ['podcasts/episodes/search'], expand: ['options', 'response'], limit: 2, offset: 2};
  const response = await client.request('tools/call', {name: 'firecrawl_find_tools', arguments: options});
  const call = {provider: 'firecrawl', capability: 'find-tools', options: {...options, level: 'tools'}};
  assert.equal(api.requests[0].url, '/v2/scrape');
  assert.deepEqual(api.requests[0].body.alexandria, call);
  assert.equal(toolText(response).data.creditsCost, 0);
  const next = toolText(response).data.alexandria[0].data.next;
  await client.request('tools/call', {name: 'firecrawl_scrape', arguments: {alexandria: next, requestId: 'walk-1'}});
  assert.deepEqual(api.requests[1].body.alexandria, next);
  assert.equal(api.requests[1].headers['x-request-id'], 'walk-1');
  const before = api.requests.length;
  for (const arguments_ of [{sources: ['alexandria']}, {query: 'podcasts', sources: [{type: 'alexandria', mode: 'browse'}]}]) {
    await callExpectingError(client, {name: 'firecrawl_search', arguments: arguments_});
  }
  assert.equal(api.requests.length, before);
});

test('Find Tools starts with categories and follows category pagination without dropping scope', async (t) => {
  const {api, client} = await startStdioWithApi(t);
  const call = args => client.request('tools/call', {name:'firecrawl_find_tools', arguments:args});
  const root = toolText(await call({limit:1})).data.alexandria[0].data;
  assert.equal(api.requests[0].url, '/exchange/discover');
  assert.equal(root.level, 'categories');
  assert.equal(root.total, 2);
  assert.equal(root.items[0].id, 'people');
  assert.deepEqual(root.items[0].nextTool, {name:'firecrawl_find_tools',arguments:{categories:['people'],level:'providers',limit:1}});
  const second = toolText(await call(root.nextTool.arguments)).data.alexandria[0].data;
  assert.equal(second.items[0].id, 'finance');
  assert.equal(second.nextTool, undefined);
  await call(root.items[0].nextTool.arguments);
  assert.deepEqual(api.requests[2].body.alexandria.options,{categories:['people'],level:'providers',limit:1});
});

test('Find Tools infers compact provider tools and full selected contracts while respecting overrides', async (t) => {
  const {api, client} = await startStdioWithApi(t);
  for (const [args,expected] of [
    [{providers:['particle']},{providers:['particle'],level:'tools',limit:20}],
    [{categories:['podcasts'],providers:['particle'],capabilities:['podcasts/episodes/search']},{categories:['podcasts'],providers:['particle'],capabilities:['podcasts/episodes/search'],level:'tools',limit:20,expand:['options','response','examples']}],
    [{providers:['particle'],capabilities:['podcasts/episodes/search'],expand:[]},{providers:['particle'],capabilities:['podcasts/episodes/search'],level:'tools',limit:20}],
    [{providers:['particle'],level:'groups'},{providers:['particle'],level:'groups',limit:20}],
  ]) {
    const result=toolText(await client.request('tools/call',{name:'firecrawl_find_tools',arguments:args}));
    assert.deepEqual(api.requests.at(-1).body.alexandria.options,expected);
    assert.deepEqual(result.data.alexandria[0].data.nextTool.arguments,{...expected,offset:4});
  }
  const before=api.requests.length;
  await callExpectingError(client,{name:'firecrawl_find_tools',arguments:{level:'categories',providers:['particle']}});
  assert.equal(api.requests.length,before);
});

test('terms 401 responses recover credentials even without a JSON body', async (t) => {
  for (const termsRaw401 of ['empty', 'text']) {
    const api = await startFakeExchangeApi({ termsRaw401 });
    t.after(() => api.close());
    const port = await getFreePort();
    const child = spawnServer({
      CLOUD_SERVICE: 'false', FASTMCP_ENDPOINT: '/v2/mcp',
      FIRECRAWL_API_KEY: '', FIRECRAWL_OAUTH_TOKEN: '',
      FIRECRAWL_API_URL: api.url, HOST: '127.0.0.1',
      HTTP_STREAMABLE_SERVER: 'true', PORT: String(port),
    });
    t.after(() => stopChild(child));
    await waitForHealth(port, child);
    const response = await httpToolCall(port, {
      headers: { 'x-firecrawl-api-key': 'fc-invalid' },
      id: `terms-${termsRaw401}`,
      params: { name: 'firecrawl_terms_show', arguments: { provider: 'benzinga' } },
    });
    assert.equal(response.status, 200);
    const error = parseSseJson(await response.text()).result;
    assert.equal(error.isError, true);
    assert.equal(error.structuredContent.code, 'CREDENTIAL_INVALID');
    assert.doesNotMatch(JSON.stringify(error), /invalid_terms_response/);
    assert.equal(api.requests.length, 1);
  }
});

test('Alexandria forwards execution timeout and rejects invalid timeout or empty URL discovery', async (t) => {
  const { client, api } = await startStdioWithApi(t);
  await client.request('tools/call', { name: 'firecrawl_scrape', arguments: { alexandria: [EXCHANGE_CALL], timeout: 12000 } });
  assert.equal(api.requests[0].body.timeout, 12000);
  for (const timeout of [0, -1, 1.5])
    await callExpectingError(client, { name: 'firecrawl_scrape', arguments: { alexandria: [EXCHANGE_CALL], timeout } });
  await callExpectingError(client, { name: 'firecrawl_find_tools', arguments: { urls: [] } });
  assert.equal(api.requests.length, 1);
});

test('OAuth-only local sessions advertise authenticated tool guidance', async (t) => {
  const { init } = await startStdio(t, { FIRECRAWL_API_KEY: '', FIRECRAWL_OAUTH_TOKEN: 'fco_test-only', CLOUD_SERVICE: '', HTTP_STREAMABLE_SERVER: '' });
  assert.match(init.instructions, /firecrawl_find_tools/);
  assert.doesNotMatch(init.instructions, /Hosted keyless sessions expose/);
});
