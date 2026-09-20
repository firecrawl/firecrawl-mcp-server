import assert from 'node:assert/strict';
import test from 'node:test';
import { startStdioWithApi, callExpectingError, toolText } from './helpers/exchange-mcp.mjs';

test('provider terms tools read and accept exact reviewed terms only with confirmation', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const read = toolText(await client.request('tools/call', { name: 'firecrawl_terms_show', arguments: { provider: 'benzinga' } }));
  assert.equal(read.terms.document, 'Review this agreement.');
  assert.equal(read.terms.digest, 'a'.repeat(64));
  assert.match(read.guidance, /explicit authorization/);
  assert.equal(api.requests[0].method, 'GET');
  assert.equal(api.requests[0].url, '/exchange/provider-terms');
  const args = { provider: 'benzinga', version: read.terms.version, digest: read.terms.digest, confirmed: true };
  for (const [field, value] of [['confirmed', false], ['confirmed', undefined], ['version', ''], ['digest', 'invalid']]) {
    const error = await callExpectingError(client, { name: 'firecrawl_terms_accept', arguments: {...args, [field]:value} });
    assert.match(error.transportError?.message ?? JSON.stringify(error), new RegExp(field));
  }
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
