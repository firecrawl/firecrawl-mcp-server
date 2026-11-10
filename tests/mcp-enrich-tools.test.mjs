// The enrich tools: registration, the no-provider error, argument repair and
// refusals, the credit cap, and each provider running on its own native parameters.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createFirecrawlMcpServer } from '../dist/server.js';
import { getFreePort, startStdio } from './helpers/exchange-mcp.mjs';
import { CLAUDE_CODE_TEXT_CAP } from './helpers/description-budget.mjs';

const ENRICH_TOOLS = ['people_company_search', 'people_company_enrich'];

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
  if (provider === 'apollo' && capability === 'people/bulk-match' && options.details?.[0]?.email === 'grace@acme.example') {
    return { creditsCost: 30, data: { matches: [{ id: 'a2', first_name: 'Grace', last_name: 'Hopper', title: 'Admiral', email: null }] } };
  }
  if (provider === 'fullenrich' && capability === 'contacts/work-email' && options.first_name === 'Pending') {
    return {
      creditsCost: 0,
      data: { status: 'job_pending', jobId: 'j1', enrichmentId: 'e1', pollAfterSeconds: 60, next: { provider: 'firecrawl', capability: 'job-status', options: { id: 'j1' } } },
    };
  }
  if (provider === 'fullenrich' && capability === 'contacts/work-email' && options.first_name === 'Parked') {
    const nextTool = { name: 'firecrawl_scrape', arguments: { alexandria: { provider: 'firecrawl', capability: 'job-status', options: { id: 'j3' } } } };
    return { creditsCost: 0, error: { code: 'job_pending', message: 'Still running.', nextTool } };
  }
  if (provider === 'fullenrich' && capability === 'contacts/work-email' && options.first_name === 'Unread') {
    return { creditsCost: 0, error: { code: 'job_pending', message: 'Upstream job e2 is still running; repeating this call starts another one.' } };
  }
  if (provider === 'apollo' && capability === 'people/search') {
    return { creditsCost: 0, data: { people: [{ id: 'a1', first_name: 'Ada', last_name_obfuscated: 'L***e', title: 'Head of Data', organization: { name: 'Acme' } }] } };
  }
  return { error: { code: 'not_found', message: 'No match.' } };
}

async function startApi(t, respond) {
  const calls = [];
  const bodies = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    bodies.push(body);
    if (req.url.startsWith('/v2/search')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ success: true, creditsUsed: 2, data: { web: [{ url: 'https://acme.example/team', title: 'Acme team' }] } }));
      return;
    }
    const batch = Array.isArray(body.alexandria) ? body.alexandria : [body.alexandria];
    calls.push(...batch);
    const { status = 200, json } = respond?.(batch) ?? {};
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(json ?? { success: true, data: { alexandria: batch.map((call) => ({ provider: call.provider, capability: call.capability, ...answer(call) })) } }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { url: 'http://127.0.0.1:' + server.address().port, calls, bodies };
}

async function connect(t, { onToolResult, ...options }, session = { authType: 'api-key', firecrawlApiKey: 'fc-test' }) {
  const port = await getFreePort();
  const instance = createFirecrawlMcpServer({
    transport: 'httpStream',
    ...options,
    unstable_hooks: { authenticate: async () => session, onToolResult },
  });
  await instance.start({ transportType: 'httpStream', httpStream: { port, host: '127.0.0.1', endpoint: '/mcp', stateless: true } });
  t.after(() => instance.stop());
  const client = new Client({ name: 'enrich-tools-test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:' + port + '/mcp')));
  t.after(() => client.close());
  return client;
}

test('the enrich tools are listed by default', async (t) => {
  const client = await connect(t, {});
  const all = (await client.listTools()).tools;
  const tools = all.filter((tool) => ENRICH_TOOLS.includes(tool.name));
  assert.deepEqual(tools.map((tool) => tool.name).sort(), [...ENRICH_TOOLS].sort());
  for (const tool of tools) {
    assert.ok(tool.outputSchema, tool.name + ' declares an outputSchema');
    assert.ok(tool.description.length <= CLAUDE_CODE_TEXT_CAP, tool.name + ' description is ' + tool.description.length + ' chars');
    assert.doesNotMatch(tool.description, /\bmiss\b|most filters|loose|differ in coverage|richest|useful when/i, tool.name + ' states capability and price without comparing');
    assert.match(tool.description, /Example: \{/);
  }
  const hints = Object.fromEntries(tools.map((tool) => [tool.name, tool.annotations?.readOnlyHint]));
  assert.deepEqual(hints, { people_company_search: true, people_company_enrich: true });
});

test('the CLI server with an API key lists the enrich tools', async (t) => {
  const { client } = await startStdio(t, { CLOUD_SERVICE: 'false', FIRECRAWL_API_KEY: 'fc-test' });
  const { tools } = await client.request('tools/list', {});
  const names = tools.map((tool) => tool.name);
  for (const name of ENRICH_TOOLS) assert.ok(names.includes(name), name + ' is listed');
});

test('a keyless session does not list the enrich tools', async (t) => {
  const client = await connect(t, {}, { authType: 'keyless' });
  const names = (await client.listTools()).tools.map((tool) => tool.name);
  for (const name of ENRICH_TOOLS) assert.ok(!names.includes(name), name + ' is not listed');
});

test('an input without an identifier is refused before any provider runs', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const result = await client.callTool({ name: 'people_company_enrich', arguments: { fullenrich: { people: [{ person_name: 'Jane Doe' }] } } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /fullenrich\.people\.0: Each fullenrich person needs/);
  assert.equal(api.calls.length, 0);
});

test('a call with no provider block is refused before any provider runs', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const result = await client.callTool({ name: 'people_company_enrich', arguments: {} });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /No provider given/);
  assert.equal(api.calls.length, 0);
});

