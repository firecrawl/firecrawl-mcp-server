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
import { registerDeveloperTools } from './developer';
import { extractSingleTrustedClientIp } from './keyless-client-ip';
import { registerMonitorTools } from './monitor';
import { registerResearchTools } from './research';
import { escapeWWWAuthenticateValue } from './www-authenticate';
import {
  credentialForOutboundRequest,
  copyManagedOAuthApiKey,
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
  /** Internal nginx marker for the deprecated credential-in-path route. */
  keyTransport?: 'path';
  teamId?: string;
  userId?: string;
  apiKeyId?: string;
  oauthClientId?: string;
  resource?: string;
  requestId?: string;
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

function isLegacyKeyPathRequest(request: MCPAuthRequest | undefined): boolean {
  return normalizeHeader(request?.headers?.['x-firecrawl-key-transport']) === 'path';
}

function requestShouldReceiveOAuthChallenge(
  request: MCPAuthRequest | undefined,
  profile: ServerProfile
): boolean {
  // OAuth-only profiles must challenge API-key and key-in-path attempts too;
  // otherwise FastMCP would return a generic error instead of the resource's
  // reconnectable OAuth challenge.
  if (!profile.acceptApiKeys) return true;
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

// Human-facing guidance values, co-located with the resource defaults above.
// MCP_CONNECTION_GUIDE_URL stays a stable, neutral entry point even while the
// docs routing evolves; do not bind recovery payloads to an auth-mode leaf
// page. It is a human-facing guide, not an MCP endpoint.
const MCP_CONNECTION_GUIDE_URL =
  'https://docs.firecrawl.dev/mcp-server';

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

function getPrimaryEndpoint(): '/v2/mcp' | '/v2/mcp-oauth' | '/v2/mcp-search' {
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

function createOAuthChallengeResponse(
  error: unknown,
  profile: ServerProfile,
  details: Record<string, unknown> = {}
): Response | undefined {
  if (!isMcpOAuthEnabled()) {
    return undefined;
  }

  const errorMessage =
    error instanceof Error ? error.message : String(error || 'Unauthorized');
  // WWW-Authenticate is one header. Flatten CR/LF so a multiline JSON
  // message cannot split the header value.
  const wwwAuthenticateDescription = errorMessage.replace(/[\r\n]+/g, ' ').trim();
  const wwwAuthenticate = [
    ...(profile.advertiseOAuth
      ? [
          `resource_metadata="${escapeWWWAuthenticateValue(getOAuthProtectedResourceMetadataUrl(profile))}"`,
        ]
      : []),
    'error="invalid_token"',
    `error_description="${escapeWWWAuthenticateValue(wwwAuthenticateDescription)}"`,
  ].join(', ');

  return new Response(
    JSON.stringify({
      error: 'invalid_token',
      error_description: errorMessage,
      ...details,
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

function createInvalidCredentialResponse(_error: InvalidFirecrawlCredentialError): Response {
  const recovery = invalidApiKeyRecoveryPayload();
  return new Response(
    JSON.stringify({
      error: 'invalid_api_key',
      error_description: recovery.message,
      ...recovery,
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      status: 401,
    }
  );
}

function createInvalidOAuthRecoveryResponse(
  recovery: Record<string, unknown> & { message: string }
): Response {
  return new Response(
    JSON.stringify({
      error: 'invalid_token',
      error_description: recovery.message,
      ...recovery,
    }),
    {
      headers: { 'Content-Type': 'application/json' },
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

class InvalidFirecrawlCredentialError extends Error {
  constructor() {
    super('The supplied Firecrawl credential is invalid or revoked. Replace it and retry.');
    this.name = 'InvalidFirecrawlCredentialError';
  }
}

class InvalidOAuthCredentialError extends Error {
  constructor() {
    super('Invalid OAuth access token');
    this.name = 'InvalidOAuthCredentialError';
  }
}

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
  if (!profile.acceptApiKeys && !isFirecrawlOAuthAccessToken(token)) {
    throw new Error(
      `OAuth access token required for the Firecrawl MCP resource ${profile.endpoint}`
    );
  }
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
      throw new InvalidOAuthCredentialError();
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
  if (
    profile.requireManagedOAuth &&
    data.credential_purpose !== 'hosted_mcp_oauth'
  ) {
    throw new Error('OAuth token is not a managed Firecrawl MCP credential');
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
        // A supplied-but-invalid credential must reach the *agent*, not die as a
        // transport 401. MCP clients treat a 401 at initialize/tools-list as
        // "server unavailable" and never surface the response body to the model,
        // so the recovery payload in that 401 was unreachable in a real session.
        // On the keyless+API-key endpoint, admit the session flagged with
        // credentialError: the connection succeeds, tools list, and every tool
        // call returns the CREDENTIAL_INVALID recovery payload as a 200 isError
        // result — the same agent-legible path keyless quota recovery uses. No
        // credential is forwarded and no tool executes, so this grants zero
        // functional access. OAuth-only surfaces (e.g. /v2/mcp-search) keep the
        // hard 401 credential-rejection contract they already advertise.
        if (profile.allowKeyless) {
          return {
            authType: 'api-key',
            credentialError: 'CREDENTIAL_INVALID',
            firecrawlApiKey: undefined,
            keylessClientIp: extractClientIp(request),
          };
        }
        throw new InvalidFirecrawlCredentialError();
      }
      if (profile.allowKeyless) {
        return {
          authType: 'keyless',
          firecrawlApiKey: undefined,
          keylessClientIp: extractClientIp(request),
        };
      }
      if (!profile.acceptApiKeys) {
        throw new Error(
          `OAuth access token required for the Firecrawl MCP resource ${profile.endpoint}`
        );
      }
      throw new Error(
        'Firecrawl credentials required: OAuth access token (Authorization: Bearer fco_...) or API key (x-firecrawl-api-key)'
      );
    }
    const session: SessionData = {
      authType: resolved?.source === 'oauth' ? 'oauth' : 'api-key',
      firecrawlApiKey: headerCred,
      ...(isLegacyKeyPathRequest(request) ? { keyTransport: 'path' as const } : {}),
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

type SearchCompanionAuthMode = 'oauth' | 'api-key' | 'none';

function searchCompanionAuthMode(
  request?: MCPAuthRequest,
  session?: SessionData
): SearchCompanionAuthMode {
  if (session?.authType === 'oauth') return 'oauth';
  if (session?.authType === 'api-key') return 'api-key';
  // Mirror resolveCredentialFromHeaders precedence: explicit API-key headers
  // win over Authorization when both are present.
  const headerApiKey = normalizeHeader(
    request?.headers?.['x-firecrawl-api-key'] ?? request?.headers?.['x-api-key']
  );
  if (headerApiKey) return 'api-key';
  const bearer = request?.headers ? extractBearerToken(request.headers) : undefined;
  if (bearer?.startsWith('fco_')) return 'oauth';
  if (bearer) return 'api-key';
  return 'none';
}

/**
 * Additive, intentionally low-cardinality companion traffic telemetry. This
 * is the only reliable way to establish whether the live companion is still
 * serving API-key consumers before its explicit OAuth-only cutover. Do not add
 * identifiers, credentials, request URLs, user agents, or hashes here.
 */
function emitSearchCompanionAuthTelemetry(
  profile: ServerProfile,
  request: MCPAuthRequest | undefined,
  outcome: 'accepted' | 'rejected',
  session?: SessionData
): void {
  if (
    process.env.CLOUD_SERVICE !== 'true' ||
    profile.id !== 'search' ||
    profile.primary === true
  ) {
    return;
  }
  console.log(
    '[MCP_SEARCH_AUTH]',
    JSON.stringify({
      auth_mode: searchCompanionAuthMode(request, session),
      outcome,
      profile: 'companion',
      // Unique only to this telemetry record; it is not a cross-service
      // correlation ID and does not accept client-controlled identifiers.
      event_id: randomUUID(),
      route: DEFAULT_MCP_SEARCH_ENDPOINT,
    })
  );
}

function emitLegacyKeyPathTelemetry(
  profile: ServerProfile,
  request: MCPAuthRequest | undefined,
  outcome: 'accepted' | 'rejected',
  session?: SessionData
): void {
  if (profile.id !== 'full' || !isLegacyKeyPathRequest(request)) return;
  console.log(
    '[MCP_LEGACY_KEY_PATH]',
    JSON.stringify({
      auth_type: session?.authType ?? 'none',
      key_transport: 'path',
      outcome,
      resource: profile.resourceUrl,
    })
  );
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

    const authResult = authenticateRequest(request, profile)
      .then((session) => {
        emitSearchCompanionAuthTelemetry(
          profile,
          request,
          session.credentialError ? 'rejected' : 'accepted',
          session
        );
        emitLegacyKeyPathTelemetry(
          profile,
          request,
          session.credentialError ? 'rejected' : 'accepted',
          session
        );
        return session;
      })
      .catch((error) => {
        emitSearchCompanionAuthTelemetry(profile, request, 'rejected');
        emitLegacyKeyPathTelemetry(profile, request, 'rejected');
        if (error instanceof InvalidFirecrawlCredentialError) {
          throw createInvalidCredentialResponse(error);
        }
        if (error instanceof InvalidOAuthCredentialError) {
          const recovery = invalidOAuthRecoveryPayload();
          const oauthChallenge = createOAuthChallengeResponse(
            new Error(recovery.message),
            profile,
            recovery
          );
          throw oauthChallenge ?? createInvalidOAuthRecoveryResponse(recovery);
        }
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
        const shouldChallenge = requestShouldReceiveOAuthChallenge(request, profile);
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

type ResponseFormat = 'concise' | 'detailed';

const responseFormatSchema = z
  .enum(['concise', 'detailed'])
  .default('detailed')
  .describe('Response detail level; defaults to detailed.');

// Parameter fields shared by both firecrawl_search surfaces. The full surface
// adds `scrapeOptions` on top; the search surface uses these as-is (strict, no
// scrapeOptions). Defining the field set once keeps the two surfaces from
// drifting when a source type, category, or filter changes.
const searchToolBaseFields = {
  query: z.string().min(1).describe('Search query, including supported search operators.'),
  highlights: z
    .boolean()
    .optional()
    .describe(
      'Return query-relevant highlights for each search result. Set to false to keep the original search snippets.'
    ),
  limit: z.number().optional().describe('Maximum number of results.'),
  tbs: z.string().optional().describe('Google-style time-based search filter.'),
  filter: z.string().optional().describe('Additional provider-specific result filter.'),
  location: z.string().optional().describe('Geographic location for localized results.'),
  includeDomains: z
    .array(searchDomainSchema)
    .optional()
    .describe('Only return results from these hostnames.'),
  excludeDomains: z
    .array(searchDomainSchema)
    .optional()
    .describe('Exclude results from these hostnames.'),
  sources: z
    .array(
      z.object({
        type: z
          .enum(['web', 'images', 'news'])
          .describe('Search source type.'),
      })
    )
    .optional()
    .describe('Source groups to search; defaults to web.'),
  categories: z
    .array(z.enum(['github', 'research', 'pdf', 'developer']))
    .optional()
    .describe(
      'Limit results to specific source types. `github` searches GitHub repositories, code, issues, and docs; `research` restricts ordinary web results to research-affiliated websites and returns page snippets, which is separate from the `firecrawl_research_*` tools that search paper abstracts and full text across biomedical (PubMed, bioRxiv, medRxiv) and arXiv literature; `pdf` searches PDF results; `developer` searches an index built for coding agents over GitHub issues, merged pull requests, repository READMEs, and curated documentation sites. `developer` adds a `data.developer` group of `{ url, title, description }` results, where `description` holds the matched passage; the other categories filter `data.web`.'
    ),
  enterprise: z
    .array(z.enum(['default', 'anon', 'zdr']))
    .optional()
    .describe('Enterprise search modes when enabled for the account.'),
  response_format: responseFormatSchema,
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

const FULL_PROFILE_INSTRUCTIONS = `Firecrawl provides web search, page retrieval, site URL discovery, multi-page collection, structured page data, monitoring, and asynchronous research. Match the requested operation to the tool boundary: firecrawl_scrape retrieves one supplied page and can return JSON matching a supplied schema, firecrawl_map enumerates URLs under a site without retrieving their content, and firecrawl_agent starts multi-source research whose result is read with firecrawl_agent_status. For biomedical, life-science, clinical, or arXiv literature, the firecrawl_research_* tools search a paper index of abstracts and full text; firecrawl_search with categories: ["research"] is a website filter over ordinary web results and reaches different sources. For a programming question — code behaviour, a library or framework, an API contract, an error message, or a known bug — firecrawl_developer_search (or firecrawl_search with categories: ["developer"]) searches an index of GitHub issues, merged pull requests, READMEs, and curated documentation sites. Provide only the required inputs and account for stated network or external side effects.`;
const KEYLESS_PROFILE_INSTRUCTIONS = `Without authentication, this endpoint exposes Search, Scrape, and Parse with usage limits. An OAuth connection or Authorization bearer API key exposes account tools; unavailable tools return connection guidance. Firecrawl provides web search, page retrieval, site URL discovery, multi-page collection, structured page data, monitoring, and asynchronous research. Match the requested operation to the tool boundary: firecrawl_scrape retrieves one supplied page and can return JSON matching a supplied schema, firecrawl_map enumerates URLs under a site without retrieving their content, and firecrawl_agent starts multi-source research whose result is read with firecrawl_agent_status. For biomedical, life-science, clinical, or arXiv literature, firecrawl_search with categories: ["research"] filters ordinary web results to research-affiliated websites; the firecrawl_research_* tools search a separate paper index of abstracts and full text and become available once an OAuth connection or Authorization bearer API key is present. Provide only the required inputs.`;
const LOCAL_KEYLESS_PROFILE_INSTRUCTIONS = KEYLESS_PROFILE_INSTRUCTIONS.replace(
  'Search, Scrape, and Parse',
  'Search and Scrape'
);

// The search surface exposes web/research search only. Its instructions and tool
// copy describe just those tools and stay neutral about how a client uses them.
const SEARCH_PROFILE_INSTRUCTIONS = `Firecrawl provides web, developer, and research search. Use firecrawl_search to find relevant results across the web and specialized indexes. For a programming question, use firecrawl_search with categories: ["developer"] to search indexed GitHub issues, merged pull requests, READMEs, and documentation. For a biomedical, life-science, clinical, or arXiv literature question, the firecrawl_research_* tools search the paper index, while categories: ["research"] on firecrawl_search filters ordinary web results to research-affiliated websites. Use the firecrawl_research_* tools to search academic and research literature, expand from anchor papers via the citation graph, read full-text passages from a specific paper, and search public code repositories. All tools are read-only and return ranked results.`;

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
    instructions: account
      ? FULL_PROFILE_INSTRUCTIONS
      : isLocalKeylessStartup()
        ? LOCAL_KEYLESS_PROFILE_INSTRUCTIONS
        : KEYLESS_PROFILE_INSTRUCTIONS,
    resourceUrl: account
      ? normalizeHeader(process.env.FIRECRAWL_MCP_RESOURCE_URL) ??
        DEFAULT_MCP_OAUTH_RESOURCE_URL
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

function makeSearchProfile({ primary = false }: { primary?: boolean } = {}): ServerProfile {
  const oauthOnly = searchOAuthOnly();
  if (primary && !oauthOnly) {
    throw new Error(
      'FASTMCP_ENDPOINT=/v2/mcp-search requires FIRECRAWL_MCP_SEARCH_OAUTH_ONLY=true'
    );
  }
  return {
    id: 'search',
    resourceName: 'Firecrawl Search',
    instructions: SEARCH_PROFILE_INSTRUCTIONS,
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

function makePrimaryProfile(): ServerProfile {
  return getPrimaryEndpoint() === '/v2/mcp-search'
    ? makeSearchProfile({ primary: true })
    : makeFullProfile();
}

function createServer(profile: ServerProfile): FastMCP<SessionData> {
  return new FastMCP<SessionData>({
    name: 'firecrawl-fastmcp',
    version: packageVersion as `${number}.${number}.${number}`,
    instructions: profile.instructions,
    logger: new ConsoleLogger(),
    roots: { enabled: false },
    oauth: {
      enabled: isMcpOAuthEnabled() && profile.advertiseOAuth,
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

const primaryProfile = makePrimaryProfile();
const server = createServer(primaryProfile);
type RegisteredTool = Parameters<typeof server.addTool>[0];

const LOCAL_KEYLESS_TOOL_NAMES = new Set([
  'firecrawl_scrape',
  'firecrawl_search',
]);
const KEYLESS_TOOL_NAMES = new Set([
  ...LOCAL_KEYLESS_TOOL_NAMES,
  'firecrawl_parse',
]);

function isHostedKeylessSession(session?: SessionData): boolean {
  return (
    process.env.CLOUD_SERVICE === 'true' &&
    session?.authType === 'keyless' &&
    !session.firecrawlApiKey
  );
}

function isLocalKeylessSession(session?: SessionData): boolean {
  return (
    isLocalKeylessStartup() &&
    session?.authType === 'none' &&
    !session.firecrawlApiKey
  );
}

// A stdio client without a cloud credential can use only the keyless tools.
// Registration-time checks keep unavailable feedback tools out of this surface;
// the shared canList boundary below filters the remaining account-only tools.
function isLocalKeylessStartup(): boolean {
  return (
    process.env.CLOUD_SERVICE !== 'true' &&
    !isHttpStreamingTransport() &&
    !resolveCredentialFromEnv() &&
    !normalizeHeader(process.env.FIRECRAWL_API_URL)
  );
}

// FastMCP copies UserError.message onto both content[0].text and
// structuredContent.message. Hosts forward the text block, not
// structured next_actions, so bearer and OAuth recovery strings live here.
const KEYLESS_ACCOUNT_FIX =
  'Fix: Create an API key at https://www.firecrawl.dev/signin , then either:\n- Set the header: Authorization: Bearer YOUR_API_KEY on https://mcp.firecrawl.dev/v2/mcp\n- Or use the URL: https://mcp.firecrawl.dev/v2/mcp-oauth\nThen start a new session.';
const KEYLESS_QUOTA_MESSAGE = `You've hit Firecrawl's free MCP rate limit. To continue using without limits, create a Firecrawl API key.\n\n${KEYLESS_ACCOUNT_FIX}`;
const KEYLESS_TOOL_MESSAGE = `This tool needs a Firecrawl account.\n\n${KEYLESS_ACCOUNT_FIX}`;
const KEYLESS_ACCESS_MESSAGE = `Anonymous keyless access is unavailable for this request.\n\n${KEYLESS_ACCOUNT_FIX}`;
const INVALID_API_KEY_MESSAGE =
  'The Firecrawl API key is invalid or revoked.\nFix: Replace the key on the existing Firecrawl MCP server, then start a new session. Get an API key at https://www.firecrawl.dev/app/api-keys';
const INVALID_OAUTH_MESSAGE =
  'This Firecrawl account connection is no longer valid.\nFix: Reconnect the existing Firecrawl server in the client, or set that existing server URL to https://mcp.firecrawl.dev/v2/mcp-oauth, then start a new session.';

function connectionRecoveryPayload(params: {
  code: string;
  authMode: string;
  message: string;
}): Record<string, unknown> & { message: string } {
  return {
    code: params.code,
    auth_mode: params.authMode,
    message: params.message,
    docs_url: MCP_CONNECTION_GUIDE_URL,
  };
}

function invalidApiKeyRecoveryPayload(): Record<string, unknown> & { message: string } {
  return connectionRecoveryPayload({
    code: 'CREDENTIAL_INVALID',
    authMode: 'api_key',
    message: INVALID_API_KEY_MESSAGE,
  });
}

function invalidOAuthRecoveryPayload(): Record<string, unknown> & { message: string } {
  return connectionRecoveryPayload({
    code: 'OAUTH_CONNECTION_INVALID',
    authMode: 'oauth',
    message: INVALID_OAUTH_MESSAGE,
  });
}

function recoveryPayload(
  code: string,
  requestId: string = randomUUID(),
  options: { retryAfterSeconds?: number } = {}
): Record<string, unknown> {
  const retryAfterSeconds = options.retryAfterSeconds;
  const isQuotaExhausted =
    code === 'KEYLESS_QUOTA_EXHAUSTED' || code === 'KEYLESS_LIMIT_REACHED';
  const isToolUnavailable = code === 'KEYLESS_TOOL_NOT_AVAILABLE';
  const isKeylessAccessUnavailable = code === 'KEYLESS_ACCESS_NOT_AVAILABLE';
  const isKeylessEligibilityUnavailable =
    code === 'KEYLESS_ELIGIBILITY_UNAVAILABLE';
  const isKeylessConversion =
    isQuotaExhausted || isToolUnavailable || isKeylessAccessUnavailable;
  return {
    code,
    request_id: requestId,
    auth_mode: code === 'CREDENTIAL_INVALID' ? 'credential_error' : 'keyless',
    message:
      code === 'CREDENTIAL_INVALID'
        ? INVALID_API_KEY_MESSAGE
        : isQuotaExhausted
          ? KEYLESS_QUOTA_MESSAGE
          : isToolUnavailable
            ? KEYLESS_TOOL_MESSAGE
            : isKeylessAccessUnavailable
              ? KEYLESS_ACCESS_MESSAGE
              : isKeylessEligibilityUnavailable
                ? 'The anonymous keyless eligibility check is temporarily unavailable. Retry shortly.'
                : 'This tool requires a Firecrawl account or API key.',
    // CREDENTIAL_INVALID sessions gate every tool call (including keyless
    // tools) on the credentialError check before the keyless branch ever
    // runs, so none of KEYLESS_TOOL_NAMES are actually callable here. Listing
    // them as available_tools would send the agent into a retry loop against
    // tools that will just return this same recovery payload. Quota, blocked
    // tools, and ineligible access omit available_tools and next_actions for
    // the same reason: those fields retry tools that cannot clear the error.
    ...(isKeylessConversion || code === 'CREDENTIAL_INVALID'
      ? {}
      : { available_tools: [...KEYLESS_TOOL_NAMES] }),
    docs_url: MCP_CONNECTION_GUIDE_URL,
    ...(retryAfterSeconds ? { retry_after_seconds: retryAfterSeconds } : {}),
    ...(isKeylessEligibilityUnavailable
      ? { next_actions: [{ kind: 'retry_later', after_seconds: 30 }] }
      : {}),
  };
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 4_000);
}

function agentLegibleError(
  code: string,
  error: unknown,
  guidance: string,
  requestId: string = randomUUID(),
  retryable = false
): UserError {
  const originalError = errorText(error);
  const message = `${originalError}\nRecovery: ${guidance}`;
  return new UserError(message, {
    code,
    message,
    request_id: requestId,
    original_error: originalError,
    retryable,
    next_actions: [
      {
        kind: retryable ? 'retry' : 'check_request',
        instruction: guidance,
      },
    ],
    docs_url: MCP_CONNECTION_GUIDE_URL,
  });
}

function wrapToolError(error: unknown, requestId: string): UserError {
  if (error instanceof UserError) return error;
  const message = errorText(error);
  if (/unauthori[sz]ed|api key|credentials? required/i.test(message)) {
    return agentLegibleError(
      'AUTH_REQUIRED',
      error,
      'Configure a Firecrawl API key, connect the existing Firecrawl MCP server, or set FIRECRAWL_API_URL for a self-hosted instance, then start a new session and retry.',
      requestId
    );
  }
  if (/ENOENT|no such file/i.test(message)) {
    return agentLegibleError(
      'FILE_NOT_FOUND',
      error,
      'Check that filePath exists on the machine running the local MCP server, then retry with the corrected path.',
      requestId
    );
  }
  if (/timed? out|timeout/i.test(message)) {
    return agentLegibleError(
      'UPSTREAM_TIMEOUT',
      error,
      'Retry once with a narrower request or a longer supported timeout; if the job ID is known, check its status instead of starting a duplicate job.',
      requestId,
      true
    );
  }
  if (/requires|must belong|provide (?:either|exactly)|missing/i.test(message)) {
    return agentLegibleError(
      'INVALID_REQUEST',
      error,
      'Check the tool arguments against its input schema, correct the invalid or missing value, and retry.',
      requestId
    );
  }
  return agentLegibleError(
    'UPSTREAM_REQUEST_FAILED',
    error,
    'Verify the request and Firecrawl service availability, then retry once if the operation is safe to repeat.',
    requestId,
    true
  );
}

function deprecatedExtractPayload() {
  return {
    code: 'DEPRECATED_TOOL',
    message:
      'firecrawl_extract is deprecated and unavailable through MCP. For structured data from a known page, call firecrawl_scrape once per URL with formats: ["json"] and jsonOptions containing the prompt and schema. For unknown URLs or multi-source research, use firecrawl_search or firecrawl_agent first.',
    replacement: {
      name: 'firecrawl_scrape',
      instructions:
        'Call once per known URL. Set formats to ["json"] and pass the extraction prompt and JSON schema in jsonOptions.',
      example_arguments: {
        url: 'https://example.com/page',
        formats: ['json'],
        jsonOptions: {
          prompt: 'Extract the requested fields from this page.',
          schema: {
            type: 'object',
            properties: {},
          },
        },
      },
    },
    docs_url: 'https://docs.firecrawl.dev/developer-guides/usage-guides/choosing-the-data-extractor',
  };
}
type ActionStatus = 'started' | 'success' | 'error';

function emitActionLog(
  toolName: string,
  status: ActionStatus,
  session?: SessionData,
  error?: unknown,
  requestId = randomUUID(),
  code?: string
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
    ...(code ? { code } : {}),
  };
  console.error('[MCP_ACTION]', JSON.stringify(payload));

  const secret = normalizeHeader(process.env.FIRECRAWL_MCP_ACTION_LOG_SECRET);
  const apiUrl = normalizeHeader(process.env.FIRECRAWL_API_URL);
  const endpoint =
    normalizeHeader(process.env.FIRECRAWL_MCP_ACTION_LOG_URL) ??
    (apiUrl ? `${withoutTrailingSlash(apiUrl)}/v2/mcp/action-logs` : undefined);
  if (!secret || !endpoint || !payload.team_id || status === 'started') return;
  // `code` is an MCP console-log discriminator, not part of the account-scoped
  // action-log API contract.
  const actionLogPayload = { ...payload };
  delete actionLogPayload.code;
  void fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(actionLogPayload),
    signal: AbortSignal.timeout(1500),
  }).catch(() => undefined);
}

function guardHostedTool(
  tool: RegisteredTool,
  { logActions }: { logActions: boolean }
): RegisteredTool {
  const keylessTool = KEYLESS_TOOL_NAMES.has(tool.name);
  const localKeylessTool = LOCAL_KEYLESS_TOOL_NAMES.has(tool.name);
  const execute = tool.execute;
  const canList = tool.canList;
  const beforeValidate = tool.beforeValidate;
  return {
    ...tool,
    canList: (session: SessionData) =>
      // A credentialError session lists the keyless tool surface (same as a
      // real keyless session, not the full authenticated schema) so the
      // client proceeds past tools/list and calling any listed tool returns
      // the CREDENTIAL_INVALID recovery payload (below). An empty list would
      // leave MCP clients that stop after tools/list unable to ever surface
      // the recovery guidance; the full non-keyless schema would over-disclose
      // to a request carrying an unrecognized or invalid credential.
      (session?.credentialError || isHostedKeylessSession(session)
        ? keylessTool
        : isLocalKeylessSession(session)
          ? localKeylessTool
          : true) &&
      (canList?.(session) ?? true),
    beforeValidate: async (args: unknown, session: SessionData) => {
      const code = session?.credentialError
        ? 'CREDENTIAL_INVALID'
        : isHostedKeylessSession(session) && !keylessTool
          ? 'KEYLESS_TOOL_NOT_AVAILABLE'
          : undefined;
      if (code) {
        const requestId = randomUUID();
        const payload = recoveryPayload(code, requestId);
        if (logActions) {
          emitActionLog(tool.name, 'error', session, new UserError(String(payload.message), payload), requestId, code);
        }
        return {
          content: [{ type: 'text' as const, text: String(payload.message) }],
          isError: true,
          structuredContent: payload,
        };
      }
      const earlyResult = await beforeValidate?.(args, session);
      if (earlyResult) {
        const payload = earlyResult.structuredContent;
        const recoveryCode =
          payload &&
          typeof payload === 'object' &&
          'code' in payload &&
          typeof payload.code === 'string'
            ? payload.code
            : undefined;
        if (logActions && earlyResult.isError && recoveryCode) {
          emitActionLog(
            tool.name,
            'error',
            session,
            new UserError(`Tool validation failed: ${recoveryCode}`, payload),
            randomUUID(),
            recoveryCode
          );
        }
        return earlyResult;
      }

      const schema = tool.parameters as typeof tool.parameters & {
        safeParseAsync?: (value: unknown) => Promise<{
          success: boolean;
          error?: { issues?: Array<{ message?: string; path?: PropertyKey[] }> };
        }>;
      };
      if (schema?.safeParseAsync) {
        const validation = await schema.safeParseAsync(args);
        if (!validation.success) {
          const issueText = (validation.error?.issues ?? [])
            .slice(0, 10)
            .map((issue) => {
              const location = issue.path?.length
                ? `${issue.path.map(String).join('.')}: `
                : '';
              return `${location}${issue.message ?? 'Invalid value'}`;
            })
            .join('; ');
          const requestId = randomUUID();
          const error = agentLegibleError(
            'INVALID_REQUEST',
            issueText || 'Tool arguments failed validation.',
            'Check the tool arguments against its input schema, correct the listed values, and retry.',
            requestId
          );
          if (logActions) {
            emitActionLog(
              tool.name,
              'error',
              session,
              error,
              requestId,
              'INVALID_REQUEST'
            );
          }
          return {
            content: [{ type: 'text' as const, text: error.message }],
            isError: true,
            structuredContent: error.extras,
          };
        }
      }
      return undefined;
    },
    execute: async (args, context) => {
      const requestId = randomUUID();
      const invocationSession: SessionData = {
        ...context.session,
        requestId,
      };
      copyManagedOAuthApiKey(context.session, invocationSession);
      const invocationContext = {
        ...context,
        session: invocationSession,
      };

      if (invocationSession.credentialError) {
        const code = 'CREDENTIAL_INVALID';
        const payload = recoveryPayload(code, requestId);
        if (logActions) emitActionLog(tool.name, 'error', invocationSession, new UserError(String(payload.message), payload), requestId, code);
        throw new UserError(String(payload.message), payload);
      }
      if (isHostedKeylessSession(invocationSession) && !keylessTool) {
        const code = 'KEYLESS_TOOL_NOT_AVAILABLE';
        const payload = recoveryPayload(code, requestId);
        if (logActions) emitActionLog(tool.name, 'error', invocationSession, new UserError(String(payload.message), payload), requestId, code);
        throw new UserError(String(payload.message), payload);
      }
      if (logActions) {
        emitActionLog(tool.name, 'started', invocationSession, undefined, requestId);
      }
      try {
        const result = await execute(args, invocationContext);
        if (logActions) {
          emitActionLog(tool.name, 'success', invocationSession, undefined, requestId);
        }
        return result;
      } catch (error) {
        const wrapped = wrapToolError(error, requestId);
        if (logActions) {
          emitActionLog(
            tool.name,
            'error',
            invocationSession,
            wrapped,
            requestId,
            typeof wrapped.extras?.code === 'string'
              ? wrapped.extras.code
              : undefined
          );
        }
        throw wrapped;
      }
    },
  };
}

const addTool = server.addTool.bind(server);
server.addTool = ((tool: RegisteredTool) => {
  // A dedicated search process registers through the same module-level tool
  // setup as full MCP. Filter at the server boundary so an accidental future
  // registration cannot widen its frozen public contract.
  if (
    primaryProfile.toolAllowlist &&
    !primaryProfile.toolAllowlist.has(tool.name)
  ) {
    return;
  }
  // The module registers the full `firecrawl_search` before startup. A primary
  // search profile must instead receive the strict marketplace variant below:
  // it has no scrapeOptions and no instructions referring to the excluded
  // feedback tool. Keep the name filter here so the full registration cannot
  // leak into the frozen six-tool surface.
  if (primaryProfile.id === 'search' && tool.name === 'firecrawl_search') {
    return;
  }
  addTool(guardHostedTool(tool, { logActions: primaryProfile.id !== 'search' }));
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
  const searchPrimary = primaryProfile.id === 'search';
  // Readiness covers only dependencies that can prevent this profile from
  // serving authenticated requests. Account and search identities never take
  // the keyless path; action logging is intentionally best-effort (see
  // emitActionLog), so neither should make those profiles unavailable.
  const required = [
    'FIRECRAWL_API_URL',
    'FIRECRAWL_OAUTH_INTROSPECT_SECRET',
    'MCP_DELEGATED_CREDENTIAL_SECRET',
  ];
  if (primaryProfile.allowKeyless) {
    required.push('KEYLESS_PROXY_SECRET');
  }
  const missing = required.filter((name) => !normalizeHeader(process.env[name]));
  const configuredEndpoint = getPrimaryEndpoint();
  const resourceMatchesEndpoint = searchPrimary
    ? withoutTrailingSlash(primaryProfile.resourceUrl) ===
      DEFAULT_MCP_SEARCH_RESOURCE_URL
    : withoutTrailingSlash(primaryProfile.resourceUrl).endsWith(
        configuredEndpoint
      );
  if (!resourceMatchesEndpoint) {
    missing.push(
      searchPrimary
        ? 'FIRECRAWL_MCP_SEARCH_RESOURCE_URL (endpoint mismatch)'
        : 'FIRECRAWL_MCP_RESOURCE_URL (endpoint mismatch)'
    );
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

type TruncationStats = {
  arrayItems: number;
  characters: number;
  fields: number;
};

// Detailed stays compatible for ordinary payloads; both ceilings prevent one
// tool result from consuming an agent's context window (~3k/~16k tokens).
const CONCISE_RESPONSE_MAX_CHARS = 12_000;
const DETAILED_RESPONSE_MAX_CHARS = 64_000;
const CRAWL_MAX_DOCUMENTS = 25;
const CRAWL_MAX_BYTES = 48_000;

const conciseOmittedFields = /(?:base64|screenshot)/i;

function compactResponseValue(
  value: unknown,
  limits: { arrayItems: number; objectFields: number; stringChars: number },
  stats: TruncationStats,
  concise: boolean,
  depth = 0
): unknown {
  if (typeof value === 'string') {
    if (value.length <= limits.stringChars) return value;
    stats.characters += value.length - limits.stringChars;
    return `${value.slice(0, limits.stringChars)}\n[truncated ${value.length - limits.stringChars} characters]`;
  }
  if (!value || typeof value !== 'object') return value;
  if (depth >= 12) {
    stats.fields += 1;
    return '[truncated nested value]';
  }
  if (Array.isArray(value)) {
    const retained = value.slice(0, limits.arrayItems);
    stats.arrayItems += value.length - retained.length;
    return retained.map((item) =>
      compactResponseValue(item, limits, stats, concise, depth + 1)
    );
  }

  const record = value as Record<string, unknown>;
  const hasMarkdown = typeof record.markdown === 'string' && record.markdown.length > 0;
  const entries = Object.entries(record).filter(([key]) => {
    const omit =
      concise &&
      (conciseOmittedFields.test(key) || (key === 'rawHtml' && hasMarkdown));
    if (omit) stats.fields += 1;
    return !omit;
  });
  const retained = entries.slice(0, limits.objectFields);
  stats.fields += entries.length - retained.length;
  return Object.fromEntries(
    retained.map(([key, item]) => [
      key,
      compactResponseValue(item, limits, stats, concise, depth + 1),
    ])
  );
}

function truncationMetadata(
  format: ResponseFormat,
  stats: TruncationStats,
  guidance: string
): Record<string, unknown> {
  const omitted = {
    fields: stats.fields,
    array_items: stats.arrayItems,
    characters: stats.characters,
  };
  const detailGuidance =
    format === 'concise'
      ? 'Use response_format: "detailed" to include fields omitted by concise format. '
      : '';
  return {
    truncated: true,
    response_format: format,
    omitted,
    message: `Response truncated; omitted ${omitted.fields} fields, ${omitted.array_items} array items, and ${omitted.characters} characters. ${detailGuidance}${guidance.slice(0, 2_000)}`.trim(),
  };
}

function withTruncationMetadata(
  value: unknown,
  metadata: Record<string, unknown>
): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>), _firecrawl: metadata }
    : { result: value, _firecrawl: metadata };
}

type ResultNoticeKind = 'scrape' | 'search' | 'map' | 'crawl' | 'agent';

function resultRecord(data: unknown): Record<string, any> | undefined {
  return data && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, any>)
    : undefined;
}

function withResultNotice(
  data: unknown,
  kind: ResultNoticeKind
): unknown {
  const root = resultRecord(data);
  if (!root) return data;
  const body = resultRecord(root.data) ?? root;
  const statusCode = Number(body.metadata?.statusCode ?? root.statusCode);
  const blocked =
    kind === 'scrape' &&
    ([401, 403, 429].includes(statusCode) ||
      /blocked|captcha|access denied/i.test(
        String(body.warning ?? body.error ?? root.warning ?? root.error ?? '')
      ));

  let empty = false;
  if (kind === 'scrape') {
    const contentFields = ['markdown', 'html', 'rawHtml', 'json', 'summary'];
    empty = contentFields.some((field) => field in body) &&
      contentFields.every((field) => body[field] == null || body[field] === '');
  } else if (kind === 'search') {
    const groups = Object.values(resultRecord(root.data) ?? {}).filter(Array.isArray);
    empty = groups.length > 0 && groups.every((group) => group.length === 0);
  } else if (kind === 'map') {
    empty = Array.isArray(body.links) && body.links.length === 0;
  } else if (kind === 'crawl') {
    empty = Array.isArray(root.data) && root.data.length === 0;
  } else if (kind === 'agent') {
    empty = Object.keys(body).length === 0;
  }
  if (!blocked && !empty) return data;

  const notice = blocked
    ? {
        code: 'LIKELY_BLOCKED',
        warning: true,
        message:
          'The response is empty or incomplete and carries a likely blocking signal from the target site.',
        next_actions: [
          {
            kind: 'adjust_request',
            instruction:
              'Verify the URL and retry with a supported proxy or a narrower scrape request; do not treat this response as page content.',
          },
        ],
      }
    : {
        code: 'EMPTY_RESULT',
        warning: true,
        message: 'Firecrawl returned an empty result for this request.',
        next_actions: [
          {
            kind: 'adjust_request',
            instruction:
              'Verify the URL, query, filters, or job status and retry with corrected or broader inputs if appropriate.',
          },
        ],
      };
  return {
    ...root,
    _firecrawl: {
      ...(resultRecord(root._firecrawl) ?? {}),
      ...notice,
    },
  };
}

function formatToolResponse(
  data: unknown,
  format: ResponseFormat,
  guidance: string
): string {
  const maxChars =
    format === 'concise'
      ? CONCISE_RESPONSE_MAX_CHARS
      : DETAILED_RESPONSE_MAX_CHARS;
  if (format === 'detailed') {
    const unchanged = asText(data);
    if (unchanged.length <= maxChars) return unchanged;
  }

  let limits =
    format === 'concise'
      ? { arrayItems: 8, objectFields: 30, stringChars: 2_000 }
      : { arrayItems: 50, objectFields: 100, stringChars: 12_000 };
  for (;;) {
    const stats: TruncationStats = { arrayItems: 0, characters: 0, fields: 0 };
    const compacted = compactResponseValue(
      data,
      limits,
      stats,
      format === 'concise'
    );
    const hadOmissions =
      stats.arrayItems > 0 || stats.characters > 0 || stats.fields > 0;
    if (!hadOmissions) return asText(compacted);
    const output = asText(
      withTruncationMetadata(
        compacted,
        truncationMetadata(format, stats, guidance)
      )
    );
    if (output.length <= maxChars) return output;
    if (
      limits.arrayItems === 1 &&
      limits.objectFields === 1 &&
      limits.stringChars === 128
    ) {
      return asText({
        _firecrawl: truncationMetadata(format, stats, guidance),
      });
    }
    limits = {
      arrayItems: Math.max(1, Math.floor(limits.arrayItems / 2)),
      objectFields: Math.max(1, Math.floor(limits.objectFields / 2)),
      stringChars: Math.max(128, Math.floor(limits.stringChars / 2)),
    };
  }
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
  delete out.response_format;

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
  url: z.string().url().describe('Page URL to scrape.'),
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
    .describe('Content formats to return.'),
  jsonOptions: z
    .object({
      prompt: z.string().optional().describe('Extraction instructions.'),
      schema: z
        .record(z.string(), z.any())
        .optional()
        .describe('JSON Schema-like object defining extracted fields.'),
    })
    .optional()
    .describe('Structured JSON extraction configuration.'),
  queryOptions: z
    .object({
      prompt: z.string().max(10000).describe('Question about the page.'),
      mode: z
        .enum(['directQuote', 'freeform'])
        .default('freeform')
        .describe('Answer mode; defaults to freeform.'),
    })
    .optional()
    .describe('Targeted page-question configuration.'),
  screenshotOptions: z
    .object({
      fullPage: z.boolean().optional().describe('Capture the full page.'),
      quality: z.number().optional().describe('Screenshot image quality.'),
      viewport: z
        .object({
          width: z.number().describe('Viewport width in pixels.'),
          height: z.number().describe('Viewport height in pixels.'),
        })
        .optional()
        .describe('Screenshot viewport dimensions.'),
    })
    .optional()
    .describe('Screenshot capture configuration.'),
  parsers: z
    .array(z.enum(['pdf']))
    .optional()
    .describe('Document parsers to enable.'),
  pdfOptions: z
    .object({
      maxPages: z
        .number()
        .int()
        .min(1)
        .max(10000)
        .optional()
        .describe('Maximum PDF pages to parse.'),
    })
    .optional()
    .describe('PDF parsing configuration.'),
  onlyMainContent: z
    .boolean()
    .optional()
    .describe('Exclude navigation, headers, and footers.'),
  redactPII: z.boolean().optional().describe('Redact detected personal information.'),
  includeTags: z
    .array(z.string())
    .optional()
    .describe('Only include these HTML tags.'),
  excludeTags: z
    .array(z.string())
    .optional()
    .describe('Exclude these HTML tags.'),
  waitFor: z.number().optional().describe('Render delay in milliseconds.'),
  ...(SAFE_MODE
    ? {}
    : {
        actions: z
          .array(
            z.object({
              type: z.enum(allowedActionTypes).describe('Browser action type.'),
              selector: z.string().optional().describe('Target CSS selector.'),
              milliseconds: z
                .number()
                .optional()
                .describe('Wait duration in milliseconds.'),
              text: z.string().optional().describe('Text to enter.'),
              key: z.string().optional().describe('Keyboard key to press.'),
              direction: z
                .enum(['up', 'down'])
                .optional()
                .describe('Scroll direction.'),
              script: z.string().optional().describe('JavaScript to execute.'),
              fullPage: z
                .boolean()
                .optional()
                .describe('Capture the full page for screenshot actions.'),
            })
          )
          .optional()
          .describe('Ordered browser actions to perform before extraction.'),
      }),
  mobile: z.boolean().optional().describe('Use a mobile device viewport.'),
  skipTlsVerification: z
    .boolean()
    .optional()
    .describe('Allow pages with invalid TLS certificates.'),
  removeBase64Images: z
    .boolean()
    .optional()
    .describe('Remove inline base64 images from output.'),
  location: z
    .object({
      country: z.string().optional().describe('ISO country code.'),
      languages: z
        .array(z.string())
        .optional()
        .describe('Preferred language codes.'),
    })
    .optional()
    .describe('Locale used when loading the page.'),
  storeInCache: z.boolean().optional().describe('Permit storing fetched content in cache.'),
  zeroDataRetention: z
    .boolean()
    .optional()
    .describe('Prevent Firecrawl from retaining request content when supported.'),
  maxAge: z
    .number()
    .optional()
    .describe('Maximum cached-content age in milliseconds; 0 forces live fetch.'),
  lockdown: z
    .boolean()
    .optional()
    .describe('Use cached content only; fail instead of fetching live.'),
  proxy: z
    .enum(['basic', 'stealth', 'enhanced', 'auto'])
    .optional()
    .describe('Proxy mode; stronger modes may use more credits.'),
  profile: z
    .object({
      name: z.string().describe('Browser profile name.'),
      saveChanges: z
        .boolean()
        .optional()
        .describe('Persist profile changes after scraping.'),
    })
    .optional()
    .describe('Reusable browser profile configuration.'),
  response_format: responseFormatSchema,
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
    .optional()
    .describe('Parsed content formats to return.'),
  jsonOptions: z
    .object({
      prompt: z.string().optional().describe('Extraction instructions.'),
      schema: z
        .record(z.string(), z.any())
        .optional()
        .describe('JSON Schema-like object defining extracted fields.'),
    })
    .optional()
    .describe('Structured JSON extraction configuration.'),
  queryOptions: z
    .object({
      prompt: z.string().max(10000).describe('Question about the document.'),
      mode: z
        .enum(['directQuote', 'freeform'])
        .default('freeform')
        .describe('Answer mode; defaults to freeform.'),
    })
    .optional()
    .describe('Targeted document-question configuration.'),
  parsers: z
    .array(z.enum(['pdf']))
    .optional()
    .describe('Document parsers to enable.'),
  pdfOptions: z
    .object({
      maxPages: z
        .number()
        .int()
        .min(1)
        .max(10000)
        .optional()
        .describe('Maximum PDF pages to parse.'),
    })
    .optional()
    .describe('PDF parsing configuration.'),
  onlyMainContent: z
    .boolean()
    .optional()
    .describe('Exclude navigation, headers, and footers.'),
  redactPII: z.boolean().optional().describe('Redact detected personal information.'),
  includeTags: z
    .array(z.string())
    .optional()
    .describe('Only include these HTML tags.'),
  excludeTags: z
    .array(z.string())
    .optional()
    .describe('Exclude these HTML tags.'),
  removeBase64Images: z
    .boolean()
    .optional()
    .describe('Remove inline base64 images from output.'),
  skipTlsVerification: z
    .boolean()
    .optional()
    .describe('Allow source URLs with invalid TLS certificates.'),
  storeInCache: z
    .boolean()
    .optional()
    .describe('Ignored: parse does not store indexed content.'),
  zeroDataRetention: z
    .boolean()
    .optional()
    .describe('Prevent Firecrawl from retaining document content when supported.'),
  maxAge: z
    .number()
    .optional()
    .describe('Ignored: parse never reuses or stores indexed content.'),
  proxy: z
    .enum(['basic', 'auto'])
    .optional()
    .describe('Proxy mode used for remote document URLs.'),
  response_format: responseFormatSchema,
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
  delete options.response_format;
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
  options: Record<string, unknown>,
  responseFormat: ResponseFormat
): Record<string, unknown> {
  return {
    uploadRef,
    ...(removeEmptyTopLevel(options) as Record<string, unknown>),
    response_format: responseFormat,
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
    throw agentLegibleError(
      'PARSE_INPUT_INVALID',
      'Hosted firecrawl_parse requires exactly one of filePath or uploadRef.',
      'Provide filePath for phase one or uploadRef for phase two, but not both, then retry.',
      session?.requestId
    );
  }

  if (!hasCredential(session) && !isKeylessMode(session)) {
    throw agentLegibleError(
      'AUTH_REQUIRED',
      'Hosted firecrawl_parse requires an authenticated Firecrawl session or keyless eligibility.',
      'Connect the existing Firecrawl MCP server, configure an API key, or use eligible hosted keyless mode, then start a new session and retry.',
      session?.requestId
    );
  }

  if (isHostedKeylessSession(session) && args.zeroDataRetention === true) {
    const payload = {
      ...recoveryPayload('KEYLESS_OPTION_NOT_AVAILABLE', session?.requestId),
      option: 'zeroDataRetention',
      message:
        'Zero Data Retention is not available in anonymous keyless mode. Omit zeroDataRetention to parse with keyless access, or connect an account or configure an API key for a team where Zero Data Retention is enabled, then retry.',
    };
    throw new UserError(String(payload.message), payload);
  }

  const responseFormat = (args.response_format ?? 'detailed') as ResponseFormat;
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

    return formatToolResponse(
      {
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
        arguments: buildContinuationArguments(
          upload.uploadRef,
          options,
          responseFormat
        ),
      },
        notes: [
          'Run the curl command on the machine that can read filePath.',
          'After the PUT succeeds, use nextToolCall as the second MCP tool call.',
          'Clients without a local upload mechanism cannot complete hosted parse for local files.',
        ],
      },
      responseFormat,
      'Use a shorter file path and fewer parse options to retrieve omitted upload instructions.'
    );
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
  return formatToolResponse(
    parseJson,
    responseFormat,
    'Parse fewer pages or request fewer output formats to retrieve the omitted content.'
  );
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
Retrieve content or structured fields from one supplied URL. Use this when the request identifies a page and needs its content or defined fields. For multiple pages use \`firecrawl_crawl\`; to discover URLs use \`firecrawl_map\` or \`firecrawl_search\`.
`,
  parameters: scrapeParamsSchema,
  execute: async (args: unknown, { session, log }): Promise<string> => {
    const { url, response_format = 'detailed', ...options } = args as {
      url: string;
      response_format?: ResponseFormat;
    } & Record<string, unknown>;
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
      return formatToolResponse(
        withResultNotice(json?.data ?? json, 'scrape'),
        response_format,
        'Request fewer formats or narrow the extraction to retrieve omitted page content.'
      );
    }
    const client = getClient(session);
    const res = await client.scrape(String(url), {
      ...cleaned,
      origin: ORIGIN,
    } as any);
    return formatToolResponse(
      withResultNotice(res, 'scrape'),
      response_format,
      'Request fewer formats or narrow the extraction to retrieve omitted page content.'
    );
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
Enumerate URLs under one website without fetching each page. Returns matching URLs rather than page bodies; retrieve one page with \`firecrawl_scrape\` or multiple pages with \`firecrawl_crawl\`.
`,
  parameters: z.object({
    url: z.string().url().describe('Website root URL to map.'),
    search: z.string().optional().describe('Term used to rank matching URLs.'),
    sitemap: z
      .enum(['include', 'skip', 'only'])
      .optional()
      .describe('Whether sitemap URLs are included, skipped, or exclusive.'),
    includeSubdomains: z
      .boolean()
      .optional()
      .describe('Include URLs from subdomains.'),
    limit: z.number().optional().describe('Maximum number of URLs returned.'),
    ignoreQueryParameters: z
      .boolean()
      .optional()
      .describe('Deduplicate URLs that differ only by query parameters.'),
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
    return formatToolResponse(
      withResultNotice(res, 'map'),
      'detailed',
      'Retry firecrawl_map with a lower limit or narrower search term to retrieve omitted URLs.'
    );
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
Search web, news, image, and specialized sources. Operators include quoted phrases, \`-term\`, \`site:host\`, \`inurl:term\`, \`intitle:term\`, and \`related:host\`; the set is non-exhaustive. Use \`categories: ["developer"]\` for indexed GitHub and documentation results.

\`categories: ["research"]\` restricts these web results to research-affiliated websites. The \`firecrawl_research_*\` tools are a separate surface for paper abstracts and full text across biomedical (PubMed, bioRxiv, medRxiv) and arXiv literature. Authenticated responses can include an \`id\` for optional search feedback.
`,
  parameters: z
    .object({
      ...searchToolBaseFields,
      scrapeOptions: scrapeParamsSchema
        .omit({ url: true, response_format: true })
        .partial()
        .optional()
        .describe(
          'Scrape configuration applied to each result. Fetching full page content increases response size and credit use.'
        ),
    })
    .refine(searchDomainsAreExclusive, SEARCH_DOMAINS_CONFLICT_MESSAGE),
  execute: async (args: unknown, { session, log }): Promise<string> => {
    const { query, response_format = 'detailed', ...opts } = args as Record<
      string,
      unknown
    > & { response_format?: ResponseFormat };

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
      // Search feedback requires an authenticated account. Do not expose its
      // identifier to keyless clients, where it would invite an unusable call.
      const keylessResponse = { ...(json ?? {}) };
      delete keylessResponse.id;
      return formatToolResponse(
        withResultNotice(keylessResponse, 'search'),
        response_format,
        'Use a lower limit, narrower query, or fewer scrapeOptions formats to retrieve omitted results.'
      );
    }
    // Call /v2/search through the SDK's HTTP layer (auth + retries) instead
    // of `client.search()` so we preserve the full response envelope. The
    // high-level `search()` helper strips `id` and `creditsUsed`, which
    // supports the optional authenticated `firecrawl_search_feedback` workflow.
    const client = getClient(session);
    const httpRes = await (client as any).http.post('/v2/search', searchBody);
    return formatToolResponse(
      withResultNotice(httpRes?.data ?? {}, 'search'),
      response_format,
      'Use a lower limit, narrower query, or fewer scrapeOptions formats to retrieve omitted results.'
    );
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
  return extractSingleTrustedClientIp(request?.headers?.['x-forwarded-for']);
}

/**
 * Read-only keyless check. MCP tool failures are returned in-band, not as an
 * OAuth transport challenge, so preserve only the quota details needed for recovery.
 */
type KeylessEligibility = {
  eligible: boolean;
  reason?: string;
  retryAfterSeconds?: number;
  unavailable?: boolean;
};

function keylessQuotaReason(reason: unknown): reason is 'requests' | 'credits' {
  return reason === 'requests' || reason === 'credits';
}

async function keylessEligible(clientIp: string): Promise<KeylessEligibility> {
  const secret = process.env.KEYLESS_PROXY_SECRET;
  if (!secret) return { eligible: false, unavailable: true };
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
    if (!response.ok) return { eligible: false, unavailable: true };
    const json: any = await response.json().catch(() => null);
    if (typeof json?.eligible !== 'boolean') {
      return { eligible: false, unavailable: true };
    }
    return {
      eligible: json?.eligible === true,
      ...(typeof json?.reason === 'string' ? { reason: json.reason } : {}),
      ...(Number.isFinite(json?.retryAfterSeconds) && json.retryAfterSeconds > 0
        ? { retryAfterSeconds: json.retryAfterSeconds }
        : {}),
    };
  } catch {
    return { eligible: false, unavailable: true };
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
  if (isHostedKeylessSession(session)) {
    const eligibility = session?.keylessClientIp
      ? await keylessEligible(session.keylessClientIp)
      : { eligible: false };
    if (!eligibility.eligible) {
      const code = eligibility.unavailable
        ? 'KEYLESS_ELIGIBILITY_UNAVAILABLE'
        : keylessQuotaReason(eligibility.reason)
          ? 'KEYLESS_QUOTA_EXHAUSTED'
          : 'KEYLESS_ACCESS_NOT_AVAILABLE';
      const payload = recoveryPayload(code, session?.requestId, {
        retryAfterSeconds: eligibility.retryAfterSeconds,
      });
      throw new UserError(String(payload.message), payload);
    }
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
    if (isKeylessMode(session) && response.status === 429) {
      // The API normally supplies requests|credits. Preserve a structured,
      // non-specific recovery payload during a skewed or legacy deployment.
      const code = keylessQuotaReason(json?.reason)
        ? 'KEYLESS_QUOTA_EXHAUSTED'
        : 'KEYLESS_LIMIT_REACHED';
      const payload = recoveryPayload(code, session?.requestId, {
        retryAfterSeconds:
          Number.isFinite(json?.retry_after_seconds) &&
          json.retry_after_seconds > 0
            ? json.retry_after_seconds
            : undefined,
      });
      throw new UserError(String(payload.message), payload);
    }
    throw new Error(
      json?.error || `Firecrawl request failed (HTTP ${response.status})`
    );
  }
  return json;
}

function crawlPageData(body: any): unknown[] {
  return Array.isArray(body.data) ? body.data : body.data?.pages || [];
}

function crawlDataBytes(docs: unknown[]): number {
  return Buffer.byteLength(JSON.stringify(docs));
}

function validatedCrawlContinuation(jobId: string, continuation: string): string {
  const apiBase = new URL(resolveApiBaseUrl());
  const url = new URL(continuation, apiBase);
  const expectedPath = `/v2/crawl/${encodeURIComponent(jobId)}`;
  if (url.origin !== apiBase.origin || url.pathname !== expectedPath) {
    throw new Error('Crawl continuation must belong to this crawl job.');
  }
  return `${url.pathname}${url.search}`;
}

async function getCrawlStatusWithOrigin(
  client: FirecrawlApp,
  jobId: string,
  continuation?: string
): Promise<Record<string, unknown>> {
  const requestPath = continuation
    ? validatedCrawlContinuation(jobId, continuation)
    : `/v2/crawl/${encodeURIComponent(jobId)}`;
  const res = await (client as any).http.get(requestPath, ORIGIN_HEADERS);
  const body = (res?.data ?? {}) as any;
  const docs = crawlPageData(body).slice();
  let current =
    body.next ??
    (Array.isArray(body.data) ? null : body.data?.next) ??
    null;
  let bytes = crawlDataBytes(docs);

  while (
    current &&
    docs.length < CRAWL_MAX_DOCUMENTS &&
    bytes < CRAWL_MAX_BYTES
  ) {
    const pageRes = await (client as any).http.get(current, ORIGIN_HEADERS);
    const payload = (pageRes?.data ?? {}) as any;
    if (!payload.success) break;

    const pageData = crawlPageData(payload);
    const pageBytes = crawlDataBytes(pageData);
    if (
      docs.length > 0 &&
      (docs.length + pageData.length > CRAWL_MAX_DOCUMENTS ||
        bytes + pageBytes > CRAWL_MAX_BYTES)
    ) {
      break;
    }
    docs.push(...pageData);
    bytes += pageBytes;
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
    next: current,
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
  url: z.string().url().describe('Useful source URL.'),
  reason: z
    .string()
    .max(1000)
    .optional()
    .describe('Why this source was useful.'),
});

const missingContentSchema = z.object({
  topic: z
    .string()
    .min(1, 'topic must not be empty')
    .max(200, 'topic must be 200 characters or fewer')
    .describe('Short name for the missing topic.'),
  description: z
    .string()
    .max(2000)
    .optional()
    .describe('Details about the expected missing content.'),
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

if (!SEARCH_FEEDBACK_DISABLED && !isLocalKeylessStartup()) {
  server.addTool({
    name: 'firecrawl_search_feedback',
    annotations: {
      title: 'Send feedback on a search result',
      readOnlyHint: false, // POSTs structured feedback to the API, creating a server-side record.
      openWorldHint: true, // Feedback references open-web search results and external URLs.
      destructiveHint: false, // Additive only; records feedback and may refund credits, does not delete data.
    },
    description: `
Record quality feedback for a prior search ID. A \`good\` rating requires a valuable source, \`partial\` a valuable source or \`missingContent\`, and \`bad\` \`missingContent\` or a query suggestion. Caps are 50 \`valuableSources\` and 20 \`missingContent\` entries; eligible searches must be within the feedback age window, and records are idempotent per search ID. Eligible first feedback can refund 1 credit subject to the team's daily cap; the response reports whether a refund was applied and daily-cap status.
`,
    parameters: z.object({
      searchId: z
        .string()
        .uuid('searchId must be the UUID returned by firecrawl_search')
        .describe('UUID returned by firecrawl_search.'),
      rating: z
        .enum(['good', 'bad', 'partial'])
        .describe('Overall search-result quality rating.'),
      valuableSources: z
        .array(
          z.object({
            url: z.string().url().describe('Useful result URL.'),
            reason: z
              .string()
              .max(1000)
              .optional()
              .describe('Why this source was useful.'),
          })
        )
        .max(50)
        .optional()
        .describe('Useful sources from the search; maximum 50.'),
      missingContent: z
        .array(
          z.object({
            topic: z
              .string()
              .min(1, 'topic must not be empty')
              .max(200, 'topic must be 200 characters or fewer')
              .describe('Short name for the missing topic.'),
            description: z
              .string()
              .max(2000)
              .optional()
              .describe('Details about the expected missing content.'),
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
        .describe('Suggested query improvements; maximum 2000 characters.'),
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
        throw agentLegibleError(
          'AUTH_REQUIRED',
          'Search feedback requires an authenticated Firecrawl account.',
          'Connect the existing Firecrawl MCP server or configure an API key, then start a new session and retry.',
          session?.requestId
        );
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
        throw agentLegibleError(
          'FEEDBACK_REJECTED',
          parsed?.error ?? `HTTP ${response.status}`,
          response.status >= 500
            ? 'Retry once later with the same substantive feedback.'
            : 'Check the search ID, feedback fields, and submission window before retrying.',
          session?.requestId,
          response.status >= 500
        );
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

if (!ENDPOINT_FEEDBACK_DISABLED && !isLocalKeylessStartup()) {
  server.addTool({
    name: 'firecrawl_feedback',
    annotations: {
      title: 'Send feedback on a Firecrawl job',
      readOnlyHint: false, // POSTs structured feedback for a completed job to /v2/feedback.
      openWorldHint: true, // Feedback is tied to jobs that processed open-web URLs.
      destructiveHint: false, // Additive only; submits ratings and notes, does not delete jobs or external content.
    },
    description: `
Record quality feedback for a completed search, scrape, parse, or map job. This creates feedback metadata but does not modify the original job or its result.
`,
    parameters: z.object({
      endpoint: z
        .enum(['search', 'scrape', 'parse', 'map'])
        .describe('Firecrawl operation being rated.'),
      jobId: z
        .string()
        .uuid('jobId must be the UUID returned by Firecrawl')
        .describe('UUID returned by the rated Firecrawl operation.'),
      rating: z
        .enum(['good', 'bad', 'partial'])
        .describe('Overall operation-result quality rating.'),
      issues: z
        .array(feedbackIssueSchema)
        .max(20)
        .optional()
        .describe('Machine-readable issue codes; maximum 20.'),
      tags: z
        .array(feedbackIssueSchema)
        .max(20)
        .optional()
        .describe('Additional classification tags; maximum 20.'),
      note: z
        .string()
        .max(4000)
        .optional()
        .describe('Concise feedback note; maximum 4000 characters.'),
      valuableSources: z
        .array(valuableSourceSchema)
        .max(50)
        .optional()
        .describe('Useful sources from the result; maximum 50.'),
      missingContent: z
        .array(missingContentSchema)
        .max(50)
        .optional()
        .describe('Expected content absent from the result; maximum 50.'),
      querySuggestions: z
        .string()
        .max(2000)
        .optional()
        .describe('Suggested query improvements; maximum 2000 characters.'),
      url: z.string().url().optional().describe('Relevant source URL.'),
      pageNumbers: z
        .array(z.number().int().positive())
        .max(100)
        .optional()
        .describe('Relevant one-based page numbers; maximum 100.'),
      metadata: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Small structured context for the feedback.'),
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
        throw agentLegibleError(
          'AUTH_REQUIRED',
          'Endpoint feedback requires an authenticated Firecrawl account.',
          'Connect the existing Firecrawl MCP server or configure an API key, then start a new session and retry.',
          session?.requestId
        );
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
        throw agentLegibleError(
          'FEEDBACK_REJECTED',
          parsed?.error ?? `HTTP ${response.status}`,
          response.status >= 500
            ? 'Retry once later with the same substantive feedback.'
            : 'Check the job ID, feedback fields, and submission window before retrying.',
          session?.requestId,
          response.status >= 500
        );
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
Start a multi-page website crawl and wait for its terminal state. Use for page content across a site; \`firecrawl_map\` returns only URLs. A returned \`next\` value continues results through \`firecrawl_check_crawl_status\`.
`,
  parameters: z.object({
    url: z.string().describe('Website URL where the crawl starts.'),
    prompt: z.string().optional().describe('Natural-language crawl scope instructions.'),
    excludePaths: z
      .array(z.string())
      .optional()
      .describe('URL path patterns to exclude.'),
    includePaths: z
      .array(z.string())
      .optional()
      .describe('URL path patterns to include.'),
    maxDiscoveryDepth: z
      .number()
      .optional()
      .describe('Maximum link depth from the starting URL.'),
    sitemap: z
      .enum(['skip', 'include', 'only'])
      .optional()
      .describe('Whether sitemap URLs are skipped, included, or exclusive.'),
    limit: z.number().optional().describe('Maximum pages to crawl.'),
    allowExternalLinks: z
      .boolean()
      .optional()
      .describe('Allow crawling links outside the starting domain.'),
    allowSubdomains: z
      .boolean()
      .optional()
      .describe('Allow crawling subdomains.'),
    crawlEntireDomain: z
      .boolean()
      .optional()
      .describe('Expand beyond the starting URL path.'),
    delay: z.number().optional().describe('Delay between requests in seconds.'),
    maxConcurrency: z
      .number()
      .optional()
      .describe('Maximum concurrent crawl requests.'),
    ...(SAFE_MODE
      ? {}
      : {
          webhook: z.string().optional().describe('Webhook URL for crawl events.'),
          webhookHeaders: z
            .record(z.string(), z.string())
            .optional()
            .describe('HTTP headers sent to the crawl webhook.'),
        }),
    deduplicateSimilarURLs: z
      .boolean()
      .optional()
      .describe('Remove URLs with substantially similar paths.'),
    ignoreQueryParameters: z
      .boolean()
      .optional()
      .describe('Deduplicate URLs that differ only by query parameters.'),
    scrapeOptions: scrapeParamsSchema
      .omit({ url: true, response_format: true })
      .partial()
      .optional()
      .describe(
        'Scrape configuration applied to every crawled page. Rich formats increase response size and credit use.'
      ),
    response_format: responseFormatSchema,
  }),
  execute: async (args, { session, log }) => {
    const {
      url,
      response_format = 'detailed',
      ...options
    } = args as Record<string, unknown> & {
      response_format?: ResponseFormat;
    };
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
      throw agentLegibleError(
        'CRAWL_START_FAILED',
        started?.data?.error ?? 'Firecrawl did not return a crawl job ID.',
        'Check the crawl URL and options, then retry once; do not report a crawl as started without a job ID.',
        session?.requestId,
        true
      );
    }
    const res = await waitForCrawlCompletionWithOrigin(
      client,
      crawlId,
      pollInterval,
      timeout
    );
    return formatToolResponse(
      withResultNotice(res, 'crawl'),
      response_format,
      res.next
        ? `Call firecrawl_check_crawl_status with id: "${crawlId}" and next: "${String(res.next)}" to retrieve later documents; narrow scrapeOptions to retrieve omitted document fields.`
        : 'Narrow scrapeOptions to retrieve omitted document fields.'
    );
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
Retrieve status and available results for an existing crawl ID without starting or modifying it. Pass a returned \`next\` value with the same ID to retrieve later documents.
`,
  parameters: z.object({
    id: z.string().describe('Crawl job ID.'),
    next: z
      .string()
      .max(4_096)
      .optional()
      .describe('Continuation URL returned by a previous status call.'),
    response_format: responseFormatSchema,
  }),
  execute: async (
    args: unknown,
    { session }: { session?: SessionData }
  ): Promise<string> => {
    const client = getClient(session);
    const {
      id,
      next,
      response_format = 'detailed',
    } = args as {
      id: string;
      next?: string;
      response_format?: ResponseFormat;
    };
    const res = await getCrawlStatusWithOrigin(client, id, next);
    return formatToolResponse(
      withResultNotice(res, 'crawl'),
      response_format,
      res.next
        ? `Call firecrawl_check_crawl_status with id: "${id}" and next: "${String(res.next)}" to retrieve later documents; narrow the crawl request to retrieve omitted document fields.`
        : 'Narrow the crawl request to retrieve omitted document fields.'
    );
  },
});

server.addTool({
  name: 'firecrawl_extract',
  annotations: {
    title: 'Deprecated: use Scrape JSON',
    readOnlyHint: true,
    openWorldHint: true,
    destructiveHint: false,
  },
  description: `
Deprecated compatibility entry point. Use firecrawl_scrape once per known URL with formats: ["json"] and jsonOptions containing the prompt and schema. Use firecrawl_search or firecrawl_agent before Scrape when URLs are not known.
`,
  parameters: z.object({
    urls: z.array(z.string()),
    prompt: z.string().optional(),
    schema: z.record(z.string(), z.any()).optional(),
    allowExternalLinks: z.boolean().optional(),
    enableWebSearch: z.boolean().optional(),
    includeSubdomains: z.boolean().optional(),
  }),
  canList: () => false,
  beforeValidate: () => {
    const payload = deprecatedExtractPayload();
    return {
      content: [{ type: 'text' as const, text: payload.message }],
      isError: true,
      structuredContent: payload,
    };
  },
  execute: async (): Promise<string> => {
    const payload = deprecatedExtractPayload();
    throw new UserError(payload.message, payload);
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
Start an asynchronous multi-source web research job. Use for synthesis that can wait for asynchronous completion; \`firecrawl_search\` and \`firecrawl_scrape\` return evidence synchronously. This call returns only a job ID, not the research result; read it with \`firecrawl_agent_status\`.
`,
  parameters: z.object({
    prompt: z
      .string()
      .min(1)
      .max(10000)
      .describe('Research question and requested output.'),
    urls: z
      .array(z.string().url())
      .optional()
      .describe('Optional seed URLs for the research job.'),
    schema: z
      .record(z.string(), z.any())
      .optional()
      .describe(
        'JSON Schema-like object defining the final structured result. Narrow schemas reduce result size.'
      ),
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
Retrieve progress or final results for a \`firecrawl_agent\` job ID. A \`processing\` response is non-terminal and does not contain the final research result; check again until \`completed\` or \`failed\`.
`,
  parameters: z.object({
    id: z.string().describe('Agent job ID.'),
    response_format: responseFormatSchema,
  }),
  execute: async (args: unknown, { session, log }): Promise<string> => {
    const client = getClient(session);
    const { id, response_format = 'detailed' } = args as {
      id: string;
      response_format?: ResponseFormat;
    };
    log.info('Checking agent status', { id });
    const res = await (client as any).http.get(
      `/v2/agent/${encodeURIComponent(id)}`,
      ORIGIN_HEADERS
    );
    return formatToolResponse(
      withResultNotice(res?.data ?? {}, 'agent'),
      response_format,
      'Use a narrower agent prompt or schema to retrieve omitted result content.'
    );
  },
});

// Interact tools (scrape-bound browser sessions)
server.addTool({
  name: 'firecrawl_interact',
  annotations: {
    title: 'Interact with a scraped page',
    readOnlyHint: false, // Executes browser interactions (clicks, form input, scripts) in a live session.
    openWorldHint: true, // Interacts with pages on the public web via the scraped session.
    destructiveHint: false, // Transient page interactions only; does not delete monitors, jobs, or external sites.
  },
  description: `
Open or reuse a live browser session to interact with a page by prompt or code. This acts on the live site, so form submissions and similar actions can create persistent external side effects.
`,
  parameters: z
    .object({
      scrapeId: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe('Existing scrape session ID; mutually exclusive with url.'),
      url: z
        .string()
        .trim()
        .url()
        .optional()
        .describe('Page URL to open; mutually exclusive with scrapeId.'),
      prompt: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe('Natural-language browser interaction instructions.'),
      code: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe('Executable browser-session code; may accompany prompt.'),
      language: z
        .enum(['bash', 'python', 'node'])
        .optional()
        .describe('Code runtime; used only with code.'),
      timeout: z
        .number()
        .min(1)
        .max(300)
        .optional()
        .describe('Execution timeout in seconds; maximum 300.'),
      scrapeOptions: scrapeParamsSchema
        .omit({ url: true, response_format: true })
        .partial()
        .optional()
        .describe('Scrape configuration used only when opening url.'),
      response_format: responseFormatSchema,
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
      response_format = 'detailed',
    } = args as {
      scrapeId?: string;
      url?: string;
      prompt?: string;
      code?: string;
      language?: 'bash' | 'python' | 'node';
      timeout?: number;
      scrapeOptions?: Record<string, unknown>;
      response_format?: ResponseFormat;
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
        throw agentLegibleError(
          'INTERACT_SESSION_UNAVAILABLE',
          'The scrape did not return a scrapeId.',
          'Verify the URL, call firecrawl_scrape, and retry firecrawl_interact with the returned scrapeId.',
          session?.requestId
        );
      }
    }
    if (!scrapeId) {
      throw agentLegibleError(
        'INTERACT_SESSION_UNAVAILABLE',
        'Could not open an interact session because scrapeId is missing.',
        'Call firecrawl_scrape and retry firecrawl_interact with its scrapeId.',
        session?.requestId
      );
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
      return formatToolResponse(
        {
          ...(res as unknown as Record<string, unknown>),
          scrapeId: activeScrapeId,
        },
        response_format,
        'Use a narrower interaction prompt or code output to retrieve omitted content.'
      );
    }
    if (openedFromUrl) {
      return formatToolResponse(
        { scrapeId: activeScrapeId, result: res },
        response_format,
        'Use a narrower interaction prompt or code output to retrieve omitted content.'
      );
    }
    return formatToolResponse(
      res,
      response_format,
      'Use a narrower interaction prompt or code output to retrieve omitted content.'
    );
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
Stop a live interact session and release its resources. The stopped session cannot be resumed.
`,
  parameters: z.object({
    scrapeId: z.string().describe('Interact session ID to stop.'),
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
Parse one local or uploaded document into text or structured data; remote web URLs belong in \`firecrawl_scrape\`. Local MCP reads \`filePath\`; hosted MCP first returns upload instructions, then parses the returned \`uploadRef\`. \`redactPII\` requests personal-data redaction; \`zeroDataRetention\` requires an eligible account, so omit it for anonymous keyless use.
`,
  parameters: parseParamsSchema,
  execute: async (args: unknown, { session, log }): Promise<string> => {
    if (process.env.CLOUD_SERVICE === 'true') {
      return executeHostedParse(args as ParseToolArgs, session, log);
    }

    const apiUrl = process.env.FIRECRAWL_API_URL;
    if (!apiUrl) {
      throw agentLegibleError(
        'PARSE_CONFIG_REQUIRED',
        'firecrawl_parse requires FIRECRAWL_API_URL to be set to a self-hosted Firecrawl API instance.',
        'Set FIRECRAWL_API_URL on the local MCP server, start a new session, and retry.',
        session?.requestId
      );
    }

    const {
      filePath,
      contentType: overrideContentType,
      response_format = 'detailed',
      ...options
    } = args as {
      filePath: string;
      contentType?: string;
      response_format?: ResponseFormat;
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
      throw agentLegibleError(
        'PARSE_REQUEST_FAILED',
        `Parse request failed with status ${response.status}: ${responseText}`,
        'Verify the file type and parse options, then retry once if the request is safe to repeat.',
        session?.requestId,
        response.status >= 500
      );
    }

    try {
      return formatToolResponse(
        JSON.parse(responseText),
        response_format,
        'Parse fewer pages or request fewer output formats to retrieve omitted content.'
      );
    } catch {
      if (
        response_format === 'detailed' &&
        responseText.length <= DETAILED_RESPONSE_MAX_CHARS
      ) {
        return responseText;
      }
      return formatToolResponse(
        responseText,
        response_format,
        'Parse fewer pages or request fewer output formats to retrieve omitted content.'
      );
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
Search web and specialized indexes. Operators include quoted phrases, \`-term\`, \`site:host\`, \`inurl:term\`, \`intitle:term\`, and \`related:host\`; the set is non-exhaustive. Use \`categories: ["developer"]\` for indexed GitHub and documentation results.

\`categories: ["research"]\` restricts these web results to research-affiliated websites. The \`firecrawl_research_*\` tools are a separate surface for paper abstracts and full text across biomedical (PubMed, bioRxiv, medRxiv) and arXiv literature.
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
        response_format = 'detailed',
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
        response_format?: ResponseFormat;
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
      return formatToolResponse(
        withResultNotice(httpRes?.data ?? {}, 'search'),
        response_format,
        'Use a lower limit or narrower query to retrieve omitted results.'
      );
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
registerDeveloperTools(server, getClient);

if (
  process.env.CLOUD_SERVICE === 'true' &&
  primaryProfile.allowKeyless &&
  !normalizeHeader(process.env.KEYLESS_PROXY_SECRET)
) {
  console.warn(
    '[firecrawl-mcp] KEYLESS_PROXY_SECRET is missing; keyless requests will be unavailable and /ready will fail.'
  );
}

if (primaryProfile.id === 'search') {
  // The strict marketplace search tool intentionally replaces the full
  // surface's same-named registration above. Register through the original
  // bound method so the name-level guard cannot suppress this replacement.
  const primarySearchRegistrar: ToolRegistrar = {
    addTool: ((tool: { name: string }) => {
      if (primaryProfile.toolAllowlist?.has(tool.name)) {
        addTool(guardHostedTool(tool as RegisteredTool, { logActions: false }));
      }
    }) as FastMCP<SessionData>['addTool'],
  };
  registerMarketplaceSearchTool(primarySearchRegistrar, getClient);
}

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
