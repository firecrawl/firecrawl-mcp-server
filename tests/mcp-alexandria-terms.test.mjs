import assert from 'node:assert/strict';
import test from 'node:test';
import { TERMS_REQUIRED_BODY } from './helpers/exchange-api.mjs';
import { startStdioWithApi, callExpectingError, toolText } from './helpers/exchange-mcp.mjs';

test('terms are disclosed after a blocked provider and use scrape instead of top-level tools', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const listing = await client.request('tools/list', {});
  assert.ok(!listing.tools.some(tool => /^firecrawl_terms_/.test(tool.name)));
  const blocked = await callExpectingError(client, { name: 'firecrawl_scrape', arguments: { alexandria: [{ provider: 'benzinga', capability: 'news/search' }] } });
  assert.equal(api.requests.length, 1, 'blocked requests never auto-accept');
  assert.match(blocked.content[0].text, /explicit authorization/);
  const { code, status, requiresAction, requestId, next_actions } = blocked.structuredContent;
  assert.equal(code, TERMS_REQUIRED_BODY.code);
  assert.equal(status, 403);
  assert.deepEqual(requiresAction, TERMS_REQUIRED_BODY.requiresAction);
  assert.equal(requestId, api.requests[0].headers['x-request-id']);
  assert.ok(requestId);
  assert.deepEqual(next_actions, [
    { kind: 'human_action_required', action: 'accept_terms', who: 'organization_admin',
      url: requiresAction.url, provider: requiresAction.terms, version: requiresAction.version },
    { kind: 'retry_same_request', tool: 'firecrawl_scrape', requestId, after: 'human_action_required' },
  ]);
  assert.doesNotMatch(JSON.stringify(blocked), /fc-exchange-test/);

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
  // The error keeps the conversation's thread alongside the billing fields,
  // and the same thread reached the API on the failed request.
  assert.match(result.structuredContent.threadId, /^[0-9a-f-]{36}$/);
  assert.equal(
    api.requests[0].headers['x-firecrawl-thread-id'],
    result.structuredContent.threadId
  );
  const { threadId: _thread, ...billing } = result.structuredContent;
  assert.deepEqual(billing, {
    code: 'request_in_flight',
    status: 409,
    message: 'A request with this x-request-id is still in flight.',
    chargeId: 'chg_0123456789',
    requestId: api.requests[0].headers['x-request-id'],
  });
});


test('disabled provider offers read-only terms recovery without treating other refusals as terms', async (t) => {
  for (const [message, expected] of [
    ['Access to benzinga is disabled for this organization.', true],
    ['Permission denied.', false],
    ['Access to another-provider is disabled for this organization.', false],
  ]) {
    const { api, client } = await startStdioWithApi(t, { providerRefusal: message });
    const blocked = await callExpectingError(client, { name: 'firecrawl_scrape', arguments: { alexandria: [{ provider: 'benzinga', capability: 'news/search' }] } });
    assert.equal(api.requests.length, 1);
    assert.equal(blocked.structuredContent.status, 403);
    assert.equal(Boolean(blocked.structuredContent.nextTool), expected, message);
    if (expected) {
      assert.match(blocked.content[0].text, /explicit authorization/);
      const shown = toolText(await client.request('tools/call', blocked.structuredContent.nextTool));
      assert.equal(shown.data.alexandria[0].data.status.accepted, false);
      assert.equal(api.requests.length, 2);
      assert.equal(api.requests[1].body.alexandria[0].capability, 'terms/show');
    }
  }
});
