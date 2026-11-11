import assert from 'node:assert/strict';
import test from 'node:test';
import { startStdioWithApi } from './helpers/exchange-mcp.mjs';
import { CLAUDE_CODE_TEXT_CAP as CAP } from './helpers/description-budget.mjs';
import { assertAlexandriaMetadata } from './helpers/alexandria-metadata.mjs';

// Claude Code truncates each tool description (and server instructions) at 2,048
// characters. The routing copy that changed agent behaviour in the AX runs has to
// land inside that window: the Alexandria noun, the always-on sources note, and the
// scrape-first pointer; the scrape tool has to read first as one URL -> the page.

test('every tool description fits the 2,048-character cap and keeps the routing copy inside it', async (t) => {
  const { client, init } = await startStdioWithApi(t);
  const { tools } = await client.request('tools/list', {});
  assertAlexandriaMetadata(tools, init.instructions, { tools: 'dedicated' });
  for (const tool of tools) {
    assert.ok((tool.description ?? '').length <= CAP, `${tool.name} description is ${(tool.description ?? '').length} chars`);
  }
  const byName = new Map(tools.map((tool) => [tool.name, tool.description.trim()]));
  const search = byName.get('firecrawl_search');
  assert.match(search, /tool matches describe available structured-data capabilities/i);
  assert.match(search, /Authenticated searches always add alexandria to the sources, so sources: \["web"\] also returns providers/);
  const scrape = byName.get('firecrawl_scrape');
  assert.match(scrape, /^Scrape one URL and return its content/);
  // firecrawl_scrape keeps the routing copy it had before the library tools.
  assert.match(scrape, /`firecrawl_search` and `firecrawl_find_tools` can discover providers for the same fields across several pages/);
  // What each Alexandria tool is for leads its description.
  assert.match(byName.get('alexandria_library_search'), /^Explore the Alexandria library: Firecrawl's catalogue of data providers/);
  assert.match(byName.get('alexandria_library_search'), /read-only filesystem, using shell commands/);
  assert.match(byName.get('alexandria_library_read'), /^Run capabilities of Alexandria data providers/);
});
