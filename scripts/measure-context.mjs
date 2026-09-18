import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createInterface } from 'node:readline';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { getEncoding } from 'js-tiktoken';
import { ResultStore } from '../dist/result-store.js';

const cl = getEncoding('cl100k_base');
const o2 = getEncoding('o200k_base');
const count = (s, encoding = cl) => encoding.encode(s, [], []).length;
const metrics = (s) => ({
  bytes: Buffer.byteLength(s),
  cl100k: count(s),
  o200k: count(s, o2),
});
const report = {
  fixtureOnly: true,
  tokenizerNote:
    'Budgets enforce cl100k_base and o200k_base including MCP content framing; neither is an Anthropic tokenizer.',
  matrix: [],
  transport: [],
  failureModes: {},
};
const fixtures = [
  ['batch-72KB', 72000, 'Company founder and funding information. '],
  [
    'search-144KB',
    144000,
    'Tool schema description with required inputs and example queries. ',
  ],
  [
    'jobs-431KB',
    431000,
    'Machine learning engineer job requirements, salary and location. ',
  ],
  [
    'contracts-1.14MB',
    1140000,
    'Full expanded contract: properties, response schema, examples and descriptions. ',
  ],
  [
    'opportunities-2.5MB',
    2500000,
    'Procurement opportunity description, agency and eligibility requirements. ',
  ],
  ['unicode-72KB', 72000, '東京 中文 العربية 😀 🔥 café résumé '],
  [
    'escaped-72KB',
    72000,
    '\\path\\to\\file "quoted"\nline\ttab <|endoftext|> ',
  ],
].map(([name, size, sentence]) => {
  const row = { id: 0, title: name, description: sentence.repeat(12) };
  const rows = Array.from(
    { length: Math.ceil(size / Buffer.byteLength(JSON.stringify(row))) },
    (_, id) => ({ ...row, id })
  );
  return {
    name,
    rows,
    text: JSON.stringify({
      success: true,
      data: { rows },
      requestId: 'fixture-request',
    }),
  };
});

for (const fixture of fixtures) {
  const input = metrics(fixture.text);
  for (const budget of [512, 1000, 4000, 16000]) {
    const store = new ResultStore();
    const timings = [];
    let output;
    for (let n = 0; n < 3; n++) {
      const start = performance.now();
      output = await store.bound(fixture.text, 'owner', budget);
      timings.push(performance.now() - start);
    }
    const measured = metrics(output);
    assert.ok(measured.cl100k <= budget, `${fixture.name}: budget exceeded`);
    const envelope = JSON.parse(output);
    let selected;
    if (envelope.resultId) {
      const read = store.read('owner', {
        resultId: envelope.resultId,
        path: `/data/rows/${fixture.rows.length - 1}`,
        fields: ['id', 'title'],
        maxOutputTokens: budget,
      });
      selected = metrics(read);
      assert.ok(selected.cl100k <= budget);
      assert.equal(
        JSON.parse(JSON.parse(read).content).id,
        fixture.rows.length - 1
      );
    }
    report.matrix.push({
      fixture: fixture.name,
      budget,
      input,
      output: measured,
      selected,
      medianMs: +timings.sort((a, b) => a - b)[1].toFixed(2),
      maxMs: +Math.max(...timings).toFixed(2),
    });
  }
  console.log(`Measured ${fixture.name}`);
}

const full = fixtures[0];
const store = new ResultStore();
const firstText = await store.bound(full.text, 'owner', 4000);
const first = JSON.parse(firstText);
let restored = first.preview;
let next = first.next?.arguments;
let totalTokens = count(firstText);
let calls = 1;
while (next) {
  const result = store.read('owner', next);
  const page = JSON.parse(result);
  assert.ok(page.content.length > 0);
  assert.ok(count(result) <= 4000);
  restored += page.content;
  next = page.next?.arguments;
  totalTokens += count(result);
  calls++;
}
assert.equal(restored, full.text);
report.fullRead = {
  fixture: full.name,
  calls,
  totalTokens,
  originalTokens: count(full.text),
  lossless: true,
};
assert.throws(
  () => new ResultStore().read('owner', { resultId: first.resultId }),
  /unavailable/
);
report.failureModes.crossInstance =
  'Not recoverable: process-local storage; no provider rerun';
assert.throws(
  () => store.read('other-owner', { resultId: first.resultId }),
  /unavailable/
);
report.failureModes.crossOwner = 'Rejected';

