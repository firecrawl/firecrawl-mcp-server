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
  }
}

const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
const canonical = `${JSON.stringify(canonicalize(contract), null, 2)}\n`;
assert.equal(readFileSync(contractPath, 'utf8'), canonical, 'contract.json must be canonical JSON');
validateAgainstSchema(contract, schema, schema);

assert.equal(contract.version, '1.0.0');
assert.equal(contract.profiles.keyless.endpoint, '/v2/mcp');
assert.equal(contract.profiles.keyless.resource, 'https://mcp.firecrawl.dev/v2/mcp');
assert.equal(contract.profiles.account.endpoint, '/v2/mcp-oauth');
assert.equal(contract.profiles.account.resource, 'https://mcp.firecrawl.dev/v2/mcp-oauth');
assert.deepEqual(contract.profiles.account.protected_resource_metadata_paths, [
  '/.well-known/oauth-protected-resource/v2/mcp-oauth',
]);
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
console.log(`Hosted MCP contract 1.0.0 verified (${digest})`);
