/**
 * Realtime index routing for `firecrawl_search`.
 *
 * Agents reach for `firecrawl_search` and almost always leave `categories`
 * unset, so a question whose answer lives in the developer index or in the
 * research paper index is answered from the general web index instead. A
 * 60-day census of MCP search traffic measured that at roughly 15% of keyed
 * calls and a third of keyless ones.
 *
 * This module closes that gap at request time. For a search that names no
 * target, it asks TypeSafe's Jev — a System One model that returns a typed
 * judgment and a probability distribution rather than prose — which index the
 * query belongs to, and acts only when the winning option's probability
 * clears a threshold.
 *
 * The two routes are not symmetric, and the asymmetry is the point:
 *
 *   - **developer** stays inside `/v2/search`. It is a category on the same
 *     endpoint, so the response shape the agent gets back is unchanged.
 *   - **research** retargets to the paper index (`/v2/search/research/papers`),
 *     a different endpoint returning papers rather than web pages. This is a
 *     real change of surface, so the caller wraps the result in an envelope
 *     that says so; see `routeSearchBody` in index.ts.
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

/** Labels the classifier may return. `web_search` maps to no route. */
export type RouteLabel = 'developer_index' | 'research_index' | 'web_search';

/**
 * What acting on a verdict means. `developer_category` is a `categories` value
 * on the same /v2/search call; `research_paper_index` is a different endpoint
 * and a different response shape, which the caller must handle.
 */
export type RouteTarget = 'developer_category' | 'research_paper_index';

export type RouterConfig = {
  endpoint: string;
  model: string;
  apiKey: string;
  /** The winning option's probability must exceed this to be acted on. */
  threshold: number;
  timeoutMs: number;
  /** Label -> what to do about it. */
  routes: Record<string, RouteTarget>;
};

export type RouteDecision = {
  routed: boolean;
  /** Why the router did or did not act. Safe to log; never contains the query. */
  reason: string;
  label?: string;
  /** The winning option's probability. This is what the threshold gates on. */
  probability?: number;
  /** Distribution concentration, reported for observability only. */
  confidence?: number;
  target?: RouteTarget;
  /** The `categories` value applied, for `developer_category` only. */
  category?: string;
  latencyMs: number;
};

export const DEFAULT_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export const DEFAULT_MODEL = 'jev-latest';
export const DEFAULT_THRESHOLD = 0.8;
export const DEFAULT_TIMEOUT_MS = 4000;

export const DEFAULT_ROUTES: Record<string, RouteTarget> = {
  developer_index: 'developer_category',
  research_index: 'research_paper_index',
};

/** The `categories` token each category-style target applies. */
const CATEGORY_FOR_TARGET: Partial<Record<RouteTarget, string>> = {
  developer_category: 'developer',
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
 * A probability as a number in [0, 1], or 0 when the value is not one.
 *
 * The check is on the raw value, with no coercion: `Number(true)` is 1 and
 * `Number('0.9')` is 0.9, so coercing first would let a malformed answer clear
 * the threshold. A probability that did not arrive as a JSON number reads as
 * no probability at all, which keeps the fail-open guarantee whole.
 */
function unitInterval(value: unknown): number {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
    ? value
    : 0;
}

/**
 * The target mapped to a label, considering own properties only. A label like
 * `constructor` or `toString` would otherwise resolve to an inherited member
 * of Object.prototype and be treated as a route.
 */
function ownRoute(
  routes: Record<string, RouteTarget>,
  label: string
): RouteTarget | undefined {
  if (!Object.prototype.hasOwnProperty.call(routes, label)) return undefined;
  const target = routes[label];
  return target === 'developer_category' || target === 'research_paper_index'
    ? target
    : undefined;
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
    return { routed: false, reason: 'malformed_response', latencyMs: elapsed() };
  }

  const answer = body?.answers?.index;
  if (!answer || typeof answer !== 'object') {
    return { routed: false, reason: 'missing_answer', latencyMs: elapsed() };
  }
  const label = answer.choice;
  if (typeof label !== 'string') {
    return { routed: false, reason: 'missing_choice', latencyMs: elapsed() };
  }

  const probability = unitInterval(answer.probabilities?.[label]);
  const confidence = unitInterval(answer.confidence);
  const latencyMs = elapsed();

  const target = ownRoute(config.routes, label);
  if (!target) {
    // web_search, or a label this deployment does not route. Either way the
    // agent's original call is already correct.
    return {
      routed: false,
      reason: 'no_route_for_label',
      label,
      probability,
      confidence,
      latencyMs,
    };
  }
  // Gate on the winning option's probability. Strictly greater than, so a
  // threshold of 0.8 means "more than 80% of the mass on this option".
  if (probability <= config.threshold) {
    return {
      routed: false,
      reason: 'below_threshold',
      label,
      probability,
      confidence,
      latencyMs,
    };
  }

  return {
    routed: true,
    reason: 'above_threshold',
    label,
    probability,
    confidence,
    target,
    category: CATEGORY_FOR_TARGET[target],
    latencyMs,
  };
}

export type ApplyOptions = {
  /**
   * Whether the research paper index is applicable to this call. Keyless
   * sessions cannot reach it, and a domain-scoped search is asking about
   * specific sites rather than about the literature; both pass false so a
   * research verdict is left unrouted instead of being sent somewhere it does
   * not belong.
   */
  allowPaperIndex?: boolean;
  fetchImpl?: typeof fetch;
};

/**
 * Why a research verdict must not be retargeted, or null when it may be.
 *
 * `scrapeOptions` asks for page content attached to each web result. The paper
 * index returns papers and has nothing to attach it to, so retargeting would
 * silently drop what the caller explicitly asked for — the search runs as
 * written instead.
 */
function paperIndexBlockedBy(
  searchBody: Record<string, unknown>,
  allowPaperIndex: boolean
): string | null {
  if (!allowPaperIndex) return 'paper_index_unavailable';
  if (searchBody.scrapeOptions != null) return 'scrape_options_requested';
  return null;
}

/**
 * Decide how an outbound /v2/search call should be routed.
 *
 * For a `developer_category` verdict this fills in `categories` on
 * `searchBody` in place and the caller proceeds normally. For a
 * `research_paper_index` verdict the body is NOT modified — the caller must
 * issue the paper-index request instead, because it is a different endpoint
 * with a different response shape.
 */
export async function applyQueryRouting(
  searchBody: Record<string, unknown>,
  config: RouterConfig | null,
  options: ApplyOptions = {}
): Promise<RouteDecision> {
  const { allowPaperIndex = true, fetchImpl = fetch } = options;

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
  if (!decision.routed) return decision;

  if (decision.target === 'research_paper_index') {
    const blocked = paperIndexBlockedBy(searchBody, allowPaperIndex);
    if (blocked) {
      // The honest outcome is the unrouted web search the agent asked for,
      // not a paper request that would reject it or quietly answer something
      // narrower than the call requested.
      return {
        ...decision,
        routed: false,
        reason: blocked,
        target: undefined,
        category: undefined,
      };
    }
  }

  if (decision.target === 'developer_category' && decision.category) {
    searchBody.categories = [decision.category];
  }
  return decision;
}
