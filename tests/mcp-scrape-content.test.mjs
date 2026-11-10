import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createFirecrawlMcpServer } from '../dist/server.js';
import { getFreePort, startStdio } from './helpers/exchange-mcp.mjs';
import { startFakeExchangeApi } from './helpers/exchange-api.mjs';

const notice = 'The json format is no longer available on firecrawl_scrape; markdown was returned instead. Read the markdown and extract the requested fields yourself.';

for (const mode of ['stdio-key', 'stdio-self-hosted', 'http-keyless', 'http-key']) {
  test(`scrape keeps other formats and falls back from cached JSON calls (${mode})`, async (t) => {
    const data = {
      markdown: '# Source text',
      warning: 'Existing warning',
      answer: 'A targeted answer',
      summary: 'A summary',
      branding: { colors: { primary: '#123456' } },
    };
    const api = await startFakeExchangeApi({ largeResult: { success: true, data } });
    t.after(() => api.close());
    let listTools;
    let call;
    if (mode.startsWith('stdio')) {
      const { client } = await startStdio(t, {
        CLOUD_SERVICE: '', HTTP_STREAMABLE_SERVER: '', SSE_LOCAL: '',
        FIRECRAWL_API_KEY: mode === 'stdio-key' ? 'fc-test' : '',
        FIRECRAWL_OAUTH_TOKEN: '', FIRECRAWL_API_URL: api.url,
      });
      listTools = () => client.request('tools/list');
      call = (options) => client.request('tools/call', {
        name: 'firecrawl_scrape', arguments: { url: 'https://example.com', ...options },
      });
    } else {
      const port = await getFreePort();
      const server = createFirecrawlMcpServer({
        transport: 'httpStream', apiUrl: api.url, safeMode: true,
        unstable_hooks: { authenticate: async () => mode === 'http-keyless'
          ? { authType: 'keyless' }
          : { authType: 'api-key', firecrawlApiKey: 'fc-test' } },
      });
      await server.start({
        transportType: 'httpStream',
        httpStream: { port, host: '127.0.0.1', endpoint: '/mcp', stateless: true },
      });
      t.after(() => server.stop());
      const client = new Client({ name: 'scrape-compatibility', version: '1.0.0' });
      await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
      t.after(() => client.close());
      listTools = () => client.listTools();
      call = (options) => client.callTool({
        name: 'firecrawl_scrape', arguments: { url: 'https://example.com', ...options },
      });
    }
    const { tools } = await listTools();
    const scrape = tools.find((tool) => tool.name === 'firecrawl_scrape');
    assert.deepEqual(scrape.inputSchema.properties.formats.items.enum, [
      'markdown', 'html', 'rawHtml', 'screenshot', 'links', 'images',
      'summary', 'changeTracking', 'branding', 'query', 'audio',
    ]);
    assert.equal('jsonOptions' in scrape.inputSchema.properties, false);
    assert.ok(scrape.inputSchema.properties.queryOptions);
    assert.equal('json' in scrape.outputSchema.properties, false);
    for (const field of ['answer', 'summary', 'branding']) assert.ok(scrape.outputSchema.properties[field]);
    assert.match(scrape.description, /branding data, or a targeted answer/);
    assert.doesNotMatch(scrape.description, /JSON matching a supplied schema/);

    for (const options of [
      { formats: ['json'] },
      { formats: ['json'], jsonOptions: { prompt: 'Read the title', schema: { type: 'object' } } },
      { formats: [{ type: 'json', prompt: 'Read the title', schema: { type: 'object' } }] },
      { jsonOptions: { prompt: 'Read the title' } },
      { jsonOptions: {} },
      { formats: ['markdown'], jsonOptions: { schema: { type: 'object' } } },
      { formats: ['json', 'markdown', 'json'], jsonOptions: null },
    ]) {
      const result = await call(options);
      assert.notEqual(result.isError, true, JSON.stringify(result));
      assert.equal(result.structuredContent.markdown, data.markdown);
      assert.equal(result.structuredContent.warning, data.warning + '\n' + notice);
      assert.match(result.content[0].text, /json format is no longer available/);
      const body = api.requests.at(-1).body;
      assert.deepEqual(body.formats, ['markdown']);
      assert.equal('jsonOptions' in body, false);
      assert.equal('queryOptions' in body, false);
    }
    await call({ formats: ['json', 'links'] });
    assert.deepEqual(api.requests.at(-1).body.formats, ['links', 'markdown']);

    for (const options of [
      {}, { formats: ['markdown'], jsonOptions: null, queryOptions: null },
      { formats: ['query'], queryOptions: { prompt: 'Read the title' } },
      { formats: ['summary', 'branding'] },
    ]) {
      const result = await call(options);
      assert.notEqual(result.isError, true, JSON.stringify(result));
      assert.equal(result.structuredContent.warning, data.warning);
      for (const field of ['answer', 'summary', 'branding']) {
        assert.deepEqual(result.structuredContent[field], data[field]);
      }
    }
    const [legacy, normal] = await Promise.all([call({ formats: ['json'] }), call({ formats: ['markdown'] })]);
    assert.equal(legacy.structuredContent.warning, data.warning + '\n' + notice);
    assert.equal(normal.structuredContent.warning, data.warning);
  });
}
