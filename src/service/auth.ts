import type { IncomingHttpHeaders } from 'http';
import { randomUUID } from 'node:crypto';
import {
  invalidApiKeyRecoveryPayload,
  invalidOAuthRecoveryPayload,
  normalizeHeader,
  withoutTrailingSlash,
} from '../server.js';
import { escapeWWWAuthenticateValue } from './www-authenticate.js';
import {
  createIntrospectionCache,
  INTROSPECTION_ACTIVE_TTL_MS,
  INTROSPECTION_INACTIVE_TTL_MS,
  introspectionTtlMs,
} from './introspection-cache.js';
import {
  credentialValidationUnavailable,
  CredentialValidationUnavailableError,
  requireDelegatedCredentialSigning,
  setManagedOAuthApiKey,
} from './session-credential.js';
import {
  DEFAULT_MCP_RESOURCE_URL,
  DEFAULT_MCP_SEARCH_ENDPOINT,
  getOAuthIssuer,
  type ServerProfile,
} from './profiles.js';
import type { ServiceSession } from './session.js';

/** The HTTP request FastMCP hands to `authenticate`; absent for stdio. */
type AuthRequest = {
  headers: IncomingHttpHeaders;
  url?: string;
};

export type ServiceAuthOptions = {
  /** Apply the hosted session policy (credential required). */
  hosted: boolean;
  /** Credential used when a request does not carry one. */
  apiKey?: string;
  /** Firecrawl API base URL. */
  apiUrl?: string;
  transport: 'stdio' | 'httpStream';
};

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

function isLegacyKeyPathRequest(request: AuthRequest | undefined): boolean {
  return (
    normalizeHeader(request?.headers?.['x-firecrawl-key-transport']) === 'path'
  );
}

function requestShouldReceiveOAuthChallenge(
  request: AuthRequest | undefined,
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
  oauthEnabled: boolean,
  details: Record<string, unknown> = {}
): Response | undefined {
  if (!oauthEnabled) {
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

/**
 * Seconds advertised to the client after a failed credential check. Short
 * enough that a working session recovers on the next attempt, long enough that
 * a client retrying immediately does not amplify an upstream outage.
 */
const CREDENTIAL_VALIDATION_RETRY_AFTER_SECONDS = 5;

/**
 * A failed credential check is a temporary server-side condition, not a verdict
 * on the client's credential, so this stays a 503 (RFC 9110 15.6.4) and carries
 * `Retry-After` to name a concrete wait. Two things are deliberately absent:
 * `WWW-Authenticate`, which would push a still-valid session into a needless
 * reauthorization, and an OAuth `error` code, which RFC 6749 reserves for 400
 * and 401 responses and which clients surface as an authentication verdict. The
 * body is the sentence alone; the reason for the failure goes to the server log.
 */
function createCredentialValidationUnavailableResponse(
  error: CredentialValidationUnavailableError
): Response {
  return new Response(error.message, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Retry-After': String(CREDENTIAL_VALIDATION_RETRY_AFTER_SECONDS),
    },
    status: 503,
  });
}

function getOAuthIntrospectionEndpoint(): string {
  return `${getOAuthIssuer()}/api/oauth/introspect`;
}

function getOAuthIntrospectionSecret(): string | undefined {
  return normalizeHeader(process.env.FIRECRAWL_OAUTH_INTROSPECT_SECRET);
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
  exp?: number;
};

type CredentialMetadata = Pick<
  ServiceSession,
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

/**
 * `FIRECRAWL_OAUTH_INTROSPECT_CACHE_TTL_MS=0` turns the cache off. Unset keeps
 * the default; any other value caps how long an active answer is reused.
 */
function introspectionActiveTtlMs(): number {
  const raw = normalizeHeader(
    process.env.FIRECRAWL_OAUTH_INTROSPECT_CACHE_TTL_MS
  );
  if (raw === undefined) return INTROSPECTION_ACTIVE_TTL_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : INTROSPECTION_ACTIVE_TTL_MS;
}

const introspectionCache = createIntrospectionCache({
  maxEntries: 50_000,
  ttlMs: (value: OAuthIntrospectionResponse, now: number) => {
    const activeTtlMs = introspectionActiveTtlMs();
    if (activeTtlMs === 0) return 0;
    return introspectionTtlMs(
      value,
      now,
      activeTtlMs,
      Math.min(activeTtlMs, INTROSPECTION_INACTIVE_TTL_MS)
    );
  },
});

