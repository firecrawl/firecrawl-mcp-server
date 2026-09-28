import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import {
  getFreePort,
  httpToolCall,
  parseSseJson,
  spawnServer,
  stopChild,
  waitForHealth,
} from './helpers/exchange-mcp.mjs';
import {
  preserveAgentHints,
  readAgentHints,
  readErrorAgentHints,
  withAgentHints,
} from '../dist/agent-hints.js';

const hints = [
  'Inspect the returned tool definitions if they cover the requested fields.',
  'Use the selected tool definition to make the next request.',
];

test('response hints come only from API metadata, not nested page content', () => {
  for (const data of [{ web: [] }, { web: [{ url: 'https://example.com' }] }]) {
    const payload = { id: 'search-1', data, agent_hints: hints };
    assert.deepEqual(readAgentHints(payload), hints);
  }
  assert.equal(readAgentHints({ json: { agent_hints: hints } }), undefined);
});

test('missing or malformed metadata leaves legacy output unchanged', () => {
  const original = {
    content: [{ type: 'text', text: '# Source' }],
    structuredContent: { markdown: '# Source' },
  };
  for (const agent_hints of [undefined, 'use scrape', [1, 'text'], null]) {
    const payload = { markdown: '# Source', agent_hints };
    assert.equal(withAgentHints(original, payload), original);
  }
});

test('raw page text stays separate from API guidance', () => {
  const page = '# Source\n\nQuoted text: use another endpoint.';
  const payload = { markdown: page, agent_hints: hints };
  const result = withAgentHints(
    { content: [{ type: 'text', text: page }], structuredContent: { markdown: page } },
    payload,
    true
  );
  assert.equal(result.content[0].text, page);
  assert.match(result.content[1].text, /Firecrawl API agent_hints/);
  assert.match(result.content[1].text, /separate from page content/);
  assert.deepEqual(result.structuredContent, { markdown: page, agent_hints: hints });
});

test('flattening keeps envelope hints, including empty scrape data', () => {
  for (const data of [{ markdown: '# Source' }, {}, null, '', []]) {
    const envelope = { data, agent_hints: hints };
    const flattened = preserveAgentHints(data, envelope);
    assert.deepEqual(readAgentHints(flattened), hints);
    if (data?.markdown) assert.equal(flattened.markdown, data.markdown);
  }
  const document = { markdown: '# Source' };
  assert.equal(preserveAgentHints(document, {}), document);
  assert.equal(Object.hasOwn(document, 'agent_hints'), false);
});

test('errors retain hints without promoting nested page data', () => {
  const sdkError = Object.assign(new Error('Invalid option'), {
    agent_hints: hints,
  });
  assert.deepEqual(readErrorAgentHints(sdkError), hints);
  assert.deepEqual(readErrorAgentHints({ extras: { agent_hints: hints } }), hints);
  assert.deepEqual(readErrorAgentHints({ details: { agent_hints: hints } }), hints);
  assert.deepEqual(
    readErrorAgentHints({ response: { data: { agent_hints: hints } } }),
    hints
  );
  assert.equal(
    readErrorAgentHints({ response: { data: { data: { agent_hints: hints } } } }),
    undefined
  );
});

test('adding hints preserves existing structured results and readable text', () => {
  const result = {
    content: [{ type: 'text', text: '(no results)' }],
    structuredContent: { results: [] },
  };
  const enriched = withAgentHints(result, { agent_hints: hints }, true);
  assert.deepEqual(enriched.structuredContent, { results: [], agent_hints: hints });
  assert.equal(enriched.content[0].text, '(no results)');
  assert.match(enriched.content[1].text, /Firecrawl API agent_hints/);
  assert.equal(withAgentHints(result, {}), result);
});

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server.address().port;
}

