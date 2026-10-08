import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { pluginSource, prepareOpenAIPlugin } from '../scripts/prepare-openai-plugin.mjs';

const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const files = async (path, prefix = '') => (await Promise.all(
  (await readdir(path, { withFileTypes: true })).map(async (entry) => {
    const name = prefix + entry.name;
    assert(!entry.isSymbolicLink(), 'Submission files must be self-contained');
    return entry.isDirectory() ? files(join(path, entry.name), name + '/') : [name];
  })
)).flat().sort();

test('production submission preserves Firecrawl metadata and every skill/reference', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'firecrawl-submission-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const destination = await prepareOpenAIPlugin(join(root, 'nested', 'output', 'plugin'));
  const source = await json(join(pluginSource, '.codex-plugin/plugin.json'));
  const portable = await json(join(destination, 'plugin.json'));
  const overlay = await json(join(destination, '.codex-plugin/plugin.json'));
  assert.equal(portable.name, 'app-6a314a73f8ac819195b0d55e36b9c609');
  assert.equal(portable.version, source.version);
  assert.equal(portable.description, source.description);
  assert.deepEqual(portable.author, source.author);
  assert.deepEqual(portable.extensions['com.openai'].interface, source.interface);
  assert.deepEqual(portable.extensions, {
    ...source.extensions,
    'com.openai': { ...source.extensions['com.openai'], interface: source.interface },
  });
  assert.deepEqual(overlay.extensions, source.extensions);
  const onboarding = portable.extensions['com.openai'].onboardingSkill;
  assert.equal(onboarding, './skills/get-started/SKILL.md');
  assert.deepEqual(await readFile(join(destination, onboarding)), await readFile(join(pluginSource, onboarding)));
  assert.doesNotMatch(await readFile(join(destination, onboarding), 'utf8'), /Onboarding Dev|--keychain|local-marketplaces/);
  assert.deepEqual(overlay.interface, source.interface);
  assert.equal(source.interface.defaultPrompt.length, 3);
  const sourceFiles = await files(join(pluginSource, 'skills'));
  assert.deepEqual(await files(join(destination, 'skills')), sourceFiles);
  for (const file of sourceFiles) {
    assert.deepEqual(await readFile(join(destination, 'skills', file)), await readFile(join(pluginSource, 'skills', file)));
  }
  const included = await files(destination);
  assert(!included.includes('.app.json'));
  assert(!included.some((path) => /keychain|\.py$|\.env|results|usage-dev/.test(path)));
  assert.equal(overlay.apps, undefined);
  assert.equal(overlay.mcpServers, './.mcp.json');
  assert.deepEqual(await json(join(destination, 'mcp.json')), {
    $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
    mcpServers: { firecrawl: { type: 'streamable-http', url: 'https://mcp.firecrawl.dev/v2/mcp-oauth' } },
  });
  assert.deepEqual(await json(join(destination, '.mcp.json')), {
    mcpServers: { firecrawl: { url: 'https://mcp.firecrawl.dev/v2/mcp-oauth' } },
  });
  for (const key of ['logo', 'composerIcon']) {
    const icon = await readFile(join(destination, source.interface[key]));
    assert.deepEqual([...icon.subarray(1, 4)], [...Buffer.from('PNG')]);
    assert.equal(icon.readUInt32BE(16), icon.readUInt32BE(20), `${key} must be square`);
  }
});

test('preparation refuses to overwrite an existing directory', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'firecrawl-submission-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(prepareOpenAIPlugin(root), { code: 'EEXIST' });
  assert.deepEqual(await readdir(root), []);
});
