import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const IMAGE_WORKFLOWS = [
  '.github/workflows/image.yml',
  '.github/workflows/image-staging.yml',
];

test('package publishing includes patched dependency inputs', async () => {
  const workflow = await readFile('.github/workflows/publish.yml', 'utf8');
  const pathsBlock = workflow.match(/    paths:\n((?:      - .+\n?)+)/)?.[1] ?? '';

  assert.match(pathsBlock, /^      - pnpm-workspace\.yaml$/m);
  assert.match(pathsBlock, /^      - patches\/\*\*$/m);
});

function extractJobBlocks(workflow) {
  const jobsStart = workflow.search(/^jobs:\s*$/m);
  assert.notEqual(jobsStart, -1, 'workflow must define jobs');

  const jobsText = workflow.slice(jobsStart);
  const jobHeader = /^  ([A-Za-z0-9_-]+):\s*$/gm;
  const matches = [...jobsText.matchAll(jobHeader)];
  assert.ok(matches.length > 0, 'workflow must define at least one job');

  return new Map(
    matches.map((match, index) => {
      const next = matches[index + 1]?.index ?? jobsText.length;
      return [match[1], jobsText.slice(match.index, next)];
    })
  );
}

function normalizeNeedName(need) {
  return need.trim().replace(/^['"]|['"]$/g, '');
}

function listNeeds(jobBlock) {
  const inlineNeeds = jobBlock.match(/^    needs:\s*(.+)\s*$/m);
  if (inlineNeeds) {
    return inlineNeeds[1]
      .replace(/[\[\]]/g, '')
      .split(',')
      .map(normalizeNeedName)
      .filter(Boolean);
  }

  const needsBlock = jobBlock.match(/^    needs:\s*\n((?:      - .+\n?)+)/m);
  if (!needsBlock) return [];
  return needsBlock[1]
    .split(/\r?\n/)
    .map((line) => line.match(/^      -\s+(.+)\s*$/)?.[1])
    .filter(Boolean)
    .map(normalizeNeedName);
}

function isImagePublishingJob(jobBlock) {
  return (
    /uses:\s*docker\/build-push-action@/m.test(jobBlock) &&
    /^\s+push:\s*true\s*$/m.test(jobBlock)
  );
}

function checksOutCurrentSha(jobBlock) {
  return (
    /uses:\s*actions\/checkout@v\d+/m.test(jobBlock) &&
    /ref:\s*\$\{\{\s*github\.sha\s*\}\}/m.test(jobBlock)
  );
}

function isSameShaNode22ReleaseVerifyJob(jobBlock) {
  return (
    checksOutCurrentSha(jobBlock) &&
    /uses:\s*pnpm\/action-setup@/m.test(jobBlock) &&
    /version:\s*10\.17\.1\s*$/m.test(jobBlock) &&
    /uses:\s*actions\/setup-node@/m.test(jobBlock) &&
    /node-version:\s*['"]?22\.x['"]?\s*$/m.test(jobBlock) &&
    /pnpm install --frozen-lockfile/.test(jobBlock) &&
    /pnpm run typecheck/.test(jobBlock) &&
    /pnpm run lint/.test(jobBlock) &&
    /pnpm run check:manifest/.test(jobBlock) &&
    /pnpm test/.test(jobBlock)
  );
}

test('image publishing jobs depend on same-SHA Node 22 release verification', async () => {
  for (const workflowPath of IMAGE_WORKFLOWS) {
    const workflow = await readFile(workflowPath, 'utf8');
    const jobs = extractJobBlocks(workflow);
    const verifyJobs = [...jobs.entries()]
      .filter(([, block]) => isSameShaNode22ReleaseVerifyJob(block))
      .map(([name]) => name);

    const publishingJobs = [...jobs.entries()].filter(([, block]) =>
      isImagePublishingJob(block)
    );
    assert.ok(
      publishingJobs.length > 0,
      `${workflowPath} should contain an image publishing job`
    );

    for (const [jobName, jobBlock] of publishingJobs) {
      const needs = listNeeds(jobBlock);
      assert.ok(
        verifyJobs.some((verifyJob) => needs.includes(verifyJob)),
        `${workflowPath} job ${jobName} must need a same-workflow verify job that checks out github.sha and runs Node 22/pnpm frozen gates`
      );
      assert.ok(
        checksOutCurrentSha(jobBlock),
        `${workflowPath} job ${jobName} must check out github.sha before publishing mutable tags`
      );
    }
  }
});


test('CI service-image smoke covers keyless and OAuth hosted endpoints', async () => {
  const workflow = await readFile('.github/workflows/ci.yml', 'utf8');
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
  const smokeScript = await readFile('scripts/docker-smoke.sh', 'utf8');

  assert.match(workflow, /docker-smoke:/);
  assert.match(workflow, /docker build -f Dockerfile\.service -t firecrawl-mcp-service:ci \./);
  assert.match(workflow, /bash scripts\/docker-smoke\.sh firecrawl-mcp-service:ci/);
  assert.equal(packageJson.scripts['test:docker-smoke'], 'bash scripts/docker-smoke.sh');

  assert.match(smokeScript, /docker build -f Dockerfile\.service/);
  assert.match(smokeScript, /docker run -d -P/);
  assert.match(smokeScript, /FASTMCP_ENDPOINT=\/v2\/mcp-oauth/);
  assert.match(smokeScript, /\/ready/);
  assert.match(smokeScript, /oauth-protected-resource\/v2\/mcp-oauth/);
  assert.match(smokeScript, /resource_metadata="https:\/\/mcp\.firecrawl\.dev\/\.well-known\/oauth-protected-resource\/v2\/mcp-oauth"/);
  assert.match(smokeScript, /test "\$oauth_status" = "401"/);
  assert.match(smokeScript, /\/fc-smoke-key\/v2\/mcp/);
  assert.match(smokeScript, /\/fc-smoke-key\/mcp/);
  assert.match(smokeScript, /firecrawl_scrape/);
  assert.match(smokeScript, /firecrawl_search/);
  assert.match(smokeScript, /firecrawl_parse/);
  assert.match(smokeScript, /KEYLESS_TOOL_NOT_AVAILABLE/);
  assert.match(smokeScript, /firecrawl_map/);
  assert.match(smokeScript, /firecrawl_monitor_get/);
  assert.match(smokeScript, /firecrawl_research_read_paper/);
});
