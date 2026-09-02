import assert from 'node:assert/strict';
import test from 'node:test';

import { searchHttpOptions } from '../src/search-http-options.ts';

test('search transport outlives the requested API timeout', () => {
  assert.deepEqual(searchHttpOptions(300_000), { timeoutMs: 305_000 });
});

test('search transport keeps the SDK default when no API timeout is requested', () => {
  assert.deepEqual(searchHttpOptions(), {});
});
