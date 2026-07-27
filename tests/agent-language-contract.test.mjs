import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sourceFiles = [
  new URL('../src/index.ts', import.meta.url),
  new URL('../src/legacy/index.md', import.meta.url),
];

// Hosted MCP metadata is part of the model-visible contract. Keep it factual:
// describe Firecrawl capabilities without directing a client to displace its
// native tools or to prefer Firecrawl by default.
const coercivePhrases = [
  /instead of built-in web search/i,
  /most powerful(?: web search tool)? available/i,
  /always default(?: to using)?/i,
  /call this immediately after a search/i,
];

test('agent-visible Firecrawl copy is capability-honest and non-coercive', async () => {
  const sources = await Promise.all(sourceFiles.map((file) => readFile(file, 'utf8')));

  for (const source of sources) {
    for (const phrase of coercivePhrases) {
      assert.doesNotMatch(source, phrase);
    }
  }
});