/**
 * Every MCP request authenticates, and every pod on a node shares one egress IP
 * against the issuer's per-IP rate limit. Reusing recent answers keeps that
 * volume flat as traffic grows.
 */
function introspectToken(
  token: string,
  expectedResource: string
): Promise<OAuthIntrospectionResponse> {
  return introspectionCache.get([token, expectedResource], () =>
    fetchIntrospection(token, expectedResource)
  );
}

/** Known `x-vercel-mitigated` values; anything else reports as other. */
const EDGE_MITIGATIONS = new Set(['deny', 'challenge', 'rate_limit']);

function edgeMitigation(response: Response): string | undefined {
  const value = response.headers
    .get('x-vercel-mitigated')
    ?.trim()
    .toLowerCase();
  if (!value) return undefined;
  return EDGE_MITIGATIONS.has(value) ? value : 'other';
}

async function fetchIntrospection(
  token: string,
  expectedResource: string
): Promise<OAuthIntrospectionResponse> {
  const introspectionSecret = getOAuthIntrospectionSecret();
  if (!introspectionSecret) {
    throw credentialValidationUnavailable({
      reason: 'introspect_secret_missing',
      resource: expectedResource,
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  const startedAt = Date.now();
  const elapsedMs = () => Date.now() - startedAt;
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
    // Separating the budget abort from a genuine transport fault is the whole
    // point of recording `aborted`: they need different operational responses.
    throw credentialValidationUnavailable({
      aborted: controller.signal.aborted,
      elapsedMs: elapsedMs(),
      reason: 'introspect_transport_error',
      resource: expectedResource,
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    throw credentialValidationUnavailable({
      edgeMitigation: edgeMitigation(response),
      elapsedMs: elapsedMs(),
      reason: 'introspect_http_status',
      resource: expectedResource,
      status: response.status,
    });
  }
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) {
    throw credentialValidationUnavailable({
      elapsedMs: elapsedMs(),
      reason: 'introspect_content_type',
      resource: expectedResource,
      status: response.status,
    });
  }
  // A body that fails to parse, or that parses to something without a boolean
  // `active`, is an unusable answer rather than a verdict on the credential.
  // Reading `active` off `null` would throw past every tagged error here and
  // reach the client as an OAuth challenge carrying raw parser text.
  const data = (await response
    .json()
    .catch(() => null)) as OAuthIntrospectionResponse | null;
  if (!data || typeof data.active !== 'boolean') {
    throw credentialValidationUnavailable({
      elapsedMs: elapsedMs(),
      reason: 'introspect_malformed_body',
      resource: expectedResource,
      status: response.status,
    });
  }
  if (
    data.active &&
    (!data.api_key ||
      !isOAuthCredentialPurpose(data.credential_purpose) ||
      !values(data.scope).includes(MCP_GLOBAL_SCOPE))
  ) {
    // Introspection answered cleanly; the credential it described cannot be
    // used here. Tagged apart from an outage so the two are never conflated.
    throw credentialValidationUnavailable({
      elapsedMs: elapsedMs(),
      reason: 'introspect_unusable_credential',
      resource: expectedResource,
      status: response.status,
    });
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

  // An API key is already the credential Core authenticates, so introspection
  // resolves it to itself. Forward it unchanged and let Core be the authority;
  // a 401 becomes CREDENTIAL_INVALID at the tool boundary. OAuth access tokens
  // keep the strict path below because Core cannot resolve them on its own.
  if (isFirecrawlApiKey(token)) {
    return { credential: token, source: 'api-key' };
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
    throw new InvalidOAuthCredentialError();
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
    // expectedAudience, not profile.resourceUrl: it is the resource the token
    // was actually validated against once the legacy fallback is applied.
    requireDelegatedCredentialSigning(expectedAudience);
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
  request: AuthRequest | undefined,
  profile: ServerProfile,
  options: ServiceAuthOptions
): Promise<ServiceSession> {
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
  const envCred = options.apiKey;

  if (options.hosted) {
    if (!headerCred && !managedCred) {
      if (resolved?.invalid) {
        // A supplied-but-invalid credential must reach the *agent*, not die as a
        // transport 401. MCP clients treat a 401 at initialize/tools-list as
        // "server unavailable" and never surface the response body to the model,
        // so the recovery payload in that 401 was unreachable in a real session.
        // On the full endpoint, admit the session flagged with credentialError:
        // the connection succeeds, tools list, and every tool call returns the
        // CREDENTIAL_INVALID recovery payload as a 200 isError result. No
        // credential is forwarded and no tool executes, so this grants zero
        // functional access. The account and search surfaces keep the hard 401
        // credential-rejection contract they already advertise.
        if (profile.allowKeyless) {
          return {
            authType: 'api-key',
            credentialError: 'CREDENTIAL_INVALID',
            firecrawlApiKey: undefined,
          };
        }
        throw new InvalidFirecrawlCredentialError();
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
    const session: ServiceSession = {
      authType: resolved?.source === 'oauth' ? 'oauth' : 'api-key',
      firecrawlApiKey: headerCred,
      ...(isLegacyKeyPathRequest(request) ? { keyTransport: 'path' as const } : {}),
      ...resolved?.metadata,
    };
    return managedCred ? setManagedOAuthApiKey(session, managedCred) : session;
  }

  const credential = headerCred ?? managedCred ?? envCred;

  // Self-hosted / stdio / HTTP streamable — headers supply MCP OAuth token when present
  const httpStreaming = options.transport === 'httpStream';
  if (httpStreaming && !credential && !options.apiUrl) {
    console.error(
      'HTTP MCP transport requires FIRECRAWL_API_URL and/or credentials (OAuth: Authorization Bearer fco_..., or FIRECRAWL_API_KEY / FIRECRAWL_OAUTH_TOKEN)'
    );
    process.exit(1);
  }

  const session: ServiceSession = {
    authType:
      resolved?.source === 'oauth'
        ? 'oauth'
        : resolved?.source === 'api-key'
          ? 'api-key'
          : credential
            ? 'env'
            : 'none',
    firecrawlApiKey: headerCred ?? envCred,
    ...resolved?.metadata,
  };
  return managedCred ? setManagedOAuthApiKey(session, managedCred) : session;
}

type SearchCompanionAuthMode = 'oauth' | 'api-key' | 'none';

function searchCompanionAuthMode(
  request?: AuthRequest,
  session?: ServiceSession
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
  hosted: boolean,
  profile: ServerProfile,
  request: AuthRequest | undefined,
  outcome: 'accepted' | 'rejected',
  session?: ServiceSession
): void {
  if (
    !hosted ||
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
  request: AuthRequest | undefined,
  outcome: 'accepted' | 'rejected',
  session?: ServiceSession
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
export function createServiceAuthenticate(
  profile: ServerProfile,
  options: ServiceAuthOptions
) {
  return function authenticateWithOAuthChallenge(
    request?: AuthRequest
  ): Promise<ServiceSession> {
    return authenticateRequest(request, profile, options)
      .then((session) => {
        session.profile = profile.id;
        emitSearchCompanionAuthTelemetry(
          options.hosted,
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
        emitSearchCompanionAuthTelemetry(
          options.hosted,
          profile,
          request,
          'rejected'
        );
        emitLegacyKeyPathTelemetry(profile, request, 'rejected');
        if (error instanceof InvalidFirecrawlCredentialError) {
          throw createInvalidCredentialResponse(error);
        }
        if (error instanceof InvalidOAuthCredentialError) {
          const recovery = invalidOAuthRecoveryPayload();
          const oauthChallenge = createOAuthChallengeResponse(
            new Error(recovery.message),
            profile,
            options.hosted,
            recovery
          );
          throw oauthChallenge ?? createInvalidOAuthRecoveryResponse(recovery);
        }
        if (error instanceof CredentialValidationUnavailableError) {
          throw createCredentialValidationUnavailableResponse(error);
        }
        const shouldChallenge = requestShouldReceiveOAuthChallenge(request, profile);
        const oauthChallenge = shouldChallenge
          ? createOAuthChallengeResponse(error, profile, options.hosted)
          : undefined;
        if (oauthChallenge) {
          throw oauthChallenge;
        }
        throw error;
      });
  };
}

