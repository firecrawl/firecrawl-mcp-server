import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import test from 'node:test';
import {
  assertPluginToolCoverage,
  claudePlugin,
  instructionFiles,
  openaiPlugin,
} from './helpers/plugin-contract.mjs';

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

test('Gemini extension version matches the npm package version', () => {
  const packageJson = readJson(new URL('../package.json', import.meta.url));
  const extension = readJson(new URL('../gemini-extension.json', import.meta.url));
  assert.equal(extension.version, packageJson.version);
});

test('tool coverage ignores incidental mentions and checks explicit references', (t) => {
  const plugin = mkdtempSync(join(tmpdir(), 'plugin-contract-'));
  t.after(() => rmSync(plugin, { recursive: true, force: true }));
  const skills = join(plugin, 'skills');
  mkdirSync(skills);
  const entrypoint = join(skills, 'SKILL.md');
  const tools = [{ name: 'firecrawl_search' }];

  writeFileSync(
    entrypoint,
    'Use `firecrawl_search`. See https://example.com/firecrawl_hidden.\n' +
      'Do not use firecrawl_hidden.\n'
  );
  assert.doesNotThrow(() => assertPluginToolCoverage(plugin, tools));

  writeFileSync(
    entrypoint,
    'See [documentation](https://example.com/firecrawl_search) and ' +
      '`https://example.com/firecrawl_search`. Mentioning firecrawl_search is insufficient.\n'
  );
  assert.throws(
    () => assertPluginToolCoverage(plugin, tools),
    /has no tool reference for firecrawl_search/
  );

  writeFileSync(entrypoint, 'Use `firecrawl_search` and `firecrawl_hidden`.\n');
  assert.throws(
    () => assertPluginToolCoverage(plugin, tools),
    /references unavailable tool firecrawl_hidden/
  );
});

test('OpenAI package uses the registered Firecrawl app connection', () => {
  const manifest = readJson(join(openaiPlugin, '.codex-plugin/plugin.json'));
  assert.equal(manifest.skills, './skills');
  assert.equal(manifest.apps, './.app.json');
  assert.deepEqual(readJson(join(openaiPlugin, manifest.apps)), {
    apps: {
      'app-6a314a73f8ac819195b0d55e36b9c609': {
        id: 'asdk_app_6a314a73f8ac819195b0d55e36b9c609',
      },
    },
  });
  assert.equal(manifest.mcpServers, undefined);
  assert.equal(existsSync(join(openaiPlugin, '.mcp.json')), false);
});

test('OpenAI onboarding separates goal authorization from installation and scheduling', () => {
  const manifest = readJson(join(openaiPlugin, '.codex-plugin/plugin.json'));
  assert.equal(
    manifest.extensions['com.openai'].onboardingSkill,
    './skills/get-started/SKILL.md'
  );
  const text = readFileSync(
    join(openaiPlugin, manifest.extensions['com.openai'].onboardingSkill),
    'utf8'
  );
  const goal = text
    .split('## Understand the goal with minimal effort\n')[1]
    .split('\n## ')[0];
  assert.match(
    goal,
    /explicit request[\s\S]*execute[\s\S]*target and required inputs are clear/
  );
  assert.match(
    goal,
    /installation or onboarding alone[\s\S]*native question and wait for the answer/
  );
  assert.match(
    goal,
    /context is missing, stale, or ambiguous[\s\S]*one focused question/
  );
  const actionIndex = goal.indexOf('one concrete output');
  const optionsIndex = goal.indexOf('two or three concrete starting options');
  assert.ok(actionIndex >= 0 && optionsIndex >= 0);
  assert.ok(actionIndex < optionsIndex);

  const result = text
    .split('## Deliver the first useful result\n')[1]
    .split('\n## ')[0];
  assert.match(
    result,
    /explicit goal-first request[\s\S]*remembered interests or installation alone do not/
  );
  const recurring = result
    .split('\n\n')
    .find((paragraph) => paragraph.includes('recurring follow-up'));
  assert.match(
    recurring,
    /After delivering a useful first result[\s\S]*ongoing goal/
  );
  assert.match(
    recurring,
    /recommendation, not permission[\s\S]*only after explicit user acceptance/
  );
  assert.match(
    recurring,
    /actually available native scheduling tool[\s\S]*schedule or timezone/
  );
  assert.match(
    recurring,
    /do not substitute a Firecrawl monitor[\s\S]*scheduling is unavailable[\s\S]*without claiming a schedule was created/
  );
});

test('Claude package connects to the search endpoint without embedded credentials', () => {
  const manifest = readJson(join(claudePlugin, '.claude-plugin/plugin.json'));
  assert.equal(manifest.name, 'firecrawl-search');
  assert.deepEqual(readJson(join(claudePlugin, '.mcp.json')), {
    mcpServers: {
      firecrawl: {
        type: 'http',
        url: 'https://mcp.firecrawl.dev/v2/mcp-search',
      },
    },
  });
});

for (const plugin of [openaiPlugin, claudePlugin]) {
  test(`${plugin.split(sep).at(-2)} skill references are self-contained`, () => {
    const skills = join(plugin, 'skills');
    for (const entry of readdirSync(skills, { withFileTypes: true })) {
      assert.ok(entry.isDirectory(), `${entry.name} must be a skill directory`);
      const skill = realpathSync(join(skills, entry.name));
      const entrypoint = join(skill, 'SKILL.md');
      const text = readFileSync(entrypoint, 'utf8');
      assert.ok(text.startsWith('---\n'), `${entrypoint} needs frontmatter`);
      assert.equal(text.match(/^name: (.+)$/m)?.[1], entry.name);
      assert.ok(text.match(/^description: .+$/m), `${entrypoint} needs a trigger`);

      for (const file of instructionFiles(skill)) {
        for (const [, target] of readFileSync(file, 'utf8').matchAll(
          /\[[^\]]*\]\(([^)]+)\)/g
        )) {
          if (/^https?:\/\//.test(target) || target.startsWith('#')) continue;
          const path = realpathSync(resolve(dirname(file), target.split('#')[0]));
          assert.ok(path.startsWith(skill + sep), `${file} links outside its skill`);
        }
      }
    }
  });
}
