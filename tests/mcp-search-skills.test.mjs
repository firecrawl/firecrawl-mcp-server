import assert from 'node:assert/strict';
import test from 'node:test';
import { LEGACY_SURFACE, startStdioWithApi, toolText } from './helpers/exchange-mcp.mjs';

const QUERY = 'next FOMC meeting rate odds fedwatch';
const call = (client, name, args) => client.request('tools/call', { name, arguments: args });
const search = (client, args = { query: QUERY }) => call(client, 'firecrawl_search', args);
const lookups = (api) => api.requests.filter((request) => request.body?.alexandria?.capability === 'find-skills');
const found = (skills) => ({ findSkills: { provider: 'firecrawl', capability: 'find-skills', creditsCost: 0, data: { skills, total: skills.length } } });
const library_ = (id, similarity) => ({ id, name: id, description: `About ${id}.`, files: ['SKILL.md'], source: 'library', similarity });
// Exchange matches a team skill on every word of the query and gives it no similarity.
const teamSkill = (slug, name) => ({ id: `team:${slug}`, name, description: `Our ${name.toLowerCase()} steps.`, files: ['SKILL.md'], source: 'team', version: 1 });
const FITS = { id: 'fomc-odds-cross-check', name: 'FOMC odds cross-check', description: 'Compare market-implied rate odds with the Fed statement.', files: ['SKILL.md'], source: 'library', similarity: 0.61 };
const reads = (path) => ({ name: 'alexandria_library_search', arguments: { command: `cat /library/skills/${path}/SKILL.md` } });
const paths = (result) => toolText(result).data.skills.matches.map((match) => match.nextTool.arguments.command);

test('a search lists the skills that fit its query first, each with the call that reads it', async (t) => {
  const { api, client } = await startStdioWithApi(t, found([FITS, library_('weekly-digest', 0.3)]));
  const body = toolText(await search(client, { query: QUERY, objective: 'Preview the next Fed meeting for a client note' }));
  assert.equal(Object.keys(body.data)[0], 'skills');
  assert.match(body.data.skills.instruction, /^Written instructions that fit this search\. Read the best match before going further/);
  assert.deepEqual(body.data.skills.matches, [
    { name: FITS.name, description: FITS.description, nextTool: reads('firecrawl/fomc-odds-cross-check') },
  ]);
  assert.ok(Object.keys(body.data).length > 1, 'the search results stay beside the skills');
  // The lookup carries the query and nothing else from the call.
  assert.deepEqual(lookups(api).map((request) => request.body.alexandria.options), [{ query: QUERY, related: true }]);
  assert.doesNotMatch(JSON.stringify(lookups(api)[0].body), /client note/);
});

test('a skill needs a closer fit under a search than under a library command', async (t) => {
  const { client } = await startStdioWithApi(t, found([library_('rate-odds-near', 0.43)]));
  assert.equal(toolText(await search(client)).data.skills, undefined);
  const command = await call(client, 'alexandria_library_search', { command: 'grep -ril "fedwatch rate odds" /library' });
  assert.match(command.content[0].text, /cat \/library\/skills\/firecrawl\/rate-odds-near\/SKILL\.md/);
});

test('three skills at most: the team\'s first, then the library skills that clear the bar', async (t) => {
  const libraries = [library_('rate-odds-a', 0.7), library_('rate-odds-b', 0.6), library_('rate-odds-c', 0.5), library_('rate-odds-d', 0.46)];
  const mixed = await startStdioWithApi(t, found([...libraries, teamSkill('fed-odds-brief', 'Fed odds brief')]));
  assert.deepEqual(paths(await search(mixed.client)), [
    'cat /library/skills/team/fed-odds-brief/SKILL.md',
    'cat /library/skills/firecrawl/rate-odds-a/SKILL.md',
    'cat /library/skills/firecrawl/rate-odds-b/SKILL.md',
  ]);
  const plain = await startStdioWithApi(t, found(libraries));
  assert.deepEqual(paths(await search(plain.client)), [
    'cat /library/skills/firecrawl/rate-odds-a/SKILL.md',
    'cat /library/skills/firecrawl/rate-odds-b/SKILL.md',
    'cat /library/skills/firecrawl/rate-odds-c/SKILL.md',
  ]);
});

test('the search answers without the skills when the lookup is slow, fails, is refused or finds nothing', async (t) => {
  const slow = await startStdioWithApi(t, { ...found([FITS]), findSkillsDelayMs: 3000 });
  const started = performance.now();
  const late = toolText(await search(slow.client));
  assert.ok(performance.now() - started < 2000, `took ${Math.round(performance.now() - started)} ms`);
  assert.equal(late.success, true);
  assert.equal(late.data.skills, undefined);
  assert.equal(lookups(slow.api).length, 1);

  for (const options of [
    { findSkills: 'fail' },
    { findSkills: { provider: 'firecrawl', capability: 'find-skills', error: { code: 'invalid_option', message: 'find-skills does not take related.' } } },
    found([]),
    found([library_('weekly-digest', 0.3)]),
  ]) {
    const { client } = await startStdioWithApi(t, options);
    const body = toolText(await search(client));
    assert.equal(body.success, true, JSON.stringify(options));
    assert.equal(body.data.skills, undefined, JSON.stringify(options));
  }
});

test('no lookup for a short query, a server without library skills, or a surface without the library tool', async (t) => {
  const short = await startStdioWithApi(t, found([FITS]));
  assert.equal(toolText(await search(short.client, { query: 'fed cpi' })).data.skills, undefined);
  assert.equal(lookups(short.api).length, 0);

  const off = await startStdioWithApi(t, { ...found([FITS]), env: { FIRECRAWL_MCP_LIBRARY_SKILLS: 'false' } });
  assert.equal(toolText(await search(off.client)).data.skills, undefined);
  assert.equal(lookups(off.api).length, 0);

  const legacy = await startStdioWithApi(t, { ...found([FITS]), ...LEGACY_SURFACE });
  assert.equal(toolText(await search(legacy.client)).data.skills, undefined);
  assert.equal(lookups(legacy.api).length, 0);
});
