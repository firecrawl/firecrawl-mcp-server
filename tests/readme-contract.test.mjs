import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');

test('hosted README keeps the keyless and credential setup contracts safe', () => {
  assert.match(readme, /`scrape`, `search`, and `parse` work without an API key/);
  assert.match(
    readme,
    /https:\/\/mcp\.firecrawl\.dev\/v2\/mcp\nAuthorization: Bearer <FIRECRAWL_API_KEY>/,
  );
  assert.doesNotMatch(readme, /mcp\.firecrawl\.dev\/\{FIRECRAWL_API_KEY\}/);
  assert.doesNotMatch(readme, /npx -y firecrawl-mcp(?!@)/);
});
