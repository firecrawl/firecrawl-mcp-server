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
  if (provider === 'firecrawl' && capability === 'search/auto') {
    if (options.filters?.technologies) return { creditsCost: 0, error: { code: 'unsupported_filters', message: 'No provider applies every filter sent. Drop or reword technologies.' } };
    const row = { name: 'Ada Lovelace', title: 'Head of Data', title_match: 'current', company_domain: 'acme.example', linkedin_url: 'https://www.linkedin.com/in/ada', source: 'leadsforge' };
    return { creditsCost: 0, data: { results: [row], count: 1, providers: [{ name: 'leadsforge', capability: 'people/search', status: 'rows', returned: 1, credits: 0 }], credits: 0 } };
  }
  return { error: { code: 'not_found', message: 'No match.' } };
}

async function startApi(t, respond) {
  const calls = [];
  const bodies = [];
  const headers = [];
  const server = createServer(async (req, res) => {
    headers.push(req.headers);
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    bodies.push(body);
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

test('conversationId and objective are accepted and not sent to providers', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const result = await client.callTool({
    name: 'people_company_search',
    arguments: { conversationId: 'c-1', objective: 'Find data leaders', entity: 'person', filters: { titles: ['Head of Data'] } },
  });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  assert.deepEqual(api.calls[0].options, { entity: 'person', filters: { titles: ['Head of Data'] } });
  assert.ok(!JSON.stringify(api.bodies).includes('c-1') && !JSON.stringify(api.bodies).includes('Find data leaders'));
});

test('near-miss shapes are repaired before validation', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const result = await client.callTool({
    name: 'people_company_search',
    arguments: { entity: 'people', filters: { titles: 'Product Manager', locations: 'Germany' }, limit: '5' },
  });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  assert.deepEqual(api.calls[0].options, { entity: 'person', filters: { titles: ['Product Manager'], locations: ['Germany'] }, limit: 5 });
});

test('an invalid argument names the field, what the block takes and an example', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const result = await client.callTool({ name: 'people_company_search', arguments: { entity: 'person', filters: { titles: ['CTO'], region: 'US' } } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /filters: unknown field region; takes titles, seniority, functions/);
  assert.match(result.content[0].text, /Example: \{"entity":"person"/);

  const seniority = await client.callTool({ name: 'people_company_search', arguments: { entity: 'person', filters: { seniority: ['cxo'] } } });
  assert.equal(seniority.isError, true);
  assert.match(seniority.content[0].text, /filters\.seniority\.0/);
  assert.equal(api.calls.length, 0);
});

const APOLLO_TERMS = { success: false, error: 'Terms required.', code: 'THIRD_PARTY_DATA_TERMS_REQUIRED', requiresAction: { type: 'accept_terms', terms: 'apollo', version: '1', url: 'https://example.com/terms' } };

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
});

test('people search sends one search/auto call with the normalized input and returns its rows and trace', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const result = await client.callTool({
    name: 'people_company_search',
    arguments: { entity: 'person', filters: { titles: ['Head of Data'], company_domains: ['acme.example'] }, limit: 5, max_credits: 50 },
  });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  assert.deepEqual(api.calls, [
    { provider: 'firecrawl', capability: 'search/auto', options: { entity: 'person', filters: { titles: ['Head of Data'], company_domains: ['acme.example'] }, limit: 5, max_credits: 50 } },
  ]);
  const data = result.structuredContent;
  assert.equal(data.results[0].source, 'leadsforge');
  assert.equal(data.providers[0].status, 'rows');
  assert.doesNotMatch(JSON.stringify(data.results), /@/);
});

test('a search refusal from the waterfall reaches the agent with its code', async (t) => {
  const api = await startApi(t);
  const events = [];
  const client = await connect(t, { apiUrl: api.url, onToolResult: (event) => events.push(event) });
  const result = await client.callTool({ name: 'people_company_search', arguments: { entity: 'person', filters: { titles: ['CTO'], technologies: ['Snowflake'] } } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /Drop or reword technologies/);
  assert.equal(events.find((event) => event.status === 'error').error.extras.code, 'unsupported_filters');
});

test('search takes a provider with its own options, and refuses options without a provider', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const passthrough = await client.callTool({ name: 'people_company_search', arguments: { entity: 'person', provider: 'prospeo', options: { filters: { person_job_title: { include: ['CTO'] } } } } });
  assert.notEqual(passthrough.isError, true, JSON.stringify(passthrough));
  assert.deepEqual(api.calls[0].options, { entity: 'person', provider: 'prospeo', options: { filters: { person_job_title: { include: ['CTO'] } } } });
  const orphan = await client.callTool({ name: 'people_company_search', arguments: { entity: 'person', options: { q: 'CTO' } } });
  assert.equal(orphan.isError, true);
  assert.match(orphan.content[0].text, /options needs provider/);
  assert.equal(api.calls.length, 1);
});

test('a missing entity is refused with an example', async (t) => {
  const api = await startApi(t);
  const client = await connect(t, { apiUrl: api.url });
  const result = await client.callTool({ name: 'people_company_search', arguments: { filters: { titles: ['CTO'] } } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /entity/);
  assert.match(result.content[0].text, /Example: \{"entity":"person"/);
  assert.equal(api.calls.length, 0);
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
