// A tool's output schema is listed with additionalProperties: false on the result and on every object
// that is a direct property of it. A client built on the official SDK checks each result against the
// schema it listed and refuses the whole call on a key that schema does not allow, so a tool must not
// keep such a key in structured content.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createFirecrawlMcpServer } from '../dist/server.js';
import { getFreePort } from './helpers/exchange-mcp.mjs';

async function connect(t, { apiUrl, wrapTool } = {}) {
  const port = await getFreePort();
  const instance = createFirecrawlMcpServer({
    transport: 'httpStream',
    apiUrl,
    unstable_hooks: { authenticate: async () => ({ authType: 'api-key', firecrawlApiKey: 'fc-test' }), wrapTool },
  });
  await instance.start({ transportType: 'httpStream', httpStream: { port, host: '127.0.0.1', endpoint: '/mcp', stateless: true } });
  t.after(() => instance.stop());
  const client = new Client({ name: 'output-schema-keys-test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:' + port + '/mcp')));
  t.after(() => client.close());
  const { tools } = await client.listTools();
  return { client, tools };
}

const objectDef = (schema) => {
  let def = schema?._zod?.def;
  while (def && ['optional', 'nullable', 'default'].includes(def.type)) def = def.innerType?._zod?.def;
  return def?.type === 'object' ? def : undefined;
};

/** Paths where the listed schema refuses unnamed keys and the schema the server parses results with keeps them. */
function keptKeys(listed, schema, path = '') {
  const def = objectDef(schema);
  const node = listed?.anyOf?.find((member) => member.type === 'object') ?? listed;
  if (!def || node?.type !== 'object') return [];
  const keeps = def.catchall !== undefined && def.catchall._zod.def.type !== 'never';
  return [
    ...(node.additionalProperties === false && keeps ? [path || '(top level)'] : []),
    ...Object.entries(def.shape).flatMap(([key, child]) => keptKeys(node.properties?.[key], child, path ? path + '.' + key : key)),
  ];
}

test('no tool keeps a key in structured content that its listed output schema refuses', async (t) => {
  const registered = new Map();
  const { tools } = await connect(t, { wrapTool: (tool) => (registered.set(tool.name, tool), tool) });
  const checked = tools.filter((tool) => registered.get(tool.name)?.outputSchema);
  assert.ok(checked.length > 30, 'checked ' + checked.length + ' tools');
  const kept = checked.flatMap((tool) => keptKeys(tool.outputSchema, registered.get(tool.name).outputSchema).map((path) => tool.name + ': ' + path));
  assert.deepEqual(kept, []);
});

test('a paper field the schema does not name is left out of structured content', async (t) => {
  const paper = { paperId: 'arxiv:1706.03762', primaryId: 'arxiv:1706.03762', title: 'Attention Is All You Need' };
  const api = createServer(async (req, res) => {
    for await (const _chunk of req);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ success: true, paper: { ...paper, venue: 'NeurIPS' } }));
  });
  await new Promise((resolve) => api.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => api.close(resolve)));
  const { client } = await connect(t, { apiUrl: 'http://127.0.0.1:' + api.address().port });
  const result = await client.callTool({ name: 'firecrawl_research_inspect_paper', arguments: { paperId: paper.paperId } });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  assert.deepEqual(result.structuredContent, { paper });
  assert.match(result.content[0].text, /Attention Is All You Need/);
});
