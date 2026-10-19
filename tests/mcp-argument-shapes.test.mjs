import assert from 'node:assert/strict';
import test from 'node:test';
import { startFakeExchangeApi } from './helpers/exchange-api.mjs';
import {
  getFreePort,
  parseSseJson,
  spawnServer,
  stopChild,
  waitForHealth,
} from './helpers/exchange-mcp.mjs';

const headers = { 'x-api-key': 'fc-hosted-test' };

async function startHosted(t) {
  const api = await startFakeExchangeApi();
  t.after(() => api.close());
  const port = await getFreePort();
  const searchPort = await getFreePort();
  const child = spawnServer({
    CLOUD_SERVICE: 'true',
    HTTP_STREAMABLE_SERVER: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    FIRECRAWL_API_KEY: '',
    FIRECRAWL_OAUTH_TOKEN: '',
    FIRECRAWL_API_URL: api.url,
    PORT: String(port),
    FIRECRAWL_MCP_SEARCH_PORT: String(searchPort),
  });
  t.after(() => stopChild(child));
  await waitForHealth(port, child);
  await waitForHealth(searchPort, child);
  return {
    api,
    full: (name, args) => callTool(port, '/v2/mcp', name, args),
    search: (name, args) => callTool(searchPort, '/v2/mcp-search', name, args),
  };
}

let nextId = 1;
async function callTool(port, endpoint, name, args) {
  const response = await fetch(`http://127.0.0.1:${port}${endpoint}`, {
    body: JSON.stringify({
      id: nextId++,
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name, arguments: args },
    }),
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      ...headers,
    },
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(response.status, 200);
  return parseSseJson(await response.text());
}

function assertAccepted(message, label) {
  assert.equal(message.error, undefined, `${label}: ${JSON.stringify(message.error)}`);
  assert.notEqual(message.result.isError, true, `${label}: ${JSON.stringify(message.result)}`);
}

function rejectionText(message) {
  return message.error
    ? message.error.message
    : message.result.isError
      ? message.result.content.map((part) => part.text).join(' ')
      : '';
}

function lastBody(api, path) {
  return api.requests.filter((request) => request.url === path).at(-1)?.body;
}

test('optional parameters sent as null are treated as absent', async (t) => {
  const { api, full, search } = await startHosted(t);

  for (const [label, call] of [['full', full], ['search surface', search]]) {
    const scraped = await call('firecrawl_scrape', {
      url: 'https://example.com',
      formats: ['markdown'],
      onlyMainContent: null,
      maxAge: null,
      waitFor: null,
    });
    assertAccepted(scraped, `${label} scrape`);
    const body = lastBody(api, '/v2/scrape');
    assert.equal('onlyMainContent' in body, false, label);
    assert.equal('maxAge' in body, false, label);
    assert.equal('waitFor' in body, false, label);

    const searched = await call('firecrawl_search', {
      query: 'firecrawl docs',
      limit: 5,
      tbs: null,
      location: null,
      categories: null,
      includeDomains: null,
      excludeDomains: null,
    });
    assertAccepted(searched, `${label} search`);
    const searchBody = lastBody(api, '/v2/search');
    for (const key of ['tbs', 'location', 'categories', 'includeDomains', 'excludeDomains']) {
      assert.equal(key in searchBody, false, `${label}: ${key}`);
    }
  }

  assertAccepted(
    await full('firecrawl_search', {
      query: 'firecrawl docs',
      scrapeOptions: null,
    }),
    'full search scrapeOptions null'
  );
  assert.equal('scrapeOptions' in lastBody(api, '/v2/search'), false);

  assertAccepted(
    await full('firecrawl_search', {
      query: 'firecrawl docs',
      scrapeOptions: { formats: ['markdown'], onlyMainContent: null },
    }),
    'nested null option'
  );
  assert.deepEqual(lastBody(api, '/v2/search').scrapeOptions, { formats: ['markdown'] });

  const missingUrl = await full('firecrawl_scrape', { url: null });
  assert.match(rejectionText(missingUrl), /url or alexandria/, 'a required field sent as null is still refused');
});

test('numeric strings become numbers within the same bounds', async (t) => {
  const { api, full, search } = await startHosted(t);

  for (const [label, call] of [['full', full], ['search surface', search]]) {
    assertAccepted(await call('firecrawl_search', { query: 'firecrawl docs', limit: '5' }), label);
    assert.equal(lastBody(api, '/v2/search').limit, 5, label);

    const before = api.requests.length;
    for (const limit of ['500', '0', '2.5', 'five', '']) {
      const refused = await call('firecrawl_search', { query: 'firecrawl docs', limit });
      assert.notEqual(rejectionText(refused), '', `${label}: limit ${JSON.stringify(limit)} is refused`);
    }
    assert.equal(api.requests.length, before, `${label}: refused limits never reach the API`);
  }

  assertAccepted(
    await full('firecrawl_scrape', { url: 'https://example.com', waitFor: '1000', maxAge: '0' }),
    'scrape numbers'
  );
  const body = lastBody(api, '/v2/scrape');
  assert.equal(body.waitFor, 1000);
  assert.equal(body.maxAge, 0);
});

