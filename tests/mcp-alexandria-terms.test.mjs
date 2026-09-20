import assert from 'node:assert/strict';
import test from 'node:test';
import { getFreePort, waitForHealth, parseSseJson, spawnServer, stopChild, startStdioWithApi, callExpectingError, toolText, httpToolCall } from './helpers/exchange-mcp.mjs';
import { TERMS_REQUIRED_BODY, startFakeExchangeApi } from './helpers/exchange-api.mjs';

test('provider terms tools read and accept exact reviewed terms only with confirmation', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const read = toolText(await client.request('tools/call', { name: 'firecrawl_terms_show', arguments: { provider: 'benzinga' } }));
  assert.equal(read.terms.document, 'Review this agreement.');
  assert.equal(read.terms.digest, 'a'.repeat(64));
  assert.match(read.guidance, /explicit authorization/);
  assert.equal(api.requests[0].method, 'GET');
  assert.equal(api.requests[0].url, '/exchange/provider-terms');
  const args = { provider: 'benzinga', version: read.terms.version, digest: read.terms.digest, confirmed: true };
  for (const invalid of [{ ...args, confirmed: false }, { ...args, confirmed: undefined }, { ...args, version: '' }, { ...args, digest: 'invalid' }])
    await callExpectingError(client, { name: 'firecrawl_terms_accept', arguments: invalid });
  assert.equal(api.requests.length, 1, 'invalid confirmation must never contact the API');
  const accepted = toolText(await client.request('tools/call', { name: 'firecrawl_terms_accept', arguments: args }));
  assert.equal(accepted.success, true);
  assert.deepEqual(api.requests[1].body, args);
  assert.equal(api.requests[1].method, 'POST');
  assert.equal(api.requests[1].url, '/exchange/provider-terms/accept');
  assert.equal(api.requests[1].headers.authorization, 'Bearer fc-exchange-test');
  for (const [options, status, code] of [[{ ...args, version: 'stale' }, 409, 'TERMS_VERSION_MISMATCH'], [{ ...args, provider: 'authority' }, 403, 'PROVIDER_TERMS_AUTHORITY_REQUIRED']]) {
    const before = api.requests.length;
    const error = await callExpectingError(client, { name: 'firecrawl_terms_accept', arguments: options });
    assert.equal(error.structuredContent.status, status);
    assert.equal(error.structuredContent.code, code);
    assert.ok(error.structuredContent.requiresAction.url);
    assert.equal(api.requests.length, before + 1, 'acceptance must not be automatically retried');
  }
});


test('terms reads explain eligibility failures and reject empty or malformed catalogs without leaking credentials', async (t) => {
  for (const options of [
    { termsCatalog: {} },
    { termsCatalog: { providers: [] } },
    { termsCatalog: { success: false, error: 'Team not enabled.', code: 'team_disabled' }, termsStatus: 403 },
  ]) {
    const { api, client } = await startStdioWithApi(t, options);
    const error = await callExpectingError(client, { name: 'firecrawl_terms_show', arguments: { provider: 'benzinga' } });
    assert.equal(error.isError, true);
    assert.doesNotMatch(JSON.stringify(error), /fc-exchange-test/);
    assert.equal(api.requests.length, 1);
    if (!options.termsStatus) {
      assert.match(error.content[0].text, options.termsCatalog.providers ? /Provider not found/ : /invalid catalog/);
    }
    if (options.termsStatus === 403) {
      assert.equal(error.structuredContent.code, 'team_disabled');
      assert.match(error.structuredContent.guidance, /https:\/\/www.firecrawl.dev\/app\/settings\?tab=data-sources/);
    }
  }
});


