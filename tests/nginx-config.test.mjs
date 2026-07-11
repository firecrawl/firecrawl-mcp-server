import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const nginxConfig = fs.readFileSync(new URL('../docker/nginx.conf', import.meta.url), 'utf8');

function extractRegexLocations(config) {
  const locations = [];
  const locationPattern = /^\s*location\s+~\s+(.+?)\s+\{\s*$/gm;
  let match;
  while ((match = locationPattern.exec(config)) !== null) {
    const start = locationPattern.lastIndex;
    let depth = 1;
    let cursor = start;
    while (cursor < config.length && depth > 0) {
      const char = config[cursor];
      if (char === '{') depth += 1;
      if (char === '}') depth -= 1;
      cursor += 1;
    }
    assert.equal(depth, 0, `unclosed nginx location for ${match[1]}`);
    const body = config.slice(start, cursor - 1);
    locations.push({ body, pattern: match[1] });
  }
  return locations;
}

function firstRegexLocationFor(path) {
  return extractRegexLocations(nginxConfig).find(({ pattern }) => {
    const regex = new RegExp(pattern);
    return regex.test(path);
  });
}

function locationIndex(pattern) {
  return extractRegexLocations(nginxConfig).findIndex((location) => location.pattern === pattern);
}

function assertProxyHeader(location, header) {
  assert.match(
    location.body,
    new RegExp(`^\\s*proxy_set_header\\s+${header}\\b`, 'm'),
    `${location.pattern} must set ${header}`
  );
}

function rewrittenPath(location, path) {
  const rewrite = location.body.match(/^\s*rewrite\s+(\S+)\s+(\S+)\s+break;\s*$/m);
  assert.ok(rewrite, `missing rewrite in location ${location.pattern}`);
  const [, pattern, replacement] = rewrite;
  // nginx `rewrite ^ /target break;` is used in this config as an unconditional
  // canonical path rewrite; model it explicitly instead of JavaScript's
  // zero-length string replacement behavior.
  if (pattern === '^') return replacement;
  return path.replace(new RegExp(pattern), replacement);
}

test('nginx routes hosted MCP endpoints before the generic /v2 API rewrite', () => {
  const oauth = firstRegexLocationFor('/v2/mcp-oauth');
  assert.ok(oauth, 'missing /v2/mcp-oauth nginx location');
  assert.equal(oauth.pattern, '^/v2/mcp-oauth/?$');
  assert.equal(rewrittenPath(oauth, '/v2/mcp-oauth'), '/v2/mcp-oauth');
  assert.equal(rewrittenPath(oauth, '/v2/mcp-oauth/'), '/v2/mcp-oauth');
  assertProxyHeader(oauth, 'Host');
  assertProxyHeader(oauth, 'X-Forwarded-Proto');
  assertProxyHeader(oauth, 'X-Request-ID');
  assert.ok(
    locationIndex('^/v2/mcp-oauth/?$') < locationIndex('^/v(?:1|2)/(.*)$'),
    '/v2/mcp-oauth must be declared before the generic /v2 API rewrite'
  );

  const keyless = firstRegexLocationFor('/v2/mcp');
  assert.ok(keyless, 'missing /v2/mcp nginx location');
  assert.equal(keyless.pattern, '^/(?:v2/mcp|mcp)/?$');
  assert.equal(rewrittenPath(keyless, '/v2/mcp'), '/v2/mcp');
  assert.equal(rewrittenPath(keyless, '/mcp'), '/v2/mcp');

  const legacyVersionedMcp = firstRegexLocationFor('/fc-test-key/v2/mcp');
  assert.ok(legacyVersionedMcp, 'missing legacy API-key /v2/mcp nginx location');
  assert.equal(legacyVersionedMcp.pattern, '^/(?<apikey>[^/]+)/(?:v2/mcp|mcp)/?$');
  assert.equal(rewrittenPath(legacyVersionedMcp, '/fc-test-key/v2/mcp'), '/v2/mcp');
  assertProxyHeader(legacyVersionedMcp, 'X-Firecrawl-API-Key');
  assert.ok(
    locationIndex('^/v(?:1|2)/(.*)$') < locationIndex('^/(?<apikey>[^/]+)/(?:v2/mcp|mcp)/?$'),
    'legacy API-key MCP route must not steal header-based /v1|v2 routes'
  );
  assert.ok(
    locationIndex('^/(?<apikey>[^/]+)/(?:v2/mcp|mcp)/?$') < locationIndex('^/(?<apikey>[^/]+)/v(?:1|2)/(.*)$'),
    'legacy API-key MCP route must be declared before the generic legacy version rewrite'
  );

  const legacyBareMcp = firstRegexLocationFor('/fc-test-key/mcp');
  assert.ok(legacyBareMcp, 'missing legacy API-key /mcp nginx location');
  assert.equal(legacyBareMcp.pattern, '^/(?<apikey>[^/]+)/(?:v2/mcp|mcp)/?$');
  assert.equal(rewrittenPath(legacyBareMcp, '/fc-test-key/mcp'), '/v2/mcp');
  assertProxyHeader(legacyBareMcp, 'X-Firecrawl-API-Key');

  const headerBasedMcp = firstRegexLocationFor('/v2/v2/mcp');
  assert.ok(headerBasedMcp, 'missing header-based /v2 nginx location');
  assert.equal(headerBasedMcp.pattern, '^/v(?:1|2)/(.*)$');
  assert.equal(rewrittenPath(headerBasedMcp, '/v2/v2/mcp'), '/v2/mcp');

  const api = firstRegexLocationFor('/v2/search');
  assert.ok(api, 'missing generic /v2 API nginx location');
  assert.equal(api.pattern, '^/v(?:1|2)/(.*)$');
  assert.equal(rewrittenPath(api, '/v2/search'), '/search');
});


test('nginx preserves OAuth protected-resource metadata paths', () => {
  const wellKnownIndex = nginxConfig.indexOf('location ^~ /.well-known/');
  assert.notEqual(wellKnownIndex, -1, 'missing exact /.well-known/ prefix location');
  assert.ok(
    wellKnownIndex < nginxConfig.indexOf('location ~ ^/(?<apikey>[^/]+)/(.*)$'),
    '/.well-known/ prefix route must be declared before legacy API-key regex routes'
  );
  assert.match(nginxConfig.slice(wellKnownIndex), /proxy_pass http:\/\/app;/);
});
