// jobs_search: registration, refusals, the single jobs/auto call, the absent-route
// error, and every response shape of the route against the listed output schema.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import test from 'node:test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/server/validators/ajv';
import { createFirecrawlMcpServer } from '../dist/server.js';
import { getFreePort, startStdio } from './helpers/exchange-mcp.mjs';
import { CLAUDE_CODE_TEXT_CAP } from './helpers/description-budget.mjs';

// One example of every response shape firecrawl/jobs/auto returns, by name. The
// file is the route's own export; an array of { name, data } is read too.
const exported = JSON.parse(readFileSync(new URL('./fixtures/jobs-auto-shapes.json', import.meta.url), 'utf8'));
const SHAPES = Array.isArray(exported) ? exported.map((shape, i) => [shape.name ?? 'shape ' + i, shape.data ?? shape]) : Object.entries(exported);

const UNKNOWN_CAPABILITY = { status: 404, json: { success: false, error: 'Unknown capability "jobs/auto" on firecrawl. Did you mean: find-tools?', code: 'unknown_capability' } };

async function startApi(t, respond) {
  const calls = [];
  const bodies = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    bodies.push(body);
    calls.push(...body.alexandria);
    const { status = 200, json } = respond?.(body.alexandria) ?? {};
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(json ?? { success: true, data: { alexandria: body.alexandria.map((call) => ({ provider: call.provider, capability: call.capability, creditsCost: 0, data: SHAPES[0][1] })) } }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { url: 'http://127.0.0.1:' + server.address().port, calls, bodies };
}

const answerWith = (entry) => () => ({ json: { success: true, data: { alexandria: [{ provider: 'firecrawl', capability: 'jobs/auto', creditsCost: 0, ...entry }] } } });

async function connect(t, { onToolResult, ...options }, session = { authType: 'api-key', firecrawlApiKey: 'fc-test' }) {
  const port = await getFreePort();
  const instance = createFirecrawlMcpServer({ transport: 'httpStream', ...options, unstable_hooks: { authenticate: async () => session, onToolResult } });
  await instance.start({ transportType: 'httpStream', httpStream: { port, host: '127.0.0.1', endpoint: '/mcp', stateless: true } });
  t.after(() => instance.stop());
  const client = new Client({ name: 'jobs-tool-test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:' + port + '/mcp')));
  t.after(() => client.close());
  return client;
}

test('jobs_search is listed with a credential, read-only, within the description budget', async (t) => {
  const client = await connect(t, {});
  const tool = (await client.listTools()).tools.find((entry) => entry.name === 'jobs_search');
  assert.ok(tool, 'jobs_search is listed');
  assert.ok(tool.description.length <= CLAUDE_CODE_TEXT_CAP, 'description is ' + tool.description.length + ' chars');
  assert.match(tool.description, /^Find job postings and check whether a posting is still open\./);
  assert.match(tool.description, /Example: \{/);
  assert.deepEqual(tool.annotations, { title: 'Search job postings', readOnlyHint: true, openWorldHint: true, destructiveHint: false });
  assert.deepEqual(Object.keys(tool.inputSchema.properties), [
    'query', 'location', 'remote', 'posted_within_days', 'company', 'url', 'urls', 'limit', 'cursor', 'max_credits', 'provider', 'group_by', 'boards_only', 'include_description',
  ]);
  assert.equal(tool.inputSchema.additionalProperties, false);
  // Clients that take tool schemas as function definitions refuse a top-level combinator.
  for (const key of ['anyOf', 'oneOf', 'allOf']) assert.ok(!(key in tool.inputSchema), key);
});

test('jobs_search is listed over stdio with an API key and not to keyless sessions', async (t) => {
  const { client } = await startStdio(t, { CLOUD_SERVICE: 'false', FIRECRAWL_API_KEY: 'fc-test' });
  const { tools } = await client.request('tools/list', {});
  assert.ok(tools.some((tool) => tool.name === 'jobs_search'));
  const keyless = await connect(t, {}, { authType: 'keyless' });
  assert.ok(!(await keyless.listTools()).tools.some((tool) => tool.name === 'jobs_search'));
});

test('the listed output schema names every field and forbids others', async (t) => {
  const client = await connect(t, {});
  const { outputSchema } = (await client.listTools()).tools.find((tool) => tool.name === 'jobs_search');
  assert.equal(outputSchema.additionalProperties, false);
  assert.equal(outputSchema.properties.resolution.additionalProperties, false);
  assert.deepEqual(Object.keys(outputSchema.properties), [
    'mode', 'results', 'count', 'next_cursor', 'employers', 'boards', 'resolution', 'providers', 'credits', 'credits_pending', 'stopped', 'notes',
  ]);
  assert.deepEqual(Object.keys(outputSchema.properties.results.items.properties), [
    'status', 'title', 'company', 'company_domain', 'location', 'remote', 'employment_type', 'posted_at', 'url', 'apply_url',
    'source', 'source_type', 'board', 'checked_at', 'description', 'salary', 'requirements', 'reason',
  ]);
});

test('every response shape of the route fits the listed output schema and comes back whole', async (t) => {
  assert.ok(SHAPES.length >= 12, 'the fixture covers the posting, market and company shapes');
  let next;
  const api = await startApi(t, () => answerWith({ data: next })());
  const client = await connect(t, { apiUrl: api.url });
  const { outputSchema } = (await client.listTools()).tools.find((tool) => tool.name === 'jobs_search');
  const validate = new AjvJsonSchemaValidator().getValidator(outputSchema);
  for (const [name, data] of SHAPES) {
    // The listed schema is what a client checks the answer against.
    const listed = validate(data);
    assert.ok(listed.valid, name + ': ' + listed.errorMessage);
    next = data;
    const result = await client.callTool({ name: 'jobs_search', arguments: { query: 'data engineer' } });
    assert.notEqual(result.isError, true, name + ': ' + JSON.stringify(result.content));
    // A property the schema does not declare, at any depth, would be missing here.
    assert.deepEqual(result.structuredContent, data, name);
    assert.equal(result.content[0].text, JSON.stringify(data), name);
  }
});

test('a field the route adds later is left out of the structured answer instead of failing the call', async (t) => {
  const data = { mode: 'market', count: 1, results: [{ status: 'unverified', title: 'Data Engineer', source: 'indeed', seniority: 'senior' }], took_ms: 12 };
  const api = await startApi(t, answerWith({ data }));
  const client = await connect(t, { apiUrl: api.url });
  await client.listTools();
  const result = await client.callTool({ name: 'jobs_search', arguments: { query: 'data engineer' } });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  assert.deepEqual(result.structuredContent, { mode: 'market', count: 1, results: [{ status: 'unverified', title: 'Data Engineer', source: 'indeed' }] });
  assert.equal(result.content[0].text, JSON.stringify(data));
});

test('the input goes to firecrawl/jobs/auto as one call, in every mode', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const inputs = [
    { query: 'data engineer', location: 'Berlin', remote: true, posted_within_days: 14, limit: 20, max_credits: 50, group_by: 'employer', boards_only: true, include_description: true },
    { url: 'https://boards.greenhouse.io/example/jobs/1234567' },
    { urls: ['https://boards.greenhouse.io/example/jobs/1234567', 'https://jobs.ashbyhq.com/example/9a8b'] },
    { company: 'example.com', query: 'account executive', cursor: 'abc', provider: 'greenhouse' },
  ];
  for (const input of inputs) {
    const result = await client.callTool({ name: 'jobs_search', arguments: input });
    assert.notEqual(result.isError, true, JSON.stringify(result));
  }
  assert.deepEqual(api.calls, inputs.map((options) => ({ provider: 'firecrawl', capability: 'jobs/auto', options })));
  assert.equal(api.bodies[0].timeout, 120000);
});

