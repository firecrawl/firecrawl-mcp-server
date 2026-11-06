// The opt-in enrich tools: registration behind enrichTools, the contradiction
// errors, not_applied reporting, and each provider running on its own native parameters.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createFirecrawlMcpServer } from '../dist/server.js';
import { getFreePort, startStdio } from './helpers/exchange-mcp.mjs';
import { CLAUDE_CODE_TEXT_CAP } from './helpers/description-budget.mjs';

const ENRICH_TOOLS = ['firecrawl_enrich_search', 'firecrawl_enrich'];

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
  const tools = (await on.listTools()).tools.filter((tool) => tool.name.startsWith('firecrawl_enrich'));
  assert.deepEqual(tools.map((tool) => tool.name).sort(), [...ENRICH_TOOLS].sort());
  for (const tool of tools) {
    assert.equal(tool.annotations?.readOnlyHint, true, tool.name);
    assert.ok(tool.outputSchema, tool.name + ' declares an outputSchema');
    assert.ok(tool.description.length <= CLAUDE_CODE_TEXT_CAP, tool.name + ' description is ' + tool.description.length + ' chars');
    assert.equal(JSON.stringify(tool.inputSchema).includes('"oneOf"'), false, tool.name + ' has no oneOf');
  }
});

test('FIRECRAWL_ENRICH_TOOLS=1 registers the enrich tools on the CLI server', async (t) => {
  const { client } = await startStdio(t, { CLOUD_SERVICE: 'false', FIRECRAWL_API_KEY: 'fc-test', FIRECRAWL_ENRICH_TOOLS: '1' });
  const { tools } = await client.request('tools/list', {});
  const names = tools.map((tool) => tool.name);
  for (const name of ENRICH_TOOLS) assert.ok(names.includes(name), name + ' is listed');
});

test('a call with no providers is refused before any provider runs', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { enrichTools: true, apiUrl: api.url });
  const result = await client.callTool({ name: 'firecrawl_enrich', arguments: { companies: [{ domain: 'acme.example' }] } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /providers/);
  assert.equal(api.calls.length, 0);
});

test('contradictions are refused: both lists, neither list, fields with companies', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { enrichTools: true, apiUrl: api.url });
  for (const args of [
    { people: [{ linkedin_url: 'https://www.linkedin.com/in/x' }], companies: [{ domain: 'acme.example' }], providers: ['apollo'] },
    { providers: ['apollo'] },
    { companies: [{ domain: 'acme.example' }], fields: ['work_email'], providers: ['apollo'] },
  ]) {
    const result = await client.callTool({ name: 'firecrawl_enrich', arguments: args });
    assert.equal(result.isError, true, JSON.stringify(args));
  }
  assert.equal(api.calls.length, 0);
});

test('company lookup runs each listed provider on the keys it reads and reports them separately', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { enrichTools: true, apiUrl: api.url });
  const result = await client.callTool({
    name: 'firecrawl_enrich',
    arguments: { companies: [{ domain: 'acme.example' }, { domain: 'globex.example', ticker: 'GBX' }], providers: ['fullenrich', 'apollo'] },
  });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  const data = result.structuredContent;
  const [fullenrich, apollo] = data.providers;
  assert.deepEqual([fullenrich.name, fullenrich.status, fullenrich.credits, fullenrich.unmatched], ['fullenrich', 'ok', 10, [1]]);
  assert.deepEqual(fullenrich.results.map((r) => [r.input_index, r.name]), [[0, 'Acme']]);
  assert.deepEqual(apollo.results.map((r) => [r.input_index, r.name]), [[1, 'Globex']]);
  assert.equal(data.credits_total, 40);
  assert.ok(data.not_applied.some((n) => n.startsWith('companies[].ticker')), JSON.stringify(data.not_applied));
});

test('search passes a provider its own parameters and reports keys for the other entity', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { enrichTools: true, apiUrl: api.url });
  const result = await client.callTool({
    name: 'firecrawl_enrich_search',
    arguments: {
      entity: 'person',
      providers: ['apollo', 'fullenrich', 'datalegion'],
      provider_options: { apollo: { person_titles: ['Head of Data'], q_organization_domains_list: ['acme.example'], q_organization_name: 'Acme' } },
    },
  });
  const data = result.structuredContent;
  const apollo = data.providers.find((p) => p.name === 'apollo');
  assert.equal(apollo.results[0].apollo_id, 'a1');
  assert.deepEqual(api.calls[0].options, { person_titles: ['Head of Data'], q_organization_domains_list: ['acme.example'], per_page: 10 });
  assert.equal(data.providers.find((p) => p.name === 'fullenrich').status, 'skipped');
  assert.ok(data.not_applied.includes('datalegion (no search)'));
  assert.ok(data.not_applied.some((n) => n.startsWith('provider_options.apollo.q_organization_name')));
  assert.equal(api.calls.length, 1);
});
