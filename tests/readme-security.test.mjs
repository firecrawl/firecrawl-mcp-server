import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

test('README documents hosted API-key setup without putting credentials in the URL', () => {
  assert.doesNotMatch(
    readme,
    /https:\/\/mcp\.firecrawl\.dev\/\{FIRECRAWL_API_KEY\}\/v2\/mcp/i
  );
  assert.match(readme, /Authorization: Bearer <FIRECRAWL_API_KEY>/);
  assert.match(readme, /Never put an API key in the server URL\./);
});

test('README documents an unversioned API base URL for self-hosted instances', () => {
  const apiUrlConfig =
    readme.match(/^- `FIRECRAWL_API_URL`[\s\S]*?(?=^- |^####)/m)?.[0] ?? '';

  assert.match(apiUrlConfig, /without `\/v1` or `\/v2`/);
  assert.match(apiUrlConfig, /`http:\/\/localhost:3002`/);
  assert.match(apiUrlConfig, /SDK appends the API version/);
  assert.match(apiUrlConfig, /404 Not Found/);
});
