import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createFirecrawlMcpServer, TaskNotFoundError } from '../dist/server.js';

const AGENT_ID = '019a1b2c-3d4e-7f00-8a00-0000000000a1';
const CRAWL_ID = '019a1b2c-3d4e-7f00-8a00-0000000000c1';
const EXPIRES_AT = '2099-01-01T00:00:00.000Z';

async function startApi(t) {
  const requests = [];
  const state = { agent: { status: 'processing', creditsUsed: 12 }, crawl: 'scraping', agentStatusCode: 200, cancelCode: 200, agentExpired: false };
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: body ? JSON.parse(body) : undefined });
    const base = `http://127.0.0.1:${server.address().port}`;
    const json = (status, payload) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    };
    if (req.method === 'POST' && req.url === '/v2/agent') {
      if (body.includes('refuse-me')) return json(402, { success: false, error: 'Insufficient credits.' });
      return json(200, { success: true, id: AGENT_ID });
    }
    if (state.agentExpired && req.url === `/v2/agent/${AGENT_ID}`) {
      // The API answers a job past its expiresAt with 404, as for an unknown job.
      return json(404, { success: false, error: 'Agent job not found' });
    }
    if (req.method === 'GET' && req.url === `/v2/agent/${AGENT_ID}`) {
      if (state.agentStatusCode !== 200) return json(state.agentStatusCode, { success: false, error: 'unavailable' });
      return json(200, { success: true, expiresAt: EXPIRES_AT, ...state.agent });
    }
    if (req.method === 'DELETE' && req.url === `/v2/agent/${AGENT_ID}`) {
      return json(state.cancelCode, { success: state.cancelCode === 200 });
    }
    if (req.method === 'POST' && req.url === '/v2/crawl') return json(200, { success: true, id: CRAWL_ID, url: 'https://example.com' });
    if (req.method === 'GET' && req.url === `/v2/crawl/${CRAWL_ID}`) {
      const done = state.crawl !== 'scraping';
      return json(200, {
        success: true,
        status: state.crawl,
        completed: done ? 2 : 1,
        total: 2,
        expiresAt: EXPIRES_AT,
        data: [{ markdown: 'page one' }],
        next: done ? `${base}/v2/crawl/${CRAWL_ID}?skip=1` : null,
      });
    }
    if (req.method === 'GET' && req.url === `/v2/crawl/${CRAWL_ID}?skip=1`) return json(200, { success: true, data: [{ markdown: 'page two' }], next: null });
    if (req.method === 'DELETE' && req.url === `/v2/crawl/${CRAWL_ID}`) return json(200, { status: 'cancelled' });
    json(404, { success: false, error: 'Job not found' });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { url: `http://127.0.0.1:${server.address().port}`, requests, state };
}

const caller = { request: { headers: { authorization: 'Bearer fc-task-test' } }, client: { name: 'claude-code', version: '2.1.310' } };

function tasksFor(api) {
  return createFirecrawlMcpServer({ apiUrl: api.url, transport: 'httpStream' }).tasks;
}

test('firecrawl_agent starts a task, reports progress, and completes with the status tool result', async (t) => {
  const api = await startApi(t);
  const tasks = tasksFor(api);

  const started = await tasks.start('firecrawl_agent', { prompt: 'Find the founders of Firecrawl' }, caller);
  assert.ok(started && 'task' in started, JSON.stringify(started));
  const { task } = started;
  assert.match(task.taskId, /^fc-agent-[0-9a-z]+-019a1b2c-3d4e-7f00-8a00-0000000000a1$/);
  assert.equal(task.status, 'working');
  assert.equal(task.ttlMs, null);
  assert.equal(task.pollIntervalMs, 5000);
  const post = api.requests.find((r) => r.method === 'POST');
  assert.equal(post.body.prompt, 'Find the founders of Firecrawl');
  assert.equal(post.auth, 'Bearer fc-task-test');

  const working = await tasks.get(task.taskId, caller);
  assert.equal(working.status, 'working');
  assert.equal(working.statusMessage, 'Research in progress, 12 credits used so far.');
  assert.equal(working.createdAt, task.createdAt);
  assert.equal(working.ttlMs, Date.parse(EXPIRES_AT) - Date.parse(task.createdAt));
  assert.equal(working.result, undefined);

  api.state.agent = { status: 'completed', data: { founders: ['Caleb', 'Eric', 'Nick'] }, creditsUsed: 40 };
  const done = await tasks.get(task.taskId, caller);
  assert.equal(done.status, 'completed');
  assert.notEqual(done.result.isError, true);
  assert.deepEqual(done.result.structuredContent.data, { founders: ['Caleb', 'Eric', 'Nick'] });
  assert.equal(JSON.parse(done.result.content[0].text).status, 'completed');
});

