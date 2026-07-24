#!/usr/bin/env node
import FirecrawlApp from '@mendable/firecrawl-js';
import dotenv from 'dotenv';
import { FastMCP, type Logger, UserError } from 'fastmcp';
import type { IncomingHttpHeaders } from 'http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { registerMonitorTools } from './monitor';
import { registerResearchTools } from './research';
import {
  credentialForOutboundRequest,
  CredentialValidationUnavailableError,
  hasCredential,
  hasManagedOAuthCredential,
  requireDelegatedCredentialSigning,
  setManagedOAuthApiKey,
  type CredentialSession,
} from './session-credential';

dotenv.config({ debug: false, quiet: true });

const require = createRequire(import.meta.url);
const { version: packageVersion } = require('../package.json') as {
  version: string;
};

interface SessionData extends CredentialSession {
  /**
   * FC API key (`fc-...`) or OAuth access token (`fco_...`) sent as
   * `Authorization: Bearer ...` to the Firecrawl API.
   */
  firecrawlApiKey?: string;
  /**
   * For keyless requests over the hosted (CLOUD_SERVICE) MCP, the end-user's
   * real client IP, forwarded to the API so it can rate-limit per real IP
   * instead of the shared server IP.
   */
  keylessClientIp?: string;
  authType?: 'api-key' | 'oauth' | 'env' | 'keyless' | 'none';
  credentialError?: 'CREDENTIAL_INVALID';
  teamId?: string;
  userId?: string;
  apiKeyId?: string;
  oauthClientId?: string;
  resource?: string;
  [key: string]: unknown;
}

type ToolLogger = Pick<Logger, 'debug' | 'error' | 'info' | 'warn'>;

/**
 * A server profile parameterizes how a FastMCP instance is constructed. Hosted
 * deployments run one primary identity (`full` or `account`) per process. The
 * existing search profile remains an in-process companion of `full` until its
 * deployment is migrated separately.
 */
type ServerProfile = {
  id: 'full' | 'account' | 'search';
  /** OAuth protected-resource display name. */
  resourceName: string;
  /** Server-level instructions surfaced to clients. */
  instructions: string;
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
  /** Accept tokens minted for the legacy /v2/mcp resource during migration. */
  acceptLegacyAudience?: boolean;
};

/** Registers a tool onto an instance; a subset of the FastMCP surface. */
type ToolRegistrar = Pick<FastMCP<SessionData>, 'addTool'>;

const authResultByRequest = Symbol('firecrawlMcpAuthResult');

type MCPAuthRequest = {
  headers: IncomingHttpHeaders;
  url?: string;
  [authResultByRequest]?: Promise<SessionData>;
};

function normalizeHeader(
  value: string | string[] | undefined
): string | undefined {
  if (value == null) return undefined;
  const v = Array.isArray(value) ? value[0] : value;
  const trimmed = typeof v === 'string' ? v.trim() : '';
  return trimmed || undefined;
}

function extractBearerToken(headers: IncomingHttpHeaders): string | undefined {
  const headerAuth = normalizeHeader(headers['authorization']);
  if (!headerAuth?.toLowerCase().startsWith('bearer ')) return undefined;
  const raw = headerAuth.slice(7).trim();
  return raw || undefined;
}

/** OAuth access tokens minted by Firecrawl (Authorization Server). */
function isFirecrawlOAuthAccessToken(token: string): boolean {
  return token.startsWith('fco_');
}

function isFirecrawlApiKey(token: string): boolean {
  return token.startsWith('fc-');
}

function requestShouldReceiveOAuthChallenge(
  request: MCPAuthRequest | undefined
): boolean {
  if (!request?.headers) return true;
  const headerApiKey = normalizeHeader(
    request.headers['x-firecrawl-api-key'] ?? request.headers['x-api-key']
  );
  if (headerApiKey) return false;
  const bearer = extractBearerToken(request.headers);
  return !bearer || isFirecrawlOAuthAccessToken(bearer);
}

function resolveCredentialFromEnv(): string | undefined {
  return (
    normalizeHeader(process.env.FIRECRAWL_OAUTH_TOKEN) ??
    normalizeHeader(process.env.FIRECRAWL_API_KEY)
  );
}

function isHttpStreamingTransport(): boolean {
  return (
    process.env.HTTP_STREAMABLE_SERVER === 'true' ||
    process.env.SSE_LOCAL === 'true'
  );
}

const DEFAULT_OAUTH_ISSUER = 'https://www.firecrawl.dev';
const DEFAULT_MCP_RESOURCE_URL = 'https://mcp.firecrawl.dev/v2/mcp';
const DEFAULT_MCP_OAUTH_RESOURCE_URL = 'https://mcp.firecrawl.dev/v2/mcp-oauth';
const DEFAULT_MCP_SEARCH_RESOURCE_URL = 'https://mcp.firecrawl.dev/v2/mcp-search';
const DEFAULT_MCP_SEARCH_ENDPOINT = '/v2/mcp-search';

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function getOAuthIssuer(): string {
  return withoutTrailingSlash(
    normalizeHeader(process.env.FIRECRAWL_OAUTH_ISSUER) ?? DEFAULT_OAUTH_ISSUER
  );
}

function getMcpResourceUrl(): string {
  return (
    normalizeHeader(process.env.FIRECRAWL_MCP_RESOURCE_URL) ??
    DEFAULT_MCP_RESOURCE_URL
  );
}

