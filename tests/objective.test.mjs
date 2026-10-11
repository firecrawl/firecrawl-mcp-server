// The `objective` field: which tools take it, what reaches the Firecrawl API,
// what tool-call events report, and the OBJECTIVE_REQUIRED check.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createFirecrawlMcpServer } from '../dist/server.js';
import { getFreePort, parseSseJson } from './helpers/exchange-mcp.mjs';

const ENDPOINT = '/mcp';
const OBJECTIVE = 'Compare pricing of three CRM tools for a small team';
const SEARCH_ID = '00000000-0000-4000-8000-000000000001';
const SCRAPE_ID = '00000000-0000-4000-8000-000000000002';
const OBJECTIVE_TOOLS = ['firecrawl_search', 'firecrawl_scrape', 'firecrawl_find_tools'];

async function startFakeApi(t) {
  const requests = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    req.setEncoding('utf8');
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : undefined;
    requests.push({ method: req.method, url: req.url, headers: req.headers, body });
    const json = (payload) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    };
    if (req.url === '/v2/search') {
      return json({ success: true, data: { web: [] }, id: SEARCH_ID });
    }
    if (req.url?.startsWith('/exchange/discover')) {
      return json({ success: true, cohorts: [{ cohort: 'finance', about: 'Financial data' }] });
    }
    if (req.url === '/v2/scrape' && body?.alexandria) {
      return json({
        success: true,
        data: {
          creditsCost: 0,
          alexandria: [
            {
              provider: body.alexandria.provider,
              capability: body.alexandria.capability,
              creditsCost: 0,
              data: { level: 'tools', items: [], total: 0 },
            },
          ],
        },
      });
    }
    if (req.url === '/v2/scrape') {
      return json({
        success: true,
        data: { markdown: '# hi', metadata: { scrapeId: SCRAPE_ID } },
      });
    }
    if (req.url?.startsWith('/v2/map')) {
      return json({ success: true, links: [] });
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ success: false }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { url: `http://127.0.0.1:${server.address().port}`, requests };
}

async function startEmbedded(t, { objective } = {}) {
  const api = await startFakeApi(t);
  const events = [];
  const port = await getFreePort();
  const instance = createFirecrawlMcpServer({
    transport: 'httpStream',
    apiUrl: api.url,
    apiKey: 'fc-objective-test',
    ...(objective ? { objective } : {}),
    unstable_hooks: { onToolResult: (event) => events.push(event) },
  });
  await instance.start({
    transportType: 'httpStream',
    httpStream: { port, host: '127.0.0.1', endpoint: ENDPOINT, stateless: true },
  });
  t.after(() => instance.stop());

  async function rpc(method, params = {}) {
    const response = await fetch(`http://127.0.0.1:${port}${ENDPOINT}`, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ id: 1, jsonrpc: '2.0', method, params }),
    });
    assert.equal(response.status, 200, `${method} returned ${response.status}`);
    return parseSseJson(await response.text());
  }

  return {
    api,
    events,
    listTools: async () => (await rpc('tools/list')).result.tools,
    callTool: async (name, args) => (await rpc('tools/call', { name, arguments: args })).result,
  };
}

const eventsFor = (events, tool) => events.filter((event) => event.tool === tool);

test('search, scrape and find_tools take an optional objective; other tools do not', async (t) => {
  const { listTools } = await startEmbedded(t);
  const tools = new Map((await listTools()).map((tool) => [tool.name, tool]));
  for (const name of OBJECTIVE_TOOLS) {
    const schema = tools.get(name).inputSchema;
    assert.equal(schema.properties.objective.type, 'string', name);
    assert.ok(!(schema.required ?? []).includes('objective'), name);
  }
  assert.equal(tools.get('firecrawl_scrape').inputSchema.properties.objective.maxLength, 1000);
  assert.equal(tools.get('firecrawl_find_tools').inputSchema.properties.objective.maxLength, 1000);
  assert.equal(tools.get('firecrawl_search').inputSchema.properties.objective.maxLength, 5000);
  for (const [name, tool] of tools) {
    if (OBJECTIVE_TOOLS.includes(name) || name === 'firecrawl_feedback') continue;
    assert.equal(tool.inputSchema.properties?.objective, undefined, name);
  }
});

test('scrape keeps objective from the API and reports it with the scrape ID', async (t) => {
  const { api, events, callTool } = await startEmbedded(t);
  const result = await callTool('firecrawl_scrape', {
    url: 'https://example.com',
    objective: `  ${OBJECTIVE}  `,
  });
  assert.notEqual(result.isError, true, JSON.stringify(result));

  const scrape = api.requests.find((request) => request.url === '/v2/scrape');
  assert.equal(scrape.body.url, 'https://example.com');
  assert.equal('objective' in scrape.body, false);

  const [started, success] = eventsFor(events, 'firecrawl_scrape');
  assert.equal(started.status, 'started');
  assert.equal(started.objective, OBJECTIVE);
  assert.equal(started.apiJobId, undefined);
  assert.equal(success.status, 'success');
  assert.equal(success.objective, OBJECTIVE);
  assert.equal(success.apiJobId, SCRAPE_ID);
});

