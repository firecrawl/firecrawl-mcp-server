import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FEEDBACK_TOKEN_LIMIT,
  FEEDBACK_TOKEN_TTL_MS,
  FeedbackTokenRegistry,
  FeedbackTokenStore,
  localFeedbackRef,
  withFeedbackRefs,
} from '../dist/alexandria-feedback-tokens.js';

test('the retention contract is 20 tokens for 24 hours', () => {
  assert.equal(FEEDBACK_TOKEN_LIMIT, 20);
  assert.equal(FEEDBACK_TOKEN_TTL_MS, 24 * 60 * 60 * 1000);
});

test('a repeated token is stored once', () => {
  const store = new FeedbackTokenStore();
  store.add('a');
  store.add('b');
  store.add('a');
  assert.deepEqual(store.tokens(), ['a', 'b']);
});

test('the store keeps the newest tokens up to the limit', () => {
  const store = new FeedbackTokenStore();
  for (let i = 0; i < 23; i += 1) store.add(`t${i}`);
  assert.equal(store.size, 20);
  assert.equal(store.tokens()[0], 't3');
  store.remove(store.tokens());
  assert.equal(store.size, 0);
});

test('tokens expire after 24 hours', () => {
  let now = 1_000;
  const store = new FeedbackTokenStore(() => now);
  store.add('old');
  now += 24 * 60 * 60 * 1000 - 1;
  store.add('new');
  assert.deepEqual(store.tokens(), ['old', 'new']);
  now += 2;
  assert.deepEqual(store.tokens(), ['new']);
});

test('sessions and credentials get separate stores', () => {
  const registry = new FeedbackTokenRegistry();
  const first = registry.forSession('s1', 'fc-a');
  assert.equal(registry.forSession('s1', 'fc-a'), first);
  assert.notEqual(registry.forSession('s1', 'fc-b'), first);
  assert.notEqual(registry.forSession('s2', 'fc-a'), first);
  const keyed = registry.forSession(undefined, 'fc-a');
  assert.equal(registry.forSession(undefined, 'fc-a'), keyed);
  assert.notEqual(registry.forSession(undefined, 'fc-b'), keyed);
});

test('withFeedbackRefs shows provider tokens as refs and drops internal ones', () => {
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
    [[localFeedbackRef('tok-1'), undefined], [localFeedbackRef('tok-2'), undefined], [undefined, undefined], [undefined, undefined]]
  );
  assert.deepEqual(store.tokens(), ['tok-1', 'tok-2']);
  assert.equal(body.data.alexandria[0].feedbackToken, 'tok-1');
});

test('withFeedbackRefs handles a flat single-call response', () => {
  const store = new FeedbackTokenStore();
  const out = withFeedbackRefs({ success: true, provider: 'fred', capability: 'x', feedbackToken: 'tok-1' }, store);
  assert.equal(out.feedbackRef, localFeedbackRef('tok-1'));
  assert.equal(out.feedbackToken, undefined);
});

test('withFeedbackRefs shows the short ref the API issued and keeps the token', () => {
  const store = new FeedbackTokenStore();
  const out = withFeedbackRefs(
    {
      success: true,
      data: {
        alexandria: [
          { provider: 'fred', capability: 'x', feedbackToken: 'tok-1', feedbackRef: 'aAbCdE12345' },
          { provider: 'fred', capability: 'y', feedbackToken: 'tok-2', feedbackRef: 'not-an-api-ref' },
        ],
      },
    },
    store
  );
  assert.deepEqual(out.data.alexandria.map((item) => item.feedbackRef), ['aAbCdE12345', localFeedbackRef('tok-2')]);
  assert.deepEqual(store.tokens(), ['tok-1', 'tok-2']);
});
