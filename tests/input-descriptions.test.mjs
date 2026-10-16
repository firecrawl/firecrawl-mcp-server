import assert from 'node:assert/strict';
import test from 'node:test';
import { startStdioWithApi } from './helpers/exchange-mcp.mjs';

// MCP directories and quality scanners judge a tool by how well each input is
// described, including nested object fields, array items and union branches.
// This keeps firecrawl_scrape, firecrawl_search and firecrawl_parse fully documented.

function isDescribed(schema) {
  return (
    typeof schema?.description === 'string' && schema.description.trim() !== ''
  );
}

// Walks object properties, array items and union branches. Array items that are
// plain values (enums, strings) need their own description; object items are
// documented through their properties.
function undocumented(schema, path = '') {
  const missing = [];
  for (const [name, prop] of Object.entries(schema?.properties ?? {})) {
    const here = path ? `${path}.${name}` : name;
    if (!isDescribed(prop)) missing.push(here);
    missing.push(...undocumentedChildren(prop, here));
  }
  return missing;
}

function undocumentedChildren(prop, here) {
  const missing = [];
  missing.push(...undocumented(prop, here));
  if (prop.items) {
    const leaf = !prop.items.properties && !prop.items.anyOf;
    if (leaf && !isDescribed(prop.items)) missing.push(`${here}[]`);
    missing.push(...undocumented(prop.items, `${here}[]`));
  }
  for (const [index, branch] of (prop.anyOf ?? []).entries()) {
    const label = `${here}<${index}>`;
    missing.push(...undocumented(branch, label));
    if (branch.items) {
      const leaf = !branch.items.properties && !branch.items.anyOf;
      if (leaf && !isDescribed(branch.items)) missing.push(`${label}[]`);
      missing.push(...undocumented(branch.items, `${label}[]`));
    }
  }
  return missing;
}

test('every input of firecrawl_scrape, firecrawl_search and firecrawl_parse has a description', async (t) => {
  const { client } = await startStdioWithApi(t);
  const { tools } = await client.request('tools/list', {});
  for (const name of [
    'firecrawl_scrape',
    'firecrawl_search',
    'firecrawl_parse',
  ]) {
    const tool = tools.find((candidate) => candidate.name === name);
    assert.ok(tool, `${name} is listed`);
    assert.deepEqual(
      undocumented(tool.inputSchema),
      [],
      `${name} inputs without a description`
    );
  }
});
