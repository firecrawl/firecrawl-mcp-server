import assert from 'node:assert/strict';
import test from 'node:test';
import { queryEmbedRetryDelayMs, QUERY_EMBED_RETRY_CAP_MS } from '../dist/server.js';

test('query embed retry waits for Retry-After and caps the wait at about 3s', () => {
  assert.equal(queryEmbedRetryDelayMs('0'), 0);
  assert.equal(queryEmbedRetryDelayMs('1'), 1000);
  assert.equal(queryEmbedRetryDelayMs('10'), QUERY_EMBED_RETRY_CAP_MS);
  assert.equal(queryEmbedRetryDelayMs(undefined), 1000);
  const now = Date.parse('2026-11-02T00:00:00.000Z');
  assert.equal(queryEmbedRetryDelayMs(new Date(now + 2000).toUTCString(), now), 2000);
  assert.equal(queryEmbedRetryDelayMs(new Date(now + 10_000).toUTCString(), now), QUERY_EMBED_RETRY_CAP_MS);
  assert.equal(queryEmbedRetryDelayMs(new Date(now - 1000).toUTCString(), now), 0);
  assert.equal(queryEmbedRetryDelayMs('9'.repeat(400)), QUERY_EMBED_RETRY_CAP_MS);
});
