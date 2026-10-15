import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import { startStdio, callExpectingError } from './helpers/exchange-mcp.mjs';

// Exercise real tools/list and its first consumer, schema-validating clients.
// Only the external HTTP service is replaced; no Firecrawl tool/schema is mocked.
const extraction = {
  type: 'object', required: ['title'],
  properties: { title: { type: 'string' } },
};
const scrapeArgs = {
  url: 'https://example.com/fixture', formats: ['json'],
  jsonOptions: { schema: extraction },
};
const monitorArgs = { id: 'fixture-monitor', body: { name: 'fixture-name' } };
const schemas = new AjvJsonSchemaValidator();
const validate = (tool, input) => schemas.getValidator(tool.inputSchema)(input);

async function realServer(t) {
  const requests = [];
  const api = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : null;
    requests.push({ method: req.method, path: req.url, body });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: req.method === 'PATCH'
      ? { id: 'fixture-monitor', ...body }
      : { markdown: '# fixture', json: { title: 'fixture' } } }));
  });
  await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => api.close(resolve)));
  const { client } = await startStdio(t, {
    CLOUD_SERVICE: 'false', FIRECRAWL_API_KEY: 'fc-contract-fixture',
    FIRECRAWL_API_URL: `http://127.0.0.1:${api.address().port}`,
  });
  const { tools } = await client.request('tools/list', {});
  return { client, requests, tools: new Map(tools.map(tool => [tool.name, tool])) };
}

test('published scrape schema admits a nonempty JSON Schema before forwarding', { timeout: 20_000 }, async t => {
  const { client, requests, tools } = await realServer(t);
  const result = validate(tools.get('firecrawl_scrape'), scrapeArgs);
  assert.equal(result.valid, true, result.errorMessage);
  const reply = await client.request('tools/call', { name: 'firecrawl_scrape', arguments: scrapeArgs });
  assert.notEqual(reply.isError, true);
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].body.formats[0].schema, extraction);
});

for (const name of ['firecrawl_monitor_create', 'firecrawl_monitor_update']) {
  test(`published ${name} body admits a nonempty object`, { timeout: 20_000 }, async t => {
    const { tools } = await realServer(t);
    const args = name.endsWith('update') ? monitorArgs : { body: { name: 'fixture-name', goal: 'fixture-goal' } };
    const result = validate(tools.get(name), args);
    assert.equal(result.valid, true, result.errorMessage);
  });
}

test('runtime scrape accepts the same extraction schema when client preflight is omitted', { timeout: 20_000 }, async t => {
  const { client, requests } = await realServer(t);
  const result = await client.request('tools/call', { name: 'firecrawl_scrape', arguments: scrapeArgs });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].path, '/v2/scrape');
  assert.deepEqual(requests[0].body.formats[0].schema, extraction);
});

test('runtime monitor update forwards the same nonempty body exactly once', { timeout: 20_000 }, async t => {
  const { client, requests } = await realServer(t);
  const result = await client.request('tools/call', { name: 'firecrawl_monitor_update', arguments: monitorArgs });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  assert.deepEqual(requests, [{ method: 'PATCH', path: '/v2/monitor/fixture-monitor', body: { name: 'fixture-name' } }]);
});

test('runtime rejects nonobject schema and monitor body without HTTP side effects', { timeout: 20_000 }, async t => {
  const { client, requests } = await realServer(t);
  for (const value of [null, ['not-an-object']]) {
    await callExpectingError(client, { name: 'firecrawl_scrape', arguments: {
      ...scrapeArgs, jsonOptions: { schema: value },
    } });
    await callExpectingError(client, { name: 'firecrawl_monitor_update', arguments: {
      ...monitorArgs, body: value,
    } });
  }
  assert.deepEqual(requests, []);
});

test('published ordinary parameter objects retain unknown-property rejection', { timeout: 20_000 }, async t => {
  const { tools } = await realServer(t);
  const scrape = tools.get('firecrawl_scrape');
  assert.equal(validate(scrape, { url: 'https://example.com', unexpected: true }).valid, false);
  assert.equal(validate(scrape, { url: 'https://example.com', jsonOptions: { unexpected: true } }).valid, false);
});

// FastMCP is bundled into the shipped CLI; cover both patched package entrypoints.
for (const format of ['esm', 'cjs']) {
  test(`${format} tools/list preserves arbitrary objects and string-map values while fixed objects stay closed`, { timeout: 20_000 }, async t => {
    const imports = format === 'esm'
      ? "import { FastMCP } from 'fastmcp'; import { z } from 'zod';"
      : "import { createRequire } from 'node:module'; const require=createRequire(import.meta.url); const {FastMCP}=require('fastmcp'); const {z}=require('zod');";
    const source = `${imports}
      const server=new FastMCP({name:'input-contract',version:'1.0.0'});
      server.addTool({name:'fixture',description:'Input schema contract',
        parameters:z.object({body:z.record(z.string(),z.any()),headers:z.record(z.string(),z.string()),options:z.object({name:z.string()})}),
        execute:async args=>JSON.stringify(args)});
      await server.start({transportType:'stdio'});`;
    const transport = new StdioClientTransport({ command: process.execPath,
      args: ['--input-type=module', '-e', source], env: { ...process.env }, stderr: 'pipe' });
    transport.stderr.on('data', () => {});
    const client = new Client({ name: 'input-contract-client', version: '1.0.0' });
    t.after(() => client.close());
    await client.connect(transport);
    const { tools } = await client.listTools();
    const tool = tools.find(x => x.name === 'fixture');
    const good = { body: { nested: { list: [1, true, null] } }, headers: { 'x-fixture': 'yes' }, options: { name: 'fixture' } };
    // These strictness/type controls run before the expected positive RED.
    const emptyValid = { body: {}, headers: {}, options: { name: 'fixture' } };
    assert.equal(validate(tool, emptyValid).valid, true);
    assert.equal(validate(tool, { ...emptyValid, options: { name: 'fixture', unexpected: true } }).valid, false);
    assert.equal(validate(tool, { ...emptyValid, headers: { 'x-fixture': 2 } }).valid, false);
    assert.equal(validate(tool, { ...emptyValid, body: [] }).valid, false);
    const accepted = validate(tool, good);
    assert.equal(accepted.valid, true, accepted.errorMessage);
    const reply = await client.callTool({ name: 'fixture', arguments: good });
    assert.notEqual(reply.isError, true);
    assert.deepEqual(JSON.parse(reply.content[0].text), good);
  });
}
