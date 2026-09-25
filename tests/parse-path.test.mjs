import assert from 'node:assert/strict';
import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseRootFromEnv, resolveParseFile } from '../dist/parse-path.js';

async function tempDir(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'parse-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

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

test('a file inside the root resolves, including an absolute path', async (t) => {
  const root = await tempDir(t);
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

test('a file whose name starts with two dots stays inside the root', async (t) => {
  const root = await tempDir(t);
  await writeFile(path.join(root, '..note.pdf'), 'pdf');
  const rootReal = await realpath(root);
  assert.equal(
    await resolveParseFile('..note.pdf', root),
    path.join(rootReal, '..note.pdf')
  );
});

test('a missing file is rejected', async (t) => {
  const root = await tempDir(t);
  await assert.rejects(
    resolveParseFile('missing.pdf', root),
    /Cannot read file: missing\.pdf/
  );
});

test('a sibling directory that shares a path prefix is rejected', async (t) => {
  const parent = await tempDir(t);
  const root = path.join(parent, 'data');
  const sibling = path.join(parent, 'database', 'secret.txt');
  await mkdir(root);
  await mkdir(path.dirname(sibling), { recursive: true });
  await writeFile(sibling, 'nope');

  await assert.rejects(resolveParseFile(sibling, root), /Cannot read file:/);
});

test('a symlink inside the root that points at another file inside the root is allowed', async (t) => {
  const root = await tempDir(t);
  const file = path.join(root, 'note.pdf');
  await writeFile(file, 'pdf');
  await symlink(file, path.join(root, 'alias.pdf'));
  const rootReal = await realpath(root);

  assert.equal(
    await resolveParseFile('alias.pdf', root),
    path.join(rootReal, 'note.pdf')
  );
});

test('a directory inside the root is rejected', async (t) => {
  const root = await tempDir(t);
  await mkdir(path.join(root, 'docs'));

  await assert.rejects(resolveParseFile('docs', root), /Not a file: docs/);
});

test('a symlinked directory inside the root that points outside is rejected', async (t) => {
  const parent = await tempDir(t);
  const root = path.join(parent, 'root');
  const outside = path.join(parent, 'outside');
  await mkdir(root);
  await mkdir(outside);
  await writeFile(path.join(outside, 'secret.pdf'), 'nope');
  await symlink(outside, path.join(root, 'sub'));

  await assert.rejects(
    resolveParseFile(path.join('sub', 'secret.pdf'), root),
    /Cannot read file:/
  );
});

test('a path outside the root is rejected', async (t) => {
  const parent = await tempDir(t);
  const root = path.join(parent, 'root');
  const outside = path.join(parent, 'secret.txt');
  await mkdir(root);
  await writeFile(outside, 'nope');

  await assert.rejects(resolveParseFile(outside, root), /Cannot read file:/);
  await assert.rejects(
    resolveParseFile('../secret.txt', root),
    /Cannot read file:/
  );
  await assert.rejects(
    resolveParseFile('missing.pdf', root),
    /Cannot read file: missing\.pdf/
  );
});

test('a symlink inside the root that points outside is rejected', async (t) => {
  const parent = await tempDir(t);
  const root = path.join(parent, 'root');
  const outside = path.join(parent, 'secret.txt');
  await mkdir(root);
  await writeFile(outside, 'nope');
  await symlink(outside, path.join(root, 'link.pdf'));

  await assert.rejects(
    resolveParseFile('link.pdf', root),
    /Cannot read file:/
  );
});

test('a missing parse root is rejected', async (t) => {
  const parent = await tempDir(t);
  const missing = path.join(parent, 'gone');
  await assert.rejects(
    resolveParseFile('note.pdf', missing),
    /Parse root does not exist/
  );
});