test('company enrichment runs each provider on its own inputs and reports them separately', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const result = await client.callTool({
    name: 'people_company_enrich',
    arguments: {
      fullenrich: { companies: [{ domain: 'acme.example' }, { domain: 'missing.example' }] },
      apollo: { companies: [{ domain: 'globex.example' }] },
    },
  });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  const data = result.structuredContent;
  assert.equal(data.results, undefined);
  const [fullenrich, apollo, pdl, datalegion] = data.providers;
  assert.deepEqual([fullenrich.name, fullenrich.status, fullenrich.credits, fullenrich.unmatched], ['fullenrich', 'ok', 10, [1]]);
  assert.deepEqual(fullenrich.results.map((r) => [r.input_index, r.name]), [[0, 'Acme']]);
  assert.deepEqual(apollo.results.map((r) => [r.input_index, r.name]), [[0, 'Globex']]);
  assert.deepEqual(api.calls.find((call) => call.provider === 'apollo').options.details, [{ domain: 'globex.example' }]);
  assert.deepEqual([pdl.status, datalegion.status], ['not_requested', 'not_requested']);
  assert.equal(data.credits_total, 40);
});

test('people search passes a provider its own parameters unchanged', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const result = await client.callTool({
    name: 'people_company_search',
    arguments: {
      entity: 'person',
      apollo: { person_titles: ['Head of Data'], q_organization_domains_list: ['acme.example'] },
      fullenrich: {},
    },
  });
  const data = result.structuredContent;
  const apollo = data.providers.find((p) => p.name === 'apollo');
  assert.equal(apollo.results[0].apollo_id, 'a1');
  assert.deepEqual(api.calls[0].options, { person_titles: ['Head of Data'], q_organization_domains_list: ['acme.example'], per_page: 10 });
  const fullenrich = data.providers.find((p) => p.name === 'fullenrich');
  assert.equal(fullenrich.status, 'skipped');
  assert.equal(api.calls.length, 1);
});

test('search refuses a provider block written for the other entity', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const result = await client.callTool({
    name: 'people_company_search',
    arguments: { entity: 'company', apollo: { person_titles: ['Head of Data'] } },
  });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /person_titles/);
  assert.equal(api.calls.length, 0);
});

const MIXED = {
  fullenrich: { companies: [{ domain: 'acme.example' }] },
  apollo: { people: [{ email: 'grace@acme.example' }], companies: [{ domain: 'globex.example' }] },
};

test('enrich runs people and companies in one call as separate entries', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const result = await client.callTool({ name: 'people_company_enrich', arguments: MIXED });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  const entries = result.structuredContent.providers.map((p) => [p.name, p.kind, p.status, p.returned, p.credits]);
  assert.deepEqual(entries, [
    ['fullenrich', 'companies', 'ok', 1, 10],
    ['apollo', 'people', 'ok', 1, 30],
    ['apollo', 'companies', 'ok', 1, 30],
    ['people_data_labs', undefined, 'not_requested', 0, 0],
    ['datalegion', undefined, 'not_requested', 0, 0],
  ]);
  const [, grace, globex] = result.structuredContent.providers;
  assert.equal(grace.results[0].input_index, 0);
  assert.equal(globex.results[0].input_index, 0);
  assert.equal(result.structuredContent.credits_estimate, 70);
  assert.equal(result.structuredContent.credits_total, 70);
  assert.deepEqual(api.calls.map((call) => call.provider + ' ' + call.capability).sort(), ['apollo companies/bulk-enrich', 'apollo people/bulk-match', 'fullenrich companies/lookup']);
});

