import assert from 'node:assert/strict';
import test from 'node:test';
import {
  THREAD_ID_HEADER,
  isThreadIdEnabled,
  isValidThreadId,
  takeThreadId,
  threadIdFields,
  threadIdHeaders,
  toolTracksThread,
  withThreadId,
} from '../dist/thread.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const THREAD = '11111111-2222-4333-8444-555555555555';

test('a first call mints a thread ID and later calls keep the one they were given', () => {
  const first = takeThreadId({ url: 'https://example.com/' });
  assert.equal(first.minted, true);
  assert.match(first.threadId, UUID_PATTERN);
  assert.deepEqual(first.args, { url: 'https://example.com/' });

  const second = takeThreadId({ threadId: THREAD, url: 'https://example.com/' });
  assert.equal(second.minted, false);
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
