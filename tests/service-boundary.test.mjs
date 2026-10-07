// src/service/ holds deployment-specific modules attached through the core's
// hooks. The dependency is one way: the core never imports them, and only the
// CLI entry point wires them in.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const SRC = new URL('../src/', import.meta.url);

async function sourceFiles(dir = SRC, prefix = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(
        ...(await sourceFiles(new URL(`${entry.name}/`, dir), relative))
      );
    } else if (entry.name.endsWith('.ts')) {
      files.push(relative);
    }
  }
  return files;
}

function importSpecifiers(source) {
  return [
    ...source.matchAll(/\b(?:from|import|require)\s*\(?\s*['"]([^'"]+)['"]/g),
  ].map(([, specifier]) => specifier);
}

test('only the CLI entry point imports src/service', async () => {
  const offenders = [];
  for (const file of await sourceFiles()) {
    if (file.startsWith('service/') || file === 'index.ts') continue;
    const source = await readFile(new URL(file, SRC), 'utf8');
    for (const specifier of importSpecifiers(source)) {
      if (!specifier.startsWith('.')) continue;
      const resolved = path.posix.normalize(
        path.posix.join(path.posix.dirname(file), specifier)
      );
      if (resolved === 'service' || resolved.startsWith('service/')) {
        offenders.push(`${file} -> ${specifier}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test('src/service reaches fastmcp only through the core', async () => {
  const offenders = [];
  for (const file of await sourceFiles()) {
    if (!file.startsWith('service/')) continue;
    const source = await readFile(new URL(file, SRC), 'utf8');
    if (
      importSpecifiers(source).some(
        (specifier) =>
          specifier === 'fastmcp' || specifier.startsWith('fastmcp/')
      )
    ) {
      offenders.push(file);
    }
  }
  assert.deepEqual(offenders, []);
});

test('src/service reaches the core only through its library entry point', async () => {
  const offenders = [];
  for (const file of await sourceFiles()) {
    if (!file.startsWith('service/')) continue;
    const source = await readFile(new URL(file, SRC), 'utf8');
    for (const specifier of importSpecifiers(source)) {
      if (!specifier.startsWith('.')) continue;
      const resolved = path.posix.normalize(
        path.posix.join(path.posix.dirname(file), specifier)
      );
      if (resolved !== 'server.js' && !resolved.startsWith('service/')) {
        offenders.push(`${file} -> ${specifier}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});