test('the credit cap covers both halves of a mixed call', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const result = await client.callTool({ name: 'people_company_enrich', arguments: { ...MIXED, max_credits: 69 } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /could cost up to 70 credits \(fullenrich 10, apollo 60\)/);
  assert.equal(api.calls.length, 0);
});

test('a failing half of a mixed call is reported on its own entry', async (t) => {
  const api = await startApi(t, (batch) =>
    batch[0].capability === 'companies/bulk-enrich'
      ? { json: { success: true, data: { alexandria: batch.map(() => ({ error: { code: 'provider_error', message: 'Please try again later.' }, creditsCost: 0 })) } } }
      : undefined
  );
  const client = await connect(t, { apiUrl: api.url });
  const result = await client.callTool({ name: 'people_company_enrich', arguments: { apollo: MIXED.apollo } });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  const [people, companies] = result.structuredContent.providers.filter((p) => p.name === 'apollo');
  assert.deepEqual([people.kind, people.status, people.returned], ['people', 'ok', 1]);
  assert.deepEqual([companies.kind, companies.status, companies.retryable], ['companies', 'error', true]);
  assert.match(companies.note, /Please try again later/);
  assert.equal(result.structuredContent.credits_total, 30);
});

test('contact_fields in a mixed call applies to the people only', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const result = await client.callTool({
    name: 'people_company_enrich',
    arguments: { contact_fields: ['work_email'], fullenrich: { people: [{ person_name: 'Ada Lovelace', company_domain: 'acme.example' }], companies: [{ domain: 'acme.example' }] } },
  });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  const fullenrich = result.structuredContent.providers.filter((p) => p.name === 'fullenrich');
  assert.deepEqual(fullenrich.map((p) => [p.kind, p.status]), [['people', 'empty'], ['companies', 'ok']]);
  assert.deepEqual(api.calls.map((call) => call.capability).sort(), ['companies/lookup', 'contacts/work-email']);
  assert.equal(result.structuredContent.credits_estimate, 40);
});

test('contact_fields runs the contact providers on the same people', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const result = await client.callTool({
    name: 'people_company_enrich',
    arguments: {
      contact_fields: ['work_email'],
      fullenrich: { people: [{ person_name: 'Ada Lovelace', company_domain: 'acme.example' }] },
      apollo: { people: [{ email: 'ada@acme.example' }] },
      people_data_labs: { people: [{ email: 'ada@acme.example' }] },
    },
  });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  const providers = result.structuredContent.providers;
  assert.deepEqual(providers.map((p) => [p.name, p.status]), [
    ['fullenrich', 'empty'],
    ['datalegion', 'not_requested'],
    ['apollo', 'empty'],
    ['people_data_labs', 'skipped'],
  ]);
  const fullenrich = api.calls.find((call) => call.provider === 'fullenrich');
  assert.equal(fullenrich.capability, 'contacts/work-email');
  assert.deepEqual(fullenrich.options, { first_name: 'Ada', last_name: 'Lovelace', domain: 'acme.example' });
  const apollo = api.calls.find((call) => call.provider === 'apollo');
  assert.equal(apollo.capability, 'people/bulk-match');
  assert.deepEqual(apollo.options.details, [{ email: 'ada@acme.example' }]);
  assert.equal(api.calls.length, 2);
});

test('conversationId and objective are accepted and not sent to providers', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const result = await client.callTool({
    name: 'people_company_search',
    arguments: { conversationId: 'c-1', objective: 'Find data leaders', entity: 'person', apollo: { person_titles: ['Head of Data'] } },
  });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  assert.deepEqual(api.calls[0].options, { person_titles: ['Head of Data'], per_page: 10 });
  assert.ok(!JSON.stringify(api.bodies).includes('c-1') && !JSON.stringify(api.bodies).includes('Find data leaders'));
});

test('near-miss shapes are repaired before validation', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const result = await client.callTool({
    name: 'people_company_search',
    arguments: {
      entity: 'people',
      providers: [{ provider: 'full-enrich', options: { current_position_titles: 'Product Manager', current_company_headcounts: ['51-200', '1000+'], limit: '2' } }],
      apollo: [{ options: { person_titles: 'Head of Data' } }],
    },
  });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  assert.deepEqual(api.calls.find((call) => call.provider === 'fullenrich').options, {
    current_position_titles: [{ value: 'Product Manager' }],
    current_company_headcounts: [{ min: 51, max: 200 }, { min: 1000 }],
    limit: 2,
  });
  assert.deepEqual(api.calls.find((call) => call.provider === 'apollo').options, { person_titles: ['Head of Data'], per_page: 10 });

  const lookup = await client.callTool({ name: 'people_company_enrich', arguments: { fullenrich: { companies: { domain: 'acme.example' } } } });
  assert.notEqual(lookup.isError, true, JSON.stringify(lookup));
  assert.equal(lookup.structuredContent.providers[0].returned, 1);
});

