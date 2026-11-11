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

const WATERFALL_RESULT = {
  people: [{
    input_index: 0,
    results: [{ provider: 'blitzapi', data: { found: true, email: 'ada@acme.example' } }],
    fields: { work_email: { provider: 'blitzapi', value: 'ada@acme.example', verified: true, domain_match: true } },
  }],
  companies: [{ input_index: 0, results: [] }],
  credits_used: 2,
};

function answer(call) {
  const { provider, capability, options } = call;
  if (provider === 'firecrawl' && capability === 'enrich/auto') {
    return { creditsCost: 0, data: { ...WATERFALL_RESULT, max_credits: options.max_credits } };
  }
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
  const headers = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    bodies.push(body);
    headers.push(req.headers);
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
  return { url: 'http://127.0.0.1:' + server.address().port, calls, bodies, headers };
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
  assert.equal(api.calls.length, 0);
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
  assert.deepEqual(enrich.inputSchema.properties.people.items.anyOf, [
    nonBlank('linkedin_url'),
    nonBlank('email'),
    nonBlank('phone'),
    nonBlank('name', 'company'),
    nonBlank('name', 'domain'),
    nonBlank('first_name', 'last_name', 'company'),
    nonBlank('first_name', 'last_name', 'domain'),
  ]);
  assert.deepEqual(enrich.inputSchema.properties.companies.items.anyOf, [nonBlank('domain'), nonBlank('linkedin_url'), nonBlank('name')]);
  assert.deepEqual(Object.keys(enrich.inputSchema.properties).sort(), ['companies', 'contact_fields', 'max_credits', 'people', 'profile', 'verified_only']);
  const search = tools.find((tool) => tool.name === 'people_company_search');
  const pdl = search.inputSchema.properties.people_data_labs.anyOf;
  for (const branch of pdl) assert.deepEqual(branch.oneOf, [{ required: ['sql'] }, { required: ['query'] }]);
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

test('enrich sends every record to the waterfall in one call and returns its attributed raw results', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const people = [{ name: 'Ada Lovelace', domain: 'acme.example' }, { linkedin_url: 'https://www.linkedin.com/in/grace' }, { email: 'alan@acme.example' }];
  const companies = [{ domain: 'globex.example' }, { name: 'Initech' }];
  const result = await client.callTool({ name: 'people_company_enrich', arguments: { contact_fields: ['work_email'], people, companies } });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  assert.deepEqual(api.calls, [{ provider: 'firecrawl', capability: 'enrich/auto', options: { people, companies, contact_fields: ['work_email'], profile: true } }]);
  assert.equal(api.bodies[0].timeout, 120000);
  assert.deepEqual(result.structuredContent, WATERFALL_RESULT);
});

test('max_credits passes through, and conversationId and objective are dropped', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const result = await client.callTool({
    name: 'people_company_enrich',
    arguments: { conversationId: 'c-1', objective: 'Find a mobile', max_credits: 400, contact_fields: ['mobile'], people: [{ phone: '+1 415 555 0100' }] },
  });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  assert.deepEqual(api.calls[0].options, { people: [{ phone: '+1 415 555 0100' }], contact_fields: ['mobile'], profile: true, max_credits: 400 });
  assert.equal(result.structuredContent.max_credits, 400);
  assert.ok(!JSON.stringify(api.bodies).includes('c-1') && !JSON.stringify(api.bodies).includes('Find a mobile'));
});

test('verified_only passes through and the per-field flags come back', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const people = [{ name: 'Ada Lovelace', domain: 'acme.example' }];
  const result = await client.callTool({ name: 'people_company_enrich', arguments: { contact_fields: ['work_email'], verified_only: true, people } });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  assert.deepEqual(api.calls[0].options, { people, contact_fields: ['work_email'], profile: true, verified_only: true });
  assert.deepEqual(result.structuredContent.people[0].fields.work_email, { provider: 'blitzapi', value: 'ada@acme.example', verified: true, domain_match: true });
});

