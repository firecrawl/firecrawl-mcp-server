import assert from 'node:assert/strict';
import test from 'node:test';
import { createFirecrawlMcpServer } from '../dist/server.js';
import { startFakeExchangeApi } from './helpers/exchange-api.mjs';
import { callExpectingError, getFreePort, parseSseJson, startStdioWithApi } from './helpers/exchange-mcp.mjs';

const call = (client, name, args) => client.request('tools/call', { name, arguments: args });
const library = (client, command) => call(client, 'alexandria_library_search', { command });
const sent = (api, capability) => api.requests.filter((request) => request.body?.alexandria?.capability === capability);
const lookups = (api) => sent(api, 'find-tools');

// What a ranked lookup among the skills answers: one line per skill, no source in it.
const RANKED = '/library/skills/firecrawl/freshly-funded-hiring-shortlist/SKILL.md\t[firecrawl]\tFreshly funded hiring shortlist: Use when a recruiter wants companies that just raised money.';
const skillsOutput = (stdout = RANKED + '\n', exitCode = 0) => ({ library: { provider: 'firecrawl', capability: 'library', creditsCost: 0, data: { stdout, stderr: '', exitCode, catalogueVersion: 'v1' } } });
const RERANKED = { status: 'reranked', elapsedMs: 120 };
const page = (items, reranking = RERANKED) => ({
  findTools: { provider: 'firecrawl', capability: 'find-tools', creditsCost: 0, data: { level: 'tools', mode: 'semantic', ...(reranking ? { reranking } : {}), items, total: items.length } },
});
const tool = (provider, capability, name, description, extra = {}) => ({ id: provider + '/' + capability, provider, capability, name, description, options: [], similarity: 0.5, ...extra });
const ROUNDS = tool('fundingdata', 'rounds/list', 'Funding rounds', 'Funding rounds of one company, newest first.', {
  requiresOneOf: [['domain', 'company_name']],
  options: [{ name: 'domain', type: 'string', in: 'body' }, { name: 'company_name', type: 'string', in: 'body' }, { name: 'limit', type: 'number', default: 25 }],
});
const TRENDING = tool('fundingdata', 'rounds/trending', 'Trending rounds', 'Rounds announced this week.', { options: [{ name: 'limit', type: 'number' }] });
const HISTORY = tool('marketdata', 'equities/history', 'Price history', 'Daily bars for one symbol.', {
  options: [{ name: 'symbol', type: 'string', required: true }, { name: 'interval', type: 'string', required: true, oneOf: ['1d', '1wk', '1mo'] }, { name: 'range', type: 'string' }],
});
const LAST_RESORT = { id: 'firecrawl/report-missing-data', provider: 'firecrawl', capability: 'report-missing-data', name: 'Report missing data', description: 'Say what was missing.', options: [], lastResort: true };
const HEADER =
  '[sources] Library data sources that match this lookup. Each returns typed, sourced records in one call: if the task needs that data, send the call to alexandria_library_read (replace each <...>; ' +
  '`cat /library/*/<provider>/<capability>.md` shows the full contract) rather than collecting it from web pages. Leave them if none fits.';
const ROUNDS_LINE = '- Funding rounds (fundingdata): Funding rounds of one company, newest first. Call: {"calls":[{"provider":"fundingdata","capability":"rounds/list","options":{"domain":"<string; or send company_name instead>"}}]}';
const TRENDING_LINE = '- Trending rounds (fundingdata): Rounds announced this week. Call: {"calls":[{"provider":"fundingdata","capability":"rounds/trending","options":{}}]}';
const SEARCH = 'cat /library/skills/search/company-funding-rounds';
const written = (text) => text.split('\n').filter((line) => line.startsWith('- ')).map((line) => JSON.parse(line.slice(line.indexOf(' Call: ') + 7)));

