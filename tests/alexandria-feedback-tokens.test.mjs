import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FEEDBACK_TOKEN_LIMIT,
  FEEDBACK_TOKEN_TTL_MS,
  FeedbackTokenRegistry,
  FeedbackTokenStore,
  withFeedbackRefs,
} from '../dist/alexandria-feedback-tokens.js';

test('a repeated token keeps its ref and is stored once', () => {
  const store = new FeedbackTokenStore();
  assert.equal(store.add('a'), 'c1');
  assert.equal(store.add('b'), 'c2');
  assert.equal(store.add('a'), 'c1');
  assert.deepEqual(store.tokens(), ['a', 'b']);
});

test('the store keeps the newest tokens up to the limit and never reuses a ref', () => {
  const store = new FeedbackTokenStore();
  for (let i = 0; i < FEEDBACK_TOKEN_LIMIT + 3; i += 1) store.add(`t${i}`);
  assert.equal(store.size, FEEDBACK_TOKEN_LIMIT);
  assert.equal(store.tokens()[0], 't3');
  assert.equal(store.tokenForRef('c1'), undefined);
  assert.equal(store.tokenForRef('c4'), 't3');
  store.remove(store.tokens());
  assert.equal(store.add('fresh'), `c${FEEDBACK_TOKEN_LIMIT + 4}`);
});

test('tokens expire after 24 hours', () => {
  let now = 1_000;
  const store = new FeedbackTokenStore(() => now);
  store.add('old');
  now += FEEDBACK_TOKEN_TTL_MS - 1;
  store.add('new');
  assert.deepEqual(store.tokens(), ['old', 'new']);
  now += 2;
  assert.deepEqual(store.tokens(), ['new']);
  assert.equal(store.tokenForRef('c1'), undefined);
});

test('sessions and credentials get separate stores', () => {
  const registry = new FeedbackTokenRegistry();
  const first = registry.forSession('s1', 'fc-a');
  assert.equal(registry.forSession('s1', 'fc-b'), first);
  assert.notEqual(registry.forSession('s2', 'fc-a'), first);
  const keyed = registry.forSession(undefined, 'fc-a');
  assert.equal(registry.forSession(undefined, 'fc-a'), keyed);
  assert.notEqual(registry.forSession(undefined, 'fc-b'), keyed);
});

test('withFeedbackRefs swaps provider tokens for refs and drops internal ones', () => {
  const store = new FeedbackTokenStore();
  const body = {
    success: true,
    data: {
      alexandria: [
        { provider: 'fred', capability: 'x', feedbackToken: 'tok-1', data: {} },
        { provider: 'fred', capability: 'y', feedbackToken: 'tok-2', error: { code: 'boom' } },
        { provider: 'firecrawl', capability: 'find-tools', feedbackToken: 'tok-3', data: {} },
        { provider: 'fred', capability: 'z', data: {} },
      ],
    },
  };
  const out = withFeedbackRefs(body, store);
  assert.deepEqual(
    out.data.alexandria.map((item) => [item.feedbackRef, item.feedbackToken]),
    [['c1', undefined], ['c2', undefined], [undefined, undefined], [undefined, undefined]]
  );
  assert.deepEqual(store.tokens(), ['tok-1', 'tok-2']);
  assert.equal(body.data.alexandria[0].feedbackToken, 'tok-1');
});

test('withFeedbackRefs handles a flat single-call response', () => {
  const store = new FeedbackTokenStore();
  const out = withFeedbackRefs({ success: true, provider: 'fred', capability: 'x', feedbackToken: 'tok-1' }, store);
  assert.equal(out.feedbackRef, 'c1');
  assert.equal(out.feedbackToken, undefined);
});