test('a record without an identifier is refused before the waterfall runs', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  for (const person of [{ name: 'Jane Doe' }, { first_name: 'Jane', company: 'Acme' }, { company: 'Acme' }]) {
    const result = await client.callTool({ name: 'people_company_enrich', arguments: { people: [person] } });
    assert.equal(result.isError, true, JSON.stringify(person));
    assert.match(result.content[0].text, /Each person needs a linkedin_url, email or phone/);
  }
  const company = await client.callTool({ name: 'people_company_enrich', arguments: { companies: [{ industry: 'Software' }] } });
  assert.equal(company.isError, true);
  assert.equal(api.calls.length, 0);
});

test('enrich shape errors are refused before the waterfall runs', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const none = await client.callTool({ name: 'people_company_enrich', arguments: {} });
  assert.match(none.content[0].text, /Give people, companies or both\. Example: \{/);
  const fieldsOnly = await client.callTool({ name: 'people_company_enrich', arguments: { contact_fields: ['work_email'] } });
  assert.match(fieldsOnly.content[0].text, /Give people, companies or both/);
  const people = Array.from({ length: 6 }, (_, i) => ({ email: 'p' + i + '@acme.example' }));
  const companies = Array.from({ length: 5 }, (_, i) => ({ domain: 'c' + i + '.example' }));
  const many = await client.callTool({ name: 'people_company_enrich', arguments: { people, companies } });
  assert.match(many.content[0].text, /At most 10 people and companies per call, got 11/);
  const contact = await client.callTool({ name: 'people_company_enrich', arguments: { contact_fields: ['work_email'], companies: [{ domain: 'acme.example' }] } });
  assert.match(contact.content[0].text, /contact_fields applies to people only/);
  const block = await client.callTool({ name: 'people_company_enrich', arguments: { fullenrich: { people: [{ person_name: 'Ada', company_domain: 'acme.example' }] } } });
  assert.equal(block.isError, true);
  assert.match(block.content[0].text, /unknown field fullenrich; takes people, companies, contact_fields, profile, verified_only, max_credits/);
  for (const result of [none, fieldsOnly, many, contact]) assert.equal(result.isError, true);
  assert.equal(api.calls.length, 0);
});

test('a waterfall refusal is relayed with its code and retryable', async (t) => {
  const api = await startApi(t, (batch) => ({
    json: { success: true, data: { alexandria: batch.map(() => ({ creditsCost: 0, error: { code: 'provider_unavailable', message: 'Enrichment is unavailable right now.' } })) } },
  }));
  const events = [];
  const client = await connect(t, { apiUrl: api.url, onToolResult: (event) => events.push(event) });
  const result = await client.callTool({ name: 'people_company_enrich', arguments: { people: [{ linkedin_url: 'https://www.linkedin.com/in/ada' }] } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /Enrichment is unavailable right now\./);
  const extras = events.find((event) => event.status === 'error').error.extras;
  assert.deepEqual([extras.code, extras.retryable], ['provider_unavailable', true]);
});

test('near-miss shapes are repaired before validation', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const result = await client.callTool({ name: 'people_company_enrich', arguments: { people: { email: 'ada@acme.example' }, contact_fields: 'mobile' } });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  assert.deepEqual(api.calls[0].options, { people: [{ email: 'ada@acme.example' }], contact_fields: ['mobile'], profile: true });
});

test('a retryable refusal before the waterfall ran is resent once under the same request id', async (t) => {
  let refused = false;
  const api = await startApi(t, () => {
    if (refused) return undefined;
    refused = true;
    return { status: 503, json: { success: false, code: 'precheck_unavailable', error: 'Try again.', retryable: true } };
  });
  const client = await connect(t, { apiUrl: api.url });
  const result = await client.callTool({ name: 'people_company_enrich', arguments: { people: [{ email: 'ada@acme.example' }] } });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  assert.equal(api.calls.length, 2);
  assert.equal(api.headers[0]['x-request-id'], api.headers[1]['x-request-id']);
  assert.ok(api.bodies[1].timeout < 120000 && api.bodies[1].timeout > 100000, String(api.bodies[1].timeout));
});
