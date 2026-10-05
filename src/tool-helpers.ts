import { UserError } from 'fastmcp';
import { z } from 'zod';
import { readErrorAgentHints } from './agent-hints';
import { searchSourceSchema, ALEXANDRIA_SOURCES_OPT_OUT } from './alexandria';
import { MCP_CONNECTION_GUIDE_URL } from './recovery.js';

export function removeEmptyTopLevel<T extends Record<string, any>>(
  obj: T
): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (
      typeof v === 'object' &&
      !Array.isArray(v) &&
      Object.keys(v).length === 0
    )
      continue;
    // @ts-expect-error dynamic assignment
    out[k] = v;
  }
  return out;
}

const searchDomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(253)
  .regex(
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/,
    'Domain must be a valid hostname without protocol or path'
  );

// Parameter fields shared by both firecrawl_search surfaces. The full surface
// adds `scrapeOptions` on top; the search surface uses these as-is (strict, no
// scrapeOptions). Defining the field set once keeps the two surfaces from
// drifting when a source type, category, or filter changes.
export const searchToolBaseFields = {
  toolDetail: z.enum(['compact', 'summary', 'full']).optional().describe('Compact by default. Compact returns only provider, capability and description; full includes contracts. Inspect selected compact tools with firecrawl_find_tools providers and capabilities.'),
  query: z
    .string()
    .min(1)
    .describe('Query for web and semantic tool discovery. Operators include quoted phrases, `-term`, `site:host`, `inurl:term`, `intitle:term`, and `related:host`; the set is non-exhaustive. Catalogue browsing is available through firecrawl_find_tools.'),
  objective: z.string().trim().min(1).max(5000).optional().describe('Optional broader goal for this search, if known. Avoid sensitive information.'),
  clientModel: z.string().trim().min(1).max(128).optional().describe('Optional model identifier, if known.'),
  domainTools: z
    .boolean()
    .optional()
    .describe(
      'Include domain-matched tools for result URLs. Defaults to true when Alexandria is combined with web, news or images; semantic-only search leaves domain matching off.'
    ),
  highlights: z
    .boolean()
    .optional()
    .describe(
      'Return query-relevant page excerpts for web and news results when available (default). Highlights appear in web `description` and news `snippet`; otherwise, original snippets are returned. Set to false to keep the original search snippets.'
    ),
  limit: z.number().int().min(1).max(100).optional(),
  tbs: z.string().optional(),
  filter: z.string().optional(),
  location: z.string().optional(),
  includeDomains: z.array(searchDomainSchema).optional().describe('Hostnames to restrict results to. Mutually exclusive with excludeDomains.'),
  excludeDomains: z.array(searchDomainSchema).optional().describe('Hostnames to leave out of results. Mutually exclusive with includeDomains.'),
  sources: z
    .array(searchSourceSchema)
    .optional()
    .describe('Search sources; authenticated sessions default to web + alexandria, keyless sessions to web only. ' + ALEXANDRIA_SOURCES_OPT_OUT + ' Use ["alexandria"] alone for provider discovery without web results.'),
  categories: z
    .array(z.enum(['research', 'pdf', 'developer', 'gov']))
    .optional()
    .describe(
      'Limit results to specific source types. `research` restricts ordinary web results to research-affiliated websites and returns page snippets, which is separate from the `firecrawl_research_*` tools that search paper abstracts and full text across biomedical (PubMed, bioRxiv, medRxiv) and arXiv literature; `pdf` searches PDF results; `developer` searches an index built for coding agents over public repositories, GitHub issues, merged pull requests, repository READMEs, and code documentation; `gov` searches the Government Index of US federal, state, and local legal and regulatory sources, the index behind firecrawl_gov_search, and cannot be combined with other categories. `developer` and `gov` return hits in `data.web` with `category` set to their name; the other categories also filter `data.web`.'
    ),
  enterprise: z.array(z.enum(['default', 'anon', 'zdr'])).optional(),
};

// Both surfaces forbid specifying includeDomains and excludeDomains together.
export function searchDomainsAreExclusive(args: {
  includeDomains?: string[];
  excludeDomains?: string[];
}): boolean {
  return !(args.includeDomains?.length && args.excludeDomains?.length);
}
export const SEARCH_DOMAINS_CONFLICT_MESSAGE =
  'includeDomains and excludeDomains cannot both be specified';

