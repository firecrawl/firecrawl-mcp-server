import assert from 'node:assert/strict';
import test from 'node:test';
import { callExpectingError, startStdio, startStdioWithApi, toolText } from './helpers/exchange-mcp.mjs';
import { CLAUDE_CODE_TEXT_CAP } from './helpers/description-budget.mjs';
import { fetchTeamSkills, teamSkillsListing } from '../dist/skills-preload.js';

const data = result => toolText(result).data.alexandria[0].data;
const READ = id => ({ name: 'firecrawl_skills', arguments: { id } });

test('skills are one read-only tool and one write tool', async (t) => {
  const { client } = await startStdioWithApi(t);
  const { tools } = await client.request('tools/list', {});
  for (const name of ['firecrawl_find_skills', 'firecrawl_read_skill', 'firecrawl_create_skill', 'firecrawl_update_skill']) assert(!tools.some(tool => tool.name === name), name);
  const skills = tools.find(tool => tool.name === 'firecrawl_skills');
  assert.deepEqual(skills.annotations, { title: 'Skills', readOnlyHint: true, openWorldHint: false, destructiveHint: false, idempotentHint: true });
  // What the tool is for, and when to reach for it, leads the description.
  assert.match(skills.description, /^Check first for any business workflow/);
  assert.ok(skills.description.length <= CLAUDE_CODE_TEXT_CAP, `firecrawl_skills description is ${skills.description.length} chars`);
  const save = tools.find(tool => tool.name === 'firecrawl_save_skill');
  assert.deepEqual(save.annotations, { title: 'Save Skill', readOnlyHint: false, openWorldHint: false, destructiveHint: true, idempotentHint: false });
});

test('firecrawl_skills with query finds skills and links each to reading it', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const page = data(await client.request('tools/call', { name: 'firecrawl_skills', arguments: { query: 'digest', limit: 5 } }));
  assert.deepEqual(api.requests.at(-1).body.alexandria, { provider: 'firecrawl', capability: 'find-skills', options: { query: 'digest', limit: 5 } });
  assert.equal(page.total, 2);
  assert.equal(page.skills[0].source, 'team');
  assert.equal(page.skills[0].createTool, undefined);
  assert.deepEqual(page.skills[1].createTool, { name: 'firecrawl_save_skill', arguments: { from: 'deep-research' } });
  assert.deepEqual(page.skills.map(skill => skill.nextTool), [READ('team:weekly-digest'), READ('deep-research')]);
});

test('firecrawl_skills with neither query nor id lists every skill', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  await client.request('tools/call', { name: 'firecrawl_skills', arguments: {} });
  assert.deepEqual(api.requests.at(-1).body.alexandria, { provider: 'firecrawl', capability: 'find-skills', options: {} });
});

test('firecrawl_skills with id reads one skill file', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const skill = data(await client.request('tools/call', { name: 'firecrawl_skills', arguments: { id: 'deep-research', path: 'references/sources.md' } }));
  assert.deepEqual(api.requests.at(-1).body.alexandria, { provider: 'firecrawl', capability: 'read-skill', options: { id: 'deep-research', path: 'references/sources.md' } });
  assert.equal(skill.path, 'references/sources.md');
  assert.equal(skill.content, '# Deep research');
});

test('firecrawl_skills reads a team skill with its tools, current or pinned', async (t) => {
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

test('firecrawl_skills refuses mixed or unknown arguments before calling Exchange', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const before = api.requests.length;
  for (const arguments_ of [
    { query: 'digest', id: 'deep-research' },
    { path: 'SKILL.md' },
    { query: 'digest', version: 1 },
    { id: 'deep-research', limit: 5 },
    { limit: 51 },
    { extra: true },
    { id: 'team:weekly-digest', version: 0 },
  ]) await callExpectingError(client, { name: 'firecrawl_skills', arguments: arguments_ });
  assert.equal(api.requests.length, before);
});

test('keyless sessions do not list the skill tools', async (t) => {
  const { client } = await startStdio(t, { CLOUD_SERVICE: 'false', FIRECRAWL_API_KEY: '', FIRECRAWL_API_URL: '' });
  const { tools } = await client.request('tools/list', {});
  for (const name of ['firecrawl_skills', 'firecrawl_save_skill']) assert(!tools.some(tool => tool.name === name), name);
});

test('firecrawl_save_skill without id creates or copies a skill and links to reading it', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const call = arguments_ => client.request('tools/call', { name: 'firecrawl_save_skill', arguments: arguments_ });
  const copied = data(await call({ from: 'deep-research', slug: 'our-research' }));
  assert.deepEqual(api.requests.at(-1).body.alexandria, { provider: 'firecrawl', capability: 'create-skill', options: { from: 'deep-research', slug: 'our-research' } });
  assert.equal(copied.id, 'team:our-research');
  assert.deepEqual(copied.nextTool, READ('team:our-research'));
  await call({ name: 'Digest', description: 'Summarise.', body: 'Run @fred/series/observations.' });
  assert.deepEqual(api.requests.at(-1).body.alexandria, { provider: 'firecrawl', capability: 'create-skill', options: { name: 'Digest', description: 'Summarise.', body: 'Run @fred/series/observations.' } });
});