function getPrimaryEndpoint(): '/v2/mcp' | '/v2/mcp-oauth' {
  const endpoint = normalizeHeader(process.env.FASTMCP_ENDPOINT) ?? '/v2/mcp';
  if (endpoint === '/v2/mcp' || endpoint === '/v2/mcp-oauth') return endpoint;
  throw new Error(
    `Unsupported FASTMCP_ENDPOINT: ${endpoint}. Expected /v2/mcp or /v2/mcp-oauth.`
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

// PRM location per RFC 9728. firecrawl-fastmcp serves the document both at the
// origin-level path and at `/.well-known/oauth-protected-resource${endpoint}`.
// The full surface uses the origin-level document (unchanged); a path-scoped
// surface advertises the document that sits under its own resource path, so a
// single host can carry more than one protected resource.
function getOAuthProtectedResourceMetadataUrl(profile: ServerProfile): string {
  const resource = new URL(profile.resourceUrl);
  const base = `${resource.origin}/.well-known/oauth-protected-resource`;
  return profile.id === 'full' ? base : `${base}${resource.pathname}`;
}

function escapeWWWAuthenticateValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function createOAuthChallengeResponse(
  error: unknown,
  profile: ServerProfile
): Response | undefined {
  if (!isMcpOAuthEnabled()) {
    return undefined;
  }

  const errorMessage =
    error instanceof Error ? error.message : String(error || 'Unauthorized');
  const wwwAuthenticate = [
    `resource_metadata="${escapeWWWAuthenticateValue(getOAuthProtectedResourceMetadataUrl(profile))}"`,
    'error="invalid_token"',
    `error_description="${escapeWWWAuthenticateValue(errorMessage)}"`,
  ].join(', ');

  return new Response(
    JSON.stringify({
      error: 'invalid_token',
      error_description: errorMessage,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': `Bearer ${wwwAuthenticate}`,
      },
      status: 401,
    }
  );
}

function getOAuthIntrospectionEndpoint(): string {
  return `${getOAuthIssuer()}/api/oauth/introspect`;
}

function getOAuthIntrospectionSecret(): string | undefined {
  return normalizeHeader(process.env.FIRECRAWL_OAUTH_INTROSPECT_SECRET);
}

function isMcpOAuthEnabled(): boolean {
  return process.env.CLOUD_SERVICE === 'true';
}

type OAuthCredentialPurpose = 'general' | 'hosted_mcp_oauth';

function isOAuthCredentialPurpose(value: unknown): value is OAuthCredentialPurpose {
  return value === 'general' || value === 'hosted_mcp_oauth';
}

type OAuthIntrospectionResponse = {
  active?: boolean;
  api_key?: string;
  aud?: string | string[];
  credential_purpose?: OAuthCredentialPurpose;
  scope?: string | string[];
  team_id?: string;
  sub?: string;
  api_key_id?: string;
  client_id?: string;
};

type CredentialMetadata = Pick<
  SessionData,
  'teamId' | 'userId' | 'apiKeyId' | 'oauthClientId' | 'resource'
>;

type ResolvedCredential = {
  credential?: string;
  managedOAuthApiKey?: string;
  invalid?: boolean;
  source?: 'api-key' | 'oauth' | 'env';
  metadata?: CredentialMetadata;
};

const MCP_GLOBAL_SCOPE = 'firecrawl:global';

function values(value: string | string[] | undefined): string[] {
  if (typeof value === 'string') return value.split(/\s+/).filter(Boolean);
  return Array.isArray(value)
    ? value.flatMap((item) => item.split(/\s+/).filter(Boolean))
    : [];
}

function audienceMatchesResource(
  aud: string | string[] | undefined,
  resourceUrl: string
): boolean {
  const target = withoutTrailingSlash(resourceUrl);
  return values(aud).some((entry) => withoutTrailingSlash(entry) === target);
}

function credentialMetadata(data: OAuthIntrospectionResponse): CredentialMetadata {
  return {
    teamId: typeof data.team_id === 'string' ? data.team_id : undefined,
    userId: typeof data.sub === 'string' ? data.sub : undefined,
    apiKeyId: typeof data.api_key_id === 'string' ? data.api_key_id : undefined,
    oauthClientId:
      typeof data.client_id === 'string' ? data.client_id : undefined,
    resource: typeof data.aud === 'string' ? data.aud : undefined,
  };
}

async function introspectToken(
  token: string,
  expectedResource: string
): Promise<OAuthIntrospectionResponse> {
  const introspectionSecret = getOAuthIntrospectionSecret();
  if (!introspectionSecret) throw new CredentialValidationUnavailableError();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  let response: Response;
  try {
    response = await fetch(getOAuthIntrospectionEndpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Bearer ${introspectionSecret}`,
      },
      body: new URLSearchParams({
        resource: expectedResource,
        token,
        token_type_hint: 'access_token',
      }),
      signal: controller.signal,
    });
  } catch {
    throw new CredentialValidationUnavailableError();
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new CredentialValidationUnavailableError();
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) {
    throw new CredentialValidationUnavailableError();
  }
  const data = (await response.json()) as OAuthIntrospectionResponse;
  if (typeof data.active !== 'boolean') {
    throw new CredentialValidationUnavailableError();
  }
  if (
    data.active &&
    (!data.api_key ||
      !isOAuthCredentialPurpose(data.credential_purpose) ||
      !values(data.scope).includes(MCP_GLOBAL_SCOPE))
  ) {
    throw new CredentialValidationUnavailableError();
  }
  return data;
}

async function resolveCredentialFromHeaders(
  headers: IncomingHttpHeaders,
  profile: ServerProfile
): Promise<ResolvedCredential | undefined> {
  const bearer = extractBearerToken(headers);
  const headerApiKey = normalizeHeader(
    headers['x-firecrawl-api-key'] ?? headers['x-api-key']
  );
  const token = headerApiKey ?? bearer;
  if (!token) return undefined;
  if (!isFirecrawlOAuthAccessToken(token) && !isFirecrawlApiKey(token)) {
    return { invalid: true };
  }

  let data = await introspectToken(token, profile.resourceUrl);
  if (
    isFirecrawlOAuthAccessToken(token) &&
    !data.active &&
    profile.acceptLegacyAudience
  ) {
    data = await introspectToken(token, DEFAULT_MCP_RESOURCE_URL);
  }
  if (!data.active || !data.api_key) {
    if (isFirecrawlOAuthAccessToken(token)) {
      throw new Error('Invalid OAuth access token');
    }
    return { invalid: true };
  }

  if (isFirecrawlApiKey(token)) {
    return data.credential_purpose === 'general'
      ? {
          credential: data.api_key,
          source: 'api-key',
          metadata: credentialMetadata(data),
        }
      : { invalid: true };
  }
  const expectedAudience =
    profile.acceptLegacyAudience &&
    audienceMatchesResource(data.aud, DEFAULT_MCP_RESOURCE_URL)
      ? DEFAULT_MCP_RESOURCE_URL
      : profile.resourceUrl;
  if (!audienceMatchesResource(data.aud, expectedAudience)) {
    throw new Error('OAuth token audience does not match this resource');
  }
  if (data.credential_purpose === 'hosted_mcp_oauth') {
    requireDelegatedCredentialSigning();
    return {
      managedOAuthApiKey: data.api_key,
      source: 'oauth',
      metadata: credentialMetadata(data),
    };
  }
  return {
    credential: data.api_key,
    source: 'oauth',
    metadata: credentialMetadata(data),
  };
}

async function authenticateRequest(
  request: MCPAuthRequest | undefined,
  profile: ServerProfile
): Promise<SessionData> {
  // FastMCP invokes `authenticate(undefined)` for the stdio transport
  // because there is no HTTP request context. Without this null guard,
  // accessing `request.headers` throws a TypeError, FastMCP silently
  // swallows it, and every subsequent tool call fails with
  // "Unauthorized: API key is required when not using a self-hosted
  // instance" even though `FIRECRAWL_API_KEY` is set in env.
  const resolved = request?.headers
    ? await resolveCredentialFromHeaders(request.headers, profile)
    : undefined;

  const headerCred = resolved?.credential;
  const managedCred = resolved?.managedOAuthApiKey;
  const envCred = resolveCredentialFromEnv();

  if (process.env.CLOUD_SERVICE === 'true') {
    if (!headerCred && !managedCred) {
      if (resolved?.invalid) {
        return { authType: 'none', credentialError: 'CREDENTIAL_INVALID' };
      }
      if (profile.allowKeyless) {
        return {
          authType: 'keyless',
          firecrawlApiKey: undefined,
          keylessClientIp: extractClientIp(request),
        };
      }
      throw new Error(
        'Firecrawl credentials required: OAuth access token (Authorization: Bearer fco_...) or API key (x-firecrawl-api-key)'
      );
    }
    const session: SessionData = {
      authType: resolved?.source === 'oauth' ? 'oauth' : 'api-key',
      firecrawlApiKey: headerCred,
      ...resolved?.metadata,
    };
    return managedCred ? setManagedOAuthApiKey(session, managedCred) : session;
  }

  const credential = headerCred ?? managedCred ?? envCred;

  // Self-hosted / stdio / HTTP streamable — headers supply MCP OAuth token when present
  const httpStreaming = isHttpStreamingTransport();
  if (
    !httpStreaming &&
    !process.env.FIRECRAWL_API_KEY &&
    !process.env.FIRECRAWL_API_URL
  ) {
    // No credential and no self-hosted URL: run in keyless mode. scrape and
    // search work for free (rate-limited per IP) against the Firecrawl cloud;
    // every other tool needs an API key and will return Unauthorized.
    console.error(
      'No FIRECRAWL_API_KEY or FIRECRAWL_API_URL set — running in keyless mode. ' +
        'firecrawl_scrape and firecrawl_search are free (rate-limited per IP) against the Firecrawl cloud; ' +
        'other tools require an API key (get one free at https://firecrawl.dev).'
    );
  }

  if (httpStreaming && !credential && !process.env.FIRECRAWL_API_URL) {
    console.error(
      'HTTP MCP transport requires FIRECRAWL_API_URL and/or credentials (OAuth: Authorization Bearer fco_..., or FIRECRAWL_API_KEY / FIRECRAWL_OAUTH_TOKEN)'
    );
    process.exit(1);
  }

  const session: SessionData = {
    authType: resolved?.source === 'oauth' ? 'oauth' : credential ? 'env' : 'none',
    firecrawlApiKey: headerCred ?? envCred,
    ...resolved?.metadata,
  };
  return managedCred ? setManagedOAuthApiKey(session, managedCred) : session;
}

/**
 * Builds the `authenticate` hook for one profile. FastMCP runs it on every
 * request (including `tools/list`), so a rejection here yields a 401 with the
 * profile's own OAuth challenge and no request reaches an unauthenticated tool.
 */
function makeAuthenticate(profile: ServerProfile) {
  return async function authenticateWithOAuthChallenge(
    request?: MCPAuthRequest
  ): Promise<SessionData> {
    if (request?.[authResultByRequest]) {
      return request[authResultByRequest];
    }

    const authResult = authenticateRequest(request, profile).catch((error) => {
      if (error instanceof CredentialValidationUnavailableError) {
        throw new Response(
          JSON.stringify({
            error: 'temporarily_unavailable',
            error_description: error.message,
          }),
          {
            headers: { 'Content-Type': 'application/json' },
            status: 503,
          }
        );
      }
      const shouldChallenge = requestShouldReceiveOAuthChallenge(request);
      const oauthChallenge = shouldChallenge
        ? createOAuthChallengeResponse(error, profile)
        : undefined;
      if (oauthChallenge) {
        throw oauthChallenge;
      }
      throw error;
    });

    if (request) {
      request[authResultByRequest] = authResult;
    }

    return authResult;
  };
}

function removeEmptyTopLevel<T extends Record<string, any>>(
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

function buildSearchQueryWithDomains(
  query: string,
  includeDomains?: string[],
  excludeDomains?: string[]
): string {
  if (includeDomains?.length) {
    return `${query} (${includeDomains
      .map((domain) => `site:${domain}`)
      .join(' OR ')})`;
  }

  if (excludeDomains?.length) {
    return `${query} ${excludeDomains
      .map((domain) => `-site:${domain}`)
      .join(' ')}`;
  }

  return query;
}

// Parameter fields shared by both firecrawl_search surfaces. The full surface
// adds `scrapeOptions` on top; the search surface uses these as-is (strict, no
// scrapeOptions). Defining the field set once keeps the two surfaces from
// drifting when a source type, category, or filter changes.
const searchToolBaseFields = {
  query: z
    .string()
    .min(1)
    .describe(
      'Search query. Supports standard operators such as site:, intitle:, and quoted phrases.'
    ),
  highlights: z
    .boolean()
    .optional()
    .describe(
      'Return query-relevant highlights for each search result. Set to false to keep the original search snippets.'
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Maximum number of results to return.'),
  tbs: z
    .string()
    .optional()
    .describe('Optional time-based search filter, such as qdr:d for the past day.'),
  filter: z
    .string()
    .optional()
    .describe('Optional search filter supported by the Firecrawl Search API.'),
  location: z
    .string()
    .optional()
    .describe('Optional coarse geographic location used to localize search results.'),
  includeDomains: z
    .array(searchDomainSchema)
    .optional()
    .describe(
      'Return results only from these hostnames. Cannot be combined with excludeDomains.'
    ),
  excludeDomains: z
    .array(searchDomainSchema)
    .optional()
    .describe(
      'Exclude results from these hostnames. Cannot be combined with includeDomains.'
    ),
  sources: z
    .array(
      z.object({
        type: z
          .enum(['web', 'images', 'news'])
          .describe('Search result source type.'),
      })
    )
    .optional()
    .describe('Source indexes to search. Defaults to web results.'),
  categories: z
    .array(z.enum(['github', 'research', 'pdf']))
    .optional()
    .describe(
      'Limit results to specific source types. `github` searches GitHub repositories, code, issues, and docs; `research` searches academic and research sources; `pdf` searches PDF results.'
    ),
  enterprise: z
    .array(z.enum(['default', 'anon', 'zdr']))
    .optional()
    .describe(
      'Optional enterprise processing modes: default, anonymous processing, or zero-data-retention processing.'
    ),
};

// Both surfaces forbid specifying includeDomains and excludeDomains together.
function searchDomainsAreExclusive(args: {
  includeDomains?: string[];
  excludeDomains?: string[];
}): boolean {
  return !(args.includeDomains?.length && args.excludeDomains?.length);
}
const SEARCH_DOMAINS_CONFLICT_MESSAGE =
  'includeDomains and excludeDomains cannot both be specified';

class ConsoleLogger implements Logger {
  private shouldLog =
    process.env.CLOUD_SERVICE === 'true' ||
    process.env.SSE_LOCAL === 'true' ||
    process.env.HTTP_STREAMABLE_SERVER === 'true';

  debug(...args: unknown[]): void {
    if (this.shouldLog) {
      console.debug('[DEBUG]', new Date().toISOString(), ...args);
    }
  }
  error(...args: unknown[]): void {
    if (this.shouldLog) {
      console.error('[ERROR]', new Date().toISOString(), ...args);
    }
  }
  info(...args: unknown[]): void {
    if (this.shouldLog) {
      console.log('[INFO]', new Date().toISOString(), ...args);
    }
  }
  log(...args: unknown[]): void {
    if (this.shouldLog) {
      console.log('[LOG]', new Date().toISOString(), ...args);
    }
  }
  warn(...args: unknown[]): void {
    if (this.shouldLog) {
      console.warn('[WARN]', new Date().toISOString(), ...args);
    }
  }
}

const openAiAppsChallengeToken = normalizeHeader(
  process.env.OPENAI_APPS_CHALLENGE_TOKEN
);

const FULL_PROFILE_INSTRUCTIONS = `Firecrawl provides tools for web search, URL discovery, page retrieval, site crawling, document parsing, structured extraction, web research, page interaction, monitoring, and research-source lookup. Select a tool when its stated purpose matches the user's explicit request. Feedback tools create private feedback records and should only be used when the user asks to submit feedback.`;
const KEYLESS_PROFILE_INSTRUCTIONS = `Firecrawl starts without authentication with Search, Scrape, and Parse. Account tools require an OAuth connection or Authorization: Bearer <FIRECRAWL_API_KEY>; unavailable tools return recovery guidance. ${FULL_PROFILE_INSTRUCTIONS}`;

// The search surface exposes web/research search only. Its instructions and tool
// copy describe just those tools and stay neutral about how a client uses them.
const SEARCH_PROFILE_INSTRUCTIONS = `Firecrawl provides read-only web and research search tools. The tools return ranked web results, research-paper metadata, citation-graph results, paper passages, or public GitHub content according to the stated purpose of each tool.`;

// The exact set of tools the search surface exposes. Registration is filtered
// against this set, so anything not listed here can never appear on that
// instance's tools/list or be called through it.
const SEARCH_PROFILE_TOOLS = new Set<string>([
  'firecrawl_search',
  'firecrawl_research_search_papers',
  'firecrawl_research_inspect_paper',
  'firecrawl_research_related_papers',
  'firecrawl_research_read_paper',
  'firecrawl_research_search_github',
]);

function makeFullProfile(): ServerProfile {
  const account = getPrimaryEndpoint() === '/v2/mcp-oauth';
  return {
    id: account ? 'account' : 'full',
    resourceName: account ? 'Firecrawl MCP Account' : 'Firecrawl MCP',
    instructions: account ? FULL_PROFILE_INSTRUCTIONS : KEYLESS_PROFILE_INSTRUCTIONS,
    resourceUrl: account
      ? normalizeHeader(process.env.FIRECRAWL_MCP_RESOURCE_URL) ??
        DEFAULT_MCP_OAUTH_RESOURCE_URL
      : getMcpResourceUrl(),
    endpoint: account ? '/v2/mcp-oauth' : undefined,
    port: Number(process.env.PORT || 3000),
    allowKeyless: !account,
    acceptLegacyAudience:
      account && process.env.MCP_OAUTH_ACCEPT_LEGACY_V2_MCP_AUD !== 'false',
  };
}

function makeSearchProfile(): ServerProfile {
  return {
    id: 'search',
    resourceName: 'Firecrawl Search',
    instructions: SEARCH_PROFILE_INSTRUCTIONS,
    resourceUrl: getSearchMcpResourceUrl(),
    endpoint: getSearchMcpEndpoint(),
    port: Number(process.env.FIRECRAWL_MCP_SEARCH_PORT || 3001),
    toolAllowlist: SEARCH_PROFILE_TOOLS,
    allowKeyless: false,
  };
}

function createServer(profile: ServerProfile): FastMCP<SessionData> {
  return new FastMCP<SessionData>({
    name: 'firecrawl-fastmcp',
    version: packageVersion as `${number}.${number}.${number}`,
    instructions: profile.instructions,
    logger: new ConsoleLogger(),
    roots: { enabled: false },
    oauth: {
      enabled: isMcpOAuthEnabled(),
      protectedResource: {
        authorizationServers: [getOAuthIssuer()],
        bearerMethodsSupported: ['header'],
        resource: profile.resourceUrl,
        resourceName: profile.resourceName,
        scopesSupported: ['firecrawl:global'],
      },
    },
    authenticate: makeAuthenticate(profile),
    // Lightweight health endpoint for LB checks
    health: {
      enabled: true,
      message: 'ok',
      path: '/health',
      status: 200,
    },
  });
}

const primaryProfile = makeFullProfile();
const server = createServer(primaryProfile);
type RegisteredTool = Parameters<typeof server.addTool>[0];

const KEYLESS_TOOL_NAMES = new Set([
  'firecrawl_scrape',
  'firecrawl_search',
  'firecrawl_parse',
]);

function isHostedKeylessSession(session?: SessionData): boolean {
  return (
    process.env.CLOUD_SERVICE === 'true' &&
    session?.authType === 'keyless' &&
    !session.firecrawlApiKey
  );
}

function recoveryPayload(code: string): Record<string, unknown> {
  return {
    code,
    auth_mode: code === 'CREDENTIAL_INVALID' ? 'credential_error' : 'keyless',
    message:
      code === 'CREDENTIAL_INVALID'
        ? 'The supplied Firecrawl credential is invalid or revoked. Replace it or reconnect the account, then retry.'
        : 'This tool requires a Firecrawl account or API key. Connect an account or configure Authorization: Bearer <FIRECRAWL_API_KEY>, then retry.',
    available_tools: [...KEYLESS_TOOL_NAMES],
    docs_url: 'https://docs.firecrawl.dev/mcp-server',
    next_actions: [
      { kind: 'connect_account', url: 'https://firecrawl.dev/connect/mcp' },
      {
        kind: 'configure_api_key',
        header: 'Authorization: Bearer <FIRECRAWL_API_KEY>',
      },
    ],
  };
}

type ActionStatus = 'started' | 'success' | 'error';

function preserveParameterDescriptions(parameters: unknown): unknown {
  if (
    !parameters ||
    typeof parameters !== 'object' ||
    !('~standard' in parameters) ||
    !('_zod' in parameters)
  ) {
    return parameters;
  }

  const schema = parameters as z.ZodType;
  const standard = (parameters as any)['~standard'];
  return {
    '~standard': {
      ...standard,
      jsonSchema: {
        input: () => z.toJSONSchema(schema, { target: 'draft-7' }),
      },
    },
  };
}

function emitActionLog(
  toolName: string,
  status: ActionStatus,
  session?: SessionData,
  error?: unknown,
  requestId = randomUUID()
): void {
  if (process.env.CLOUD_SERVICE !== 'true') return;
  const payload = {
    team_id: session?.teamId,
    user_id: session?.userId,
    api_key_id: session?.apiKeyId,
    oauth_client_id: session?.oauthClientId,
    auth_type: session?.authType ?? 'none',
    tool_name: toolName,
    status,
    request_id: requestId,
    resource: primaryProfile.resourceUrl,
    ...(error
      ? { error_class: error instanceof Error ? error.name : typeof error }
      : {}),
  };
  console.error('[MCP_ACTION]', JSON.stringify(payload));

  const secret = normalizeHeader(process.env.FIRECRAWL_MCP_ACTION_LOG_SECRET);
  const apiUrl = normalizeHeader(process.env.FIRECRAWL_API_URL);
  const endpoint =
    normalizeHeader(process.env.FIRECRAWL_MCP_ACTION_LOG_URL) ??
    (apiUrl ? `${withoutTrailingSlash(apiUrl)}/v2/mcp/action-logs` : undefined);
  if (!secret || !endpoint || !payload.team_id || status === 'started') return;
  void fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(1500),
  }).catch(() => undefined);
}

function guardHostedTool(
  tool: RegisteredTool,
  { logActions }: { logActions: boolean }
): RegisteredTool {
  const keylessTool = KEYLESS_TOOL_NAMES.has(tool.name);
  const execute = tool.execute;
  return {
    ...tool,
    parameters: preserveParameterDescriptions(tool.parameters) as any,
    canList: (session: SessionData) =>
      !session?.credentialError &&
      (!isHostedKeylessSession(session) || keylessTool),
    beforeValidate: (_args: unknown, session: SessionData) => {
      const code = session?.credentialError
        ? 'CREDENTIAL_INVALID'
        : isHostedKeylessSession(session) && !keylessTool
          ? 'KEYLESS_TOOL_NOT_AVAILABLE'
          : undefined;
      if (!code) return undefined;
      const payload = recoveryPayload(code);
      return {
        content: [{ type: 'text' as const, text: String(payload.message) }],
        isError: true,
        structuredContent: payload,
      };
    },
    execute: async (args, context) => {
      if (context.session?.credentialError) {
        const payload = recoveryPayload('CREDENTIAL_INVALID');
        throw new UserError(String(payload.message), payload);
      }
      if (isHostedKeylessSession(context.session) && !keylessTool) {
        const payload = recoveryPayload('KEYLESS_TOOL_NOT_AVAILABLE');
        throw new UserError(String(payload.message), payload);
      }
      if (!logActions) return execute(args, context);

      const requestId = randomUUID();
      emitActionLog(tool.name, 'started', context.session, undefined, requestId);
      try {
        const result = await execute(args, context);
        emitActionLog(tool.name, 'success', context.session, undefined, requestId);
        return result;
      } catch (error) {
        emitActionLog(tool.name, 'error', context.session, error, requestId);
        throw error;
      }
    },
  };
}

const addTool = server.addTool.bind(server);
server.addTool = ((tool: RegisteredTool) => {
  addTool(guardHostedTool(tool, { logActions: true }));
}) as typeof server.addTool;

if (openAiAppsChallengeToken) {
  server
    .getApp()
    .get('/.well-known/openai-apps-challenge', (context) =>
      context.text(openAiAppsChallengeToken)
    );
}

server.getApp().get('/ready', (context) => {
  if (process.env.CLOUD_SERVICE !== 'true') {
    return context.json({ ok: true }, 200);
  }
  const missing = [
    'FIRECRAWL_API_URL',
    'FIRECRAWL_OAUTH_INTROSPECT_SECRET',
    'FIRECRAWL_MCP_ACTION_LOG_SECRET',
    'KEYLESS_PROXY_SECRET',
    'MCP_DELEGATED_CREDENTIAL_SECRET',
  ].filter((name) => !normalizeHeader(process.env[name]));
  const configuredEndpoint = getPrimaryEndpoint();
  if (
    withoutTrailingSlash(primaryProfile.resourceUrl).endsWith(
      configuredEndpoint
    ) === false
  ) {
    missing.push('FIRECRAWL_MCP_RESOURCE_URL (endpoint mismatch)');
  }
  return missing.length
    ? context.json({ ok: false, missing }, 503)
    : context.json({ ok: true }, 200);
});

function createClient(apiKey?: string): FirecrawlApp {
  const config: any = {
    ...(process.env.FIRECRAWL_API_URL && {
      apiUrl: process.env.FIRECRAWL_API_URL,
    }),
  };

  // Only add apiKey if it's provided (required for cloud, optional for self-hosted)
  if (apiKey) {
    config.apiKey = apiKey;
  }

  return new FirecrawlApp(config);
}

const ORIGIN = 'mcp-fastmcp';
const ORIGIN_HEADERS = { 'X-Origin': ORIGIN };

// Safe mode is enabled by default for cloud service to comply with ChatGPT safety requirements
const SAFE_MODE = process.env.CLOUD_SERVICE === 'true';

function getClient(session?: SessionData): FirecrawlApp {
  if (process.env.CLOUD_SERVICE === 'true' && !hasCredential(session)) {
    throw new Error('Unauthorized');
  }
  if (!process.env.FIRECRAWL_API_URL && !hasCredential(session)) {
    throw new Error(
      'Unauthorized: API key is required when not using a self-hosted instance'
    );
  }
  if (!hasManagedOAuthCredential(session)) {
    return createClient(credentialForOutboundRequest(session));
  }

  const client = createClient('request-scoped-hosted-oauth');
  const axiosInstance = (client as any).http?.instance;
  if (!axiosInstance?.interceptors?.request?.use) {
    throw new CredentialValidationUnavailableError();
  }
  axiosInstance.interceptors.request.use((config: any) => {
    const credential = credentialForOutboundRequest(session);
    if (!credential) throw new CredentialValidationUnavailableError();
    config.headers = {
      ...(config.headers ?? {}),
      Authorization: `Bearer ${credential}`,
    };
    return config;
  });
  return client;
}

function asText(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

// scrape tool (v2 semantics, minimal args)
// Centralized scrape params (used by scrape, and referenced in search/crawl scrapeOptions)

// Define safe action types
const safeActionTypes = ['wait', 'screenshot', 'scroll', 'scrape'] as const;
const otherActions = [
  'click',
  'write',
  'press',
  'executeJavascript',
  'generatePDF',
] as const;
const allActionTypes = [...safeActionTypes, ...otherActions] as const;

// Use appropriate action types based on safe mode
const allowedActionTypes = SAFE_MODE ? safeActionTypes : allActionTypes;

function buildFormatsArray(
  args: Record<string, unknown>
): Record<string, unknown>[] | undefined {
  const formats = args.formats as string[] | undefined;
  if (!formats || formats.length === 0) return undefined;

  const result: Record<string, unknown>[] = [];
  for (const fmt of formats) {
    if (fmt === 'json') {
      const jsonOpts = args.jsonOptions as Record<string, unknown> | undefined;
      result.push({ type: 'json', ...jsonOpts });
    } else if (fmt === 'query') {
      const queryOpts = args.queryOptions as
        | Record<string, unknown>
        | undefined;
      result.push({ type: 'query', ...queryOpts });
    } else if (fmt === 'screenshot' && args.screenshotOptions) {
      const ssOpts = args.screenshotOptions as Record<string, unknown>;
      result.push({ type: 'screenshot', ...ssOpts });
    } else {
      result.push(fmt as unknown as Record<string, unknown>);
    }
  }
  return result;
}

function buildParsersArray(
  args: Record<string, unknown>
): Record<string, unknown>[] | undefined {
  const parsers = args.parsers as string[] | undefined;
  if (!parsers || parsers.length === 0) return undefined;

  const result: Record<string, unknown>[] = [];
  for (const p of parsers) {
    if (p === 'pdf' && args.pdfOptions) {
      const pdfOpts = args.pdfOptions as Record<string, unknown>;
      result.push({ type: 'pdf', ...pdfOpts });
    } else {
      result.push(p as unknown as Record<string, unknown>);
    }
  }
  return result;
}

function buildWebhook(
  args: Record<string, unknown>
): string | Record<string, unknown> | undefined {
  const webhook = args.webhook as string | undefined;
  if (!webhook) return undefined;
  const headers = args.webhookHeaders as Record<string, string> | undefined;
  if (headers && Object.keys(headers).length > 0) {
    return { url: webhook, headers };
  }
  return webhook;
}

function transformScrapeParams(
  args: Record<string, unknown>
): Record<string, unknown> {
  const out = { ...args };

  const formats = buildFormatsArray(out);
  if (formats) out.formats = formats;

  const parsers = buildParsersArray(out);
  if (parsers) out.parsers = parsers;

  delete out.jsonOptions;
  delete out.queryOptions;
  delete out.screenshotOptions;
  delete out.pdfOptions;

  return out;
}

const scrapeParamsSchema = z.object({
  url: z.url().describe('Public URL of the page to retrieve.'),
  formats: z
    .array(
      z.enum([
        'markdown',
        'html',
        'rawHtml',
        'screenshot',
        'links',
        'summary',
        'changeTracking',
        'branding',
        'json',
        'query',
        'audio',
      ])
    )
    .optional()
    .describe(
      'Output formats to return. Use json with jsonOptions for schema-constrained extraction.'
    ),
  jsonOptions: z
    .object({
      prompt: z.string().optional().describe('Instructions for JSON extraction.'),
      schema: z
        .record(z.string(), z.any())
        .optional()
        .describe('JSON Schema describing the requested structured output.'),
    })
    .optional()
    .describe('Options used when formats includes json.'),
  queryOptions: z
    .object({
      prompt: z
        .string()
        .max(10000)
        .describe('Question to answer from the retrieved page.'),
      mode: z
        .enum(['directQuote', 'freeform'])
        .default('freeform')
        .describe('Return a verbatim passage or a synthesized answer.'),
    })
    .optional()
    .describe('Options used when formats includes query.'),
  screenshotOptions: z
    .object({
      fullPage: z.boolean().optional(),
      quality: z.number().optional(),
      viewport: z.object({ width: z.number(), height: z.number() }).optional(),
    })
    .optional()
    .describe('Screenshot capture options used when formats includes screenshot.'),
  parsers: z
    .array(z.enum(['pdf']))
    .optional()
    .describe('Document parsers to apply when the URL returns a supported file.'),
  pdfOptions: z
    .object({
      maxPages: z.number().int().min(1).max(10000).optional(),
    })
    .optional()
    .describe('PDF parser options.'),
  onlyMainContent: z
    .boolean()
    .optional()
    .describe('Exclude navigation, footers, and other page chrome when possible.'),
  redactPII: z
    .boolean()
    .optional()
    .describe('Attempt to redact personally identifiable information from returned content.'),
  includeTags: z
    .array(z.string())
    .optional()
    .describe('Include content from these HTML tags.'),
  excludeTags: z
    .array(z.string())
    .optional()
    .describe('Exclude content from these HTML tags.'),
  waitFor: z
    .number()
    .min(0)
    .optional()
    .describe('Milliseconds to wait for page rendering before retrieval.'),
  ...(SAFE_MODE
    ? {}
    : {
        actions: z
          .array(
            z.object({
              type: z.enum(allowedActionTypes),
              selector: z.string().optional(),
              milliseconds: z.number().optional(),
              text: z.string().optional(),
              key: z.string().optional(),
              direction: z.enum(['up', 'down']).optional(),
              script: z.string().optional(),
              fullPage: z.boolean().optional(),
            })
          )
          .optional(),
      }),
  mobile: z.boolean().optional().describe('Render the page with a mobile viewport.'),
  skipTlsVerification: z
    .boolean()
    .optional()
    .describe(
      'Skip TLS certificate validation for the target URL. This reduces transport security.'
    ),
  removeBase64Images: z
    .boolean()
    .optional()
    .describe('Remove base64-encoded images from returned content.'),
  location: z
    .object({
      country: z.string().optional(),
      languages: z.array(z.string()).optional(),
    })
    .optional()
    .describe('Coarse country and language settings used to render localized content.'),
  storeInCache: z
    .boolean()
    .optional()
    .describe('Allow Firecrawl to store the retrieved result in its cache.'),
  zeroDataRetention: z
    .boolean()
    .optional()
    .describe('Request processing without retaining page content after completion.'),
  maxAge: z
    .number()
    .min(0)
    .optional()
    .describe('Maximum acceptable cache age in milliseconds before a fresh retrieval.'),
  lockdown: z
    .boolean()
    .optional()
    .describe('Use existing indexed or cached content only and fail on a cache miss.'),
  proxy: z
    .enum(['basic', 'stealth', 'enhanced', 'auto'])
    .optional()
    .describe(
      'Request-routing mode. Non-basic modes may increase latency and credit usage.'
    ),
  profile: z
    .object({
      name: z.string(),
      saveChanges: z.boolean().optional(),
    })
    .optional()
    .describe('Named browser profile to use for the retrieval.'),
});

const parseOptionParamsSchema = z.object({
  formats: z
    .array(
      z.enum([
        'markdown',
        'html',
        'rawHtml',
        'links',
        'summary',
        'json',
        'query',
      ])
    )
    .optional(),
  jsonOptions: z
    .object({
      prompt: z.string().optional(),
      schema: z.record(z.string(), z.any()).optional(),
    })
    .optional(),
  queryOptions: z
    .object({
      prompt: z.string().max(10000),
      mode: z.enum(['directQuote', 'freeform']).default('freeform'),
    })
    .optional(),
  parsers: z.array(z.enum(['pdf'])).optional(),
  pdfOptions: z
    .object({
      maxPages: z.number().int().min(1).max(10000).optional(),
    })
    .optional(),
  onlyMainContent: z.boolean().optional(),
  redactPII: z
    .boolean()
    .optional()
    .describe('Attempt to redact personally identifiable information from returned content.'),
  includeTags: z.array(z.string()).optional(),
  excludeTags: z.array(z.string()).optional(),
  removeBase64Images: z.boolean().optional(),
  skipTlsVerification: z
    .boolean()
    .optional()
    .describe(
      'Skip TLS certificate validation during processing. This reduces transport security.'
    ),
  storeInCache: z
    .boolean()
    .optional()
    .describe('Allow Firecrawl to store the parsed result in its cache.'),
  zeroDataRetention: z
    .boolean()
    .optional()
    .describe('Request processing without retaining document content after completion.'),
  maxAge: z
    .number()
    .min(0)
    .optional()
    .describe('Maximum acceptable cache age in milliseconds.'),
  proxy: z
    .enum(['basic', 'auto'])
    .optional()
    .describe('Request-routing mode used while processing linked resources.'),
});

const localParseParamsSchema = parseOptionParamsSchema.extend({
  filePath: z
    .string()
    .min(1)
    .describe(
      'Absolute or relative path to a local file to parse. Supported: .html, .htm, .pdf, .docx, .doc, .odt, .rtf, .xlsx, .xls'
    ),
  contentType: z
    .string()
    .optional()
    .describe(
      'Optional MIME type override. If omitted, the server infers the file kind from the extension.'
    ),
});

const hostedParseParamsSchema = parseOptionParamsSchema
  .extend({
    filePath: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Phase 1 only: path to the local file on the caller/harness machine. Hosted MCP will not read or stat this path; it is used only to produce upload instructions.'
      ),
    uploadRef: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Phase 2 only: short-lived upload reference returned by phase 1 after the local PUT upload completes.'
      ),
    contentType: z
      .string()
      .optional()
      .describe(
        'Phase 1 MIME type override. If omitted, the server infers it from the file extension without reading the file.'
      ),
    declaredSizeBytes: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'Optional phase 1 size declaration. Hosted MCP does not stat the file; provide this only if the caller already knows it.'
      ),
  })
  .superRefine((value, ctx) => {
    const hasFilePath =
      typeof value.filePath === 'string' && value.filePath.length > 0;
    const hasUploadRef =
      typeof value.uploadRef === 'string' && value.uploadRef.length > 0;
    if (hasFilePath === hasUploadRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Hosted firecrawl_parse requires exactly one of filePath (phase 1) or uploadRef (phase 2).',
        path: hasFilePath && hasUploadRef ? ['uploadRef'] : ['filePath'],
      });
    }
  });

