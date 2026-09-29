import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// npm does not apply pnpm patches, so an external fastmcp import would load the
// unpatched registry copy for `npx firecrawl-mcp` users.
test('dist bundles the patched fastmcp instead of importing it', async () => {
  const dist = await readFile(new URL('../dist/index.js', import.meta.url), 'utf8');
  assert.doesNotMatch(dist, /from\s+["']fastmcp["']/);
  assert.match(dist, /title: tool\.annotations\.title/);
  assert.match(dist, /tool\.canList/);
});

test('every package the bundled fastmcp imports is a direct dependency', async () => {
  const dist = await readFile(new URL('../dist/index.js', import.meta.url), 'utf8');
  const pkg = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8')
  );
  const imported = new Set(
    [...dist.matchAll(/from\s+["']([^"'./][^"']*)["']/g)]
      .map(([, spec]) => spec.match(/^(@[^/]+\/[^/]+|[^/]+)/)[1])
      .filter((name) => !name.startsWith('node:'))
  );
  const builtins = new Set((await import('node:module')).builtinModules);
  const missing = [...imported].filter(
    (name) => !builtins.has(name) && !(name in pkg.dependencies)
  );
  assert.deepEqual(missing, []);
});
