import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_ENDPOINT,
  DEFAULT_THRESHOLD,
  DEFAULT_TIMEOUT_MS,
  PAPER_INDEX_NOTICE,
  applyQueryRouting,
  classifySearchQuery,
  routedPaperResponse,
  routerConfigFromEnv,
} from '../dist/query-router.js';

const CONFIG = {
  endpoint: 'https://classifier.invalid/v1/systemone',
  model: 'jev-latest',
  apiKey: 'test-key',
  threshold: 0.8,
  timeoutMs: 1000,
  routes: {
    developer_index: 'developer_category',
    research_index: 'research_paper_index',
  },
};

/** A fetch stub that answers with one Choice verdict and records the request. */
function stubFetch(answer, { status = 200, calls = [] } = {}) {
  const impl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return new Response(
      JSON.stringify({ model: 'jev-1.13.0', answers: { index: answer } }),
      { status, headers: { 'content-type': 'application/json' } }
    );
  };
  impl.calls = calls;
  return impl;
}

/** A verdict with all of the mass on one option. */
function verdict(choice, probability = 0.98) {
  const rest = (1 - probability) / 2;
  const probabilities = {
    developer_index: rest,
    research_index: rest,
    web_search: rest,
  };
  probabilities[choice] = probability;
  return { type: 'choice', choice, confidence: probability, probabilities };
}

test('a confident developer verdict fills in the developer category', async () => {
  const fetchImpl = stubFetch(verdict('developer_index'));
  const body = {
    query: 'asyncpg vs psycopg3 connection pool',
    origin: 'mcp-fastmcp@3.24.1',
  };

  const decision = await applyQueryRouting(body, CONFIG, { fetchImpl });

  assert.equal(decision.routed, true);
  assert.equal(decision.target, 'developer_category');
  assert.equal(decision.category, 'developer');
  assert.deepEqual(body.categories, ['developer']);
  // The rest of the outbound body is untouched.
  assert.equal(body.query, 'asyncpg vs psycopg3 connection pool');
  assert.equal(body.origin, 'mcp-fastmcp@3.24.1');
});

test('a confident research verdict retargets to the paper index and does not touch the body', async () => {
  const fetchImpl = stubFetch(verdict('research_index', 0.95));
  const body = { query: 'sleep regularity index mortality UK Biobank' };

  const decision = await applyQueryRouting(body, CONFIG, { fetchImpl });

  assert.equal(decision.routed, true);
  assert.equal(decision.target, 'research_paper_index');
  // The research route is a different endpoint, so nothing is added to the
  // /v2/search body — the caller issues the paper-index request instead.
  assert.equal(decision.category, undefined);
  assert.equal(body.categories, undefined);
  assert.deepEqual(Object.keys(body), ['query']);
});

test('a research verdict is dropped when the paper index is unreachable', async () => {
  // Keyless sessions, and domain-scoped searches, pass allowPaperIndex: false.
  const fetchImpl = stubFetch(verdict('research_index', 0.99));
  const body = { query: 'crispr base editing off-target effects in vivo' };

  const decision = await applyQueryRouting(body, CONFIG, {
    fetchImpl,
    allowPaperIndex: false,
  });

  assert.equal(decision.routed, false);
  assert.equal(decision.reason, 'paper_index_unavailable');
  assert.equal(decision.target, undefined);
  assert.equal(body.categories, undefined);
  // The verdict is still reported, so the log line explains the drop.
  assert.equal(decision.label, 'research_index');
  assert.equal(decision.probability, 0.99);
});

test('a research verdict is dropped when the call asked for scrapeOptions', async () => {
  // The paper index returns papers, not pages, so there is nothing to attach
  // the requested page content to. Retargeting would silently drop it.
  const fetchImpl = stubFetch(verdict('research_index', 0.99));
  const body = {
    query: 'mRNA vaccine thermostability lipid nanoparticle',
    scrapeOptions: { formats: ['markdown'] },
  };

  const decision = await applyQueryRouting(body, CONFIG, { fetchImpl });

  assert.equal(decision.routed, false);
  assert.equal(decision.reason, 'scrape_options_requested');
  assert.equal(decision.target, undefined);
  assert.deepEqual(body.scrapeOptions, { formats: ['markdown'] });
  assert.equal(body.categories, undefined);
});

