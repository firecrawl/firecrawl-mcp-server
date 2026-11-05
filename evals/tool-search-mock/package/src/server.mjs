#!/usr/bin/env node
// Offline stdio MCP server for tool-search experiments. Variant "a" serves today's
// Firecrawl surface (28 tools, Alexandria behind search and find_tools); variant "b"
// adds one tool per Alexandria capability. No network calls are made.
import { readFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const here = dirname(fileURLToPath(import.meta.url));
const data = (f) => readFileSync(join(here, '..', 'data', f), 'utf8');
const variant = process.env.TS_MOCK_VARIANT || process.argv[2] || 'a';
const base = JSON.parse(data('base-tools.json'));
const catalogue = JSON.parse(data('catalogue.json'));
const instructions = data('instructions.txt');
const byToolName = new Map(catalogue.map((c) => [c.tool_name, c]));
const tools = variant === 'b' ? [...base, ...catalogue.map((c) => c.tool)] : base;
const logFile = process.env.TS_MOCK_LOG;

const STOP = new Set('a an and are as at be by for from get how i in is it me my of on or the to what with this that find show list give tell'.split(' '));
const terms = (s) => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !STOP.has(t));
const docs = catalogue.map((c) => terms([c.provider, c.provider_name, c.capability, c.name, c.name, c.description, c.provider_description].join(' ')));
const df = new Map();
docs.forEach((d) => new Set(d).forEach((t) => df.set(t, (df.get(t) || 0) + 1)));
const avg = docs.reduce((s, d) => s + d.length, 0) / docs.length;
function rank(query, k = 10) {
  const q = terms(query);
  return docs
    .map((d, i) => {
      let score = 0;
      for (const t of q) {
        const tf = d.filter((x) => x === t).length;
        if (!tf) continue;
        const idf = Math.log(1 + (docs.length - df.get(t) + 0.5) / (df.get(t) + 0.5));
        score += (idf * tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * (d.length / avg)));
      }
      return { i, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((r) => catalogue[r.i]);
}

const contract = (c) => ({
  id: c.id, provider: c.provider, capability: c.capability, name: c.name, description: c.description,
  options: c.options, ...(c.requiresOneOf ? { requiresOneOf: c.requiresOneOf } : {}),
  execute: { tool: 'firecrawl_scrape', arguments: { alexandria: { provider: c.provider, capability: c.capability, options: {} } } },
});
const record = (provider, capability, options) => ({
  success: true,
  data: { alexandria: [{ provider, capability, data: { records: [{ id: 'rec_1', input: options || {}, status: 'matched' }], count: 1 } }] },
});

function call(name, args = {}) {
  const cap = byToolName.get(name);
  if (cap && variant === 'b') return record(cap.provider, cap.capability, args);
  switch (name) {
    case 'firecrawl_find_tools': {
      const q = args.query || (args.urls || []).join(' ') || (args.providers || []).join(' ') || (args.capabilities || []).join(' ');
      let hits = args.providers?.length
        ? catalogue.filter((c) => args.providers.includes(c.provider) && (!args.capabilities?.length || args.capabilities.includes(c.capability)))
        : rank(q, args.limit || 10);
      if (!q && !args.providers?.length) return { success: true, data: { alexandria: [{ provider: 'firecrawl', capability: 'find-tools', data: { level: 'categories', items: [...new Set(catalogue.map((c) => c.provider))].slice(0, 40).map((p) => ({ provider: p })) } }] } };
      return { success: true, data: { alexandria: [{ provider: 'firecrawl', capability: 'find-tools', data: { level: 'tools', query: q, items: hits.map(contract), total: hits.length } }] } };
    }
    case 'firecrawl_search': {
      const q = args.query || '';
      const web = [1, 2, 3].map((n) => ({ url: 'https://example.com/result-' + n, title: q + ' - result ' + n, description: 'Search result ' + n + ' for "' + q + '".' }));
      const providers = rank(q, 3).map(contract);
      return { success: true, data: { web, ...(providers.length ? { alexandria: { tools: providers, note: 'Matching Alexandria providers; run one through firecrawl_scrape with alexandria.' } } : {}) } };
    }
    case 'firecrawl_scrape': {
      if (args.alexandria) {
        const calls = [].concat(args.alexandria);
        return { success: true, data: { alexandria: calls.map((a) => record(a.provider, a.capability, a.options).data.alexandria[0]) } };
      }
      return { success: true, data: { markdown: '# ' + (args.url || 'Page') + '\n\nPage content retrieved. Plans: Starter, Growth, Enterprise. Contact sales for volume pricing.', metadata: { sourceURL: args.url, statusCode: 200 } } };
    }
    case 'firecrawl_map':
      return { success: true, data: { links: ['/', '/introduction', '/quickstart', '/api-reference', '/features/scrape', '/features/search', '/features/crawl', '/features/map'].map((p) => (args.url || 'https://example.com').replace(/\/$/, '') + p) } };
    default:
      return { success: true, data: { status: 'completed', tool: name } };
  }
}

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const log = (entry) => { if (logFile) try { appendFileSync(logFile, JSON.stringify({ t: Date.now(), variant, ...entry }) + '\n'); } catch {} };
createInterface({ input: process.stdin }).on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  const { id, method, params } = msg;
  if (id === undefined || id === null) return;
  if (method === 'initialize') {
    return send({ jsonrpc: '2.0', id, result: { protocolVersion: params?.protocolVersion || '2025-06-18', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'firecrawl-fastmcp', version: '0.0.0-tsmock-' + variant }, instructions } });
  }
  if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} });
  if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools } });
  if (method === 'tools/call') {
    const name = params?.name;
    if (!tools.some((t) => t.name === name)) return send({ jsonrpc: '2.0', id, error: { code: -32602, message: 'Unknown tool: ' + name } });
    const result = call(name, params?.arguments || {});
    log({ tool: name, arguments: params?.arguments || {} });
    return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(result) }] } });
  }
  if (method === 'resources/list') return send({ jsonrpc: '2.0', id, result: { resources: [] } });
  if (method === 'prompts/list') return send({ jsonrpc: '2.0', id, result: { prompts: [] } });
  send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found: ' + method } });
});
