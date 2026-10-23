import assert from 'node:assert/strict';
import test from 'node:test';
import { startStdio } from './helpers/exchange-mcp.mjs';

const KEYLESS_NOTICE = 'running in keyless mode';

async function startupNotice(t, env) {
  const { client, getStderr } = await startStdio(t, {
    FIRECRAWL_API_KEY: '',
    FIRECRAWL_API_URL: '',
    FIRECRAWL_OAUTH_TOKEN: '',
    ...env,
  });
  const { tools } = await client.request('tools/list', {});
  return { stderr: getStderr(), names: tools.map((tool) => tool.name) };
}

test('stdio without a credential announces keyless mode', async (t) => {
  const { stderr, names } = await startupNotice(t, {});
  assert.ok(stderr.includes(KEYLESS_NOTICE), stderr);
  assert.ok(!names.includes('firecrawl_search_feedback'), names.join(', '));
});

test('stdio with FIRECRAWL_OAUTH_TOKEN does not announce keyless mode', async (t) => {
  const { stderr, names } = await startupNotice(t, {
    FIRECRAWL_OAUTH_TOKEN: 'fco_test-token',
  });
  assert.ok(names.includes('firecrawl_search_feedback'), names.join(', '));
  assert.ok(!stderr.includes(KEYLESS_NOTICE), stderr);
});