test('a research verdict is dropped when the call asked for domainTools', async () => {
  // Alexandria tool suggestions ride along with web results. The paper index
  // has none to offer, so retargeting would drop them.
  const fetchImpl = stubFetch(verdict('research_index', 0.99));
  const body = {
    query: 'protein folding inference benchmarks',
    domainTools: true,
  };

  const decision = await applyQueryRouting(body, CONFIG, { fetchImpl });

  assert.equal(decision.routed, false);
  assert.equal(decision.reason, 'domain_tools_requested');
  assert.equal(decision.target, undefined);
  assert.equal(body.categories, undefined);
});

test('scrapeOptions does not block the developer route', async () => {
  // Developer stays on /v2/search, so the requested page content is still
  // attached to the results.
  const fetchImpl = stubFetch(verdict('developer_index'));
  const body = {
    query: 'pnpm workspace protocol resolution',
    scrapeOptions: { formats: ['markdown'] },
  };

  const decision = await applyQueryRouting(body, CONFIG, { fetchImpl });

  assert.equal(decision.routed, true);
  assert.deepEqual(body.categories, ['developer']);
  assert.deepEqual(body.scrapeOptions, { formats: ['markdown'] });
});

test('allowPaperIndex: false still permits the developer route', async () => {
  const fetchImpl = stubFetch(verdict('developer_index'));
  const body = { query: 'kubectl rollout restart deployment' };

  const decision = await applyQueryRouting(body, CONFIG, {
    fetchImpl,
    allowPaperIndex: false,
  });

  assert.equal(decision.routed, true);
  assert.deepEqual(body.categories, ['developer']);
});

test('a confident web verdict leaves the call untargeted', async () => {
  const fetchImpl = stubFetch(verdict('web_search', 1));
  const body = { query: 'Brooklinen hand towel price' };

  const decision = await applyQueryRouting(body, CONFIG, { fetchImpl });

  assert.equal(decision.routed, false);
  assert.equal(decision.reason, 'no_route_for_label');
  assert.equal(body.categories, undefined);
});

test('the gate is the winning probability, strictly above the threshold', async () => {
  // Exactly at the threshold must not route; just above it must.
  const at = stubFetch({
    type: 'choice',
    choice: 'developer_index',
    confidence: 0.99,
    probabilities: { developer_index: 0.8, research_index: 0.1, web_search: 0.1 },
  });
  const atBody = { query: 'something arguably technical' };
  const atDecision = await applyQueryRouting(atBody, CONFIG, { fetchImpl: at });
  assert.equal(atDecision.routed, false);
  assert.equal(atDecision.reason, 'below_threshold');
  assert.equal(atBody.categories, undefined);

  const above = stubFetch({
    type: 'choice',
    choice: 'developer_index',
    confidence: 0.4,
    probabilities: {
      developer_index: 0.81,
      research_index: 0.09,
      web_search: 0.1,
    },
  });
  const aboveBody = { query: 'something arguably technical' };
  const aboveDecision = await applyQueryRouting(aboveBody, CONFIG, {
    fetchImpl: above,
  });
  // Low distribution concentration no longer blocks a clear winner: the
  // probability is what the threshold reads.
  assert.equal(aboveDecision.routed, true);
  assert.equal(aboveDecision.probability, 0.81);
  assert.equal(aboveDecision.confidence, 0.4);
  assert.deepEqual(aboveBody.categories, ['developer']);

  const below = stubFetch({
    type: 'choice',
    choice: 'developer_index',
    confidence: 1,
    probabilities: {
      developer_index: 0.69,
      research_index: 0.0,
      web_search: 0.31,
    },
  });
  const belowBody = { query: 'something arguably technical' };
  const belowDecision = await applyQueryRouting(belowBody, CONFIG, {
    fetchImpl: below,
  });
  assert.equal(belowDecision.routed, false);
  assert.equal(belowDecision.reason, 'below_threshold');
});

