import assert from 'node:assert/strict';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import { instructionFiles, openaiPlugin } from './helpers/plugin-contract.mjs';
import { startStdioWithApi } from './helpers/exchange-mcp.mjs';

const outcomes = [
  'firecrawl-competitive-intel',
  'firecrawl-dashboards',
  'firecrawl-demo-walkthrough',
  'firecrawl-design',
  'firecrawl-directories',
  'firecrawl-knowledge-base',
  'firecrawl-knowledge-ingest',
  'firecrawl-lead-gen',
  'firecrawl-lead-research',
  'firecrawl-market-research',
  'firecrawl-qa',
  'firecrawl-research-papers',
  'firecrawl-seo-audit',
  'firecrawl-shop',
];
const skills = join(openaiPlugin, 'skills');
const readSkill = (name) =>
  readFileSync(join(skills, name, 'SKILL.md'), 'utf8');

function assertNoSymlinks(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stat = lstatSync(path);
    assert.equal(stat.isSymbolicLink(), false, path);
    if (stat.isDirectory()) assertNoSymlinks(path);
  }
}

function toolExamples(text, name) {
  return [...text.matchAll(/```json\n([\s\S]*?)\n```/g)].map(([, body]) => {
    const example = JSON.parse(body);
    assert.ok(
      example && typeof example.name === 'string' && example.name.length,
      `${name}: tool name required`
    );
    assert.ok(
      example.arguments &&
        typeof example.arguments === 'object' &&
        !Array.isArray(example.arguments),
      `${name}: tool arguments object required`
    );
    return example;
  });
}

test('OpenAI required outcome inventory retains the router and validates installed identities', () => {
  const installed = readdirSync(skills).sort();
  assert.deepEqual(
    installed,
    [...outcomes, 'firecrawl', 'firecrawl-deep-research', 'get-started'].sort()
  );
  const manifest = JSON.parse(
    readFileSync(join(openaiPlugin, '.codex-plugin/plugin.json'), 'utf8')
  );
  assert.ok(typeof manifest.name === 'string' && manifest.name.trim());
  const descriptions = new Set();
  for (const name of installed) {
    assert.equal(lstatSync(join(skills, name)).isSymbolicLink(), false);
    assert.ok(`${manifest.name}:${name}`.length <= 64, name);
    const text = readSkill(name);
    const frontmatter = text.match(/^---\n([\s\S]*?)\n---\n/);
    assert.ok(frontmatter, `${name} needs YAML frontmatter`);
    assert.equal(frontmatter[1].match(/^name: (.+)$/m)?.[1], name);
    const description = frontmatter[1].match(/^description: (.+)$/m)?.[1];
    assert.ok(description && description.length <= 1024, name);
    assert.doesNotMatch(
      description,
      /: |\s#/,
      `${name}: description must be a YAML-safe scalar`
    );
    assert.equal(
      descriptions.has(description),
      false,
      `${name}: duplicate trigger`
    );
    descriptions.add(description);
  }
});

test('outcome adapters remain native MCP instructions without shell artifact assumptions', () => {
  assertNoSymlinks(skills);
  for (const name of outcomes) {
    for (const file of instructionFiles(join(skills, name))) {
      assert.doesNotMatch(
        readFileSync(file, 'utf8'),
        /Bash\(|allowed-tools:|FIRECRAWL_API_KEY|\.firecrawl\/|npx firecrawl|firecrawl (?:search|scrape|browser|login|crawl|map)\b|\b(?:curl|wget)\s/,
        file
      );
    }
  }
});

test('router selects all outcome adapters without another workflow router', () => {
  const router = readSkill('firecrawl');
  for (const name of outcomes) assert.ok(router.includes(`\`${name}\``), name);
  assert.doesNotMatch(router, /`firecrawl-workflows`/);
});

test('all adapters document a tool example accepted by the actual MCP input schema', async (t) => {
  const { client } = await startStdioWithApi(t);
  const { tools } = await client.request('tools/list', {});
  const validator = new AjvJsonSchemaValidator();
  const schemas = new Map(
    tools.map((tool) => [tool.name, validator.getValidator(tool.inputSchema)])
  );
  for (const name of outcomes) {
    const examples = toolExamples(readSkill(name), name);
    assert.ok(examples.length, `${name}: no tool-call example`);
    for (const example of examples) {
      const validate = schemas.get(example.name);
      assert.ok(validate, `${name}: unknown tool ${example.name}`);
      const result = validate(example.arguments);
      assert.equal(result.valid, true, `${name}: ${result.errorMessage}`);
      if (example.name === 'firecrawl_search' && example.arguments.objective) {
        const marker = `[${name.replace(/^firecrawl-/, '')}]`;
        assert.ok(example.arguments.objective.startsWith(marker), name);
        assert.ok(!example.arguments.query.includes(marker), name);
      }
    }
  }
});

test('malformed tool-call examples cannot be silently skipped', () => {
  for (const example of [
    { arguments: {} },
    { name: 'firecrawl_search' },
    { name: 'firecrawl_search', arguments: null },
    { name: 'firecrawl_search', arguments: [] },
  ]) {
    assert.throws(
      () =>
        toolExamples(
          `\`\`\`json\n${JSON.stringify(example)}\n\`\`\``,
          'fixture'
        ),
      /required/
    );
  }
});