test('a lookup among the skills lists the sources that match its words under its output, each with its call', async (t) => {
  const { api, client } = await startStdioWithApi(t, { ...skillsOutput(), ...page([ROUNDS, TRENDING]) });
  const result = await library(client, SEARCH);
  assert.notEqual(result.isError, true, JSON.stringify(result));
  const block = [HEADER, ROUNDS_LINE, TRENDING_LINE].join('\n');
  assert.equal(result.content[0].text, RANKED + '\n\n' + block);
  // The command's own output is untouched; the block travels in the field the output schema already has.
  assert.equal(result.structuredContent.stdout, RANKED + '\n');
  assert.equal(result.structuredContent.exitCode, 0);
  assert.equal(result.structuredContent.message, block);
  // One free catalogue lookup, asked with the lookup's words only; the command goes out unchanged.
  assert.deepEqual(lookups(api).map((request) => request.body.alexandria), [
    { provider: 'firecrawl', capability: 'find-tools', options: { query: 'company funding rounds', level: 'tools', expand: ['options'], limit: 3 } },
  ]);
  assert.deepEqual(sent(api, 'library').map((request) => request.body.alexandria.options), [{ command: SEARCH }]);
  assert.equal(sent(api, 'find-skills').length, 0);
});

test('a written call is accepted by alexandria_library_read as it stands', async (t) => {
  const { api, client } = await startStdioWithApi(t, { ...skillsOutput(), ...page([TRENDING]) });
  const [args] = written((await library(client, SEARCH)).content[0].text);
  assert.deepEqual(args, { calls: [{ provider: 'fundingdata', capability: 'rounds/trending', options: {} }] });
  const read = await call(client, 'alexandria_library_read', args);
  assert.notEqual(read.isError, true, JSON.stringify(read));
  assert.deepEqual(api.requests.at(-1).body.alexandria, args.calls);
});

test('a call carries the inputs the contract requires as placeholders, and no optional input', async (t) => {
  const { client } = await startStdioWithApi(t, { ...skillsOutput(), ...page([HISTORY, ROUNDS, tool('marketdata', 'equities/quote', '', 'Latest price.', { requiresOneOf: [['symbol', 'isin']], options: [{ name: 'symbol', type: 'string', required: true }, { name: 'isin', type: 'string' }] })]) });
  const text = (await library(client, 'cat /library/skills/search/stock-price-history')).content[0].text;
  assert.deepEqual(written(text), [
    { calls: [{ provider: 'marketdata', capability: 'equities/history', options: { symbol: '<string>', interval: '<1d|1wk|1mo>' } }] },
    { calls: [{ provider: 'fundingdata', capability: 'rounds/list', options: { domain: '<string; or send company_name instead>' } }] },
    // A group one of whose members is already required adds no second placeholder.
    { calls: [{ provider: 'marketdata', capability: 'equities/quote', options: { symbol: '<string>' } }] },
  ]);
  // A source without a name is listed by its address.
  assert.match(text, /\n- marketdata\/equities\/quote: Latest price\. Call: /);
});

test('a written call never carries an example or default value: every input is a blank named by its key', async (t) => {
  // A contract as full as the catalogue can return it, with example and default values on every level.
  const flights = tool('faredata', 'flights/search', 'Search flights', 'Fares between two airports.', {
    requiresOneOf: [['departure_date', 'month']],
    example: { request: { origin: 'JFK', destination: 'LAX', departure_date: '2026-01-15' }, response: { fares: [{ price: 199 }] } },
    examples: [{ origin: 'JFK', destination: 'LAX' }],
    options: [
      { name: 'origin', type: 'string', required: true, example: 'JFK', default: 'JFK', about: 'IATA code, e.g. JFK.' },
      { name: 'destination', type: 'string', required: true, example: 'LAX', examples: ['LAX', 'SFO'] },
      { name: 'departure_date', type: 'string', example: '2026-01-15' },
      { name: 'month', type: 'string', example: '2026-01' },
      { name: 'cabin', type: 'string', default: 'economy', oneOf: ['economy', 'business'] },
    ],
  });
  const { api, client } = await startStdioWithApi(t, { ...skillsOutput(), ...page([flights]) });
  const text = (await library(client, 'cat /library/skills/search/flight-prices-manchester-lahore')).content[0].text;
  assert.deepEqual(written(text), [
    { calls: [{ provider: 'faredata', capability: 'flights/search', options: { origin: '<string>', destination: '<string>', departure_date: '<string; or send month instead>' } }] },
  ]);
  const block = text.slice(text.indexOf('[sources]'));
  for (const value of ['JFK', 'LAX', 'SFO', '2026-01', 'economy', '199']) assert.ok(!block.includes(value), value);
  // Nor is a blank filled from the lookup's own words.
  for (const word of ['manchester', 'lahore']) assert.ok(!block.toLowerCase().includes(word), word);
  // Example payloads are not asked for in the first place.
  assert.deepEqual(lookups(api)[0].body.alexandria.options.expand, ['options']);
});

