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
  'firecrawl-deep-research',
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

test('OpenAI outcome inventory retains the router and has valid distinct identities', () => {
  assert.deepEqual(
    readdirSync(skills).sort(),
    [...outcomes, 'firecrawl'].sort()
  );
  const manifest = JSON.parse(
    readFileSync(join(openaiPlugin, '.codex-plugin/plugin.json'), 'utf8')
  );
  const descriptions = new Set();
  for (const name of ['firecrawl', ...outcomes]) {
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

test('adapters are MCP-only, self-contained, and share the bounded runtime contract', () => {
  assertNoSymlinks(skills);
  let runtime;
  for (const name of outcomes) {
    const text = readSkill(name);
    assert.match(text, /\[.*?\]\(references\/mcp-runtime\.md\)/, name);
    const reference = readFileSync(
      join(skills, name, 'references/mcp-runtime.md'),
      'utf8'
    );
    if (runtime) assert.equal(reference, runtime, `${name}: protocol drift`);
    runtime = reference;
    for (const file of instructionFiles(join(skills, name))) {
      assert.equal(lstatSync(file).isSymbolicLink(), false, file);
      assert.doesNotMatch(
        readFileSync(file, 'utf8'),
        /Bash\(|allowed-tools:|FIRECRAWL_API_KEY|\.firecrawl\/|npx firecrawl|firecrawl (?:search|scrape|browser|login|crawl|map)\b|\b(?:curl|wget)\s/,
        file
      );
    }
    assert.match(
      text,
      /Alexandria/,
      `${name}: missing workflow-specific routing`
    );
  }
  for (const requirement of [
    /response\.key/,
    /requiresOneOf/,
    /price and external effects/,
    /every item/,
    /payload-bound/,
    /unknown freshness/,
    /expire/,
    /terms/,
    /opt-outs/,
    /search profile/,
    /Keyless/,
    /Inline|inline/,
    /Web, developer and paper searches are\s+billed per request/,
  ]) {
    assert.match(runtime, requirement);
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

test('workflow policies retain different evidence and fallback requirements', () => {
  const requirements = {
    'firecrawl-directories': [
      /directory/i,
      /filters/i,
      /deduplic/i,
      /profile/i,
    ],
    'firecrawl-dashboards': [
      /date.range|period/i,
      /unit/i,
      /chart/i,
      /session|profile/i,
    ],
    'firecrawl-deep-research': [
      /contrarian/i,
      /open questions/i,
      /paper|literature/i,
      /central claims have adequate evidence/i,
    ],
    'firecrawl-demo-walkthrough': [/flow/i, /friction/i, /observ/i, /live/i],
    'firecrawl-design': [
      /DESIGN\.md/,
      /images/,
      /inferred/i,
      /rights/i,
      /faithful|complete/i,
    ],
    'firecrawl-competitive-intel': [
      /baseline|previous/i,
      /pricing/i,
      /changelog/i,
      /schedule|recurr/i,
    ],
    'firecrawl-knowledge-base': [
      /chunk/i,
      /canonical/i,
      /authoritative/i,
      /crawl/i,
    ],
    'firecrawl-knowledge-ingest': [
      /access|authorized/i,
      /session|profile/i,
      /article bodies/i,
      /covered sections/i,
      /firecrawl_map` as a navigation supplement only if exposed/,
      /When mapping is unavailable/,
    ],
    'firecrawl-lead-gen': [
      /qualif/i,
      /deduplic/i,
      /source/i,
      /unknown|missing|blank/i,
      /company domain only for company-level grouping, never to collapse distinct contacts/,
    ],
    'firecrawl-lead-research': [
      /meeting|brief/i,
      /person/i,
      /company/i,
      /fresh|current/i,
    ],
    'firecrawl-market-research': [
      /market/i,
      /as.of|period/i,
      /estimate|inferen/i,
      /primary|filings/i,
    ],
    'firecrawl-qa': [/reproduc/i, /severity/i, /performance/i, /live/i],
    'firecrawl-research-papers': [
      /firecrawl_research_search_papers/,
      /firecrawl_research_read_paper/,
      /abstract/i,
      /full.text/i,
    ],
    'firecrawl-seo-audit': [
      /SERP|search/i,
      /metadata|title/i,
      /crawl/i,
      /Core Web Vitals/i,
    ],
    'firecrawl-shop': [
      /price/i,
      /availability|stock/i,
      /purchase|checkout/i,
      /fresh|current/i,
    ],
  };
  for (const [name, patterns] of Object.entries(requirements)) {
    for (const pattern of patterns)
      assert.match(readSkill(name), pattern, `${name}: ${pattern}`);
  }
});
