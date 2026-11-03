import { createServer } from 'node:http';

const CAPABILITY_HIT = {
  provider: 'fred',
  capability: 'series/observations',
  concept: 'series/observations',
  cohorts: ['finance'],
  creditsCost: 1,
  similarity: 0.8123,
};

const PRICED_TOOL = {
  id: 'fred/series/observations',
  provider: 'fred',
  capability: 'series/observations',
  description: 'Observations for a series.',
  creditsCost: 5,
  perRecord: true,
  recordsPerUnit: 10,
  zeroDataRetentionCreditsCost: 10,
  billing: { unitLabel: 'record' },
};

function providerSkillRecord(slug, providerName, plugin, pluginName, skill, name, description) {
  return {
    id: `provider:${slug}/${plugin}/${skill}`,
    name,
    description,
    provider: { slug, name: providerName },
    plugin: { id: plugin, displayName: pluginName },
    visibility: 'execution-only',
  };
}

function providerSkillDetail(slug, plugin, skill, content) {
  return {
    id: `provider:${slug}/${plugin}/${skill}`,
    name: skill,
    description: 'Write a brief.',
    provider: { slug, name: slug === 'acme' ? 'Acme' : slug },
    plugin: { id: plugin, displayName: plugin },
    files: [{ path: `${skill}/SKILL.md`, bytes: content.length, kind: 'md' }],
    content,
    visibility: 'execution-only',
  };
}

const EXCHANGE_CALL = {
  provider: 'fred',
  capability: 'series/observations',
  options: { series_id: 'CPIAUCSL' },
};

const TERMS_REQUIRED_BODY = {
  success: false,
  code: "THIRD_PARTY_DATA_TERMS_REQUIRED",
  error:
    "An organization admin must accept the benzinga provider's terms (version 2026-09-12-placeholder) before this request can run. Accept them at https://www.firecrawl.dev/app/alexandria/benzinga",
  requiresAction: {
    type: "accept_terms",
    terms: "benzinga",
    version: "2026-09-12-placeholder",
    url: "https://www.firecrawl.dev/app/alexandria/benzinga",
  },
};

