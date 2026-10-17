import assert from 'node:assert/strict';
import test from 'node:test';
import { startStdioWithApi } from './helpers/exchange-mcp.mjs';

// MCP directories and clients read the server's title, description, website and
// icons from the initialize result. This pins them so they cannot silently go away.

test('initialize advertises title, description, website and icons beside name and version', async (t) => {
  const { init } = await startStdioWithApi(t);
  const info = init.serverInfo;
  assert.equal(info.name, 'firecrawl-fastmcp');
  assert.match(info.version, /^\d+\.\d+\.\d+$/);
  assert.equal(info.title, 'Firecrawl');
  assert.ok(info.description.length > 20);
  const site = new URL(info.websiteUrl);
  assert.equal(site.protocol, 'https:');
  assert.equal(site.hostname, 'docs.firecrawl.dev');
  assert.equal(site.searchParams.get('utm_source'), 'mcp-server');
  assert.ok(
    info.icons.some(
      (icon) => icon.mimeType === 'image/svg+xml' && icon.sizes?.includes('any')
    )
  );
  for (const icon of info.icons) {
    assert.equal(new URL(icon.src).protocol, 'https:');
  }
});
