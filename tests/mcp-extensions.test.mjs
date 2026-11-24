// Embedder extensions (`unstable_hooks.extensions`) on protocol revision
// 2026-07-28: advertised in server/discover, their methods served, and the
// Mcp-Name header of a method that declares one checked against the body.
import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { createFirecrawlMcpServer } from '../dist/server.js';
import { getFreePort, parseSseJson } from './helpers/exchange-mcp.mjs';

const EXTENSION = 'com.example/echo';

const echoExtension = {
  id: EXTENSION,
  settings: { listChanged: false },
  nameHeaders: { 'echo/say': 'name' },
  register(server) {
    server.setRequestHandler(
      'echo/say',
      { params: z.looseObject({ name: z.string() }), result: z.record(z.string(), z.unknown()) },
      async (params) => ({ resultType: 'complete', said: params.name })
    );
  },
};

async function start(t, options = {}) {
  const port = await getFreePort();
  const instance = createFirecrawlMcpServer({
    transport: 'httpStream',
    apiKey: 'fc-extension-test',
    modernProtocol: true,
    unstable_hooks: { extensions: [echoExtension] },
    ...options,
  });
  await instance.start({
    transportType: 'httpStream',
    httpStream: { port, host: '127.0.0.1', endpoint: '/mcp', stateless: true },
  });
  t.after(() => instance.stop());
  return port;
}

async function rpc(port, method, params = {}, headers = {}, { legacy = false } = {}) {
  const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'mcp-method': method,
      'mcp-protocol-version': legacy ? '2025-11-25' : '2026-07-28',
      ...headers,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params: legacy ? params : {
        ...params,
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientInfo': { name: 'extension-test', version: '1.0.0' },
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    }),
  });
  const text = await response.text();
  return { status: response.status, body: text.startsWith('{') ? JSON.parse(text) : parseSseJson(text) };
}

test('server/discover advertises an embedder extension beside the built-in ones', async (t) => {
  const port = await start(t);
  const { body } = await rpc(port, 'server/discover');
  assert.deepEqual(body.result.capabilities.extensions[EXTENSION], { listChanged: false });
  assert.ok(body.result.capabilities.extensions['io.modelcontextprotocol/tasks']);
});

test('an extension method is served when Mcp-Name mirrors params.name', async (t) => {
  const port = await start(t);
  const plain = await rpc(port, 'echo/say', { name: 'hello' }, { 'mcp-name': 'hello' });
  assert.equal(plain.body.result.said, 'hello');
  const encoded = `=?base64?${Buffer.from('héllo').toString('base64')}?=`;
  const sentinel = await rpc(port, 'echo/say', { name: 'héllo' }, { 'mcp-name': encoded });
  assert.equal(sentinel.body.result.said, 'héllo');
});

test('a missing or mismatched Mcp-Name is a 400 HeaderMismatch', async (t) => {
  const port = await start(t);
  for (const headers of [{}, { 'mcp-name': 'other' }]) {
    const { status, body } = await rpc(port, 'echo/say', { name: 'hello' }, headers);
    assert.equal(status, 400);
    assert.equal(body.error.code, -32020);
  }
});

test('a 2025-era request finds no extension method', async (t) => {
  const port = await start(t);
  const { body } = await rpc(port, 'echo/say', { name: 'hello' }, {}, { legacy: true });
  assert.equal(body.error.code, -32601);
});