test('a probability that is not a probability cannot clear the threshold', async () => {
  // Strings and booleans are included deliberately: Number('0.9') is 0.9 and
  // Number(true) is 1, so coercing before the range check would let a
  // malformed answer route the search.
  for (const probability of [
    5,
    1.0001,
    -1,
    Number.NaN,
    'high',
    '0.9',
    '1',
    true,
    null,
    undefined,
    {},
    [0.9],
  ]) {
    const fetchImpl = stubFetch({
      type: 'choice',
      choice: 'developer_index',
      confidence: 1,
      probabilities: { developer_index: probability },
    });
    const body = { query: 'react hooks exhaustive-deps' };
    const decision = await applyQueryRouting(body, CONFIG, { fetchImpl });
    assert.equal(
      decision.routed,
      false,
      `probability ${JSON.stringify(probability)} should not route`
    );
    assert.equal(decision.reason, 'below_threshold');
    assert.equal(decision.probability, 0);
    assert.equal(body.categories, undefined);
  }
});

test('a label inherited from Object.prototype is not a route', async () => {
  // `config.routes[label]` alone would resolve `constructor` to a function.
  for (const choice of [
    'constructor',
    'toString',
    '__proto__',
    'hasOwnProperty',
  ]) {
    const fetchImpl = stubFetch({
      type: 'choice',
      choice,
      confidence: 1,
      probabilities: { [choice]: 1 },
    });
    const body = { query: 'anything' };
    const decision = await applyQueryRouting(body, CONFIG, { fetchImpl });
    assert.equal(decision.routed, false, `${choice} should not route`);
    assert.equal(decision.reason, 'no_route_for_label');
    assert.equal(body.categories, undefined);
  }
});

