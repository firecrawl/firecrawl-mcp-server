import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createFirecrawlMcpServer } from '../dist/server.js';
import { startFakeExchangeApi } from './helpers/exchange-api.mjs';
import { callExpectingError, getFreePort, startStdio, startStdioWithApi, toolText } from './helpers/exchange-mcp.mjs';

const data = result => toolText(result).data.alexandria[0].data;
const readCommand = path => ({ name: 'alexandria_library_search', arguments: { command: `cat ${path}` } });

test('skills are read through alexandria_library_search; firecrawl_save_skill writes', async (t) => {
  const { client } = await startStdioWithApi(t);
  const { tools } = await client.request('tools/list', {});
  for (const name of ['firecrawl_skills', 'firecrawl_find_skills', 'firecrawl_read_skill', 'firecrawl_create_skill', 'firecrawl_update_skill']) assert(!tools.some(tool => tool.name === name), name);
  assert.deepEqual(tools.find(tool => tool.name === 'firecrawl_save_skill')?.annotations, { title: 'Save Skill', readOnlyHint: false, openWorldHint: false, destructiveHint: true, idempotentHint: false });
  const library = tools.find(tool => tool.name === 'alexandria_library_search');
  assert.match(library.description, /under \/skills: `grep -i "<word>" \/skills\/INDEX` lists them/);
});

test('keyless sessions do not list firecrawl_save_skill', async (t) => {
  const { client } = await startStdio(t, { CLOUD_SERVICE: 'false', FIRECRAWL_API_KEY: '', FIRECRAWL_API_URL: '' });
  const { tools } = await client.request('tools/list', {});
  assert(!tools.some(tool => tool.name === 'firecrawl_save_skill'));
});

test('firecrawl_save_skill without id creates a skill and returns its path and the command that reads it', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const call = arguments_ => client.request('tools/call', { name: 'firecrawl_save_skill', arguments: arguments_ });
  const copied = data(await call({ from: 'deep-research', slug: 'our-research' }));
  assert.deepEqual(api.requests.at(-1).body.alexandria, { provider: 'firecrawl', capability: 'create-skill', options: { from: 'deep-research', slug: 'our-research' } });
  assert.equal(copied.id, 'team:our-research');
  assert.equal(copied.path, '/skills/team/our-research/SKILL.md');
  assert.deepEqual(copied.nextTool, readCommand('/skills/team/our-research/SKILL.md'));
  await call({ name: 'Digest', description: 'Summarise.', body: 'Run @fred/series/observations.' });
  assert.deepEqual(api.requests.at(-1).body.alexandria, { provider: 'firecrawl', capability: 'create-skill', options: { name: 'Digest', description: 'Summarise.', body: 'Run @fred/series/observations.' } });
});

test('firecrawl_save_skill with id updates the skill from its baseVersion', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const saved = data(await client.request('tools/call', { name: 'firecrawl_save_skill', arguments: { id: 'team:weekly-digest', baseVersion: 2, enabled: false } }));
  assert.deepEqual(api.requests.at(-1).body.alexandria, { provider: 'firecrawl', capability: 'update-skill', options: { id: 'team:weekly-digest', baseVersion: 2, enabled: false } });
  assert.equal(saved.skill.version, 3);
  assert.equal(saved.path, '/skills/team/weekly-digest/SKILL.md');
  assert.deepEqual(saved.nextTool, readCommand('/skills/team/weekly-digest/SKILL.md'));
});

test('a surface without the library tools reads the saved skill through firecrawl_scrape', async (t) => {
  const api = await startFakeExchangeApi();
  t.after(() => api.close());
  const port = await getFreePort();
  const instance = createFirecrawlMcpServer({
    transport: 'httpStream',
    apiUrl: api.url,
    unstable_hooks: {
      authenticate: async () => ({ authType: 'api-key', firecrawlApiKey: 'fc-test' }),
      toolFilter: (name) => !name.startsWith('alexandria_'),
    },
  });
  await instance.start({ transportType: 'httpStream', httpStream: { port, host: '127.0.0.1', endpoint: '/mcp', stateless: true } });
  t.after(() => instance.stop());
  const client = new Client({ name: 'skills-legacy-test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
  t.after(() => client.close());
  const result = await client.callTool({ name: 'firecrawl_save_skill', arguments: { id: 'team:weekly-digest', baseVersion: 2, name: 'Digest' } });
  const saved = JSON.parse(result.content[0].text).data.alexandria[0].data;
  assert.deepEqual(saved.nextTool, { name: 'firecrawl_scrape', arguments: { alexandria: { provider: 'firecrawl', capability: 'library', options: { command: 'cat /skills/team/weekly-digest/SKILL.md' } } } });
});

test('firecrawl_save_skill refuses invalid combinations before calling Exchange', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const before = api.requests.length;
  for (const arguments_ of [
    {},
    { name: 'Digest', description: 'Summarise.' },
    { from: 'deep-research', extra: 1 },
    { from: 'deep-research', slug: 'Our Research' },
    { from: 'deep-research', baseVersion: 1 },
    { name: 'Digest', description: 'Summarise.', body: 'Run it.', enabled: false },
    { from: 'deep-research', discoverable: false },
    { id: 'team:weekly-digest', name: 'x' },
    { id: 'team:weekly-digest', baseVersion: 1 },
    { id: 'team:weekly-digest', baseVersion: 1, from: 'deep-research' },
    { id: 'team:weekly-digest', baseVersion: 1, name: 'x', slug: 'other' },
    { id: 'team:weekly-digest', baseVersion: 1, delete: true },
    { id: 'deep-research', baseVersion: 1, name: 'x' },
  ]) await callExpectingError(client, { name: 'firecrawl_save_skill', arguments: arguments_ });
  assert.equal(api.requests.length, before);
});

test('a refused skill write names no request ID to resend, since firecrawl_save_skill takes none', async (t) => {
  const { client } = await startStdioWithApi(t, { apiStatus: 409, apiError: 'conflict: team:weekly-digest is at version 3' });
  const result = await client.request('tools/call', { name: 'firecrawl_save_skill', arguments: { id: 'team:weekly-digest', baseVersion: 2, enabled: false } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /^conflict: team:weekly-digest is at version 3 Request ID: /);
  assert.doesNotMatch(result.content[0].text, /Reuse this ID/);
});