test('the block lists three sources at most, in the order the catalogue ranked them, and cuts a long description', async (t) => {
  const long = 'Reported figures by period as filed. '.repeat(12).trim();
  const { client } = await startStdioWithApi(t, { ...skillsOutput(), ...page([tool('a', 'one/get', 'One', long), TRENDING, LAST_RESORT, ROUNDS, HISTORY]) });
  const text = (await library(client, SEARCH)).content[0].text;
  assert.deepEqual(written(text).map((args) => args.calls[0].provider + '/' + args.calls[0].capability), ['a/one/get', 'fundingdata/rounds/trending', 'fundingdata/rounds/list']);
  const first = text.split('\n').find((line) => line.startsWith('- One (a): '));
  const about = first.slice('- One (a): '.length, first.indexOf(' Call: '));
  assert.ok(about.length <= 201 && about.endsWith('…') && long.startsWith(about.slice(0, -1)), about);
});

test('job, people and company sources come with the line that points to the tools for them', async (t) => {
  const jobs = tool('jobboard', 'jobs/search', 'Search jobs', 'Postings by keyword.', { options: [{ name: 'query', type: 'string' }] });
  const { client } = await startStdioWithApi(t, { ...skillsOutput(), ...page([jobs]) });
  const lines = (await library(client, 'cat /library/skills/search/job-postings-data-engineer')).content[0].text.split('\n');
  assert.match(lines.at(-1), /^For people and company enrichment or search, use people_company_enrich or people_company_search when they are listed, and for job postings use jobs_search when it is listed; /);
  for (const capability of ['people/search', 'contact/work-email', 'companies/search', 'company/enrich']) {
    const typed = await startStdioWithApi(t, { ...skillsOutput(), ...page([TRENDING, tool('b2bdata', capability, 'B2B', 'Records.')]) });
    assert.match((await library(typed.client, SEARCH)).content[0].text, /\nFor people and company enrichment or search, use people_company_enrich /, capability);
  }
  // Other company data, such as funding rounds, has no tool of its own and gets no such line.
  const other = await startStdioWithApi(t, { ...skillsOutput(), ...page([TRENDING, tool('fundingdata', 'companies/funding-rounds', 'Funding rounds', 'Round history.')]) });
  assert.doesNotMatch((await library(other.client, SEARCH)).content[0].text, /jobs_search/);
});

test('grep and ls among the skills are lookups too, with the folder names left out of the words', async (t) => {
  const { api, client } = await startStdioWithApi(t, { ...skillsOutput('', 1), ...page([TRENDING]) });
  const block = [HEADER, TRENDING_LINE].join('\n');
  // grep found no skill: the sources are all the answer has.
  const none = await library(client, 'grep -i "funding rounds" /library/skills/INDEX');
  assert.equal(none.content[0].text, '[no output; exit code 1]\n\n' + block);
  assert.equal(none.structuredContent.exitCode, 1);
  await library(client, 'ls /library/skills/firecrawl | grep -i funding-rounds');
  await library(client, 'cd /library/skills && grep -ril "venture funding" .');
  await library(client, 'cat /library/skills/search/jobs');
  assert.deepEqual(lookups(api).map((request) => request.body.alexandria.options.query), ['funding rounds', 'funding rounds', 'venture funding', 'jobs']);
});

