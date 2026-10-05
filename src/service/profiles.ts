import {
  ALEXANDRIA_SEARCH_INSTRUCTIONS,
  normalizeHeader,
  withoutTrailingSlash,
} from '../server.js';

export const DEFAULT_OAUTH_ISSUER = 'https://www.firecrawl.dev';
export const DEFAULT_MCP_RESOURCE_URL = 'https://mcp.firecrawl.dev/v2/mcp';
export const DEFAULT_MCP_OAUTH_RESOURCE_URL = 'https://mcp.firecrawl.dev/v2/mcp-oauth';
export const DEFAULT_MCP_SEARCH_RESOURCE_URL = 'https://mcp.firecrawl.dev/v2/mcp-search';
export const DEFAULT_MCP_SEARCH_ENDPOINT = '/v2/mcp-search';

/**
 * A server profile parameterizes how a server instance is constructed. Hosted
 * deployments run one primary identity (`full` or `account`) per process. The
 * existing search profile remains an in-process companion of `full` until its
 * deployment is migrated separately.
 */
export type ServerProfile = {
  id: 'full' | 'account' | 'search';
  /** OAuth protected-resource display name. */
  resourceName: string;
  /** OAuth protected-resource identifier for this surface. */
  resourceUrl: string;
  /** httpStream endpoint override (defaults to fastmcp's own default). */
  endpoint?: `/${string}`;
  /** TCP port this instance listens on. */
  port: number;
  /** When set, only these tool names may register on this instance. */
  toolAllowlist?: Set<string>;
  /** Allow the keyless free-tier fallback (no credential required). */
  allowKeyless: boolean;
  /** Whether ordinary Firecrawl API keys are accepted for this identity. */
  acceptApiKeys: boolean;
  /** Require a managed hosted-MCP OAuth grant, never a legacy/general token. */
  requireManagedOAuth?: boolean;
  /** Whether this process's primary listener owns this profile. */
  primary?: boolean;
  /** Accept tokens minted for the legacy /v2/mcp resource during migration. */
  acceptLegacyAudience?: boolean;
  /** Publish OAuth discovery metadata for clients configuring this surface. */
  advertiseOAuth: boolean;
};

export function getOAuthIssuer(): string {
  return withoutTrailingSlash(
    normalizeHeader(process.env.FIRECRAWL_OAUTH_ISSUER) ?? DEFAULT_OAUTH_ISSUER
  );
}

// The search surface exposes web/developer/research search plus the two Alexandria
// tools (catalogue lookup and provider execution). Its instructions
// and tool copy describe just those tools and stay neutral about how a client
// uses them.
export const SEARCH_PROFILE_INSTRUCTIONS =
  ALEXANDRIA_SEARCH_INSTRUCTIONS +
  ` Firecrawl provides web, developer, government, and research search, and executes catalogued Alexandria data providers. Use firecrawl_search to find relevant results across the web and specialized indexes; authenticated searches also return matching Alexandria providers in data.tools. firecrawl_find_tools provides catalogue browsing and provider contracts; firecrawl_scrape with an alexandria body executes a selected capability; firecrawl_scrape with a url retrieves one supplied page. For a programming question, firecrawl_developer_search searches indexed public repositories, GitHub issues, merged pull requests, READMEs, and code documentation and returns the matched passages, and skills: "only" narrows it to agent-skill files; firecrawl_search with categories: ["developer"] reaches the same index beside ordinary web results, returning the hits in the web group rather than as passages and offering no skills filter. For a legal or regulatory question, firecrawl_gov_search searches primary law and regulatory material from US federal, state, and local government sources: statutes, regulations, codes, court opinions, and other government publications; firecrawl_search with categories: ["gov"] reaches the same sources in the web group and cannot be combined with other categories. For a biomedical, life-science, clinical, or arXiv literature question, the firecrawl_research_* tools search the paper index, while categories: ["research"] on firecrawl_search filters ordinary web results to research-affiliated websites. Use the firecrawl_research_* tools to search academic and research literature, expand from anchor papers via the citation graph, and read full-text passages from a specific paper. Search and discovery tools are read-only and return ranked results. Billing: web, developer, and research search are billed per request; government search is free; Alexandria discovery (firecrawl_search with sources ["alexandria"] alone, and firecrawl_find_tools) is free; firecrawl_scrape is billed, as a page retrieval in url mode or at each executed capability's listed price in alexandria mode.`;

// The exact set of tools the search surface exposes. Registration is filtered
// against this set, so anything not listed here can never appear on that
// instance's tools/list or be called through it.
//
// Why this set is frozen: /v2/mcp-search backs a published connector listing
// that declares these tool names to users. Editing this set changes what that
// listing advertises and leaves it wrong until the listing is updated by hand.
// Before adding, removing, renaming, or hiding anything here, tell partnerships
// so the listing and the server move at the same time. See
// docs/search-profile.md, "Why the tool set is fixed".
export const SEARCH_PROFILE_TOOLS = new Set<string>([
  'firecrawl_search',
  'firecrawl_developer_search',
  'firecrawl_gov_search',
  'firecrawl_research_search_papers',
  'firecrawl_research_inspect_paper',
  'firecrawl_research_related_papers',
  'firecrawl_research_read_paper',
  // Alexandria: catalogue lookup and provider execution.
  'firecrawl_find_tools',
  'firecrawl_scrape',
  // Registered so cached sessions get a DEPRECATED_TOOL payload, hidden from
  // tools/list via canList. See registerResearchTools.
  'firecrawl_research_search_github',
]);

