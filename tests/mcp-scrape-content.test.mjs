import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/server/validators/ajv';
import { createFirecrawlMcpServer } from '../dist/server.js';
import { getFreePort, startStdio } from './helpers/exchange-mcp.mjs';
import { startFakeExchangeApi } from './helpers/exchange-api.mjs';

for (const mode of ['stdio-key', 'stdio-self-hosted', 'http-keyless', 'http-key']) {
  test(`scrape hides JSON inputs but preserves cached JSON extraction (${mode})`, async (t) => {
    const data = {
      markdown: '# Source text',
      json: { title: 'Source title', nested: { tags: ['one', 'two'] } },
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
    assert.ok(scrape.outputSchema.properties.json);
    for (const field of ['answer', 'summary', 'branding']) assert.ok(scrape.outputSchema.properties[field]);
    assert.match(scrape.description, /branding data, or a targeted answer/);
    assert.doesNotMatch(scrape.description, /JSON matching a supplied schema/);

    const prompt = 'Read the title';
    const schema = {
      type: 'object',
      properties: { title: { type: 'string' } },
      required: ['title'],
      additionalProperties: false,
    };
    const validator = new AjvJsonSchemaValidator();
    const validateOutput = validator.getValidator(scrape.outputSchema);
    const hiddenJsonOutput = structuredClone(scrape.outputSchema);
    delete hiddenJsonOutput.properties.json;
    assert.equal(validator.getValidator(hiddenJsonOutput)(data).valid, false);
    const cachedInput = structuredClone(scrape.inputSchema);
    cachedInput.properties.formats.items.enum.push('json');
    cachedInput.properties.jsonOptions = {
      type: 'object',
      properties: { prompt: { type: ['string', 'null'] }, schema: { type: ['object', 'null'], additionalProperties: true } },
      additionalProperties: false,
    };
    const strictCachedArgs = { url: 'https://example.com', formats: ['json'], jsonOptions: { prompt: null, schema } };
    assert.equal(validator.getValidator(cachedInput)(strictCachedArgs).valid, true);

    for (const [options, expectedFormats] of [
      [{ formats: ['json'], jsonOptions: { prompt } }, [{ type: 'json', prompt }]],
      [{ formats: ['json'], jsonOptions: { prompt, schema } }, [{ type: 'json', prompt, schema }]],
      [{ formats: [{ type: 'json', prompt, schema }] }, [{ type: 'json', prompt, schema }]],
      [{ formats: ['json', 'links'], jsonOptions: { schema } }, [{ type: 'json', schema }, 'links']],
      [{ formats: ['json', 'markdown'], jsonOptions: { prompt } }, [{ type: 'json', prompt }, 'markdown']],
      [strictCachedArgs, [{ type: 'json', schema }]],
      [{ jsonOptions: { prompt } }, undefined],
      [{ formats: ['markdown'], jsonOptions: { schema } }, ['markdown']],
    ]) {
      const result = await call(options);
      assert.notEqual(result.isError, true, JSON.stringify(result));
      assert.deepEqual(result.structuredContent.json, data.json);
      assert.equal(result.structuredContent.warning, data.warning);
      assert.deepEqual(JSON.parse(result.content[0].text).json, data.json);
      assert.equal(validateOutput(result.structuredContent).valid, true);
      const body = api.requests.at(-1).body;
      assert.deepEqual(body.formats, expectedFormats);
      assert.equal('jsonOptions' in body, false);
    }
    const before = api.requests.length;
    const missingOptions = await call({ formats: ['json'] });
    if (mode === 'http-keyless') {
      assert.notEqual(missingOptions.isError, true);
      assert.deepEqual(api.requests.at(-1).body.formats, [{ type: 'json' }]);
    } else {
      assert.equal(missingOptions.isError, true);
      assert.match(missingOptions.content[0].text, /needs jsonOptions/);
      assert.equal(api.requests.length, before);
    }

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
    const [legacy, normal] = await Promise.all([call({ formats: ['json'], jsonOptions: { prompt } }), call({ formats: ['markdown'] })]);
    assert.equal(legacy.structuredContent.warning, data.warning);
    assert.equal(normal.structuredContent.warning, data.warning);
  });
}
