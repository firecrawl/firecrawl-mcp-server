import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('hosted MCP contract artifact and hash are current', () => {
  const result = spawnSync(process.execPath, ['scripts/check-hosted-mcp-contract.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Hosted MCP contract 1\.1\.0 verified/);
});