// Alexandria execution requires authenticated team access.
const EXCHANGE_KEY_REQUIRED_MESSAGE =
  'Alexandria requires an API key on a team with Alexandria access';
const EXCHANGE_MAX_CALLS = 10;

export const exchangeCallSchema = z.object({
  provider: z.string().min(1).describe('Provider slug, e.g. "fred".'),
  capability: z
    .string()
    .min(1)
    .describe(
      'Capability address as returned by search or discover, e.g. "series/observations".'
    ),
  version: z.string().trim().min(1).max(128).optional().describe('Optional published workflow version. Omit to use the latest version.'),
  options: z
    .record(z.string(), z.any())
    .optional()
    .describe('Capability options as declared by its contract.'),
});
export const exchangeCallsSchema = z
  .array(exchangeCallSchema)
  .min(1)
  .max(EXCHANGE_MAX_CALLS);

export function assertExchangeCredential(credentialPresent: boolean): void {
  if (credentialPresent) return;
  const payload = {
    code: 'EXCHANGE_API_KEY_REQUIRED',
    message: EXCHANGE_KEY_REQUIRED_MESSAGE,
    docs_url: MCP_CONNECTION_GUIDE_URL,
  };
  throw new UserError(payload.message, payload);
}

const TERMS_REQUIRED_CODE = 'THIRD_PARTY_DATA_TERMS_REQUIRED';

type TermsRequiredAction = {
  type: 'accept_terms';
  terms: string;
  version: string;
  url: string;
};

type ExchangeErrorContext = { tool: string; requestId?: string; providers?: string[] };

export const DATA_SOURCES_SETTINGS_URL =
  'https://www.firecrawl.dev/app/settings?tab=data-sources';

// An organization admin accepts provider terms in the dashboard. Through MCP,
// agents only read them with terms/show, so firecrawl_scrape changes no
// account state.
export function isTermsWrite(call: { provider: string; capability: string }): boolean {
  const capability = call.capability.trim().toLowerCase();
  return (
    call.provider.trim().toLowerCase() === 'firecrawl' &&
    capability.startsWith('terms/') &&
    capability !== 'terms/show'
  );
}

export function termsWriteError(): UserError {
  const message = `Provider terms are accepted in the Firecrawl dashboard, not through this connection. Read them with terms/show, then ask an organization admin to accept them at ${DATA_SOURCES_SETTINGS_URL}.`;
  return new UserError(message, { code: 'invalid_option', status: 400, message });
}

function termsRequiredAction(body: unknown): TermsRequiredAction | undefined {
  const data = body as
    | { code?: unknown; requiresAction?: unknown }
    | null
    | undefined;
  if (data?.code !== TERMS_REQUIRED_CODE) return undefined;
  const action = data.requiresAction as
    | Partial<TermsRequiredAction>
    | null
    | undefined;
  if (
    action?.type !== 'accept_terms' ||
    typeof action.terms !== 'string' ||
    typeof action.version !== 'string' ||
    typeof action.url !== 'string'
  )
    return undefined;
  return {
    type: 'accept_terms',
    terms: action.terms,
    version: action.version,
    url: action.url,
  };
}

function termsRequiredError(
  action: TermsRequiredAction,
  context: ExchangeErrorContext,
  hints?: string[]
): UserError {
  const requestId = context.requestId;
  const retryIdentity = requestId ? ` and requestId ${requestId}` : '';
  const message = `Alexandria provider terms required. An organization admin must accept the ${action.terms} provider's terms (version ${action.version}) before this request can run.`;
  return new UserError(
    `${message}\n\n1. Read the agreement with firecrawl_scrape using alexandria: {provider: "firecrawl", capability: "terms/show", options: {provider: "${action.terms}"}} and present it to the user. Send terms/show separately from provider execution. Terms are accepted in the Firecrawl dashboard, not through this connection: ask an organization admin to accept them at ${action.url}, or ${DATA_SOURCES_SETTINGS_URL} if that page is unavailable. Never infer acceptance from a data request.\n2. After the admin confirms, call ${context.tool} again with the identical payload${retryIdentity}. If the same terms error persists, stop and ask an organization admin to check access at ${DATA_SOURCES_SETTINGS_URL}.\n\nDo not retry until acceptance is confirmed.`,
    {
      code: TERMS_REQUIRED_CODE,
      status: 403,
      message,
      ...(hints ? { agent_hints: hints } : {}),
      ...(requestId ? { requestId } : {}),
      requiresAction: action,
      nextTool: {
        name: 'firecrawl_scrape',
        arguments: {
          alexandria: [{ provider: 'firecrawl', capability: 'terms/show', options: { provider: action.terms } }],
        },
      },
      next_actions: [
        {
          kind: 'human_action_required',
          action: 'accept_terms',
          who: 'organization_admin',
          url: action.url,
          provider: action.terms,
          version: action.version,
        },
        {
          kind: 'retry_same_request',
          tool: context.tool,
          ...(requestId ? { requestId } : {}),
          after: 'human_action_required',
        },
      ],
    }
  );
}

