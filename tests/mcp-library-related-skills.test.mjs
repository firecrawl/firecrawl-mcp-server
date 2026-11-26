import assert from 'node:assert/strict';
import test from 'node:test';
import { callExpectingError, startStdioWithApi } from './helpers/exchange-mcp.mjs';

const call = (client, name, args) => client.request('tools/call', { name, arguments: args });
const library = (client, command) => call(client, 'alexandria_library_search', { command });
const lookups = (api) => api.requests.filter((request) => request.body?.alexandria?.capability === 'find-skills');
const found = (skills) => ({ findSkills: { provider: 'firecrawl', capability: 'find-skills', creditsCost: 0, data: { skills, total: skills.length } } });
const FITS = { id: 'fomc-odds-cross-check', name: 'FOMC odds cross-check', description: 'Compare market-implied rate odds with the Fed statement.', files: ['SKILL.md'], source: 'library', similarity: 0.61 };
const LOOSE = { id: 'weekly-digest', name: 'Weekly digest', description: 'Summarise the week.', files: ['SKILL.md'], source: 'library', similarity: 0.3 };
const OUTPUT = '/library/finance/fred/series/observations.md';
// Exchange matches a team skill on every word of the query and gives it no similarity.
const teamSkill = (slug, name) => ({ id: `team:${slug}`, name, description: `Our ${name.toLowerCase()} steps.`, files: ['SKILL.md'], source: 'team', version: 1 });
const library_ = (id, similarity) => ({ id, name: id, description: `About ${id}.`, files: ['SKILL.md'], source: 'library', similarity });
const listed = (text) => text.split('\n').filter((line) => line.startsWith('- ')).map((line) => line.match(/cat (\S+)$/)[1]);

test('a library command lists the skills that fit its words under its output', async (t) => {
  const { api, client } = await startStdioWithApi(t, found([FITS, LOOSE]));
  const result = await library(client, 'grep -ril "fedwatch rate odds" /library | head -20');
  assert.notEqual(result.isError, true, JSON.stringify(result));
  const text = result.content[0].text;
  assert.ok(text.startsWith(`${OUTPUT}\n\n[skills] `), text);
  assert.match(text, /- FOMC odds cross-check: Compare market-implied rate odds with the Fed statement\. Read it: cat \/library\/skills\/firecrawl\/fomc-odds-cross-check\/SKILL\.md/);
  assert.doesNotMatch(text, /Weekly digest/);
  assert.equal(result.structuredContent.stdout, `${OUTPUT}\n`);
  assert.match(result.structuredContent.message, /^\[skills\] /);
  // The lookup is asked with the command's search words only, and says it is a related lookup.
  assert.deepEqual(lookups(api).map((request) => request.body.alexandria), [
    { provider: 'firecrawl', capability: 'find-skills', options: { query: 'fedwatch rate odds', related: true } },
  ]);
  const commands = api.requests.filter((request) => request.body?.alexandria?.capability === 'library');
  assert.deepEqual(commands.map((request) => request.body.alexandria.options), [{ command: 'grep -ril "fedwatch rate odds" /library | head -20' }]);
});

test('a team skill Exchange matched without a similarity is listed first; library skills under the bar are not', async (t) => {
  const { client } = await startStdioWithApi(t, found([FITS, teamSkill('fed-odds-brief', 'Fed odds brief'), LOOSE]));
  const result = await library(client, 'grep -ril "fedwatch rate odds" /library | head -20');
  assert.notEqual(result.isError, true, JSON.stringify(result));
  assert.deepEqual(listed(result.content[0].text), [
    '/library/skills/team/fed-odds-brief/SKILL.md',
    '/library/skills/firecrawl/fomc-odds-cross-check/SKILL.md',
  ]);
  assert.match(result.content[0].text, /- Fed odds brief: Our fed odds brief steps\. Read it: cat /);
});

test('the block lists three skills at most: team skills first, then the library skills that clear the bar', async (t) => {
  const team = (n) => teamSkill(`fed-odds-${n}`, `Fed odds ${n}`);
  const libraries = [library_('rate-odds-a', 0.7), library_('rate-odds-b', 0.6), library_('rate-odds-c', 0.5)];
  const two = await startStdioWithApi(t, found([team('one'), team('two'), ...libraries]));
  assert.deepEqual(listed((await library(two.client, 'grep -ril "fedwatch rate odds" /library')).content[0].text), [
    '/library/skills/team/fed-odds-one/SKILL.md',
    '/library/skills/team/fed-odds-two/SKILL.md',
    '/library/skills/firecrawl/rate-odds-a/SKILL.md',
  ]);
  const four = await startStdioWithApi(t, found([...libraries, team('one'), team('two'), team('three'), team('four')]));
  assert.deepEqual(listed((await library(four.client, 'grep -ril "fedwatch rate odds" /library')).content[0].text), [
    '/library/skills/team/fed-odds-one/SKILL.md',
    '/library/skills/team/fed-odds-two/SKILL.md',
    '/library/skills/team/fed-odds-three/SKILL.md',
  ]);
});

test('without team skills the three best library skills fill the block', async (t) => {
  const { client } = await startStdioWithApi(t, found([library_('rate-odds-a', 0.7), library_('rate-odds-b', 0.6), library_('rate-odds-c', 0.5), library_('rate-odds-d', 0.45)]));
  assert.deepEqual(listed((await library(client, 'grep -ril "fedwatch rate odds" /library')).content[0].text), [
    '/library/skills/firecrawl/rate-odds-a/SKILL.md',
    '/library/skills/firecrawl/rate-odds-b/SKILL.md',
    '/library/skills/firecrawl/rate-odds-c/SKILL.md',
  ]);
});

