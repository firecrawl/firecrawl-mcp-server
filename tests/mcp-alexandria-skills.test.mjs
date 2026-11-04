import assert from 'node:assert/strict';
import test from 'node:test';
import { CLAUDE_CODE_TEXT_CAP } from './helpers/description-budget.mjs';
import { callExpectingError, startStdio, startStdioWithApi, toolText } from './helpers/exchange-mcp.mjs';

test('skill routing lives on the tool descriptions, inside the client window', async (t) => {
  const { client, init } = await startStdioWithApi(t);
  const { tools } = await client.request('tools/list', {});
  const byName = new Map(tools.map(tool => [tool.name, tool.description]));
  assert.match(byName.get('firecrawl_find_skills'), /Set provider to list that provider's skills instead/);
  assert.match(byName.get('firecrawl_find_skills'), /sent as q/);
  assert.match(byName.get('firecrawl_find_skills'), /natural-language goal/);
  const findTool = tools.find(tool => tool.name === 'firecrawl_find_skills');
  assert.match(findTool.inputSchema.properties.query.description, /natural-language goal/);
  assert.match(findTool.inputSchema.properties.query.description, /team skills still match/);
  assert.doesNotMatch(findTool.inputSchema.properties.query.description, /must all appear/);
  assert.match(byName.get('firecrawl_read_skill'), /Pass provider, plugin and skill/);
  assert.match(byName.get('firecrawl_create_skill'), /show the user the result message, which begins "Open it in Firecrawl:"/);
  assert.match(byName.get('firecrawl_update_skill'), /enabled or listed \(discoverable\)/);
  assert.match(byName.get('firecrawl_update_skill'), /show the user the result message, which begins "Open it in Firecrawl:"/);
  for (const name of ['firecrawl_find_skills', 'firecrawl_read_skill', 'firecrawl_create_skill', 'firecrawl_update_skill']) {
    assert.ok(byName.get(name).length <= CLAUDE_CODE_TEXT_CAP, `${name} is ${byName.get(name).length} characters`);
  }
  // The server-instruction prefix is already the catalogue routing Claude Code keeps.
  // Skill routing stays on these descriptions instead of past that 2,048-character cut.
  assert.equal(init.instructions.includes('firecrawl_find_skills'), false);
});

test('find_skills lists skills through find-skills and links each to read_skill', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const { tools } = await client.request('tools/list', {});
  for (const name of ['firecrawl_find_skills', 'firecrawl_read_skill']) {
    const tool = tools.find(entry => entry.name === name);
    assert.ok(tool, name);
    assert.equal(tool.annotations.readOnlyHint, true);
  }
  for (const [name, destructive] of [['firecrawl_create_skill', false], ['firecrawl_update_skill', true]]) {
    const tool = tools.find(entry => entry.name === name);
    assert.ok(tool, name);
    assert.equal(tool.annotations.readOnlyHint, false);
    assert.equal(tool.annotations.destructiveHint, destructive, name);
  }
  const page = toolText(await client.request('tools/call', { name: 'firecrawl_find_skills', arguments: { query: 'digest', limit: 5 } })).data.alexandria[0].data;
  assert.deepEqual(api.requests.at(-1).body.alexandria, { provider: 'firecrawl', capability: 'find-skills', options: { query: 'digest', limit: 5 } });
  assert.equal(api.requests.at(-1).url, '/v2/scrape');
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

test('credentialless self-hosted sessions do not list the skill tools', async (t) => {
  const { client } = await startStdio(t, { CLOUD_SERVICE: 'false', FIRECRAWL_API_KEY: '', FIRECRAWL_API_URL: 'http://127.0.0.1:9' });
  const { tools } = await client.request('tools/list', {});
  for (const name of ['firecrawl_find_skills', 'firecrawl_read_skill', 'firecrawl_create_skill', 'firecrawl_update_skill']) {
    assert.equal(tools.some(tool => tool.name === name), false, name);
  }
});

test('keyless sessions do not list the skill tools', async (t) => {
  const { client } = await startStdio(t, { CLOUD_SERVICE: 'false', FIRECRAWL_API_KEY: '', FIRECRAWL_API_URL: '' });
  const { tools } = await client.request('tools/list', {});
  for (const name of ['firecrawl_find_skills', 'firecrawl_read_skill', 'firecrawl_create_skill', 'firecrawl_update_skill']) {
    assert.equal(tools.some(tool => tool.name === name), false, name);
  }
});

test('create_skill copies or writes a skill and links to reading it', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const call = arguments_ => client.request('tools/call', { name: 'firecrawl_create_skill', arguments: arguments_ });
  const created = toolText(await call({ from: 'deep-research', slug: 'our-research' }));
  const copied = created.data.alexandria[0].data;
  assert.deepEqual(api.requests.at(-1).body.alexandria, { provider: 'firecrawl', capability: 'create-skill', options: { from: 'deep-research', slug: 'our-research' } });
  assert.equal(copied.id, 'team:our-research');
  assert.equal(copied.skill.enabled, true);
  assert.equal(copied.skill.discoverable, true);
  assert.equal(copied.skill.sharing, undefined);
  assert.equal(copied.skill.shared, undefined);
  assert.equal(copied.openUrl, 'https://www.firecrawl.dev/app/alexandria/skills/our-research');
  assert.equal(copied.message, 'Open it in Firecrawl: https://www.firecrawl.dev/app/alexandria/skills/our-research');
  assert.equal(created.message, copied.message);
  assert.equal(copied.openUrl.includes('not-a-page'), false);
  assert.equal(copied.openUrl.includes('/skills/s/'), false);
  assert.deepEqual(copied.nextTool, { name: 'firecrawl_read_skill', arguments: { id: 'team:our-research' } });
  await call({ name: 'Digest', description: 'Summarise.', body: 'Run @fred/series/observations.', requestId: 'save-1' });
  assert.deepEqual(api.requests.at(-1).body.alexandria.options, { name: 'Digest', description: 'Summarise.', body: 'Run @fred/series/observations.' });
  assert.equal(api.requests.at(-1).headers['x-request-id'], 'save-1');
});

test('update_skill sends enabled and discoverable with its baseVersion', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const updated = toolText(await client.request('tools/call', { name: 'firecrawl_update_skill', arguments: { id: 'team:weekly-digest', baseVersion: 2, enabled: false, discoverable: false } }));
  const saved = updated.data.alexandria[0].data;
  assert.deepEqual(api.requests.at(-1).body.alexandria, { provider: 'firecrawl', capability: 'update-skill', options: { id: 'team:weekly-digest', baseVersion: 2, enabled: false, discoverable: false } });
  assert.equal(saved.skill.version, 3);
  assert.equal(saved.skill.enabled, false);
  assert.equal(saved.skill.discoverable, false);
  assert.equal(saved.skill.sharing, undefined);
  assert.equal(saved.skill.shared, undefined);
  assert.equal(saved.openUrl, 'https://www.firecrawl.dev/app/alexandria/skills/weekly-digest');
  assert.equal(saved.message, 'Open it in Firecrawl: https://www.firecrawl.dev/app/alexandria/skills/weekly-digest');
  assert.equal(updated.message, saved.message);
  assert.equal(saved.openUrl.includes('/skills/s/'), false);
  assert.deepEqual(saved.nextTool, { name: 'firecrawl_read_skill', arguments: { id: 'team:weekly-digest' } });
});

