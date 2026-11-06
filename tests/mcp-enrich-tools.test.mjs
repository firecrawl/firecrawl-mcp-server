// The opt-in enrich tools: registration behind enrichTools, the opt-in error,
// per-provider translation, and the waterfall only sending later providers what
// earlier ones missed.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createFirecrawlMcpServer } from '../dist/server.js';
import { getFreePort } from './helpers/exchange-mcp.mjs';
import { CLAUDE_CODE_TEXT_CAP } from './helpers/description-budget.mjs';

const ENRICH_TOOLS = [
  'firecrawl_enrich_people_search',
  'firecrawl_enrich_people',
  'firecrawl_enrich_contact_info',
  'firecrawl_enrich_company_search',
  'firecrawl_enrich_company',
];

function answer(call) {
  const { provider, capability, options } = call;
  if (provider === 'fullenrich' && capability === 'companies/lookup') {
    return options.domain === 'acme.example'
      ? { creditsCost: 10, data: { companies: [{ name: 'Acme', domain: 'acme.example', headcount: 120, industry: { main_industry: 'Software Development' } }] } }
      : { creditsCost: 0, data: { companies: [] } };
  }
  if (provider === 'apollo' && capability === 'companies/bulk-enrich') {
    return { creditsCost: 30, data: { organizations: [{ name: 'Globex', primary_domain: 'globex.example', estimated_num_employees: 40 }] } };
  }
  if (provider === 'apollo' && capability === 'people/search') {
    return { creditsCost: 0, data: { people: [{ id: 'a1', first_name: 'Ada', last_name_obfuscated: 'L***e', title: 'Head of Data', organization: { name: 'Acme' } }] } };
  }
  return { error: { code: 'not_found', message: 'No match.' } };
}

async function startApi(t) {
  const calls = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    const batch = Array.isArray(body.alexandria) ? body.alexandria : [body.alexandria];
    calls.push(...batch);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: { alexandria: batch.map((call) => ({ provider: call.provider, capability: call.capability, ...answer(call) })) } }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { url: 'http://127.0.0.1:' + server.address().port, calls };
}

async function connect(t, options) {
  const port = await getFreePort();
  const instance = createFirecrawlMcpServer({
    transport: 'httpStream',
    ...options,
    unstable_hooks: { authenticate: async () => ({ authType: 'api-key', firecrawlApiKey: 'fc-test' }) },
  });
  await instance.start({ transportType: 'httpStream', httpStream: { port, host: '127.0.0.1', endpoint: '/mcp', stateless: true } });
  t.after(() => instance.stop());
  const client = new Client({ name: 'enrich-tools-test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:' + port + '/mcp')));
  t.after(() => client.close());
  return client;
}

test('enrich tools register only when enrichTools is set', async (t) => {
  const off = await connect(t, {});
  const offNames = (await off.listTools()).tools.map((tool) => tool.name);
  for (const name of ENRICH_TOOLS) assert.ok(!offNames.includes(name), name + ' is not listed by default');

  const on = await connect(t, { enrichTools: true });
  const tools = (await on.listTools()).tools.filter((tool) => ENRICH_TOOLS.includes(tool.name));
  assert.deepEqual(tools.map((tool) => tool.name).sort(), [...ENRICH_TOOLS].sort());
  for (const tool of tools) {
    assert.equal(tool.annotations?.readOnlyHint, true, tool.name);
    assert.ok(tool.outputSchema, tool.name + ' declares an outputSchema');
    assert.ok(tool.description.length <= CLAUDE_CODE_TEXT_CAP, tool.name + ' description is ' + tool.description.length + ' chars');
    assert.match(tool.description, /"enabled": true/);
  }
});

test('a call with no provider enabled is refused before any provider runs', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { enrichTools: true, apiUrl: api.url });
  const result = await client.callTool({ name: 'firecrawl_enrich_company', arguments: { companies: [{ domain: 'acme.example' }] } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /No provider is enabled/);
  assert.equal(api.calls.length, 0);
});

test('the company waterfall sends later providers only what earlier ones missed', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { enrichTools: true, apiUrl: api.url });
  const result = await client.callTool({
    name: 'firecrawl_enrich_company',
    arguments: { companies: [{ domain: 'acme.example' }, { domain: 'globex.example' }], apollo: { enabled: true }, fullenrich: { enabled: true } },
  });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  const data = result.structuredContent;
  assert.deepEqual(data.results.map((r) => [r.input_index, r.matched, r.name, r.sources]), [
    [0, true, 'Acme', ['fullenrich']],
    [1, true, 'Globex', ['apollo']],
  ]);
  const apollo = api.calls.filter((call) => call.provider === 'apollo');
  assert.equal(apollo.length, 1);
  assert.deepEqual(apollo[0].options.details, [{ domain: 'globex.example' }]);
  assert.deepEqual(data.providers.map((p) => [p.name, p.status, p.credits]), [
    ['fullenrich', 'ok', 10],
    ['apollo', 'ok', 30],
    ['people_data_labs', 'not_enabled', 0],
    ['datalegion', 'not_enabled', 0],
  ]);
  assert.equal(data.credits_total, 40);
});

test('people search reports a filter a provider could not apply', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { enrichTools: true, apiUrl: api.url });
  const result = await client.callTool({
    name: 'firecrawl_enrich_people_search',
    arguments: { titles: ['Head of Data'], seniority: ['director'], apollo: { enabled: true } },
  });
  const data = result.structuredContent;
  assert.equal(data.results[0].apollo_id, 'a1');
  const apollo = data.providers.find((p) => p.name === 'apollo');
  assert.deepEqual(apollo.not_applied, ['seniority']);
  assert.deepEqual(api.calls[0].options.person_titles, ['Head of Data']);
  assert.equal(api.calls[0].options.per_page, 5);
});