const parseParamsSchema =
  process.env.CLOUD_SERVICE === 'true'
    ? hostedParseParamsSchema
    : localParseParamsSchema;

const EXTENSION_CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.htm': 'text/html',
  '.xhtml': 'application/xhtml+xml',
  '.pdf': 'application/pdf',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.rtf': 'application/rtf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
};

function inferContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return EXTENSION_CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

type ParseToolArgs = {
  filePath?: string;
  uploadRef?: string;
  contentType?: string;
  declaredSizeBytes?: number;
} & Record<string, unknown>;

function extractParseOptions(args: ParseToolArgs): Record<string, unknown> {
  const options = { ...args };
  delete options.filePath;
  delete options.uploadRef;
  delete options.contentType;
  delete options.declaredSizeBytes;
  return options;
}

function buildParseOptionsPayload(
  options: Record<string, unknown>
): Record<string, unknown> {
  const transformed = transformScrapeParams(options);
  const cleaned = removeEmptyTopLevel(transformed) as Record<string, unknown>;
  return { origin: ORIGIN, ...cleaned };
}

function buildContinuationArguments(
  uploadRef: string,
  options: Record<string, unknown>
): Record<string, unknown> {
  return {
    uploadRef,
    ...(removeEmptyTopLevel(options) as Record<string, unknown>),
  };
}