test('firecrawl_save_skill with id updates the skill from its baseVersion', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const saved = data(await client.request('tools/call', { name: 'firecrawl_save_skill', arguments: { id: 'team:weekly-digest', baseVersion: 2, enabled: false } }));
  assert.deepEqual(api.requests.at(-1).body.alexandria, { provider: 'firecrawl', capability: 'update-skill', options: { id: 'team:weekly-digest', baseVersion: 2, enabled: false } });
  assert.equal(saved.skill.version, 3);
  assert.deepEqual(saved.nextTool, READ('team:weekly-digest'));
});

test('firecrawl_save_skill refuses invalid combinations before calling Exchange', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const before = api.requests.length;
  for (const arguments_ of [
    {},
    { name: 'Digest', description: 'Summarise.' },
    { name: 'Digest', description: 'Summarise.', body: ' \n\t ' },
    { from: 'deep-research', extra: 1 },
    { from: 'deep-research', slug: 'Our Research' },
    { from: 'deep-research', baseVersion: 1 },
    { name: 'Digest', description: 'Summarise.', body: 'Run it.', enabled: false },
    { id: 'team:weekly-digest', name: 'x' },
    { id: 'team:weekly-digest', baseVersion: 1 },
    { id: 'team:weekly-digest', baseVersion: 1, from: 'deep-research' },
    { id: 'team:weekly-digest', baseVersion: 1, name: 'x', slug: 'other' },
    { id: 'team:weekly-digest', baseVersion: 1, delete: true },
    { id: 'deep-research', baseVersion: 1, name: 'x' },
  ]) await callExpectingError(client, { name: 'firecrawl_save_skill', arguments: arguments_ });
  assert.equal(api.requests.length, before);
});

const skillsTool = async client => (await client.request('tools/list', {})).tools.find(tool => tool.name === 'firecrawl_skills');

test('a local server names the team\'s skills in the firecrawl_skills description, not the instructions', async (t) => {
  const { api, client, init } = await startStdioWithApi(t, { env: { FIRECRAWL_SKILLS_PRELOAD: '' } });
  assert.deepEqual(api.requests[0].body.alexandria, { provider: 'firecrawl', capability: 'find-skills', options: { limit: 50 } });
  const { description } = await skillsTool(client);
  assert.match(description, /\nThe user's team's skills \(read one with firecrawl_skills \{id\}\):\n- team:weekly-digest: Weekly digest\. Summarise the week\.$/);
  // Library skills stay behind a query; only the team's are named.
  assert.doesNotMatch(description, /- deep-research:/);
  assert.ok(description.length <= CLAUDE_CODE_TEXT_CAP, `${description.length} chars`);
  // The instructions keep their routing copy inside the window Claude Code keeps.
  assert.doesNotMatch(init.instructions, /team:weekly-digest/);
});

test('FIRECRAWL_SKILLS_PRELOAD=0 names no skills and calls nothing at startup', async (t) => {
  const { api, client } = await startStdioWithApi(t, { env: { FIRECRAWL_SKILLS_PRELOAD: '0' } });
  assert.equal(api.requests.length, 0);
  assert.doesNotMatch((await skillsTool(client)).description, /team's skills \(read one/);
});

test('the listing names team skills only and stops at its budget', () => {
  const many = Array.from({ length: 40 }, (_, index) => ({ id: `team:skill-${index}`, name: `Skill ${index}`, description: 'x'.repeat(300), source: 'team' }));
  const listing = teamSkillsListing([{ id: 'deep-research', name: 'Deep research', source: 'library' }, ...many], 700);
  assert.ok(listing.length <= 700, `${listing.length} chars`);
  assert.doesNotMatch(listing, /deep-research/);
  assert.match(listing, /\n- team:skill-0: Skill 0\. x{200}\n/);
  assert.equal(teamSkillsListing([{ id: 'deep-research', source: 'library' }], 700), '');
  assert.equal(teamSkillsListing(many, 20), '');
});

test('the startup skills fetch reads a blank API URL as the cloud and tags the integration', async () => {
  const requests = [];
  const fetch = async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ data: { alexandria: [{ data: { skills: [{ id: 'team:weekly-digest', source: 'team' }, { id: 'deep-research', source: 'library' }] } }] } }));
  };
  const skills = await fetchTeamSkills({ apiKey: 'fc-test', apiUrl: '  ', integration: ' my-editor ', fetch });
  assert.deepEqual(skills.map(skill => skill.id), ['team:weekly-digest']);
  assert.equal(requests[0].url, 'https://api.firecrawl.dev/v2/scrape');
  assert.equal(requests[0].body.integration, 'my-editor');
  await fetchTeamSkills({ apiKey: 'fc-test', apiUrl: 'http://localhost:3002/', fetch });
  assert.equal(requests[1].url, 'http://localhost:3002/v2/scrape');
  assert.equal(requests[1].body.integration, undefined);
});