test('a failed agent run completes the task with an error result that keeps the credit-limit notice', async (t) => {
  const api = await startApi(t);
  const tasks = tasksFor(api);
  const { task } = await tasks.start('firecrawl_agent', { prompt: 'Long research' }, caller);
  api.state.agent = { status: 'failed', stopReason: 'credit_limit_reached', partial: { rows: 3 }, threadId: 'thread-1' };
  const failed = await tasks.get(task.taskId, caller);
  assert.equal(failed.status, 'completed');
  assert.equal(failed.result.isError, true);
  assert.match(failed.result.content[0].text, /stopped at its credit limit/);
});

test('a status read the API cannot answer leaves the task working', async (t) => {
  const api = await startApi(t);
  const tasks = tasksFor(api);
  const { task } = await tasks.start('firecrawl_agent', { prompt: 'p' }, caller);
  api.state.agentStatusCode = 503;
  const read = await tasks.get(task.taskId, caller);
  assert.equal(read.status, 'working');
  assert.match(read.statusMessage, /HTTP 503/);
  assert.equal(read.pollIntervalMs, 10_000);
});

test('unknown and malformed task ids are TaskNotFoundError', async (t) => {
  const api = await startApi(t);
  const tasks = tasksFor(api);
  await assert.rejects(tasks.get('not-a-task', caller), TaskNotFoundError);
  await assert.rejects(tasks.get('fc-agent-abc-../../v2/crawl', caller), TaskNotFoundError);
  await assert.rejects(tasks.get('fc-agent-zzzzzzzzzzzz-00000000-0000-7000-8000-000000000000', caller), TaskNotFoundError, 'a creation time outside the Date range');
  await assert.rejects(tasks.get('fc-agent-mh2abcd-00000000-0000-7000-8000-000000000000', caller), TaskNotFoundError);
  await assert.rejects(tasks.cancel('fc-crawl-mh2abcd-00000000-0000-7000-8000-000000000000', caller), TaskNotFoundError);
});

test('a task whose job has expired is TaskNotFoundError', async (t) => {
  const api = await startApi(t);
  const tasks = tasksFor(api);
  const { task } = await tasks.start('firecrawl_agent', { prompt: 'p' }, caller);
  api.state.agentExpired = true;
  await assert.rejects(tasks.get(task.taskId, caller), TaskNotFoundError);
  await assert.rejects(tasks.cancel(task.taskId, caller), TaskNotFoundError);
});

test('cancel maps to DELETE on the job and accepts a job that already finished', async (t) => {
  const api = await startApi(t);
  const tasks = tasksFor(api);
  const { task } = await tasks.start('firecrawl_agent', { prompt: 'p' }, caller);
  await tasks.cancel(task.taskId, caller);
  assert.ok(api.requests.some((r) => r.method === 'DELETE' && r.url === `/v2/agent/${AGENT_ID}`));
  api.state.cancelCode = 409;
  await tasks.cancel(task.taskId, caller);
  api.state.agent = { status: 'cancelled' };
  const cancelled = await tasks.get(task.taskId, caller);
  assert.equal(cancelled.status, 'cancelled');
});

test('firecrawl_crawl as a task returns once the crawl is accepted and completes with every page', async (t) => {
  const api = await startApi(t);
  const tasks = tasksFor(api);
  const started = await tasks.start('firecrawl_crawl', { url: 'https://example.com', limit: 2 }, caller);
  assert.ok(started && 'task' in started, JSON.stringify(started));
  assert.equal(api.requests.filter((r) => r.method === 'GET').length, 0, 'the start does not wait on the crawl');
  assert.equal(started.task.pollIntervalMs, 3000);

  const working = await tasks.get(started.task.taskId, caller);
  assert.equal(working.statusMessage, 'Crawling: 1 of 2 pages done.');

  api.state.crawl = 'completed';
  const done = await tasks.get(started.task.taskId, caller);
  assert.equal(done.status, 'completed');
  assert.deepEqual(done.result.structuredContent.data.map((d) => d.markdown), ['page one', 'page two']);

  await tasks.cancel(started.task.taskId, caller);
  assert.ok(api.requests.some((r) => r.method === 'DELETE' && r.url === `/v2/crawl/${CRAWL_ID}`));
});

test('calls that cannot become a task fall back to the plain tool call or return its result', async (t) => {
  const api = await startApi(t);
  const tasks = tasksFor(api);
  assert.equal(await tasks.start('firecrawl_scrape', { url: 'https://example.com' }, caller), undefined);
  assert.equal(await tasks.start('firecrawl_agent', {}, caller), undefined, 'invalid arguments run as a plain call');
  const refused = await tasks.start('firecrawl_agent', { prompt: 'refuse-me' }, caller);
  assert.ok(refused && 'result' in refused, JSON.stringify(refused));
  assert.equal(refused.result.isError, true);
  assert.match(refused.result.content[0].text, /Insufficient credits/);
});

test('a tool filtered out of the server cannot start a task', async (t) => {
  const api = await startApi(t);
  const { tasks } = createFirecrawlMcpServer({
    apiUrl: api.url,
    transport: 'httpStream',
    unstable_hooks: { toolFilter: (name) => name !== 'firecrawl_agent' },
  });
  assert.equal(await tasks.start('firecrawl_agent', { prompt: 'p' }, caller), undefined);
  assert.equal(api.requests.length, 0);
});