test('search still forwards objective to the API and reports it with the search ID', async (t) => {
  const { api, events, callTool } = await startEmbedded(t);
  const result = await callTool('firecrawl_search', {
    query: 'crm pricing',
    sources: ['web'],
    objective: OBJECTIVE,
  });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  const search = api.requests.find((request) => request.url === '/v2/search');
  assert.equal(search.body.objective, OBJECTIVE);
  const success = eventsFor(events, 'firecrawl_search').find((event) => event.status === 'success');
  assert.equal(success.objective, OBJECTIVE);
  assert.equal(success.apiJobId, SEARCH_ID);
});

test('Alexandria scrape accepts objective, keeps it from the API, and reports the request ID', async (t) => {
  const { api, events, callTool } = await startEmbedded(t);
  const result = await callTool('firecrawl_scrape', {
    alexandria: { provider: 'fred', capability: 'series/observations', options: {} },
    requestId: 'objective-test-request',
    objective: OBJECTIVE,
  });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  const scrape = api.requests.find((request) => request.url === '/v2/scrape');
  assert.equal(scrape.headers['x-request-id'], 'objective-test-request');
  assert.equal('objective' in scrape.body, false);
  const success = eventsFor(events, 'firecrawl_scrape').find((event) => event.status === 'success');
  assert.equal(success.objective, OBJECTIVE);
  assert.equal(success.apiJobId, 'objective-test-request');
});

test('find_tools keeps objective from the API and reports the discovery or MCP request ID', async (t) => {
  const { api, events, callTool } = await startEmbedded(t);

  const browse = await callTool('firecrawl_find_tools', { objective: OBJECTIVE });
  assert.notEqual(browse.isError, true, JSON.stringify(browse));
  const discover = api.requests.find((request) => request.url.startsWith('/exchange/discover'));
  assert.equal(discover.url.includes('objective'), false);
  const browsed = eventsFor(events, 'firecrawl_find_tools').find((event) => event.status === 'success');
  assert.equal(browsed.objective, OBJECTIVE);
  assert.equal(browsed.apiJobId, browsed.requestId);

  events.length = 0;
  const lookup = await callTool('firecrawl_find_tools', { query: 'inflation series', objective: OBJECTIVE });
  assert.notEqual(lookup.isError, true, JSON.stringify(lookup));
  const scrape = api.requests.find((request) => request.url === '/v2/scrape');
  assert.equal(scrape.body.alexandria.options.query, 'inflation series');
  assert.equal(JSON.stringify(scrape.body).includes('objective'), false);
  const looked = eventsFor(events, 'firecrawl_find_tools').find((event) => event.status === 'success');
  assert.equal(looked.objective, OBJECTIVE);
  assert.equal(looked.apiJobId, scrape.headers['x-request-id']);
});

test('a call that requests zero data retention does not report its objective', async (t) => {
  const { events, callTool } = await startEmbedded(t);
  await callTool('firecrawl_scrape', {
    url: 'https://example.com',
    zeroDataRetention: true,
    objective: OBJECTIVE,
  });
  await callTool('firecrawl_search', {
    query: 'crm pricing',
    sources: ['web'],
    enterprise: ['zdr'],
    objective: OBJECTIVE,
  });
  await callTool('firecrawl_search', {
    query: 'crm pricing',
    sources: ['web'],
    enterprise: ['anon'],
    objective: OBJECTIVE,
  });
  assert.equal(events.length, 6);
  for (const event of events) assert.equal('objective' in event, false, event.tool);
});

test('required mode requires objective on search, scrape and find_tools only', async (t) => {
  const { listTools } = await startEmbedded(t, { objective: 'required' });
  const tools = new Map((await listTools()).map((tool) => [tool.name, tool]));
  for (const name of OBJECTIVE_TOOLS) {
    assert.ok(tools.get(name).inputSchema.required.includes('objective'), name);
  }
  assert.equal(tools.get('firecrawl_map').inputSchema.properties.objective, undefined);
});

test('required mode answers a missing or blank objective with OBJECTIVE_REQUIRED before any API call', async (t) => {
  const { api, events, callTool } = await startEmbedded(t, { objective: 'required' });
  const calls = [
    ['firecrawl_scrape', { url: 'https://example.com' }],
    ['firecrawl_scrape', { url: 'https://example.com', objective: '   ' }],
    ['firecrawl_search', { query: 'crm pricing' }],
    ['firecrawl_find_tools', {}],
  ];
  for (const [name, args] of calls) {
    const result = await callTool(name, args);
    assert.equal(result.isError, true, name);
    assert.equal(result.structuredContent.code, 'OBJECTIVE_REQUIRED', name);
    assert.match(result.content[0].text, new RegExp(`^${name} requires objective`));
  }
  assert.equal(api.requests.length, 0);
  assert.equal(events.length, 0);

  const ok = await callTool('firecrawl_scrape', { url: 'https://example.com', objective: OBJECTIVE });
  assert.notEqual(ok.isError, true, JSON.stringify(ok));
  const map = await callTool('firecrawl_map', { url: 'https://example.com' });
  assert.notEqual(map.isError, true, JSON.stringify(map));
});