test('firecrawl_scrape relays an Alexandria THIRD_PARTY_DATA_TERMS_REQUIRED as a human handoff', async (t) => {
  const { api, client } = await startStdioWithApi(t);

  const result = await callExpectingError(client, {
    arguments: {
      alexandria: [{ provider: 'benzinga', capability: 'news', options: { tickers: 'AAPL' } }],
    },
    name: 'firecrawl_scrape',
  });
  assert.equal(api.requests.length, 1);
  assert.equal(result.transportError, undefined, 'a 403 must surface in-band');
  assert.match(result.content[0].text, /https:\/\/www\.firecrawl\.dev\/app\/alexandria\/benzinga/);
  assert.match(result.content[0].text, /admin/);
  assert.equal(result.structuredContent.code, 'THIRD_PARTY_DATA_TERMS_REQUIRED');
  assert.equal(result.structuredContent.status, 403);
  assert.deepEqual(
    result.structuredContent.requiresAction,
    TERMS_REQUIRED_BODY.requiresAction
  );
  const requestId = api.requests[0].headers['x-request-id'];
  assert.equal(result.structuredContent.requestId, requestId);
  assert.deepEqual(result.structuredContent.next_actions, [
    {
      kind: 'human_action_required',
      action: 'accept_terms',
      who: 'organization_admin',
      url: TERMS_REQUIRED_BODY.requiresAction.url,
      provider: 'benzinga',
      version: '2026-09-12-placeholder',
    },
    {
      kind: 'retry_same_request',
      tool: 'firecrawl_scrape',
      requestId,
      after: 'human_action_required',
    },
  ]);
});


test('plain-URL firecrawl_scrape relays the same Alexandria terms handoff from the SDK error', async (t) => {
  const { api, client } = await startStdioWithApi(t);

  const result = await callExpectingError(client, {
    arguments: { url: 'https://benzinga.example/news' },
    name: 'firecrawl_scrape',
  });
  assert.equal(api.requests.length, 1);
  assert.equal(result.transportError, undefined, 'a 403 must surface in-band');
  assert.match(result.content[0].text, /https:\/\/www\.firecrawl\.dev\/app\/alexandria\/benzinga/);
  assert.match(result.content[0].text, /admin/);
  assert.equal(result.structuredContent.code, 'THIRD_PARTY_DATA_TERMS_REQUIRED');
  assert.deepEqual(
    result.structuredContent.requiresAction,
    TERMS_REQUIRED_BODY.requiresAction
  );
  assert.equal(result.structuredContent.next_actions[1].tool, 'firecrawl_scrape');
  assert.equal(result.structuredContent.requestId, undefined);
  assert.equal(result.structuredContent.next_actions[1].requestId, undefined);
  assert.doesNotMatch(result.content[0].text, /and requestId/);
});


test('firecrawl_scrape relays a reserved 409 billing error with its code and chargeId', async (t) => {
  const { api, client } = await startStdioWithApi(t);

  const result = await callExpectingError(client, {
    arguments: {
      alexandria: [{ provider: 'inflight', capability: 'finance/x' }],
    },
    name: 'firecrawl_scrape',
  });
  assert.equal(api.requests.length, 1);
  assert.equal(result.transportError, undefined, 'a 409 must surface in-band');
  assert.match(
    result.content[0].text,
    /A request with this x-request-id is still in flight/
  );
  assert.deepEqual(result.structuredContent, {
    code: 'request_in_flight',
    status: 409,
    message: 'A request with this x-request-id is still in flight.',
    chargeId: 'chg_0123456789',
    requestId: api.requests[0].headers['x-request-id'],
  });
});


test('terms 401 responses recover credentials even without a JSON body', async (t) => {
  for (const termsRaw401 of ['empty', 'text']) {
    const api = await startFakeExchangeApi({ termsRaw401 });
    t.after(() => api.close());
    const port = await getFreePort();
    const child = spawnServer({
      CLOUD_SERVICE: 'false', FASTMCP_ENDPOINT: '/v2/mcp',
      FIRECRAWL_API_KEY: '', FIRECRAWL_OAUTH_TOKEN: '',
      FIRECRAWL_API_URL: api.url, HOST: '127.0.0.1',
      HTTP_STREAMABLE_SERVER: 'true', PORT: String(port),
    });
    t.after(() => stopChild(child));
    await waitForHealth(port, child);
    const response = await httpToolCall(port, {
      headers: { 'x-firecrawl-api-key': 'fc-invalid' },
      id: `terms-${termsRaw401}`,
      params: { name: 'firecrawl_terms_show', arguments: { provider: 'benzinga' } },
    });
    assert.equal(response.status, 200);
    const error = parseSseJson(await response.text()).result;
    assert.equal(error.isError, true);
    assert.equal(error.structuredContent.code, 'CREDENTIAL_INVALID');
    assert.doesNotMatch(JSON.stringify(error), /invalid_terms_response/);
    assert.equal(api.requests.length, 1);
  }
});