function shellQuote(value: string): string {
  if (value.length === 0) return "''";
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

type ParseUploadUrlData = {
  uploadUrl: string;
  uploadRef: string;
  method?: string;
  headers?: Record<string, string>;
  fields?: Record<string, string>;
  expiresAt?: string;
  maxSizeBytes?: number;
};

function parseApiData(json: any): any {
  return json && typeof json === 'object' && 'data' in json ? json.data : json;
}

async function apiPostJson(
  pathName: string,
  body: Record<string, unknown>,
  apiKey: string
): Promise<any> {
  const response = await fetch(`${resolveApiBaseUrl()}${pathName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const responseText = await response.text();
  let parsed: any;
  try {
    parsed = responseText ? JSON.parse(responseText) : {};
  } catch {
    parsed = { raw: responseText };
  }
  if (!response.ok) {
    throw new Error(
      parsed?.error ||
        parsed?.message ||
        `Firecrawl request failed (HTTP ${response.status})`
    );
  }
  return parsed;
}

async function apiPostJsonForSession(
  pathName: string,
  body: Record<string, unknown>,
  session: SessionData | undefined
): Promise<any> {
  const credential = credentialForOutboundRequest(session);
  if (credential) {
    return apiPostJson(pathName, body, credential);
  }

  if (isKeylessMode(session)) {
    return keylessPost(pathName, body, session);
  }

  throw new Error(
    'Firecrawl credentials or keyless eligibility required for hosted parse.'
  );
}

function buildCurlUploadCommand(
  filePath: string,
  upload: ParseUploadUrlData
): string {
  const method = upload.method ?? 'PUT';
  const headerArgs = Object.entries(upload.headers ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `-H ${shellQuote(`${key}: ${value}`)}`);

  if (method.toUpperCase() === 'POST' && upload.fields) {
    const fieldArgs = Object.entries(upload.fields)
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([key, value]) => ['-F', shellQuote(`${key}=${value}`)]);
    return [
      'curl',
      '-X',
      shellQuote('POST'),
      ...headerArgs,
      ...fieldArgs,
      '-F',
      shellQuote(`file=@${filePath}`),
      shellQuote(upload.uploadUrl),
    ].join(' ');
  }

  return [
    'curl',
    '-X',
    shellQuote(method),
    ...headerArgs,
    '--upload-file',
    shellQuote(filePath),
    shellQuote(upload.uploadUrl),
  ].join(' ');
}

async function executeHostedParse(
  args: ParseToolArgs,
  session: SessionData | undefined,
  log: ToolLogger
): Promise<string> {
  const hasFilePath =
    typeof args.filePath === 'string' && args.filePath.length > 0;
  const hasUploadRef =
    typeof args.uploadRef === 'string' && args.uploadRef.length > 0;
  if (hasFilePath === hasUploadRef) {
    throw new Error(
      'Hosted firecrawl_parse requires exactly one of filePath or uploadRef.'
    );
  }

  if (!hasCredential(session) && !isKeylessMode(session)) {
    return asText({
      success: false,
      mode: 'hosted-upload-ref-auth-required',
      message:
        'Hosted firecrawl_parse requires an authenticated Firecrawl session or keyless eligibility before a local file upload URL can be minted. Connect a Firecrawl account, provide an API key, or use keyless hosted MCP while eligible, then call firecrawl_parse again.',
    });
  }

  const options = extractParseOptions(args);

  if (hasFilePath && args.filePath) {
    const filename = path.basename(args.filePath);
    const contentType =
      typeof args.contentType === 'string' && args.contentType.length > 0
        ? args.contentType
        : inferContentType(filename);
    const uploadRequest = removeEmptyTopLevel({
      filename,
      contentType,
      declaredSizeBytes: args.declaredSizeBytes,
    }) as Record<string, unknown>;

    log.info('Creating hosted parse upload URL', { filename, contentType });
    const uploadJson = await apiPostJsonForSession(
      '/v2/parse/upload-url',
      uploadRequest,
      session
    );
    const upload = parseApiData(uploadJson) as ParseUploadUrlData;
    if (!upload?.uploadUrl || !upload?.uploadRef) {
      throw new Error(
        'Firecrawl upload-url response did not include uploadUrl and uploadRef'
      );
    }
    const uploadHeaders =
      upload.headers && Object.keys(upload.headers).length > 0
        ? upload.headers
        : (upload.method ?? 'PUT').toUpperCase() === 'POST'
          ? {}
          : { 'Content-Type': contentType };
    const uploadForCommand = { ...upload, headers: uploadHeaders };

    return asText({
      success: true,
      mode: 'hosted-upload-ref-awaiting-upload',
      message:
        'Hosted MCP cannot read local files. Run the local upload command, then call firecrawl_parse again with uploadRef. No Firecrawl API key is included in this command.',
      upload: {
        command: buildCurlUploadCommand(args.filePath, uploadForCommand),
        method: upload.method ?? 'PUT',
        headers: uploadHeaders,
        fields: upload.fields,
        uploadUrl: upload.uploadUrl,
        uploadRef: upload.uploadRef,
        expiresAt: upload.expiresAt,
        maxSizeBytes: upload.maxSizeBytes,
      },
      nextToolCall: {
        name: 'firecrawl_parse',
        arguments: buildContinuationArguments(upload.uploadRef, options),
      },
      notes: [
        'Run the curl command on the machine that can read filePath.',
        'After the PUT succeeds, use nextToolCall as the second MCP tool call.',
        'Clients without a local upload mechanism cannot complete hosted parse for local files.',
      ],
    });
  }

  const parsePayload = {
    uploadRef: args.uploadRef as string,
    ...buildParseOptionsPayload(options),
  };
  log.info('Parsing hosted upload reference');
  const parseJson = await apiPostJsonForSession(
    '/v2/parse',
    parsePayload,
    session
  );
  return asText(parseJson);
}

server.addTool({
  name: 'firecrawl_scrape',
  annotations: {
    title: 'Scrape a URL',
    readOnlyHint: SAFE_MODE, // Fetches page content only; in cloud/safe mode interactive browser actions are disabled.
    openWorldHint: true, // Accepts any user-supplied URL on the public web.
    destructiveHint: false, // Does not modify, delete, or write to external websites.
  },
  description: `
Retrieve content from a URL in the requested \`formats\`, such as markdown, \`json\` with a schema, summary, or screenshot.
Use for a known page URL. Returns each requested format plus page metadata.
${
  SAFE_MODE
    ? 'Interactive browser actions are unavailable on this hosted surface.'
    : ''
}
`,
  parameters: scrapeParamsSchema,
  execute: async (args: unknown, { session, log }): Promise<string> => {
    const { url, ...options } = args as { url: string } & Record<
      string,
      unknown
    >;
    const transformed = transformScrapeParams(
      options as Record<string, unknown>
    );
    const cleaned = removeEmptyTopLevel(transformed);
    if (cleaned.lockdown) {
      log.info('Scraping URL (lockdown)');
    } else {
      log.info('Scraping URL', { url: String(url) });
    }
    if (isKeylessMode(session)) {
      const json = await keylessPost(
        '/v2/scrape',
        {
          url: String(url),
          ...cleaned,
          origin: ORIGIN,
        },
        session
      );
      return asText(json?.data ?? json);
    }
    const client = getClient(session);
    const res = await client.scrape(String(url), {
      ...cleaned,
      origin: ORIGIN,
    } as any);
    return asText(res);
  },
});

server.addTool({
  name: 'firecrawl_map',
  annotations: {
    title: 'Map a website',
    readOnlyHint: true, // Discovers and returns indexed URLs; does not modify the target site.
    openWorldHint: true, // Operates against arbitrary user-supplied web domains.
    destructiveHint: false, // Read-only discovery; no deletion or destructive updates.
  },
  description: `
Discover URLs on a website and return them as a list without retrieving each page's content.
Use for a site's URL inventory or to locate a page within a site; optional \`search\` filters discovered URLs by topic. Returns a URL list with optional title and description per link.
`,
  parameters: z.object({
    url: z.url().describe('Website URL to map.'),
    search: z
      .string()
      .optional()
      .describe('Optional topic used to rank and filter discovered URLs.'),
    sitemap: z
      .enum(['include', 'skip', 'only'])
      .optional()
      .describe('Whether to skip, include, or exclusively use sitemap URLs.'),
    includeSubdomains: z
      .boolean()
      .optional()
      .describe('Include URLs on subdomains of the supplied hostname.'),
    limit: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Maximum number of URLs to return.'),
    ignoreQueryParameters: z
      .boolean()
      .optional()
      .describe('Treat URLs that differ only by query parameters as the same page.'),
  }),
  execute: async (args: unknown, { session, log }): Promise<string> => {
    const { url, ...options } = args as { url: string } & Record<
      string,
      unknown
    >;
    const client = getClient(session);
    const cleaned = removeEmptyTopLevel(options as Record<string, unknown>);
    log.info('Mapping URL', { url: String(url) });
    const res = await client.map(String(url), {
      ...cleaned,
      origin: ORIGIN,
    } as any);
    return asText(res);
  },
});

server.addTool({
  name: 'firecrawl_search',
  annotations: {
    title: 'Search the web',
    readOnlyHint: true, // Runs a web search and returns results; does not modify external sites.
    openWorldHint: true, // Searches the open web across arbitrary domains and sources.
    destructiveHint: false, // Query-only; no destructive side effects on external entities.
  },
  description: `
Search web, news, image, and specialized indexes and return ranked results for a query.
Optional filters: domains, sources, categories, location, time. Optional \`highlights\` for query-relevant excerpts (omit for API default; \`false\` for original snippets). Optional \`scrapeOptions\` for retrieved page content.
Returns a search \`id\` and credit usage when provided.
`,
  parameters: z
    .object({
      ...searchToolBaseFields,
      scrapeOptions: scrapeParamsSchema
        .omit({ url: true })
        .partial()
        .optional()
        .describe('Optional page-retrieval settings applied to each search result.'),
    })
    .refine(searchDomainsAreExclusive, SEARCH_DOMAINS_CONFLICT_MESSAGE),
  execute: async (args: unknown, { session, log }): Promise<string> => {
    const { query, ...opts } = args as Record<string, unknown>;

    const searchOpts = { ...opts } as Record<string, unknown>;
    const includeDomains = searchOpts.includeDomains as string[] | undefined;
    const excludeDomains = searchOpts.excludeDomains as string[] | undefined;
    delete searchOpts.includeDomains;
    delete searchOpts.excludeDomains;

    if (searchOpts.scrapeOptions) {
      searchOpts.scrapeOptions = transformScrapeParams(
        searchOpts.scrapeOptions as Record<string, unknown>
      );
    }

    const cleaned = removeEmptyTopLevel(searchOpts);
    const searchQuery = buildSearchQueryWithDomains(
      query as string,
      includeDomains,
      excludeDomains
    );
    log.info('Searching', { query: searchQuery });
    const searchBody = {
      query: searchQuery,
      ...(cleaned as any),
      origin: ORIGIN,
    };
    if (isKeylessMode(session)) {
      const json = await keylessPost('/v2/search', searchBody, session);
      return asText(json ?? {});
    }
    // Call /v2/search through the SDK's HTTP layer (auth + retries) instead
    // of `client.search()` so we preserve the full response envelope,
    // including the id needed if the user later requests feedback submission.
    const client = getClient(session);
    const httpRes = await (client as any).http.post('/v2/search', searchBody);
    return asText(httpRes?.data ?? {});
  },
});

const DEFAULT_CLOUD_API_URL = 'https://api.firecrawl.dev';

function resolveApiBaseUrl(): string {
  return (process.env.FIRECRAWL_API_URL || DEFAULT_CLOUD_API_URL).replace(
    /\/$/,
    ''
  );
}

// Keyless free tier: when no credential is configured and we're targeting the
// Firecrawl cloud (not self-hosted via FIRECRAWL_API_URL, not the multi-tenant
// CLOUD_SERVICE deployment), scrape and search are free, rate-limited per IP.
// The cloud only grants this when NO Authorization header is sent, so we bypass
// the SDK — which always attaches a Bearer header — and post directly.
/** Best-effort end-user client IP from the incoming MCP request headers. */
function extractClientIp(request?: {
  headers: IncomingHttpHeaders;
}): string | undefined {
  const xff = request?.headers?.['x-forwarded-for'];
  const raw = Array.isArray(xff) ? xff[0] : xff;
  const first = typeof raw === 'string' ? raw.split(',')[0].trim() : undefined;
  return first || undefined;
}

/**
 * Read-only check (no quota consumed) of whether a client IP can still use the
 * keyless free tier, via the API's secret-gated eligibility endpoint. Fails
 * closed: anything other than a clear "eligible: true" means fall through to the
 * OAuth challenge rather than silently granting keyless.
 */
async function keylessEligible(clientIp: string): Promise<boolean> {
  const secret = process.env.KEYLESS_PROXY_SECRET;
  if (!secret) return false;
  try {
    const response = await fetch(
      `${resolveApiBaseUrl()}/v2/keyless/eligibility`,
      {
        headers: {
          ...ORIGIN_HEADERS,
          'x-firecrawl-keyless-ip': clientIp,
          'x-firecrawl-keyless-secret': secret,
        },
      }
    );
    if (!response.ok) return false;
    const json: any = await response.json().catch(() => ({}));
    return json?.eligible === true;
  } catch {
    return false;
  }
}

function isKeylessMode(session?: SessionData): boolean {
  if (hasCredential(session) || session?.credentialError) return false;
  if (process.env.CLOUD_SERVICE === 'true') {
    return session?.authType === 'keyless';
  }
  // Local/stdio against the cloud (not a self-hosted FIRECRAWL_API_URL).
  return !process.env.FIRECRAWL_API_URL;
}

async function keylessPost(
  path: string,
  body: Record<string, unknown>,
  session?: SessionData
): Promise<any> {
  if (
    isHostedKeylessSession(session) &&
    (!session?.keylessClientIp || !(await keylessEligible(session.keylessClientIp)))
  ) {
    const payload = recoveryPayload('KEYLESS_ACCESS_NOT_AVAILABLE');
    throw new UserError(String(payload.message), payload);
  }
  const headers: Record<string, string> = {
    ...ORIGIN_HEADERS,
    'Content-Type': 'application/json',
  };
  // Forward the real client IP (secret-authenticated) when proxying keyless
  // requests through the hosted MCP, so the API rate-limits per real IP.
  if (session?.keylessClientIp && process.env.KEYLESS_PROXY_SECRET) {
    headers['x-firecrawl-keyless-ip'] = session.keylessClientIp;
    headers['x-firecrawl-keyless-secret'] = process.env.KEYLESS_PROXY_SECRET;
  }
  const response = await fetch(`${resolveApiBaseUrl()}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const json: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (isHostedKeylessSession(session) && [401, 402, 429].includes(response.status)) {
      const payload = recoveryPayload('KEYLESS_QUOTA_EXHAUSTED');
      throw new UserError(String(payload.message), payload);
    }
    throw new Error(
      json?.error || `Firecrawl request failed (HTTP ${response.status})`
    );
  }
  return json;
}

async function getCrawlStatusWithOrigin(
  client: FirecrawlApp,
  jobId: string
): Promise<Record<string, unknown>> {
  const res = await (client as any).http.get(
    `/v2/crawl/${encodeURIComponent(jobId)}`,
    ORIGIN_HEADERS
  );
  const body = (res?.data ?? {}) as any;
  const initialDocs = Array.isArray(body.data) ? body.data : [];

  if (!body.next) {
    return {
      id: jobId,
      status: body.status,
      completed: body.completed ?? 0,
      total: body.total ?? 0,
      creditsUsed: body.creditsUsed,
      expiresAt: body.expiresAt,
      next: body.next ?? null,
      data: initialDocs,
    };
  }

  const docs = initialDocs.slice();
  let current = body.next as string | null;
  while (current) {
    const pageRes = await (client as any).http.get(current, ORIGIN_HEADERS);
    const payload = (pageRes?.data ?? {}) as any;
    if (!payload.success) break;

    const pageData = Array.isArray(payload.data)
      ? payload.data
      : payload.data?.pages || [];
    docs.push(...pageData);
    current =
      payload.next ??
      (Array.isArray(payload.data) ? null : payload.data?.next) ??
      null;
  }

  return {
    id: jobId,
    status: body.status,
    completed: body.completed ?? 0,
    total: body.total ?? 0,
    creditsUsed: body.creditsUsed,
    expiresAt: body.expiresAt,
    next: null,
    data: docs,
  };
}

async function waitForCrawlCompletionWithOrigin(
  client: FirecrawlApp,
  jobId: string,
  pollInterval = 2,
  timeout?: number
): Promise<Record<string, unknown>> {
  const startedAt = Date.now();
  for (;;) {
    const status = await getCrawlStatusWithOrigin(client, jobId);
    if (
      ['completed', 'failed', 'cancelled'].includes(String(status.status ?? ''))
    ) {
      return status;
    }
    if (timeout != null && Date.now() - startedAt > timeout * 1000) {
      throw new Error(`Crawl job ${jobId} did not complete within ${timeout}s`);
    }
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(1000, pollInterval * 1000))
    );
  }
}

const feedbackIssueSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(
    /^[a-z0-9][a-z0-9_-]*$/,
    'Issue codes must use lowercase letters, numbers, underscores, or hyphens'
  );

const valuableSourceSchema = z.object({
  url: z.url(),
  reason: z.string().max(1000).optional(),
});

const missingContentSchema = z.object({
  topic: z
    .string()
    .min(1, 'topic must not be empty')
    .max(200, 'topic must be 200 characters or fewer'),
  description: z.string().max(2000).optional(),
});

const FEEDBACK_DISABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);

function feedbackEnvEnabled(...keys: string[]): boolean {
  return keys.some((key) =>
    FEEDBACK_DISABLED_VALUES.has((process.env[key] || '').trim().toLowerCase())
  );
}

const SEARCH_FEEDBACK_DISABLED = feedbackEnvEnabled(
  'FIRECRAWL_NO_SEARCH_FEEDBACK',
  'FIRECRAWL_DISABLE_SEARCH_FEEDBACK'
);

const ENDPOINT_FEEDBACK_DISABLED = feedbackEnvEnabled(
  'FIRECRAWL_NO_ENDPOINT_FEEDBACK',
  'FIRECRAWL_DISABLE_ENDPOINT_FEEDBACK'
);

if (SEARCH_FEEDBACK_DISABLED) {
  console.error(
    '[firecrawl-mcp] Search feedback tool disabled by FIRECRAWL_NO_SEARCH_FEEDBACK; firecrawl_search_feedback will not be registered.'
  );
}

if (!SEARCH_FEEDBACK_DISABLED) {
  server.addTool({
    name: 'firecrawl_search_feedback',
    annotations: {
      title: 'Send feedback on a search result',
      readOnlyHint: false, // POSTs structured feedback to the API, creating a server-side record.
      openWorldHint: true, // Feedback references open-web search results and external URLs.
      destructiveHint: false, // Additive only; records feedback and may refund credits, does not delete data.
    },
    description: `
Submit quality feedback about a previous \`firecrawl_search\` result. This creates a private feedback record, so use it only when the user explicitly asks to submit feedback.
Pass \`searchId\` (the search response's top-level \`id\`), a rating, and concise assessment details. The first accepted feedback for a search id refunds 1 credit (a search costs 2); later submissions for the same id are idempotent and no additional credits are refunded.
Feedback is accepted for roughly two minutes after the search. When the response sets \`dailyCapReached\`, stop requesting refunds for the rest of the UTC day. A 4xx response is terminal and should not be retried.
`,
    parameters: z.object({
      searchId: z
        .uuid('searchId must be the UUID returned by firecrawl_search')
        .describe('Search response ID that the user is evaluating.'),
      rating: z
        .enum(['good', 'bad', 'partial'])
        .describe("User's overall assessment of the search results."),
      valuableSources: z
        .array(
          z.object({
            url: z.url().describe('Result URL the user found useful.'),
            reason: z
              .string()
              .max(1000)
              .optional()
              .describe('Why the user found this result useful.'),
          })
        )
        .max(50)
        .optional()
        .describe('Search result URLs the user identified as useful.'),
      missingContent: z
        .array(
          z.object({
            topic: z
              .string()
              .min(1, 'topic must not be empty')
              .max(200, 'topic must be 200 characters or fewer'),
            description: z.string().max(2000).optional(),
          })
        )
        .max(20)
        .optional()
        .describe(
          'Array of specific pieces of content the agent expected to find but did not. ' +
            'One entry per distinct topic. Each entry has a short `topic` and optional ' +
            'longer `description`.'
        ),
      querySuggestions: z
        .string()
        .max(2000)
        .optional()
        .describe('User-provided suggestion for improving the query or result ordering.'),
    }),
    execute: async (args: unknown, { session, log }): Promise<string> => {
      const {
        searchId,
        rating,
        valuableSources,
        missingContent,
        querySuggestions,
      } = args as {
        searchId: string;
        rating: 'good' | 'bad' | 'partial';
        valuableSources?: { url: string; reason?: string }[];
        missingContent?: { topic: string; description?: string }[];
        querySuggestions?: string;
      };

      const apiBase = resolveApiBaseUrl();
      const endpoint = `${apiBase}/v2/search/${encodeURIComponent(
        searchId
      )}/feedback`;

      const body: Record<string, unknown> = {
        rating,
        origin: ORIGIN,
      };
      if (valuableSources && valuableSources.length > 0) {
        body.valuableSources = valuableSources;
      }
      if (missingContent && missingContent.length > 0) {
        body.missingContent = missingContent;
      }
      if (querySuggestions) body.querySuggestions = querySuggestions;

      const headers: Record<string, string> = {
        ...ORIGIN_HEADERS,
        'Content-Type': 'application/json',
      };
      const credential = credentialForOutboundRequest(session);
      if (credential) {
        headers['Authorization'] = `Bearer ${credential}`;
      } else if (process.env.CLOUD_SERVICE === 'true') {
        throw new Error('Unauthorized: missing API key for search feedback.');
      }

      log.info('Submitting search feedback', { searchId, rating });
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      const responseText = await response.text();
      let parsed: any;
      try {
        parsed = JSON.parse(responseText);
      } catch {
        parsed = { raw: responseText };
      }

      // 4xx is terminal; surface a structured payload (with retryable=false)
      // so agents do not retry-loop on substantive-feedback rejections,
      // expired windows, etc.
      if (!response.ok) {
        log.warn('Search feedback rejected', {
          status: response.status,
          feedbackErrorCode: parsed?.feedbackErrorCode,
        });
        return asText({
          success: false,
          status: response.status,
          feedbackErrorCode: parsed?.feedbackErrorCode,
          error: parsed?.error ?? `HTTP ${response.status}`,
          retryable: response.status >= 500,
        });
      }

      return asText(parsed);
    },
  });
}

