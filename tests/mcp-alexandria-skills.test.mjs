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
  const page = toolText(await client.request('tools/call', { name: 'firecrawl_find_skills', arguments: { query: 'digest', limit: 5 } })).data.alexandria[0].data;
  assert.deepEqual(api.requests.at(-1).body.alexandria, { provider: 'firecrawl', capability: 'find-skills', options: { query: 'digest', limit: 5 } });
  assert.equal(page.total, 2);
  assert.equal(page.skills[0].source, 'team');
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
  for (const name of ['firecrawl_find_skills', 'firecrawl_read_skill']) assert(!tools.some(tool => tool.name === name), name);
});
