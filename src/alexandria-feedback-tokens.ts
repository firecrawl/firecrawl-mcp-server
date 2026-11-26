import { createHash } from 'node:crypto';

export const FEEDBACK_TOKEN_LIMIT = 20;
export const FEEDBACK_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const SESSION_LIMIT = 1000;

type Entry = { ref: string; token: string; at: number };

/** Feedback tokens of one client session, addressed by the short refs shown to the agent. */
export class FeedbackTokenStore {
  #entries: Entry[] = [];
  #counter = 0;

  constructor(private readonly now: () => number = Date.now) {}

  #prune(): void {
    const cutoff = this.now() - FEEDBACK_TOKEN_TTL_MS;
    this.#entries = this.#entries.filter((entry) => entry.at > cutoff);
  }

  /** Stores a token under the API's ref, or a minted one, and returns the ref; a token seen before keeps its ref. */
  add(token: string, apiRef?: string): string {
    this.#prune();
    const known = this.#entries.find((entry) => entry.token === token);
    if (known) return known.ref;
    const ref = apiRef ?? `c${++this.#counter}`;
    this.#entries.push({ ref, token, at: this.now() });
    if (this.#entries.length > FEEDBACK_TOKEN_LIMIT) this.#entries.shift();
    return ref;
  }

  /** Tokens still valid, oldest first. */
  tokens(): string[] {
    this.#prune();
    return this.#entries.map((entry) => entry.token);
  }

  tokenForRef(ref: string): string | undefined {
    this.#prune();
    return this.#entries.find((entry) => entry.ref === ref)?.token;
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

/** Matches a ref the Firecrawl API issued, which it resolves itself without the token. */
export const API_FEEDBACK_REF = /^a[A-Za-z0-9_-]{10}$/;

function swapToken(node: unknown, store: FeedbackTokenStore): unknown {
  if (!isNode(node) || (typeof node.feedbackToken !== 'string' && typeof node.feedbackRef !== 'string')) return node;
  const { feedbackToken, feedbackRef, ...rest } = node;
  if (rest.provider === 'firecrawl') return rest;
  const apiRef = typeof feedbackRef === 'string' && API_FEEDBACK_REF.test(feedbackRef) ? feedbackRef : undefined;
  if (typeof feedbackToken !== 'string') return apiRef ? { ...rest, feedbackRef: apiRef } : rest;
  return { ...rest, feedbackRef: store.add(feedbackToken, apiRef) };
}

/**
 * Replaces each call result's `feedbackToken` with a short `feedbackRef` kept in
 * the store, so long opaque tokens stay out of the model's context. Tokens on
 * Firecrawl-internal calls (discovery, bash, terms) are dropped.
 */
export function withFeedbackRefs<T>(body: T, store: FeedbackTokenStore): T {
  const top = swapToken(body, store);
  if (!isNode(top) || !isNode(top.data)) return top as T;
  const data = swapToken(top.data, store) as Node;
  const results = Array.isArray(data.alexandria) ? data.alexandria.map((item) => swapToken(item, store)) : undefined;
  return { ...top, data: results ? { ...data, alexandria: results } : data } as T;
}

/**
 * The session's call tokens and per-call ratings in the shape the feedback API takes. A ref this
 * process does not hold is sent as is when the API issued it, since another process may have served
 * the call; any other unknown ref is reported back.
 */
export function alexandriaFeedbackTokens(
  callRatings: { ref: string; rating: 'good' | 'partial' | 'bad' }[] | undefined,
  store: FeedbackTokenStore
) {
  const rated = new Map<string, 'good' | 'partial' | 'bad'>();
  const byApiRef = new Map<string, 'good' | 'partial' | 'bad'>();
  const unknownRefs: string[] = [];
  for (const { ref, rating } of callRatings ?? []) {
    const token = store.tokenForRef(ref);
    if (token) rated.set(token, rating);
    else if (API_FEEDBACK_REF.test(ref)) byApiRef.set(ref, rating);
    else unknownRefs.push(ref);
  }
  const tokens = store.tokens();
  return {
    tokens,
    callRatings: [
      ...[...rated].map(([token, rating]) => ({ token, rating })),
      ...[...byApiRef].map(([ref, rating]) => ({ ref, rating })),
    ],
    sent: [...new Set([...tokens, ...rated.keys()])],
    unknownRefs,
  };
}
