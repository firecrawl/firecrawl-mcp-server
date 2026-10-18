import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ORIGIN_SERVER,
  initializeClientSlug,
  isRuntimeUserAgent,
  originForClient,
  originHeaders,
  requestOrigin,
  userAgentProduct,
} from '../dist/origin.js';

test('the origin names the MCP client and the server version', () => {
  assert.equal(
    originForClient({ name: 'claude-code', version: '2.1.0' }, '3.24.1'),
    'mcp-claude-code@3.24.1'
  );
  assert.equal(
    originForClient({ name: 'Cursor (VS Code)' }, '3.24.1'),
    'mcp-cursor-vs-code@3.24.1'
  );
  assert.equal(
    originForClient({ name: 'codex_mcp_client' }, '3.24.1'),
    'mcp-codex-mcp-client@3.24.1'
  );
});

test('a missing, empty, or self-referential client name reads as the server itself', () => {
  assert.equal(originForClient(undefined, '3.24.1'), `${ORIGIN_SERVER}@3.24.1`);
  assert.equal(originForClient(null, '3.24.1'), `${ORIGIN_SERVER}@3.24.1`);
  assert.equal(
    originForClient({ name: '' }, '3.24.1'),
    `${ORIGIN_SERVER}@3.24.1`
  );
  assert.equal(
    originForClient({ name: '***' }, '3.24.1'),
    `${ORIGIN_SERVER}@3.24.1`
  );
  assert.equal(
    originForClient({ name: 'fastmcp' }, '3.24.1'),
    `${ORIGIN_SERVER}@3.24.1`
  );
  assert.equal(
    originForClient({ name: 'firecrawl-fastmcp' }, '3.24.1'),
    `${ORIGIN_SERVER}@3.24.1`
  );
});

test('a long client name is cut to a bounded token and never ends in a dash', () => {
  const origin = originForClient({ name: 'x'.repeat(60) + '-tail' }, '3.24.1');
  assert.equal(origin, `mcp-${'x'.repeat(48)}@3.24.1`);
  assert.equal(
    originForClient({ name: 'abc-'.repeat(12) + 'z' }, '1.0.0'),
    'mcp-abc-abc-abc-abc-abc-abc-abc-abc-abc-abc-abc-abc@1.0.0'
  );
});

test('the mcp token survives in every origin, and the header form carries the same value', () => {
  for (const origin of [
    originForClient({ name: 'claude-code' }, '3.24.1'),
    originForClient(undefined, '3.24.1'),
  ]) {
    assert.match(origin, /(^|[^a-z])mcp([^a-z]|$)/);
    assert.deepEqual(originHeaders(origin), { 'X-Origin': origin });
  }
  assert.equal(originForClient({ name: 'zed' }, ''), 'mcp-zed');
});

test('without a client name the User-Agent product token names the client, marked as such', () => {
  assert.equal(userAgentProduct('python-httpx/0.28.1'), 'python-httpx');
  assert.equal(userAgentProduct('node'), 'node');
  assert.equal(
    userAgentProduct('  Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'),
    'mozilla'
  );
  assert.equal(userAgentProduct(undefined), '');
  assert.equal(
    originForClient(undefined, '3.24.1', 'python-httpx/0.28.1'),
    'mcp-ua-python-httpx@3.24.1'
  );
  assert.equal(
    originForClient({ name: 'fastmcp' }, '3.24.1', 'Claude-User/1.0'),
    'mcp-ua-claude-user@3.24.1'
  );
  assert.equal(
    originForClient(undefined, '3.24.1', ''),
    `${ORIGIN_SERVER}@3.24.1`
  );
  assert.equal(
    originForClient({ name: 'claude-code' }, '3.24.1', 'node'),
    'mcp-claude-code@3.24.1'
  );
});

test('a declared origin names the integration over every other signal', () => {
  assert.equal(
    originForClient(undefined, '3.31.0', 'Claude-User/1.0', {
      declaredOrigin: 'Example Plugin',
    }),
    'mcp-example-plugin@3.31.0'
  );
  assert.equal(
    originForClient({ name: 'claude-code' }, '3.31.0', 'claude-code/2.0', {
      declaredOrigin: 'example-plugin',
    }),
    'mcp-example-plugin@3.31.0'
  );
  assert.equal(
    originForClient(undefined, '3.31.0', 'node', { declaredOrigin: '  ' }),
    'mcp-ua-node@3.31.0'
  );
  assert.equal(
    originForClient(undefined, '3.31.0', 'node', { declaredOrigin: 'fastmcp' }),
    'mcp-ua-node@3.31.0'
  );
});

test('runtime User-Agents give way to a carried initialize name, then the referrer host', () => {
  assert.equal(isRuntimeUserAgent('node'), true);
  assert.equal(isRuntimeUserAgent('python-httpx/0.28.1'), true);
  assert.equal(isRuntimeUserAgent('Go-http-client/2.0'), true);
  assert.equal(isRuntimeUserAgent(undefined), true);
  assert.equal(isRuntimeUserAgent('Claude-User/1.0'), false);
  assert.equal(isRuntimeUserAgent('claude-code/2.1.0'), false);

  const initializeClient = { name: 'ai-sdk-mcp-client', version: '1.0.0' };
  assert.equal(
    originForClient(undefined, '3.31.0', 'node', { initializeClient }),
    'mcp-ai-sdk-mcp-client@3.31.0'
  );
  assert.equal(
    originForClient(undefined, '3.31.0', undefined, { initializeClient }),
    'mcp-ai-sdk-mcp-client@3.31.0'
  );
  assert.equal(
    originForClient(undefined, '3.31.0', 'python-httpx/0.28.1', {
      initializeClient: { name: 'mcp', version: '0.1.0' },
      referrer: 'https://www.app.example.com/agents',
    }),
    'mcp-ref-app-example-com@3.31.0'
  );
  assert.equal(
    originForClient(undefined, '3.31.0', 'undici', {
      initializeClient,
      referrer: 'https://app.example.com',
    }),
    'mcp-ai-sdk-mcp-client@3.31.0'
  );
});

