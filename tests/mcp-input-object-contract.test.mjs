import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/client/validators/ajv';
import { createFirecrawlMcpServer } from '../dist/server.js';
import { getFreePort } from './helpers/exchange-mcp.mjs';

// Validate the schema published to real clients, then exercise the same input
// through tools/call. Only the downstream HTTP API is replaced.
const extraction = {
  type: 'object',
  required: ['title'],
  properties: { title: { type: 'string' } },
};
const scrapeArgs = {
  url: 'https://example.com/fixture',
  formats: ['json'],
  jsonOptions: { schema: extraction },
};
const monitorBody = {
  name: 'fixture-name',
  targets: [{ type: 'scrape', urls: ['https://example.com/fixture'] }],
  judging: { enabled: true, metadata: null },
};

async function connect(t) {
  const requests = [];
  const api = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : null;
    requests.push({ method: req.method, path: req.url, body });
    const data = req.url.startsWith('/v2/monitor')
      ? { id: 'fixture-monitor', ...body }
      : { markdown: '# fixture', json: { title: 'fixture' } };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ success: true, data }));
  });
  await new Promise((resolve) => api.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => api.close(resolve)));

  const port = await getFreePort();
  const instance = createFirecrawlMcpServer({
    transport: 'httpStream',
    apiUrl: `http://127.0.0.1:${api.address().port}`,
    unstable_hooks: {
      authenticate: async () => ({
        authType: 'api-key',
        firecrawlApiKey: 'fc-contract-fixture',
      }),
    },
  });
  await instance.start({
    transportType: 'httpStream',
    httpStream: { port, host: '127.0.0.1', endpoint: '/mcp', stateless: true },
  });
  t.after(() => instance.stop());
  const client = new Client({ name: 'input-contract-test', version: '1.0.0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`))
  );
  t.after(() => client.close());
  const { tools } = await client.listTools();
  const schemas = new AjvJsonSchemaValidator();
  const validators = new Map(tools.map((tool) => [
    tool.name, schemas.getValidator(tool.inputSchema),
  ]));
  return { client, requests, validate: (name, args) => validators.get(name)(args) };
}

test('published extraction schema accepts a nonempty object and forwards it once', async (t) => {
  const { client, requests, validate } = await connect(t);
  const checked = validate('firecrawl_scrape', scrapeArgs);
  assert.equal(checked.valid, true, checked.errorMessage);
  const result = await client.callTool({ name: 'firecrawl_scrape', arguments: scrapeArgs });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].path, '/v2/scrape');
  assert.deepEqual(requests[0].body.formats[0].schema, extraction);
});

for (const [name, method, path, args] of [
  ['firecrawl_monitor_create', 'POST', '/v2/monitor', { body: monitorBody }],
  ['firecrawl_monitor_update', 'PATCH', '/v2/monitor/fixture-monitor', {
    id: 'fixture-monitor', body: monitorBody,
  }],
]) {
  test(`${name} accepts and forwards a nonempty body exactly once`, async (t) => {
    const { client, requests, validate } = await connect(t);
    const checked = validate(name, args);
    assert.equal(checked.valid, true, checked.errorMessage);
    const result = await client.callTool({ name, arguments: args });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    assert.deepEqual(requests, [{ method, path, body: monitorBody }]);
  });
}

test('nonobject records fail preflight and runtime without downstream HTTP calls', async (t) => {
  const { client, requests, validate } = await connect(t);
  for (const value of [null, ['not-an-object'], 42, true]) {
    for (const [name, args] of [
      ['firecrawl_scrape', { ...scrapeArgs, jsonOptions: { schema: value } }],
      ['firecrawl_monitor_create', { body: value }],
      ['firecrawl_monitor_update', { id: 'fixture-monitor', body: value }],
    ]) {
      // Optional nulls are intentionally normalized to omitted fields.
      // Required monitor_update.body must still reject null as a nonobject.
      if (value === null && name !== 'firecrawl_monitor_update') continue;
      assert.equal(validate(name, args).valid, false, `${name}: ${JSON.stringify(value)}`);
      // Bypass our preflight to verify the server also rejects the input.
      await assert.rejects(
        client.callTool({ name, arguments: args }),
        { code: -32602, message: /parameter validation failed/ }
      );
      assert.deepEqual(requests, [], `${name} must fail before contacting the API`);
    }
  }
});

test('published ordinary parameter objects reject unknown properties', async (t) => {
  const { validate, requests } = await connect(t);
  for (const args of [
    { url: 'https://example.com', unexpected: true },
    { url: 'https://example.com', jsonOptions: { unexpected: true } },
    { url: 'https://example.com', location: { country: 'US', unexpected: true } },
  ]) {
    assert.equal(validate('firecrawl_scrape', args).valid, false);
  }
  assert.deepEqual(requests, []);
});

test('published string records accept arbitrary keys but retain value constraints', async (t) => {
  const { validate, requests } = await connect(t);
  const args = { url: 'https://example.com', webhookHeaders: { 'x-fixture': 'yes' } };
  const checked = validate('firecrawl_crawl', args);
  assert.equal(checked.valid, true, checked.errorMessage);
  assert.equal(validate('firecrawl_crawl', {
    ...args, webhookHeaders: { 'x-fixture': 2 },
  }).valid, false);
  assert.deepEqual(requests, []);
});
