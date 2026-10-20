import assert from 'node:assert/strict';
import test from 'node:test';
import { callExpectingError, startStdio, startStdioWithApi, toolText } from './helpers/exchange-mcp.mjs';

test('find_skills lists skills through find-skills and links each to read_skill', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const { tools } = await client.request('tools/list', {});
  for (const name of ['firecrawl_find_skills', 'firecrawl_read_skill']) {
    const tool = tools.find(entry => entry.name === name);
    assert(tool, name);
    assert.equal(tool.annotations.readOnlyHint, true);
  }
  for (const [name, destructive] of [['firecrawl_create_skill', false], ['firecrawl_update_skill', true]]) {
    const tool = tools.find(entry => entry.name === name);
    assert(tool, name);
    assert.equal(tool.annotations.readOnlyHint, false);
    assert.equal(tool.annotations.destructiveHint, destructive, name);
  }
  const page = toolText(await client.request('tools/call', { name: 'firecrawl_find_skills', arguments: { query: 'digest', limit: 5 } })).data.alexandria[0].data;
  assert.deepEqual(api.requests.at(-1).body.alexandria, { provider: 'firecrawl', capability: 'find-skills', options: { query: 'digest', limit: 5 } });
  assert.equal(page.total, 2);
  assert.equal(page.skills[0].source, 'team');
  assert.equal(page.skills[0].createTool, undefined);
  assert.deepEqual(page.skills[1].createTool, { name: 'firecrawl_create_skill', arguments: { from: 'deep-research' } });
  assert.deepEqual(page.skills.map(skill => skill.nextTool), [
    { name: 'firecrawl_read_skill', arguments: { id: 'team:weekly-digest' } },
    { name: 'firecrawl_read_skill', arguments: { id: 'deep-research' } },
  ]);
});

test('read_skill reads one skill file through read-skill', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const skill = toolText(await client.request('tools/call', { name: 'firecrawl_read_skill', arguments: { id: 'deep-research', path: 'references/sources.md' } })).data.alexandria[0].data;
  assert.deepEqual(api.requests.at(-1).body.alexandria, { provider: 'firecrawl', capability: 'read-skill', options: { id: 'deep-research', path: 'references/sources.md' } });
  assert.equal(skill.path, 'references/sources.md');
  assert.equal(skill.content, '# Deep research');
});

test('read_skill returns a team skill with its tools, current or pinned', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const read = async arguments_ => toolText(await client.request('tools/call', { name: 'firecrawl_read_skill', arguments: arguments_ })).data.alexandria[0].data;
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

test('skill tools refuse unknown or missing arguments before calling Exchange', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const before = api.requests.length;
  await callExpectingError(client, { name: 'firecrawl_read_skill', arguments: {} });
  await callExpectingError(client, { name: 'firecrawl_find_skills', arguments: { limit: 51 } });
  await callExpectingError(client, { name: 'firecrawl_find_skills', arguments: { extra: true } });
  await callExpectingError(client, { name: 'firecrawl_read_skill', arguments: { id: 'deep-research', extra: true } });
  await callExpectingError(client, { name: 'firecrawl_read_skill', arguments: { id: 'team:weekly-digest', version: 0 } });
  assert.equal(api.requests.length, before);
});

test('keyless sessions do not list the skill tools', async (t) => {
  const { client } = await startStdio(t, { CLOUD_SERVICE: 'false', FIRECRAWL_API_KEY: '', FIRECRAWL_API_URL: '' });
  const { tools } = await client.request('tools/list', {});
  for (const name of ['firecrawl_find_skills', 'firecrawl_read_skill', 'firecrawl_create_skill', 'firecrawl_update_skill']) assert(!tools.some(tool => tool.name === name), name);
});

test('create_skill copies or writes a skill and links to reading it', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const call = arguments_ => client.request('tools/call', { name: 'firecrawl_create_skill', arguments: arguments_ });
  const copied = toolText(await call({ from: 'deep-research', slug: 'our-research' })).data.alexandria[0].data;
  assert.deepEqual(api.requests.at(-1).body.alexandria, { provider: 'firecrawl', capability: 'create-skill', options: { from: 'deep-research', slug: 'our-research' } });
  assert.equal(copied.id, 'team:our-research');
  assert.deepEqual(copied.nextTool, { name: 'firecrawl_read_skill', arguments: { id: 'team:our-research' } });
  await call({ name: 'Digest', description: 'Summarise.', body: 'Run @fred/series/observations.' });
  assert.deepEqual(api.requests.at(-1).body.alexandria.options, { name: 'Digest', description: 'Summarise.', body: 'Run @fred/series/observations.' });
});

test('update_skill sends the change with its baseVersion', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const saved = toolText(await client.request('tools/call', { name: 'firecrawl_update_skill', arguments: { id: 'team:weekly-digest', baseVersion: 2, enabled: false } })).data.alexandria[0].data;
  assert.deepEqual(api.requests.at(-1).body.alexandria, { provider: 'firecrawl', capability: 'update-skill', options: { id: 'team:weekly-digest', baseVersion: 2, enabled: false } });
  assert.equal(saved.skill.version, 3);
  assert.deepEqual(saved.nextTool, { name: 'firecrawl_read_skill', arguments: { id: 'team:weekly-digest' } });
});

test('write tools refuse bad arguments before calling Exchange', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const before = api.requests.length;
  await callExpectingError(client, { name: 'firecrawl_update_skill', arguments: { id: 'team:weekly-digest', name: 'x' } });
  await callExpectingError(client, { name: 'firecrawl_update_skill', arguments: { id: 'team:weekly-digest', baseVersion: 1, delete: true } });
  await callExpectingError(client, { name: 'firecrawl_create_skill', arguments: { from: 'deep-research', extra: 1 } });
  await callExpectingError(client, { name: 'firecrawl_create_skill', arguments: {} });
  await callExpectingError(client, { name: 'firecrawl_create_skill', arguments: { name: 'Digest', description: 'Summarise.' } });
  await callExpectingError(client, { name: 'firecrawl_create_skill', arguments: { from: 'deep-research', slug: 'Our Research' } });
  await callExpectingError(client, { name: 'firecrawl_update_skill', arguments: { id: 'team:weekly-digest', baseVersion: 1 } });
  await callExpectingError(client, { name: 'firecrawl_update_skill', arguments: { id: 'deep-research', baseVersion: 1, name: 'x' } });
  assert.equal(api.requests.length, before);
});
