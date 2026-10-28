// The origin a call stamps on Firecrawl API requests, on the 2025 revisions
// and on protocol revision 2026-07-28, which carries the client's clientInfo
// in every request's _meta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import net from 'node:net';
import { createFirecrawlMcpServer } from '../dist/server.js';

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

async function startApi(t) {
  const origins = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const parsed = body ? JSON.parse(body) : {};
    origins.push({ header: req.headers['x-origin'], body: parsed.origin });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ success: true, data: { markdown: 'page' } }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  return { url: `http://127.0.0.1:${server.address().port}`, origins };
}

async function startEmbedded(t, apiUrl) {
  const port = await getFreePort();
  const instance = createFirecrawlMcpServer({
    transport: 'httpStream',
    modernProtocol: true,
    apiUrl,
  });
  await instance.start({
    transportType: 'httpStream',
    httpStream: { port, host: '127.0.0.1', endpoint: '/v2/mcp', stateless: true },
  });
  t.after(() => instance.stop());
  return port;
}

async function scrape(port, { userAgent, clientInfo, modern }) {
  const response = await fetch(`http://127.0.0.1:${port}/v2/mcp`, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'user-agent': userAgent,
      'x-api-key': 'fc-origin-test',
      ...(modern
        ? {
            'mcp-method': 'tools/call',
            'mcp-name': 'firecrawl_scrape',
            'mcp-protocol-version': '2026-07-28',
          }
        : {}),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'firecrawl_scrape',
        arguments: { url: 'https://example.com', formats: ['markdown'] },
        ...(modern
          ? {
              _meta: {
                'io.modelcontextprotocol/protocolVersion': '2026-07-28',
                'io.modelcontextprotocol/clientInfo': clientInfo,
                'io.modelcontextprotocol/clientCapabilities': {},
              },
            }
          : {}),
      },
    }),
  });
  const text = await response.text();
  assert.equal(response.status, 200, text);
  assert.doesNotMatch(text, /"isError":true/, text);
}

const CLIENTS = [
  {
    client: 'claude.ai',
    userAgent: 'Claude-User',
    clientInfo: { name: 'claude-code', version: '1.0.0' },
    origin: 'mcp-ua-claude-user',
  },
  {
    client: 'claude.ai',
    userAgent: 'Claude-User',
    clientInfo: { name: 'Anthropic/ClaudeAI', version: '1.0.0' },
    origin: 'mcp-ua-claude-user',
  },
  {
    client: 'ChatGPT',
    userAgent: 'openai-mcp/1.0.0',
    clientInfo: { name: 'openai-mcp-codex', version: '1.0.0' },
    origin: 'mcp-ua-openai-mcp',
  },
  {
    client: 'Claude Code',
    userAgent: 'claude-code/2.1.311 (sdk-cli)',
    clientInfo: { name: 'claude-code', version: '2.1.311' },
    origin: 'mcp-ua-claude-code',
  },
  {
    client: 'Codex',
    userAgent: 'codex-mcp-client/0.50.0',
    clientInfo: { name: 'codex-mcp-client', version: '0.50.0' },
    origin: 'mcp-ua-codex-mcp-client',
  },
];

test('a client named by its User-Agent keeps the same origin on 2026-07-28 as on the 2025 revisions', async (t) => {
  const api = await startApi(t);
  const port = await startEmbedded(t, api.url);
  for (const { client, userAgent, clientInfo, origin } of CLIENTS) {
    for (const modern of [false, true]) {
      api.origins.length = 0;
      await scrape(port, { userAgent, clientInfo, modern });
      assert.ok(api.origins.length > 0, `${client}: no API request`);
      for (const stamped of api.origins) {
        assert.ok(stamped.header || stamped.body, `${client}: API request missing origin`);
        for (const value of [stamped.header, stamped.body].filter(Boolean)) {
          assert.equal(
            value.split('@')[0],
            origin,
            `${client} (${clientInfo.name}) on ${modern ? '2026-07-28' : '2025'}`
          );
        }
      }
    }
  }
});

test('a 2026-07-28 clientInfo still names a client whose User-Agent is only a runtime', async (t) => {
  const api = await startApi(t);
  const port = await startEmbedded(t, api.url);
  await scrape(port, {
    userAgent: 'node',
    clientInfo: { name: 'Example Agent', version: '1.0.0' },
    modern: true,
  });
  assert.ok(api.origins.length > 0);
  const [stamped] = api.origins;
  assert.equal((stamped.header ?? stamped.body).split('@')[0], 'mcp-example-agent');
});
