// The enrich tools: registration, argument repair and refusals; people_company_search
// running each provider on its own native parameters under a credit cap; and
// people_company_enrich routing each lookup by what the caller wants back.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createFirecrawlMcpServer } from '../dist/server.js';
import { getFreePort, startStdio } from './helpers/exchange-mcp.mjs';
import { CLAUDE_CODE_TEXT_CAP } from './helpers/description-budget.mjs';

const ENRICH_TOOLS = ['people_company_search', 'people_company_enrich'];

function answer(call) {
  const { provider, capability } = call;
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

  const many = await client.callTool({
    name: 'people_company_enrich',
    arguments: { a: 1, b: 2, c: 3, people: [{ name: 'Jane Doe', company_domain: 'example.com', d: 4 }, { email: 'jane.doe@example.com', e: 5 }], companies: [{ domain: 'example.com', f: 6 }] },
  });
  assert.equal(many.isError, true);
  for (const key of ['a', 'b', 'c', 'd', 'e', 'f']) assert.match(many.content[0].text, new RegExp('unknown field[^;]*\\b' + key + '\\b'));
  assert.match(many.content[0].text, /people\.0: unknown field d; takes name, first_name, last_name, company_domain, company, linkedin_url, email, apollo_id/);
  assert.match(many.content[0].text, /Example: \{"people":\[\{"name":"Jane Doe"/);
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
    nonBlank('apollo_id'),
    nonBlank('name', 'company_domain'),
    nonBlank('name', 'company'),
    nonBlank('first_name', 'last_name', 'company_domain'),
    nonBlank('first_name', 'last_name', 'company'),
  ]);
  assert.deepEqual(enrich.inputSchema.properties.companies.items.anyOf, [nonBlank('domain'), nonBlank('linkedin_url'), nonBlank('name')]);
  assert.deepEqual([enrich.inputSchema.properties.people.maxItems, enrich.inputSchema.properties.companies.maxItems], [25, 25]);
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

// people_company_enrich: every lookup is a routing call, mocked here as the results it returns per subject.

const ROUTING = { provider: 'firecrawl', capability: 'enrich/waterfall' };
const attempt = (provider, outcome, credits = 0) => ({ provider, capability: 'lookup', outcome, credits });
const hit = (input_index, served_by, credits, fields) => ({ input_index, status: 'hit', served_by, tried: [attempt(served_by, 'hit', credits)], ...fields });
const miss = (input_index, ...providers) => ({ input_index, status: 'miss', tried: providers.map((provider) => attempt(provider, 'miss')) });
const allMiss = (options) => options.subjects.map((_, index) => miss(index, 'fullenrich'));

/** Answers a routing call with the results route gives for its options, charged at what their attempts cost. */
function routed(route) {
  return ([call]) => {
    const results = route(call.options);
    const providerCredits = results.flatMap((result) => result.tried).reduce((sum, tried) => sum + tried.credits, 0);
    return { json: { success: true, data: { alexandria: [{ ...ROUTING, data: { find: call.options.find, results, providerCredits, maxCredits: call.options.max_credits, billingComplete: true } }] } } };
  };
}

const enrich = (client, args) => client.callTool({ name: 'people_company_enrich', arguments: args });
const sent = (api) => api.calls.map((call) => call.options);
const counts = (summary) => ({ found: 0, not_found: 0, pending: 0, unresolved: 0, ambiguous: 0, max_credits: 1000, ...summary });

const JANE = { name: 'Jane Doe', company_domain: 'example.com' };
const JOHN = { email: 'john.roe@example.com' };
const PERSON_URL = 'https://www.linkedin.com/in/example-person';
const COMPANY_URL = 'https://www.linkedin.com/company/example';
const WEAK = (input_index, record) => ({ input_index, status: 'hit', served_by: 'apollo', record, tried: [attempt('fullenrich', 'miss'), attempt('apollo', 'hit', 15)] });

test('people_company_enrich describes what to give and what comes back', async (t) => {
  const client = await connect(t, {});
  const tool = (await client.listTools()).tools.find((entry) => entry.name === 'people_company_enrich');
  assert.equal(
    tool.description,
    'Look up and enrich people or companies you already know. Give people (each a linkedin_url, an email, an apollo_id, or a name with company_domain or company) and/or companies (each a domain, linkedin_url or name), and list what you want back in want. ' +
      'People: profile (the default: title, employer, LinkedIn URL, location), work_email, personal_email, mobile. Companies always return firmographics (industry, headcount, headquarters, founding year); add funding for total funding raised. ' +
      'You do not choose data providers: for each input the cheapest provider that can answer is asked first, then the next one when it finds nothing, and only what is found is charged. ' +
      'max_credits is the most the whole call may spend (default 1000): when it is used up the call returns what it has, and next holds the call that finishes the rest. ' +
      'Each row has a status (found, not_found, pending, unresolved, or ambiguous for a company match that could not be confirmed, with its candidates), served_by and credits; missing lists wanted values no provider had. ' +
      'providers (optional) limits the call to those providers, in that order. ' +
      'Example: {"people":[{"name":"Jane Doe","company_domain":"example.com"}],"companies":[{"domain":"example.com"}],"want":["work_email","funding"]}'
  );
  assert.deepEqual(Object.keys(tool.inputSchema.properties), ['people', 'companies', 'want', 'max_credits', 'providers']);
  assert.equal(tool.inputSchema.properties.max_credits.default, 1000);
  assert.deepEqual(tool.inputSchema.properties.providers.items.enum, ['hunter', 'apollo', 'fullenrich', 'datalegion', 'people_data_labs']);
  assert.deepEqual(Object.keys(tool.outputSchema.properties), ['people', 'companies', 'summary', 'next']);
});

test('a work email lookup is one routing call, with one row per person', async (t) => {
  const api = await startApi(
    t,
    routed(() => [
      hit(0, 'hunter', 5, { email: 'jane.doe@example.com', verification: { status: 'valid', by: 'hunter' }, record: { name: 'Jane Doe', company_domain: 'example.com', work_email: 'jane.doe@example.com' } }),
      miss(1, 'hunter', 'people-data-labs'),
    ])
  );
  const client = await connect(t, { apiUrl: api.url });
  const result = await enrich(client, { people: [JANE, { linkedin_url: PERSON_URL }], want: ['work_email'] });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  assert.deepEqual(api.calls, [{ ...ROUTING, options: { find: 'work_email', subjects: [{ full_name: 'Jane Doe', domain: 'example.com' }, { linkedin_url: PERSON_URL }], max_credits: 1000 } }]);
  assert.match(api.headers[0]['x-request-id'], /^[0-9a-f-]{36}$/);
  assert.equal(typeof api.bodies[0].origin, 'string');
  assert.deepEqual(result.structuredContent, {
    people: [
      { input_index: 0, status: 'found', name: 'Jane Doe', company_domain: 'example.com', work_email: 'jane.doe@example.com', email_status: 'valid', served_by: ['hunter'], credits: 5 },
      { input_index: 1, status: 'not_found', missing: ['work_email'], credits: 0, tried: ['hunter', 'people_data_labs'] },
    ],
    summary: counts({ found: 1, not_found: 1, credits: 5 }),
  });
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
});

test('profile and work_email are two routing calls merged into one row per person', async (t) => {
  const profile = { name: 'Jane Doe', title: 'Head of Data', company: 'Example', company_domain: 'example.com', location: 'Springfield, United States', linkedin_url: PERSON_URL };
  const api = await startApi(
    t,
    routed((options) =>
      options.find === 'person'
        ? [hit(0, 'datalegion', 20, { record: profile }), hit(1, 'datalegion', 20, { record: { name: 'John Roe', company_domain: 'example.net', linkedin_url: PERSON_URL + '-2' } })]
        : [
            hit(0, 'hunter', 5, { email: 'jane.doe@example.com', verification: { status: 'valid', by: 'hunter' }, advice: 'Send a test message before a campaign.', record: { name: 'J. Doe', work_email: 'jane.doe@example.com' } }),
            miss(1, 'hunter'),
          ]
    )
  );
  const client = await connect(t, { apiUrl: api.url });
  const result = await enrich(client, { people: [{ name: 'Jane Doe', company: 'Example' }, { name: 'John Roe', company_domain: 'example.org' }], want: ['work_email', 'profile'] });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  assert.deepEqual(sent(api), [
    { find: 'person', subjects: [{ full_name: 'Jane Doe', company: 'Example' }, { full_name: 'John Roe', domain: 'example.org' }], max_credits: 1000 },
    {
      find: 'work_email',
      subjects: [
        { full_name: 'Jane Doe', company: 'Example', linkedin_url: PERSON_URL, domain: 'example.com' },
        { full_name: 'John Roe', domain: 'example.org', linkedin_url: PERSON_URL + '-2' },
      ],
      max_credits: 960,
    },
  ]);
  assert.deepEqual(result.structuredContent.people, [
    { input_index: 0, status: 'found', ...profile, work_email: 'jane.doe@example.com', email_status: 'valid', served_by: ['datalegion', 'hunter'], credits: 25, note: 'Send a test message before a campaign.' },
    { input_index: 1, status: 'found', name: 'John Roe', company_domain: 'example.net', linkedin_url: PERSON_URL + '-2', missing: ['work_email'], served_by: ['datalegion'], credits: 20 },
  ]);
  assert.deepEqual(result.structuredContent.summary, counts({ found: 2, credits: 45 }));
  assert.equal(result.structuredContent.next, undefined);
});

test('a company lookup returns firmographics from one routing call', async (t) => {
  const record = { name: 'Example Inc', domain: 'example.com', linkedin_url: COMPANY_URL, industry: 'Software Development', employees: 120, employees_range: '51-200', hq: 'Springfield, United States', founded: 2015 };
  const api = await startApi(
    t,
    routed(() => [hit(0, 'fullenrich', 10, { record: { ...record, description: 'd'.repeat(200) } }), miss(1, 'fullenrich', 'apollo', 'datalegion', 'people-data-labs')])
  );
  const client = await connect(t, { apiUrl: api.url });
  const result = await enrich(client, { companies: [{ domain: 'example.com' }, { name: 'Nowhere Ltd' }] });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  assert.deepEqual(sent(api), [{ find: 'company', subjects: [{ domain: 'example.com' }, { company: 'Nowhere Ltd' }], max_credits: 1000 }]);
  assert.deepEqual(result.structuredContent, {
    companies: [
      { input_index: 0, status: 'found', ...record, description: 'd'.repeat(160), served_by: ['fullenrich'], credits: 10 },
      { input_index: 1, status: 'not_found', credits: 0, tried: ['fullenrich', 'apollo', 'datalegion', 'people_data_labs'] },
    ],
    summary: counts({ found: 1, not_found: 1, credits: 10 }),
  });
});

test('a weak company match is asked for again until a provider returns the company the input names', async (t) => {
  const later = {
    'datalegion,people-data-labs': hit(0, 'datalegion', 20, { record: { name: 'Another Co', domain: 'example.com' } }),
    'people-data-labs': hit(0, 'people-data-labs', 50, { record: { name: 'Example Inc', domain: 'example.com' } }),
  };
  const api = await startApi(
    t,
    routed((options) => [options.providers ? later[options.providers.join()] : WEAK(0, { name: 'Other Co', domain: 'example.com' })])
  );
  const client = await connect(t, { apiUrl: api.url });
  const result = await enrich(client, { companies: [{ domain: 'www.example.com' }] });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  const subjects = [{ domain: 'www.example.com' }];
  assert.deepEqual(sent(api), [
    { find: 'company', subjects, max_credits: 1000 },
    { find: 'company', subjects, providers: ['datalegion', 'people-data-labs'], max_credits: 985 },
    { find: 'company', subjects, providers: ['people-data-labs'], max_credits: 965 },
  ]);
  assert.deepEqual(result.structuredContent.companies, [
    { input_index: 0, status: 'found', name: 'Example Inc', domain: 'example.com', served_by: ['people_data_labs'], credits: 85, note: 'Another company also matched this input and was not returned.' },
  ]);
  assert.deepEqual(result.structuredContent.summary, counts({ found: 1, credits: 85 }));
});

test('a weak company match stays ambiguous unless another provider returns the same company', async (t) => {
  const labs = { name: 'Labs of Example', linkedin_url: COMPANY_URL + '-labs', industry: 'Research' };
  const later = {
    'datalegion,people-data-labs': [
      miss(0, 'datalegion', 'people-data-labs'),
      hit(1, 'datalegion', 20, { record: { name: 'Third Co', domain: 'example.org' } }),
      hit(2, 'datalegion', 20, { record: { name: 'Labs Of Example', linkedin_url: 'https://linkedin.com/company/example-labs/', employees: 40 } }),
    ],
    'people-data-labs': [hit(0, 'people-data-labs', 50, { record: { name: 'Another Co', employees: 12 } })],
  };
  const api = await startApi(
    t,
    routed((options) =>
      options.providers ? later[options.providers.join()] : [WEAK(0, { name: 'Other Co', domain: 'example.com' }), WEAK(1, { name: 'Another Co', domain: 'example.org' }), WEAK(2, labs)]
    )
  );
  const client = await connect(t, { apiUrl: api.url });
  const companies = [{ domain: 'example.com' }, { domain: 'example.org' }, { name: 'Example Labs' }];
  const result = await enrich(client, { companies });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  const subjects = [{ domain: 'example.com' }, { domain: 'example.org' }, { company: 'Example Labs' }];
  assert.deepEqual(sent(api), [
    { find: 'company', subjects, max_credits: 1000 },
    { find: 'company', subjects, providers: ['datalegion', 'people-data-labs'], max_credits: 955 },
    { find: 'company', subjects: [subjects[1]], providers: ['people-data-labs'], max_credits: 915 },
  ]);
  assert.deepEqual(result.structuredContent.companies, [
    { input_index: 0, status: 'ambiguous', candidates: [{ name: 'Other Co', domain: 'example.com' }], served_by: ['apollo'], credits: 15, tried: ['fullenrich', 'apollo', 'datalegion', 'people_data_labs'] },
    {
      input_index: 1,
      status: 'found',
      name: 'Another Co',
      domain: 'example.org',
      employees: 12,
      served_by: ['apollo', 'people_data_labs'],
      credits: 85,
      note: 'Another company also matched this input and was not returned.',
    },
    { input_index: 2, status: 'found', ...labs, employees: 40, served_by: ['apollo', 'datalegion'], credits: 35 },
  ]);
  assert.deepEqual(result.structuredContent.summary, counts({ found: 2, ambiguous: 1, credits: 135 }));
  assert.equal(result.structuredContent.next, undefined);
});

test('an ambiguous company lists at most three of the companies that matched', async (t) => {
  const answers = { fullenrich: ['Other Co', 10], apollo: ['Another Co', 15], datalegion: ['Third Co', 20], 'people-data-labs': ['Fourth Co', 50] };
  const api = await startApi(
    t,
    routed((options) => {
      const provider = options.providers?.[0] ?? 'fullenrich';
      const [name, credits] = answers[provider];
      return [hit(0, provider, credits, { record: { name, domain: 'example.com' } })];
    })
  );
  const client = await connect(t, { apiUrl: api.url });
  const result = await enrich(client, { companies: [{ domain: 'example.com' }] });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  assert.deepEqual(
    sent(api).map((options) => options.providers),
    [undefined, ['apollo', 'datalegion', 'people-data-labs'], ['datalegion', 'people-data-labs'], ['people-data-labs']]
  );
  assert.deepEqual(result.structuredContent.companies, [
    {
      input_index: 0,
      status: 'ambiguous',
      candidates: ['Other Co', 'Another Co', 'Third Co'].map((name) => ({ name, domain: 'example.com' })),
      served_by: ['fullenrich', 'apollo', 'datalegion'],
      credits: 95,
      tried: ['fullenrich', 'apollo', 'datalegion', 'people_data_labs'],
    },
  ]);
});

test('funding asks the providers that carry it first and fills it with a follow-up call', async (t) => {
  const labsUrl = 'https://linkedin.com/company/example-labs/';
  const api = await startApi(
    t,
    routed((options) =>
      options.subjects[0].linkedin_url
        ? [hit(0, 'apollo', 15, { record: { name: 'Example', linkedin_url: 'https://linkedin.com/company/example/', industry: 'Software Development', funding_total_usd: 12000000 } })]
        : [
            hit(0, 'people-data-labs', 50, { record: { name: 'Example Inc', domain: 'example.com', linkedin_url: COMPANY_URL, employees: 120 } }),
            { input_index: 1, status: 'hit', served_by: 'apollo', record: { name: 'Example Org', domain: 'example.org' }, tried: [attempt('people-data-labs', 'miss'), attempt('apollo', 'hit', 15)] },
            { input_index: 2, status: 'hit', served_by: 'fullenrich', record: { name: 'Example Labs', linkedin_url: labsUrl }, tried: [attempt('people-data-labs', 'miss'), attempt('apollo', 'miss'), attempt('fullenrich', 'hit', 10)] },
          ]
    )
  );
  const client = await connect(t, { apiUrl: api.url });
  const companies = [{ domain: 'example.com' }, { domain: 'example.org' }, { linkedin_url: COMPANY_URL + '-labs' }];
  const result = await enrich(client, { companies, want: ['funding'] });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  // A provider that already returned the company, or was already asked with the identifier the follow-up sends, is not asked again.
  assert.deepEqual(sent(api), [
    { find: 'company', subjects: companies, providers: ['people-data-labs', 'apollo', 'fullenrich', 'datalegion'], max_credits: 1000 },
    { find: 'company', subjects: [{ linkedin_url: COMPANY_URL }], providers: ['apollo'], max_credits: 925 },
  ]);
  assert.deepEqual(result.structuredContent.companies, [
    { input_index: 0, status: 'found', name: 'Example Inc', domain: 'example.com', linkedin_url: COMPANY_URL, industry: 'Software Development', employees: 120, funding_total_usd: 12000000, served_by: ['people_data_labs', 'apollo'], credits: 65 },
    { input_index: 1, status: 'found', name: 'Example Org', domain: 'example.org', missing: ['funding'], served_by: ['apollo'], credits: 15 },
    { input_index: 2, status: 'found', name: 'Example Labs', linkedin_url: labsUrl, missing: ['funding'], served_by: ['fullenrich'], credits: 10 },
  ]);
  assert.deepEqual(result.structuredContent.summary, counts({ found: 3, credits: 90 }));
});

test('funding is asked for by LinkedIn URL at a provider that returned another company for the domain', async (t) => {
  const record = { name: 'Example Inc', domain: 'example.com', linkedin_url: COMPANY_URL };
  const api = await startApi(
    t,
    routed((options) => {
      if (options.subjects[0].linkedin_url) return [hit(0, 'people-data-labs', 50, { record: { name: 'Example Inc', linkedin_url: COMPANY_URL, funding_total_usd: 12000000 } })];
      return [options.providers.length === 4 ? hit(0, 'people-data-labs', 50, { record: { name: 'Other Co', domain: 'example.com' } }) : hit(0, 'fullenrich', 10, { record })];
    })
  );
  const client = await connect(t, { apiUrl: api.url });
  const result = await enrich(client, { companies: [{ domain: 'example.com' }], want: ['funding'] });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  assert.deepEqual(sent(api), [
    { find: 'company', subjects: [{ domain: 'example.com' }], providers: ['people-data-labs', 'apollo', 'fullenrich', 'datalegion'], max_credits: 1000 },
    { find: 'company', subjects: [{ domain: 'example.com' }], providers: ['fullenrich', 'apollo', 'datalegion'], max_credits: 950 },
    { find: 'company', subjects: [{ linkedin_url: COMPANY_URL }], providers: ['people-data-labs', 'apollo'], max_credits: 940 },
  ]);
  assert.deepEqual(result.structuredContent.companies, [
    { input_index: 0, status: 'found', ...record, funding_total_usd: 12000000, served_by: ['fullenrich', 'people_data_labs'], credits: 110, note: 'Another company also matched this input and was not returned.' },
  ]);
});

test('a budget that runs out leaves unresolved rows and the call that finishes them', async (t) => {
  const api = await startApi(
    t,
    routed(() => [hit(0, 'apollo', 30, { record: { name: 'Jane Doe', title: 'Head of Data' } }), { input_index: 1, status: 'budget_exhausted', tried: [attempt('datalegion', 'miss')] }])
  );
  const client = await connect(t, { apiUrl: api.url });
  await client.listTools();
  const args = { people: [JANE, JOHN], companies: [{ domain: 'example.com' }], want: ['profile', 'work_email'] };
  const result = await enrich(client, { ...args, max_credits: 30 });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  assert.deepEqual(sent(api), [{ find: 'person', subjects: [{ full_name: 'Jane Doe', domain: 'example.com' }, JOHN], max_credits: 30 }]);
  assert.deepEqual(result.structuredContent, {
    people: [
      { input_index: 0, status: 'unresolved', reason: 'budget', name: 'Jane Doe', title: 'Head of Data', served_by: ['apollo'], credits: 30, tried: ['apollo'] },
      { input_index: 1, status: 'unresolved', reason: 'budget', credits: 0, tried: ['datalegion'] },
    ],
    companies: [{ input_index: 0, status: 'unresolved', reason: 'budget', credits: 0 }],
    summary: counts({ unresolved: 3, credits: 30, max_credits: 30 }),
    next: {
      tool: 'people_company_enrich',
      arguments: args,
      note: 'max_credits ran out before these inputs finished; raise it to finish them, and ask the user first if the user set the budget.',
    },
  });
});

test('a budget used up by the first company call skips the follow-up calls', async (t) => {
  const api = await startApi(
    t,
    routed(() => [
      hit(0, 'people-data-labs', 15, { record: { name: 'Other Co', domain: 'example.com' } }),
      hit(1, 'people-data-labs', 15, { record: { name: 'Example Org', domain: 'example.org' } }),
    ])
  );
  const client = await connect(t, { apiUrl: api.url });
  const result = await enrich(client, { companies: [{ domain: 'example.com' }, { domain: 'example.org' }], want: ['funding'], max_credits: 30 });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  assert.equal(api.calls.length, 1);
  assert.deepEqual(result.structuredContent.companies, [
    {
      input_index: 0,
      status: 'ambiguous',
      candidates: [{ name: 'Other Co', domain: 'example.com' }],
      served_by: ['people_data_labs'],
      credits: 15,
      note: 'max_credits ran out before this match could be confirmed.',
      tried: ['people_data_labs'],
    },
    { input_index: 1, status: 'found', name: 'Example Org', domain: 'example.org', missing: ['funding'], served_by: ['people_data_labs'], credits: 15, note: 'max_credits ran out before funding was looked up.' },
  ]);
  assert.deepEqual(result.structuredContent.summary, counts({ found: 1, ambiguous: 1, credits: 30, max_credits: 30 }));
  assert.equal(result.structuredContent.next, undefined);
});

test('a provider block is refused with an example of what the tool takes', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const people = await enrich(client, { contact_fields: ['work_email'], fullenrich: { people: [{ person_name: 'Jane Doe', company_domain: 'example.com' }] } });
  assert.equal(people.isError, true);
  assert.equal(
    people.content[0].text,
    'Invalid people_company_enrich arguments. fullenrich: this tool takes people or companies and what you want back in want, not a block per provider. Firecrawl picks the providers. ' +
      'Example: {"people":[{"name":"Jane Doe","company_domain":"example.com"}],"want":["work_email"]}'
  );
  const companies = await enrich(client, { apollo: { companies: [{ domain: 'example.com' }] }, datalegion: { companies: [{ domain: 'example.com' }] } });
  assert.equal(companies.isError, true);
  assert.match(companies.content[0].text, /^Invalid people_company_enrich arguments\. apollo, datalegion: .*Firecrawl picks the providers\. Example: \{"companies":\[\{"domain":"example\.com"\}\]\}$/);
  const both = await enrich(client, { people: [JANE], people_data_labs: { companies: [{ website: 'example.com' }] }, want: ['mobile', 'emails'] });
  assert.equal(both.isError, true);
  assert.match(both.content[0].text, /people_data_labs: .* Example: \{"people":\[\{"name":"Jane Doe","company_domain":"example\.com"\}\],"companies":\[\{"domain":"example\.com"\}\],"want":\["mobile"\]\}$/);
  assert.equal(api.calls.length, 0);
});

test('providers are passed to every routing call as API slugs', async (t) => {
  const api = await startApi(t, routed(allMiss));
  const client = await connect(t, { apiUrl: api.url });
  const result = await enrich(client, { people: [JOHN], companies: [{ linkedin_url: COMPANY_URL }], want: ['profile', 'mobile', 'funding'], providers: ['people_data_labs', 'hunter'] });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  assert.deepEqual(sent(api), [
    { find: 'person', subjects: [JOHN], providers: ['people-data-labs', 'hunter'], max_credits: 1000 },
    { find: 'phone', subjects: [JOHN], providers: ['people-data-labs', 'hunter'], max_credits: 1000 },
    { find: 'company', subjects: [{ linkedin_url: COMPANY_URL }], providers: ['people-data-labs', 'hunter'], max_credits: 1000 },
  ]);
  assert.deepEqual(result.structuredContent.people, [{ input_index: 0, status: 'not_found', missing: ['profile', 'mobile'], credits: 0, tried: ['fullenrich'] }]);
});

test('the follow-up company calls stay inside the providers the caller named', async (t) => {
  const api = await startApi(
    t,
    routed((options) =>
      options.providers.length === 1
        ? [miss(0, 'apollo')]
        : [
            hit(0, 'fullenrich', 10, { record: { name: 'Other Co', domain: 'example.com' } }),
            hit(1, 'fullenrich', 10, { record: { name: 'Example Org', domain: 'example.org', linkedin_url: COMPANY_URL + '-org' } }),
          ]
    )
  );
  const client = await connect(t, { apiUrl: api.url });
  const result = await enrich(client, { companies: [{ domain: 'example.com' }, { domain: 'example.org' }], want: ['funding'], providers: ['fullenrich', 'apollo'] });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  assert.deepEqual(sent(api), [
    { find: 'company', subjects: [{ domain: 'example.com' }, { domain: 'example.org' }], providers: ['fullenrich', 'apollo'], max_credits: 1000 },
    { find: 'company', subjects: [{ domain: 'example.com' }], providers: ['apollo'], max_credits: 980 },
    { find: 'company', subjects: [{ linkedin_url: COMPANY_URL + '-org' }], providers: ['apollo'], max_credits: 980 },
  ]);
  assert.deepEqual(result.structuredContent.companies.map((row) => [row.status, row.missing]), [['ambiguous', undefined], ['found', ['funding']]]);
});

test('lookups that did not finish keep the values found and say when to call again', async (t) => {
  const api = await startApi(
    t,
    routed((options) =>
      options.find === 'person'
        ? [hit(0, 'datalegion', 0, { record: { name: 'Jane Doe', title: 'Head of Data' } }), miss(1, 'datalegion'), { input_index: 2, status: 'no_provider', tried: [] }]
        : [
            { input_index: 0, status: 'pending', tried: [attempt('fullenrich', 'pending')] },
            { input_index: 1, status: 'stopped', tried: [attempt('fullenrich', 'miss'), attempt('datalegion', 'error')] },
            hit(2, 'fullenrich', 300, { phone: '+1 555 0100' }),
          ]
    )
  );
  const client = await connect(t, { apiUrl: api.url });
  const args = { people: [JANE, JOHN, { apollo_id: 'a1' }], want: ['profile', 'mobile'], providers: ['datalegion', 'fullenrich'] };
  const result = await enrich(client, { ...args, max_credits: 500 });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  assert.deepEqual(result.structuredContent, {
    people: [
      { input_index: 0, status: 'pending', name: 'Jane Doe', title: 'Head of Data', served_by: ['datalegion'], credits: 0, tried: ['datalegion', 'fullenrich'] },
      { input_index: 1, status: 'unresolved', reason: 'provider_error', missing: ['profile'], credits: 0, tried: ['datalegion', 'fullenrich'] },
      { input_index: 2, status: 'unresolved', reason: 'no_provider', mobile: '+1 555 0100', served_by: ['fullenrich'], credits: 300, tried: ['fullenrich'] },
    ],
    summary: counts({ pending: 1, unresolved: 2, credits: 300, max_credits: 500 }),
    next: {
      tool: 'people_company_enrich',
      arguments: args,
      note:
        'A provider is still working; call again in about a minute. A provider failed for these inputs; calling again may succeed. ' +
        'No provider could be asked for these inputs; give another identifier or leave out providers.',
    },
  });
});

test('a routing request the API refuses is the error of the call', async (t) => {
  const refusal = { status: 402, json: { success: false, error: 'Insufficient credits to perform this request.' } };
  const api = await startApi(t, () => refusal);
  const client = await connect(t, { apiUrl: api.url });
  const result = await enrich(client, { people: [JANE], companies: [{ domain: 'example.com' }] });
  assert.equal(result.isError, true);
  assert.equal(result.content[0].text, 'Insufficient credits to perform this request.');
  assert.equal(api.calls.length, 1);

  const later = await startApi(t, (batch) => (batch[0].options.find === 'person' ? routed(() => [hit(0, 'datalegion', 0, { record: { name: 'Jane Doe' } })])(batch) : refusal));
  const partial = await enrich(await connect(t, { apiUrl: later.url }), { people: [JANE], companies: [{ domain: 'example.com' }], want: ['profile', 'work_email'] });
  assert.notEqual(partial.isError, true, JSON.stringify(partial));
  assert.deepEqual(sent(later).map((options) => options.find), ['person', 'work_email']);
  assert.deepEqual(partial.structuredContent.people, [{ input_index: 0, status: 'unresolved', reason: 'provider_error', name: 'Jane Doe', served_by: ['datalegion'], credits: 0, tried: ['datalegion'] }]);
  assert.deepEqual(partial.structuredContent.companies, [{ input_index: 0, status: 'unresolved', reason: 'provider_error', credits: 0 }]);
  assert.equal(
    partial.structuredContent.next.note,
    'A provider failed for these inputs; calling again may succeed. The request that failed said: Insufficient credits to perform this request.'
  );

  const followUp = await startApi(t, (batch) => (batch[0].options.providers ? refusal : routed(() => [WEAK(0, { name: 'Other Co', domain: 'example.com' })])(batch)));
  const unconfirmed = await enrich(await connect(t, { apiUrl: followUp.url }), { companies: [{ domain: 'example.com' }] });
  assert.notEqual(unconfirmed.isError, true, JSON.stringify(unconfirmed));
  assert.deepEqual(unconfirmed.structuredContent, {
    companies: [
      {
        input_index: 0,
        status: 'ambiguous',
        candidates: [{ name: 'Other Co', domain: 'example.com' }],
        served_by: ['apollo'],
        credits: 15,
        note: 'A request failed before this match could be confirmed: Insufficient credits to perform this request.',
        tried: ['fullenrich', 'apollo'],
      },
    ],
    summary: counts({ ambiguous: 1, credits: 15 }),
  });
});

test('near-miss enrich shapes are repaired before validation', async (t) => {
  const api = await startApi(t, routed(allMiss));
  const client = await connect(t, { apiUrl: api.url });
  const result = await enrich(client, {
    conversationId: 'c-1',
    objective: 'Find a contact',
    contact_fields: 'work_email',
    want: ['profile'],
    max_credits: '50',
    people: { full_name: 'Jane Doe', domain: 'example.com', social_url: PERSON_URL },
    companies: { website: 'example.com', professional_network_url: COMPANY_URL },
  });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  const person = { full_name: 'Jane Doe', domain: 'example.com', linkedin_url: PERSON_URL };
  assert.deepEqual(sent(api), [
    { find: 'person', subjects: [person], max_credits: 50 },
    { find: 'work_email', subjects: [person], max_credits: 50 },
    { find: 'company', subjects: [{ domain: 'example.com', linkedin_url: COMPANY_URL }], max_credits: 50 },
  ]);
  assert.ok(!JSON.stringify(api.bodies).includes('c-1') && !JSON.stringify(api.bodies).includes('Find a contact'));
  assert.equal(result.structuredContent.summary.max_credits, 50);
});

test('want values that apply to neither list given are ignored', async (t) => {
  const api = await startApi(t, routed(allMiss));
  const client = await connect(t, { apiUrl: api.url });
  const people = await enrich(client, { people: [{ apollo_id: 'a1' }], want: ['funding'] });
  assert.notEqual(people.isError, true, JSON.stringify(people));
  const companies = await enrich(client, { companies: [{ name: 'Example' }], want: ['mobile'] });
  assert.notEqual(companies.isError, true, JSON.stringify(companies));
  assert.deepEqual(sent(api), [
    { find: 'person', subjects: [{ apollo_id: 'a1' }], max_credits: 1000 },
    { find: 'company', subjects: [{ company: 'Example' }], max_credits: 1000 },
  ]);
  assert.deepEqual(people.structuredContent.people[0].missing, ['profile']);
});

test('an enrich input without an identifier is refused before any lookup runs', async (t) => {
  const api = await startApi(t, routed(allMiss));
  const client = await connect(t, { apiUrl: api.url });
  for (const person of [{ name: 'Jane Doe' }, { first_name: 'Jane', company: 'Example' }, { company_domain: 'example.com' }, { linkedin_url: ' ' }]) {
    const result = await enrich(client, { people: [person] });
    assert.equal(result.isError, true, JSON.stringify(person));
    assert.match(result.content[0].text, /people\.0: Each person needs a linkedin_url, an email, an apollo_id, or a name \(name, or first_name and last_name\) with company_domain or company\. Example: \{/);
  }
  const company = await enrich(client, { companies: [{}] });
  assert.equal(company.isError, true);
  assert.match(company.content[0].text, /companies\.0: Each company needs a domain, linkedin_url or name\. Example: \{/);
  for (const args of [{}, { want: ['work_email'] }]) {
    const neither = await enrich(client, args);
    assert.equal(neither.isError, true, JSON.stringify(args));
    assert.match(neither.content[0].text, /^Invalid people_company_enrich arguments\. Give people, companies or both\. Example: \{"people":/);
  }
  assert.equal(api.calls.length, 0);

  const ok = await enrich(client, { people: [{ first_name: 'Jane', last_name: 'Doe', company: 'Example' }] });
  assert.notEqual(ok.isError, true, JSON.stringify(ok));
  assert.deepEqual(sent(api), [{ find: 'person', subjects: [{ first_name: 'Jane', last_name: 'Doe', company: 'Example' }], max_credits: 1000 }]);
});