test('an invalid argument names the field, what the block takes and an example', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const result = await client.callTool({
    name: 'people_company_search',
    arguments: { entity: 'person', people_data_labs: { sql: "SELECT * FROM person WHERE job_title = 'cto'", size: 2 } },
  });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /people_data_labs: unknown field size; takes sql, query, limit/);
  assert.match(result.content[0].text, /Example: \{"entity":"person"/);

  const entity = await client.callTool({ name: 'people_company_search', arguments: { entity: 'lead', apollo: { q: 'CTO' }, region: 'US' } });
  assert.equal(entity.isError, true);
  assert.match(entity.content[0].text, /entity: required, exactly "person" or "company", got "lead"; unknown field region; takes /);
  assert.match(entity.content[0].text, /Example: /);

  const seniority = await client.callTool({
    name: 'people_company_search',
    arguments: { entity: 'person', fullenrich: { current_position_seniority_level: [{ value: 'CXO' }] } },
  });
  assert.equal(seniority.isError, true);
  assert.match(seniority.content[0].text, /current_position_seniority_level\.0: One of Owner, Founder, C-Level/);

  const many = await client.callTool({
    name: 'people_company_enrich',
    arguments: { a: 1, b: 2, c: 3, apollo: { people: [{ name: 'Ada', d: 4 }] }, fullenrich: { people: [{ person_name: 'Ada', company_domain: 'acme.example', e: 5 }], f: 6 } },
  });
  assert.equal(many.isError, true);
  for (const key of ['a', 'b', 'c', 'd', 'e', 'f']) assert.match(many.content[0].text, new RegExp('unknown field[^;]*\\b' + key + '\\b'));
  assert.equal(api.calls.length, 0);
});

test('max_credits refuses a call that could cost more, before any provider runs', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const people = Array.from({ length: 40 }, (_, i) => ({ person_professional_network_url: 'https://www.linkedin.com/in/p' + i }));
  const refused = await client.callTool({ name: 'people_company_enrich', arguments: { contact_fields: ['work_email'], fullenrich: { people } } });
  assert.equal(refused.isError, true);
  assert.match(refused.content[0].text, /could cost up to 1200 credits \(fullenrich 1200\), above max_credits 1000/);
  assert.match(refused.content[0].text, /If the user did not ask for this cap, retry it as is: set max_credits to at least 1200\. If they did, ask them before raising it/);
  assert.equal(api.calls.length, 0);

  const allowed = await client.callTool({ name: 'people_company_enrich', arguments: { max_credits: 1200, contact_fields: ['work_email'], fullenrich: { people } } });
  assert.notEqual(allowed.isError, true, JSON.stringify(allowed));
  assert.equal(allowed.structuredContent.credits_estimate, 1200);
  assert.equal(allowed.structuredContent.max_credits, 1200);
});

test('the firecrawl_search block runs a web search beside the providers and reports it separately', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const result = await client.callTool({
    name: 'people_company_search',
    arguments: { entity: 'person', apollo: { person_titles: ['Head of Data'] }, firecrawl_search: { query: 'Acme head of data', limit: 5 } },
  });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  const data = result.structuredContent;
  assert.deepEqual(data.providers.map((p) => p.name), ['apollo', 'fullenrich', 'people_data_labs', 'firecrawl_search']);
  const web = data.providers[3];
  assert.deepEqual([web.status, web.returned, web.credits], ['ok', 1, 2]);
  assert.equal(web.results[0].url, 'https://acme.example/team');
  assert.equal(data.credits_estimate, 2);
  assert.equal(data.credits_total, 2);
  assert.equal(api.bodies.find((body) => body.query).query, 'Acme head of data');

  const alone = await client.callTool({ name: 'people_company_search', arguments: { entity: 'company', firecrawl_search: { query: 'Acme' } } });
  assert.notEqual(alone.isError, true, JSON.stringify(alone));
  assert.equal(alone.structuredContent.providers.at(-1).returned, 1);

  const none = await client.callTool({ name: 'people_company_search', arguments: { entity: 'person' } });
  assert.match(none.content[0].text, /No provider given.*firecrawl_search/);
});

