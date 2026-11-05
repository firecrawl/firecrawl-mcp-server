#!/usr/bin/env node
import { spawn } from 'node:child_process';
const variant = process.argv[2] || 'a';
const p = spawn(process.execPath, [new URL('./package/bin/' + variant + '.mjs', import.meta.url).pathname], { stdio: ['pipe', 'pipe', 'inherit'] });
let buf = ''; const pending = new Map();
p.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); pending.get(m.id)?.(m); } });
let n = 0; const rpc = (method, params) => new Promise((r) => { const id = ++n; pending.set(id, r); p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } });
const list = await rpc('tools/list', {});
const names = list.result.tools.map((t) => t.name);
const bad = names.filter((x) => !/^[a-zA-Z0-9_-]{1,64}$/.test('mcp__firecrawl__' + x));
const chars = JSON.stringify(list.result.tools).length;
const ft = await rpc('tools/call', { name: 'firecrawl_find_tools', arguments: { query: 'enrich lead from email', objective: 'x' } });
const ft2 = await rpc('tools/call', { name: 'firecrawl_find_tools', arguments: { query: 'npm weekly downloads', objective: 'x' } });
const se = await rpc('tools/call', { name: 'firecrawl_search', arguments: { query: 'Anthropic latest funding round' } });
const out = { variant, server: init.result.serverInfo, instr: init.result.instructions.length, count: names.length, toolsJsonChars: chars, approxTokens: Math.round(chars / 4), bad,
  alwaysLoad: list.result.tools.filter((t) => t._meta?.['anthropic/alwaysLoad']).map((t) => t.name),
  findEnrich: JSON.parse(ft.result.content[0].text).data.alexandria[0].data.items.map((i) => i.id),
  findNpm: JSON.parse(ft2.result.content[0].text).data.alexandria[0].data.items.map((i) => i.id).slice(0, 5),
  searchProviders: JSON.parse(se.result.content[0].text).data.alexandria?.tools.map((i) => i.id) };
if (variant === 'b') { const c = await rpc('tools/call', { name: 'npmjs_packages_get_downloads', arguments: { package: 'react' } }); out.capCall = c.result.content[0].text.slice(0, 200); out.sample = names.slice(28, 40); }
console.log(JSON.stringify(out, null, 1)); p.kill();
