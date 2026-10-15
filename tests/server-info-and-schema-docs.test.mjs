import assert from 'node:assert/strict';
import test from 'node:test';
import { startStdioWithApi } from './helpers/exchange-mcp.mjs';

// Server identity, behaviour hints and input documentation are what MCP
// directories and quality scanners read from the handshake and tools/list.
// These pin them so they cannot silently regress.

function undocumented(schema, path = '') {
  const missing = [];
  for (const [name, prop] of Object.entries(schema?.properties ?? {})) {
    const here = path ? `${path}.${name}` : name;
    if (
      typeof prop.description !== 'string' ||
      prop.description.trim() === ''
    ) {
      missing.push(here);
    }
    missing.push(...undocumented(prop, here));
  }
  return missing;
}

test('initialize advertises title, description, website and icons beside name and version', async (t) => {
  const { init } = await startStdioWithApi(t);
  const info = init.serverInfo;
  assert.equal(info.name, 'firecrawl-fastmcp');
  assert.match(info.version, /^\d+\.\d+\.\d+$/);
  assert.equal(info.title, 'Firecrawl');
  assert.ok(info.description.length > 20);
  const site = new URL(info.websiteUrl);
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

test('every tool declares idempotentHint, and job-starting tools are not idempotent', async (t) => {
  const { client } = await startStdioWithApi(t);
  const { tools } = await client.request('tools/list', {});
  for (const tool of tools) {
    assert.equal(
      typeof tool.annotations?.idempotentHint,
      'boolean',
      `${tool.name} idempotentHint`
    );
  }
  const byName = new Map(tools.map((tool) => [tool.name, tool.annotations]));
  for (const name of [
    'firecrawl_search',
    'firecrawl_map',
    'firecrawl_parse',
    'firecrawl_check_crawl_status',
    'firecrawl_agent_status',
  ]) {
    if (byName.has(name))
      assert.equal(byName.get(name).idempotentHint, true, name);
  }
  for (const name of [
    'firecrawl_crawl',
    'firecrawl_agent',
    'firecrawl_feedback',
    'firecrawl_search_feedback',
  ]) {
    if (byName.has(name))
      assert.equal(byName.get(name).idempotentHint, false, name);
  }
});

test('every input of firecrawl_scrape, firecrawl_search and firecrawl_parse has a description', async (t) => {
  const { client } = await startStdioWithApi(t);
  const { tools } = await client.request('tools/list', {});
  for (const name of [
    'firecrawl_scrape',
    'firecrawl_search',
    'firecrawl_parse',
  ]) {
    const tool = tools.find((candidate) => candidate.name === name);
    assert.ok(tool, `${name} is listed`);
    assert.deepEqual(
      undocumented(tool.inputSchema),
      [],
      `${name} inputs without a description`
    );
  }
});
