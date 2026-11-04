// A paper search row carries authors as a list of names or a comma-joined
// string, and dates as YYYY-MM-DD. The text block has to print both, a long
// list has to end in "et al." because it has no total, and sort has to reach
// the request as a query parameter.
import assert from 'node:assert/strict';
import test from 'node:test';
import { startFakeExchangeApi } from './helpers/exchange-api.mjs';
import {
  getFreePort,
  parseSseJson,
  spawnServer,
  stopChild,
  waitForHealth,
} from './helpers/exchange-mcp.mjs';

const PAPER = {
  paperId: 'arxiv:1706.03762',
  primaryId: 'arxiv:1706.03762',
  title: 'Attention Is All You Need',
  abstract: 'We propose a new network architecture.',
  authors: ['Ashish Vaswani', 'Noam Shazeer'],
  createdDate: '2017-06-12',
  updateDate: '2017-06-12',
};

const names = Array.from({ length: 16 }, (_, i) => `Author ${i + 1}`);
const LONG_LIST = { ...PAPER, primaryId: 'arxiv:2001.00001', authors: names };
const LONG_STRING = {
  ...PAPER,
  primaryId: 'arxiv:2001.00002',
  authors: names.join(', '),
};

async function searchPapers(t, args) {
  const api = await startFakeExchangeApi({
    papers: { results: [PAPER, LONG_LIST, LONG_STRING] },
  });
  t.after(() => api.close());
  const port = await getFreePort();
  const child = spawnServer({
    HTTP_STREAMABLE_SERVER: 'true',
    FASTMCP_ENDPOINT: '/v2/mcp',
    HOST: '127.0.0.1',
    FIRECRAWL_API_KEY: 'fc-test',
    FIRECRAWL_API_URL: api.url,
    PORT: String(port),
  });
  t.after(() => stopChild(child));
  await waitForHealth(port, child);

  const response = await fetch(`http://127.0.0.1:${port}/v2/mcp`, {
    body: JSON.stringify({
      id: 1,
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: 'firecrawl_research_search_papers', arguments: args },
    }),
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'x-api-key': 'fc-test',
    },
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(response.status, 200);
  const message = parseSseJson(await response.text());
  assert.equal(message.error, undefined, JSON.stringify(message.error));
  assert.notEqual(message.result.isError, true, JSON.stringify(message.result));
  const request = api.requests.find(
    (entry) =>
      entry.method === 'GET' &&
      entry.url.startsWith('/v2/search/research/papers')
  );
  return {
    text: message.result.content.map((part) => part.text).join('\n'),
    url: new URL(request.url, 'http://127.0.0.1'),
  };
}

test('a paper search prints authors and dates, and sends sort', async (t) => {
  const { text, url } = await searchPapers(t, {
    query: 'transformer attention',
    sort: 'date_desc',
  });

  assert.match(text, /Authors: Ashish Vaswani; Noam Shazeer/);
  assert.match(text, /Dates: created 2017-06-12; updated 2017-06-12/);
  assert.match(text, /Author 15; et al\.\nDates:/);
  assert.match(text, /Author 15; \+1 more\nDates:/);
  assert.doesNotMatch(text, /Author 16/);
  assert.equal(url.searchParams.get('sort'), 'date_desc');
  assert.equal(url.searchParams.get('query'), 'transformer attention');
});
