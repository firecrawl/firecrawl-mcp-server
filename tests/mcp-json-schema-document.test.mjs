import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';

// Mirror src/mcp-json-schemas.ts so the regression does not require a TS build step.
function isJsonObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const mcpJsonObject = z.json().refine(isJsonObject, {
  message: 'Expected a JSON object',
});
const mcpJsonSchemaDocumentOptional = mcpJsonObject.optional();

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
