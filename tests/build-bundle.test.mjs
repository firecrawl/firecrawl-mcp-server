import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// The server is served by the official MCP SDK; nothing may load fastmcp.
test('dist serves MCP through the official SDK and never imports fastmcp', async () => {
  const dist = await readFile(
    new URL('../dist/index.js', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(dist, /from\s+["']fastmcp["']/);
  assert.match(dist, /from\s+["']@modelcontextprotocol\/server["']/);
  assert.match(dist, /title: tool\.annotations\.title/);
  assert.match(dist, /tool\.canList/);
});

test('the library entry and its types never reference fastmcp', async () => {
  const dist = await readFile(
    new URL('../dist/server.js', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(dist, /from\s+["']fastmcp["']/);
  assert.match(dist, /tool\.canList/);
  const types = await readFile(
    new URL('../dist/server.d.ts', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(types, /from\s+["']fastmcp["']/);
});

test('every package dist imports is a direct dependency', async () => {
  const dist = await readFile(
    new URL('../dist/index.js', import.meta.url),
    'utf8'
  );
  const pkg = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8')
  );
  // Static `from`, side-effect `import "x"`, dynamic `import("x")` and
  // esbuild's `__require("x")` shims all resolve at runtime.
  const specifiers = [
    ...dist.matchAll(/\bfrom\s+["']([^"'./][^"']*)["']/g),
    ...dist.matchAll(/\bimport\s+["']([^"'./][^"']*)["']/g),
    ...dist.matchAll(/\bimport\(\s*["']([^"'./][^"']*)["']\s*\)/g),
    ...dist.matchAll(/\b(?:__)?require\(\s*["']([^"'./][^"']*)["']\s*\)/g),
  ].map(([, spec]) => spec);
  assert.ok(specifiers.length > 0, 'expected to find bare imports in dist');
  const imported = new Set(
    specifiers
      .map((spec) => spec.match(/^(@[^/]+\/[^/]+|[^/]+)/)[1])
      .filter((name) => !name.startsWith('node:'))
  );
  const builtins = new Set((await import('node:module')).builtinModules);
  const missing = [...imported].filter(
    (name) => !builtins.has(name) && !(name in pkg.dependencies)
  );
  assert.deepEqual(missing, []);
});
