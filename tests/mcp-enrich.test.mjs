import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import {
  EXCHANGE_KEY_REQUIRED_MESSAGE,
  callExpectingError,
  startStdio,
  toolText,
} from './helpers/exchange-mcp.mjs';

const PERSON_URL = 'https://www.linkedin.com/in/example';
const COMPANY_URL = 'https://ca.linkedin.com/company/example';
const SCRAPE_ID = '22222222-2222-4222-8222-222222222222';

function profileFor(url) {
  if (url.includes('/company/')) {
    return { name: 'Example Company', url };
  }
  if (url.endsWith('/disabled')) {
    return { status: 'disabled', steps: [] };
  }
  return { name: 'Example Person', headline: 'Example headline', url };
}

async function startEnrichApi() {
  const requests = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    req.setEncoding('utf8');
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : undefined;
    requests.push({
      body,
      headers: req.headers,
      method: req.method,
      url: req.url,
    });
    const url = body?.alexandria?.options?.url ?? '';
    const json = (status, payload) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    };
    if (req.method !== 'POST' || req.url !== '/v2/scrape') {
      return json(404, { success: false, error: 'unexpected request' });
    }
    if (url.endsWith('/hang')) return;
    if (url.endsWith('/refused')) {
      return json(403, {
        success: false,
        code: 'THIRD_PARTY_DATA_ENRICHMENT_NOT_ENABLED',
        error: 'Enrichment is not enabled for this kind of profile.',
      });
    }
    if (url.endsWith('/credits')) {
      return json(402, {
        success: false,
        error: 'Insufficient credits to run this request.',
        code: 'insufficient_credits',
      });
    }
    if (url.endsWith('/limited')) {
      return json(429, {
        success: false,
        error: 'Rate limit exceeded.',
        code: 'rate_limited',
      });
    }
    if (url.endsWith('/down')) {
      return json(503, {
        success: false,
        error: 'Exchange is unavailable.',
        code: 'exchange_unavailable',
      });
    }
    if (url.endsWith('/missing')) {
      return json(200, {
        success: true,
        scrape_id: SCRAPE_ID,
        data: {
          creditsCost: 0,
          alexandria: [
            {
              provider: 'firecrawl',
              capability: 'enrich',
              creditsCost: 99,
              error: {
                code: 'record_not_found',
                message: 'No enrichment record for this URL.',
                status: 404,
              },
            },
          ],
        },
      });
    }
    json(200, {
      success: true,
      scrape_id: SCRAPE_ID,
      data: {
        creditsCost: url.includes('/company/') ? 12 : 30,
        alexandria: [
          {
            provider: 'firecrawl',
            capability: 'enrich',
            creditsCost: 99,
            data: profileFor(url),
          },
        ],
      },
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  return {
    requests,
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function session(t) {
  const api = await startEnrichApi();
  t.after(() => api.close());
  const started = await startStdio(t, {
    CLOUD_SERVICE: 'false',
    FIRECRAWL_API_KEY: 'fc-exchange-test',
    FIRECRAWL_API_URL: api.url,
  });
  return { api, ...started };
}

function enrichCall(requests) {
  const call = requests.find((request) => request.url === '/v2/scrape');
  assert.ok(call, 'expected a /v2/scrape request');
  return call;
}

test('firecrawl_enrich infers a person from the LinkedIn URL and posts firecrawl/enrich', async (t) => {
  const { api, client } = await session(t);
  const result = toolText(
    await client.request('tools/call', {
      name: 'firecrawl_enrich',
      arguments: { target: { url: PERSON_URL } },
    })
  );
  const call = enrichCall(api.requests);
  assert.equal(call.method, 'POST');
  assert.equal(call.headers.authorization, 'Bearer fc-exchange-test');
  assert.match(call.headers['x-request-id'], /^[A-Za-z0-9._:-]{1,128}$/);
  assert.deepEqual(call.body.alexandria, {
    provider: 'firecrawl',
    capability: 'enrich',
    options: { url: PERSON_URL, format: 'json' },
  });
  assert.deepEqual(Object.keys(call.body).sort(), ['alexandria', 'origin']);
  assert.equal(typeof call.body.origin, 'string');
  assert.equal(result.success, true);
  assert.equal(result.requestId, call.headers['x-request-id']);
  assert.equal(result.scrape_id, SCRAPE_ID);
  assert.equal(result.creditsCost, 30);
  assert.deepEqual(result.target, { type: 'person', url: PERSON_URL });
  assert.deepEqual(result.profile, {
    name: 'Example Person',
    headline: 'Example headline',
    url: PERSON_URL,
  });
  assert.equal('creditsCost' in result.profile, false);
});

test('an explicit company target is sent as the same waterfall call', async (t) => {
  const { api, client } = await session(t);
  const requestId = 'enrich-company-1';
  const result = toolText(
    await client.request('tools/call', {
      name: 'firecrawl_enrich',
      arguments: {
        target: { type: 'company', url: `${COMPANY_URL}/?trk=company` },
        requestId,
      },
    })
  );
  const call = enrichCall(api.requests);
  assert.equal(call.headers['x-request-id'], requestId);
  assert.deepEqual(call.body.alexandria.options, {
    url: COMPANY_URL,
    format: 'json',
  });
  assert.equal(result.creditsCost, 12);
  assert.deepEqual(result.target, { type: 'company', url: COMPANY_URL });
  assert.equal(result.profile.name, 'Example Company');
});

test('a LinkedIn URL is canonicalized before it is sent', async (t) => {
  const { api, client } = await session(t);
  const result = toolText(
    await client.request('tools/call', {
      name: 'firecrawl_enrich',
      arguments: {
        target: {
          url: 'http://www.linkedin.com/in/example/?trk=public_profile#about',
        },
      },
    })
  );
  const call = enrichCall(api.requests);
  assert.deepEqual(call.body.alexandria.options, {
    url: PERSON_URL,
    format: 'json',
  });
  assert.equal('timeout' in call.body, false);
  assert.deepEqual(result.target, { type: 'person', url: PERSON_URL });
  assert.equal(result.profile.url, PERSON_URL);
});

test('a disabled waterfall payload is a failure, not a profile', async (t) => {
  const { client } = await session(t);
  const result = toolText(
    await client.request('tools/call', {
      name: 'firecrawl_enrich',
      arguments: { target: { url: 'https://www.linkedin.com/in/disabled' } },
    })
  );
  assert.equal(result.success, false);
  assert.equal(result.profile, undefined);
  assert.equal(result.target.type, 'person');
  assert.equal(
    result.message,
    'Enrichment is disabled for this profile. No profile was returned.'
  );
  assert.equal(result.creditsCost, 30);
});

test('a provider miss keeps the envelope credit total and the item error', async (t) => {
  const { client } = await session(t);
  const result = toolText(
    await client.request('tools/call', {
      name: 'firecrawl_enrich',
      arguments: { target: { url: 'https://linkedin.com/in/missing' } },
    })
  );
  assert.equal(result.success, false);
  assert.equal(result.creditsCost, 0);
  assert.equal(result.profile, undefined);
  assert.deepEqual(result.error, {
    code: 'record_not_found',
    message: 'No enrichment record for this URL.',
    status: 404,
  });
});

test('billing, rate limit, and upstream failures are returned with the request id', async (t) => {
  const { api, client } = await session(t);
  const cases = [
    ['https://www.linkedin.com/in/credits', 'Insufficient credits to run this request.'],
    ['https://www.linkedin.com/in/limited', 'Rate limit exceeded.'],
    ['https://www.linkedin.com/in/down', 'Exchange is unavailable.'],
  ];
  for (const [url, message] of cases) {
    const result = await client.request('tools/call', {
      name: 'firecrawl_enrich',
      arguments: { target: { url } },
    });
    assert.equal(result.isError, true, JSON.stringify(result));
    assert.match(result.content[0].text, new RegExp(message));
    assert.equal(result.structuredContent.message, message);
    assert.match(result.structuredContent.requestId, /^[A-Za-z0-9._:-]{1,128}$/);
  }
  assert.equal(api.requests.length, cases.length);
});

test('a hung enrichment reports the client timeout', { timeout: 20_000 }, async (t) => {
  const { api, client } = await session(t);
  const result = await client.request('tools/call', {
    name: 'firecrawl_enrich',
    arguments: {
      target: { url: 'https://www.linkedin.com/in/hang' },
      timeout: 200,
    },
  });
  assert.equal(result.isError, true, JSON.stringify(result));
  assert.match(result.content[0].text, /timeout of \d+ms exceeded/);
  assert.match(result.content[0].text, /Request ID: /);
  const call = enrichCall(api.requests);
  assert.equal(call.body.timeout, 200);
  assert.equal(call.body.alexandria.options.url, 'https://www.linkedin.com/in/hang');
});

test('an enrichment refusal is returned with the request id', async (t) => {
  const { api, client } = await session(t);
  const result = await client.request('tools/call', {
    name: 'firecrawl_enrich',
    arguments: { target: { url: 'https://www.linkedin.com/in/refused' } },
  });
  assert.equal(result.isError, true, JSON.stringify(result));
  assert.match(
    result.content[0].text,
    /Enrichment is not enabled for this kind of profile/
  );
  assert.match(result.content[0].text, /Request ID: /);
  assert.equal(
    result.structuredContent.requestId,
    enrichCall(api.requests).headers['x-request-id']
  );
});

test('invalid targets and extra lookup fields are rejected before a request', async (t) => {
  const { api, client } = await session(t);
  const invalid = [
    { target: { type: 'person', url: COMPANY_URL } },
    { target: { url: 'https://example.com/in/someone' } },
    { target: { url: 'https://www.linkedin.com/in/example/details/experience' } },
    { target: { url: 'https://www.linkedin.com/school/example' } },
    { target: { url: PERSON_URL }, email: 'person@example.com' },
    { target: { url: PERSON_URL, name: 'Example', domain: 'example.com' } },
    {},
  ];
  for (const args of invalid) {
    await callExpectingError(client, {
      name: 'firecrawl_enrich',
      arguments: args,
    });
  }
  assert.equal(api.requests.length, 0);
});

test('a keyless session is refused before any enrich request', async (t) => {
  const { client } = await startStdio(t, {
    FIRECRAWL_API_KEY: '',
    FIRECRAWL_API_URL: '',
    FIRECRAWL_OAUTH_TOKEN: '',
  });
  const result = await client.request('tools/call', {
    name: 'firecrawl_enrich',
    arguments: { target: { url: PERSON_URL } },
  });
  assert.equal(result.isError, true, JSON.stringify(result));
  assert.equal(result.content[0].text, EXCHANGE_KEY_REQUIRED_MESSAGE);
  assert.deepEqual(result.structuredContent, {
    message: EXCHANGE_KEY_REQUIRED_MESSAGE,
  });
});
