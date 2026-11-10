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
  assert.match(scrape, /`firecrawl_search` and `firecrawl_find_tools` can discover providers for the same fields across several pages/);
  assert.doesNotMatch(byName.get('firecrawl_find_tools'), /Prefer normal firecrawl_search/);
  assert.match(byName.get('firecrawl_find_tools'), /Reaches data beyond the open web: records from licensed databases and provider APIs, and website data that takes more than a single fetch/);
  assert.match(byName.get('firecrawl_find_tools'), /Takes the question as query and, optionally, urls such as web search results/);
  // What the tool is for has to survive truncation, so it leads.
  assert.match(byName.get('alexandria_library_read'), /^Run capabilities of Alexandria data providers/);
});