test('a call where no provider runs is an error with each reason and an example', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const result = await client.callTool({ name: 'people_company_search', arguments: { entity: 'company', max_credits: 0, fullenrich: {}, apollo: {} } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /No provider ran successfully: apollo skipped: No filters given; pass at least one\. fullenrich skipped: No filters given; pass at least one\. Credits charged: 0\. Example of a working call: \{"entity":"company"/);
  assert.equal(result.structuredContent.credits_estimate, 0);
  assert.equal(api.calls.length, 0);
});

test('a search block above its maximum runs at the maximum with a note', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const result = await client.callTool({ name: 'people_company_search', arguments: { entity: 'person', apollo: { person_titles: ['CTO'], per_page: 50 } } });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  const apollo = result.structuredContent.providers[0];
  assert.match(apollo.note, /per_page 50 is above the maximum 25, so 25 ran; use page for more/);
  assert.equal(api.calls[0].options.per_page, 25);

  const companies = await client.callTool({
    name: 'people_company_search',
    arguments: {
      entity: 'company',
      max_credits: 1000,
      apollo: { q_organization_name: 'Acme', per_page: 40 },
      fullenrich: { names: [{ value: 'Acme' }], limit: 50 },
      people_data_labs: { sql: "SELECT * FROM company WHERE name = 'acme'", limit: 20 },
    },
  });
  const notes = Object.fromEntries(companies.structuredContent.providers.map((p) => [p.name, p.note ?? '']));
  assert.match(notes.apollo, /per_page 40 is above the maximum 25, so 25 ran; use page for more/);
  assert.match(notes.fullenrich, /limit 50 is above the maximum 25, so 25 ran; use offset for more/);
  assert.match(notes.people_data_labs, /limit 20 is above the maximum 10, so 10 ran\./);
  assert.equal(companies.structuredContent.credits_estimate, 30 + 5 * 25 + 50 * 10);
  const sent = (provider) => api.calls.slice(1).filter((call) => call.provider === provider).map((call) => call.options);
  assert.equal(sent('apollo')[0].per_page, 25);
  assert.equal(sent('fullenrich').reduce((sum, options) => sum + options.limit, 0), 25);
});

test('page-size maximums are advertised in the input schema', async (t) => {
  const client = await connect(t, {});
  const { tools } = await client.listTools();
  const search = tools.find((tool) => tool.name === 'people_company_search').inputSchema;
  const maximums = JSON.stringify(search).match(/"maximum":\d+/g);
  assert.ok(maximums.includes('"maximum":25') && maximums.includes('"maximum":10'), JSON.stringify(maximums));
});

