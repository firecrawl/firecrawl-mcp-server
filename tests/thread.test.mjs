import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_THREAD_IDLE_MS,
  THREAD_ID_HEADER,
  ThreadRegistry,
  isThreadIdEnabled,
  isValidThreadId,
  takeThreadId,
  threadIdFields,
  threadIdHeaders,
  threadIdleMs,
  threadScopeKey,
  toolTracksThread,
  withThreadId,
} from '../dist/thread.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const THREAD = '11111111-2222-4333-8444-555555555555';

test('a first call mints a thread ID and later calls keep the one they were given', () => {
  const first = takeThreadId({ url: 'https://example.com/' });
  assert.equal(first.minted, true);
  assert.equal(first.source, 'minted');
  assert.match(first.threadId, UUID_PATTERN);
  assert.deepEqual(first.args, { url: 'https://example.com/' });

  const second = takeThreadId({ threadId: THREAD, url: 'https://example.com/' });
  assert.equal(second.minted, false);
  assert.equal(second.source, 'argument');
  assert.equal(second.threadId, THREAD);
  // The argument never travels on to an API body.
  assert.deepEqual(second.args, { url: 'https://example.com/' });
});

test('only a UUID is accepted as an incoming thread ID', () => {
  assert.equal(isValidThreadId(THREAD), true);
  assert.equal(isValidThreadId(THREAD.toUpperCase()), true);
  for (const bad of [
    'conversation-42',
    '',
    42,
    null,
    undefined,
    `${THREAD}\r\nX-Injected: 1`,
    '11111111-2222-0333-8444-555555555555', // version nibble 0
    '11111111-2222-4333-0444-555555555555', // variant nibble 0
  ]) {
    assert.equal(isValidThreadId(bad), false, String(bad));
  }
  // A malformed value that slipped past the schema is replaced, not forwarded.
  const replaced = takeThreadId({ threadId: 'conversation-42', q: 'x' });
  assert.equal(replaced.minted, true);
  assert.match(replaced.threadId, UUID_PATTERN);
  assert.deepEqual(replaced.args, { q: 'x' });
});

test('non-object arguments still get a thread ID and pass through untouched', () => {
  for (const args of [undefined, null, 'text', ['a']]) {
    const resolved = takeThreadId(args);
    assert.equal(resolved.minted, true);
    assert.match(resolved.threadId, UUID_PATTERN);
    assert.equal(resolved.args, args);
  }
});

test('the header carries the thread ID and is empty without one', () => {
  assert.equal(THREAD_ID_HEADER, 'X-Firecrawl-Thread-Id');
  assert.deepEqual(threadIdHeaders(THREAD), { 'X-Firecrawl-Thread-Id': THREAD });
  assert.deepEqual(threadIdHeaders(undefined), {});
  assert.deepEqual(threadIdHeaders(''), {});
});

test('a JSON object result gets threadId first; other shapes are left alone', () => {
  const doc = JSON.stringify({ markdown: '# Hi', metadata: { scrapeId: 'x' } });
  const stamped = withThreadId(doc, THREAD);
  assert.deepEqual(JSON.parse(stamped), {
    threadId: THREAD,
    markdown: '# Hi',
    metadata: { scrapeId: 'x' },
  });
  assert.equal(Object.keys(JSON.parse(stamped))[0], 'threadId');
  // Pretty-printed like every other tool result.
  assert.equal(stamped, JSON.stringify(JSON.parse(stamped), null, 2));

  // An upstream threadId is replaced by the one this call actually used.
  assert.equal(
    JSON.parse(withThreadId(JSON.stringify({ threadId: 'other', a: 1 }), THREAD))
      .threadId,
    THREAD
  );

  for (const untouched of [
    '[1, 2]',
    'null',
    '## [id] plain markdown result',
    '{not json',
    '',
    { content: [{ type: 'text', text: '{}' }] },
    undefined,
  ]) {
    assert.equal(withThreadId(untouched, THREAD), untouched);
  }
});

test('a tool is tracked exactly when its schema declares threadId', async () => {
  const { z } = await import('zod');
  assert.equal(toolTracksThread(z.object({ url: z.string() })), false);
  assert.equal(
    toolTracksThread(z.object({ url: z.string(), ...threadIdFields({}) })),
    true
  );
  // Refined objects keep their shape in Zod 4, so the opt-in survives .refine.
  assert.equal(
    toolTracksThread(
      z
        .object({ url: z.string(), ...threadIdFields({}) })
        .refine(() => true)
    ),
    true
  );
  assert.equal(toolTracksThread(undefined), false);
  assert.equal(toolTracksThread(z.string()), false);
});

test('the schema field is optional, UUID-only, and absent when disabled', async () => {
  const { z } = await import('zod');
  const enabled = z.object({ ...threadIdFields({}) });
  assert.equal(enabled.safeParse({}).success, true);
  assert.equal(enabled.safeParse({ threadId: THREAD }).success, true);
  const rejected = enabled.safeParse({ threadId: 'conversation-42' });
  assert.equal(rejected.success, false);
  assert.match(
    rejected.error.issues[0].message,
    /threadId must be the UUID returned by an earlier Firecrawl tool result/
  );

  for (const value of ['1', 'true', 'YES', ' on ']) {
    assert.deepEqual(threadIdFields({ FIRECRAWL_NO_THREAD_ID: value }), {});
    assert.equal(isThreadIdEnabled({ FIRECRAWL_NO_THREAD_ID: value }), false);
  }
  for (const value of [undefined, '', 'false', '0', 'off']) {
    assert.equal(isThreadIdEnabled({ FIRECRAWL_NO_THREAD_ID: value }), true);
  }
});