if (ENDPOINT_FEEDBACK_DISABLED) {
  console.error(
    '[firecrawl-mcp] Endpoint feedback tool disabled by FIRECRAWL_NO_ENDPOINT_FEEDBACK; firecrawl_feedback will not be registered.'
  );
}

if (!ENDPOINT_FEEDBACK_DISABLED) {
  server.addTool({
    name: 'firecrawl_feedback',
    annotations: {
      title: 'Send feedback on a Firecrawl job',
      readOnlyHint: false, // POSTs structured feedback for a completed job to /v2/feedback.
      openWorldHint: true, // Feedback is tied to jobs that processed open-web URLs.
      destructiveHint: false, // Additive only; submits ratings and notes, does not delete jobs or external content.
    },
    description: `
Submit quality feedback for a completed search, scrape, parse, or map job. This creates a private feedback record, so use it only when the user explicitly asks to submit feedback.
Include only concise confirmed details; do not include full page contents, credentials, or unrelated personal data. Returns \`creditsRefunded\` and may include daily-cap fields.
`,
    parameters: z.object({
      endpoint: z
        .enum(['search', 'scrape', 'parse', 'map'])
        .describe('Endpoint that produced the evaluated job.'),
      jobId: z
        .uuid('jobId must be the UUID returned by Firecrawl')
        .describe('Job ID returned by the evaluated endpoint.'),
      rating: z
        .enum(['good', 'bad', 'partial'])
        .describe("User's overall assessment of the job result."),
      issues: z.array(feedbackIssueSchema).max(20).optional(),
      tags: z.array(feedbackIssueSchema).max(20).optional(),
      note: z
        .string()
        .max(4000)
        .optional()
        .describe('Concise feedback note supplied or confirmed by the user.'),
      valuableSources: z.array(valuableSourceSchema).max(50).optional(),
      missingContent: z.array(missingContentSchema).max(50).optional(),
      querySuggestions: z.string().max(2000).optional(),
      url: z.url().optional(),
      pageNumbers: z.array(z.number().int().positive()).max(100).optional(),
      metadata: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Small, non-sensitive contextual fields relevant to the feedback.'),
    }),
    execute: async (args: unknown, { session, log }): Promise<string> => {
      const {
        endpoint,
        jobId,
        rating,
        issues,
        tags,
        note,
        valuableSources,
        missingContent,
        querySuggestions,
        url,
        pageNumbers,
        metadata,
      } = args as {
        endpoint: 'search' | 'scrape' | 'parse' | 'map';
        jobId: string;
        rating: 'good' | 'bad' | 'partial';
        issues?: string[];
        tags?: string[];
        note?: string;
        valuableSources?: { url: string; reason?: string }[];
        missingContent?: { topic: string; description?: string }[];
        querySuggestions?: string;
        url?: string;
        pageNumbers?: number[];
        metadata?: Record<string, unknown>;
      };

      const apiBase = resolveApiBaseUrl();
      const headers: Record<string, string> = {
        ...ORIGIN_HEADERS,
        'Content-Type': 'application/json',
      };
      const credential = credentialForOutboundRequest(session);
      if (credential) {
        headers['Authorization'] = `Bearer ${credential}`;
      } else if (process.env.CLOUD_SERVICE === 'true') {
        throw new Error('Unauthorized: missing API key for feedback.');
      }

      const body = removeEmptyTopLevel({
        endpoint,
        jobId,
        rating,
        issues,
        tags,
        note,
        valuableSources,
        missingContent,
        querySuggestions,
        url,
        pageNumbers,
        metadata,
        origin: ORIGIN,
      });

      log.info('Submitting endpoint feedback', { endpoint, jobId, rating });
      const response = await fetch(`${apiBase}/v2/feedback`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      const responseText = await response.text();
      let parsed: any;
      try {
        parsed = JSON.parse(responseText);
      } catch {
        parsed = { raw: responseText };
      }

      if (!response.ok) {
        log.warn('Endpoint feedback rejected', {
          status: response.status,
          feedbackErrorCode: parsed?.feedbackErrorCode,
        });
        return asText({
          success: false,
          status: response.status,
          feedbackErrorCode: parsed?.feedbackErrorCode,
          error: parsed?.error ?? `HTTP ${response.status}`,
          retryable: response.status >= 500,
        });
      }

      return asText(parsed);
    },
  });
}

server.addTool({
  name: 'firecrawl_crawl',
  annotations: {
    title: 'Run a site crawl',
    readOnlyHint: false, // Starts a server-side crawl job and polls until the job reaches a terminal state.
    openWorldHint: true, // Crawls user-specified URLs across the public web.
    destructiveHint: false, // Reads pages from target sites; does not delete or alter external websites.
  },
  description: `
Start a crawl at a URL, retrieve content from matching linked pages, wait for the crawl to finish, and return the final status and collected data.
Use for multiple related pages on a site. Scope with \`includePaths\`, \`excludePaths\`, \`maxDiscoveryDepth\`, and \`limit\`. Returns crawl \`id\`, status, and collected page data; responses can be large, so keep \`limit\` tight.
 ${
   SAFE_MODE
    ? 'Webhooks and interactive browser actions are unavailable on this hosted surface.'
     : ''
 }
 `,
  parameters: z.object({
    url: z.url().describe('URL where the crawl begins.'),
    prompt: z
      .string()
      .optional()
      .describe('Optional natural-language instructions for selecting crawl scope.'),
    excludePaths: z
      .array(z.string())
      .optional()
      .describe('URL path patterns to exclude from the crawl.'),
    includePaths: z
      .array(z.string())
      .optional()
      .describe('URL path patterns eligible for the crawl.'),
    maxDiscoveryDepth: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Maximum link depth from the starting URL.'),
    sitemap: z
      .enum(['skip', 'include', 'only'])
      .optional()
      .describe('Whether to skip, include, or exclusively use sitemap URLs.'),
    limit: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Maximum number of pages to process.'),
    allowExternalLinks: z
      .boolean()
      .optional()
      .describe('Allow the crawl to follow links outside the starting domain.'),
    allowSubdomains: z
      .boolean()
      .optional()
      .describe('Allow the crawl to follow links on subdomains.'),
    crawlEntireDomain: z
      .boolean()
      .optional()
      .describe('Allow discovery outside the starting URL path on the same domain.'),
    delay: z
      .number()
      .min(0)
      .optional()
      .describe('Delay in seconds between page requests.'),
    maxConcurrency: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Maximum number of concurrent page requests.'),
    ...(SAFE_MODE
      ? {}
      : {
          webhook: z
            .url()
            .optional()
            .describe('Webhook URL that receives crawl events. Sends data outside Firecrawl.'),
          webhookHeaders: z
            .record(z.string(), z.string())
            .optional()
            .describe('Headers sent to the webhook URL. Do not include secrets unless requested.'),
        }),
    deduplicateSimilarURLs: z.boolean().optional(),
    ignoreQueryParameters: z.boolean().optional(),
    scrapeOptions: scrapeParamsSchema.omit({ url: true }).partial().optional(),
  }),
  execute: async (args, { session, log }) => {
    const { url, ...options } = args as Record<string, unknown>;
    const client = getClient(session);

    const opts = { ...options } as Record<string, unknown>;
    if (opts.scrapeOptions) {
      opts.scrapeOptions = transformScrapeParams(
        opts.scrapeOptions as Record<string, unknown>
      );
    }

    const webhook = buildWebhook(opts);
    if (webhook) opts.webhook = webhook;
    delete opts.webhookHeaders;

    const cleaned = removeEmptyTopLevel(opts);
    const pollInterval =
      typeof cleaned.pollInterval === 'number'
        ? (cleaned.pollInterval as number)
        : 2;
    const timeout =
      typeof cleaned.timeout === 'number'
        ? (cleaned.timeout as number)
        : undefined;
    delete (cleaned as Record<string, unknown>).pollInterval;
    delete (cleaned as Record<string, unknown>).timeout;

    log.info('Starting crawl', { url: String(url) });
    const started = await (client as any).http.post('/v2/crawl', {
      url: String(url),
      ...(cleaned as Record<string, unknown>),
      origin: ORIGIN,
    });
    const crawlId = started?.data?.id;
    if (!crawlId) {
      return asText(started?.data ?? {});
    }
    const res = await waitForCrawlCompletionWithOrigin(
      client,
      crawlId,
      pollInterval,
      timeout
    );
    return asText(res);
  },
});

server.addTool({
  name: 'firecrawl_check_crawl_status',
  annotations: {
    title: 'Get crawl status',
    readOnlyHint: true, // Retrieves status and results for an existing crawl job by ID; no mutations.
    openWorldHint: false, // Queries only Firecrawl job state within the authenticated account.
    destructiveHint: false, // Status lookup only; no deletes or updates.
  },
  description: `
Retrieve status, progress, and available results for an existing crawl job by its \`id\`.
`,
  parameters: z.object({
    id: z.string().describe('Crawl job ID returned by firecrawl_crawl or the API.'),
  }),
  execute: async (
    args: unknown,
    { session }: { session?: SessionData }
  ): Promise<string> => {
    const client = getClient(session);
    const id = (args as any).id as string;
    const res = await getCrawlStatusWithOrigin(client, id);
    return asText(res);
  },
});

server.addTool({
  name: 'firecrawl_extract',
  annotations: {
    title: 'Extract structured data',
    readOnlyHint: true, // Uses LLM extraction to pull structured data from URLs without modifying those sites.
    openWorldHint: true, // Accepts arbitrary user-supplied URLs on the public web.
    destructiveHint: false, // Read-only extraction; no destructive changes to external content.
  },
  description: `
Extract structured data from one or more specified web pages according to a prompt or JSON Schema.
Use when URLs are known and a consistent data structure is needed across those pages. Optional link, subdomain, and web-search settings can broaden the sources used for extraction. Returns an extraction result whose \`data\` matches the prompt or schema.
`,
  parameters: z.object({
    urls: z.array(z.url()).min(1).describe('Web pages to process.'),
    prompt: z
      .string()
      .optional()
      .describe('Natural-language instructions describing the data to extract.'),
    schema: z
      .record(z.string(), z.any())
      .optional()
      .describe('JSON Schema describing the structured output.'),
    allowExternalLinks: z
      .boolean()
      .optional()
      .describe('Allow extraction to follow links outside the supplied URL domains.'),
    enableWebSearch: z
      .boolean()
      .optional()
      .describe('Allow web search to supply additional sources for the extraction.'),
    includeSubdomains: z
      .boolean()
      .optional()
      .describe('Allow extraction from subdomains of the supplied URLs.'),
  }),
  execute: async (args: unknown, { session, log }): Promise<string> => {
    const client = getClient(session);
    const a = args as Record<string, unknown>;
    log.info('Extracting from URLs', {
      count: Array.isArray(a.urls) ? a.urls.length : 0,
    });
    const extractBody = removeEmptyTopLevel({
      urls: a.urls as string[],
      prompt: a.prompt as string | undefined,
      schema: (a.schema as Record<string, unknown>) || undefined,
      allowExternalLinks: a.allowExternalLinks as boolean | undefined,
      enableWebSearch: a.enableWebSearch as boolean | undefined,
      includeSubdomains: a.includeSubdomains as boolean | undefined,
      origin: ORIGIN,
    });
    const res = await client.extract(extractBody as any);
    return asText(res);
  },
});

server.addTool({
  name: 'firecrawl_agent',
  annotations: {
    title: 'Start a research agent',
    readOnlyHint: false, // Starts an autonomous research agent job on the Firecrawl API.
    openWorldHint: true, // The agent browses and searches the open web to fulfill the prompt.
    destructiveHint: false, // Gathers information only; does not delete external data or user resources.
  },
  description: `
Start an asynchronous web-research job that can search, navigate pages, and return free-form or schema-constrained data for a research task.
Use for multi-source research where relevant pages are not known in advance, or when autonomous web research is explicitly requested. Optional URLs constrain the starting sources.
The response contains a job \`id\`; \`firecrawl_agent_status\` retrieves status and result.
`,
  parameters: z.object({
    prompt: z
      .string()
      .min(1)
      .max(10000)
      .describe('Research task and requested output, written in natural language.'),
    urls: z
      .array(z.url())
      .optional()
      .describe('Optional URLs that constrain or seed the research.'),
    schema: z
      .record(z.string(), z.any())
      .optional()
      .describe('Optional JSON Schema describing the requested result.'),
  }),
  execute: async (args: unknown, { session, log }): Promise<string> => {
    const client = getClient(session);
    const a = args as Record<string, unknown>;
    log.info('Starting agent', {
      prompt: (a.prompt as string).substring(0, 100),
      urlCount: Array.isArray(a.urls) ? a.urls.length : 0,
    });
    const agentBody = removeEmptyTopLevel({
      prompt: a.prompt as string,
      urls: a.urls as string[] | undefined,
      schema: (a.schema as Record<string, unknown>) || undefined,
    });
    const res = await (client as any).startAgent({
      ...agentBody,
      origin: ORIGIN,
    });
    return asText(res);
  },
});

server.addTool({
  name: 'firecrawl_agent_status',
  annotations: {
    title: 'Get agent job status',
    readOnlyHint: true, // Polls an existing agent job by ID for progress and results; no mutations.
    openWorldHint: false, // Queries only Firecrawl job state by job ID within the user's account.
    destructiveHint: false, // Read-only status check.
  },
  description: `
Retrieve the status and available result of a web-research job by its \`id\`.
Status is \`processing\`, \`completed\`, or \`failed\`. Completed jobs include results; failed jobs include failure information.
`,
  parameters: z.object({
    id: z.string().describe('Agent job ID returned by firecrawl_agent.'),
  }),
  execute: async (args: unknown, { session, log }): Promise<string> => {
    const client = getClient(session);
    const { id } = args as { id: string };
    log.info('Checking agent status', { id });
    const res = await (client as any).http.get(
      `/v2/agent/${encodeURIComponent(id)}`,
      ORIGIN_HEADERS
    );
    return asText(res?.data ?? {});
  },
});

// Interact tools (scrape-bound browser sessions)
server.addTool({
  name: 'firecrawl_interact',
  annotations: {
    title: 'Interact with a scraped page',
    readOnlyHint: false, // Executes browser interactions (clicks, form input, scripts) in a live session.
    openWorldHint: true, // Interacts with pages on the public web via the scraped session.
    destructiveHint: true, // Interactions can submit forms or otherwise change state on external sites.
  },
  description: `
Run browser interactions in a live session: click controls, enter text, navigate, or execute supplied code.
Runs against the live site, so external side effects such as form submission persist after the session ends.
Provide exactly one of \`url\` or \`scrapeId\`, and at least one of \`prompt\` or \`code\`. Returns execution output (and live view URLs when present); when started from \`url\`, also returns \`scrapeId\` for follow-up or stop.
`,
  parameters: z
    .object({
      scrapeId: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe('Existing scrape session ID to interact with. Mutually exclusive with url.'),
      url: z.preprocess((value) => {
        if (typeof value !== 'string') return value;
        const trimmed = value.trim();
        return trimmed === '' ? undefined : trimmed;
      }, z.url().optional()).describe(
        'Page URL for a new interaction session. Mutually exclusive with scrapeId.'
      ),
      prompt: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe('Natural-language interaction instructions.'),
      code: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe(
          'Browser automation code to execute. It may change external state depending on the code.'
        ),
      language: z
        .enum(['bash', 'python', 'node'])
        .optional()
        .describe('Runtime for code. Defaults to node.'),
      timeout: z
        .number()
        .min(1)
        .max(300)
        .optional()
        .describe('Execution timeout in seconds.'),
      scrapeOptions: scrapeParamsSchema
        .omit({ url: true })
        .partial()
        .optional()
        .describe('Retrieval options used only when starting a session from url.'),
    })
    .refine((data) => Boolean(data.scrapeId) !== Boolean(data.url), {
      message:
        "Provide either 'url' (interact directly) or 'scrapeId' (reuse a previous scrape), not both.",
    })
    .refine((data) => !data.scrapeOptions || Boolean(data.url), {
      message: "scrapeOptions can only be used with 'url' mode.",
    })
    .refine((data) => data.code || data.prompt, {
      message: "Either 'code' or 'prompt' must be provided.",
    }),
  execute: async (args: unknown, { session, log }): Promise<string> => {
    const client = getClient(session);
    const {
      scrapeId: providedScrapeId,
      url,
      prompt,
      code,
      language,
      timeout,
      scrapeOptions,
    } = args as {
      scrapeId?: string;
      url?: string;
      prompt?: string;
      code?: string;
      language?: 'bash' | 'python' | 'node';
      timeout?: number;
      scrapeOptions?: Record<string, unknown>;
    };
    // No scrapeId means the caller passed a url: scrape it first to open the
    // session, then interact. One tool call instead of scrape + interact.
    let scrapeId = providedScrapeId;
    const openedFromUrl = !scrapeId;
    if (openedFromUrl) {
      log.info('Opening interact session from url', { url });
      const cleanedScrapeOptions = removeEmptyTopLevel(scrapeOptions ?? {});
      const scraped = await client.scrape(String(url), {
        ...cleanedScrapeOptions,
        origin: ORIGIN,
      } as any);
      scrapeId = (scraped as any)?.metadata?.scrapeId;
      if (!scrapeId) {
        return asText({
          error:
            'Could not open an interact session: the scrape did not return a scrapeId. Try firecrawl_scrape first, then pass its scrapeId.',
          url,
        });
      }
    }
    if (!scrapeId) {
      return asText({
        error: 'Could not open an interact session: missing scrapeId.',
        url,
      });
    }
    const activeScrapeId = scrapeId;
    log.info('Interacting with page', { scrapeId: activeScrapeId });
    const interactArgs: Record<string, unknown> = { origin: ORIGIN };
    if (prompt) interactArgs.prompt = prompt;
    if (code) interactArgs.code = code;
    if (language) interactArgs.language = language;
    if (timeout != null) interactArgs.timeout = timeout;
    const res = await client.interact(activeScrapeId, interactArgs as any);
    if (openedFromUrl && res && typeof res === 'object' && !Array.isArray(res)) {
      return asText({
        ...(res as unknown as Record<string, unknown>),
        scrapeId: activeScrapeId,
      });
    }
    if (openedFromUrl) {
      return asText({ scrapeId: activeScrapeId, result: res });
    }
    return asText(res);
  },
});

server.addTool({
  name: 'firecrawl_interact_stop',
  annotations: {
    title: 'Stop interact session',
    readOnlyHint: false, // Calls the API to stop and tear down an active interact session.
    openWorldHint: false, // Operates only on a known Firecrawl scrape/interact session ID.
    destructiveHint: true, // Terminates the live browser session; this end state cannot be resumed.
  },
  description: `
Permanently stop an active browser interaction session by its scrape ID. A stopped session cannot be resumed.
`,
  parameters: z.object({
    scrapeId: z.string().describe('Active scrape session ID to terminate.'),
  }),
  execute: async (args: unknown, { session, log }): Promise<string> => {
    const client = getClient(session);
    const { scrapeId } = args as { scrapeId: string };
    log.info('Stopping interact session', { scrapeId });
    const res = await (client as any).http.delete(
      `/v2/scrape/${encodeURIComponent(scrapeId)}/interact`,
      ORIGIN_HEADERS
    );
    return asText(res?.data ?? {});
  },
});

// Parse a local file directly in non-cloud mode, or orchestrate a hosted two-call
// uploadRef flow in CLOUD_SERVICE mode without reading the caller's filesystem.
server.addTool({
  name: 'firecrawl_parse',
  annotations: {
    title: 'Parse a local file',
    readOnlyHint: true, // Local mode reads a file; hosted mode only returns upload instructions or parses an uploadRef.
    openWorldHint: false, // Operates on a local filesystem path/upload reference, not an arbitrary web URL.
    destructiveHint: false, // Read-only parsing; no deletion or writes to the source file.
  },
  description: `
Parse a local HTML, PDF, Word, OpenDocument, RTF, or Excel file into the requested formats (\`markdown\`, \`html\`, \`rawHtml\`, \`links\`, \`summary\`, \`json\`, or \`query\`).
Local MCP reads \`filePath\` directly; hosted MCP returns upload instructions for \`filePath\`, then parses via \`uploadRef\`. Hosted calls require exactly one of \`filePath\` or \`uploadRef\`.
Returns the selected formats, or upload instructions on the first hosted call.
`,
  parameters: parseParamsSchema,
  execute: async (args: unknown, { session, log }): Promise<string> => {
    if (process.env.CLOUD_SERVICE === 'true') {
      return executeHostedParse(args as ParseToolArgs, session, log);
    }

    const apiUrl = process.env.FIRECRAWL_API_URL;
    if (!apiUrl) {
      throw new Error(
        'firecrawl_parse requires FIRECRAWL_API_URL to be set to a self-hosted Firecrawl API instance.'
      );
    }

    const {
      filePath,
      contentType: overrideContentType,
      ...options
    } = args as {
      filePath: string;
      contentType?: string;
    } & Record<string, unknown>;

    const absPath = path.resolve(filePath);
    const buffer = await readFile(absPath);
    const filename = path.basename(absPath);
    const fileContentType =
      overrideContentType && overrideContentType.length > 0
        ? overrideContentType
        : inferContentType(filename);

    const optionsPayload = buildParseOptionsPayload(
      options as Record<string, unknown>
    );

    const form = new FormData();
    const blob = new Blob([new Uint8Array(buffer)], {
      type: fileContentType,
    });
    form.append('file', blob, filename);
    form.append('options', JSON.stringify(optionsPayload));

    const headers: Record<string, string> = { ...ORIGIN_HEADERS };
    const credential = credentialForOutboundRequest(session);
    if (credential) {
      headers['Authorization'] = `Bearer ${credential}`;
    }

    const endpoint = `${apiUrl.replace(/\/$/, '')}/v2/parse`;
    log.info('Parsing local file', {
      endpoint,
      filename,
      size: buffer.length,
    });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: form,
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(
        `Parse request failed with status ${response.status}: ${responseText}`
      );
    }

    try {
      return asText(JSON.parse(responseText));
    } catch {
      return responseText;
    }
  },
});

