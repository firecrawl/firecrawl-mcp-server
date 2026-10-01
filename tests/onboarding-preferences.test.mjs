import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
const { code } = await transform(
  await readFile(new URL('../web/preferences.ts', import.meta.url), 'utf8'),
  { loader: 'ts', format: 'esm' }
);
const { parsePreferences, preferenceStore } = await import(
  'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
);
const sources = [
  { id: 'allbirds-com', tools: null },
  { id: 'amazon-com', tools: ['products/offer'] },
];
test('completion and exact provider/tool preferences survive another store instance', () => {
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
  const first = preferenceStore(storage);
  assert.equal(first.read().completed, false);
  first.write({ version: 1, completed: true, sources });
  const second = preferenceStore(storage);
  assert.deepEqual(second.read(), { version: 1, completed: true, sources });
  assert.equal(second.persistent(), true);
  const external = second.read();
  external.sources.length = 0;
  assert.equal(second.read().sources.length, 2);
});
test('corrupt, future, duplicate or malformed stored preferences restart setup', () => {
  for (const value of [
    'bad',
    null,
    JSON.stringify({ version: 2, completed: true, sources }),
    JSON.stringify({
      version: 1,
      completed: true,
      sources: [sources[0], sources[0]],
    }),
    JSON.stringify({
      version: 1,
      completed: true,
      sources: [{ id: 'amazon-com', tools: [] }],
    }),
    JSON.stringify({
      version: 1,
      completed: true,
      sources: [{ id: 'amazon-com', tools: [null] }],
    }),
  ]) {
    assert.deepEqual(parsePreferences(value), {
      version: 1,
      completed: false,
      sources: [],
    });
  }
});
test('blocked reads or writes keep session preferences without claiming persistence', () => {
  for (const storage of [
    undefined,
    {
      getItem() {
        throw Error('opaque origin');
      },
      setItem() {},
    },
    {
      getItem() {
        return null;
      },
      setItem() {
        throw Error('quota');
      },
    },
  ]) {
    const store = preferenceStore(storage);
    store.write({ version: 1, completed: true, sources });
    assert.equal(store.persistent(), false);
    assert.deepEqual(store.read().sources, sources);
  }
});
test('storage losing write access preserves a current draft and reports the failure', () => {
  let blocked = false;
  const store = preferenceStore({
    getItem: () => null,
    setItem() {
      if (blocked) throw Error('full');
    },
  });
  assert.equal(store.persistent(), true);
  blocked = true;
  store.write({ version: 1, completed: true, sources });
  assert.equal(store.persistent(), false);
  assert.equal(store.read().completed, true);
});