const OTHER = '22222222-3333-4444-8555-666666666666';

test('a call without a threadId continues the caller\'s recent thread', () => {
  let now = 1_000_000;
  const registry = new ThreadRegistry({ idleMs: 60_000, now: () => now });

  const first = registry.resolve('caller-a', takeThreadId({ q: 'one' }));
  assert.equal(first.source, 'minted');
  assert.match(first.threadId, UUID_PATTERN);

  // Parallel or forgetful follow-ups join the same thread instead of minting.
  now += 5_000;
  const second = registry.resolve('caller-a', takeThreadId({ q: 'two' }));
  assert.equal(second.source, 'recent');
  assert.equal(second.minted, false);
  assert.equal(second.threadId, first.threadId);
  assert.deepEqual(second.args, { q: 'two' });

  // A different caller never sees another caller's thread.
  const other = registry.resolve('caller-b', takeThreadId({ q: 'three' }));
  assert.equal(other.source, 'minted');
  assert.notEqual(other.threadId, first.threadId);

  // Past the idle window the caller starts a new thread.
  now += 60_001;
  const later = registry.resolve('caller-a', takeThreadId({ q: 'four' }));
  assert.equal(later.source, 'minted');
  assert.notEqual(later.threadId, first.threadId);
});

test('an explicit threadId always wins and becomes the caller\'s recent thread', () => {
  const registry = new ThreadRegistry({ idleMs: 60_000, now: () => 1 });
  registry.resolve('caller-a', takeThreadId({ q: 'one' }));

  const explicit = registry.resolve(
    'caller-a',
    takeThreadId({ threadId: THREAD, q: 'two' })
  );
  assert.equal(explicit.source, 'argument');
  assert.equal(explicit.threadId, THREAD);

  // The next call without an ID continues the explicit thread, not the old one.
  const follow = registry.resolve('caller-a', takeThreadId({ q: 'three' }));
  assert.equal(follow.source, 'recent');
  assert.equal(follow.threadId, THREAD);

  // Two conversations on one caller stay apart as long as each names itself.
  const another = registry.resolve(
    'caller-a',
    takeThreadId({ threadId: OTHER, q: 'four' })
  );
  assert.equal(another.threadId, OTHER);
  assert.equal(
    registry.resolve('caller-a', takeThreadId({ threadId: THREAD, q: 'five' }))
      .threadId,
    THREAD
  );
});

test('recall can be switched off and the registry stays bounded', () => {
  const off = new ThreadRegistry({ idleMs: 0 });
  const a = off.resolve('caller-a', takeThreadId({}));
  const b = off.resolve('caller-a', takeThreadId({}));
  assert.equal(a.source, 'minted');
  assert.equal(b.source, 'minted');
  assert.notEqual(a.threadId, b.threadId);
  assert.equal(off.size, 0);

  const bounded = new ThreadRegistry({ idleMs: 60_000, maxEntries: 2, now: () => 1 });
  const one = bounded.resolve('c1', takeThreadId({}));
  bounded.resolve('c2', takeThreadId({}));
  bounded.resolve('c3', takeThreadId({}));
  assert.equal(bounded.size, 2);
  // c1 was the least recently seen, so it is gone and mints again.
  assert.notEqual(bounded.resolve('c1', takeThreadId({})).threadId, one.threadId);
});

test('the idle window comes from FIRECRAWL_THREAD_IDLE_SECONDS with a safe default', () => {
  assert.equal(threadIdleMs({}), DEFAULT_THREAD_IDLE_MS);
  assert.equal(DEFAULT_THREAD_IDLE_MS, 10 * 60 * 1000);
  assert.equal(threadIdleMs({ FIRECRAWL_THREAD_IDLE_SECONDS: '90' }), 90_000);
  assert.equal(threadIdleMs({ FIRECRAWL_THREAD_IDLE_SECONDS: '0' }), 0);
  for (const bad of ['-5', 'soon', 'NaN', 'Infinity']) {
    assert.equal(
      threadIdleMs({ FIRECRAWL_THREAD_IDLE_SECONDS: bad }),
      DEFAULT_THREAD_IDLE_MS,
      bad
    );
  }
});

test('the scope key separates callers and never contains the credential', () => {
  const base = { apiKeyId: '42', clientUserAgent: 'cursor/1.0' };
  const key = threadScopeKey(base, 'cursor');
  assert.match(key, /^[0-9a-f]{64}$/);
  assert.equal(threadScopeKey({ ...base }, 'cursor'), key);
  assert.notEqual(threadScopeKey(base, 'claude-code'), key);
  assert.notEqual(threadScopeKey({ ...base, apiKeyId: '43' }, 'cursor'), key);
  assert.notEqual(
    threadScopeKey({ ...base, clientUserAgent: 'cursor/2.0' }, 'cursor'),
    key
  );

  // A raw API key is hashed into the identity, never present in the key.
  const raw = threadScopeKey({ firecrawlApiKey: 'fc-secret-value' }, 'x');
  assert.equal(raw.includes('fc-secret'), false);
  assert.notEqual(raw, threadScopeKey({ firecrawlApiKey: 'fc-other' }, 'x'));

  // Keyless callers are told apart by IP; nothing at all still gets a key.
  assert.notEqual(
    threadScopeKey({ keylessClientIp: '8.8.8.1' }, 'x'),
    threadScopeKey({ keylessClientIp: '8.8.8.2' }, 'x')
  );
  assert.match(threadScopeKey(undefined, undefined), /^[0-9a-f]{64}$/);
});