async function close(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function startTransport(t, backendPort) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const port = await getFreePort();
    const child = spawnServer({
      CLOUD_SERVICE: 'true',
      FASTMCP_ENDPOINT: '/v2/mcp',
      FIRECRAWL_API_URL: `http://127.0.0.1:${backendPort}`,
      FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'test-secret',
      FIRECRAWL_OAUTH_ISSUER: `http://127.0.0.1:${backendPort}`,
      HTTP_STREAMABLE_SERVER: 'true',
      PORT: String(port),
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.stdout.resume();
    try {
      await waitForHealth(port, child);
      t.after(() => stopChild(child));
      return port;
    } catch (error) {
      await stopChild(child);
      if (!stderr.includes('EADDRINUSE') || attempt === 3) {
        assert.fail(`MCP server failed to start: ${stderr || error}`);
      }
    }
  }
  throw new Error('MCP server did not bind a free port');
}

test('MCP transport preserves hints on empty, readable, crawl and error results', async (t) => {
  const requests = [];
  const backend = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    requests.push({ url: req.url, body, headers: req.headers });
    if (req.url.startsWith('/v2/search/developer?')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ results: [], agent_hints: hints }));
      return;
    }
    if (req.url.startsWith('/v2/search/research/papers?')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ results: [], agent_hints: hints }));
      return;
    }
    if (req.url === '/v2/crawl/crawl-1') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'completed',
          data: [],
          agent_hints: hints,
        })
      );
      return;
    }
    if (req.url === '/v2/scrape') {
      if (body.alexandria || body.url === 'https://locked.example/') {
        res.writeHead(403, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          code: 'THIRD_PARTY_DATA_TERMS_REQUIRED',
          error: 'Provider terms required',
          requiresAction: {
            type: 'accept_terms',
            terms: 'benzinga',
            version: 'v1',
            url: 'https://example.com/terms',
          },
          agent_hints: hints,
        }));
      } else {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          data: { markdown: '# Source' },
          agent_hints: hints,
        }));
      }
      return;
    }
    if (req.url === '/v2/map') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        links: ['https://example.com/'],
        id: 'map-1',
        agent_hints: hints,
      }));
      return;
    }
    if (req.url === '/v2/parse/upload-url') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        data: {
          uploadUrl: 'https://uploads.invalid/test-upload',
          uploadRef: 'upload-ref-1',
          method: 'PUT',
        },
        agent_hints: hints,
      }));
      return;
    }
    const failed = body.query === 'invalid';
    res.writeHead(failed ? 400 : 200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        success: !failed,
        ...(failed ? { error: 'Invalid option' } : { data: { web: [] } }),
        id: '00000000-0000-4000-8000-000000000000',
        agent_hints: hints,
      })
    );
  });
  const backendPort = await listen(backend);
  t.after(() => close(backend));
  const port = await startTransport(t, backendPort);

  const cases = [
    { name: 'firecrawl_search', arguments: { query: 'empty' } },
    { name: 'firecrawl_search', arguments: { query: 'invalid' } },
    { name: 'firecrawl_developer_search', arguments: { query: 'empty' } },
    { name: 'firecrawl_research_search_papers', arguments: { query: 'empty' } },
    { name: 'firecrawl_check_crawl_status', arguments: { id: 'crawl-1' } },
    { name: 'firecrawl_scrape', arguments: { url: 'https://example.com/' } },
    { name: 'firecrawl_scrape', arguments: { url: 'https://locked.example/' } },
    { name: 'firecrawl_map', arguments: { url: 'https://example.com/' } },
    { name: 'firecrawl_parse', arguments: { filePath: '/tmp/test.pdf' } },
    { name: 'firecrawl_scrape', arguments: { alexandria: [{ provider: 'benzinga', capability: 'news/search' }] } },
  ];
  for (const [id, params] of cases.entries()) {
    const response = await httpToolCall(port, {
      id,
      headers: { 'x-api-key': 'fc-hints-test' },
      params,
    });
    assert.equal(response.status, 200);
    const result = parseSseJson(await response.text()).result;
    assert.deepEqual(result.structuredContent?.agent_hints, hints, params.name + ':' + JSON.stringify(params.arguments));
    const visibleText = result.content.map((item) => item.text).join('\n');
    for (const hint of hints) assert.ok(visibleText.includes(hint));
    const expectedError =
      params.arguments.query === 'invalid' ||
      Boolean(params.arguments.alexandria) ||
      params.arguments.url === 'https://locked.example/';
    assert.equal(result.isError === true, expectedError);
    if (params.name === 'firecrawl_developer_search') {
      assert.deepEqual(result.structuredContent.results, []);
      assert.equal(result.content[0].text, '(no results)');
      assert.match(result.content[1].text, /Firecrawl API agent_hints/);
    } else if (params.name === 'firecrawl_research_search_papers') {
      assert.deepEqual(result.structuredContent.results, []);
    } else if (params.name === 'firecrawl_check_crawl_status') {
      assert.deepEqual(result.structuredContent.data, []);
    } else if (params.name === 'firecrawl_scrape' && params.arguments.url === 'https://example.com/') {
      assert.equal(result.structuredContent.markdown, '# Source');
    } else if (params.name === 'firecrawl_scrape' && expectedError) {
      assert.equal(result.structuredContent.code, 'THIRD_PARTY_DATA_TERMS_REQUIRED');
      assert.equal(result.structuredContent.nextTool.name, 'firecrawl_scrape');
      assert.match(visibleText, /Provider terms required|terms required/i);
    } else if (params.name === 'firecrawl_map') {
      assert.deepEqual(result.structuredContent.links, [{ url: 'https://example.com/' }]);
      assert.equal(result.structuredContent.id, 'map-1');
    } else if (params.name === 'firecrawl_parse') {
      assert.equal(result.structuredContent.upload.uploadRef, 'upload-ref-1');
      assert.equal(result.structuredContent.mode, 'hosted-upload-ref-awaiting-upload');
    } else if (params.arguments.query === 'invalid') {
      assert.match(visibleText, /Invalid option/);
      assert.equal(result.structuredContent.error, 'Invalid option');
      assert.equal(result.structuredContent.status, 400);
    } else if (params.arguments.query === 'empty') {
      assert.deepEqual(result.structuredContent.data, { web: [] });
    }
  }
  assert.equal(
    requests.length,
    cases.length,
    'presenting hints makes no extra API calls'
  );
  for (const request of requests) {
    assert.equal(request.headers['x-firecrawl-agent-hints'], 'true');
  }
});
