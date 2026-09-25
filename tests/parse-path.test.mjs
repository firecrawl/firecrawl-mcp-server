import assert from 'node:assert/strict';
import { mkdir, mkdtemp, symlink, writeFile, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseRootFromEnv, resolveParseFile } from '../dist/parse-path.js';

test('the parse root is the working directory unless FIRECRAWL_PARSE_ROOT is set', () => {
  assert.equal(parseRootFromEnv({}, '/work'), '/work');
  assert.equal(
    parseRootFromEnv({ FIRECRAWL_PARSE_ROOT: '   ' }, '/work'),
    '/work'
  );
  assert.equal(
    parseRootFromEnv({ FIRECRAWL_PARSE_ROOT: '  /data/docs  ' }, '/work'),
    '/data/docs'
  );
});

test('a file inside the root resolves, including an absolute path', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'parse-root-'));
  const file = path.join(root, 'note.pdf');
  await writeFile(file, 'pdf');
  const rootReal = await realpath(root);

  assert.equal(
    await resolveParseFile('note.pdf', root),
    path.join(rootReal, 'note.pdf')
  );
  assert.equal(
    await resolveParseFile(file, root),
    path.join(rootReal, 'note.pdf')
  );
});

test('a file whose name starts with two dots stays inside the root', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'parse-root-'));
  await writeFile(path.join(root, '..note.pdf'), 'pdf');
  const rootReal = await realpath(root);
  assert.equal(
    await resolveParseFile('..note.pdf', root),
    path.join(rootReal, '..note.pdf')
  );
});

test('a missing file is rejected', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'parse-root-'));
  await assert.rejects(
    resolveParseFile('missing.pdf', root),
    /Cannot read file: missing\.pdf/
  );
});

test('a path outside the root is rejected', async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'parse-parent-'));
  const root = path.join(parent, 'root');
  const outside = path.join(parent, 'secret.txt');
  await mkdir(root);
  await writeFile(outside, 'nope');

  await assert.rejects(
    resolveParseFile(outside, root),
    /filePath is outside the parse root/
  );
  await assert.rejects(
    resolveParseFile('../secret.txt', root),
    /filePath is outside the parse root/
  );
});

test('a symlink inside the root that points outside is rejected', async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'parse-parent-'));
  const root = path.join(parent, 'root');
  const outside = path.join(parent, 'secret.txt');
  await mkdir(root);
  await writeFile(outside, 'nope');
  await symlink(outside, path.join(root, 'link.pdf'));

  await assert.rejects(
    resolveParseFile('link.pdf', root),
    /filePath is outside the parse root/
  );
});

test('a missing parse root is rejected', async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'parse-parent-'));
  const missing = path.join(parent, 'gone');
  await assert.rejects(
    resolveParseFile('note.pdf', missing),
    /Parse root does not exist/
  );
});
