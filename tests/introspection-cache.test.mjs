import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createIntrospectionCache,
  INTROSPECTION_ACTIVE_TTL_MS,
  INTROSPECTION_INACTIVE_TTL_MS,
  introspectionTtlMs,
} from '../dist/introspection-cache.js';

function fakeClock(start = 1_000_000) {
  let now = start;
  return {
    now: () => now,
    advance: (ms) => {
      now += ms;
    },
  };
}

function countingLoader(value) {
  const loader = async () => {
    loader.calls += 1;
    return typeof value === 'function' ? value(loader.calls) : value;
  };
  loader.calls = 0;
  return loader;
}

test('a cached answer is reused until its TTL passes', async () => {
  const clock = fakeClock();
  const cache = createIntrospectionCache({
    maxEntries: 10,
    now: clock.now,
    ttlMs: () => 1_000,
  });
  const load = countingLoader({ active: true });

  await cache.get(['fco_a', 'r'], load);
  clock.advance(999);
  await cache.get(['fco_a', 'r'], load);
  assert.equal(load.calls, 1);

  clock.advance(1);
  await cache.get(['fco_a', 'r'], load);
  assert.equal(load.calls, 2);
});

test('token and resource both key the cache', async () => {
  const cache = createIntrospectionCache({
    maxEntries: 10,
    ttlMs: () => 60_000,
  });
  const load = countingLoader({ active: true });

  await cache.get(['fco_a', 'resource-1'], load);
  await cache.get(['fco_a', 'resource-2'], load);
  await cache.get(['fco_b', 'resource-1'], load);
  assert.equal(load.calls, 3);
});

test('a failed lookup is not cached', async () => {
  const cache = createIntrospectionCache({
    maxEntries: 10,
    ttlMs: () => 60_000,
  });
  const load = countingLoader((call) => {
    if (call === 1) throw new Error('upstream 403');
    return { active: true };
  });

  await assert.rejects(cache.get(['fco_a', 'r'], load), /upstream 403/);
  assert.deepEqual(await cache.get(['fco_a', 'r'], load), { active: true });
  assert.equal(load.calls, 2);
  assert.equal(cache.size, 1);
});

test('concurrent lookups for one key share a single upstream call', async () => {
  const cache = createIntrospectionCache({
    maxEntries: 10,
    ttlMs: () => 60_000,
  });
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const load = async () => {
    calls += 1;
    await gate;
    return { active: true };
  };

  const results = Promise.all([
    cache.get(['fco_a', 'r'], load),
    cache.get(['fco_a', 'r'], load),
    cache.get(['fco_a', 'r'], load),
  ]);
  release();
  assert.equal((await results).length, 3);
  assert.equal(calls, 1);
});

test('concurrent lookups share a failure, and the next lookup retries', async () => {
  const cache = createIntrospectionCache({
    maxEntries: 10,
    ttlMs: () => 60_000,
  });
  const load = countingLoader((call) => {
    if (call === 1) throw new Error('upstream 429');
    return { active: true };
  });

  const settled = await Promise.allSettled([
    cache.get(['fco_a', 'r'], load),
    cache.get(['fco_a', 'r'], load),
  ]);
  assert.deepEqual(
    settled.map((r) => r.status),
    ['rejected', 'rejected']
  );
  await cache.get(['fco_a', 'r'], load);
  assert.equal(load.calls, 2);
});

test('a zero TTL disables storage', async () => {
  const cache = createIntrospectionCache({ maxEntries: 10, ttlMs: () => 0 });
  const load = countingLoader({ active: true });

  await cache.get(['fco_a', 'r'], load);
  await cache.get(['fco_a', 'r'], load);
  assert.equal(load.calls, 2);
  assert.equal(cache.size, 0);
});

test('the oldest entry is evicted past maxEntries', async () => {
  const cache = createIntrospectionCache({
    maxEntries: 2,
    ttlMs: () => 60_000,
  });
  const load = countingLoader({ active: true });

  await cache.get(['fco_1', 'r'], load);
  await cache.get(['fco_2', 'r'], load);
  await cache.get(['fco_3', 'r'], load);
  assert.equal(cache.size, 2);

  await cache.get(['fco_1', 'r'], load);
  assert.equal(load.calls, 4, 'the evicted key is fetched again');
});

test('TTL: active answers are capped by the token exp', () => {
  const now = 1_000_000;
  assert.equal(
    introspectionTtlMs({ active: true }, now),
    INTROSPECTION_ACTIVE_TTL_MS
  );
  assert.equal(
    introspectionTtlMs({ active: true, exp: (now + 5_000) / 1000 }, now),
    5_000
  );
  assert.equal(
    introspectionTtlMs({ active: true, exp: (now + 3_600_000) / 1000 }, now),
    INTROSPECTION_ACTIVE_TTL_MS
  );
  assert.ok(
    introspectionTtlMs({ active: true, exp: (now - 1_000) / 1000 }, now) <= 0
  );
});

test('TTL: inactive answers use the short TTL', () => {
  assert.equal(
    introspectionTtlMs({ active: false }, 0),
    INTROSPECTION_INACTIVE_TTL_MS
  );
  assert.ok(INTROSPECTION_INACTIVE_TTL_MS < INTROSPECTION_ACTIVE_TTL_MS);
});
