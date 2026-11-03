import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readJson = (file) =>
  JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));

const manifest = readJson('gemini-extension.json');
const pkg = readJson('package.json');

test('the Gemini CLI extension version matches the package version', () => {
  assert.equal(manifest.version, pkg.version);
});

test('the Gemini CLI extension starts the latest firecrawl-mcp with the declared key setting', () => {
  const server = manifest.mcpServers.firecrawl;
  assert.equal(server.command, 'npx');
  assert.deepEqual(server.args, ['-y', `${pkg.name}@latest`]);
  assert.deepEqual(
    Object.keys(server.env),
    manifest.settings.map((setting) => setting.envVar)
  );
  assert.equal(server.env.FIRECRAWL_API_KEY, '${FIRECRAWL_API_KEY}');
});
