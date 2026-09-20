import assert from 'node:assert/strict';
import test from 'node:test';
import { assertAgentMetadataPolicy } from '../scripts/agent-metadata-policy.mjs';
import { startStdio } from './helpers/exchange-mcp.mjs';

test('exchange tool metadata: discover is listed, scrape url is optional, language passes policy', async (t) => {
  const { client, init, getStderr } = await startStdio(t, {
    FIRECRAWL_API_KEY: 'fc-exchange-test',
  });
  const tools = await client.request('tools/list');
  const byName = new Map(tools.tools.map((tool) => [tool.name, tool]));

  const discover = byName.get('firecrawl_exchange_discover');
  assert.ok(discover, 'firecrawl_exchange_discover must be listed with a key');
  assert.equal(discover.annotations.readOnlyHint, true);
  assert.deepEqual(discover.inputSchema.required ?? [], []);
  assert.match(
    discover.description,
    /walk the catalogue.*search semantically with `q`/is
  );
  assert.match(discover.description, /firecrawl_scrape.*`alexandria`/s);

  const scrape = byName.get('firecrawl_scrape');
  assert.equal((scrape.inputSchema.required ?? []).includes('url'), false);
  assert.ok('alexandria' in scrape.inputSchema.properties);
  assert.match(
    scrape.description,
    /request identifies a page and needs its content or defined fields/i
  );
  assert.match(scrape.description, /Alexandria mode.*data\.alexandria/is);

  const search = byName.get('firecrawl_search');
  const sourceForms = search.inputSchema.properties.sources.items.anyOf;
  assert.ok(
    sourceForms
      .find((form) => form.type === 'string')
      .enum.includes('alexandria')
  );
  assert.equal(sourceForms.some(form => form.properties?.level), false);
  assert.match(search.description, /data\.tools/);
  assert.match(search.description, /Keyless search defaults to web only/);
  const find = byName.get('firecrawl_find_tools');
  assert.equal(find.annotations.readOnlyHint, true);
  assert.deepEqual(find.inputSchema.properties.level.enum, ['categories', 'providers', 'groups', 'tools']);

  assertAgentMetadataPolicy(
    [init.instructions, ...tools.tools.map((tool) => tool.description)].join(
      '\n'
    ),
    assert
  );
  assert.equal(getStderr().includes('TypeError'), false, getStderr());
});

