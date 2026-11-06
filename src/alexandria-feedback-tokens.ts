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

  /** Stores a token and returns its ref; a token seen before keeps its ref. */
  add(token: string): string {
    this.#prune();
    const known = this.#entries.find((entry) => entry.token === token);
    if (known) return known.ref;
    const ref = `c${++this.#counter}`;
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
   * The Mcp-Session-Id names the session when the client sent one. Without it
   * the store is scoped to the caller's credential, so one user's calls never
   * reach another's feedback.
   */
  forSession(sessionId: unknown, credential: string | undefined): FeedbackTokenStore {
    const key =
      typeof sessionId === 'string' && sessionId !== ''
        ? `session:${sessionId}`
        : `credential:${createHash('sha256').update(credential ?? '').digest('hex')}`;
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

function swapToken(node: unknown, store: FeedbackTokenStore): unknown {
  if (!isNode(node) || typeof node.feedbackToken !== 'string') return node;
  const { feedbackToken, ...rest } = node;
  return rest.provider === 'firecrawl' ? rest : { ...rest, feedbackRef: store.add(feedbackToken) };
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
