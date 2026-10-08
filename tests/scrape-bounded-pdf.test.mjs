import assert from 'node:assert/strict';
import test from 'node:test';
import { startStdioWithApi, toolText } from './helpers/exchange-mcp.mjs';

const reads = [
  {
    name: 'firecrawl_scrape',
    arguments: {
      url: 'https://example.com/report.pdf',
      formats: ['markdown'],
      parsers: ['pdf'],
      pdfOptions: { maxPages: 5 },
    },
  },
  {
    name: 'firecrawl_scrape',
    arguments: {
      url: 'https://example.com/document/123',
      formats: ['markdown'],
      parsers: ['pdf'],
      pdfOptions: { maxPages: 5 },
    },
  },
];

test('bounded PDF and extensionless document reads forward maxPages and preserve nested usage', async (t) => {
  const { api, client } = await startStdioWithApi(t, {
    largeResult: {
      success: true,
      data: { markdown: '# Partial document', metadata: { creditsUsed: 5 } },
    },
  });
  for (const read of reads) {
    const response = await client.request('tools/call', read);
    const result = toolText(response);
    assert.deepEqual(api.requests.at(-1).body.parsers, [
      { type: 'pdf', maxPages: 5 },
    ]);
    assert.equal(result.metadata.creditsUsed, 5);
    assert.equal(response.structuredContent.metadata.creditsUsed, 5);
  }
});