async function startFakeExchangeApi(options = {}) {
  const requests = [];
  const server = createServer(async (req, res) => {
    try {
    let raw = '';
    req.setEncoding('utf8');
    for await (const chunk of req) raw += chunk;
    const parsedBody =
      raw && (req.headers['content-type'] ?? '').includes('application/json')
        ? JSON.parse(raw)
        : undefined;
    requests.push({
      body: parsedBody,
      headers: req.headers,
      method: req.method,
      url: req.url,
    });
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const json = (status, body, headers = {}) => {
      res.writeHead(status, { 'content-type': 'application/json', ...headers });
      res.end(JSON.stringify(body));
    };

    const embedTarget =
      (req.method === 'GET' && url.pathname.startsWith('/exchange/discover')) ||
      (req.method === 'POST' && url.pathname === '/v2/search') ||
      (req.method === 'POST' && url.pathname === '/v2/scrape' && parsedBody?.alexandria?.provider === 'firecrawl' && parsedBody?.alexandria?.capability === 'find-tools');
    if (options.queryEmbed && embedTarget) {
      const state = options.queryEmbed;
      state.hits = (state.hits ?? 0) + 1;
      if (state.hits <= (state.failures ?? 1)) {
        return json(503, {
          success: false,
          code: 'query_embed_unavailable',
          error: 'Query embedding is temporarily unavailable.',
        }, { 'retry-after': String(state.retryAfter ?? '0') });
      }
    }

    if (req.method === 'POST' && (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody))) return json(400, {error:'Expected a JSON object body'});

    if (options.largeResult && (url.pathname === '/v2/search' || url.pathname.startsWith('/exchange/discover'))) return json(200, options.largeResult);
    if (options.apiStatus) return json(options.apiStatus, { success: false, error: options.apiError ?? 'Invalid API key' });

    if (url.pathname === '/exchange/skills/resolve')
      return json(200, { skills: [{ id: 'particle-podcasts' }] });
    if (url.pathname === '/exchange/skills/particle-podcasts/SKILL.md') {
      res.writeHead(200, { 'content-type': 'text/markdown' });
      return res.end('# Particle podcasts');
    }
    if (req.method === 'POST' && url.pathname === '/v2/search') {
      if (options.searchRefusal && (parsedBody.domainTools || parsedBody.sources?.includes('alexandria'))) {
        return json(403, { success: false, error: options.searchRefusal });
      }

      if (options.searchSkills) {
        return json(200, {
          success: true,
          data: {
            skills: options.searchSkills,
            web: [{ url: 'https://example.com', title: 'Example', description: 'A page.' }],
            tools: [CAPABILITY_HIT],
          },
          creditsUsed: 0,
          id: '00000000-0000-4000-8000-000000000000',
        });
      }
      return json(200, {
        success: true,
        data: { tools: [CAPABILITY_HIT] },
        creditsUsed: 0,
        id: '00000000-0000-4000-8000-000000000000',
      });
    }

    if (req.method === 'POST' && url.pathname === '/v2/scrape') {
      const termsCall = Array.isArray(parsedBody.alexandria) ? parsedBody.alexandria[0] : parsedBody.alexandria;
      if (termsCall?.provider === 'firecrawl' && ['terms/show', 'terms/accept'].includes(termsCall.capability)) {
        if (termsCall.capability === 'terms/accept' && (!termsCall.options?.version || !termsCall.options?.digest || termsCall.options?.confirmed !== true)) return json(400, { success: false, error: 'Reviewed terms and confirmation are required.', code: 'invalid_option' });
        const data = termsCall.capability === 'terms/show'
          ? { provider: 'benzinga', terms: { version: 'v1', digest: 'a'.repeat(64), document: 'Review this agreement.' }, status: { accepted: false } }
          : { provider: 'benzinga', version: termsCall.options.version, digest: termsCall.options.digest, acceptedAt: '2026-09-20T00:00:00Z' };
        return json(200, { success: true, data: { alexandria: [{ provider: 'firecrawl', capability: termsCall.capability, creditsCost: 0, data }] } });
      }

      if (options.bashRecovery && parsedBody.alexandria?.capability === 'bash') {
        if (options.bashRecovery === 'missing') return json(200, { success: true, data: { alexandria: [{ error: { code: 'result_unavailable' } }] } });
        const identities = options.bashRecovery === 'partial' ? [] : options.largeResult.data.alexandria.map(item => [item.provider, item.capability]);
        return json(200, { success: true, data: { alexandria: [{ provider: 'firecrawl', capability: 'bash', data: { workspaceId: 'retained-workspace', exitCode: 0, stdout: JSON.stringify(identities), idleTtlSeconds: 300 } }] } });
      }
      if (options.largeResult) return json(200, options.largeResult);
      if (parsedBody.alexandria?.provider === 'firecrawl' && ['create-skill', 'update-skill'].includes(parsedBody.alexandria.capability)) {
        const id = parsedBody.alexandria.options.id ?? `team:${parsedBody.alexandria.options.slug ?? 'our-research'}`;
        const options = parsedBody.alexandria.options;
        return json(200, { success: true, data: { creditsCost: 0, alexandria: [{ provider: 'firecrawl', capability: parsedBody.alexandria.capability, creditsCost: 0, data: { id, skill: { slug: id.slice(5), version: parsedBody.alexandria.capability === 'update-skill' ? options.baseVersion + 1 : 1, enabled: options.enabled ?? true, discoverable: options.discoverable ?? true, sharePath: '/skills/s/not-a-page', publicId: 'not-a-page' }, warnings: [], next: { provider: 'firecrawl', capability: 'read-skill', options: { id } } } }] } });
      }
      if (parsedBody.alexandria?.provider === 'firecrawl' && parsedBody.alexandria.capability === 'find-skills') {
        return json(200, { success: true, data: { creditsCost: 0, alexandria: [{ provider: 'firecrawl', capability: 'find-skills', creditsCost: 0, data: { skills: [{ id: 'team:weekly-digest', name: 'Weekly digest', description: 'Summarise the week.', files: ['SKILL.md'], source: 'team', version: 2 }, { id: 'deep-research', name: 'Deep research', description: 'Research a topic.', files: ['SKILL.md', 'references/sources.md'], source: 'library', create: { provider: 'firecrawl', capability: 'create-skill', options: { from: 'deep-research' } } }], total: 2 } }] } });
      }
      if (parsedBody.alexandria?.provider === 'firecrawl' && parsedBody.alexandria.capability === 'read-skill') {
        const team = parsedBody.alexandria.options.id.startsWith('team:');
        return json(200, { success: true, data: { creditsCost: 0, alexandria: [{ provider: 'firecrawl', capability: 'read-skill', creditsCost: 0, data: team ? { id: parsedBody.alexandria.options.id, name: 'Weekly digest', path: 'SKILL.md', content: 'Team-authored.\n\n```\nRun fred/series/observations weekly.\n```', files: ['SKILL.md'], source: 'team', trust: 'team-authored', version: parsedBody.alexandria.options.version ?? 2, tools: [{ provider: 'fred', capability: 'series/observations', available: true, call: { provider: 'fred', capability: 'series/observations', options: {} } }] } : { id: parsedBody.alexandria.options.id, name: 'Deep research', path: parsedBody.alexandria.options.path ?? 'SKILL.md', content: '# Deep research', files: ['SKILL.md', 'references/sources.md'], source: 'library' } }] } });
      }
      if (parsedBody.alexandria?.provider === 'firecrawl') return json(200, {success:true, data:{creditsCost:0, alexandria:[{provider:'firecrawl',capability:'find-tools',creditsCost:0,data:{level:'tools',items:[PRICED_TOOL],relatedTools:[{group:'alternative',label:'Alternative sources',tools:[{tool:{...PRICED_TOOL,id:'bls/series'},reason:'r'}]}],total:4,next:{provider:'firecrawl',capability:'find-tools',options:{...parsedBody.alexandria.options, offset:4}}}}]}});

      if (parsedBody?.alexandria?.[0]?.provider === 'locked') {
        return json(403, {
          success: false,
          error: 'Exchange is not enabled for this team.',
        });
      }
      if (parsedBody?.alexandria?.[0]?.provider === 'benzinga') {
        return json(403, options.providerRefusal ? { success: false, error: options.providerRefusal } : TERMS_REQUIRED_BODY);
      }
      if (parsedBody?.alexandria?.[0]?.provider === 'inflight') {
        return json(409, {
          success: false,
          code: 'request_in_flight',
          chargeId: 'chg_0123456789',
          error: 'A request with this x-request-id is still in flight.',
        });
      }
      if (parsedBody?.alexandria) {
        return json(200, {
          success: true,
          scrape_id: '11111111-1111-4111-8111-111111111111',
          data: {
            alexandria: [
              {
                provider: 'fred',
                capability: 'series/observations',
                creditsCost: 1,
                data: {
                  observations: [{ date: '2026-01-01', value: '320.1' }],
                },
                records: 1,
                upstreamStatus: 200,
              },
              {
                provider: 'fred',
                capability: 'series/missing',
                error: {
                  code: 'capability_not_found',
                  message: 'Unknown capability',
                  status: 404,
                },
              },
            ],
            creditsCost: 1,
          },
        });
      }
      if (parsedBody?.url === 'https://benzinga.example/news') {
        return json(403, options.providerRefusal ? { success: false, error: options.providerRefusal } : TERMS_REQUIRED_BODY);
      }
      if (parsedBody?.url) {
        return json(200, {
          success: true,
          data: parsedBody.domainTools
            ? { markdown: '# hi', tools: [CAPABILITY_HIT] }
            : { markdown: '# hi' },
        });
      }
      return json(400, { success: false, error: 'url is required' });
    }

    if (req.method === 'GET' && url.pathname === '/exchange/provider-skills') {
      // Prod shape: provider and plugin are objects, there is no skill field, and a page is 20.
      // Without ?provider= the index leaves execution-only skills out, which is every skill here.
      const providerFilter = url.searchParams.get('provider');
      const q = (url.searchParams.get('q') ?? '').toLowerCase();
      const page = Number(url.searchParams.get('page') ?? '1');
      const pageSize = 20;
      if (!providerFilter) return json(200, { providers: [], plugins: [], skills: [], page: 1, limit: pageSize, total: 0 });
      const catalog = [
        providerSkillRecord('acme', 'Acme', 'research', 'Research', 'brief', 'Brief', 'Write a brief.'),
        providerSkillRecord('acme', 'Acme', 'research', 'Research', 'run', 'Run', 'Execute only.'),
        ...Array.from({ length: 18 }, (_, index) => providerSkillRecord('acme', 'Acme', 'research', 'Research', `pad-${index + 1}`, `Pad ${index + 1}`, 'Padding.')),
        providerSkillRecord('acme', 'Acme', 'research', 'Research', 'later', 'Later', 'On the second page.'),
        providerSkillRecord('fiber', 'Fiber', 'people', 'People', 'search', 'Search', 'Find people.'),
      ];
      const matched = catalog.filter((skill) => {
        if (skill.provider.slug !== providerFilter) return false;
        if (!q) return true;
        return `${skill.id} ${skill.name} ${skill.description}`.toLowerCase().includes(q);
      });
      const start = Math.max(0, page - 1) * pageSize;
      return json(200, {
        provider: { slug: providerFilter, name: providerFilter === 'acme' ? 'Acme' : 'Fiber' },
        plugins: [{ id: providerFilter === 'fiber' ? 'people' : 'research', displayName: providerFilter === 'fiber' ? 'People' : 'Research', visibility: 'execution-only' }],
        skills: matched.slice(start, start + pageSize),
        page,
        limit: pageSize,
        total: matched.length,
      });
    }
    if (req.method === 'GET' && url.pathname === '/exchange/provider-skills/acme/research/brief') {
      return json(200, providerSkillDetail('acme', 'research', 'brief', '# Brief'));
    }
    if (req.method === 'GET' && url.pathname === '/exchange/provider-skills/acme/research/brief/file') {
      return json(200, { ...providerSkillDetail('acme', 'research', 'brief', '# Brief file'), path: 'brief/SKILL.md' });
    }

    if (req.method === 'GET' && url.pathname.startsWith('/exchange/discover')) {
      if (url.searchParams.get('q') === 'unindexed') {
        return json(501, {
          success: false,
          error: 'Semantic discovery is not configured.',
          code: 'semantic_not_configured',
        });
      }
      return json(200, {
        success: true,
        cohorts: [{cohort:'people',about:'People profiles',providers:1},{cohort:'finance',about:'Financial data',providers:2}],
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
      });
    }

    json(404, { success: false, error: `Unhandled ${req.method} ${req.url}` });
    } catch (error) {
      if (res.headersSent) {
        res.end();
        return;
      }
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({error: `Mock API failure: ${error?.message ?? String(error)}`}));
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    requests,
    url: `http://127.0.0.1:${server.address().port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}


export { CAPABILITY_HIT, EXCHANGE_CALL, TERMS_REQUIRED_BODY, startFakeExchangeApi };
