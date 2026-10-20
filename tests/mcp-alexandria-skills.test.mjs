import assert from 'node:assert/strict';
import test from 'node:test';
import { callExpectingError, startStdioWithApi, toolText } from './helpers/exchange-mcp.mjs';

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

test('skill tools refuse unknown or missing arguments before calling Exchange', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const before = api.requests.length;
  await callExpectingError(client, { name: 'firecrawl_read_skill', arguments: {} });
  await callExpectingError(client, { name: 'firecrawl_find_skills', arguments: { limit: 51 } });
  await callExpectingError(client, { name: 'firecrawl_find_skills', arguments: { extra: true } });
  assert.equal(api.requests.length, before);
});