test('no lookup for a command under the skills folder or one with too few search words', async (t) => {
  const { api, client } = await startStdioWithApi(t, found([FITS]));
  for (const command of ['cat /library/skills/search/fed-rate-odds', 'grep -i fed /library/skills/INDEX', 'cat /library/skills/firecrawl/fomc-odds-cross-check/SKILL.md', 'ls /library', 'cat /library/README.md', 'grep -ril "cpi" /library']) {
    const result = await library(client, command);
    assert.equal(result.content[0].text, OUTPUT, command);
    assert.equal(result.structuredContent.message, undefined, command);
  }
  assert.equal(lookups(api).length, 0);
});

test('the command answers without the block when the lookup is slow, fails, is refused or finds nothing', async (t) => {
  const command = 'grep -ril "fedwatch rate odds" /library';
  const slow = await startStdioWithApi(t, { ...found([FITS]), findSkillsDelayMs: 3000 });
  const started = performance.now();
  const late = await library(slow.client, command);
  assert.ok(performance.now() - started < 2000, `took ${Math.round(performance.now() - started)} ms`);
  assert.equal(late.content[0].text, OUTPUT);
  assert.equal(lookups(slow.api).length, 1);

  for (const options of [
    { findSkills: 'fail' },
    { findSkills: { provider: 'firecrawl', capability: 'find-skills', error: { code: 'invalid_option', message: 'find-skills does not take related.' } } },
    found([]),
    found([LOOSE]),
  ]) {
    const { client } = await startStdioWithApi(t, options);
    const result = await library(client, command);
    assert.notEqual(result.isError, true, JSON.stringify(options));
    assert.equal(result.content[0].text, OUTPUT, JSON.stringify(options));
    assert.equal(result.structuredContent.message, undefined);
  }
});

test('a failed library command still fails at once, whatever the lookup does', async (t) => {
  const { client } = await startStdioWithApi(t, {
    ...found([FITS]),
    findSkillsDelayMs: 3000,
    library: { provider: 'firecrawl', capability: 'library', error: { code: 'library_command_timeout', message: 'The command ran past its deadline.' } },
  });
  const started = performance.now();
  const failed = await callExpectingError(client, { name: 'alexandria_library_search', arguments: { command: 'grep -ril "fedwatch rate odds" /library' } });
  assert.ok(performance.now() - started < 2000);
  assert.match(failed.content[0].text, /ran past its deadline/);
});

test('alexandria_library_search is always loaded and opens with the data source first and skills second; no separate skills read tool is listed', async (t) => {
  const { client, init } = await startStdioWithApi(t);
  const { tools } = await client.request('tools/list', {});
  const library = tools.find((tool) => tool.name === 'alexandria_library_search');
  assert.equal(library._meta?.['anthropic/alwaysLoad'], true);
  assert.match(library.description, /^Find the data source for the task first: [^.]*\. For a specific workflow a skill may cover \([^)]*\), `cat \/library\/skills\/search\/<words>` /);
  assert.doesNotMatch(library.description, /Check \/library\/skills first/);
  assert.match(init.instructions, /Find a task's data source through alexandria_library_search first; when a specific step-by-step workflow \([^)]*\) may have a skill, search \/library\/skills there with two or three distinctive words\. /);
  assert.doesNotMatch(init.instructions, /Check \/library\/skills through alexandria_library_search first/);
  assert(!tools.some((tool) => tool.name === 'firecrawl_skills'));
});

test('FIRECRAWL_MCP_LIBRARY_SKILLS=false serves the library without skills', async (t) => {
  const { api, client, init } = await startStdioWithApi(t, { ...found([FITS]), env: { FIRECRAWL_MCP_LIBRARY_SKILLS: 'false' } });
  const { tools } = await client.request('tools/list', {});
  const search = tools.find((tool) => tool.name === 'alexandria_library_search');
  assert.equal(search._meta?.['anthropic/alwaysLoad'], true);
  assert.match(search.description, /^Explore the Alexandria library: /);
  assert.doesNotMatch(search.description, /\/library\/skills/);
  assert.doesNotMatch(init.instructions, /\/library\/skills|firecrawl_save_skill/);
  assert(!tools.some((tool) => tool.name === 'firecrawl_save_skill'));

  const command = 'grep -ril "fedwatch rate odds" /library | head -20';
  const result = await library(client, command);
  assert.equal(result.content[0].text, OUTPUT);
  assert.equal(result.structuredContent.message, undefined);
  assert.equal(lookups(api).length, 0);
  const commands = api.requests.filter((request) => request.body?.alexandria?.capability === 'library');
  assert.deepEqual(commands.map((request) => request.body.alexandria.options), [{ command, skills: false }]);

  await call(client, 'alexandria_library_read', { calls: [{ provider: 'firecrawl', capability: 'library', options: { command: 'cat /library/README.md' } }] });
  const read = api.requests.filter((request) => JSON.stringify(request.body?.alexandria ?? '').includes('cat /library/README.md'));
  assert.equal(read.length, 1);
  assert.deepEqual([read[0].body.alexandria].flat().map((entry) => entry.options), [{ command: 'cat /library/README.md', skills: false }]);
});
