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

async function connect(t, options, session = { authType: 'api-key', firecrawlApiKey: 'fc-test' }) {
  const port = await getFreePort();
  const instance = createFirecrawlMcpServer({
    transport: 'httpStream',
    ...options,
    unstable_hooks: { authenticate: async () => session },
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
  assert.deepEqual(hints, { people_company_search: true, people_company_enrich: false });
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
  const result = await client.callTool({ name: 'people_company_enrich', arguments: { fullenrich: { people: [{ name: 'Jane Doe', company_name: 'Acme' }] } } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /fullenrich\.people\.0: needs a linkedin_url, or a name \(or first_name and last_name\) plus company_domain; has name, company_name/);
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

test('enrich refuses people and companies in one call', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const result = await client.callTool({
    name: 'people_company_enrich',
    arguments: { fullenrich: { companies: [{ domain: 'acme.example' }] }, apollo: { people: [{ email: 'ada@acme.example' }] } },
  });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /separate calls: fullenrich has companies, apollo has people/);
  assert.equal(api.calls.length, 0);
});

test('contact_fields runs the contact providers on the same people', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const result = await client.callTool({
    name: 'people_company_enrich',
    arguments: {
      contact_fields: ['work_email'],
      fullenrich: { people: [{ name: 'Ada Lovelace', company_domain: 'acme.example' }] },
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
  assert.equal(api.calls.length, 0);
});

test('max_credits refuses a call that could cost more, before any provider runs', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const people = Array.from({ length: 40 }, (_, i) => ({ linkedin_url: 'https://www.linkedin.com/in/p' + i }));
  const refused = await client.callTool({ name: 'people_company_enrich', arguments: { contact_fields: ['work_email'], fullenrich: { people } } });
  assert.equal(refused.isError, true);
  assert.match(refused.content[0].text, /could cost up to 1200 credits \(fullenrich 1200\), above max_credits 1000/);
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
  assert.match(result.content[0].text, /No provider ran successfully: apollo skipped: No filters given.*fullenrich skipped.*Example of a working call/);
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
});

test('a missing entity is inferred from the filter names', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const result = await client.callTool({ name: 'people_company_search', arguments: { apollo: { organization_num_employees_ranges: ['51,200'], organization_locations: ['Boston, US'] } } });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  assert.equal(api.calls[0].capability, 'companies/search');
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
  const [apollo, fullenrich] = result.structuredContent.providers;
  assert.match(apollo.note, /call people_company_search again/);
  assert.equal(fullenrich.status, 'error');
  assert.equal(fullenrich.retryable, true);
  assert.match(fullenrich.note, /^provider_error: We couldn’t complete this request\. Please try again later\. FullEnrich answers this way when a filter value/);
});

test('one shared person runs on every provider under its own parameter names', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const ada = { name: 'Ada Lovelace', company_domain: 'acme.example', company_name: 'Acme', linkedin_url: 'https://www.linkedin.com/in/ada' };
  const result = await client.callTool({
    name: 'people_company_enrich',
    arguments: { fullenrich: { people: [ada] }, apollo: { people: [ada] }, people_data_labs: { people: [ada] }, datalegion: { people: [ada] } },
  });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  const options = Object.fromEntries(api.calls.map((call) => [call.provider, call.options]));
  assert.deepEqual(options.fullenrich, { person_professional_network_url: ada.linkedin_url, person_name: 'Ada Lovelace', company_domain: 'acme.example' });
  assert.deepEqual(options.apollo.details, [{ linkedin_url: ada.linkedin_url, name: 'Ada Lovelace', domain: 'acme.example', organization_name: 'Acme' }]);
  assert.deepEqual(options['people-data-labs'].requests[0].params, { profile: ada.linkedin_url, name: 'Ada Lovelace', company: 'acme.example' });
  assert.equal(options.datalegion.social_url, ada.linkedin_url);
  assert.equal(options.datalegion.company, 'Acme');

  const company = await client.callTool({ name: 'people_company_enrich', arguments: { people_data_labs: { companies: [{ domain: 'acme.example', name: 'Acme' }] } } });
  assert.notEqual(company.isError, true, JSON.stringify(company));
  assert.equal(api.calls.at(-1).options.website, 'acme.example');
});

test('Apollo runs a contact lookup only for the fields it has, and keeps only matches that carry them', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const mobile = await client.callTool({ name: 'people_company_enrich', arguments: { contact_fields: ['mobile'], apollo: { people: [{ email: 'ada@acme.example' }] } } });
  assert.equal(mobile.isError, true);
  assert.match(mobile.content[0].text, /No provider ran successfully: apollo skipped: Apollo has no mobile lookup/);
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
  const person = Object.keys(enrich.inputSchema.properties.fullenrich.properties.people.items.properties);
  assert.deepEqual(person, ['linkedin_url', 'email', 'name', 'first_name', 'last_name', 'company_domain', 'company_name', 'apollo_id', 'pdl_id', 'legion_id']);
  assert.match(enrich.inputSchema.properties.fullenrich.description, /Each person needs a linkedin_url, or a name/);
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
          { name: 'Pending Person', company_domain: 'acme.example' },
          { name: 'Unread Person', company_domain: 'acme.example' },
          { name: 'Parked Person', company_domain: 'acme.example' },
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

test('enrich shape errors carry an example built from the call', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const mixed = await client.callTool({
    name: 'people_company_enrich',
    arguments: { fullenrich: { people: [{ linkedin_url: 'https://www.linkedin.com/in/ada' }] }, apollo: { companies: [{ domain: 'acme.example' }] } },
  });
  assert.equal(mixed.isError, true);
  assert.match(mixed.content[0].text, /separate calls.*Example calls: \{"fullenrich":\{"people".*then \{"apollo":\{"companies"/);
  const contact = await client.callTool({ name: 'people_company_enrich', arguments: { contact_fields: ['work_email'], fullenrich: { companies: [{ domain: 'acme.example' }] } } });
  assert.equal(contact.isError, true);
  assert.match(contact.content[0].text, /people only.*Example: \{"fullenrich":\{"companies":\[\{"domain":"acme.example"\}\]\}\}/);
  const none = await client.callTool({ name: 'people_company_enrich', arguments: {} });
  assert.match(none.content[0].text, /No provider given.*Example: \{/);
  assert.equal(api.calls.length, 0);
});

test('a DataLegion person needs an identifier or a full name with context', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  for (const person of [{ name: 'Ada Lovelace' }, { first_name: 'Ada', last_name: 'Lovelace' }, { first_name: 'Ada', company_name: 'Acme' }]) {
    const result = await client.callTool({ name: 'people_company_enrich', arguments: { datalegion: { people: [person] } } });
    assert.equal(result.isError, true, JSON.stringify(person));
    assert.match(result.content[0].text, /datalegion\.people\.0: needs a legion_id, linkedin_url or email/);
  }
  const ok = await client.callTool({ name: 'people_company_enrich', arguments: { datalegion: { people: [{ first_name: 'Ada', last_name: 'Lovelace', company_name: 'Acme' }] } } });
  assert.notEqual(ok.isError, true, JSON.stringify(ok));
  assert.deepEqual(api.calls.map((call) => call.options.company), ['Acme']);
});