test('format and parser objects the API accepts are read as the tool form', async (t) => {
  const { api, full, search } = await startHosted(t);

  for (const [label, call] of [['full', full], ['search surface', search]]) {
    assertAccepted(
      await call('firecrawl_scrape', { url: 'https://example.com', formats: [{ type: 'markdown' }] }),
      label
    );
    assert.deepEqual(lastBody(api, '/v2/scrape').formats, ['markdown'], label);
  }

  const schema = { type: 'object', properties: { title: { type: 'string' } } };
  assertAccepted(
    await full('firecrawl_scrape', {
      url: 'https://example.com',
      formats: [{ type: 'json', prompt: 'The title', schema }, { type: 'screenshot', fullPage: true }],
      parsers: [{ type: 'pdf', maxPages: 2 }],
    }),
    'format options'
  );
  const body = lastBody(api, '/v2/scrape');
  assert.deepEqual(body.formats, [
    { type: 'json', prompt: 'The title', schema },
    { type: 'screenshot', fullPage: true },
  ]);
  assert.deepEqual(body.parsers, [{ type: 'pdf', maxPages: 2 }]);

  assertAccepted(
    await full('firecrawl_search', {
      query: 'firecrawl docs',
      scrapeOptions: { formats: [{ type: 'markdown' }] },
    }),
    'search scrapeOptions formats'
  );
  assert.deepEqual(lastBody(api, '/v2/search').scrapeOptions.formats, ['markdown']);

  const before = api.requests.length;
  for (const formats of [
    [{ type: 'pdf' }],
    [{ type: 'markdown', extra: true }],
    [{ type: 'json', schema }, { type: 'json', prompt: 'twice' }],
    [{ type: 'json', schema, strict: true }],
    [{ type: 'pdf', maxPages: 2 }],
  ]) {
    const refused = await full('firecrawl_scrape', { url: 'https://example.com', formats });
    assert.notEqual(rejectionText(refused), '', `${JSON.stringify(formats)} is refused`);
  }
  assert.equal(api.requests.length, before);
});

test('search refuses category combinations the API refuses, before calling it', async (t) => {
  const { api, full, search } = await startHosted(t);

  for (const [label, call] of [['full', full], ['search surface', search]]) {
    const before = api.requests.length;
    for (const categories of [['developer', 'research'], ['gov', 'pdf']]) {
      const refused = await call('firecrawl_search', { query: 'firecrawl docs', categories });
      assert.match(rejectionText(refused), /cannot be combined with other categories/, `${label}: ${categories}`);
    }
    assert.equal(api.requests.length, before, label);

    assertAccepted(await call('firecrawl_search', { query: 'firecrawl docs', categories: ['research', 'pdf'] }), label);
    assert.deepEqual(lastBody(api, '/v2/search').categories, ['research', 'pdf'], label);
    assertAccepted(await call('firecrawl_search', { query: 'firecrawl docs', categories: ['developer'] }), label);
  }
});

test('domain filters read a URL naming only a host as that host', async (t) => {
  const { api, full, search } = await startHosted(t);

  for (const [label, call] of [['full', full], ['search surface', search]]) {
    assertAccepted(
      await call('firecrawl_search', {
        query: 'firecrawl docs',
        includeDomains: ['https://docs.firecrawl.dev/', 'HTTP://Example.com'],
      }),
      label
    );
    assert.deepEqual(lastBody(api, '/v2/search').includeDomains, ['docs.firecrawl.dev', 'example.com'], label);

    assertAccepted(
      await call('firecrawl_search', { query: 'firecrawl docs', excludeDomains: ['https://reddit.com/'] }),
      label
    );
    assert.deepEqual(lastBody(api, '/v2/search').excludeDomains, ['reddit.com'], label);

    const before = api.requests.length;
    for (const domain of [
      'https://docs.firecrawl.dev/guides',
      'https://docs.firecrawl.dev/?q=1',
      'https://docs.firecrawl.dev/#section',
      'https://docs.firecrawl.dev:8443/',
      'https://docs.firecrawl.dev:443/',
      'https://docs.firecrawl.dev/./',
      'https://docs.firecrawl.dev?',
      'https://user@docs.firecrawl.dev/',
      'https://@docs.firecrawl.dev/',
      'ftp://docs.firecrawl.dev/',
      'docs.firecrawl.dev/guides',
    ]) {
      const refused = await call('firecrawl_search', { query: 'firecrawl docs', includeDomains: [domain] });
      assert.match(rejectionText(refused), /valid hostname without protocol or path/, `${label}: ${domain}`);
    }
    assert.equal(api.requests.length, before, label);
  }
});
