import assert from 'node:assert/strict';
import test from 'node:test';
import { createInvalidTokenGuard } from '../dist/invalid-token-guard.js';

function guard({ limit = 3, windowMs = 1_000, maxSources = 10 } = {}) {
  const clock = { now: 0 };
  const instance = createInvalidTokenGuard({
    limit: () => limit,
    windowMs,
    maxSources,
    now: () => clock.now,
  });
  return { clock, guard: instance };
}

function lookup(g, source, inactive) {
  const blocked = g.acquire(source);
  if (blocked === 0) g.settle(source, inactive);
  return blocked;
}

test('a source is refused once it reaches the limit, until its window ends', () => {
  const { clock, guard: g } = guard();
  assert.equal(lookup(g, 'a', true), 0);
  assert.equal(lookup(g, 'a', true), 0);
  clock.now = 200;
  assert.equal(lookup(g, 'a', true), 0);
  assert.equal(g.acquire('a'), 800);
  assert.equal(lookup(g, 'b', true), 0, 'other sources keep their budget');
  clock.now = 1_000;
  assert.equal(lookup(g, 'a', true), 0, 'a new window restores the budget');
});

test('active answers are never charged', () => {
  const { guard: g } = guard({ limit: 1 });
  for (let i = 0; i < 10; i += 1) assert.equal(lookup(g, 'a', false), 0);
});

test('in-flight lookups hold slots, so a concurrent burst cannot pass the limit', () => {
  const { guard: g } = guard({ limit: 3 });
  assert.equal(g.acquire('a'), 0);
  assert.equal(g.acquire('a'), 0);
  assert.equal(g.acquire('a'), 0);
  assert.ok(g.acquire('a') > 0, 'the fourth concurrent lookup waits');
  g.settle('a', false);
  assert.equal(g.acquire('a'), 0, 'an active answer releases its slot');
});

test('answers spread across windows never block', () => {
  const { clock, guard: g } = guard({ limit: 2 });
  for (let at = 0; at < 10_000; at += 1_000) {
    clock.now = at;
    assert.equal(lookup(g, 'a', true), 0);
  }
});

test('a zero limit turns the guard off', () => {
  const { guard: g } = guard({ limit: 0 });
  for (let i = 0; i < 100; i += 1) assert.equal(lookup(g, 'a', true), 0);
  assert.equal(g.size, 0);
});

test('a refused source that keeps calling is not evicted by newer sources', () => {
  const { guard: g } = guard({ limit: 1, maxSources: 2 });
  lookup(g, 'a', true);
  for (const source of ['b', 'c', 'd']) {
    lookup(g, source, true);
    assert.ok(g.acquire('a') > 0, `still refused after ${source}`);
  }
  assert.equal(g.size, 2);
});
