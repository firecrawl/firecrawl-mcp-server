import assert from 'node:assert/strict';
import test from 'node:test';
import { TERMS_REQUIRED_BODY } from './helpers/exchange-api.mjs';
import { startStdioWithApi, callExpectingError, toolText } from './helpers/exchange-mcp.mjs';

test('a terms block stops for the user, and only their explicit agreement is accepted through the write tool', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const listing = await client.request('tools/list', {});
  const termsTools = listing.tools.filter(tool => /terms/.test(tool.name));
  assert.deepEqual(termsTools.map(tool => tool.name), ['firecrawl_accept_provider_terms']);
  const { readOnlyHint, destructiveHint, openWorldHint } = termsTools[0].annotations;
  assert.deepEqual({ readOnlyHint, destructiveHint, openWorldHint }, { readOnlyHint: false, destructiveHint: false, openWorldHint: false });
  assert.deepEqual([...termsTools[0].inputSchema.required].sort(), ['digest', 'provider', 'version']);

  const blocked = await callExpectingError(client, { name: 'firecrawl_scrape', arguments: { alexandria: [{ provider: 'benzinga', capability: 'news/search' }] } });
  assert.equal(api.requests.length, 1, 'blocked requests never auto-accept');
  const { code, status, requiresAction, requestId, next_actions } = blocked.structuredContent;
  const text = blocked.content[0].text;
  assert.match(text, /Stop and ask the user before continuing/);
  assert.match(text, /Only if the user explicitly agrees to these terms, call firecrawl_accept_provider_terms with provider "benzinga" and the version and digest that terms\/show returned/);
  assert.match(text, /Never infer acceptance from a data request/);
  assert.match(text, /If the user declines, continue without this provider and tell the user it was not used/);
  assert.ok(text.includes(requiresAction.url), 'keeps the dashboard alternative');
  assert.match(text, /Reuse this ID only with the identical payload/);
  assert.doesNotMatch(text, /terms\/accept|confirmed: ?true|not through this connection/);
  assert.equal(code, TERMS_REQUIRED_BODY.code);
  assert.equal(status, 403);
  assert.deepEqual(requiresAction, TERMS_REQUIRED_BODY.requiresAction);
  assert.equal(requestId, api.requests[0].headers['x-request-id']);
  assert.ok(requestId);
  assert.deepEqual(next_actions, [
    { kind: 'human_action_required', action: 'accept_terms', who: 'user', tool: 'firecrawl_accept_provider_terms',
      url: requiresAction.url, provider: requiresAction.terms, version: requiresAction.version },
    { kind: 'retry_same_request', tool: 'firecrawl_scrape', requestId, after: 'human_action_required' },
  ]);
  assert.doesNotMatch(JSON.stringify(blocked), /fc-exchange-test/);

  const next = blocked.structuredContent.nextTool;
  assert.equal(next.name, 'firecrawl_scrape');
  assert.equal(next.arguments.alexandria[0].capability, 'terms/show');
  const read = toolText(await client.request('tools/call', next)).data.alexandria[0].data;
  assert.equal(read.terms.document, 'Review this agreement.');
  assert.equal(api.requests.length, 2);

  const options = { provider: 'benzinga', version: read.terms.version, digest: read.terms.digest, confirmed: true };
  for (const call of [
    { provider: 'firecrawl', capability: 'terms/accept', options },
    { provider: ' Firecrawl ', capability: 'Terms/Accept', options },
    { provider: 'firecrawl', capability: 'terms/revoke', options: { provider: 'benzinga' } },
  ]) {
    const refused = await callExpectingError(client, { name: 'firecrawl_scrape', arguments: { alexandria: [call] } });
    assert.match(refused.content[0].text, /firecrawl_scrape only reads provider terms, with terms\/show\. After the user explicitly agrees to them, accept them with firecrawl_accept_provider_terms/, call.capability);
  }
  assert.equal(api.requests.length, 2, 'scrape forwards no terms command other than terms/show');

  const accept = (args) => ({ name: 'firecrawl_accept_provider_terms', arguments: { provider: 'benzinga', ...args } });
  for (const args of [{ version: read.terms.version }, { version: read.terms.version, digest: 'A'.repeat(64) }, { digest: read.terms.digest }]) {
    await callExpectingError(client, accept(args));
  }
  assert.equal(api.requests.length, 2, 'malformed acceptances never reach the API');

  const changed = await callExpectingError(client, accept({ version: 'v0', digest: read.terms.digest }));
  assert.match(changed.content[0].text, /Terms changed\. Review the current version before accepting\./);
  assert.equal(api.requests.length, 3);

  const accepted = await client.request('tools/call', accept({ version: read.terms.version, digest: read.terms.digest }));
  const acceptance = { success: true, provider: 'benzinga', version: 'v1', digest: 'a'.repeat(64), acceptedAt: '2026-10-02T00:00:00.000Z' };
  assert.deepEqual(toolText(accepted), acceptance);
  assert.deepEqual(accepted.structuredContent, acceptance);
  const acceptRequest = api.requests.at(-1);
  assert.equal(acceptRequest.method, 'POST');
  assert.equal(acceptRequest.url, '/exchange/provider-terms/accept');
  assert.deepEqual(acceptRequest.body, { provider: 'benzinga', version: 'v1', digest: 'a'.repeat(64), confirmed: true });
  assert.equal(acceptRequest.headers.authorization, 'Bearer fc-exchange-test');

  const retried = toolText(await client.request('tools/call', { name: 'firecrawl_scrape', arguments: { alexandria: [{ provider: 'benzinga', capability: 'news/search' }], requestId } }));
  assert.equal(retried.data.alexandria[0].provider, 'benzinga');
  assert.equal(api.requests.at(-1).headers['x-request-id'], requestId, 'the retry keeps the original request ID');
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
      assert.match(blocked.content[0].text, /Acceptance may not restore disabled access; an organization admin can review access at https:\/\/www\.firecrawl\.dev\/app\/settings\?tab=data-sources/);
      assert.doesNotMatch(blocked.content[0].text, /terms\/accept|not through this connection/);
      const shown = toolText(await client.request('tools/call', blocked.structuredContent.nextTool));
      assert.equal(shown.data.alexandria[0].data.status.accepted, false);
      assert.equal(api.requests.length, 2);
      assert.equal(api.requests[1].body.alexandria[0].capability, 'terms/show');
    }
  }
});
