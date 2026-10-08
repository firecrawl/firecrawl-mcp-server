import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

test('Gemini extension version matches the npm package version', () => {
  const packageJson = readJson(new URL('../package.json', import.meta.url));
  const extension = readJson(new URL('../gemini-extension.json', import.meta.url));
  assert.equal(extension.version, packageJson.version);
});
