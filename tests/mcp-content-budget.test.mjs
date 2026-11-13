import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { startStdio } from './helpers/exchange-mcp.mjs';

// Claude Code saves an MCP result above 50,000 characters to a file and shows
// the model an error-prefixed stub instead, so at the default maxCharacters a
// scrape or crawl result must stay under that, whatever the page size.
const CLAUDE_CODE_INLINE_LIMIT = 50_000;

// Quotes, newlines and non-ASCII text grow when serialized as JSON.
const longText = (chars) => `# Long page\n\n${'Row | "quoted" value | é ü 🔥\n'.repeat(Math.ceil(chars / 29))}`.slice(0, chars);

const metadata = (url) => ({ title: 'A page', sourceURL: url, url, statusCode: 200, scrapeId: `scrape-${new URL(url).pathname.split('/').pop()}` });

const bigPage = {
  markdown: longText(183_402),
  json: { title: 'Source title', items: Array.from({ length: 50 }, (_, i) => ({ i, name: `item ${i}` })) },
  summary: 'A short summary.',
  links: Array.from({ length: 3_000 }, (_, i) => `https://example.com/link-${i}`),
  metadata: metadata('https://example.com/big'),
};

const linksPage = {
  markdown: longText(183_402),
  links: bigPage.links,
  metadata: metadata('https://example.com/links'),
};

const smallPage = {
  markdown: '# Small page\n\nJust a few words.',
  links: ['https://example.com/a'],
  metadata: metadata('https://example.com/small'),
};

const crawlPages = (count, chars) =>
  Array.from({ length: count }, (_, i) => ({
    markdown: longText(chars),
    metadata: metadata(`https://example.com/docs/page-${i}`),
  }));

const CRAWLS = {
  big: crawlPages(30, 9_000),
  huge: crawlPages(3, 120_000),
  small: crawlPages(2, 200),
};

async function startApi(t) {
  const requests = [];
  const api = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : undefined;
    requests.push({ method: req.method, url: req.url, body });
    const json = (payload) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    };
    if (req.method === 'POST' && req.url === '/v2/scrape') {
      const page = body.url.includes('big') ? bigPage
        : body.url.includes('both') ? { ...bigPage, html: longText(90_000) }
        : body.url.includes('links') ? linksPage
        : smallPage;
      return json({ success: true, data: page });
    }
    if (req.method === 'GET' && req.url.startsWith('/v2/scrape/')) {
      const stored = [bigPage, linksPage, smallPage].find((page) => req.url === `/v2/scrape/${page.metadata.scrapeId}`);
      if (stored) return json({ success: true, data: stored });
      res.writeHead(404, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: 'Job not found.' }));
    }
    if (req.method === 'POST' && req.url === '/v2/crawl') {
      return json({ success: true, id: new URL(body.url).pathname.slice(1) });
    }
    const id = req.url.match(/^\/v2\/crawl\/(\w+)$/)?.[1];
    if (id && CRAWLS[id]) {
      return json({ success: true, status: 'completed', completed: CRAWLS[id].length, total: CRAWLS[id].length, creditsUsed: CRAWLS[id].length, data: CRAWLS[id], next: null });
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: `Unhandled ${req.method} ${req.url}` }));
  });
  await new Promise((resolve) => api.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => api.close(resolve)));
  const { client } = await startStdio(t, {
    CLOUD_SERVICE: '', HTTP_STREAMABLE_SERVER: '', SSE_LOCAL: '',
    FIRECRAWL_API_KEY: 'fc-test', FIRECRAWL_OAUTH_TOKEN: '',
    FIRECRAWL_API_URL: `http://127.0.0.1:${api.address().port}`,
  });
  const call = async (name, args) => {
    const result = await client.request('tools/call', { name, arguments: args });
    assert.notEqual(result.isError, true, JSON.stringify(result).slice(0, 500));
    return result;
  };
  return { client, call, requests };
}

/** A window's text without its closing [Truncated: ...] or [Characters ...] marker. */
function withoutMarker(text) {
  return text.slice(0, text.lastIndexOf('\n\n['));
}

function assertInline(result) {
  assert.ok(JSON.stringify(result.structuredContent).length < CLAUDE_CODE_INLINE_LIMIT, `structuredContent is ${JSON.stringify(result.structuredContent).length} chars`);
  assert.ok(result.content[0].text.length < CLAUDE_CODE_INLINE_LIMIT, `text is ${result.content[0].text.length} chars`);
}

