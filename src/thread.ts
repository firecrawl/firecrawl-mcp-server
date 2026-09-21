import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';

/**
 * Thread correlation for MCP tool calls.
 *
 * One agent conversation usually makes several Firecrawl calls (a search, the
 * scrapes it leads to, a retry through a different tool when the first attempt
 * fails). The API sees each of those as an unrelated request: the hosted
 * server runs stateless HTTP, so there is no transport session to group them
 * by, and one MCP connection in an editor can serve many conversations at
 * once, so a per-connection identifier would group the wrong things.
 *
 * The thread ID solves this at the level the agent actually works at. The
 * first tracked tool call in a conversation gets a fresh UUID, which travels
 * to the API as the `X-Firecrawl-Thread-Id` header and comes back to the
 * agent as a top-level `threadId` on the tool result. The agent passes that
 * value as the `threadId` argument on its later calls, and every request in
 * the conversation carries the same header.
 *
 * When a call arrives without a `threadId`, the server does not always start
 * a new thread. It first looks for a thread it saw recently from the same
 * caller (credential, MCP client, User-Agent, keyless IP) and continues that
 * one. This covers agents that never echo the argument and the first turn of
 * a conversation, where several parallel calls would otherwise each mint
 * their own ID. An explicit `threadId` always wins over this inference, which
 * is what keeps two conversations on one editor connection apart when the
 * agent cooperates. The memory is per process and expires after an idle
 * window, so it is a best-effort join, never a source of truth.
 *
 * The identifier is minted here, at random, and never derived from anything
 * the client sent: it says "these calls belong together" and nothing else.
 * `FIRECRAWL_NO_THREAD_ID` turns the whole mechanism off (no argument on any
 * tool, no header, nothing added to results); `FIRECRAWL_THREAD_IDLE_SECONDS`
 * sets the recall window, and `0` disables recall while keeping explicit IDs.
 */

/** Outbound header carrying the thread ID to the Firecrawl API. */
export const THREAD_ID_HEADER = 'X-Firecrawl-Thread-Id';

/** The tool argument and result field the agent sees. */
export const THREAD_ID_ARG = 'threadId';

/** Environment variable that disables thread correlation when set to a truthy value. */
export const THREAD_ID_DISABLE_ENV = 'FIRECRAWL_NO_THREAD_ID';

const DISABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);

/**
 * RFC 9562 UUID (any version). Accepting only this shape means an agent can
 * never route arbitrary text into an outbound header or a server log line.
 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isThreadIdEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return !DISABLED_VALUES.has((env[THREAD_ID_DISABLE_ENV] ?? '').trim().toLowerCase());
}

export function isValidThreadId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/** Mint a fresh thread ID. */
export function newThreadId(): string {
  return randomUUID();
}

export const THREAD_ID_DESCRIPTION =
  'Thread ID from an earlier Firecrawl tool result in this conversation. Omit on the first call; the result returns one to pass on later calls.';

/**
 * The optional `threadId` argument, spread into a tool's parameter object.
 * Returns an empty object when thread correlation is disabled so the field
 * never appears in `tools/list`.
 */
export function threadIdFields(
  env: NodeJS.ProcessEnv = process.env
): { threadId?: z.ZodOptional<z.ZodString> } {
  if (!isThreadIdEnabled(env)) return {};
  return {
    threadId: z
      .string()
      .uuid(
        'threadId must be the UUID returned by an earlier Firecrawl tool result'
      )
      .optional()
      .describe(THREAD_ID_DESCRIPTION),
  };
}

/**
 * Whether a tool opted into thread correlation, which is exactly "its
 * parameter schema declares a `threadId` field". Works for plain and refined
 * Zod 4 objects; anything else (or a tool without parameters) is untracked.
 */
export function toolTracksThread(parameters: unknown): boolean {
  if (!parameters || typeof parameters !== 'object') return false;
  const shape = (parameters as { shape?: unknown }).shape;
  return Boolean(
    shape && typeof shape === 'object' && THREAD_ID_ARG in (shape as object)
  );
}

/** Where a call's thread ID came from. */
export type ThreadSource = 'argument' | 'recent' | 'minted';

export type ResolvedThread = {
  /** The thread ID every outbound request of this call carries. */
  threadId: string;
  /** True when no usable `threadId` came in and this call minted one. */
  minted: boolean;
  /** How the ID was chosen; `takeThreadId` alone never yields `recent`. */
  source: ThreadSource;
  /** The tool arguments with `threadId` removed, so it never reaches an API body. */
  args: unknown;
};

/**
 * Take `threadId` out of the validated tool arguments. A missing or malformed
 * value gets a fresh ID instead of an error: the schema already rejected
 * non-UUID strings before this point, so `minted` here is the first-call case.
 */
export function takeThreadId(args: unknown): ResolvedThread {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return { threadId: newThreadId(), minted: true, source: 'minted', args };
  }
  const { [THREAD_ID_ARG]: provided, ...rest } = args as Record<
    string,
    unknown
  >;
  if (isValidThreadId(provided)) {
    return { threadId: provided, minted: false, source: 'argument', args: rest };
  }
  return { threadId: newThreadId(), minted: true, source: 'minted', args: rest };
}