test('write tools refuse bad arguments before calling Exchange', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const { tools } = await client.request('tools/list', {});
  const update = tools.find(tool => tool.name === 'firecrawl_update_skill');
  const create = tools.find(tool => tool.name === 'firecrawl_create_skill');
  // The advertised schema, not only runtime validation, requires a change.
  // id and baseVersion alone match none of these required-sets.
  assert.deepEqual(update.inputSchema.anyOf.map(branch => branch.required), [
    ['id', 'baseVersion', 'name'],
    ['id', 'baseVersion', 'description'],
    ['id', 'baseVersion', 'body'],
    ['id', 'baseVersion', 'enabled'],
    ['id', 'baseVersion', 'discoverable'],
  ]);
  assert.deepEqual(create.inputSchema.required, undefined);
  assert.deepEqual(create.inputSchema.anyOf.map(branch => branch.required), [
    ['from'],
    ['name', 'description', 'body'],
  ]);
  const before = api.requests.length;
  await callExpectingError(client, { name: 'firecrawl_update_skill', arguments: { id: 'team:weekly-digest', name: 'x' } });
  await callExpectingError(client, { name: 'firecrawl_update_skill', arguments: { id: 'team:weekly-digest', baseVersion: 1, delete: true } });
  await callExpectingError(client, { name: 'firecrawl_create_skill', arguments: { from: 'deep-research', extra: 1 } });
  await callExpectingError(client, { name: 'firecrawl_create_skill', arguments: {} });
  await callExpectingError(client, { name: 'firecrawl_create_skill', arguments: { name: 'Digest', description: 'Summarise.' } });
  await callExpectingError(client, { name: 'firecrawl_create_skill', arguments: { from: 'deep-research', slug: 'Our Research' } });
  await callExpectingError(client, { name: 'firecrawl_create_skill', arguments: { from: 'deep-research', sharing: 'public' } });
  await callExpectingError(client, { name: 'firecrawl_create_skill', arguments: { from: 'deep-research', shared: true } });
  await callExpectingError(client, { name: 'firecrawl_update_skill', arguments: { id: 'team:weekly-digest', baseVersion: 1, sharing: 'team' } });
  await callExpectingError(client, { name: 'firecrawl_update_skill', arguments: { id: 'team:weekly-digest', baseVersion: 1, shared: false } });
  await callExpectingError(client, { name: 'firecrawl_update_skill', arguments: { id: 'team:weekly-digest', baseVersion: 1 } });
  await callExpectingError(client, { name: 'firecrawl_update_skill', arguments: { id: 'deep-research', baseVersion: 1, name: 'x' } });
  await callExpectingError(client, { name: 'firecrawl_read_skill', arguments: { id: 'deep-research', provider: 'acme', plugin: 'research', skill: 'brief' } });
  await callExpectingError(client, { name: 'firecrawl_read_skill', arguments: { provider: '..', plugin: 'research', skill: 'brief' } });
  await callExpectingError(client, { name: 'firecrawl_read_skill', arguments: { provider: 'acme', plugin: '.', skill: 'brief' } });
  assert.equal(api.requests.length, before);
});

