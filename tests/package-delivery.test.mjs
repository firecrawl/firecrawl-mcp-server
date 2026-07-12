import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('published package bundles the patched FastMCP runtime', async () => {
  const tsupConfig = await readFile('tsup.config.ts', 'utf8');
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
  const noticeGenerator = await readFile(
    'scripts/generate-third-party-notices.mjs',
    'utf8'
  );
  const thirdPartyNotices = await readFile('THIRD_PARTY_NOTICES.md', 'utf8');
  const publishWorkflow = await readFile(
    '.github/workflows/publish.yml',
    'utf8'
  );

  assert.match(tsupConfig, /noExternal:\s*\['fastmcp'\]/);
  assert.match(tsupConfig, /metafile:\s*true/);
  assert.equal(
    packageJson.scripts['test:packed'],
    'npm run build && npm run check:third-party-notices && node scripts/verify-packed-package.mjs'
  );
  assert.equal(packageJson.dependencies.fastmcp, undefined);
  assert.equal(packageJson.devDependencies.fastmcp, '4.3.2');
  assert.equal(packageJson.dependencies.undici, '7.28.0');
  assert.equal(packageJson.dependencies.zod, '4.4.3');
  assert.ok(packageJson.files.includes('THIRD_PARTY_NOTICES.md'));
  assert.equal(
    packageJson.scripts['check:third-party-notices'],
    'node scripts/generate-third-party-notices.mjs --check'
  );
  assert.match(noticeGenerator, /dist\/metafile-esm\.json/);
  assert.match(noticeGenerator, /LICENSE, NOTICE, or README license section/);
  assert.doesNotMatch(thirdPartyNotices, /\r/);
  assert.doesNotMatch(thirdPartyNotices, /[\t ]+$/m);
  assert.match(publishWorkflow, /pnpm run test:packed/);
  assert.match(publishWorkflow, /pnpm run check:third-party-notices/);
  assert.match(publishWorkflow, /scripts\/generate-third-party-notices\.mjs/);
  assert.match(publishWorkflow, /THIRD_PARTY_NOTICES\.md/);
  assert.match(publishWorkflow, /tsup\.config\.ts/);
});
