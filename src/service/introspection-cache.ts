import { createHash } from 'node:crypto';

type Entry<T> = { expiresAt: number; value: T };

export type IntrospectionCacheOptions<T> = {
  /** How long a result may be reused, in ms. 0 or less means do not cache. */
  ttlMs: (value: T, now: number) => number;
  maxEntries: number;
  now?: () => number;
};

/**
 * Process-local cache for token introspection answers. Concurrent lookups for
 * the same key share one upstream call. A failed lookup is never cached, so an
 * upstream outage clears as soon as the upstream recovers.
 *
 * Keys are SHA-256 digests, so raw tokens are never held as map keys.
 */
export function createIntrospectionCache<T>(
  options: IntrospectionCacheOptions<T>
) {
  const now = options.now ?? Date.now;
  const entries = new Map<string, Entry<T>>();
  const inflight = new Map<string, Promise<T>>();

  function store(key: string, value: T): void {
    const at = now();
    const ttl = options.ttlMs(value, at);
    if (!(ttl > 0)) return;
    entries.delete(key);
    entries.set(key, { expiresAt: at + ttl, value });
    // Map iteration is insertion order, and hits re-insert, so the first key is
    // the least recently used.
    while (entries.size > options.maxEntries) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }
  }

  return {
    async get(parts: readonly string[], load: () => Promise<T>): Promise<T> {
      const key = createHash('sha256').update(parts.join('\0')).digest('hex');
      const hit = entries.get(key);
      if (hit) {
        entries.delete(key);
        if (hit.expiresAt > now()) {
          entries.set(key, hit);
          return hit.value;
        }
      }
      const pending = inflight.get(key);
      if (pending) return pending;

      const request = load().then(
        (value) => {
          inflight.delete(key);
          store(key, value);
          return value;
        },
        (error: unknown) => {
          inflight.delete(key);
          throw error;
        }
      );
      inflight.set(key, request);
      return request;
    },
    clear(): void {
      entries.clear();
    },
    get size(): number {
      return entries.size;
    },
  };
}

export const INTROSPECTION_ACTIVE_TTL_MS = 60_000;
export const INTROSPECTION_INACTIVE_TTL_MS = 10_000;

/**
 * Active answers live for up to a minute and never past the token's own `exp`.
 * Inactive answers live briefly, so a token that was just issued is not
 * rejected for long. That minute is also the longest a revoked token keeps
 * working on a pod that cached it.
 */
export function introspectionTtlMs(
  value: { active?: boolean; exp?: unknown },
  now: number,
  activeTtlMs = INTROSPECTION_ACTIVE_TTL_MS,
  inactiveTtlMs = INTROSPECTION_INACTIVE_TTL_MS
): number {
  if (!value.active) return inactiveTtlMs;
  if (value.exp === undefined) return activeTtlMs;
  // A malformed exp cannot bound the reuse, so the answer is not cached.
  if (typeof value.exp !== 'number' || !Number.isFinite(value.exp)) return 0;
  return Math.min(activeTtlMs, value.exp * 1000 - now);
}
