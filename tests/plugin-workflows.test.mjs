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
    installed.filter((name) => name !== 'firecrawl-deep-research'),
    [...outcomes, 'firecrawl'].sort()
  );
  const manifest = JSON.parse(
    readFileSync(join(openaiPlugin, '.codex-plugin/plugin.json'), 'utf8')
  );
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

test('each adapter preserves MCP access, pricing and provider contract safeguards', () => {
  assertNoSymlinks(skills);
  for (const name of outcomes) {
    const text = readSkill(name);
    const files = instructionFiles(join(skills, name));
    const instructions = files
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n')
      .replace(/\s+/g, ' ');
    for (const file of files) {
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
    for (const requirement of [
      /host's tool search/,
      /credit ceiling|Bound .{0,180}credits/,
      /URL scraping is billed per URL/,
      /Provider-only discovery is free/,
      /execution uses the selected capability[’']s price/,
      /response\.key/,
      /requiresOneOf/,
      /price and external effects/,
      /every item in `data.alexandria`/,
      /payload-bound/,
      /identical ID and payload/,
      /changed inputs need a new ID/,
      /catalogue `nextTool` pages contracts, not records/,
      /connected account on an enabled team/,
      /Terms require an organization admin outside this workflow/,
      /do not accept terms through a capability/,
      /unknown freshness/,
      /live search\/page retrieval for missing or freshness-critical facts/,
      /retention may expire or be unavailable/,
      /not silently rerun paid work/,
    ]) {
      assert.match(instructions, requirement, `${name}: ${requirement}`);
    }
    if (text.includes('`firecrawl_interact`')) {
      for (const requirement of [
        /`url`/,
        /`scrapeId`/,
        /`timeout` (uses|is in) seconds|`timeout` for interaction is in seconds/i,
        /`scrapeOptions`.*(?:only.*`url`|valid.*`url`)/,
        /firecrawl_interact_stop/,
      ]) {
        assert.match(instructions, requirement, `${name}: ${requirement}`);
      }
    }
    const namedSearchTools = [
      [
        'firecrawl_search',
        /Web(?: and (?:developer|paper))? searches are billed per request/,
      ],
      [
        'firecrawl_developer_search',
        /developer searches are billed per request/,
      ],
      [
        'firecrawl_research_search_papers',
        /paper searches are billed per request/,
      ],
    ];
    for (const [tool, billing] of namedSearchTools) {
      if (text.includes(`\`${tool}\``))
        assert.match(instructions, billing, name);
    }
  }
});

test('terms recovery waits for admin confirmation and preserves payload-bound replay', () => {
  for (const name of outcomes) {
    const text = readSkill(name).replace(/\s+/g, ' ');
    assert.match(text, /Do not retry unresolved restrictions/, name);
    assert.match(
      text,
      /After an organization admin confirms acceptance, resume the requested retrieval with the identical payload and `requestId`, only if access and budget still permit/,
      name
    );
    assert.doesNotMatch(text, /or retry these restrictions/, name);
  }
});

test('live observation and paper workflows do not require provider discovery', () => {
  for (const name of [
    'firecrawl-qa',
    'firecrawl-design',
    'firecrawl-demo-walkthrough',
    'firecrawl-research-papers',
  ]) {
    const text = readSkill(name).replace(/\s+/g, ' ');
    assert.match(
      text,
      /not a gate before live QA|not a mandatory hop|not a prerequisite|not insert a compulsory catalogue hop/,
      name
    );
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