test('a missing entity is refused with an example, not guessed from the filters', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const result = await client.callTool({ name: 'people_company_search', arguments: { apollo: { organization_num_employees_ranges: ['51,200'], organization_locations: ['Boston, US'] } } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /entity: required, exactly "person" or "company"\. Example: \{"entity":"person"/);
  const typed = await client.callTool({ name: 'people_company_search', arguments: { type: 'company', apollo: { q_organization_name: 'Acme' } } });
  assert.equal(typed.isError, true);
  assert.match(typed.content[0].text, /entity: required, exactly "person" or "company"; unknown field type; takes /);
  assert.equal(api.calls.length, 0);
});

test('provider errors carry the tool name, a hint and retryable', async (t) => {
  const terms = { success: false, error: 'Terms required.', code: 'THIRD_PARTY_DATA_TERMS_REQUIRED', requiresAction: { type: 'accept_terms', terms: 'apollo', version: '1', url: 'https://example.com/terms' } };
  const api = await startApi(t, (batch) => {
    if (batch[0].provider === 'apollo') return { status: 403, json: terms };
    return {
      json: {
        success: true,
        data: { alexandria: batch.map(() => ({ error: { code: 'provider_error', message: 'We couldn’t complete this request. Please try again later.' }, creditsCost: 0 })) },
      },
    };
  });
  const client = await connect(t, { apiUrl: api.url });
  const result = await client.callTool({
    name: 'people_company_search',
    arguments: { entity: 'company', apollo: { q_organization_name: 'Acme' }, fullenrich: { industries: [{ value: 'Computer Software' }], limit: 1 } },
  });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /^No provider ran successfully: apollo error: [\s\S]*retry the same call\. fullenrich error: provider_error: [\s\S]*retry later\. Credits charged: 0\. Example of a working call: \{"entity":"company"/);
  const [apollo, fullenrich] = result.structuredContent.providers;
  assert.equal(result.structuredContent.credits_total, 0);
  assert.match(apollo.note, /^THIRD_PARTY_DATA_TERMS_REQUIRED: An organization admin must accept the apollo provider's terms \(version 1\) at https:\/\/example\.com\/terms before apollo can run\. [\s\S]*Retry without apollo, or wait until the terms are accepted and retry the same call\.$/);
  assert.doesNotMatch(apollo.note, /for example with/);
  assert.equal(fullenrich.status, 'error');
  assert.equal(fullenrich.retryable, true);
  assert.match(fullenrich.note, /^provider_error: We couldn’t complete this request\. Please try again later\. FullEnrich answers this way when a filter value/);
});

const APOLLO_TERMS = { success: false, error: 'Terms required.', code: 'THIRD_PARTY_DATA_TERMS_REQUIRED', requiresAction: { type: 'accept_terms', terms: 'apollo', version: '1', url: 'https://example.com/terms' } };

test('a search refused only for unaccepted terms says so and offers a call without that provider', async (t) => {
  const api = await startApi(t, () => ({ status: 403, json: APOLLO_TERMS }));
  const events = [];
  const client = await connect(t, { apiUrl: api.url, onToolResult: (event) => events.push(event) });
  const result = await client.callTool({ name: 'people_company_search', arguments: { entity: 'person', apollo: { person_titles: ['CTO'] }, max_credits: 0 } });
  assert.equal(result.isError, true);
  const text = result.content[0].text;
  assert.match(text, /^An organization admin must accept the apollo provider's terms \(version 1\) at https:\/\/example\.com\/terms before apollo can run\. /);
  assert.match(text, /Credits charged: 0\. Retry without apollo, for example with fullenrich: \{"entity":"person","fullenrich":/);
  assert.doesNotMatch(text, /credits for this|max_credits of at least|per record/);
  assert.match(text, /Or wait until the terms are accepted and retry the same call\.$/);
  assert.doesNotMatch(text, /Do not retry|No provider ran/);
  const data = events.find((event) => event.status === 'error').error.extras;
  assert.equal(data.code, 'third_party_data_terms_required');
  assert.deepEqual(data.terms, [{ provider: 'apollo', version: '1', url: 'https://example.com/terms' }]);
  assert.equal(data.example.apollo, undefined);
  assert.equal(data.example.entity, 'person');
  assert.ok(data.example.fullenrich);
  assert.ok(data.minimum_max_credits > 0);
  assert.equal(data.example.max_credits, data.minimum_max_credits);
  assert.equal(result.structuredContent.providers[0].status, 'error');
  assert.deepEqual(api.calls.map((call) => call.provider), ['apollo']);
});

test('a terms refusal beside a skipped provider reports both reasons', async (t) => {
  const api = await startApi(t, () => ({ status: 403, json: APOLLO_TERMS }));
  const client = await connect(t, { apiUrl: api.url });
  const result = await client.callTool({ name: 'people_company_search', arguments: { entity: 'person', apollo: { person_titles: ['CTO'] }, fullenrich: { limit: 1 } } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /^No provider ran successfully: apollo error: [\s\S]*Retry without apollo[\s\S]* fullenrich skipped: No filters given; pass at least one\./);
  assert.deepEqual(api.calls.map((call) => call.provider), ['apollo']);
});

test('an enrich call refused only for unaccepted terms offers fullenrich with its price', async (t) => {
  const api = await startApi(t, (batch) => ({
    json: {
      success: true,
      data: { alexandria: batch.map(() => ({ error: { code: 'third_party_data_terms_required', message: 'Terms required.' }, requiresAction: APOLLO_TERMS.requiresAction, creditsCost: 0 })) },
    },
  }));
  const events = [];
  const client = await connect(t, { apiUrl: api.url, onToolResult: (event) => events.push(event) });
  const result = await client.callTool({ name: 'people_company_enrich', arguments: { apollo: { people: [{ name: 'Ada Lovelace', domain: 'acme.example' }] } } });
  assert.equal(result.isError, true);
  const data = events.find((event) => event.status === 'error').error.extras;
  assert.equal(data.code, 'third_party_data_terms_required');
  assert.deepEqual(data.example, { fullenrich: { people: [{ person_name: 'Jane Doe', company_domain: 'example.com' }] }, max_credits: 10 });
  assert.match(result.content[0].text, /Retry without apollo, for example with fullenrich: \{"fullenrich":\{"people":\[\{"person_name":"Jane Doe","company_domain":"example\.com"\}\]\},"max_credits":10\}\. Or wait/);
  const [apollo] = result.structuredContent.providers.filter((p) => p.name === 'apollo');
  assert.equal(apollo.kind, 'people');
  assert.match(apollo.note, /Retry without apollo, for example with fullenrich, or wait until the terms are accepted/);
  assert.doesNotMatch(apollo.note, /credits/);
});

test('a terms refusal beside another failure names a provider that did not fail', async (t) => {
  const api = await startApi(t, (batch) => {
    if (batch[0].provider === 'apollo') return { status: 403, json: APOLLO_TERMS };
    return { json: { success: true, data: { alexandria: batch.map(() => ({ error: { code: 'provider_error', message: 'Upstream failed.' }, creditsCost: 0 })) } } };
  });
  const client = await connect(t, { apiUrl: api.url });
  const result = await client.callTool({
    name: 'people_company_search',
    arguments: { entity: 'person', apollo: { person_titles: ['CTO'] }, people_data_labs: { sql: "SELECT * FROM person WHERE job_title = 'cto'", limit: 1 } },
  });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /^No provider ran successfully: apollo error: [\s\S]*Retry without apollo, for example with fullenrich, or wait until the terms are accepted and retry the same call\. people_data_labs error: provider_error: Upstream failed\./);
  const apollo = result.structuredContent.providers.find((p) => p.name === 'apollo');
  assert.doesNotMatch(apollo.note, /people_data_labs|credits/);
});

test('a terms refusal beside a provider that ran keeps the call successful', async (t) => {
  const api = await startApi(t, (batch) => (batch[0].provider === 'apollo' ? { status: 403, json: APOLLO_TERMS } : undefined));
  const client = await connect(t, { apiUrl: api.url });
  const result = await client.callTool({
    name: 'people_company_enrich',
    arguments: { apollo: { companies: [{ domain: 'globex.example' }] }, fullenrich: { companies: [{ domain: 'acme.example' }] } },
  });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  const byName = Object.fromEntries(result.structuredContent.providers.filter((p) => p.status !== 'not_requested').map((p) => [p.name, p]));
  assert.equal(byName.fullenrich.status, 'ok');
  assert.equal(byName.apollo.status, 'error');
  assert.match(byName.apollo.note, /Retry without apollo, for example with fullenrich, or wait until the terms are accepted and retry the same call\.$/);
  assert.doesNotMatch(byName.apollo.note, /Do not retry|credits/);
});

test('a contact lookup skips a FullEnrich person it cannot identify and still runs the other providers', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const result = await client.callTool({
    name: 'people_company_enrich',
    arguments: {
      contact_fields: ['work_email'],
      fullenrich: { people: [{ person_name: 'Ada Lovelace', company_professional_network_url: 'https://www.linkedin.com/company/acme' }] },
      apollo: { people: [{ email: 'ada@acme.example' }] },
    },
  });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  const fullenrich = result.structuredContent.providers.find((p) => p.name === 'fullenrich');
  assert.match(fullenrich.note, /Skipped inputs 0/);
  assert.deepEqual(api.calls.map((call) => call.provider), ['apollo']);
});

test('Apollo runs a contact lookup only for the fields it has, and keeps only matches that carry them', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const mobile = await client.callTool({ name: 'people_company_enrich', arguments: { contact_fields: ['mobile'], apollo: { people: [{ email: 'ada@acme.example' }] } } });
  assert.equal(mobile.isError, true);
  assert.match(mobile.content[0].text, /No provider ran successfully: apollo people skipped: Apollo has no mobile lookup/);
  const apollo = mobile.structuredContent.providers.find((p) => p.name === 'apollo');
  assert.deepEqual([apollo.status, apollo.note], ['skipped', 'Apollo has no mobile lookup.']);
  assert.equal(mobile.structuredContent.credits_estimate, 0);
  assert.equal(api.calls.length, 0);
});

test('an Alexandria-only web search block adds nothing to the estimate', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const result = await client.callTool({ name: 'people_company_search', arguments: { entity: 'company', max_credits: 0, firecrawl_search: { query: 'Acme', sources: ['alexandria'] } } });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  assert.equal(result.structuredContent.credits_estimate, 0);
});

test('the published schema carries the identifier rules', async (t) => {
  const client = await connect(t, {});
  const { tools } = await client.listTools();
  const enrich = tools.find((tool) => tool.name === 'people_company_enrich');
  const nonBlank = (...keys) => ({ required: keys, properties: Object.fromEntries(keys.map((key) => [key, { pattern: '\\S' }])) });
  assert.deepEqual(enrich.inputSchema.properties.fullenrich.properties.people.items.anyOf, [
    nonBlank('person_professional_network_url'),
    nonBlank('person_name', 'company_domain'),
    nonBlank('person_name', 'company_professional_network_url'),
  ]);
  const search = tools.find((tool) => tool.name === 'people_company_search');
  const pdl = search.inputSchema.properties.people_data_labs.anyOf;
  for (const branch of pdl) assert.deepEqual(branch.oneOf, [{ required: ['sql'] }, { required: ['query'] }]);
});


test('an Apollo contact match without the requested fields stays a match and lists them as missing', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const result = await client.callTool({
    name: 'people_company_enrich',
    arguments: { contact_fields: ['work_email', 'mobile'], apollo: { people: [{ email: 'grace@acme.example' }] } },
  });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  const apollo = result.structuredContent.providers.find((p) => p.name === 'apollo');
  assert.deepEqual([apollo.status, apollo.returned, apollo.credits, apollo.unmatched], ['ok', 1, 30, undefined]);
  assert.equal(apollo.results[0].name, 'Grace Hopper');
  assert.deepEqual(apollo.results[0].missing, ['work_email', 'mobile']);
  assert.equal('work_email' in apollo.results[0], false);
});

