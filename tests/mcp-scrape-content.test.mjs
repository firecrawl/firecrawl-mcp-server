import assert from 'node:assert/strict';
import test from 'node:test';
import { startStdio } from './helpers/exchange-mcp.mjs';
import { startFakeExchangeApi } from './helpers/exchange-api.mjs';

for (const credential of ['', 'fc-test']) {
  test(`scrape advertises source formats and rejects extraction over stdio (${credential ? 'credentialed' : 'self-hosted without a key'})`, async (t) => {
    const api = await startFakeExchangeApi();
    t.after(() => api.close());
    const { client, init } = await startStdio(t, {
      CLOUD_SERVICE: '', HTTP_STREAMABLE_SERVER: '', SSE_LOCAL: '',
      FIRECRAWL_API_KEY: credential, FIRECRAWL_OAUTH_TOKEN: '', FIRECRAWL_API_URL: api.url,
    });
    const { tools } = await client.request('tools/list');
    const scrape = tools.find((tool) => tool.name === 'firecrawl_scrape');
    const properties = scrape.inputSchema.properties;
    assert.deepEqual(properties.formats.items.enum, [
      'markdown', 'html', 'rawHtml', 'screenshot', 'links', 'images', 'changeTracking', 'audio',
    ]);
    assert.equal('jsonOptions' in properties, false);
    assert.equal('queryOptions' in properties, false);
    for (const field of ['json', 'answer', 'summary', 'branding']) {
      assert.equal(field in scrape.outputSchema.properties, false);
    }
    assert.doesNotMatch(scrape.description + init.instructions, /JSON matching a supplied schema|targeted answer|branding data/);
    for (const options of [
      ...['json', 'query', 'summary', 'branding'].map((type) => ({ formats: [type] })),
      { jsonOptions: { prompt: 'Describe the style' } },
      { queryOptions: { prompt: 'Describe the style' } },
    ]) {
      const result = await client.request('tools/call', {
        name: 'firecrawl_scrape', arguments: { url: 'https://example.com', ...options },
      });
      assert.equal(result.isError, true);
      assert.equal(result.structuredContent.error.code, 'invalid_request');
      assert.match(result.content[0].text, /formats: \["markdown"\].*yourself/);
    }
    assert.deepEqual(api.requests, []);
    const deprecated = await client.request('tools/call', {
      name: 'firecrawl_extract', arguments: { urls: ['https://example.com'] },
    });
    assert.equal(deprecated.isError, true);
    assert.deepEqual(deprecated.structuredContent.replacement.example_arguments.formats, ['markdown']);
  });
}
