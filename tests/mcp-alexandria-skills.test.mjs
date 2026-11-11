import assert from 'node:assert/strict';
import test from 'node:test';
import { callExpectingError, startStdio, startStdioWithApi, toolText } from './helpers/exchange-mcp.mjs';

const data = result => toolText(result).data.alexandria[0].data;

test('firecrawl_skills reads and firecrawl_save_skill writes, by their annotations', async (t) => {
  const { client } = await startStdioWithApi(t);
  const { tools } = await client.request('tools/list', {});
  for (const name of ['firecrawl_find_skills', 'firecrawl_read_skill', 'firecrawl_create_skill', 'firecrawl_update_skill']) assert(!tools.some(tool => tool.name === name), name);
  const annotations = name => tools.find(tool => tool.name === name)?.annotations;
  assert.deepEqual(annotations('firecrawl_skills'), { title: 'Skills', readOnlyHint: true, openWorldHint: false, destructiveHint: false, idempotentHint: true });
  assert.deepEqual(annotations('firecrawl_save_skill'), { title: 'Save Skill', readOnlyHint: false, openWorldHint: false, destructiveHint: true, idempotentHint: false });
});

test('firecrawl_skills lists skills through find-skills and links each to reading it', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const page = data(await client.request('tools/call', { name: 'firecrawl_skills', arguments: { query: 'digest', limit: 5 } }));
  assert.deepEqual(api.requests.at(-1).body.alexandria, { provider: 'firecrawl', capability: 'find-skills', options: { query: 'digest', limit: 5 } });
  assert.equal(page.total, 2);
  assert.equal(page.skills[0].source, 'team');
  assert.equal(page.skills[0].createTool, undefined);
  assert.deepEqual(page.skills[1].createTool, { name: 'firecrawl_save_skill', arguments: { from: 'deep-research' } });
  assert.deepEqual(page.skills.map(skill => skill.nextTool), [
    { name: 'firecrawl_skills', arguments: { id: 'team:weekly-digest' } },
    { name: 'firecrawl_skills', arguments: { id: 'deep-research' } },
  ]);
});

test('firecrawl_skills with neither query nor id lists every skill', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const call = arguments_ => client.request('tools/call', { name: 'firecrawl_skills', arguments: arguments_ });
  const page = data(await call({}));
  assert.deepEqual(api.requests.at(-1).body.alexandria, { provider: 'firecrawl', capability: 'find-skills', options: {} });
  assert.equal(page.total, 2);
  assert.deepEqual(page.skills[0].nextTool, { name: 'firecrawl_skills', arguments: { id: 'team:weekly-digest' } });
  await call({ limit: 5 });
  assert.deepEqual(api.requests.at(-1).body.alexandria, { provider: 'firecrawl', capability: 'find-skills', options: { limit: 5 } });
});

test('firecrawl_skills with id reads one skill file through read-skill', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const skill = data(await client.request('tools/call', { name: 'firecrawl_skills', arguments: { id: 'deep-research', path: 'references/sources.md' } }));
  assert.deepEqual(api.requests.at(-1).body.alexandria, { provider: 'firecrawl', capability: 'read-skill', options: { id: 'deep-research', path: 'references/sources.md' } });
  assert.equal(skill.path, 'references/sources.md');
  assert.equal(skill.content, '# Deep research');
});

test('firecrawl_skills returns a team skill with its tools, current or pinned', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const read = async arguments_ => data(await client.request('tools/call', { name: 'firecrawl_skills', arguments: arguments_ }));
  const current = await read({ id: 'team:weekly-digest' });
  assert.deepEqual(api.requests.at(-1).body.alexandria.options, { id: 'team:weekly-digest' });
  assert.equal(current.path, 'SKILL.md');
  assert.equal(current.trust, 'team-authored');
  assert.equal(current.version, 2);
  assert.deepEqual(current.tools[0].call, { provider: 'fred', capability: 'series/observations', options: {} });
  const pinned = await read({ id: 'team:weekly-digest', version: 1 });
  assert.deepEqual(api.requests.at(-1).body.alexandria.options, { id: 'team:weekly-digest', version: 1 });
  assert.equal(pinned.version, 1);
});

test('firecrawl_skills refuses ambiguous or invalid arguments before calling Exchange', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const before = api.requests.length;
  for (const arguments_ of [{ query: 'digest', id: 'deep-research' }, { id: 'deep-research', limit: 5 }, { query: 'digest', path: 'SKILL.md' }, { query: 'digest', version: 1 }, { path: 'SKILL.md' }, { version: 1 }]) {
    const result = await callExpectingError(client, { name: 'firecrawl_skills', arguments: arguments_ });
    assert.equal(result.structuredContent?.error?.code, 'invalid_request', JSON.stringify(arguments_));
  }
  for (const arguments_ of [{ query: 'digest', limit: 51 }, { query: 'digest', extra: true }, { id: 'deep-research', extra: true }, { id: 'team:weekly-digest', version: 0 }]) {
    await callExpectingError(client, { name: 'firecrawl_skills', arguments: arguments_ });
  }
  assert.equal(api.requests.length, before);
});

test('keyless sessions do not list the skill tools', async (t) => {
  const { client } = await startStdio(t, { CLOUD_SERVICE: 'false', FIRECRAWL_API_KEY: '', FIRECRAWL_API_URL: '' });
  const { tools } = await client.request('tools/list', {});
  for (const name of ['firecrawl_skills', 'firecrawl_save_skill']) assert(!tools.some(tool => tool.name === name), name);
});

test('firecrawl_save_skill without id creates a skill, copied or written, and links to reading it', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const call = arguments_ => client.request('tools/call', { name: 'firecrawl_save_skill', arguments: arguments_ });
  const copied = data(await call({ from: 'deep-research', slug: 'our-research' }));
  assert.deepEqual(api.requests.at(-1).body.alexandria, { provider: 'firecrawl', capability: 'create-skill', options: { from: 'deep-research', slug: 'our-research' } });
  assert.equal(copied.id, 'team:our-research');
  assert.equal(copied.skill.version, 1);
  assert.deepEqual(copied.nextTool, { name: 'firecrawl_skills', arguments: { id: 'team:our-research' } });
  await call({ name: 'Digest', description: 'Summarise.', body: 'Run @fred/series/observations.' });
  assert.deepEqual(api.requests.at(-1).body.alexandria, { provider: 'firecrawl', capability: 'create-skill', options: { name: 'Digest', description: 'Summarise.', body: 'Run @fred/series/observations.' } });
});

test('firecrawl_save_skill with id updates the skill from its baseVersion', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const saved = data(await client.request('tools/call', { name: 'firecrawl_save_skill', arguments: { id: 'team:weekly-digest', baseVersion: 2, enabled: false } }));
  assert.deepEqual(api.requests.at(-1).body.alexandria, { provider: 'firecrawl', capability: 'update-skill', options: { id: 'team:weekly-digest', baseVersion: 2, enabled: false } });
  assert.equal(saved.skill.version, 3);
  assert.deepEqual(saved.nextTool, { name: 'firecrawl_skills', arguments: { id: 'team:weekly-digest' } });
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
