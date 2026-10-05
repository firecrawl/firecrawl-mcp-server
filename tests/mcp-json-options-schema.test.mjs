import assert from 'node:assert/strict';
import test from 'node:test';
import { startStdio, startStdioWithApi, toolText } from './helpers/exchange-mcp.mjs';

function assertPublishedFreeFormObject(schema, label) {
  assert.equal(schema?.type, 'object', `${label} must publish as an object`);
  assert.notEqual(
    schema?.additionalProperties,
    false,
    `${label} must admit non-empty object properties`
  );
}

test('published firecrawl_scrape jsonOptions.schema admits a real JSON Schema document', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const { tools } = await client.request('tools/list', {});
  const scrape = tools.find((tool) => tool.name === 'firecrawl_scrape');
  assert.ok(scrape, 'firecrawl_scrape missing');

  const schemaField = scrape.inputSchema?.properties?.jsonOptions?.properties?.schema;
  assert.ok(schemaField, 'jsonOptions.schema missing from published inputSchema');
  assertPublishedFreeFormObject(schemaField, 'firecrawl_scrape jsonOptions.schema');

  const actions = scrape.inputSchema?.properties?.actions;
  assert.equal(
    actions?.items?.additionalProperties,
    false,
    'array item object schemas must stay strict'
  );

  const alexandria = scrape.inputSchema?.properties?.alexandria;
  const variants = [...(alexandria?.anyOf ?? []), ...(alexandria?.oneOf ?? [])];
  const objectVariant = variants.find((variant) => variant?.type === 'object');
  const arrayVariant = variants.find((variant) => variant?.type === 'array');
  assert.equal(
    objectVariant?.additionalProperties,
    false,
    'object schemas inside composition keywords must stay strict'
  );
  assert.equal(
    arrayVariant?.items?.additionalProperties,
    false,
    'array item schemas inside composition keywords must stay strict'
  );

  const extractionSchema = {
    type: 'object',
    required: ['title'],
    properties: { title: { type: 'string' } },
  };
  const result = await client.request('tools/call', {
    name: 'firecrawl_scrape',
    arguments: {
      url: 'https://example.com',
      formats: ['json'],
      jsonOptions: {
        prompt: 'Extract the title',
        schema: extractionSchema,
      },
    },
  });

  assert.notEqual(result.isError, true, JSON.stringify(result));
  assert.equal(api.requests.length, 1);
  assert.deepEqual(api.requests[0].body.formats?.[0]?.schema, extractionSchema);
  assert.equal(toolText(result).markdown, '# hi');
});

test('monitor body schemas remain open objects and local search is not read-only', async (t) => {
  const { client } = await startStdio(t, {
    CLOUD_SERVICE: 'false',
    FIRECRAWL_API_KEY: 'fc-test',
  });
  const { tools } = await client.request('tools/list', {});

  for (const name of ['firecrawl_monitor_create', 'firecrawl_monitor_update']) {
    const tool = tools.find((candidate) => candidate.name === name);
    assert.ok(tool, `${name} missing`);
    assertPublishedFreeFormObject(tool.inputSchema?.properties?.body, `${name}.body`);
  }

  const search = tools.find((tool) => tool.name === 'firecrawl_search');
  assert.equal(
    search.annotations?.readOnlyHint,
    false,
    'full-surface search with scrapeOptions.actions must not be read-only locally'
  );
});