test('find_skills lists one provider and read_skill reads that skill', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const { tools } = await client.request('tools/list', {});
  assert.equal(tools.filter(tool => /skill/.test(tool.name)).map(tool => tool.name).sort().join(','), 'firecrawl_create_skill,firecrawl_find_skills,firecrawl_read_skill,firecrawl_update_skill');
  const listed = toolText(await client.request('tools/call', { name: 'firecrawl_find_skills', arguments: { provider: 'acme', limit: 5 } }));
  assert.equal(api.requests.at(-1).method, 'GET');
  const firstPage = new URL(api.requests.at(-1).url, 'http://127.0.0.1');
  assert.equal(firstPage.pathname, '/exchange/provider-skills');
  assert.equal(firstPage.searchParams.get('provider'), 'acme');
  assert.equal(firstPage.searchParams.get('page'), '1');
  assert.equal(firstPage.searchParams.get('q'), null);
  assert.equal(api.requests.filter(request => request.url.startsWith('/exchange/provider-skills')).length, 1);
  assert.equal(listed.total, 21);
  assert.equal(listed.skills.length, 5);
  assert.equal(listed.skills[0].skill, undefined);
  assert.deepEqual(listed.skills[0].provider, { slug: 'acme', name: 'Acme' });
  assert.deepEqual(listed.skills[0].plugin, { id: 'research', displayName: 'Research' });
  assert.equal(listed.skills[0].visibility, 'execution-only');
  assert.deepEqual(listed.skills[0].nextTool, { name: 'firecrawl_read_skill', arguments: { provider: 'acme', plugin: 'research', skill: 'brief' } });
  const readResult = await client.request('tools/call', { name: 'firecrawl_read_skill', arguments: { provider: 'acme', plugin: 'research', skill: 'brief' } });
  const read = toolText(readResult);
  assert.equal(api.requests.at(-1).url, '/exchange/provider-skills/acme/research/brief');
  assert.equal(read.content, '# Brief');
  assert.equal(read.skill, 'brief');
  assert.deepEqual(read.providerDetail, { slug: 'acme', name: 'Acme' });
  assert.deepEqual(read.pluginDetail, { id: 'research', displayName: 'research' });
  assert.equal(readResult.structuredContent.content, '# Brief');
  assert.equal(readResult.structuredContent.provider, 'acme');
  assert.equal(readResult.structuredContent.plugin, 'research');
  assert.equal(readResult.structuredContent.skill, 'brief');
  const file = toolText(await client.request('tools/call', { name: 'firecrawl_read_skill', arguments: { provider: 'acme', plugin: 'research', skill: 'brief', file: true } }));
  assert.equal(api.requests.at(-1).url, '/exchange/provider-skills/acme/research/brief/file');
  assert.equal(file.content, '# Brief file');
  const filtered = toolText(await client.request('tools/call', { name: 'firecrawl_find_skills', arguments: { provider: 'fiber', query: 'people' } }));
  const filteredUrl = new URL(api.requests.at(-1).url, 'http://127.0.0.1');
  assert.equal(filteredUrl.searchParams.get('provider'), 'fiber');
  assert.equal(filteredUrl.searchParams.get('q'), 'people');
  assert.equal(filtered.skills.length, 1);
  assert.equal(filtered.skills[0].id, 'provider:fiber/people/search');
  assert.deepEqual(filtered.skills[0].nextTool, { name: 'firecrawl_read_skill', arguments: { provider: 'fiber', plugin: 'people', skill: 'search' } });
  const paged = toolText(await client.request('tools/call', { name: 'firecrawl_find_skills', arguments: { provider: 'acme', limit: 50 } }));
  const providerGets = api.requests.filter(request => request.method === 'GET' && request.url.startsWith('/exchange/provider-skills?'));
  const pages = providerGets.slice(-2).map(request => new URL(request.url, 'http://127.0.0.1').searchParams.get('page'));
  assert.deepEqual(pages, ['1', '2']);
  assert.equal(paged.skills.length, 21);
  assert.equal(paged.skills.at(-1).id, 'provider:acme/research/later');
  const pagedThrough = toolText(await client.request('tools/call', { name: 'firecrawl_find_skills', arguments: { provider: 'acme', query: 'page-through', limit: 50 } }));
  const throughPages = api.requests.filter(request => request.method === 'GET' && request.url.includes('q=page-through')).map(request => new URL(request.url, 'http://127.0.0.1').searchParams.get('page'));
  assert.deepEqual(throughPages, ['1', '2']);
  assert.equal(pagedThrough.skills.some(skill => skill.id === 'provider:other/research/decoy'), false);
  assert.equal(pagedThrough.skills.at(-1).id, 'provider:acme/research/later');
  assert.deepEqual(paged.skills.at(-1).nextTool.arguments, { provider: 'acme', plugin: 'research', skill: 'later' });
});
