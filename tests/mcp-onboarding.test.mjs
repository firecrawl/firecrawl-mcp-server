import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { z } from 'zod';
import {
  getFreePort,
  waitForHealth,
  spawnServer,
  stopChild,
  parseSseJson,
} from './helpers/exchange-mcp.mjs';

const formCapabilities = { extensions: { 'openai/elicitation': { form: {} } } };
const inputKey = 'firecrawl_onboarding_goal';

async function httpFixture(t, endpoint = '/v2/mcp') {
  const requests = [];
  const api = createServer(async (req, res) => {
    requests.push(req.url);
    for await (const _ of req) {
      /* Consume authentication request body. */
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify(
        req.url === '/api/oauth/introspect'
          ? {
              active: true,
              api_key: 'fc-test',
              credential_purpose: 'general',
              scope: 'firecrawl:global',
              aud: 'https://mcp.firecrawl.dev/v2/mcp-oauth',
            }
          : { success: true, remainingCredits: 100 }
      )
    );
  });
  await new Promise((resolve) => api.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => api.close(resolve)));
  const port = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    FIRECRAWL_API_KEY: '',
    FIRECRAWL_OAUTH_TOKEN: '',
    FIRECRAWL_API_URL: `http://127.0.0.1:${api.address().port}`,
    FIRECRAWL_OAUTH_ISSUER: `http://127.0.0.1:${api.address().port}`,
    FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'onboarding-fixture-secret',
    FIRECRAWL_MCP_SEARCH_ENABLED: 'false',
    FASTMCP_ENDPOINT: endpoint,
    HOST: '127.0.0.1',
    PORT: String(port),
  });
  let stderr = '';
  child.stderr.on('data', (data) => {
    stderr += data;
  });
  t.after(() => stopChild(child));
  try {
    await waitForHealth(port, child);
  } catch (error) {
    throw new Error(`${error.message}\n${stderr}`);
  }
  let id = 0;
  const rpc = async (
    method,
    params = {},
    capabilities = formCapabilities,
    extraHeaders = {}
  ) => {
    const body = {
      jsonrpc: '2.0',
      id: ++id,
      method,
      params: {
        ...params,
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientInfo': {
            name: 'onboarding-test',
            version: '1',
          },
          'io.modelcontextprotocol/clientCapabilities': capabilities,
          ...params._meta,
        },
      },
    };
    const res = await fetch(`http://127.0.0.1:${port}${endpoint}`, {
      method: 'POST',
      headers: Object.fromEntries(
        Object.entries({
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          authorization: 'Bearer fc-test',
          'mcp-protocol-version': '2026-07-28',
          'mcp-method': method,
          ...(params.name ? { 'mcp-name': params.name } : {}),
          ...extraHeaders,
        }).filter(([, value]) => value !== undefined)
      ),
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  return { rpc, requests, port };
}

test('HTTP MRTR renders a form and consumes the answer on an independent authenticated retry', async (t) => {
  const a = await httpFixture(t);
  const b = await httpFixture(t);
  const discovered = await a.rpc('server/discover');
  assert.equal(discovered.status, 200);
  assert.ok(discovered.body.result.supportedVersions.includes('2026-07-28'));
  const listed = await a.rpc('tools/list');
  assert.ok(
    listed.body.result.tools.some(({ name }) => name === 'firecrawl_onboarding')
  );
  const first = await a.rpc('tools/call', {
    name: 'firecrawl_onboarding',
    arguments: {},
  });
  assert.equal(first.status, 200);
  assert.equal(first.body.result.resultType, 'input_required');
  const request = first.body.result.inputRequests[inputKey];
  assert.equal(request.method, 'openai/elicitation/create');
  assert.equal(
    request.params.requestedSchema.properties.choice.oneOf[0].const,
    'alexandria'
  );
  assert.equal(first.body.result.requestState, undefined);
  const second = await b.rpc('tools/call', {
    name: 'firecrawl_onboarding',
    arguments: {},
    inputResponses: {
      [inputKey]: {
        action: 'accept',
        content: { choice: 'alexandria', goal: 'YC companies' },
      },
    },
  });
  assert.equal(second.body.result.resultType, 'complete');
  assert.deepEqual(second.body.result.structuredContent, {
    status: 'selected',
    choice: {
      id: 'alexandria',
      title: 'Alexandria providers',
      description:
        'Get structured records, such as YC companies, products, or market data.',
    },
    goal: 'YC companies',
  });
  assert.notEqual(first.body.id, undefined);
  const balance = await b.rpc('tools/call', {
    name: 'firecrawl_credit_usage',
    arguments: {},
  });
  assert.equal(balance.body.result.structuredContent.remainingCredits, 100);
  assert.equal(
    [...a.requests, ...b.requests].filter((url) =>
      /search|scrape|agent/.test(url)
    ).length,
    0
  );
});

test('MRTR handles personalized choices, missing responses, cancellation, malformed and out-of-contract replies', async (t) => {
  const { rpc } = await httpFixture(t);
  const args = {
    question: 'What would help this week?',
    choices: [
      {
        id: 'models',
        title: 'AI model comparison',
        description: 'Compare model prices and measured speed.',
      },
      { id: 'explore', title: 'Explore', description: 'See examples first.' },
    ],
  };
  const call = (response, inputResponses = { [inputKey]: response }) =>
    rpc('tools/call', {
      name: 'firecrawl_onboarding',
      arguments: args,
      inputResponses,
    });
  const unanswered = await call(undefined, {});
  assert.equal(unanswered.body.result.resultType, 'input_required');
  assert.equal(
    unanswered.body.result.inputRequests[inputKey].params.message,
    args.question
  );
  const selected = await call({
    action: 'accept',
    content: { choice: 'models' },
  });
  assert.equal(selected.body.result.structuredContent.choice.id, 'models');
  for (const action of ['cancel', 'decline']) {
    const cancelled = await call({ action });
    assert.equal(cancelled.body.result.resultType, 'complete');
    assert.equal(
      cancelled.body.result.structuredContent.status,
      action === 'cancel' ? 'cancelled' : 'declined'
    );
    assert.equal(cancelled.body.result.inputRequests, undefined);
  }
  for (const response of [
    null,
    { action: 'accept', content: { choice: 'invented' } },
    { action: 'accept', content: { choice: 'models', goal: 'x'.repeat(1001) } },
  ]) {
    assert.equal((await call(response)).body.result.isError, true);
  }
  const invalidArgs = await rpc('tools/call', {
    name: 'firecrawl_onboarding',
    arguments: { choices: [args.choices[0], args.choices[0]] },
  });
  assert.equal(invalidArgs.body.error.code, -32602);
});

test('clients without OpenAI form capability receive persistent chat choices, never an input request', async (t) => {
  const { rpc } = await httpFixture(t);
  for (const caps of [{}, { elicitation: { form: {} } }]) {
    const result = await rpc(
      'tools/call',
      { name: 'firecrawl_onboarding', arguments: {} },
      caps
    );
    assert.equal(result.body.result.structuredContent.status, 'unsupported');
    assert.equal(result.body.result.structuredContent.choices.length, 5);
    assert.equal(result.body.result.inputRequests, undefined);
  }
});

test('modern HTTP requires an exact JSON Accept range with positive valid quality', async (t) => {
  const { rpc, requests } = await httpFixture(t);
  for (const accept of [
    undefined,
    'application/json;q=0',
    'application/json;q=0.000, */*;q=1',
    'text/event-stream, application/json; q = 0',
    'application/json;q=NaN',
    'application/json;q=-0.1',
    'application/json;q=1.1',
    'application/json;q=1;q=0',
    'application/json-seq',
    'text/plain; note=application/json',
  ]) {
    const result = await rpc('tools/list', {}, {}, { accept });
    assert.equal(result.status, 406, String(accept));
    assert.equal(result.body.error.code, -32600);
    assert.equal(result.body.result, undefined);
  }
  assert.deepEqual(
    requests,
    [],
    'unacceptable responses must be rejected before authentication'
  );
  for (const accept of [
    'application/json',
    'application/json;q=0.001',
    'APPLICATION/JSON; Q=1.000',
    'text/event-stream;q=1, application/json;q=0.5',
  ]) {
    assert.equal(
      (await rpc('tools/list', {}, {}, { accept })).status,
      200,
      accept
    );
  }
});

test('modern HTTP validates metadata and mirrored headers and reuses authentication', async (t) => {
  const { rpc } = await httpFixture(t);
  for (const headers of [
    { 'mcp-name': 'another_tool' },
    { 'mcp-method': 'tools/list' },
    { 'mcp-name': '' },
  ]) {
    const result = await rpc(
      'tools/call',
      { name: 'firecrawl_onboarding', arguments: {} },
      formCapabilities,
      headers
    );
    assert.equal(result.status, 400);
    assert.equal(result.body.error.code, -32020);
  }
  const encoded = `=?base64?${Buffer.from('firecrawl_onboarding').toString('base64')}?=`;
  assert.equal(
    (
      await rpc(
        'tools/call',
        { name: 'firecrawl_onboarding', arguments: {} },
        {},
        { 'mcp-name': encoded }
      )
    ).status,
    200
  );
  const missing = await rpc('tools/list', {
    _meta: { 'io.modelcontextprotocol/clientCapabilities': undefined },
  });
  assert.equal(missing.body.error.code, -32602);
  const future = await rpc(
    'tools/list',
    { _meta: { 'io.modelcontextprotocol/protocolVersion': '2027-01-01' } },
    {},
    { 'mcp-protocol-version': '2027-01-01' }
  );
  assert.equal(future.body.error.code, -32022);
  assert.ok(future.body.id);
  for (const header of [undefined, '2025-11-25']) {
    const mismatch = await rpc(
      'tools/call',
      { name: 'firecrawl_onboarding', arguments: {} },
      formCapabilities,
      { 'mcp-protocol-version': header }
    );
    assert.equal(mismatch.body.error.code, -32020);
    assert.equal(mismatch.body.result, undefined);
  }
  assert.equal((await rpc('unknown/method')).status, 404);
  const denied = await rpc(
    'tools/call',
    { name: 'firecrawl_onboarding', arguments: {} },
    {},
    { authorization: '' }
  );
  assert.equal(denied.status, 200);
  assert.equal(denied.body.result.isError, true);
  assert.equal(denied.body.result.inputRequests, undefined);
  const account = await httpFixture(t, '/v2/mcp-oauth');
  const accountDenied = await account.rpc(
    'tools/call',
    { name: 'firecrawl_onboarding', arguments: {} },
    formCapabilities,
    { authorization: '' }
  );
  assert.equal(accountDenied.status, 401);
  const authorized = await account.rpc(
    'tools/call',
    { name: 'firecrawl_onboarding', arguments: {} },
    formCapabilities,
    { authorization: 'Bearer fco_onboarding_test' }
  );
  assert.equal(authorized.status, 200);
  assert.equal(authorized.body.result.resultType, 'input_required');
  assert.ok(account.requests.includes('/api/oauth/introspect'));
});

test('legacy HTTP remains callable and falls back without pretending a stateless client supports forms', async (t) => {
  const { port } = await httpFixture(t);
  const res = await fetch(`http://127.0.0.1:${port}/v2/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: 'Bearer fc-test',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'firecrawl_onboarding', arguments: {} },
    }),
  });
  assert.equal(res.status, 200);
  assert.equal(
    parseSseJson(await res.text()).result.structuredContent.status,
    'unsupported'
  );
});

test('legacy direct stdio form waits for a response and returns the selected goal', async (t) => {
  const client = new Client(
    { name: 'form-test', version: '1' },
    { capabilities: formCapabilities }
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['dist/index.js'],
    env: {
      ...process.env,
      CLOUD_SERVICE: 'false',
      FIRECRAWL_API_KEY: 'fc-test',
      FIRECRAWL_OAUTH_TOKEN: '',
    },
    stderr: 'pipe',
  });
  t.after(() => client.close());
  let release;
  const answered = new Promise((resolve) => {
    release = resolve;
  });
  let form;
  client.setRequestHandler(
    z.object({
      method: z.literal('openai/elicitation/create'),
      params: z.unknown(),
    }),
    async (request) => {
      form = request.params;
      await answered;
      return {
        action: 'accept',
        content: { choice: 'developer', goal: 'React hooks' },
      };
    }
  );
  await client.connect(transport);
  let finished = false;
  const pending = client
    .callTool({ name: 'firecrawl_onboarding', arguments: {} })
    .then((result) => {
      finished = true;
      return result;
    });
  for (let i = 0; i < 100 && !form; i++)
    await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(form, 'server should send a native form request');
  assert.equal(finished, false, 'form must remain pending until answered');
  release();
  const result = await pending;
  assert.equal(result.structuredContent.status, 'selected');
  assert.equal(result.structuredContent.goal, 'React hooks');
});
