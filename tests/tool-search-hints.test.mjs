import assert from 'node:assert/strict';
import test from 'node:test';
import { assertAgentMetadataPolicy } from '../scripts/agent-metadata-policy.mjs';
import { startStdioWithApi } from './helpers/exchange-mcp.mjs';

// Claude's tool search reads `_meta["anthropic/searchHint"]` as extra match
// words for deferred tools. Every listed tool carries one, it stays a short
// keyword list, and it adds words rather than repeating the tool name.
test('every listed tool carries a short, neutral search hint', async (t) => {
  const { client } = await startStdioWithApi(t);
  const { tools } = await client.request('tools/list', {});
  assert.ok(tools.length > 10);
  for (const tool of tools) {
    const hint = tool._meta?.['anthropic/searchHint'];
    assert.equal(typeof hint, 'string', `${tool.name} has no search hint`);
    assert.equal(hint, hint.replace(/\s+/g, ' ').trim(), tool.name);
    assert.ok(hint.length <= 120, `${tool.name} hint is ${hint.length} chars`);
    assert.doesNotMatch(hint, /firecrawl/i, tool.name);
    const words = hint.split(' ');
    assert.ok(words.length >= 3, `${tool.name} hint has ${words.length} words`);
    const listed = new Set(
      `${tool.name} ${tool.description ?? ''}`.toLowerCase().split(/[^a-z0-9]+/)
    );
    assert.ok(
      words.some((word) => !listed.has(word.toLowerCase())),
      `${tool.name} hint adds no words beyond its name and description`
    );
  }
  assertAgentMetadataPolicy(
    tools.map((tool) => tool._meta['anthropic/searchHint']),
    assert
  );
});

test('search hints keep the existing always-load metadata', async (t) => {
  const { client } = await startStdioWithApi(t);
  const { tools } = await client.request('tools/list', {});
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  for (const name of ['firecrawl_search', 'firecrawl_scrape']) {
    assert.equal(byName.get(name)?._meta?.['anthropic/alwaysLoad'], true, name);
  }
  assert.equal(byName.get('firecrawl_map')?._meta?.['anthropic/alwaysLoad'], undefined);
});