let apiCalls = 0;
const payload = JSON.parse(fixtures[4].text);
const api = createServer(async (req, res) => {
  let body = '';
  for await (const part of req) body += part;
  apiCalls++;
  res.setHeader('content-type', 'application/json');
  if (body.includes('oversized-error')) {
    res.writeHead(403);
    res.end(
      JSON.stringify({
        error: 'Provider failure. '.repeat(10000),
        code: 'provider_error',
      })
    );
  } else {
    res.end(JSON.stringify(payload));
  }
});
await new Promise((resolve) => api.listen(0, '127.0.0.1', resolve));
const apiUrl = `http://127.0.0.1:${api.address().port}`;
async function startClient(cwd) {
  const child = spawn(process.execPath, ['dist/index.js'], {
    cwd,
    env: {
      ...process.env,
      FIRECRAWL_API_KEY: 'fc-context-test',
      FIRECRAWL_API_URL: apiUrl,
      FIRECRAWL_OAUTH_TOKEN: '',
      CLOUD_SERVICE: 'false',
      HTTP_STREAMABLE_SERVER: 'false',
      SSE_LOCAL: 'false',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stderr.resume();
  const pending = new Map();
  let id = 0;
  createInterface({ input: child.stdout }).on('line', (line) => {
    const value = JSON.parse(line);
    const entry = pending.get(value.id);
    if (entry) {
      clearTimeout(entry.timer);
      pending.delete(value.id);
      value.error
        ? entry.reject(new Error(JSON.stringify(value.error)))
        : entry.resolve(value.result);
    }
  });
  const request = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      const timer = setTimeout(
        () => reject(new Error(`Timed out ${method}`)),
        30000
      );
      pending.set(n, { resolve, reject, timer });
      child.stdin.write(
        JSON.stringify({ jsonrpc: '2.0', id: n, method, params }) + '\n'
      );
    });
  const init = await request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'context-benchmark', version: '1' },
  });
  child.stdin.write(
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) +
      '\n'
  );
  return { request, init, stop: () => child.kill() };
}
try {
  for (const [version, cwd] of [
    ['baseline', process.env.MCP_BASELINE_DIR],
    ['current', process.cwd()],
  ]) {
    if (!cwd) continue;
    const client = await startClient(cwd);
    try {
      const listing = await client.request('tools/list');
      report.transport.push({
        version,
        kind: 'tools/list',
        tools: listing.tools.length,
        ...metrics(JSON.stringify(listing)),
        largestTools: listing.tools
          .map((t) => ({ name: t.name, tokens: count(JSON.stringify(t)) }))
          .sort((a, b) => b.tokens - a.tokens)
          .slice(0, 6),
        instructionTokens: count(client.init.instructions ?? ''),
      });
      for (const [name, args] of [
        ['firecrawl_search', { query: 'fixture' }],
        ['firecrawl_exchange_discover', { cohort: 'finance', expand: 'all' }],
        [
          'firecrawl_scrape',
          { alexandria: [{ provider: 'fixture', capability: 'search' }] },
        ],
        [
          'firecrawl_scrape',
          {
            alexandria: [{ provider: 'oversized-error', capability: 'search' }],
          },
        ],
      ]) {
        const start = performance.now();
        const result = await client.request('tools/call', {
          name,
          arguments: args,
        });
        const elapsedMs = performance.now() - start;
        const text = result.content
          .filter((x) => x.type === 'text')
          .map((x) => x.text)
          .join('\n');
        const item = {
          version,
          kind: name,
          error: args.alexandria?.[0]?.provider === 'oversized-error',
          isError: result.isError ?? false,
          text: metrics(text),
          wire: metrics(JSON.stringify(result)),
          structuredContentTokens: result.structuredContent
            ? count(JSON.stringify(result.structuredContent))
            : 0,
          ms: +elapsedMs.toFixed(2),
        };
        report.transport.push(item);
        if (version === 'current') {
          assert.ok(
            item.wire.cl100k <= 4000,
            `${name}: cl100k wire budget exceeded`
          );
          assert.ok(
            item.wire.o200k <= 4000,
            `${name}: o200k wire budget exceeded`
          );
        }
      }
    } finally {
      client.stop();
    }
  }
} finally {
  await new Promise((resolve) => api.close(resolve));
}
report.apiCalls = apiCalls;
report.memory = process.memoryUsage();
await mkdir('reports', { recursive: true });
await writeFile(
  'reports/context-budget-measurements.json',
  JSON.stringify(report, null, 2) + '\n'
);
console.log(
  JSON.stringify(
    {
      matrixCases: report.matrix.length,
      fullRead: report.fullRead,
      transport: report.transport.map(({ largestTools, ...x }) => x),
    },
    null,
    2
  )
);
