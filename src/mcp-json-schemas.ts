import { z } from 'zod';

/**
 * Arbitrary JSON object for MCP tool parameters.
 *
 * The patched FastMCP strict-input conversion preserves additionalProperties
 * for dictionary/free-form object schemas, so this stays open in tools/list
 * while still rejecting arrays and primitives at runtime.
 */
export const mcpJsonObject = z.object({}).catchall(z.json());

export const mcpJsonObjectOptional = mcpJsonObject.optional();

/** JSON object whose values are all strings (e.g. webhook header maps). */
export const mcpStringMapOptional = z.object({}).catchall(z.string()).optional();

/** JSON Schema document for scrape/agent jsonOptions.schema. */
export const mcpJsonSchemaDocumentOptional = mcpJsonObjectOptional;