/** Environment variable holding the recall window in seconds; `0` disables recall. */
export const THREAD_IDLE_ENV = 'FIRECRAWL_THREAD_IDLE_SECONDS';
export const DEFAULT_THREAD_IDLE_MS = 10 * 60 * 1000;
/** Upper bound on remembered callers per process; the least recently seen goes first. */
export const THREAD_REGISTRY_MAX_ENTRIES = 10_000;

export function threadIdleMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = (env[THREAD_IDLE_ENV] ?? '').trim();
  if (raw === '') return DEFAULT_THREAD_IDLE_MS;
  const seconds = Number(raw);
  const ms = seconds * 1000;
  // A non-number, a negative, or a value large enough to overflow to
  // Infinity would all silently disable expiry; each falls back to the default.
  if (!Number.isFinite(ms) || ms < 0) return DEFAULT_THREAD_IDLE_MS;
  return Math.floor(ms);
}

/**
 * The caller a call is attributed to when it carries no `threadId`, as an
 * opaque hash: whichever account identity the session resolved (API key id,
 * OAuth user, team), else a digest of the credential it holds (`credential`,
 * supplied by the caller because managed OAuth keys are not readable here),
 * else the keyless client IP; plus the MCP client name and User-Agent so two
 * clients on one account stay apart. A session with none of those has no
 * caller to attribute to and gets no key: recalling a thread for it would
 * hand one caller's thread to another. Nothing in the key is reversible, and
 * it never leaves memory.
 */
export function threadScopeKey(
  session:
    | {
        apiKeyId?: string;
        userId?: string;
        teamId?: string;
        keylessClientIp?: string;
        clientUserAgent?: string;
      }
    | undefined,
  clientName: string | undefined,
  credential?: string
): string | undefined {
  const identity =
    session?.apiKeyId ??
    session?.userId ??
    session?.teamId ??
    (credential
      ? `credential:${credential}`
      : session?.keylessClientIp
        ? `ip:${session.keylessClientIp}`
        : undefined);
  if (!identity) return undefined;
  return createHash('sha256')
    .update(
      [
        identity,
        clientName ?? '',
        session?.clientUserAgent ?? '',
        session?.keylessClientIp ?? '',
      ].join('\n')
    )
    .digest('hex');
}

/**
 * Per-process memory of the thread each caller was last seen on. `resolve`
 * turns the outcome of `takeThreadId` into the thread the call actually uses:
 * an explicit ID is kept and remembered, a missing one continues the caller's
 * recent thread when there is one inside the idle window, and otherwise the
 * freshly minted ID is remembered for the calls that follow.
 */
export class ThreadRegistry {
  readonly #recent = new Map<string, { threadId: string; seenAt: number }>();
  readonly #idleMs: number;
  readonly #maxEntries: number;
  readonly #now: () => number;

  constructor(options: {
    idleMs?: number;
    maxEntries?: number;
    now?: () => number;
  } = {}) {
    this.#idleMs = options.idleMs ?? threadIdleMs();
    this.#maxEntries = options.maxEntries ?? THREAD_REGISTRY_MAX_ENTRIES;
    this.#now = options.now ?? Date.now;
  }

  get size(): number {
    return this.#recent.size;
  }

  resolve(
    scopeKey: string | undefined,
    thread: ResolvedThread
  ): ResolvedThread {
    // No caller identity, or recall switched off: explicit IDs still apply,
    // but nothing is remembered and nothing is recalled.
    if (scopeKey === undefined || this.#idleMs <= 0) return thread;
    const now = this.#now();
    if (thread.source === 'minted') {
      const recent = this.#recent.get(scopeKey);
      if (recent && now - recent.seenAt <= this.#idleMs) {
        this.#remember(scopeKey, recent.threadId, now);
        return {
          ...thread,
          threadId: recent.threadId,
          minted: false,
          source: 'recent',
        };
      }
    }
    this.#remember(scopeKey, thread.threadId, now);
    return thread;
  }

  #remember(scopeKey: string, threadId: string, seenAt: number): void {
    // Delete first so the entry moves to the end: Map keeps insertion order,
    // which makes the first key the least recently seen.
    this.#recent.delete(scopeKey);
    this.#recent.set(scopeKey, { threadId, seenAt });
    while (this.#recent.size > this.#maxEntries) {
      const oldest = this.#recent.keys().next().value;
      if (oldest === undefined) break;
      this.#recent.delete(oldest);
    }
  }
}

/** Header form of the thread ID, merged into every request the call makes. */
export function threadIdHeaders(
  threadId: string | undefined
): Record<string, string> {
  return threadId ? { [THREAD_ID_HEADER]: threadId } : {};
}

/**
 * Put the thread ID on a tool result so the agent can pass it back. Only a
 * JSON object result (what every tracked tool returns) is touched: the field
 * goes first so it survives client-side truncation of long documents. Any
 * other shape, including a JSON array or free text, is returned unchanged.
 */
export function withThreadId(result: unknown, threadId: string): unknown {
  if (typeof result !== 'string' || !result.trimStart().startsWith('{')) {
    return result;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(result);
  } catch {
    return result;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return result;
  }
  const rest = { ...(parsed as Record<string, unknown>) };
  delete rest[THREAD_ID_ARG];
  return JSON.stringify({ [THREAD_ID_ARG]: threadId, ...rest }, null, 2);
}
