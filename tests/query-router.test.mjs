import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_THRESHOLD,
  applyQueryRouting,
  classifySearchQuery,
  routerConfigFromEnv,
} from '../dist/query-router.js';

const CONFIG = {
  endpoint: 'https://classifier.invalid/v1/systemone',
  model: 'jev-latest',
  apiKey: 'test-key',
  threshold: 0.8,
  timeoutMs: 1000,
  routes: { developer_index: 'developer', research_index: 'research' },
};

/** A fetch stub that answers with one Choice verdict and records the request. */
function stubFetch(answer, { status = 200, calls = [] } = {}) {
  const impl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return new Response(
      JSON.stringify({ model: 'jev-1.13.0', answers: { index: answer } }),
      {
        status,
        headers: { 'content-type': 'application/json' },
      }
    );
  };
  impl.calls = calls;
  return impl;
}

test('a confident developer verdict fills in the developer category', async () => {
  const fetchImpl = stubFetch({
    type: 'choice',
    choice: 'developer_index',
    confidence: 0.97,
    probabilities: {
      developer_index: 0.98,
      research_index: 0.01,
      web_search: 0.01,
    },
  });
  const body = {
    query: 'asyncpg vs psycopg3 connection pool',
    origin: 'mcp-fastmcp@3.24.1',
  };

  const decision = await applyQueryRouting(body, CONFIG, fetchImpl);

  assert.equal(decision.routed, true);
  assert.equal(decision.category, 'developer');
  assert.deepEqual(body.categories, ['developer']);
  // The rest of the outbound body is untouched.
  assert.equal(body.query, 'asyncpg vs psycopg3 connection pool');
  assert.equal(body.origin, 'mcp-fastmcp@3.24.1');
});

test('a confident research verdict fills in the research category', async () => {
  const fetchImpl = stubFetch({
    type: 'choice',
    choice: 'research_index',
    confidence: 0.91,
    probabilities: {
      developer_index: 0.02,
      research_index: 0.95,
      web_search: 0.03,
    },
  });
  const body = { query: 'sleep regularity index mortality UK Biobank' };

  const decision = await applyQueryRouting(body, CONFIG, fetchImpl);

  assert.equal(decision.routed, true);
  assert.deepEqual(body.categories, ['research']);
});

test('a confident web verdict leaves the call untargeted', async () => {
  const fetchImpl = stubFetch({
    type: 'choice',
    choice: 'web_search',
    confidence: 1,
    probabilities: { developer_index: 0, research_index: 0, web_search: 1 },
  });
  const body = { query: 'Brooklinen hand towel price' };

  const decision = await applyQueryRouting(body, CONFIG, fetchImpl);

  assert.equal(decision.routed, false);
  assert.equal(decision.reason, 'no_route_for_label');
  assert.equal(body.categories, undefined);
});

test('confidence at or below the threshold does not route', async () => {
  // 0.8 exactly: the gate is "greater than", so this must not act.
  const atThreshold = stubFetch({
    type: 'choice',
    choice: 'developer_index',
    confidence: 0.8,
    probabilities: {
      developer_index: 0.86,
      research_index: 0.07,
      web_search: 0.07,
    },
  });
  const body = { query: 'something arguably technical' };
  const decision = await applyQueryRouting(body, CONFIG, atThreshold);
  assert.equal(decision.routed, false);
  assert.equal(decision.reason, 'below_threshold');
  assert.equal(body.categories, undefined);

  const below = stubFetch({
    type: 'choice',
    choice: 'developer_index',
    confidence: 0.53,
    probabilities: {
      developer_index: 0.69,
      research_index: 0.0,
      web_search: 0.31,
    },
  });
  const body2 = { query: 'something arguably technical' };
  const decision2 = await applyQueryRouting(body2, CONFIG, below);
  assert.equal(decision2.routed, false);
  assert.equal(decision2.reason, 'below_threshold');
  assert.equal(body2.categories, undefined);
});

test('a call that already names categories or sources is never overridden', async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    throw new Error('classifier must not be consulted');
  };

  const withCategories = { query: 'react hooks', categories: ['pdf'] };
  const a = await applyQueryRouting(withCategories, CONFIG, fetchImpl);
  assert.equal(a.routed, false);
  assert.equal(a.reason, 'explicit_targeting');
  assert.deepEqual(withCategories.categories, ['pdf']);

  const withSources = { query: 'react hooks', sources: [{ type: 'news' }] };
  const b = await applyQueryRouting(withSources, CONFIG, fetchImpl);
  assert.equal(b.routed, false);
  assert.equal(b.reason, 'explicit_targeting');
  assert.equal(withSources.categories, undefined);

  assert.equal(called, false, 'no classifier call should be made');
});

