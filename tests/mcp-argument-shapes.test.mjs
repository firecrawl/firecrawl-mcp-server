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
      'https://999.999.999.999/',
      'https://0x7f.1/',
      'ftp://docs.firecrawl.dev/',
      'docs.firecrawl.dev/guides',
    ]) {
      const refused = await call('firecrawl_search', { query: 'firecrawl docs', includeDomains: [domain] });
      assert.match(rejectionText(refused), /valid hostname without protocol or path/, `${label}: ${domain}`);
    }
    assert.equal(api.requests.length, before, label);
  }
});

test('scheme-less URLs are read as https URLs', async (t) => {
  const { api, full } = await startHosted(t);
  const calls = [
    ['firecrawl_scrape', { url: 'example.com/page' }],
    ['firecrawl_map', { url: 'example.com/page' }],
    ['firecrawl_interact', { url: 'example.com/page', prompt: 'read the title' }],
    ['firecrawl_agent', { prompt: 'find the title', urls: ['example.com/page'] }],
    ['firecrawl_find_tools', { urls: ['example.com/page'] }],
  ];
  for (const [name, args] of calls) {
    const before = api.requests.length;
    const message = await full(name, args);
    assert.doesNotMatch(rejectionText(message), /Invalid|validation/i, name);
    const sent = JSON.stringify(api.requests.slice(before));
    assert.match(decodeURIComponent(sent), /https:\/\/example\.com\/page/, `${name} sends an https URL`);
  }

  for (const url of ['http:example.com/page', 'HTTPS:/example.com/page']) {
    assertAccepted(await full('firecrawl_scrape', { url }), url);
    assert.match(lastBody(api, '/v2/scrape').url, /^https?:\/\/example\.com\/page$/i, url);
  }

  const before = api.requests.length;
  for (const url of ['https://<scrubbed-url-domain>/page', 'ftp://example.com/file', '/login', '']) {
    assert.notEqual(rejectionText(await full('firecrawl_scrape', { url })), '', `${url} is refused`);
  }
  assert.equal(api.requests.length, before, 'refused URLs never reach the API');
});


test('unknown and misspelled fields are refused before the API is called', async (t) => {
  const { api, full, search } = await startHosted(t);

  for (const [label, call] of [['full', full], ['search surface', search]]) {
    for (const [args, field, hint] of [
      [{ url: 'https://example.com', maxage: 0 }, 'maxage', 'Did you mean "maxAge" for "maxage"?'],
      [{ url: 'https://example.com', onlyMainContnet: false }, 'onlyMainContnet'],
      [{ url: 'https://example.com', location: { country: 'CA', city: 'Toronto' } }, 'location.city'],
    ]) {
      const before = api.requests.length;
      const refused = await call('firecrawl_scrape', args);
      const text = rejectionText(refused);
      assert.ok(text.includes(`"${field}"`), `${label}: ${field} is named`);
      if (hint) assert.ok(text.includes(hint), `${label}: ${text}`);
      assert.equal(refused.result?.structuredContent?.error?.code, 'invalid_request', `${label}: ${field} code`);
      assert.deepEqual(refused.result.structuredContent.error.fields, [field], label);
      assert.equal(api.requests.length, before, `${label}: ${field} never reaches the API`);
    }

    const before = api.requests.length;
    const refusedSearch = await call('firecrawl_search', { query: 'laptops', limt: 3 });
    assert.notEqual(rejectionText(refusedSearch), '', `${label}: misspelled search limit is refused`);
    // The search surface already refuses unknown keys in its own schema.
    if (label === 'full') {
      assert.equal(refusedSearch.result?.structuredContent?.error?.code, 'invalid_request');
      assert.deepEqual(refusedSearch.result.structuredContent.error.fields, ['limt']);
    }
    assert.equal(api.requests.length, before, `${label}: refused search never reaches the API`);

    assertAccepted(await call('firecrawl_scrape', { url: 'https://example.com', maxAge: 0 }), `${label} maxAge`);
    assert.equal(lastBody(api, '/v2/scrape').maxAge, 0, `${label}: declared fields still reach the API`);
  }
});

test('fields from earlier tool definitions are still accepted and dropped', async (t) => {
  const { api, full, search } = await startHosted(t);

  for (const [label, call] of [['full', full], ['search surface', search]]) {
    assertAccepted(
      await call('firecrawl_search', {
        query: 'firecrawl docs',
        objective: 'Find the MCP docs',
        clientModel: 'example-model',
      }),
      `${label} search`
    );
    const body = lastBody(api, '/v2/search');
    assert.equal('objective' in body, false, label);
    assert.equal('clientModel' in body, false, label);
  }

  assertAccepted(
    await full('firecrawl_scrape', {
      url: 'https://example.com',
      objective: 'Read the page',
      profile: { name: 'saved-login', saveChanges: true },
    }),
    'full scrape'
  );
  assert.equal('objective' in lastBody(api, '/v2/scrape'), false);

  // Fields agents carry between Firecrawl tools or from older definitions.
  assertAccepted(
    await full('firecrawl_search', { query: 'firecrawl docs', conversationId: 'c-1', sessionId: 's-1' }),
    'full search'
  );
  for (const [label, call] of [['full', full], ['search surface', search]]) {
    assertAccepted(
      await call('firecrawl_scrape', { url: 'https://example.com', conversationId: 'c-1', sessionId: 's-1' }),
      `${label} scrape`
    );
  }
  assertAccepted(
    await full('firecrawl_scrape', {
      url: 'https://example.com',
      actions: [{ type: 'click', selector: '#submit' }],
    }),
    'hosted scrape still drops browser actions'
  );
  assert.equal('actions' in lastBody(api, '/v2/scrape'), false);
});

test('carried-over fields are only tolerated where they used to be accepted', async (t) => {
  const { api, full } = await startHosted(t);
  const before = api.requests.length;

  for (const [args, field] of [
    [{ url: 'https://example.com', location: { country: 'CA', objective: 'x' } }, 'location.objective'],
    [{ url: 'https://example.com', location: { country: 'CA', actions: [] } }, 'location.actions'],
    [{ url: 'https://example.com', saveChanges: true }, 'saveChanges'],
  ]) {
    const refused = await full('firecrawl_scrape', args);
    assert.deepEqual(refused.result?.structuredContent?.error?.fields, [field], field);
  }
  assert.equal(api.requests.length, before, 'refused calls never reach the API');
});

test('unknown fields are found inside union-typed inputs and own keys only', async (t) => {
  const { api, full } = await startHosted(t);
  const before = api.requests.length;

  for (const [args, field] of [
    [{ alexandria: { provider: 'fred', capability: 'series/observations', bogus: 1 } }, 'alexandria.bogus'],
    [{ url: 'https://example.com', constructor: 1 }, 'constructor'],
  ]) {
    const refused = await full('firecrawl_scrape', args);
    assert.deepEqual(refused.result?.structuredContent?.error?.fields, [field], field);
  }
  assert.equal(api.requests.length, before, 'refused calls never reach the API');
});

test('a call with many unknown fields lists a bounded number of them', async (t) => {
  const { api, full } = await startHosted(t);
  const before = api.requests.length;
  const junk = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`bogus${i}`, i]));
  const refused = await full('firecrawl_scrape', { url: 'https://example.com', ...junk });
  const { fields, message } = refused.result.structuredContent.error;
  assert.equal(fields.length, 10);
  assert.ok(message.includes('and 490 more'), message);
  assert.equal(api.requests.length, before);
});
