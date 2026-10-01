// Read-only staging checks. Reads FIRECRAWL_API_KEY from the environment or macOS Keychain.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const endpoint = 'http://mcp-server-staging-service:8080/v2/mcp';
const key =
  process.env.FIRECRAWL_API_KEY ||
  execFileSync(
    '/usr/bin/security',
    [
      'find-generic-password',
      '-s',
      'FIRECRAWL_API_KEY',
      ...(process.env.FIRECRAWL_KEYCHAIN_ACCOUNT
        ? ['-a', process.env.FIRECRAWL_KEYCHAIN_ACCOUNT]
        : []),
      '-w',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  ).trim();
const client = new Client(
  { name: 'firecrawl-staging-regression', version: '0.1.0' },
  { capabilities: {} }
);
const boundedFetch = (url, init) =>
  fetch(url, {
    ...init,
    redirect: 'error',
    signal: AbortSignal.any([
      ...(init?.signal ? [init.signal] : []),
      AbortSignal.timeout(20000),
    ]),
  });
async function close(client) {
  let timer;
  try {
    await Promise.race([
      client.close(),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('MCP close timed out')),
          5000
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
  requestInit: { headers: { Authorization: `Bearer ${key}` } },
  fetch: boundedFetch,
});
const report = { endpoint };
try {
  await client.connect(transport);
  const tools = await client.listTools();
  const launcher = tools.tools.find(
    (t) => t.name === 'firecrawl_usage_dashboard'
  );
  assert.ok(launcher, 'Staging does not yet advertise the sidebar launcher');
  assert.deepEqual(launcher._meta['openai/ui'].entrypoints, [
    { type: 'global' },
  ]);
  assert.deepEqual(launcher._meta.ui, {
    resourceUri: 'ui://firecrawl/usage.html',
    visibility: ['app'],
  });
  assert.ok(launcher.icons[0].src.startsWith('data:image/svg+xml;base64,'));
  report.toolCount = tools.tools.length;
  report.launcherMetadata = 'passed';
  const resources = await client.listResources();
  assert.ok(
    resources.resources.some((r) => r.uri === 'ui://firecrawl/usage.html')
  );
  const resource = await client.readResource({
    uri: 'ui://firecrawl/usage.html',
  });
  const html = resource.contents[0].text;
  const expected = readFileSync(
    new URL('../dist/usage.html', import.meta.url),
    'utf8'
  );
  assert.equal(html, expected, 'Deployed UI differs from the tested branch');
  report.uiSha256 = createHash('sha256').update(html).digest('hex');
  report.uiMatchesBranch = true;
  report.uiMetadata = resource.contents[0]._meta;

  for (const [name, args, label] of [
    ['firecrawl_usage_dashboard', {}, 'dashboard'],
    ['firecrawl_credit_usage', { view: 'historical' }, 'historicalUsage'],
    [
      'firecrawl_find_tools',
      { level: 'providers', limit: 5 },
      'providerDiscovery',
    ],
  ]) {
    const result = await client.callTool({ name, arguments: args });
    report[label] = {
      isError: result.isError === true,
      structuredKeys: Object.keys(result.structuredContent ?? {}),
    };
    assert.notEqual(result.isError, true, `${label} failed`);
  }
  const invalid = new StreamableHTTPClientTransport(new URL(endpoint), {
    requestInit: {
      headers: { Authorization: 'Bearer fc-invalid-staging-regression' },
    },
    fetch: boundedFetch,
  });
  const invalidClient = new Client(
    { name: 'firecrawl-invalid-auth-regression', version: '0.1.0' },
    { capabilities: {} }
  );
  try {
    await invalidClient.connect(invalid);
    const rejected = await invalidClient.callTool({
      name: 'firecrawl_credit_usage',
      arguments: {},
    });
    assert.equal(rejected.isError, true);
    assert.equal(rejected.structuredContent?.code, 'CREDENTIAL_INVALID');
    report.invalidAuth = 'CREDENTIAL_INVALID';
  } finally {
    await close(invalidClient);
  }
  report.success = true;
} catch (e) {
  report.success = false;
  report.error = e.message.replaceAll(key, '[redacted]');
  process.exitCode = 1;
} finally {
  await close(client).catch((error) => {
    report.success = false;
    report.error = error.message;
    process.exitCode = 1;
  });
  console.log(JSON.stringify(report, null, 2));
}
