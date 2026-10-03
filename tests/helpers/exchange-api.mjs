import { createServer } from 'node:http';

const CAPABILITY_HIT = {
  provider: 'fred',
  capability: 'series/observations',
  concept: 'series/observations',
  cohorts: ['finance'],
  creditsCost: 1,
  similarity: 0.8123,
};

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
  const { keylessEligible = false } = options;
  const requests = [];
  const acceptedTerms = new Set();
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
    const json = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    if (req.method === 'POST' && (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody))) return json(400, {error:'Expected a JSON object body'});

    if (options.largeResult && (url.pathname === '/v2/search' || url.pathname.startsWith('/exchange/discover'))) return json(200, options.largeResult);
    if (options.apiStatus) return json(options.apiStatus, { success: false, error: 'Invalid API key' });

    if (req.method === 'GET' && url.pathname === '/v2/keyless/eligibility') {
      return json(200, { eligible: keylessEligible });
    }

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

      return json(200, {
        success: true,
        data: { tools: [CAPABILITY_HIT] },
        creditsUsed: 0,
        id: '00000000-0000-4000-8000-000000000000',
      });
    }

    // Mirrors the API route: a strict body, and nothing accepted when the
    // reviewed version or digest is not the current one.
    if (req.method === 'POST' && url.pathname === '/exchange/provider-terms/accept') {
      const { provider, version, digest, confirmed, ...extra } = parsedBody;
      if (Object.keys(extra).length || confirmed !== true || !provider || !version || !/^[a-f0-9]{64}$/.test(digest ?? ''))
        return json(400, { success: false, error: 'Send { provider, version, digest, confirmed: true } for one provider.' });
      if (version !== 'v1' || digest !== 'a'.repeat(64))
        return json(409, { success: false, error: 'Terms changed. Review the current version before accepting.', code: 'terms_changed', provider, version: 'v1', digest: 'a'.repeat(64) });
      acceptedTerms.add(provider);
      return json(200, { success: true, provider, version, digest, acceptedAt: '2026-10-02T00:00:00.000Z' });
    }

    if (req.method === 'POST' && url.pathname === '/v2/scrape') {
      const termsCall = Array.isArray(parsedBody.alexandria) ? parsedBody.alexandria[0] : parsedBody.alexandria;
      if (termsCall?.provider === 'firecrawl' && termsCall.capability === 'terms/show') {
        const data = { provider: 'benzinga', terms: { version: 'v1', digest: 'a'.repeat(64), document: 'Review this agreement.' }, status: { accepted: acceptedTerms.has('benzinga') } };
        return json(200, { success: true, data: { alexandria: [{ provider: 'firecrawl', capability: 'terms/show', creditsCost: 0, data }] } });
      }

      if (options.bashRecovery && parsedBody.alexandria?.capability === 'bash') {
        if (options.bashRecovery === 'missing') return json(200, { success: true, data: { alexandria: [{ error: { code: 'result_unavailable' } }] } });
        const identities = options.bashRecovery === 'partial' ? [] : options.largeResult.data.alexandria.map(item => [item.provider, item.capability]);
        return json(200, { success: true, data: { alexandria: [{ provider: 'firecrawl', capability: 'bash', data: { workspaceId: 'retained-workspace', exitCode: 0, stdout: JSON.stringify(identities), idleTtlSeconds: 300 } }] } });
      }
      if (options.largeResult) return json(200, options.largeResult);
      if (parsedBody.alexandria?.provider === 'firecrawl') return json(200, {success:true, data:{creditsCost:0, alexandria:[{provider:'firecrawl',capability:'find-tools',creditsCost:0,data:{level:'tools',items:[],total:4,next:{provider:'firecrawl',capability:'find-tools',options:{...parsedBody.alexandria.options, offset:4}}}}]}});

      if (parsedBody?.alexandria?.[0]?.provider === 'locked') {
        return json(403, {
          success: false,
          error: 'Exchange is not enabled for this team.',
        });
      }
      if (parsedBody?.alexandria?.[0]?.provider === 'benzinga') {
        if (acceptedTerms.has('benzinga') && !options.providerRefusal)
          return json(200, { success: true, data: { creditsCost: 1, alexandria: [{ provider: 'benzinga', capability: parsedBody.alexandria[0].capability, creditsCost: 1, data: { stories: [] } }] } });
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
