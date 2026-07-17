import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contractPath = resolve(root, 'contracts/hosted-mcp/v1/contract.json');
const schemaPath = resolve(root, 'contracts/hosted-mcp/v1/schema.json');
const hashPath = resolve(root, 'contracts/hosted-mcp/v1/contract.sha256');
const write = process.argv.includes('--write');

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

function resolveJsonPointer(document, pointer) {
  assert.ok(pointer.startsWith('#/'), `unsupported schema reference: ${pointer}`);
  return pointer
    .slice(2)
    .split('/')
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce((value, part) => value?.[part], document);
}

function validateAgainstSchema(value, rule, schema, path = '$') {
  if (rule.$ref) {
    const resolved = resolveJsonPointer(schema, rule.$ref);
    assert.ok(resolved, `${path}: unresolved schema reference ${rule.$ref}`);
    return validateAgainstSchema(value, resolved, schema, path);
  }

  if (Object.hasOwn(rule, 'const')) {
    assert.deepEqual(value, rule.const, `${path}: value does not match schema constant`);
  }

  if (rule.type === 'object') {
    assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value), `${path}: expected object`);
    for (const required of rule.required ?? []) {
      assert.ok(Object.hasOwn(value, required), `${path}: missing required property ${required}`);
    }
    for (const [key, child] of Object.entries(value)) {
      const childRule = rule.properties?.[key];
      if (!childRule) {
        assert.notEqual(rule.additionalProperties, false, `${path}: unexpected property ${key}`);
        continue;
      }
      validateAgainstSchema(child, childRule, schema, `${path}.${key}`);
    }
  } else if (rule.type === 'array') {
    assert.ok(Array.isArray(value), `${path}: expected array`);
    if (rule.minItems !== undefined) assert.ok(value.length >= rule.minItems, `${path}: too few items`);
    if (rule.maxItems !== undefined) assert.ok(value.length <= rule.maxItems, `${path}: too many items`);
    if (rule.uniqueItems) {
      const serialized = value.map((item) => JSON.stringify(canonicalize(item)));
      assert.equal(new Set(serialized).size, serialized.length, `${path}: items must be unique`);
    }
    if (rule.items) value.forEach((item, index) => validateAgainstSchema(item, rule.items, schema, `${path}[${index}]`));
  } else if (rule.type === 'string') {
    assert.equal(typeof value, 'string', `${path}: expected string`);
    if (rule.format === 'uri') assert.doesNotThrow(() => new URL(value), `${path}: expected URI`);
  } else if (rule.type === 'number') {
    assert.equal(typeof value, 'number', `${path}: expected number`);
  }
}

const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
const canonical = `${JSON.stringify(canonicalize(contract), null, 2)}\n`;
assert.equal(readFileSync(contractPath, 'utf8'), canonical, 'contract.json must be canonical JSON');
validateAgainstSchema(contract, schema, schema);

assert.equal(contract.version, '1.1.0');
assert.equal(contract.profiles.keyless.endpoint, '/v2/mcp');
assert.equal(contract.profiles.keyless.resource, 'https://mcp.firecrawl.dev/v2/mcp');
assert.equal(contract.profiles.account.endpoint, '/v2/mcp-oauth');
assert.equal(contract.profiles.account.resource, 'https://mcp.firecrawl.dev/v2/mcp-oauth');
assert.equal(
  contract.profiles.keyless.instructions_sha256,
  '7e67b0d0fc16f7c99445799d6dbdc3840f5245060aa3241e49f85869c3fa901b'
);
assert.equal(
  contract.profiles.account.instructions_sha256,
  contract.profiles.keyless.instructions_sha256
);
assert.deepEqual(contract.profiles.account.protected_resource_metadata_paths, [
  '/.well-known/oauth-protected-resource/v2/mcp-oauth',
]);
assert.equal(contract.profiles.anthropic_search.endpoint, '/v2/mcp-search');
assert.equal(contract.profiles.anthropic_search.resource, 'https://mcp.firecrawl.dev/v2/mcp-search');
assert.equal(contract.profiles.anthropic_search.legacy_audience_accepted, false);
assert.deepEqual(contract.profiles.anthropic_search.accepted_credentials, [
  'oauth_same_resource',
]);
assert.equal(
  contract.profiles.anthropic_search.instructions_sha256,
  'cf1c1d6dad4913d73193bde96f74afa5f4ad774848bdaf7d61d9474125ead2ca'
);
assert.deepEqual(contract.profiles.anthropic_search.context_budget, {
  estimated_token_ceiling: 2700,
  serialized_bytes_ceiling: 10800,
});
assert.deepEqual(contract.profiles.anthropic_search.protected_resource_metadata_paths, [
  '/.well-known/oauth-protected-resource/v2/mcp-search',
]);
assert.deepEqual(contract.profiles.anthropic_search.tool_allowlist, [
  'firecrawl_search',
  'firecrawl_research_search_papers',
  'firecrawl_research_inspect_paper',
  'firecrawl_research_related_papers',
  'firecrawl_research_read_paper',
  'firecrawl_research_search_github',
]);
assert.equal(
  contract.profiles.anthropic_search.schema_overrides.firecrawl_search,
  'scrapeOptions and enterprise omitted'
);
assert.equal(contract.audience_compatibility.policy, 'one_way');
assert.equal(contract.audience_compatibility.legacy_tokens_on_account_endpoint.default, true);
assert.equal(contract.audience_compatibility.new_account_tokens_on_keyless_endpoint, false);
assert.deepEqual(contract.keyless_tools, [
  'firecrawl_scrape',
  'firecrawl_search',
  'firecrawl_parse',
]);

const digest = createHash('sha256').update(canonical).digest('hex');
const expectedHashFile = `${digest}  contract.json\n`;
if (write) writeFileSync(hashPath, expectedHashFile);
assert.equal(readFileSync(hashPath, 'utf8'), expectedHashFile, 'contract.sha256 is stale');
console.log(`Hosted MCP contract 1.1.0 verified (${digest})`);
