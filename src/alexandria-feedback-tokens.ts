import { createHash } from 'node:crypto';

export const FEEDBACK_TOKEN_LIMIT = 20;
export const FEEDBACK_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const SESSION_LIMIT = 1000;

type Entry = { token: string; at: number };

/** Feedback tokens of one client session, sent with its overall Alexandria rating. */
export class FeedbackTokenStore {
  #entries: Entry[] = [];

  constructor(private readonly now: () => number = Date.now) {}

  #prune(): void {
    const cutoff = this.now() - FEEDBACK_TOKEN_TTL_MS;
    this.#entries = this.#entries.filter((entry) => entry.at > cutoff);
  }

  /** Stores a token once; a token seen before is not added again. */
  add(token: string): void {
    this.#prune();
    if (this.#entries.some((entry) => entry.token === token)) return;
    this.#entries.push({ token, at: this.now() });
    if (this.#entries.length > FEEDBACK_TOKEN_LIMIT) this.#entries.shift();
  }

  /** Tokens still valid, oldest first. */
  tokens(): string[] {
    this.#prune();
    return this.#entries.map((entry) => entry.token);
  }

  remove(tokens: Iterable<string>): void {
    const sent = new Set(tokens);
    this.#entries = this.#entries.filter((entry) => !sent.has(entry.token));
  }

  get size(): number {
    return this.#entries.length;
  }
}

/**
 * Stores keyed by client session. Streamable HTTP is stateless, so state lives
 * here rather than on the per-call session copy; the oldest sessions are
 * evicted once the registry is full.
 */
export class FeedbackTokenRegistry {
  #stores = new Map<string, FeedbackTokenStore>();

  constructor(private readonly now: () => number = Date.now) {}

  /**
   * Scoped to the caller's credential, and to the Mcp-Session-Id when the client
   * sent one, so a session id reused under another credential never shares tokens.
   */
  forSession(sessionId: unknown, credential: string | undefined): FeedbackTokenStore {
    const owner = createHash('sha256').update(credential ?? '').digest('hex');
    const key = typeof sessionId === 'string' && sessionId !== '' ? `${owner}:${sessionId}` : owner;
    const existing = this.#stores.get(key);
    const store = existing ?? new FeedbackTokenStore(this.now);
    this.#stores.delete(key);
    this.#stores.set(key, store);
    if (this.#stores.size > SESSION_LIMIT) {
      this.#stores.delete(this.#stores.keys().next().value as string);
    }
    return store;
  }
}

type Node = Record<string, unknown>;

const isNode = (value: unknown): value is Node =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Matches a short ref the Firecrawl API issued and resolves itself. */
export const API_FEEDBACK_REF = /^a[A-Za-z0-9_-]{10}$/;

function swapToken(node: unknown, store: FeedbackTokenStore): unknown {
  if (!isNode(node) || typeof node.feedbackToken !== 'string') return node;
  const { feedbackToken, feedbackRef, ...rest } = node;
  if (rest.provider === 'firecrawl') return rest;
  store.add(feedbackToken);
  const apiRef = typeof feedbackRef === 'string' && API_FEEDBACK_REF.test(feedbackRef) ? feedbackRef : undefined;
  return { ...rest, feedbackRef: apiRef ?? feedbackToken };
}

/**
 * Shows each call result's ref as `feedbackRef` and keeps its token in the session
 * store. The ref is the API's short ref when it issued one, else the signed token;
 * both resolve on any instance. Tokens on Firecrawl-internal calls are dropped.
 */
export function withFeedbackRefs<T>(body: T, store: FeedbackTokenStore): T {
  const top = swapToken(body, store);
  if (!isNode(top) || !isNode(top.data)) return top as T;
  const data = swapToken(top.data, store) as Node;
  const results = Array.isArray(data.alexandria) ? data.alexandria.map((item) => swapToken(item, store)) : undefined;
  return { ...top, data: results ? { ...data, alexandria: results } : data } as T;
}