function throwIfTermsRequired(
  error: unknown,
  context: ExchangeErrorContext
): void {
  const source = error as
    | { response?: { data?: unknown }; details?: unknown }
    | null
    | undefined;
  const action = termsRequiredAction(source?.response?.data ?? source?.details);
  if (action)
    throw termsRequiredError(action, context, readErrorAgentHints(error));
}

export async function relayTermsRequired<T>(
  run: () => Promise<T>,
  context: ExchangeErrorContext
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throwIfTermsRequired(error, context);
    throw error;
  }
}

// Exchange errors arrive as {success:false, error, code?, chargeId?} with the
// upstream status (403 without the team flag, 402/409 once billing lands, 5xx
// when the Exchange is unreachable). Relay the message, code, and any chargeId
// so the agent can act on them; a 401 is left to the credential recovery path.
export async function relayExchangeError(
  run: () => Promise<any>,
  context: ExchangeErrorContext
): Promise<any> {
  try {
    return await run();
  } catch (error) {
    throwIfTermsRequired(error, context);
    const response = (
      error as { response?: { status?: number; data?: unknown } } | null
    )?.response;
    if (!response || response.status === 401) throw error;
    const data = response.data as
      { error?: unknown; code?: unknown; chargeId?: unknown } | undefined;
    const hints = readErrorAgentHints(error);
    const message =
      typeof data?.error === 'string'
        ? data.error
        : `Alexandria request failed (HTTP ${response.status})`;
    const disabledProvider = response.status === 403
      ? context.providers?.find(provider => message === `Access to ${provider} is disabled for this organization.`)
      : undefined;
    if (disabledProvider) {
      throw new UserError(
        `${message} Read the provider terms and status using nextTool and present them to the user. Never infer acceptance from a data request. Terms are accepted in the Firecrawl dashboard, not through this connection; acceptance may not restore disabled access, and an organization admin can review access at ${DATA_SOURCES_SETTINGS_URL}. Retry the original request only after access is restored.`,
        {
          code: typeof data?.code === 'string' ? data.code : 'exchange_error',
          status: 403,
          message,
          ...(hints ? { agent_hints: hints } : {}),
          nextTool: {
            name: 'firecrawl_scrape',
            arguments: {
              alexandria: [{ provider: 'firecrawl', capability: 'terms/show', options: { provider: disabledProvider } }],
            },
          },
        }
      );
    }
    throw new UserError(message, {
      code: typeof data?.code === 'string' ? data.code : 'exchange_error',
      status: response.status,
      message,
      ...(hints ? { agent_hints: hints } : {}),
      ...(typeof data?.chargeId === 'string'
        ? { chargeId: data.chargeId }
        : {}),
    });
  }
}

export async function postSearchWithFallback(
  client: any,
  body: Record<string, unknown>,
  implicitTools: boolean
): Promise<any> {
  try {
    return await client.http.post('/v2/search', body);
  } catch (error) {
    const response = (error as any)?.response;
    const unavailable = [
      'Provider discovery requires access and does not support zero data retention.',
      'This endpoint is not enabled for this team.',
      'Exchange is not enabled for this team.',
    ].includes(response?.data?.error);
    if (!implicitTools || response?.status !== 403 || !unavailable) throw error;
    return client.http.post('/v2/search', {
      ...body,
      sources: ['web'],
      domainTools: false,
    });
  }
}