test('signals that only replace a runtime never rename a named User-Agent or client', () => {
  const signals = {
    initializeClient: { name: 'claude-ai' },
    referrer: 'https://claude.ai',
  };
  assert.equal(
    originForClient(undefined, '3.31.0', 'Claude-User/1.0', signals),
    'mcp-ua-claude-user@3.31.0'
  );
  assert.equal(
    originForClient({ name: 'claude-code' }, '3.31.0', 'node', signals),
    'mcp-claude-code@3.31.0'
  );
  assert.equal(
    originForClient({ name: 'mcp' }, '3.31.0', 'python-httpx/0.28.1'),
    'mcp-mcp@3.31.0'
  );
});

test('default SDK names, the server name, local hosts and addresses are not signals', () => {
  for (const name of ['mcp', 'MCP Client', 'client', 'test-client', 'fastmcp', '', undefined]) {
    assert.equal(initializeClientSlug(name), '');
  }
  assert.equal(initializeClientSlug('My Agent'), 'my-agent');
  for (const referrer of [
    'http://localhost:6274',
    'http://127.0.0.1:3000/x',
    'http://[::1]:8080',
    'http://app.localhost',
    'http://localhost.:3000',
    'http://printer.local',
    'null',
    'not a url',
  ]) {
    assert.equal(
      originForClient(undefined, '3.31.0', 'Mozilla/5.0 (X11)', { referrer }),
      'mcp-ua-mozilla@3.31.0'
    );
  }
});

test('a URL OAuth client id names the product when the User-Agent is a runtime or missing', () => {
  const origin = (oauthClientId, userAgent = 'node') =>
    originForClient(undefined, '3.33.0', userAgent, { oauthClientId });
  assert.equal(
    origin('https://antigravity.example/oauth/client-metadata.json'),
    'mcp-oauth-antigravity-example@3.33.0'
  );
  assert.equal(
    origin('https://www.app.example.com/oauth/client-metadata.json', undefined),
    'mcp-oauth-app-example-com@3.33.0'
  );
  assert.equal(
    origin('https://api.example.build/oauth/client-metadata.json', 'python-httpx/0.28.1'),
    'mcp-oauth-api-example-build@3.33.0'
  );
});

test('a shared static host adds the first path segment to the OAuth client token', () => {
  const origin = (oauthClientId) =>
    originForClient(undefined, '3.33.0', 'node', { oauthClientId });
  assert.equal(
    origin('https://acme.github.io/agent-one/docs/oauth/client-metadata.json'),
    'mcp-oauth-acme-github-io-agent-one@3.33.0'
  );
  assert.equal(
    origin('https://acme.github.io/agent-two/client.json'),
    'mcp-oauth-acme-github-io-agent-two@3.33.0'
  );
  assert.equal(
    origin('https://team.gitlab.io/tool/client.json'),
    'mcp-oauth-team-gitlab-io-tool@3.33.0'
  );
  assert.equal(
    origin('https://tool.pages.dev/oauth/client.json'),
    'mcp-oauth-tool-pages-dev-oauth@3.33.0'
  );
  assert.equal(
    origin('https://tool.netlify.app/client.json'),
    'mcp-oauth-tool-netlify-app-client-json@3.33.0'
  );
  assert.equal(
    origin('https://tool.vercel.app/'),
    'mcp-oauth-tool-vercel-app@3.33.0'
  );
});

test('OAuth client ids that name nothing are not signals', () => {
  for (const oauthClientId of [
    'dyn_0123456789abcdef',
    'some-client-id',
    '',
    null,
    undefined,
    'https://firecrawl.dev/oauth/client.json',
    'https://mcp.firecrawl.dev/oauth/client.json',
    'http://localhost:3000/client.json',
    'http://127.0.0.1/client.json',
  ]) {
    assert.equal(
      originForClient(undefined, '3.33.0', 'node', { oauthClientId }),
      'mcp-ua-node@3.33.0'
    );
  }
});

test('the OAuth client sits after a carried initialize name and before the referrer', () => {
  const oauthClientId = 'https://app.example.com/oauth/client-metadata.json';
  const referrer = 'https://claude.ai';
  assert.equal(
    originForClient(undefined, '3.33.0', 'node', {
      oauthClientId,
      referrer,
      initializeClient: { name: 'ai-sdk-mcp-client' },
    }),
    'mcp-ai-sdk-mcp-client@3.33.0'
  );
  assert.equal(
    originForClient(undefined, '3.33.0', 'node', { oauthClientId, referrer }),
    'mcp-oauth-app-example-com@3.33.0'
  );
  assert.equal(
    originForClient(undefined, '3.33.0', 'Claude-User/1.0', { oauthClientId }),
    'mcp-ua-claude-user@3.33.0'
  );
  assert.equal(
    originForClient({ name: 'claude-code' }, '3.33.0', 'node', { oauthClientId }),
    'mcp-claude-code@3.33.0'
  );
  assert.equal(
    originForClient(undefined, '3.33.0', 'node', {
      oauthClientId,
      declaredOrigin: 'example-plugin',
    }),
    'mcp-example-plugin@3.33.0'
  );
});

test('requestOrigin reads the OAuth client id from the session', () => {
  assert.match(
    requestOrigin(undefined, {
      clientUserAgent: 'node',
      oauthClientId: 'https://app.example.com/oauth/client-metadata.json',
    }),
    /^mcp-oauth-app-example-com@/
  );
});
