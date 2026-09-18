import assert from 'node:assert/strict';
import test from 'node:test';
import { ResultStore } from '../dist/result-store.js';
import { tokenCount } from '../dist/output-budget.js';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('large JSON is retained losslessly; Unicode chunks and their envelopes stay within budget', async () => {
  const store = new ResultStore();
  const original = JSON.stringify({
    records: Array.from({ length: 80 }, (_, i) => ({
      id: i,
      text: '東京 😀 \\" quote '.repeat(20),
    })),
    requestId: 'keep-me',
  });
  let raw = await store.bound(original, 'alice', 512);
  assert.ok(tokenCount(raw) <= 512);
  const first = JSON.parse(raw);
  assert.equal(first.truncated, true);
  let restored = first.preview;
  let next = { ...first.next.arguments, maxOutputTokens: 512 };
  while (next) {
    raw = store.read('alice', next);
    assert.ok(tokenCount(raw) <= 512);
    const page = JSON.parse(raw);
    assert.ok(page.content.length > 0);
    restored += page.content;
    next = page.next?.arguments;
  }
  assert.deepEqual(JSON.parse(restored), JSON.parse(original));
  assert.throws(
    () => store.read('bob', { resultId: first.resultId }),
    /unavailable/
  );
  const projected = JSON.parse(
    store.read('alice', {
      resultId: first.resultId,
      path: '/records/79',
      fields: ['id'],
    })
  );
  assert.deepEqual(JSON.parse(projected.content), { id: 79 });
  assert.throws(
    () => store.read('alice', { resultId: first.resultId, path: '/__proto__' }),
    /not found/
  );
});

test('expiry and eviction are explicit; small results are unchanged', async () => {
  const store = new ResultStore(50000, 15);
  assert.equal(await store.bound('{"ok":true}', 'a'), '{"ok":true}');
  const result = JSON.parse(await store.bound('abc '.repeat(5000), 'a', 512));
  await new Promise((r) => setTimeout(r, 20));
  assert.throws(
    () => store.read('a', { resultId: result.resultId }),
    /expired/
  );
  const tiny = new ResultStore(10);
  const unretained = JSON.parse(
    await tiny.bound('abc '.repeat(5000), 'a', 512)
  );
  assert.equal(unretained.resultId, undefined);
  assert.match(unretained.message, /capacity/);
});

test('local file offload preserves original output with private permissions', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'mcp-result-test-'));
  try {
    const original = JSON.stringify({ rows: 'hello '.repeat(9000) }, null, 2);
    const result = JSON.parse(
      await new ResultStore().bound(original, 'a', 512, directory)
    );
    assert.equal(await readFile(result.file, 'utf8'), original);
    assert.equal((await stat(result.file)).mode & 0o777, 0o600);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('explicit ZDR never retains or writes the full result', async () => {
  const store = new ResultStore();
  const result = JSON.parse(
    await store.bound(
      'sensitive data '.repeat(5000),
      'a',
      512,
      '/not-written',
      false
    )
  );
  assert.equal(result.resultId, undefined);
  assert.equal(result.file, undefined);
  assert.equal(result.next, undefined);
  assert.match(result.message, /Zero Data Retention/);
});
