/**
 * Realtime index routing for `firecrawl_search`.
 *
 * Agents reach for `firecrawl_search` and almost always leave `categories`
 * unset, so a query whose answer lives in the developer index (repositories,
 * GitHub issues, merged pull requests, READMEs, curated documentation) or
 * among research-affiliated sources is answered from the general web index
 * instead. A 60-day census of MCP search traffic measured that at roughly 15%
 * of keyed calls and a third of keyless ones.
 *
 * This module closes that gap at request time. For a search that names no
 * target, it asks TypeSafe's Jev — a System One model that returns a typed
 * judgment and a probability distribution rather than prose — which index the
 * query belongs to, and fills in `categories` only when the verdict clears a
 * confidence threshold.
 *
 * Three properties hold by construction:
 *
 *   - **Off unless configured.** No `FIRECRAWL_QUERY_ROUTER=true` and no API
 *     key means `routerConfigFromEnv` returns null and nothing on the search
 *     path changes. This is opt-in behaviour, not a new default.
 *   - **Fail open.** The router sits in front of every search. A timeout, a
 *     non-2xx, a malformed body, or a label this deployment does not map all
 *     resolve to "send the call exactly as the agent wrote it". The router
 *     never surfaces an error to the caller and never blocks a search.
 *   - **Never override intent.** A call that already carries `categories` or
 *     `sources` has said what it wants, and the router leaves it alone.
 */

/** Labels the classifier may return. `web_search` maps to no category. */
export type RouteLabel = 'developer_index' | 'research_index' | 'web_search';

export type RouterConfig = {
  endpoint: string;
  model: string;
  apiKey: string;
  /** A verdict must exceed this to be acted on. */
  threshold: number;
  timeoutMs: number;
  /** Label -> the `categories` token sent to /v2/search. */
  routes: Record<string, string>;
};

export type RouteDecision = {
  routed: boolean;
  /** Why the router did or did not act. Safe to log; never contains the query. */
  reason: string;
  label?: string;
  confidence?: number;
  probability?: number;
  category?: string;
  latencyMs: number;
};

export const DEFAULT_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export const DEFAULT_MODEL = 'jev-latest';
export const DEFAULT_THRESHOLD = 0.8;
export const DEFAULT_TIMEOUT_MS = 4000;

/**
 * Label to `categories` token. `web_search` is deliberately absent: the
 * agent's untargeted call is already the right call for it.
 */
export const DEFAULT_ROUTES: Record<string, string> = {
  developer_index: 'developer',
  research_index: 'research',
};

/**
 * The rubric is held identical to the one used for the traffic census that
 * justified this feature, so the live router and the measurement are the same
 * judgment rather than two similar ones.
 */
const CRITERIA: Record<string, string> = {
  developer_index:
    'Best answered by developer sources: source code, open-source repositories, GitHub issues, merged pull requests, READMEs, agent skill files, and official developer or API documentation. Typical intents: how a library, framework, SDK, CLI or API behaves; configuration, flags and parameters; error messages and stack traces; version, changelog or migration details; whether a package supports some feature.',
  research_index:
    'Best answered by scholarly literature: biomedical, life-science, clinical, or arXiv-style scientific papers and preprints. Typical intents: study findings, clinical trials, biological or chemical mechanisms, experimental methods, benchmark or dataset results reported in papers, or locating a specific paper, author or DOI.',
  web_search:
    'Best answered by the general web, and served poorly by code repositories or scientific papers. Typical intents: companies, people, products, prices, shopping, jobs, events, news, local or travel information, laws, regulations and government documents, market and financial facts, marketing or social media content, and general reference lookups.',
};

const QUESTION =
  'An AI coding or research agent is about to run this search without naming a target index. Judging only by the wording and intent of `search_query`, which index would serve it best?';

function parseNumber(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Resolve the router from the environment, or null when this deployment does
 * not route. Returns null rather than throwing: a half-configured router must
 * not stop the server from starting and serving ordinary searches.
 */
export function routerConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
): RouterConfig | null {
  if (env.FIRECRAWL_QUERY_ROUTER !== 'true') return null;
  const apiKey = (
    env.FIRECRAWL_QUERY_ROUTER_API_KEY ??
    env.TYPESAFE_API_KEY ??
    ''
  ).trim();
  if (!apiKey) return null;

  const threshold = parseNumber(
    env.FIRECRAWL_QUERY_ROUTER_THRESHOLD,
    DEFAULT_THRESHOLD
  );
  // A threshold outside (0, 1] cannot express "act only when confident", so
  // fall back to the default rather than routing on every verdict.
  const safeThreshold =
    threshold > 0 && threshold <= 1 ? threshold : DEFAULT_THRESHOLD;

  return {
    endpoint: env.FIRECRAWL_QUERY_ROUTER_ENDPOINT?.trim() || DEFAULT_ENDPOINT,
    model: env.FIRECRAWL_QUERY_ROUTER_MODEL?.trim() || DEFAULT_MODEL,
    apiKey,
    threshold: safeThreshold,
    timeoutMs: Math.max(
      250,
      parseNumber(env.FIRECRAWL_QUERY_ROUTER_TIMEOUT_MS, DEFAULT_TIMEOUT_MS)
    ),
    routes: { ...DEFAULT_ROUTES },
  };
}

function nonEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Ask the classifier which index a query belongs to. Resolves to a decision in
 * every case, including transport failure; it does not reject.
 */
export async function classifySearchQuery(
  query: string,
  config: RouterConfig,
  fetchImpl: typeof fetch = fetch
): Promise<RouteDecision> {
  const startedAt = Date.now();
  const elapsed = () => Date.now() - startedAt;

  let response: Response;
  try {
    response = await fetchImpl(config.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        state: { search_query: query },
        model: config.model,
        questions: {
          index: {
            type: 'choice',
            instructions: QUESTION,
            criteria: CRITERIA,
          },
        },
      }),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
  } catch (error) {
    // Includes the timeout. Name the error class only: a message can carry
    // request content, and this line is logged.
    const name = error instanceof Error ? error.name : 'Error';
    return {
      routed: false,
      reason: `transport_error:${name}`,
      latencyMs: elapsed(),
    };
  }

  if (!response.ok) {
    // Status only; a response body can echo the query back.
    return {
      routed: false,
      reason: `http_${response.status}`,
      latencyMs: elapsed(),
    };
  }

  let body: any;
  try {
    body = await response.json();
  } catch {
    return {
      routed: false,
      reason: 'malformed_response',
      latencyMs: elapsed(),
    };
  }

  const answer = body?.answers?.index;
  if (!answer || typeof answer !== 'object') {
    return { routed: false, reason: 'missing_answer', latencyMs: elapsed() };
  }
  const label = answer.choice;
  if (typeof label !== 'string') {
    return { routed: false, reason: 'missing_choice', latencyMs: elapsed() };
  }

  const confidence = Number(answer.confidence);
  const probability = Number(answer.probabilities?.[label]);
  const safeConfidence = Number.isFinite(confidence) ? confidence : 0;
  const safeProbability = Number.isFinite(probability) ? probability : 0;
  const latencyMs = elapsed();

  const category = config.routes[label];
  if (!category) {
    return {
      routed: false,
      reason: 'no_route_for_label',
      label,
      confidence: safeConfidence,
      probability: safeProbability,
      latencyMs,
    };
  }
  // Gate on `confidence` — the concentration of the whole distribution — not
  // on the winning option's probability. For a three-way choice confidence is
  // the stricter of the two, which is what auto-editing someone else's call
  // calls for.
  if (safeConfidence <= config.threshold) {
    return {
      routed: false,
      reason: 'below_threshold',
      label,
      confidence: safeConfidence,
      probability: safeProbability,
      latencyMs,
    };
  }

  return {
    routed: true,
    reason: 'above_threshold',
    label,
    confidence: safeConfidence,
    probability: safeProbability,
    category,
    latencyMs,
  };
}

/**
 * Fill in `categories` on an outbound /v2/search body when the router is
 * configured, the call named no target, and the classifier is confident.
 * Mutates `searchBody` in place and returns what it decided, so the caller can
 * log one line without re-deriving anything.
 */
export async function applyQueryRouting(
  searchBody: Record<string, unknown>,
  config: RouterConfig | null,
  fetchImpl: typeof fetch = fetch
): Promise<RouteDecision> {
  if (!config) return { routed: false, reason: 'disabled', latencyMs: 0 };
  if (
    nonEmptyArray(searchBody.categories) ||
    nonEmptyArray(searchBody.sources)
  ) {
    return { routed: false, reason: 'explicit_targeting', latencyMs: 0 };
  }
  const query = searchBody.query;
  if (typeof query !== 'string' || query.trim() === '') {
    return { routed: false, reason: 'no_query', latencyMs: 0 };
  }

  const decision = await classifySearchQuery(query, config, fetchImpl);
  if (decision.routed && decision.category) {
    searchBody.categories = [decision.category];
  }
  return decision;
}
