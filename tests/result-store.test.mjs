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

test('budget matrix bounds serialized MCP envelopes across tokenizers and adversarial text', async () => {
  const { getEncoding } = await import('js-tiktoken');
  const alternate = getEncoding('o200k_base');
  const samples = [
    '東京 中文 العربية 😀 🔥 ',
    '\\path\\file "quote"\n\t',
    '<|endoftext|> <|fim_prefix|>',
    '0123456789abcdef-_=+{}[]',
    'one long natural-language description with links https://example.com/a/b?c=d&x=y ',
  ];
  for (const maxOutputTokens of [512, 1000, 4000, 16000]) {
    for (const sample of samples) {
      const store = new ResultStore();
      const text = JSON.stringify({ 'a/b': { '~key': sample.repeat(2500) } });
      const raw = await store.bound(text, 'owner', maxOutputTokens);
      const frame = JSON.stringify({
        content: [{ type: 'text', text: raw }],
        isError: false,
      });
      assert.ok(tokenCount(frame) <= maxOutputTokens);
      assert.ok(alternate.encode(frame, [], []).length <= maxOutputTokens);
      const first = JSON.parse(raw);
      if (first.resultId) {
        const selected = store.read('owner', {
          resultId: first.resultId,
          path: '/a~1b/~0key',
          maxOutputTokens,
        });
        const selectedFrame = JSON.stringify({
          content: [{ type: 'text', text: selected }],
          isError: false,
        });
        assert.ok(tokenCount(selectedFrame) <= maxOutputTokens);
        assert.ok(
          alternate.encode(selectedFrame, [], []).length <= maxOutputTokens
        );
      }
    }
  }
});

test('capacity eviction, failed file writes and concurrent owners fail safely', async () => {
  const store = new ResultStore(25000);
  const first = JSON.parse(
    await store.bound('first '.repeat(2500), 'one', 512)
  );
  const second = JSON.parse(
    await store.bound('second '.repeat(2500), 'two', 512)
  );
  assert.throws(
    () => store.read('one', { resultId: first.resultId }),
    /unavailable/
  );
  assert.ok(store.read('two', { resultId: second.resultId }));
  const failedFile = JSON.parse(
    await store.bound(
      'third '.repeat(2500),
      'three',
      512,
      '/dev/null/not-a-directory'
    )
  );
  assert.match(failedFile.fileWarning, /failed/);
  assert.ok(store.read('three', { resultId: failedFile.resultId }));
  const shared = new ResultStore();
  const responses = await Promise.all(
    Array.from({ length: 8 }, (_, id) =>
      shared.bound(
        JSON.stringify({ id, text: 'body '.repeat(1000) }),
        String(id),
        512
      )
    )
  );
  responses.forEach((response, id) => {
    const result = JSON.parse(response);
    assert.equal(
      JSON.parse(
        JSON.parse(
          shared.read(String(id), { resultId: result.resultId, path: '/id' })
        ).content
      ),
      id
    );
    assert.throws(
      () => shared.read(String(id + 1), { resultId: result.resultId }),
      /unavailable/
    );
  });
});