test('conversationId and objective are accepted and not sent, and near-miss shapes are repaired', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const result = await client.callTool({
    name: 'jobs_search',
    arguments: { conversationId: 'c-1', objective: 'Check these postings', urls: 'https://boards.greenhouse.io/example/jobs/1234567', limit: '5' },
  });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  assert.deepEqual(api.calls[0].options, { urls: ['https://boards.greenhouse.io/example/jobs/1234567'], limit: 5 });
  assert.ok(!JSON.stringify(api.bodies).includes('c-1') && !JSON.stringify(api.bodies).includes('Check these postings'));
});

test('a call with nothing to look for gets a pointer with examples and reaches no API', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  for (const args of [{}, { objective: 'Find jobs' }, { location: 'Berlin', remote: true }, { query: '  ' }]) {
    const result = await client.callTool({ name: 'jobs_search', arguments: args });
    assert.equal(result.isError, true, JSON.stringify(args));
    assert.match(result.content[0].text, /Give query \(a role or keywords\), company \(a name or domain\), or a posting url or urls\. Examples: \{"query":"data engineer"/);
  }
  const unknown = await client.callTool({ name: 'jobs_search', arguments: { query: 'data engineer', city: 'Berlin' } });
  assert.equal(unknown.isError, true);
  assert.match(unknown.content[0].text, /unknown field city; takes query, location, remote/);
  const many = await client.callTool({ name: 'jobs_search', arguments: { urls: Array.from({ length: 11 }, (_, i) => 'https://example.com/jobs/' + i) } });
  assert.equal(many.isError, true);
  assert.match(many.content[0].text, /urls/);
  assert.equal(api.calls.length, 0);
});

for (const [where, respond] of [
  ['the API refuses the request', () => UNKNOWN_CAPABILITY],
  ['the call comes back with the error', answerWith({ error: { code: 'unknown_capability', message: 'Unknown capability "jobs/auto" on firecrawl.', status: 404 } })],
]) {
  test('an API without the jobs route gives a clear not-available error: ' + where, async (t) => {
    const api = await startApi(t, respond);
    const events = [];
    const client = await connect(t, { apiUrl: api.url, onToolResult: (event) => events.push(event) });
    // Listing first makes the client check the answer against the output schema, as agents' clients do.
    await client.listTools();
    const result = await client.callTool({ name: 'jobs_search', arguments: { query: 'data engineer', location: 'Berlin' } });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /jobs_search is not available yet on this deployment/);
    assert.doesNotMatch(result.content[0].text, /output schema|structured/i);
    assert.equal(events.find((event) => event.status === 'error').error.extras.code, 'jobs_search_unavailable');
    assert.equal(api.calls.length, 1);
  });
}

test('a refusal from the route reaches the agent with its code and retryable', async (t) => {
  const api = await startApi(t, answerWith({ error: { code: 'provider_unavailable', message: 'Job search is unavailable right now.' } }));
  const events = [];
  const client = await connect(t, { apiUrl: api.url, onToolResult: (event) => events.push(event) });
  await client.listTools();
  const result = await client.callTool({ name: 'jobs_search', arguments: { company: 'example.com' } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /Job search is unavailable right now\./);
  const extras = events.find((event) => event.status === 'error').error.extras;
  assert.deepEqual([extras.code, extras.retryable], ['provider_unavailable', true]);
});