test('firecrawl_scrape cuts long content to maxCharacters and leaves structured fields whole', async (t) => {
  const { call, requests } = await startApi(t);

  const result = await call('firecrawl_scrape', { url: 'https://example.com/big', formats: ['markdown', 'links', 'summary'] });
  const out = result.structuredContent;
  assertInline(result);
  assert.match(out.markdown, /\n\n\[Truncated: \d+ of 183402 characters shown\. Call firecrawl_scrape \{"url":"https:\/\/example\.com\/big","scrapeId":"scrape-big","startIndex":\d+\} for the next part\.\]$/);
  assert.ok(out.markdown.startsWith(bigPage.markdown.slice(0, 10_000)));
  assert.ok(out.links.length < bigPage.links.length);
  assert.deepEqual(out.links, bigPage.links.slice(0, out.links.length));
  assert.deepEqual(out.json, bigPage.json);
  assert.equal(out.summary, bigPage.summary);
  assert.deepEqual(out.metadata, bigPage.metadata);
  assert.equal(out.truncated, true);
  assert.equal(out.totalLength, 183_402);
  assert.match(out.warning, /^Content truncated: markdown at [\d,]+ of 183,402 characters, links at [\d,]+ of 3,000 items\. To read on without scraping again, call firecrawl_scrape \{"url":"https:\/\/example\.com\/big","scrapeId":"scrape-big","startIndex":\d+\}\. Or re-call with a larger maxCharacters/);
  assert.equal(out.scrapeId, 'scrape-big');
  assert.equal(out.startIndex, 0);
  assert.equal(out.nextStartIndex, withoutMarker(out.markdown).length);
  assert.match(out.warning, /formats \["query"\] or \["summary"\]/);
  assert.doesNotMatch(out.warning, /onlyMainContent/);
  assert.equal('maxCharacters' in requests.at(-1).body, false);

  // A larger maxCharacters returns more, and the fields share maxCharacters plus room for metadata.
  const larger = (await call('firecrawl_scrape', { url: 'https://example.com/big', maxCharacters: 120_000, onlyMainContent: false })).structuredContent;
  assert.ok(larger.markdown.length > 2 * out.markdown.length, String(larger.markdown.length));
  assert.ok(JSON.stringify(larger, null, 2).length <= 125_000);
  assert.match(larger.warning, /or set onlyMainContent: true\.$/);
  assert.match(larger.warning, /call firecrawl_scrape \{"url":"https:\/\/example\.com\/big","scrapeId":"scrape-big","startIndex":\d+,"maxCharacters":120000\}\./);
  assert.equal(requests.at(-1).body.onlyMainContent, false);
  assert.equal('maxCharacters' in requests.at(-1).body, false);

  const whole = (await call('firecrawl_scrape', { url: 'https://example.com/big', maxCharacters: 500_000 })).structuredContent;
  assert.equal(whole.markdown, bigPage.markdown);
  assert.deepEqual(whole.links, bigPage.links);
  assert.equal(whole.truncated, undefined);
  assert.equal(whole.warning, undefined);

  // Lists give way before the page text does.
  const links = await call('firecrawl_scrape', { url: 'https://example.com/links', formats: ['markdown', 'links'] });
  assertInline(links);
  assert.equal(links.structuredContent.markdown.length > 40_000, true);
  assert.ok(links.structuredContent.markdown.startsWith(linksPage.markdown.slice(0, 40_000)));
  assert.match(links.structuredContent.warning, /^Content truncated: markdown at 40,000 of 183,402 characters, links at \d+ of 3,000 items\./);

  // markdown and html together share the same budget.
  const both = await call('firecrawl_scrape', { url: 'https://example.com/both', formats: ['markdown', 'html'] });
  assertInline(both);
  assert.match(both.structuredContent.markdown, /\[Truncated: /);
  assert.match(both.structuredContent.html, /\[Truncated: /);
  assert.match(both.structuredContent.warning, /markdown at [\d,]+ of 183,402 characters, html at [\d,]+ of 90,000 characters/);
});

test('firecrawl_scrape returns a small page unchanged, including cached json extraction', async (t) => {
  const { call, requests } = await startApi(t);
  const small = await call('firecrawl_scrape', { url: 'https://example.com/small', maxCharacters: 1_000 });
  assert.deepEqual(small.structuredContent, smallPage);
  assert.deepEqual(JSON.parse(small.content[0].text), smallPage);

  const cached = await call('firecrawl_scrape', {
    url: 'https://example.com/big',
    formats: ['json'],
    jsonOptions: { prompt: 'Read the title' },
    maxCharacters: 5_000,
  });
  assert.deepEqual(cached.structuredContent.json, bigPage.json);
  assert.deepEqual(requests.at(-1).body.formats, [{ type: 'json', prompt: 'Read the title' }]);
});

test('scrape, crawl and crawl status only add maxCharacters to their inputs', async (t) => {
  const { client } = await startApi(t);
  const { tools } = await client.request('tools/list', {});
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const previous = {
    firecrawl_scrape: ['url', 'formats', 'queryOptions', 'screenshotOptions', 'parsers', 'pdfOptions', 'onlyMainContent', 'redactPII', 'includeTags', 'excludeTags', 'waitFor', 'actions', 'mobile', 'skipTlsVerification', 'removeBase64Images', 'location', 'storeInCache', 'zeroDataRetention', 'maxAge', 'lockdown', 'proxy', 'profile', 'timeout', 'requestId', 'alexandria', 'toolDetail', 'domainTools', 'scrapeId', 'startIndex'],
    firecrawl_crawl: ['url', 'prompt', 'excludePaths', 'includePaths', 'maxDiscoveryDepth', 'sitemap', 'limit', 'allowExternalLinks', 'allowSubdomains', 'crawlEntireDomain', 'delay', 'maxConcurrency', 'webhook', 'webhookHeaders', 'deduplicateSimilarURLs', 'ignoreQueryParameters', 'zeroDataRetention', 'scrapeOptions'],
    firecrawl_check_crawl_status: ['id'],
  };
  for (const [name, properties] of Object.entries(previous)) {
    const tool = byName.get(name);
    assert.deepEqual(Object.keys(tool.inputSchema.properties).sort(), [...properties, 'maxCharacters'].sort(), name);
    assert.equal(tool.inputSchema.properties.maxCharacters.type, 'number', name);
    assert.deepEqual(tool.inputSchema.required ?? [], { firecrawl_scrape: [], firecrawl_crawl: ['url'], firecrawl_check_crawl_status: ['id'] }[name], name);
    assert.equal((tool.inputSchema.required ?? []).includes('maxCharacters'), false, name);
    assert.equal(tool._meta?.['anthropic/maxResultSizeChars'], undefined, name);
    assert.ok(tool.description.length <= 2_048, name);
  }
  assert.equal(byName.get('firecrawl_scrape')._meta['anthropic/alwaysLoad'], true);
  assert.equal(byName.get('firecrawl_crawl').inputSchema.properties.scrapeOptions.properties.maxCharacters, undefined);
  assert.equal(byName.get('firecrawl_search').inputSchema.properties.scrapeOptions.properties.maxCharacters, undefined);
  for (const name of ['firecrawl_scrape', 'firecrawl_crawl']) {
    assert.ok(byName.get(name).outputSchema.properties.truncated, name);
  }
  assert.ok(byName.get('firecrawl_scrape').outputSchema.properties.totalLength);
  assert.ok(byName.get('firecrawl_crawl').outputSchema.properties.omittedPages);
});

test('firecrawl_crawl inlines pages up to the result budget and lists the rest', async (t) => {
  const { call, requests } = await startApi(t);

  const result = await call('firecrawl_crawl', { url: 'https://example.com/big' });
  const out = result.structuredContent;
  assertInline(result);
  assert.equal(requests.find((r) => r.method === 'POST' && r.url === '/v2/crawl').body.maxCharacters, undefined);
  assert.equal(out.id, 'big');
  assert.equal(out.status, 'completed');
  assert.ok(out.data.length > 1 && out.data.length < 30, String(out.data.length));
  assert.deepEqual(out.data, CRAWLS.big.slice(0, out.data.length));
  assert.equal(out.omittedPages, 30 - out.data.length);
  assert.equal(out.truncated, true);
  assert.match(out.warning, new RegExp(`^Inlined ${out.data.length} of 30 pages to keep this result under 45,000 characters; ${out.omittedPages} pages left out: https://example\\.com/docs/page-${out.data.length}, `));
  assert.match(out.warning, /https:\/\/example\.com\/docs\/page-29\. Call firecrawl_scrape on the URLs you need/);

  const status = (await call('firecrawl_check_crawl_status', { id: 'big', maxCharacters: 400_000 })).structuredContent;
  assert.deepEqual(status.data, CRAWLS.big);
  assert.equal(status.truncated, undefined);
  assert.equal(status.warning, undefined);

  const huge = await call('firecrawl_check_crawl_status', { id: 'huge' });
  assertInline(huge);
  assert.equal(huge.structuredContent.data.length, 1);
  assert.match(huge.structuredContent.data[0].markdown, /\[Truncated: \d+ of 120000 characters shown\. Call firecrawl_scrape \{"url":"https:\/\/example\.com\/docs\/page-0","scrapeId":"scrape-page-0","startIndex":\d+\} for the rest of this page\.\]$/);
  assert.equal(huge.structuredContent.omittedPages, 2);
  assert.match(huge.structuredContent.warning, /2 pages left out: https:\/\/example\.com\/docs\/page-1, https:\/\/example\.com\/docs\/page-2\. .* 1 inlined page had content cut at 40,000 characters or less/);
});

test('a small crawl keeps its result shape', async (t) => {
  const { call } = await startApi(t);
  const out = (await call('firecrawl_crawl', { url: 'https://example.com/small', maxCharacters: 1_000 })).structuredContent;
  assert.deepEqual(out, {
    id: 'small', status: 'completed', completed: 2, total: 2, creditsUsed: 2, next: null, data: CRAWLS.small,
  });
});

test('firecrawl_scrape reads a cut page on by scrapeId and startIndex without scraping again', async (t) => {
  const { client, call, requests } = await startApi(t);
  const first = (await call('firecrawl_scrape', { url: 'https://example.com/big', formats: ['markdown', 'links'] })).structuredContent;
  let text = withoutMarker(first.markdown);
  let next = first.nextStartIndex;
  const posts = requests.filter((r) => r.method === 'POST').length;
  let windows = 0;
  let last = first;
  while (next !== undefined) {
    assert.equal(next, text.length);
    // The exact follow-up call the warning gives, which carries url for surfaces that require it.
    const followUp = JSON.parse(last.warning.match(/call firecrawl_scrape (\{[^}]*\})\./)[1]);
    assert.deepEqual(followUp, { url: 'https://example.com/big', scrapeId: 'scrape-big', startIndex: next });
    const result = await call('firecrawl_scrape', followUp);
    assertInline(result);
    last = result.structuredContent;
    assert.equal(last.startIndex, next);
    assert.equal(last.scrapeId, 'scrape-big');
    assert.equal(last.totalLength, 183_402);
    assert.match(last.markdown, new RegExp(`\\[Characters ${next}-\\d+ of 183402 shown\\. `));
    assert.equal('links' in last, false);
    assert.deepEqual(last.json, bigPage.json);
    assert.equal(last.summary, bigPage.summary);
    assert.deepEqual(last.metadata, bigPage.metadata);
    assert.match(last.warning, /^Showing markdown characters [\d,]+-[\d,]+ of 183,402\. links is only in the first window\./);
    text += withoutMarker(last.markdown);
    next = last.nextStartIndex;
    windows += 1;
  }
  assert.equal(text, bigPage.markdown);
  assert.ok(windows >= 2, String(windows));
  assert.match(last.markdown, /This is the end of the markdown\.\]$/);
  assert.match(last.warning, /This window ends the markdown\./);
  assert.doesNotMatch(last.warning, /To read on/);
  assert.equal(last.truncated, true); // links are left out of later windows
  assert.equal(requests.filter((r) => r.method === 'POST').length, posts);
  assert.equal(requests.filter((r) => r.url === '/v2/scrape/scrape-big').length, windows);

  const restart = (await call('firecrawl_scrape', { scrapeId: 'scrape-big' })).structuredContent;
  assert.equal(restart.startIndex, 0);
  assert.ok(restart.markdown.startsWith(bigPage.markdown.slice(0, 30_000)));
  assert.ok(Array.isArray(restart.links));

  const missing = await client.request('tools/call', { name: 'firecrawl_scrape', arguments: { scrapeId: 'scrape-gone', startIndex: 40_000 } });
  assert.equal(missing.isError, true);
  assert.match(missing.content[0].text, /Could not read scrape scrape-gone: Job not found\. Stored results are kept for 24 hours/);

  const stray = await client.request('tools/call', { name: 'firecrawl_scrape', arguments: { url: 'https://example.com/big', startIndex: 40_000 } }).catch((error) => ({ isError: true, error }));
  assert.equal(stray.isError, true);

  const zdr = (await call('firecrawl_scrape', { url: 'https://example.com/big', zeroDataRetention: true })).structuredContent;
  assert.equal(zdr.scrapeId, undefined);
  assert.equal(zdr.nextStartIndex, undefined);
  assert.match(zdr.markdown, /Re-call firecrawl_scrape with a larger maxCharacters for more\.\]$/);
});
