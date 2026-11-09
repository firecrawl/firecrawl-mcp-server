// A free-form object input, such as the JSON Schema of an extraction, must be
// listed as an open object. Closing it to unlisted keys tells clients the
// object has to be empty, and strict clients then refuse every real schema.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/server/validators/ajv';
import { createFirecrawlMcpServer } from '../dist/server.js';
import { getFreePort } from './helpers/exchange-mcp.mjs';

async function listTools(t) {
  const port = await getFreePort();
  const instance = createFirecrawlMcpServer({
    transport: 'httpStream',
    unstable_hooks: {
      authenticate: async () => ({
        authType: 'api-key',
        firecrawlApiKey: 'fc-test',
      }),
    },
  });
  await instance.start({
    transportType: 'httpStream',
    httpStream: { port, host: '127.0.0.1', endpoint: '/mcp', stateless: true },
  });
  t.after(() => instance.stop());
  const client = new Client({ name: 'input-schema-test', version: '1.0.0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`))
  );
  t.after(() => client.close());
  const { tools } = await client.listTools();
  return Object.fromEntries(tools.map((tool) => [tool.name, tool.inputSchema]));
}

test('extraction schemas are listed as open objects and other objects stay closed', async (t) => {
  const inputs = await listTools(t);
  const freeForm = {
    'firecrawl_parse jsonOptions.schema':
      inputs.firecrawl_parse.properties.jsonOptions.properties.schema,
    'firecrawl_agent schema': inputs.firecrawl_agent.properties.schema,
    'firecrawl_crawl scrapeOptions.jsonOptions.schema':
      inputs.firecrawl_crawl.properties.scrapeOptions.properties.jsonOptions
        .properties.schema,
  };
  for (const [where, schema] of Object.entries(freeForm)) {
    assert.equal(schema.type, 'object', where);
    assert.notEqual(
      schema.additionalProperties,
      false,
      `${where} accepts keys`
    );
    assert.equal(
      schema.additionalProperties,
      true,
      `${where} accepts any value`
    );
  }

  assert.equal(inputs.firecrawl_scrape.additionalProperties, false);
  assert.equal(
    inputs.firecrawl_parse.properties.jsonOptions.additionalProperties,
    false
  );
  assert.equal(
    inputs.firecrawl_scrape.properties.location.additionalProperties,
    false
  );
  assert.equal(inputs.firecrawl_agent.additionalProperties, false);
});

// Some clients validate arguments against the listed schema after reading an
// empty-object `additionalProperties` as false, the way Python truthiness
// does, and refuse the call with "Additional properties are not allowed".
function readEmptyAsFalse(value) {
  if (Array.isArray(value)) return value.map(readEmptyAsFalse);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      key === 'additionalProperties' && JSON.stringify(child) === '{}'
        ? false
        : readEmptyAsFalse(child),
    ])
  );
}

test('a nested extraction schema validates against the listed crawl scrapeOptions schema', async (t) => {
  const inputs = await listTools(t);
  const validator = new AjvJsonSchemaValidator();
  const args = {
    formats: ['json'],
    jsonOptions: {
      prompt: 'List every product with its name and price.',
      schema: {
        type: 'object',
        properties: {
          products: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                price: { type: 'number' },
                tags: { type: 'array', items: { type: 'string' } },
              },
              required: ['name', 'price'],
            },
          },
        },
        required: ['products'],
      },
    },
  };
  for (const [reading, schema] of [
    ['as listed', inputs.firecrawl_crawl.properties.scrapeOptions],
    [
      'with empty objects read as false',
      readEmptyAsFalse(inputs.firecrawl_crawl.properties.scrapeOptions),
    ],
  ]) {
    const result = validator.getValidator(schema)(args);
    assert.ok(result.valid, `${reading}: ${result.errorMessage}`);
  }
});

test('no listed input schema leaves a map open with an empty object', async (t) => {
  const inputs = await listTools(t);
  for (const [name, schema] of Object.entries(inputs)) {
    assert.deepEqual(readEmptyAsFalse(schema), schema, name);
  }
});