test('nothing is added unless the catalogue reranker picked a source', async (t) => {
  for (const options of [
    page([ROUNDS], { status: 'abstained', elapsedMs: 140, ranker: 'semantic_fallback' }),
    page([ROUNDS], { status: 'fallback', reason: 'timeout', elapsedMs: 800, ranker: 'semantic_fallback' }),
    page([ROUNDS], { status: 'disabled', elapsedMs: 0 }),
    page([ROUNDS], null),
    page([]),
    page([LAST_RESORT]),
    { findTools: 'fail' },
    { findTools: { provider: 'firecrawl', capability: 'find-tools', error: { code: 'invalid_option', message: 'find-tools does not take expand.' } } },
    // A server that answers find-tools without reranking, as the default fixture does.
    {},
  ]) {
    const { api, client } = await startStdioWithApi(t, { ...skillsOutput(), ...options });
    const result = await library(client, SEARCH);
    assert.notEqual(result.isError, true, JSON.stringify(options));
    assert.equal(result.content[0].text, RANKED, JSON.stringify(options));
    assert.equal(result.structuredContent.message, undefined, JSON.stringify(options));
    assert.equal(lookups(api).length, 1);
  }
});

test('every other library command answers as before, with no source lookup', async (t) => {
  const OUTPUT = '/library/finance/fred/series/observations.md';
  const { api, client } = await startStdioWithApi(t, { ...page([ROUNDS, TRENDING]), findSkills: { provider: 'firecrawl', capability: 'find-skills', creditsCost: 0, data: { skills: [], total: 0 } } });
  for (const command of [
    // Outside the skills folder.
    'ls /library',
    'cat /library/README.md',
    'cat /library/finance/fred/series/observations.md',
    'grep -ril "company funding rounds" /library | head -20',
    'find /library/companies -name "*.md" | grep -i funding',
    'cat /examples/fred/series/observations.json',
    // Among the skills, with nothing to look up.
    'ls /library/skills',
    'ls -la /library/skills/team',
    'cat /library/skills/README.md',
    'cat /library/skills/INDEX | head -40',
    'find /library/skills -name "*.md" | wc -l',
    // One skill's own files: a read, not a lookup.
    'cat /library/skills/firecrawl/freshly-funded-hiring-shortlist/SKILL.md',
    'ls /library/skills/team/company-funding-rounds',
    'grep -i "funding rounds" /library/skills/firecrawl/freshly-funded-hiring-shortlist/references/sources.md',
    // The skills folder and another part of the library in one command.
    'grep -ril "company funding rounds" /library/skills /library/companies',
    'cat /library/skills/search/company-funding-rounds; ls /library/companies',
    'cat /library/skills/search/company-funding-rounds && cat /examples/fred/series/observations.json',
  ]) {
    const result = await library(client, command);
    assert.equal(result.content[0].text, OUTPUT, command);
    assert.deepEqual(result.structuredContent, { stdout: OUTPUT + '\n', stderr: '', exitCode: 0, catalogueVersion: 'v1' }, command);
  }
  assert.equal(lookups(api).length, 0);
  // The skills lookup that runs beside commands outside the skills folder is the one it was.
  assert.deepEqual(sent(api, 'find-skills').map((request) => request.body.alexandria.options.query), [
    'finance fred series observations',
    'company funding rounds',
    'companies funding',
    'examples fred series observations',
  ]);
});

test('the lookup answers without the block when the catalogue is slow, no later than 1.5 s after the call', async (t) => {
  const { api, client } = await startStdioWithApi(t, { ...skillsOutput(), ...page([ROUNDS]), findToolsDelayMs: 4000 });
  const started = performance.now();
  const late = await library(client, SEARCH);
  const took = performance.now() - started;
  assert.ok(took >= 1400 && took < 3000, 'took ' + Math.round(took) + ' ms');
  assert.equal(late.content[0].text, RANKED);
  assert.equal(late.structuredContent.message, undefined);
  assert.equal(lookups(api).length, 1);
});

