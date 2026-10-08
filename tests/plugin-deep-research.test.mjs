import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import { openaiPlugin } from './helpers/plugin-contract.mjs';
import { startStdioWithApi, toolText } from './helpers/exchange-mcp.mjs';

const name = 'firecrawl-deep-research';
const skill = readFileSync(
  join(openaiPlugin, 'skills', name, 'SKILL.md'),
  'utf8'
);

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

test('bounded PDF and extensionless document reads forward maxPages and preserve nested usage', async (t) => {
  const { api, client } = await startStdioWithApi(t, {
    largeResult: {
      success: true,
      data: { markdown: '# Partial document', metadata: { creditsUsed: 5 } },
    },
  });
  const examples = [...skill.matchAll(/```json\n([\s\S]*?)\n```/g)].map(
    ([, body]) => JSON.parse(body)
  );
  const reads = examples.filter(
    (example) => example.name === 'firecrawl_scrape'
  );
  assert.ok(
    reads.some((example) =>
      new URL(example.arguments.url).pathname.endsWith('.pdf')
    )
  );
  assert.ok(
    reads.some(
      (example) => !new URL(example.arguments.url).pathname.includes('.')
    )
  );
  for (const example of reads) {
    assert.deepEqual(example.arguments.parsers, ['pdf']);
    assert.equal(example.arguments.pdfOptions.maxPages, 5);
    const response = await client.request('tools/call', example);
    const result = toolText(response);
    assert.deepEqual(api.requests.at(-1).body.parsers, [
      { type: 'pdf', maxPages: 5 },
    ]);
    assert.equal(result.metadata.creditsUsed, 5);
    assert.equal(response.structuredContent.metadata.creditsUsed, 5);
  }
});
