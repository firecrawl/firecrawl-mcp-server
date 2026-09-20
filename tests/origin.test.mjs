import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ORIGIN_SERVER,
  originForClient,
  originHeaders,
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
