import assert from 'node:assert/strict';
import test from 'node:test';
import { startStdioWithApi, toolText } from './helpers/exchange-mcp.mjs';

test('scrape exposes SDK-supported images and preserves design evidence', async (t) => {
  const data = {
    images: ['https://example.com/hero.webp', 'https://example.com/logo.svg'],
    branding: { colors: { primary: '#123456' } },
    screenshot: 'https://example.com/capture.png',
    markdown: '# Example',
    metadata: { sourceURL: 'https://example.com' },
  };
  const { api, client } = await startStdioWithApi(t, {
    largeResult: { success: true, data },
  });
  const { tools } = await client.request('tools/list', {});
  const scrape = tools.find((tool) => tool.name === 'firecrawl_scrape');
  assert.ok(
    scrape.inputSchema.properties.formats.items.enum.includes('images')
  );
  const result = toolText(
    await client.request('tools/call', {
      name: 'firecrawl_scrape',
      arguments: {
        url: 'https://example.com',
        formats: ['branding', 'images', 'screenshot', 'markdown'],
        screenshotOptions: { fullPage: true },
        onlyMainContent: false,
      },
    })
  );
  assert.deepEqual(api.requests.at(-1).body.formats, [
    'branding',
    'images',
    { type: 'screenshot', fullPage: true },
    'markdown',
  ]);
  assert.equal(api.requests.at(-1).body.onlyMainContent, false);
  assert.deepEqual(result.images, data.images);
  assert.deepEqual(result.branding, data.branding);
  assert.equal(result.screenshot, data.screenshot);
});
