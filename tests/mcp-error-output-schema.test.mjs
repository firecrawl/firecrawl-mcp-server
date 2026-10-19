// Every error a tool returns must reach an MCP client built on the official
// SDK as a readable tool result. The SDK validates structuredContent against the
// advertised outputSchema even when isError is set, and throws -32602 otherwise.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod';
import { createFirecrawlMcpServer, UserError } from '../dist/server.js';
const INVALID_API_KEY_MESSAGE = 'The Firecrawl API key is invalid or revoked.';
import { getFreePort } from './helpers/exchange-mcp.mjs';

const SIGNUP_URL = 'https://www.firecrawl.dev/signin?utm_source=keyless&utm_medium=mcp&redirect=%2Fapp%2Fapi-keys';
const CREDITS_ERROR = 'Insufficient credits to perform this request. For more credits, you can upgrade your plan at https://firecrawl.dev/pricing.';
const RATE_LIMIT_ERROR = 'Rate limit exceeded. Consumed (req/min): 2, Remaining (req/min): 0. Please retry after 30s.';

async function startRefusingApi(t, status, body) {
  const server = createServer(async (req, res) => {
    for await (const _chunk of req);
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

async function connect(t, { apiUrl, session, registerExtraTools, onToolResult }) {
  const port = await getFreePort();
  const instance = createFirecrawlMcpServer({
    transport: 'httpStream',
    apiUrl,
    unstable_hooks: { authenticate: async () => ({ ...session }), registerExtraTools, onToolResult },
  });
  await instance.start({
    transportType: 'httpStream',
    httpStream: { port, host: '127.0.0.1', endpoint: '/mcp', stateless: true },
  });
  t.after(() => instance.stop());
  const client = new Client({ name: 'error-output-schema-test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
  t.after(() => client.close());
  const { tools } = await client.listTools();
  return { client, tools };
}

async function assertReadableError(t, { apiUrl, session, name, args, includes, registerExtraTools, onToolResult }) {
  const { client, tools } = await connect(t, { apiUrl, session, registerExtraTools, onToolResult });
  assert.ok(tools.find((tool) => tool.name === name)?.outputSchema, `${name} declares an outputSchema`);
  const result = await client.callTool({ name, arguments: args });
  assert.equal(result.isError, true, JSON.stringify(result));
  assert.equal(result.content[0].type, 'text');
  assert.ok(result.content[0].text.includes(includes), result.content[0].text);
  return result;
}

const keyless = { authType: 'keyless' };
const apiKey = { authType: 'api-key', firecrawlApiKey: 'fc-test' };

test('a keyless quota refusal reaches an SDK client as its readable message', async (t) => {
  const apiUrl = await startRefusingApi(t, 429, { success: false, reason: 'requests' });
  const result = await assertReadableError(t, {
    apiUrl,
    session: keyless,
    name: 'firecrawl_scrape',
    args: { url: 'https://example.com' },
    includes: "Firecrawl's daily limit without an account was reached.",
  });
  assert.ok(result.content[0].text.includes(SIGNUP_URL));
  assert.deepEqual(result.structuredContent, { message: result.content[0].text });
});

test('a keyless limit without a reason reaches an SDK client as its readable message', async (t) => {
  const apiUrl = await startRefusingApi(t, 429, { success: false });
  const result = await assertReadableError(t, {
    apiUrl,
    session: keyless,
    name: 'firecrawl_search',
    args: { query: 'firecrawl' },
    includes: SIGNUP_URL,
  });
  assert.equal(result.structuredContent, undefined);
});

test('a rejected API key reaches an SDK client as its readable message', async (t) => {
  const apiUrl = await startRefusingApi(t, 401, { success: false, error: 'Unauthorized: Invalid token' });
  const result = await assertReadableError(t, {
    apiUrl,
    session: apiKey,
    name: 'firecrawl_scrape',
    args: { url: 'https://example.com' },
    includes: INVALID_API_KEY_MESSAGE,
  });
  assert.deepEqual(result.structuredContent, { message: result.content[0].text });
});

for (const { status, error } of [
  { status: 402, error: CREDITS_ERROR },
  { status: 429, error: RATE_LIMIT_ERROR },
]) {
  test(`an API ${status} reaches an SDK client as the API's reason`, async (t) => {
    const apiUrl = await startRefusingApi(t, status, { success: false, error });
    const result = await assertReadableError(t, {
      apiUrl,
      session: apiKey,
      name: 'firecrawl_crawl',
      args: { url: 'https://example.com' },
      includes: error,
    });
    assert.equal(result.structuredContent, undefined);
  });
}

for (const { name, payload, delivered } of [
  {
    name: 'keeps a payload that matches the outputSchema',
    payload: { code: 'EMBED_REFUSED', message: 'Refused.' },
    delivered: { code: 'EMBED_REFUSED', message: 'Refused.' },
  },
  {
    name: 'keeps only the keys the outputSchema declares',
    payload: { code: 'EMBED_REFUSED', message: 'Refused.', request_id: 'r-1' },
    delivered: { code: 'EMBED_REFUSED', message: 'Refused.' },
  },
  {
    name: 'drops a payload whose declared keys do not validate',
    payload: { code: 409, message: 'Refused.' },
    delivered: undefined,
  },
  {
    name: 'drops a payload with no declared keys',
    payload: { request_id: 'r-1', message_text: 'Refused.' },
    delivered: undefined,
  },
]) {
  for (const path of ['execute throws', 'execute returns', 'beforeValidate throws', 'beforeValidate returns']) {
    test(`an embedder error ${name} (${path})`, async (t) => {
      const refusal = { content: [{ type: 'text', text: 'Refused.' }], isError: true, structuredContent: payload };
      const refuse = path.endsWith('throws')
        ? async () => {
            throw new UserError('Refused.', payload);
          }
        : async () => refusal;
      const events = [];
      const result = await assertReadableError(t, {
        apiUrl: 'http://127.0.0.1:9',
        session: apiKey,
        name: 'embed_refuses',
        args: {},
        includes: 'Refused.',
        onToolResult: (event) => events.push(event),
        registerExtraTools: (registrar) =>
          registrar.addTool({
            name: 'embed_refuses',
            description: 'Always refuses.',
            parameters: z.object({}),
            outputSchema: z.object({ code: z.string().optional(), message: z.string().optional() }),
            ...(path.startsWith('beforeValidate') ? { beforeValidate: refuse } : {}),
            execute: path.startsWith('execute') ? refuse : async () => 'unreachable',
          }),
      });
      assert.deepEqual(result.structuredContent, delivered);
      if (path === 'execute throws') {
        const error = events.find((event) => event.status === 'error')?.error;
        assert.deepEqual(error?.extras, payload, 'hooks see the full payload');
      }
    });
  }
}