// Search-surface variant of firecrawl_search. It takes no scrapeOptions and
// builds the outbound /v2/search body from an explicit set of fields, so the
// surface never asks the API to fetch page content. The omission is enforced
// by the schema and the body construction, not a runtime filter.
function registerMarketplaceSearchTool(
  registrar: ToolRegistrar,
  getClientFn: typeof getClient
): void {
  registrar.addTool({
    name: 'firecrawl_search',
    annotations: {
      title: 'Search the web',
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
    description: `
Search web, news, image, and specialized indexes and return ranked results for a query.
Optional filters: domains, sources, categories, location, time. Optional \`highlights\` for query-relevant excerpts (omit for API default; \`false\` for original snippets). Does not retrieve full page content.
Returns a search \`id\` and credit usage when provided.
`,
    parameters: z
      .object({ ...searchToolBaseFields })
      // Reject unknown fields (notably scrapeOptions): this surface exposes no
      // way to request page-content fetching, and an unexpected field is an
      // error rather than being silently dropped.
      .strict()
      .refine(searchDomainsAreExclusive, SEARCH_DOMAINS_CONFLICT_MESSAGE),
    execute: async (args: unknown, { session, log }): Promise<string> => {
      const {
        query,
        includeDomains,
        excludeDomains,
        limit,
        tbs,
        filter,
        location,
        sources,
        categories,
        highlights,
        enterprise,
      } = args as {
        query: string;
        includeDomains?: string[];
        excludeDomains?: string[];
        limit?: number;
        tbs?: string;
        filter?: string;
        location?: string;
        sources?: Array<{ type: string }>;
        categories?: string[];
        highlights?: boolean;
        enterprise?: string[];
      };

      const searchQuery = buildSearchQueryWithDomains(
        query,
        includeDomains,
        excludeDomains
      );

      // Build the outbound body from allowed fields only. Never spread the raw
      // arguments, so no scrape/content-fetch options can reach the API.
      const searchBody = {
        query: searchQuery,
        ...removeEmptyTopLevel({
          limit,
          tbs,
          filter,
          location,
          sources,
          categories,
          highlights,
          enterprise,
        }),
        origin: ORIGIN,
      };

      log.info('Searching', { query: searchQuery });
      const client = getClientFn(session);
      const httpRes = await (client as any).http.post('/v2/search', searchBody);
      return asText(httpRes?.data ?? {});
    },
  });
}

const PORT = Number(process.env.PORT || 3000);
const HOST =
  process.env.CLOUD_SERVICE === 'true'
    ? '0.0.0.0'
    : process.env.HOST || 'localhost';
type StartArgs = Parameters<typeof server.start>[0];
let args: StartArgs;

if (
  process.env.CLOUD_SERVICE === 'true' ||
  process.env.SSE_LOCAL === 'true' ||
  process.env.HTTP_STREAMABLE_SERVER === 'true'
) {
  args = {
    transportType: 'httpStream',
    httpStream: {
      port: PORT,
      host: HOST,
      endpoint: primaryProfile.endpoint,
      stateless: true,
    },
  };
} else {
  // default: stdio
  args = {
    transportType: 'stdio',
  };
}

registerMonitorTools(server);
registerResearchTools(server, getClient);

await server.start(args);

// Bring up the search surface as a second in-process instance on its own port.
// The pod's nginx routes its public path here; the full surface above is
// untouched. Only registered in the hosted profile and when not disabled.
const searchProfileEnabled =
  process.env.CLOUD_SERVICE === 'true' &&
  primaryProfile.id === 'full' &&
  process.env.FIRECRAWL_MCP_SEARCH_ENABLED !== 'false';

if (searchProfileEnabled) {
  const searchProfile = makeSearchProfile();
  const searchServer = createServer(searchProfile);

  // Fail-closed registrar: only allowlisted tool names ever register here.
  const searchRegistrar: ToolRegistrar = {
    addTool: ((tool: { name: string }) => {
      if (searchProfile.toolAllowlist?.has(tool.name)) {
        searchServer.addTool(
          guardHostedTool(tool as RegisteredTool, { logActions: false })
        );
      }
    }) as FastMCP<SessionData>['addTool'],
  };

  registerResearchTools(searchRegistrar, getClient);
  registerMarketplaceSearchTool(searchRegistrar, getClient);

  // Isolate the search instance from the already-serving full instance: if it
  // fails to bind (port in use, etc.), log and carry on rather than let a
  // top-level rejection exit the process and take the healthy full surface down.
  try {
    await searchServer.start({
      transportType: 'httpStream',
      httpStream: {
        port: searchProfile.port,
        host: HOST,
        endpoint: searchProfile.endpoint,
        stateless: true,
      },
    });
  } catch (error) {
    console.error(
      `[search-profile] failed to start on port ${searchProfile.port}; ` +
        'the full surface is unaffected',
      error
    );
  }
}
