// firecrawl_scrape names an Alexandria provider for the page's site in agent_hints.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createFirecrawlMcpServer } from '../dist/server.js';
import { getFreePort, parseSseJson } from './helpers/exchange-mcp.mjs';

const ENDPOINT = '/mcp';

async function startFakeApi(t, { providers = {}, resolveDelayMs = 0 } = {}) {
  const requests = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    req.setEncoding('utf8');
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : undefined;
    requests.push({ url: req.url, headers: req.headers, body });
    res.writeHead(200, { 'content-type': 'application/json' });
    if (req.url === '/exchange/skills/resolve') {
      if (resolveDelayMs)
        await new Promise((resolve) => setTimeout(resolve, resolveDelayMs));
      const host = new URL(body.urls[0]).hostname;
      res.end(
        JSON.stringify({
          skills: (providers[host] ?? []).map((id) => ({ id })),
        })
      );
      return;
    }
    res.end(
      JSON.stringify({
        success: true,
        data: { markdown: '# Page', metadata: { statusCode: 200 } },
      })
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { url: `http://127.0.0.1:${server.address().port}`, requests };
}

async function startServer(t, api, options = {}) {
  const port = await getFreePort();
  const instance = createFirecrawlMcpServer({
    transport: 'httpStream',
    apiUrl: api.url,
    apiKey: 'fc-site-hints',
    scrapeProviderHints: true,
    ...options,
  });
  await instance.start({
    transportType: 'httpStream',
    httpStream: {
      port,
      host: '127.0.0.1',
      endpoint: ENDPOINT,
      stateless: true,
    },
  });
  t.after(() => instance.stop());
  return port;
}

async function scrape(port, args) {
  const response = await fetch(`http://127.0.0.1:${port}${ENDPOINT}`, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      id: 1,
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: 'firecrawl_scrape', arguments: args },
    }),
  });
  assert.equal(response.status, 200);
  const { result } = parseSseJson(await response.text());
  return { result, text: JSON.parse(result.content[0].text) };
}

const resolveCalls = (api) =>
  api.requests.filter((request) => request.url === '/exchange/skills/resolve');

test('a URL scrape names the provider covering the page host, sending only the host', async (t) => {
  const api = await startFakeApi(t, {
    providers: { 'fred.stlouisfed.org': ['fred', 'other'] },
  });
  const port = await startServer(t, api);

  const { result, text } = await scrape(port, {
    url: 'https://fred.stlouisfed.org/series/CPIAUCSL?units=pc1',
  });

  const [lookup] = resolveCalls(api);
  assert.deepEqual(lookup.body.urls, ['https://fred.stlouisfed.org/']);
  assert.equal(lookup.headers.authorization, 'Bearer fc-site-hints');
  assert.equal(text.markdown, '# Page');
  assert.equal(text.agent_hints.length, 1);
  assert.match(
    text.agent_hints[0],
    /^This site has a structured-data provider \(fred\)\./
  );
  assert.match(
    text.agent_hints[0],
    /alexandria_library_search \{"command":"cat \/library\/\*\/fred\/README\.md"\}/
  );
  assert.match(
    text.agent_hints[0],
    /alexandria_library_read \{"calls":\[\{"provider":"fred",/
  );
  assert.deepEqual(result.structuredContent.agent_hints, text.agent_hints);
});

test('a surface without the library tools names firecrawl_find_tools and firecrawl_scrape', async (t) => {
  const api = await startFakeApi(t, {
    providers: { 'fred.stlouisfed.org': ['fred'] },
  });
  const port = await startServer(t, api, {
    unstable_hooks: { toolFilter: (name) => !name.startsWith('alexandria_') },
  });

  const { text } = await scrape(port, {
    url: 'https://fred.stlouisfed.org/series/CPIAUCSL',
  });

  assert.match(
    text.agent_hints[0],
    /firecrawl_find_tools \{"providers":\["fred"\]\}/
  );
  assert.match(
    text.agent_hints[0],
    /firecrawl_scrape \{"alexandria":\{"provider":"fred",/
  );
  assert.doesNotMatch(text.agent_hints[0], /alexandria_library/);
});

test('a host with no provider gets no hint and is looked up once, concurrently or later', async (t) => {
  const api = await startFakeApi(t);
  const port = await startServer(t, api);

  const [first, second] = await Promise.all([
    scrape(port, { url: 'https://unmatched.example/a' }),
    scrape(port, { url: 'https://unmatched.example/b' }),
  ]);
  const third = await scrape(port, { url: 'https://unmatched.example/c' });

  for (const { text } of [first, second, third])
    assert.equal('agent_hints' in text, false);
  assert.equal(resolveCalls(api).length, 1);
});

test('lookups are cached per credential', async (t) => {
  const api = await startFakeApi(t, {
    providers: { 'fred.stlouisfed.org': ['fred'] },
  });
  const port = await startServer(t, api, { apiKey: undefined });

  for (const key of ['fc-team-a', 'fc-team-b', 'fc-team-a']) {
    const response = await fetch(`http://127.0.0.1:${port}${ENDPOINT}`, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        id: 1,
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'firecrawl_scrape',
          arguments: { url: 'https://fred.stlouisfed.org/' },
        },
      }),
    });
    assert.equal(response.status, 200);
  }

  assert.deepEqual(
    resolveCalls(api).map((call) => call.headers.authorization),
    ['Bearer fc-team-a', 'Bearer fc-team-b']
  );
});

test('domainTools, lockdown, zeroDataRetention and the default option skip the lookup', async (t) => {
  const api = await startFakeApi(t, {
    providers: { 'skipped.example': ['skipped'] },
  });
  const port = await startServer(t, api);
  const defaults = await startServer(t, api, {
    scrapeProviderHints: undefined,
  });

  for (const args of [
    { url: 'https://skipped.example/', domainTools: true },
    { url: 'https://skipped.example/', lockdown: true },
    { url: 'https://skipped.example/', zeroDataRetention: true },
  ]) {
    const { text } = await scrape(port, args);
    assert.equal('agent_hints' in text, false, JSON.stringify(args));
  }
  const { text } = await scrape(defaults, { url: 'https://skipped.example/' });
  assert.equal('agent_hints' in text, false);
  assert.equal(resolveCalls(api).length, 0);
});

test('a late lookup does not hold up the scrape', async (t) => {
  const api = await startFakeApi(t, {
    providers: { 'slow.example': ['slow'] },
    resolveDelayMs: 1_500,
  });
  const port = await startServer(t, api);

  const started = Date.now();
  const { text } = await scrape(port, { url: 'https://slow.example/' });

  assert.ok(Date.now() - started < 1_400);
  assert.equal(text.markdown, '# Page');
  assert.equal('agent_hints' in text, false);
});