test('a FullEnrich contact still running upstream is reported as pending, not unmatched', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const result = await client.callTool({
    name: 'people_company_enrich',
    arguments: {
      contact_fields: ['work_email'],
      fullenrich: {
        people: [
          { person_name: 'Pending Person', company_domain: 'acme.example' },
          { person_name: 'Unread Person', company_domain: 'acme.example' },
          { person_name: 'Parked Person', company_domain: 'acme.example' },
        ],
      },
    },
  });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  const fullenrich = result.structuredContent.providers[0];
  assert.deepEqual([fullenrich.status, fullenrich.unmatched, fullenrich.credits], ['pending', undefined, 0]);
  assert.deepEqual(fullenrich.pending[0], {
    input_index: 0,
    field: 'work_email',
    job_id: 'j1',
    poll_after_seconds: 60,
    next_tool: { name: 'firecrawl_scrape', arguments: { alexandria: { provider: 'firecrawl', capability: 'job-status', options: { id: 'j1' } } } },
  });
  assert.deepEqual(fullenrich.pending[1], { input_index: 1, field: 'work_email', note: 'Upstream job e2 is still running; repeating this call starts another one.' });
  assert.deepEqual(fullenrich.pending[2], {
    input_index: 2,
    field: 'work_email',
    next_tool: { name: 'firecrawl_scrape', arguments: { alexandria: { provider: 'firecrawl', capability: 'job-status', options: { id: 'j3' } } } },
  });
  assert.match(fullenrich.note, /Read each entry that has a next_tool with it after poll_after_seconds; an entry without one cannot be read later/);
  assert.equal(fullenrich.retryable, undefined);
});

