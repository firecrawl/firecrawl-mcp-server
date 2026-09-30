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
import { fileURLToPath } from 'node:url';
import {
  assertPluginToolCoverage,
  claudePlugin,
  codexPlugin,
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

// Codex hides MCP tools behind tool_search unless omit_tools_from drops the
// deferred surface, and it loads a plugin's skills/ directory whenever the
// manifest lists none, so this package ships the server and nothing else.
test('Codex package is MCP-only: hosted OAuth server listed directly', () => {
  const manifest = readJson(join(codexPlugin, '.codex-plugin/plugin.json'));
  assert.equal(manifest.name, 'firecrawl');
  assert.equal(manifest.mcpServers, './.mcp.json');
  assert.equal(manifest.skills, undefined);
  assert.equal(manifest.apps, undefined);
  assert.equal(existsSync(join(codexPlugin, 'skills')), false);
  assert.equal(existsSync(join(codexPlugin, '.app.json')), false);
  assert.deepEqual(readJson(join(codexPlugin, '.mcp.json')), {
    mcpServers: {
      firecrawl: {
        url: 'https://mcp.firecrawl.dev/v2/mcp-oauth',
        omit_tools_from: ['deferred'],
      },
    },
  });
});

test('Codex marketplace lists the MCP-only package', () => {
  const marketplace = readJson(
    new URL('../.agents/plugins/marketplace.json', import.meta.url)
  );
  assert.deepEqual(
    marketplace.plugins.map((plugin) => [plugin.name, plugin.source]),
    [['firecrawl', { source: 'local', path: './plugins/codex/firecrawl' }]]
  );
  const root = fileURLToPath(new URL('../', import.meta.url));
  assert.equal(
    realpathSync(resolve(root, marketplace.plugins[0].source.path)),
    realpathSync(codexPlugin)
  );
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
