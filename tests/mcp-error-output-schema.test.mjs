// Every error a tool returns must reach an MCP client built on the official
// SDK as a readable tool result. The SDK validates structuredContent against the
// advertised outputSchema even when isError is set, and throws -32602 otherwise.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

async function connect(t, { apiUrl, session, registerExtraTools, onToolResult, fileAccess, alexandriaTools }) {
  const port = await getFreePort();
  const instance = createFirecrawlMcpServer({
    transport: 'httpStream',
    apiUrl,
    fileAccess,
    unstable_hooks: { authenticate: async () => ({ ...session }), registerExtraTools, onToolResult, alexandriaTools },
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

async function assertReadableError(t, { apiUrl, session, name, args, includes, registerExtraTools, onToolResult, fileAccess, alexandriaTools }) {
  const { client, tools } = await connect(t, { apiUrl, session, registerExtraTools, onToolResult, fileAccess, alexandriaTools });
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

  test(`an API ${status} from an SDK call keeps its text and adds its code`, async (t) => {
    const apiUrl = await startRefusingApi(t, status, { success: false, error });
    const result = await assertReadableError(t, {
      apiUrl,
      session: apiKey,
      name: 'firecrawl_scrape',
      args: { url: 'https://example.com' },
      includes: error,
    });
    assert.equal(result.content[0].text, `Tool 'firecrawl_scrape' execution failed: ${result.structuredContent.error.message}`);
    assert.deepEqual(result.structuredContent, {
      success: false,
      error: {
        code: status === 402 ? 'insufficient_credits' : 'rate_limited',
        status,
        message: result.structuredContent.error.message,
        ...(status === 429 ? { retryAfterSeconds: 30 } : {}),
      },
    });
    assert.ok(result.structuredContent.error.message.includes(error));
  });
}

test('an API failure keeps its text alone when the outputSchema cannot carry the code', async (t) => {
  const apiUrl = await startRefusingApi(t, 402, { success: false, error: CREDITS_ERROR });
  const result = await assertReadableError(t, {
    apiUrl,
    session: apiKey,
    name: 'firecrawl_gov_search',
    args: { query: 'clean air act' },
    includes: '402',
  });
  assert.equal(result.structuredContent, undefined);
});

test('an API error code the API sends is kept over the status name', async (t) => {
  const apiUrl = await startRefusingApi(t, 408, { success: false, error: 'Scrape timed out.', code: 'EXPIRED' });
  const result = await assertReadableError(t, {
    apiUrl,
    session: apiKey,
    name: 'firecrawl_scrape',
    args: { url: 'https://example.com' },
    includes: 'Scrape timed out.',
  });
  assert.equal(result.structuredContent.error.code, 'EXPIRED');
  assert.equal(result.structuredContent.error.status, 408);
});

test('a paper ID the research API does not know is reported as not found', async (t) => {
  const apiUrl = await startRefusingApi(t, 404, { success: false, code: 'NOT_FOUND', error: 'paper metadata not found' });
  const { client } = await connect(t, { apiUrl, session: apiKey });
  const notFound =
    '(paper not found: no indexed paper has the ID "turn1search2". Use a paperId or primaryId from firecrawl_research_search_papers results.)';
  const read = await client.callTool({
    name: 'firecrawl_research_read_paper',
    arguments: { paperId: 'turn1search2', question: 'What is the main finding?' },
  });
  assert.notEqual(read.isError, true);
  assert.deepEqual(read.content, [{ type: 'text', text: notFound }]);
  assert.deepEqual(read.structuredContent, { passages: [] });
  const inspect = await client.callTool({
    name: 'firecrawl_research_inspect_paper',
    arguments: { paperId: 'turn1search2' },
  });
  assert.notEqual(inspect.isError, true);
  assert.deepEqual(inspect.content, [{ type: 'text', text: notFound }]);
  assert.deepEqual(inspect.structuredContent, {});
});

test('a failure the API answers with 200 keeps its text and adds its code', async (t) => {
  const error = 'DNS resolution failed for hostname "example.invalid". Please verify the URL is correct and the website exists.';
  const apiUrl = await startRefusingApi(t, 200, { success: false, code: 'SCRAPE_DNS_RESOLUTION_ERROR', error });
  const result = await assertReadableError(t, {
    apiUrl,
    session: apiKey,
    name: 'firecrawl_scrape',
    args: { url: 'https://example.invalid' },
    includes: error,
  });
  assert.deepEqual(result.structuredContent, {
    success: false,
    error: { code: 'SCRAPE_DNS_RESOLUTION_ERROR', status: 200, message: error },
  });
});

for (const { name, session, args, fileAccess } of [
  { name: 'firecrawl_monitor_list', session: apiKey, args: {} },
  { name: 'firecrawl_scrape', session: keyless, args: { url: 'https://example.invalid' } },
  { name: 'firecrawl_parse', session: apiKey, args: { filePath: '/not-read/document.pdf' }, fileAccess: 'upload' },
  { name: 'firecrawl_parse', session: apiKey, fileAccess: 'local' },
]) {
  test(`a direct HTTP 200 failure preserves its code (${name}, ${fileAccess ?? session.authType})`, async (t) => {
    const error = 'The requested resource could not be processed.';
    const code = 'PROCESSING_FAILED';
    const apiUrl = await startRefusingApi(t, 200, { success: false, code, error });
    let toolArgs = args;
    if (!toolArgs) {
      const directory = await mkdtemp(join(tmpdir(), 'mcp-parse-error-'));
      t.after(() => rm(directory, { recursive: true, force: true }));
      const filePath = join(directory, 'document.html');
      await writeFile(filePath, '<p>Test document</p>');
      toolArgs = { filePath };
    }
    const result = await assertReadableError(t, {
      apiUrl, session, name, args: toolArgs, fileAccess, includes: error,
    });
    assert.equal(result.structuredContent.success, false);
    assert.equal(result.structuredContent.error.code, code);
    assert.equal(result.structuredContent.error.status, 200);
  });
}

for (const body of ['', { success: false, code: 'NOT_FOUND', error: 'Route not found' }]) {
  test(`an operational research 404 stays an error (${JSON.stringify(body)})`, async (t) => {
    const apiUrl = await startRefusingApi(t, 404, body);
    for (const name of ['firecrawl_research_read_paper', 'firecrawl_research_inspect_paper']) {
      const result = await assertReadableError(t, {
        apiUrl, session: apiKey, name,
        args: { paperId: 'arxiv:1706.03762', ...(name.endsWith('read_paper') ? { question: 'What is the finding?' } : {}) },
        includes: '404',
      });
      assert.ok(!result.content[0].text.includes('no indexed paper'));
    }
  });
}

test('a json format without a prompt or schema is refused with a structured next step', async (t) => {
  const message =
    'formats "json" needs jsonOptions with a prompt or a schema. To ask a question about the page, use formats ["query"] with queryOptions.prompt instead.';
  const result = await assertReadableError(t, {
    apiUrl: 'http://127.0.0.1:9',
    session: apiKey,
    name: 'firecrawl_scrape',
    args: { url: 'https://example.com', formats: ['json'], queryOptions: { prompt: 'How many reviews?' } },
    includes: message,
  });
  assert.equal(result.content[0].text, message);
  assert.deepEqual(result.structuredContent, {
    success: false,
    error: { code: 'invalid_request', message },
  });
});

const JSON_FORMAT_MESSAGE =
  'formats "json" needs jsonOptions with a prompt or a schema. To ask a question about the page, use formats ["query"] with queryOptions.prompt instead.';
const QUERY_FORMAT_MESSAGE = 'formats "query" needs queryOptions with a non-empty prompt.';

for (const { name, args, message, code, alexandriaTools } of [
  { name: 'firecrawl_scrape', args: { url: 'https://example.com', formats: ['query'] }, message: QUERY_FORMAT_MESSAGE, code: 'invalid_request' },
  { name: 'firecrawl_scrape', args: { url: 'https://example.com', formats: ['query'], queryOptions: { prompt: ' ' } }, message: QUERY_FORMAT_MESSAGE, code: 'invalid_request' },
  { name: 'firecrawl_interact', args: { url: 'https://example.com', prompt: 'Read the title', scrapeOptions: { formats: ['json'] } }, message: JSON_FORMAT_MESSAGE, code: 'invalid_request' },
  { name: 'firecrawl_interact', args: { url: 'https://example.com', prompt: 'Read the title', scrapeOptions: { formats: ['query'] } }, message: QUERY_FORMAT_MESSAGE, code: 'invalid_request' },
  { name: 'firecrawl_find_tools', args: { level: 'categories', categories: ['finance'] }, message: 'Category index accepts only level, limit and offset. Select a category to browse providers.', code: 'invalid_input' },
  { name: 'firecrawl_monitor_create', args: { goal: 'Track pricing' }, message: 'firecrawl_monitor_create requires either `body`, `page`/`pages`, or `queries`.', code: 'invalid_input' },
  { name: 'firecrawl_monitor_create', args: { page: 'https://example.com' }, message: 'firecrawl_monitor_create shorthand requires `goal`. Use `body` for advanced requests without a goal.', code: 'invalid_input' },
  { name: 'firecrawl_monitor_update', args: { id: 'mon_001' }, message: 'firecrawl_monitor_update needs at least one change: `status`, `scheduleText`, `cron`, `timezone`, or `body`.', code: 'invalid_input' },
  { name: 'firecrawl_monitor_update', args: { id: 'mon_001', scheduleText: 'every hour', cron: '0 * * * *' }, message: 'firecrawl_monitor_update takes either `scheduleText` or `cron`, not both.', code: 'invalid_input' },
  { name: 'firecrawl_monitor_update', args: { id: 'mon_001', timezone: 'Europe/Berlin' }, message: 'firecrawl_monitor_update replaces the whole schedule, so `timezone` needs `scheduleText` or `cron` with it.', code: 'invalid_input' },
  { name: 'firecrawl_monitor_update', args: { id: 'mon_001', body: { schedule: { text: 'every hour', cron: '0 * * * *' } } }, message: 'firecrawl_monitor_update takes a schedule with either `text` or `cron`, not both.', code: 'invalid_input' },
  { name: 'firecrawl_monitor_update', args: { id: 'mon_001', timezone: 'UTC', body: { schedule: { text: 'every hour', cron: '0 * * * *' } } }, message: 'firecrawl_monitor_update takes a schedule with either `text` or `cron`, not both.', code: 'invalid_input' },
  { name: 'firecrawl_credit_usage', args: { view: 'current', bin: 'day' }, message: 'bin can only be used with view "historical" or with view omitted.', code: 'invalid_input' },
  { name: 'firecrawl_credit_usage', args: { byApiKey: true, byEndpoint: true }, message: 'byApiKey and byEndpoint cannot be combined.', code: 'invalid_input' },
]) {
  test(`a caller mistake is refused with a code (${name} ${JSON.stringify(args)})`, async (t) => {
    const events = [];
    const result = await assertReadableError(t, {
      apiUrl: 'http://127.0.0.1:9',
      session: apiKey,
      name,
      args,
      includes: message,
      alexandriaTools,
      onToolResult: (event) => events.push(event),
    });
    assert.equal(result.content[0].text, message);
    const error = events.find((event) => event.status === 'error')?.error;
    assert.ok(error instanceof UserError, String(error));
    assert.equal(error.extras.code ?? error.extras.error?.code, code);
  });
}

for (const code of [undefined, 'SITE_BLOCKED']) {
  test(`an unsupported site reaches an SDK client as a reason and a next step (API code: ${code ?? 'none'})`, async (t) => {
    const apiUrl = await startRefusingApi(t, 403, {
      success: false,
      error:
        'We apologize for the inconvenience but we do not support this site. If you are part of an enterprise and want to have a further conversation about this, please contact our sales team here: https://www.firecrawl.dev/contact-sales',
      ...(code ? { code } : {}),
    });
    const message =
      "Firecrawl can't scrape this site because it is currently not supported. Check Alexandria for a relevant provider if available, or use another source.";
    const result = await assertReadableError(t, {
      apiUrl,
      session: apiKey,
      name: 'firecrawl_scrape',
      args: { url: 'https://example.com' },
      includes: message,
    });
    assert.equal(result.content[0].text, `Tool 'firecrawl_scrape' execution failed: ${message}`);
    assert.deepEqual(result.structuredContent, {
      success: false,
      error: { code: 'unsupported_site', status: 403, message },
    });
  });
}

test("an embedder tool's own HTTP-like error keeps today's result", async (t) => {
  const result = await assertReadableError(t, {
    apiUrl: 'http://127.0.0.1:9',
    session: apiKey,
    name: 'embed_upstream',
    args: {},
    includes: 'Upstream refused.',
    registerExtraTools: (registrar) =>
      registrar.addTool({
        name: 'embed_upstream',
        description: 'Calls a service of its own.',
        parameters: z.object({}),
        outputSchema: z.object({
          success: z.boolean().optional(),
          error: z.object({ code: z.string(), status: z.number(), message: z.string() }).optional(),
        }),
        execute: async () => {
          throw Object.assign(new Error('Upstream refused.'), { status: 402, code: 'payment_required' });
        },
      }),
  });
  assert.deepEqual(result.content, [{ type: 'text', text: "Tool 'embed_upstream' execution failed: Upstream refused." }]);
  assert.equal(result.structuredContent, undefined);
});

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

for (const [name, args] of [
  ['alexandria_execute', { calls: [{ provider: 'fred', capability: 'series/observations' }] }],
  // The alexandria body firecrawl_scrape no longer lists.
  ['firecrawl_scrape', { alexandria: [{ provider: 'fred', capability: 'series/observations' }] }],
]) {
  test(`a refused Alexandria request reaches an SDK client with its message (${name})`, async (t) => {
    const apiUrl = await startRefusingApi(t, 403, { success: false, error: 'Exchange is not enabled for this team.', code: 'exchange_disabled' });
    const result = await assertReadableError(t, { apiUrl, session: apiKey, name, args, includes: 'Exchange is not enabled for this team.' });
    assert.deepEqual(Object.keys(result.structuredContent).sort(), ['message', 'requestId']);
    assert.equal(result.structuredContent.message, 'Exchange is not enabled for this team.');
  });
}
