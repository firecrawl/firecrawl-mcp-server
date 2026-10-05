import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mcpJsonObject,
  mcpJsonSchemaDocumentOptional,
  mcpStringMapOptional,
} from '../dist/mcp-json-schemas.js';

test('jsonOptions.schema accepts a non-empty JSON Schema object', () => {
  const schema = {
    type: 'object',
    required: ['title'],
    properties: { title: { type: 'string' } },
  };
  const result = mcpJsonSchemaDocumentOptional.safeParse(schema);
  assert.equal(result.success, true);
});

test('jsonOptions.schema rejects non-objects', () => {
  assert.equal(mcpJsonSchemaDocumentOptional.safeParse(['title']).success, false);
  assert.equal(mcpJsonSchemaDocumentOptional.safeParse('object').success, false);
});

test('free-form MCP object rejects non-objects and accepts nested JSON', () => {
  assert.equal(mcpJsonObject.safeParse({ nested: { ok: true }, list: [1, 2] }).success, true);
  assert.equal(mcpJsonObject.safeParse(null).success, false);
  assert.equal(mcpJsonObject.safeParse(['not-an-object']).success, false);
});

test('string-map MCP object publishes the same runtime constraint', () => {
  assert.equal(mcpStringMapOptional.safeParse({ authorization: 'Bearer test' }).success, true);
  assert.equal(mcpStringMapOptional.safeParse({ authorization: 42 }).success, false);
});