test('the web search estimate is the stated price, with enterprise zdr pricing', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const refused = await client.callTool({
    name: 'people_company_search',
    arguments: { entity: 'company', max_credits: 9, firecrawl_search: { query: 'Acme', limit: 10, enterprise: ['zdr'] } },
  });
  assert.equal(refused.isError, true);
  assert.match(refused.content[0].text, /could cost up to 10 credits \(firecrawl_search 10\).*set max_credits to at least 10: \{/);
  assert.equal(api.bodies.length, 0);
});

test('a company enrichment where no provider ran gets a company example', async (t) => {
  const api = await startApi(t, (batch) => ({ json: { success: true, data: { alexandria: batch.map(() => ({ error: { code: 'provider_error', message: 'Please try again later.' }, creditsCost: 0 })) } } }));
  const client = await connect(t, { apiUrl: api.url });
  const result = await client.callTool({ name: 'people_company_enrich', arguments: { apollo: { companies: [{ domain: 'acme.example' }] } } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /Example of a working call: \{"fullenrich":\{"companies":/);
});

test('enrich shape errors carry an example built from the call', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const empty = await client.callTool({ name: 'people_company_enrich', arguments: { people_data_labs: { min_likelihood: 5 } } });
  assert.equal(empty.isError, true);
  assert.match(empty.content[0].text, /Give people_data_labs people, companies or both\. Example: \{"people_data_labs":\{"people":\[\{"name":"Jane Doe"/);
  const contact = await client.callTool({ name: 'people_company_enrich', arguments: { contact_fields: ['work_email'], fullenrich: { companies: [{ domain: 'acme.example' }] } } });
  assert.equal(contact.isError, true);
  assert.match(contact.content[0].text, /people only.*Example: \{"fullenrich":\{"companies":\[\{"domain":"acme.example"\}\]\}\}/);
  const none = await client.callTool({ name: 'people_company_enrich', arguments: {} });
  assert.match(none.content[0].text, /No provider given.*Example: \{/);
  const fieldsOnly = await client.callTool({ name: 'people_company_enrich', arguments: { contact_fields: ['work_email'] } });
  assert.match(fieldsOnly.content[0].text, /No provider given/);
  assert.equal(api.calls.length, 0);
});

test('a DataLegion person needs an identifier or a full name with context', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  for (const person of [{ full_name: 'Ada Lovelace' }, { first_name: 'Ada', last_name: 'Lovelace' }, { first_name: 'Ada', company: 'Acme' }]) {
    const result = await client.callTool({ name: 'people_company_enrich', arguments: { datalegion: { people: [person] } } });
    assert.equal(result.isError, true, JSON.stringify(person));
    assert.match(result.content[0].text, /Each datalegion person needs/);
  }
  const ok = await client.callTool({ name: 'people_company_enrich', arguments: { datalegion: { people: [{ first_name: 'Ada', last_name: 'Lovelace', company: 'Acme' }] } } });
  assert.notEqual(ok.isError, true, JSON.stringify(ok));
  assert.deepEqual(api.calls.map((call) => call.options.company), ['Acme']);
});
