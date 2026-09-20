import assert from 'node:assert/strict';
import test from 'node:test';
import { startStdioWithApi, callExpectingError, toolText } from './helpers/exchange-mcp.mjs';

test('terms are disclosed after a blocked provider and use scrape instead of top-level tools', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const listing = await client.request('tools/list', {});
  assert.ok(!listing.tools.some(tool => /^firecrawl_terms_/.test(tool.name)));
  const blocked = await callExpectingError(client, { name: 'firecrawl_scrape', arguments: { alexandria: [{ provider: 'benzinga', capability: 'news/search' }] } });
  assert.equal(api.requests.length, 1, 'blocked requests never auto-accept');
  assert.match(blocked.content[0].text, /explicit authorization/);
  const next = blocked.structuredContent.nextTool;
  assert.equal(next.name, 'firecrawl_scrape');
  assert.equal(next.arguments.alexandria[0].capability, 'terms/show');
  const read = toolText(await client.request('tools/call', next)).data.alexandria[0].data;
  assert.equal(read.terms.document, 'Review this agreement.');
  const options = { provider: 'benzinga', version: read.terms.version, digest: read.terms.digest, confirmed: true };
  const accepted = toolText(await client.request('tools/call', { name: 'firecrawl_scrape', arguments: { alexandria: [{ provider: 'firecrawl', capability: 'terms/accept', options }] } }));
  assert.ok(accepted.data.alexandria[0].data.acceptedAt);
  assert.equal(api.requests.length, 3);
  assert.ok(api.requests.every(request => request.url === '/v2/scrape'));
  assert.deepEqual(api.requests[2].body.alexandria[0].options, options);
  assert.equal(api.requests[2].headers.authorization, 'Bearer fc-exchange-test');
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