test('a call that already names categories or sources is never overridden', async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    throw new Error('classifier must not be consulted');
  };

  const withCategories = { query: 'react hooks', categories: ['pdf'] };
  const a = await applyQueryRouting(withCategories, CONFIG, { fetchImpl });
  assert.equal(a.routed, false);
  assert.equal(a.reason, 'explicit_targeting');
  assert.deepEqual(withCategories.categories, ['pdf']);

  const withSources = { query: 'react hooks', sources: [{ type: 'news' }] };
  const b = await applyQueryRouting(withSources, CONFIG, { fetchImpl });
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
    [
      'answer without a choice',
      async () =>
        new Response(JSON.stringify({ answers: { index: {} } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      'missing_choice',
    ],
    [
      'non-string choice',
      async () =>
        new Response(
          JSON.stringify({ answers: { index: { choice: 7, confidence: 1 } } }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        ),
      'missing_choice',
    ],
  ];

  for (const [name, fetchImpl, expectedReason] of cases) {
    const body = { query: 'anything at all' };
    const decision = await applyQueryRouting(body, CONFIG, { fetchImpl });
    assert.equal(decision.routed, false, `${name} should not route`);
    assert.equal(decision.reason, expectedReason, name);
    assert.equal(body.categories, undefined, `${name} must leave the body alone`);
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
    const decision = await applyQueryRouting(body, CONFIG, { fetchImpl });
    assert.equal(decision.routed, false);
    assert.equal(decision.reason, 'no_query');
  }
});

test('the classifier is asked one Choice question over the query alone', async () => {
  const calls = [];
  const fetchImpl = stubFetch(verdict('web_search', 1), { calls });

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
    developer_index: 'developer_category',
    research_index: 'research_paper_index',
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

test('env configuration resolves the timeout, its floor, and the endpoint', () => {
  const base = { FIRECRAWL_QUERY_ROUTER: 'true', TYPESAFE_API_KEY: 'k' };

  assert.equal(routerConfigFromEnv(base).timeoutMs, DEFAULT_TIMEOUT_MS);
  assert.equal(routerConfigFromEnv(base).endpoint, DEFAULT_ENDPOINT);

  assert.equal(
    routerConfigFromEnv({ ...base, FIRECRAWL_QUERY_ROUTER_TIMEOUT_MS: '1500' })
      .timeoutMs,
    1500
  );
  // The floor keeps a too-small value from making every classification time
  // out, which would look like the router silently doing nothing.
  for (const tooSmall of ['50', '0', '-1']) {
    assert.equal(
      routerConfigFromEnv({
        ...base,
        FIRECRAWL_QUERY_ROUTER_TIMEOUT_MS: tooSmall,
      }).timeoutMs,
      250,
      `timeout ${tooSmall} should be floored at 250ms`
    );
  }
  assert.equal(
    routerConfigFromEnv({ ...base, FIRECRAWL_QUERY_ROUTER_TIMEOUT_MS: 'abc' })
      .timeoutMs,
    DEFAULT_TIMEOUT_MS
  );

  assert.equal(
    routerConfigFromEnv({
      ...base,
      FIRECRAWL_QUERY_ROUTER_ENDPOINT: 'https://classifier.test/v1/systemone',
    }).endpoint,
    'https://classifier.test/v1/systemone'
  );
  assert.equal(
    routerConfigFromEnv({ ...base, FIRECRAWL_QUERY_ROUTER_ENDPOINT: '   ' })
      .endpoint,
    DEFAULT_ENDPOINT,
    'a blank endpoint falls back to the default'
  );
  assert.equal(
    routerConfigFromEnv({ ...base, FIRECRAWL_QUERY_ROUTER_MODEL: 'jev-1.13.0' })
      .model,
    'jev-1.13.0'
  );
});

const PAPERS = [
  {
    id: 'arxiv:2401.00001',
    title: 'A paper about something',
    authors: 'A. Researcher; B. Coauthor',
    abstract: 'We show that things are true.',
    categories: ['cs.LG'],
    createdDate: '2026-01-02',
  },
  {
    id: 'pmid:12345678',
    title: 'A paper with no authors listed',
    authors: null,
    abstract: '',
  },
];

test('a retargeted response never carries a search id', () => {
  const body = routedPaperResponse('crispr off-target effects', PAPERS);

  // The load-bearing guarantee: firecrawl_search_feedback validates a UUID
  // that came from firecrawl_search, and a paper-index request issues none.
  assert.equal('id' in body, false);
  assert.equal(body.searchFeedback.available, false);
  assert.match(body.searchFeedback.reason, /firecrawl_search_feedback/);
});

test('a retargeted response declares the surface it came from', () => {
  const body = routedPaperResponse('crispr off-target effects', PAPERS);

  assert.equal(body.success, true);
  assert.equal(body.routedTo, 'research_paper_index');
  assert.equal(body.query, 'crispr off-target effects');
  assert.deepEqual(body.data, { papers: PAPERS });
  // Top-level shape is pinned so a field cannot be added or dropped silently.
  assert.deepEqual(Object.keys(body).sort(), [
    'data',
    'notice',
    'query',
    'routedTo',
    'searchFeedback',
    'success',
  ]);
});

test('the notice warns that these are papers and that feedback does not apply', () => {
  const body = routedPaperResponse('anything', []);

  assert.equal(body.notice, PAPER_INDEX_NOTICE);
  assert.match(PAPER_INDEX_NOTICE, /papers, not web pages/);
  assert.match(PAPER_INDEX_NOTICE, /no search `id`/);
  assert.match(PAPER_INDEX_NOTICE, /firecrawl_search_feedback/);
  // It has to tell the agent how to get a plain web search back.
  assert.match(PAPER_INDEX_NOTICE, /`sources` or `categories`/);
});

test('an empty paper result is still a well-formed routed response', () => {
  const body = routedPaperResponse('no hits for this', []);

  assert.equal(body.success, true);
  assert.deepEqual(body.data, { papers: [] });
  assert.equal('id' in body, false);
  assert.equal(body.searchFeedback.available, false);
});
