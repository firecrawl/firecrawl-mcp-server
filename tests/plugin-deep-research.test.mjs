import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import { openaiPlugin } from './helpers/plugin-contract.mjs';
import { startStdioWithApi } from './helpers/exchange-mcp.mjs';

const name = 'firecrawl-deep-research';
const skill = readFileSync(
  join(openaiPlugin, 'skills', name, 'SKILL.md'),
  'utf8'
);
const instructions = skill.replace(/\s+/g, ' ');

test('deep research has a valid plugin identity and its own router entry', () => {
  const manifest = JSON.parse(
    readFileSync(join(openaiPlugin, '.codex-plugin/plugin.json'), 'utf8')
  );
  assert.ok(typeof manifest.name === 'string' && manifest.name.trim());
  assert.ok(`${manifest.name}:${name}`.length <= 64);
  assert.equal(skill.match(/^name: (.+)$/m)?.[1], name);
  const description = skill.match(/^description: (.+)$/m)?.[1];
  assert.ok(description && description.length <= 1024);
  const router = readFileSync(
    join(openaiPlugin, 'skills/firecrawl/SKILL.md'),
    'utf8'
  );
  assert.ok(router.includes(`\`${name}\``));
});

test('deep research retains report-scale evidence and provider execution requirements', () => {
  for (const requirement of [
    /not quick lookups, product recommendations, or paper literature reviews/,
    /Contrarian Views And Risks/,
    /Open Questions/,
    /central claims have adequate evidence/,
    /Web and developer searches are billed per request/,
    /requiresOneOf/,
    /response\.key/,
    /price and external effects/,
    /every item in `data.alexandria`/,
    /unchanged filters and bounded pages\/records\/credits/,
    /identical ID and payload/,
    /changed inputs need a new ID/,
    /After an organization admin confirms acceptance/,
    /only if access and budget still permit/,
    /unknown freshness/,
    /live search\/page retrieval for missing or freshness-critical facts/,
    /retention may expire or be unavailable/,
    /not silently rerun paid work/,
  ]) {
    assert.match(instructions, requirement);
  }
  assert.doesNotMatch(
    skill,
    /Bash\(|allowed-tools:|FIRECRAWL_API_KEY|\.firecrawl\/|npx firecrawl/
  );
});

test('deep-research examples are accepted by the emitted MCP input schemas', async (t) => {
  const { client } = await startStdioWithApi(t);
  const { tools } = await client.request('tools/list', {});
  const validator = new AjvJsonSchemaValidator();
  const schemas = new Map(
    tools.map((tool) => [tool.name, validator.getValidator(tool.inputSchema)])
  );
  const examples = [...skill.matchAll(/```json\n([\s\S]*?)\n```/g)].map(
    ([, body]) => JSON.parse(body)
  );
  assert.ok(examples.length);
  for (const example of examples) {
    assert.equal(typeof example.name, 'string');
    assert.ok(
      example.arguments &&
        typeof example.arguments === 'object' &&
        !Array.isArray(example.arguments)
    );
    const validate = schemas.get(example.name);
    assert.ok(validate, `unknown tool ${example.name}`);
    const result = validate(example.arguments);
    assert.equal(result.valid, true, result.errorMessage);
  }
});
