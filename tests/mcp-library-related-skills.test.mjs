import assert from 'node:assert/strict';
import test from 'node:test';
import { callExpectingError, startStdio, startStdioWithApi, toolText } from './helpers/exchange-mcp.mjs';

const call = (client, name, args) => client.request('tools/call', { name, arguments: args });
const library = (client, command) => call(client, 'alexandria_library_search', { command });
const lookups = (api) => api.requests.filter((request) => request.body?.alexandria?.capability === 'find-skills');
const found = (skills) => ({ findSkills: { provider: 'firecrawl', capability: 'find-skills', creditsCost: 0, data: { skills, total: skills.length } } });
const FITS = { id: 'fomc-odds-cross-check', name: 'FOMC odds cross-check', description: 'Compare market-implied rate odds with the Fed statement.', files: ['SKILL.md'], source: 'library', similarity: 0.61 };
const LOOSE = { id: 'weekly-digest', name: 'Weekly digest', description: 'Summarise the week.', files: ['SKILL.md'], source: 'library', similarity: 0.3 };
const OUTPUT = '/library/finance/fred/series/observations.md';

test('a library command lists the skills that fit its words under its output', async (t) => {
  const { api, client } = await startStdioWithApi(t, found([FITS, LOOSE]));
  const result = await library(client, 'grep -ril "fedwatch rate odds" /library | head -20');
  assert.notEqual(result.isError, true, JSON.stringify(result));
  const text = result.content[0].text;
  assert.ok(text.startsWith(`${OUTPUT}\n\n[skills] `), text);
  assert.match(text, /- FOMC odds cross-check: Compare market-implied rate odds with the Fed statement\. Read it: cat \/skills\/library\/fomc-odds-cross-check\/SKILL\.md/);
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

test('no lookup for a command under /skills or one with too few search words', async (t) => {
  const { api, client } = await startStdioWithApi(t, found([FITS]));
  for (const command of ['cat /skills/search/fed-rate-odds', 'grep -i fed /skills/INDEX', 'ls /library', 'cat /library/README.md', 'grep -ril "cpi" /library']) {
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

test('firecrawl_skills is always loaded and read-only, and lists first the instruction to check skills', async (t) => {
  const { client, init } = await startStdioWithApi(t);
  const { tools } = await client.request('tools/list', {});
  const skills = tools.find((tool) => tool.name === 'firecrawl_skills');
  assert.deepEqual(skills._meta, { 'anthropic/alwaysLoad': true });
  assert.deepEqual(skills.annotations, { title: 'Skills', readOnlyHint: true, openWorldHint: false, destructiveHint: false, idempotentHint: true });
  assert.match(skills.description, /^Check first for any business workflow/);
  assert.match(tools.find((tool) => tool.name === 'alexandria_library_search').description, /^Check \/skills first for any business workflow/);
  assert.match(init.instructions, /Check \/skills in alexandria_library_search first for any business workflow/);
});

test('firecrawl_skills finds skills with query and reads one with id', async (t) => {
  const { api, client } = await startStdioWithApi(t);
  const listed = toolText(await call(client, 'firecrawl_skills', { query: 'weekly summary' }));
  assert.deepEqual(api.requests.at(-1).body.alexandria, { provider: 'firecrawl', capability: 'find-skills', options: { query: 'weekly summary' } });
  assert.deepEqual(listed.data.alexandria[0].data.skills.map((skill) => skill.nextTool), [
    { name: 'firecrawl_skills', arguments: { id: 'team:weekly-digest' } },
    { name: 'firecrawl_skills', arguments: { id: 'deep-research' } },
  ]);
  const read = toolText(await call(client, 'firecrawl_skills', { id: 'deep-research', path: 'references/sources.md' }));
  assert.deepEqual(api.requests.at(-1).body.alexandria, { provider: 'firecrawl', capability: 'read-skill', options: { id: 'deep-research', path: 'references/sources.md' } });
  assert.equal(read.data.alexandria[0].data.path, 'references/sources.md');
  const before = api.requests.length;
  for (const args of [{ query: 'a', id: 'deep-research' }, { path: 'SKILL.md' }, { version: 2 }, { id: 'deep-research', limit: 3 }, { extra: 1 }])
    await callExpectingError(client, { name: 'firecrawl_skills', arguments: args });
  assert.equal(api.requests.length, before);
});

test('keyless sessions do not list firecrawl_skills', async (t) => {
  const { client } = await startStdio(t, { CLOUD_SERVICE: 'false', FIRECRAWL_API_KEY: '', FIRECRAWL_API_URL: '' });
  const { tools } = await client.request('tools/list', {});
  assert(!tools.some((tool) => tool.name === 'firecrawl_skills'));
});
