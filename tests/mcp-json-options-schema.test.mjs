import assert from 'node:assert/strict';
import test from 'node:test';
import {
  startStdio,
} from './helpers/exchange-mcp.mjs';

function isUnsatisfiableFreeFormObject(schema) {
  return (
    schema?.type === 'object' &&
    schema?.additionalProperties === false &&
    !schema?.properties &&
    schema?.propertyNames?.type === 'string'
  );
}

test('published firecrawl_scrape jsonOptions.schema admits non-empty JSON Schema objects', async (t) => {
  const { client } = await startStdio(t, {
    CLOUD_SERVICE: 'false',
    FIRECRAWL_API_KEY: 'fc-test',
  });
  const { tools } = await client.request('tools/list', {});
  const scrape = tools.find((tool) => tool.name === 'firecrawl_scrape');
  assert.ok(scrape, 'firecrawl_scrape missing');

  const schemaField = scrape.inputSchema?.properties?.jsonOptions?.properties?.schema;
  assert.ok(schemaField, 'jsonOptions.schema missing from published inputSchema');
  assert.equal(
    isUnsatisfiableFreeFormObject(schemaField),
    false,
    'jsonOptions.schema must not be an empty-object-only schema'
  );

  const search = tools.find((tool) => tool.name === 'firecrawl_search');
  assert.equal(
    search.annotations?.readOnlyHint,
    false,
    'full-surface search with scrapeOptions.actions must not be read-only locally'
  );
});