test('the router fails open on transport, status, and body failures', async () => {
  const cases = [
    [
      'transport',
      async () => {
        throw Object.assign(new Error('socket hang up'), { name: 'TypeError' });
      },
      'transport_error:TypeError',
    ],
    [
      'timeout',
      async () => {
        throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
      },
      'transport_error:TimeoutError',
    ],
    ['http 500', async () => new Response('boom', { status: 500 }), 'http_500'],
    [
      'http 429',
      async () => new Response('slow down', { status: 429 }),
      'http_429',
    ],
    [
      'malformed body',
      async () =>
        new Response('not json', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      'malformed_response',
    ],
    [
      'missing answer',
      async () =>
        new Response(JSON.stringify({ answers: {} }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      'missing_answer',
    ],
  ];

  for (const [name, fetchImpl, expectedReason] of cases) {
    const body = { query: 'anything at all' };
    const decision = await applyQueryRouting(body, CONFIG, fetchImpl);
    assert.equal(decision.routed, false, `${name} should not route`);
    assert.equal(decision.reason, expectedReason, name);
    assert.equal(
      body.categories,
      undefined,
      `${name} must leave the body alone`
    );
  }
});

test('a null config is a no-op that never touches the body', async () => {
  const body = { query: 'react hooks' };
  const decision = await applyQueryRouting(body, null);
  assert.equal(decision.routed, false);
  assert.equal(decision.reason, 'disabled');
  assert.equal(body.categories, undefined);
});

test('an empty or missing query is not classified', async () => {
  const fetchImpl = async () => {
    throw new Error('classifier must not be consulted');
  };
  for (const body of [{ query: '   ' }, { query: '' }, {}, { query: 42 }]) {
    const decision = await applyQueryRouting(body, CONFIG, fetchImpl);
    assert.equal(decision.routed, false);
    assert.equal(decision.reason, 'no_query');
  }
});

test('the classifier is asked one Choice question over the query alone', async () => {
  const calls = [];
  const fetchImpl = stubFetch(
    {
      type: 'choice',
      choice: 'web_search',
      confidence: 1,
      probabilities: { developer_index: 0, research_index: 0, web_search: 1 },
    },
    { calls }
  );

  await classifySearchQuery('find me a hotel in Lisbon', CONFIG, fetchImpl);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, CONFIG.endpoint);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer test-key');
  assert.equal(calls[0].body.model, 'jev-latest');
  assert.deepEqual(calls[0].body.state, {
    search_query: 'find me a hotel in Lisbon',
  });
  assert.deepEqual(Object.keys(calls[0].body.questions), ['index']);
  assert.equal(calls[0].body.questions.index.type, 'choice');
  assert.deepEqual(Object.keys(calls[0].body.questions.index.criteria).sort(), [
    'developer_index',
    'research_index',
    'web_search',
  ]);
});

test('the router is off unless explicitly enabled with a key', () => {
  assert.equal(routerConfigFromEnv({}), null);
  assert.equal(routerConfigFromEnv({ TYPESAFE_API_KEY: 'k' }), null);
  assert.equal(routerConfigFromEnv({ FIRECRAWL_QUERY_ROUTER: 'true' }), null);
  assert.equal(
    routerConfigFromEnv({
      FIRECRAWL_QUERY_ROUTER: 'true',
      TYPESAFE_API_KEY: '  ',
    }),
    null
  );
  assert.equal(
    routerConfigFromEnv({ FIRECRAWL_QUERY_ROUTER: '1', TYPESAFE_API_KEY: 'k' }),
    null,
    'only the exact string "true" enables it'
  );
});

test('env configuration resolves defaults and rejects a nonsense threshold', () => {
  const base = { FIRECRAWL_QUERY_ROUTER: 'true', TYPESAFE_API_KEY: 'k' };

  const defaults = routerConfigFromEnv(base);
  assert.equal(defaults.threshold, DEFAULT_THRESHOLD);
  assert.equal(defaults.model, 'jev-latest');
  assert.deepEqual(defaults.routes, {
    developer_index: 'developer',
    research_index: 'research',
  });

  assert.equal(
    routerConfigFromEnv({ ...base, FIRECRAWL_QUERY_ROUTER_THRESHOLD: '0.95' })
      .threshold,
    0.95
  );
  for (const bad of ['0', '-1', '1.5', 'abc', '']) {
    assert.equal(
      routerConfigFromEnv({ ...base, FIRECRAWL_QUERY_ROUTER_THRESHOLD: bad })
        .threshold,
      DEFAULT_THRESHOLD,
      `threshold ${JSON.stringify(bad)} should fall back to the default`
    );
  }

  // A dedicated key wins over the shared one.
  assert.equal(
    routerConfigFromEnv({
      ...base,
      FIRECRAWL_QUERY_ROUTER_API_KEY: 'dedicated',
    }).apiKey,
    'dedicated'
  );
});
