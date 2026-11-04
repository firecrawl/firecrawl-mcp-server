import assert from 'node:assert/strict';
import test from 'node:test';
import { callExpectingError, startStdioWithApi, toolText } from './helpers/exchange-mcp.mjs';

function embedRequests(api) {
  return api.requests.filter(request =>
    request.url?.startsWith('/exchange/discover') ||
    request.url === '/v2/search' ||
    request.body?.alexandria?.capability === 'find-tools'
  );
}

test('find-tools and discovery retry once after 503 query_embed_unavailable', async (t) => {
  const queryEmbed = { failures: 1, retryAfter: '0' };
  const { api, client } = await startStdioWithApi(t, { queryEmbed });
  const categories = toolText(await client.request('tools/call', { name: 'firecrawl_find_tools', arguments: {} }));
  assert.equal(categories.data.alexandria[0].data.level, 'categories');
  assert.equal(embedRequests(api).length, 2);

  queryEmbed.hits = 0;
  const found = toolText(await client.request('tools/call', { name: 'firecrawl_find_tools', arguments: { query: 'prices' } }));
  assert.equal(found.data.alexandria[0].capability, 'find-tools');
  assert.equal(api.requests.filter(request => request.body?.alexandria?.capability === 'find-tools').length, 2);

  queryEmbed.hits = 0;
  const started = Date.now();
  queryEmbed.retryAfter = '1';
  const searched = toolText(await client.request('tools/call', { name: 'firecrawl_search', arguments: { query: 'podcasts' } }));
  assert.equal(searched.success, true);
  assert.ok(Date.now() - started >= 900, 'search discovery should wait for Retry-After');
  assert.equal(api.requests.filter(request => request.url === '/v2/search').length, 2);

  queryEmbed.hits = 0;
  queryEmbed.retryAfter = '0';
  const listed = toolText(await client.request('tools/call', { name: 'firecrawl_find_skills', arguments: { query: 'digest' } }));
  assert.equal(listed.data.alexandria[0].capability, 'find-skills');
  assert.equal(api.requests.filter(request => request.body?.alexandria?.capability === 'find-skills').length, 2);

  queryEmbed.hits = 0;
  const providerSkills = toolText(await client.request('tools/call', { name: 'firecrawl_find_skills', arguments: { provider: 'acme', query: 'brief' } }));
  assert.equal(providerSkills.skills.length, 1);
  assert.equal(api.requests.filter(request => request.url?.startsWith('/exchange/provider-skills?') && request.url.includes('q=brief')).length, 2);
});

test('a second query_embed_unavailable failure is retryable and is not tried again', async (t) => {
  const { api, client } = await startStdioWithApi(t, { queryEmbed: { failures: 2, retryAfter: '0' } });
  const failed = await callExpectingError(client, { name: 'firecrawl_find_tools', arguments: { query: 'prices' } });
  assert.match(failed.content[0].text, /query_embed_unavailable/);
  assert.match(failed.content[0].text, /retry the same call/i);
  assert.equal(failed.structuredContent?.error?.retryable, true);
  assert.equal(failed.structuredContent?.error?.code, 'query_embed_unavailable');
  assert.equal(api.requests.filter(request => request.body?.alexandria?.capability === 'find-tools').length, 2);
});