test('a failed lookup among the skills still fails at once, whatever the source lookup does', async (t) => {
  const { client } = await startStdioWithApi(t, {
    ...page([ROUNDS]),
    findToolsDelayMs: 3000,
    library: { provider: 'firecrawl', capability: 'library', error: { code: 'library_command_timeout', message: 'The command ran past its deadline.' } },
  });
  const started = performance.now();
  const failed = await callExpectingError(client, { name: 'alexandria_library_search', arguments: { command: SEARCH } });
  assert.ok(performance.now() - started < 1000);
  assert.match(failed.content[0].text, /ran past its deadline/);
});

test('a server without the library skills asks for no sources', async (t) => {
  const { api, client } = await startStdioWithApi(t, { ...skillsOutput(), ...page([ROUNDS]), env: { FIRECRAWL_MCP_LIBRARY_SKILLS: 'false' } });
  const started = performance.now();
  const result = await library(client, SEARCH);
  assert.ok(performance.now() - started < 1000);
  assert.equal(result.content[0].text, RANKED);
  assert.equal(lookups(api).length, 0);
});

test('the librarySourceMatches hook decides per session whether a lookup lists sources', async (t) => {
  const api = await startFakeExchangeApi({ ...skillsOutput(), ...page([TRENDING]), findToolsDelayMs: 300 });
  t.after(() => api.close());
  const seen = [];
  const port = await getFreePort();
  const instance = createFirecrawlMcpServer({
    transport: 'httpStream',
    apiUrl: api.url,
    logging: false,
    unstable_hooks: {
      authenticate: async (request) => ({ authType: 'api-key', firecrawlApiKey: 'fc-test', group: request?.headers['x-group'] }),
      librarySourceMatches: (session) => {
        seen.push(session?.group);
        return session?.group === 'listed';
      },
    },
  });
  await instance.start({ transportType: 'httpStream', httpStream: { port, host: '127.0.0.1', endpoint: '/mcp', stateless: true } });
  t.after(() => instance.stop());
  const lookup = async (group, command) => {
    const response = await fetch('http://127.0.0.1:' + port + '/mcp', {
      method: 'POST',
      headers: { accept: 'application/json, text/event-stream', 'content-type': 'application/json', 'x-group': group },
      body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'tools/call', params: { name: 'alexandria_library_search', arguments: { command } } }),
    });
    assert.equal(response.status, 200);
    return parseSseJson(await response.text()).result;
  };
  const listed = await lookup('listed', SEARCH);
  assert.equal(listed.content[0].text, RANKED + '\n\n' + [HEADER, TRENDING_LINE].join('\n'));
  assert.equal(lookups(api).length, 1);

  // A session the hook turns down answers as the lookup did before: skills alone, no source lookup, no wait for one.
  const started = performance.now();
  const plain = await lookup('plain', SEARCH);
  assert.ok(performance.now() - started < 250, 'took ' + Math.round(performance.now() - started) + ' ms');
  assert.equal(plain.content[0].text, RANKED);
  assert.equal(plain.structuredContent.message, undefined);
  assert.equal(lookups(api).length, 1);
  assert.equal(sent(api, 'find-skills').length, 0);

  // The hook is asked about lookups among the skills only.
  await lookup('listed', 'ls /library');
  await lookup('listed', 'cat /library/skills/firecrawl/freshly-funded-hiring-shortlist/SKILL.md');
  assert.deepEqual(seen, ['listed', 'plain']);
});

test('adding the sources changes no tool definition: alexandria_library_search lists the same input and output', async (t) => {
  const { client } = await startStdioWithApi(t);
  const { tools } = await client.request('tools/list', {});
  const search = tools.find((entry) => entry.name === 'alexandria_library_search');
  assert.deepEqual(Object.keys(search.inputSchema.properties), ['command']);
  assert.deepEqual(Object.keys(search.outputSchema.properties).sort(), ['catalogueVersion', 'error', 'exitCode', 'message', 'requestId', 'stderr', 'stdout', 'success', 'truncated']);
});
