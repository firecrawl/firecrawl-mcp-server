import assert from 'node:assert/strict';
import test from 'node:test';
import { startStdioWithApi } from './helpers/exchange-mcp.mjs';
import { CLAUDE_CODE_TEXT_CAP as CAP } from './helpers/description-budget.mjs';
import { assertAlexandriaMetadata } from './helpers/alexandria-metadata.mjs';

// Claude Code truncates each tool description (and server instructions) at 2,048
// characters. The routing copy that changed agent behaviour in the AX runs has to
// land inside that window: the Alexandria noun, the sources opt-out, and the
// scrape-first pointer; the scrape tool has to read first as one URL -> the page.

test('every tool description fits the 2,048-character cap and keeps the routing copy inside it', async (t) => {
  const { client, init } = await startStdioWithApi(t);
  const { tools } = await client.request('tools/list', {});
  assertAlexandriaMetadata(tools, init.instructions);
  for (const tool of tools) {
    assert.ok((tool.description ?? '').length <= CAP, `${tool.name} description is ${(tool.description ?? '').length} chars`);
  }
  const byName = new Map(tools.map((tool) => [tool.name, tool.description.trim()]));
  const search = byName.get('firecrawl_search');
  assert.match(search, /Alexandria data providers in data\.tools/);
  assert.match(search, /Passing sources without alexandria in it .* excludes Alexandria provider matches/);
  assert.match(search, /Prefer a provider over scraping pages/);
  const scrape = byName.get('firecrawl_scrape');
  assert.match(scrape, /^Scrape one URL and return its content/);
  assert.match(scrape, /`firecrawl_search` with `sources` unset.*can discover providers for the same fields across several pages/);
  assert.match(byName.get('firecrawl_find_tools'), /Prefer normal firecrawl_search/);
  // The retry rule moved out of the instructions' first window; it lives on the parameter.
  const scrapeParams = tools.find((tool) => tool.name === 'firecrawl_scrape').inputSchema.properties;
  assert.match(scrapeParams.requestId.description, /Repeated attempts of the identical payload require the same ID/);
});