// Tools whose search-surface registration is a variant with surface-scoped
// copy. Their module-level registration is suppressed on a primary search
// process and the variant is registered explicitly at startup.
export const SEARCH_SURFACE_VARIANT_TOOLS = new Set<string>([
  'firecrawl_search',
  'firecrawl_scrape',
  'firecrawl_find_tools',
]);


export function resolveCredentialFromEnv(): string | undefined {
  return (
    normalizeHeader(process.env.FIRECRAWL_OAUTH_TOKEN) ??
    normalizeHeader(process.env.FIRECRAWL_API_KEY)
  );
}

function getMcpResourceUrl(): string {
  return (
    normalizeHeader(process.env.FIRECRAWL_MCP_RESOURCE_URL) ??
    DEFAULT_MCP_RESOURCE_URL
  );
}

export function getPrimaryEndpoint(): '/v2/mcp' | '/v2/mcp-oauth' | '/v2/mcp-search' {
  const endpoint = normalizeHeader(process.env.FASTMCP_ENDPOINT) ?? '/v2/mcp';
  if (
    endpoint === '/v2/mcp' ||
    endpoint === '/v2/mcp-oauth' ||
    endpoint === '/v2/mcp-search'
  ) {
    return endpoint;
  }
  throw new Error(
    `Unsupported FASTMCP_ENDPOINT: ${endpoint}. Expected /v2/mcp, /v2/mcp-oauth, or /v2/mcp-search.`
  );
}

function getSearchMcpResourceUrl(): string {
  return (
    normalizeHeader(process.env.FIRECRAWL_MCP_SEARCH_RESOURCE_URL) ??
    DEFAULT_MCP_SEARCH_RESOURCE_URL
  );
}

function getSearchMcpEndpoint(): `/${string}` {
  const configured = normalizeHeader(process.env.FIRECRAWL_MCP_SEARCH_ENDPOINT);
  if (configured && configured.startsWith('/')) {
    return configured as `/${string}`;
  }
  return DEFAULT_MCP_SEARCH_ENDPOINT;
}

function makeFullProfile(): ServerProfile {
  const account = getPrimaryEndpoint() === '/v2/mcp-oauth';
  return {
    id: account ? 'account' : 'full',
    resourceName: account ? 'Firecrawl MCP Account' : 'Firecrawl MCP',
    resourceUrl: account
      ? (normalizeHeader(process.env.FIRECRAWL_MCP_RESOURCE_URL) ??
        DEFAULT_MCP_OAUTH_RESOURCE_URL)
      : getMcpResourceUrl(),
    endpoint: account ? '/v2/mcp-oauth' : undefined,
    port: Number(process.env.PORT || 3000),
    allowKeyless: !account,
    acceptApiKeys: true,
    acceptLegacyAudience:
      account && process.env.MCP_OAUTH_ACCEPT_LEGACY_V2_MCP_AUD !== 'false',
    advertiseOAuth: account,
    primary: true,
  };
}

function searchOAuthOnly(): boolean {
  return process.env.FIRECRAWL_MCP_SEARCH_OAUTH_ONLY === 'true';
}

export function makeSearchProfile({
  primary = false,
}: { primary?: boolean } = {}): ServerProfile {
  const oauthOnly = searchOAuthOnly();
  if (primary && !oauthOnly) {
    throw new Error(
      'FASTMCP_ENDPOINT=/v2/mcp-search requires FIRECRAWL_MCP_SEARCH_OAUTH_ONLY=true'
    );
  }
  return {
    id: 'search',
    resourceName: 'Firecrawl Search',
    resourceUrl: getSearchMcpResourceUrl(),
    endpoint: primary ? DEFAULT_MCP_SEARCH_ENDPOINT : getSearchMcpEndpoint(),
    port: primary
      ? Number(process.env.PORT || 3000)
      : Number(process.env.FIRECRAWL_MCP_SEARCH_PORT || 3001),
    toolAllowlist: SEARCH_PROFILE_TOOLS,
    allowKeyless: false,
    // This is deliberately default-false because the image auto-deploys: the
    // existing in-process companion remains API-key compatible unless its
    // deployment explicitly enables the same profile flag used by primary.
    acceptApiKeys: !oauthOnly,
    requireManagedOAuth: oauthOnly,
    advertiseOAuth: true,
    primary,
  };
}

export function makePrimaryProfile(): ServerProfile {
  return getPrimaryEndpoint() === '/v2/mcp-search'
    ? makeSearchProfile({ primary: true })
    : makeFullProfile();
}
