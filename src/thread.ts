import { randomUUID } from 'node:crypto';
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
 * The identifier is minted here, at random, and never derived from anything
 * the client sent: it says "these calls belong together" and nothing else.
 * `FIRECRAWL_NO_THREAD_ID` turns the whole mechanism off (no argument on any
 * tool, no header, nothing added to results).
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

export type ResolvedThread = {
  /** The thread ID every outbound request of this call carries. */
  threadId: string;
  /** True when no usable `threadId` came in and this call minted one. */
  minted: boolean;
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
    return { threadId: newThreadId(), minted: true, args };
  }
  const { [THREAD_ID_ARG]: provided, ...rest } = args as Record<
    string,
    unknown
  >;
  if (isValidThreadId(provided)) {
    return { threadId: provided, minted: false, args: rest };
  }
  return { threadId: newThreadId(), minted: true, args: rest };
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
