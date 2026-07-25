import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const config = await readFile(
  new URL('../docker/nginx.conf', import.meta.url),
  'utf8'
);

function locationBody(pattern) {
  const start = config.indexOf(pattern);
  assert.notEqual(start, -1, `missing nginx location: ${pattern}`);
  const open = config.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < config.length; index += 1) {
    if (config[index] === '{') depth += 1;
    if (config[index] === '}') depth -= 1;
    if (depth === 0) return config.slice(open + 1, index);
  }
  assert.fail(`unterminated nginx location: ${pattern}`);
}

test('key-bearing routes disable access logs before forwarding credentials', () => {
  for (const route of [
    'location ~ ^/(?<apikey>[^/]+)/v2/mcp-search(?:/|$)',
    'location ~ ^/(?<apikey>[^/]+)/(?:v2/mcp|mcp)/?$',
    'location ~ ^/(?<apikey>[^/]+)/v(?:1|2)/(.*)$',
    'location ~ ^/(?<apikey>[^/]+)/(.*)$',
  ]) {
    const body = locationBody(route);
    assert.match(body, /access_log off;/);
    assert.match(body, /proxy_set_header X-Firecrawl-API-Key \$apikey;/);
  }
});

test('specific MCP identities precede generic legacy regex routes', () => {
  const genericVersioned = config.indexOf(
    'location ~ ^/v(?:1|2)/(.*)$'
  );
  const genericKeyed = config.indexOf(
    'location ~ ^/(?<apikey>[^/]+)/v(?:1|2)/(.*)$'
  );
  for (const route of [
    'location ~ ^/v2/mcp-oauth/?$',
    'location ~ ^/v2/mcp/?$',
    'location ~ ^/v2/mcp-search(?:/|$)',
  ]) {
    assert.ok(config.indexOf(route) < genericVersioned, `${route} ordering`);
  }
  for (const route of [
    'location ~ ^/(?<apikey>[^/]+)/v2/mcp-search(?:/|$)',
    'location ~ ^/(?<apikey>[^/]+)/(?:v2/mcp|mcp)/?$',
  ]) {
    assert.ok(config.indexOf(route) < genericKeyed, `${route} ordering`);
  }
});

test('legacy MCP aliases stay bound to the full identity', () => {
  for (const route of [
    'location = /mcp',
    'location ~ ^/(?<apikey>[^/]+)/(?:v2/mcp|mcp)/?$',
  ]) {
    const body = locationBody(route);
    assert.match(body, /rewrite \^ \/v2\/mcp break;/);
    assert.doesNotMatch(body, /mcp-oauth/);
  }
});

test('search routes are rendered to a fixed upstream and readiness reaches Node', async () => {
  assert.match(config, /proxy_pass http:\/\/__MCP_SEARCH_UPSTREAM__;/);
  const entrypoint = await readFile(
    new URL('../docker/entrypoint.sh', import.meta.url),
    'utf8'
  );
  assert.match(entrypoint, /FASTMCP_ENDPOINT:-\/v2\/mcp/);
  assert.match(entrypoint, /\[ "\$\{FASTMCP_ENDPOINT:-\/v2\/mcp\}" = "\/v2\/mcp-search" \]/);
  assert.match(entrypoint, /SEARCH_UPSTREAM=app_search/);
  assert.match(entrypoint, /SEARCH_UPSTREAM=app/);
  assert.match(entrypoint, /s\/__MCP_SEARCH_UPSTREAM__\/\$\{SEARCH_UPSTREAM\}\/g/);

  const ready = locationBody('location = /ready');
  assert.match(ready, /proxy_pass http:\/\/app\/ready;/);
});
