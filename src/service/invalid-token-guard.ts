type Window = { startedAt: number; inactive: number; pending: number; blockedUntil: number };

export type InvalidTokenGuardOptions = {
  /** Inactive introspection answers one source may cause per window. 0 or less turns the guard off. */
  limit: () => number;
  windowMs: number;
  maxSources: number;
  now?: () => number;
};

/** Requests without a single trusted client IP share this bucket, so dropping the IP cannot dodge the limit. */
export const UNATTRIBUTED_SOURCE = 'unattributed';

/**
 * Per-source budget for inactive introspection answers. A source that keeps
 * presenting tokens the issuer does not recognise is refused locally until its
 * window ends, so it cannot spend the pod's share of the issuer's per-IP limit.
 * In-flight lookups hold a slot, so a concurrent burst cannot overshoot it.
 * Only uncached lookups consult it; cached answers are always served.
 */
export function createInvalidTokenGuard(options: InvalidTokenGuardOptions) {
  const now = options.now ?? Date.now;
  const sources = new Map<string, Window>();

  function touch(source: string, at: number): Window {
    let window = sources.get(source);
    sources.delete(source);
    if (
      window &&
      window.pending === 0 &&
      at - window.startedAt >= options.windowMs &&
      window.blockedUntil <= at
    ) {
      window = undefined;
    }
    window ??= { startedAt: at, inactive: 0, pending: 0, blockedUntil: 0 };
    if (at - window.startedAt >= options.windowMs && window.blockedUntil <= at) {
      window.startedAt = at;
      window.inactive = 0;
    }
    sources.set(source, window);
    while (sources.size > options.maxSources) {
      const oldest = sources.keys().next().value;
      if (oldest === undefined) break;
      sources.delete(oldest);
    }
    return window;
  }

  function block(window: Window, at: number, limit: number, source: string): void {
    window.blockedUntil = window.startedAt + options.windowMs;
    console.error(
      '[MCP_INVALID_TOKEN_GUARD]',
      JSON.stringify({
        event: 'block',
        limit,
        window_ms: options.windowMs,
        blocked_ms: window.blockedUntil - at,
        unattributed: source === UNATTRIBUTED_SOURCE,
      })
    );
  }

  return {
    /**
     * Reserves a lookup slot for the source. Returns 0 when the lookup may go
     * out, and the caller must then call `settle` once; otherwise returns the
     * milliseconds the source stays refused.
     */
    acquire(source: string): number {
      if (options.limit() <= 0) return 0;
      const at = now();
      const window = touch(source, at);
      if (window.blockedUntil > at) return window.blockedUntil - at;
      if (window.inactive + window.pending >= options.limit()) {
        return Math.max(1, window.startedAt + options.windowMs - at);
      }
      window.pending += 1;
      return 0;
    },
    /** Releases a slot from `acquire`; an inactive answer is charged to the source. */
    settle(source: string, inactive: boolean): void {
      const window = sources.get(source);
      if (window && window.pending > 0) window.pending -= 1;
      const limit = options.limit();
      if (!inactive || limit <= 0) return;
      const at = now();
      const current = touch(source, at);
      current.inactive += 1;
      if (current.inactive >= limit && current.blockedUntil <= at) {
        block(current, at, limit, source);
      }
    },
    clear(): void {
      sources.clear();
    },
    get size(): number {
      return sources.size;
    },
  };
}
