import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import {
  snapshotProviders,
  writeLogoSnapshot,
} from '../scripts/logo-snapshot.mjs';

test('malformed logo snapshots do not break fallback and writes preserve the last valid snapshot on failure', async (t) => {
  for (const value of [{}, { providers: null }, { providers: [] }, null])
    assert.deepEqual(snapshotProviders(value), {});
  const previous = {
    'allbirds-com': {
      src: 'data:image/png;base64,eA==',
      website: 'https://allbirds.com/',
    },
  };
  assert.equal(snapshotProviders({ providers: previous }), previous);
  const root = await mkdtemp(join(tmpdir(), 'firecrawl-logo-write-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const output = pathToFileURL(join(root, 'logos.json'));
  await writeLogoSnapshot(output, { providers: previous });
  const before = await readFile(output, 'utf8');
  const circular = {};
  circular.self = circular;
  await assert.rejects(writeLogoSnapshot(output, circular), /circular/i);
  assert.equal(await readFile(output, 'utf8'), before);
  assert.deepEqual(await readdir(root), ['logos.json']);
  await writeLogoSnapshot(output, { providers: {} });
  assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), {
    providers: {},
  });
});

test('provider logos accept embedded ICO artwork and reject malformed external inputs', async () => {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL('../web/provider-logo.ts', import.meta.url))],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
  });
  const { providerLogoSrc } = await import(
    'data:text/javascript;base64,' +
      Buffer.from(bundle.outputFiles[0].text).toString('base64')
  );
  for (const mime of [
    'image/x-icon',
    'image/vnd.microsoft.icon',
    'image/png',
  ]) {
    const src = 'data:' + mime + ';base64,eA==';
    assert.equal(
      providerLogoSrc({ id: 'new-provider', logoDataUri: src }),
      src
    );
  }
  for (const src of [
    'https://provider.example/logo.png',
    'data:text/html;base64,eA==',
    'data:image/png;base64,<script>',
  ])
    assert.equal(
      providerLogoSrc({ id: 'new-provider', logoDataUri: src }),
      undefined
    );
});
