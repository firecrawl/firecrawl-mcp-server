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
    /Web, developer and paper searches are billed per request/,
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

test('deep research starts from inferred depth without mandatory duration gating', () => {
  const scope = skill
    .split('## Scope and depth\n')[1]
    .split('## Collection budget and PDF reads\n')[0]
    .replace(/\s+/g, ' ');
  assert.match(scope, /Infer the topic, output format and depth/);
  assert.match(scope, /normal depth/);
  assert.match(scope, /thorough depth when requested/);
  assert.match(scope, /Show a short plan.*then start/);
  assert.match(
    scope,
    /Ask only when ambiguity in the topic or scope blocks useful research/
  );
  assert.doesNotMatch(
    scope,
    /How long.*(?:run|take)|ask.*before collection|few minutes|\d+(?:[–-]\d+)?\s*minutes/i
  );
});

test('deep research bounds PDF pages and reconciles reported spend without claiming unknown costs are zero', () => {
  for (const requirement of [
    /40-credit ceiling/,
    /8 total searches across web\/developer\/paper tools/,
    /8 URL reads/,
    /pdfOptions: \{maxPages: 5\}/,
    /extensionless or uncertain document URLs/,
    /pooled allowance of 10 parsed PDF pages/,
    /remaining allowance/,
    /If no page allowance remains, pause document parsing/,
    /truncated document as partial coverage/,
    /both the page pool and remaining credit budget/,
    /reread may charge the full requested pages again/,
    /distinct MCP call IDs, including child calls/,
    /one response representation/,
    /metadata\.creditsUsed/,
    /data\.metadata\.creditsUsed/,
    /aggregate once, not again with its item breakdown or included children/,
    /Include child receipts not already covered by an aggregate/,
    /update the job's total rather than add every poll/,
    /Do not add cumulative account-usage counters/,
    /Catalogue prices are not charges/,
    /Missing usage is unknown, not zero/,
    /reservations.*separate from observed spend/,
    /remaining headroom cannot be bounded, pause further paid collection/,
    /Missing usage prevents a guarantee of budget compliance/,
    /lower bound with unknown costs/,
  ])
    assert.match(instructions, requirement);
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
