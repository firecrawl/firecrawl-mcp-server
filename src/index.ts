#!/usr/bin/env node
import dotenv from 'dotenv';
import {
  createFirecrawlMcpServer,
  DEFAULT_MCP_OAUTH_RESOURCE_URL,
  DEFAULT_MCP_RESOURCE_URL,
  DEFAULT_MCP_SEARCH_ENDPOINT,
  DEFAULT_MCP_SEARCH_RESOURCE_URL,
  FULL_PROFILE_INSTRUCTIONS,
  KEYLESS_PROFILE_INSTRUCTIONS,
  normalizeHeader,
  SEARCH_PROFILE_INSTRUCTIONS,
  SEARCH_PROFILE_TOOLS,
  withoutTrailingSlash,
  type FirecrawlMcpServerOptions,
  type FirecrawlMcpServerStartArgs,
  type ServerProfile,
} from './server.js';

dotenv.config({ debug: false, quiet: true });

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

function makeFullProfile(): ServerProfile {
  const account = getPrimaryEndpoint() === '/v2/mcp-oauth';
  const hasCredential = Boolean(resolveCredentialFromEnv());
  return {
    id: account ? 'account' : 'full',
    resourceName: account ? 'Firecrawl MCP Account' : 'Firecrawl MCP',
    instructions:
      account || hasCredential ? FULL_PROFILE_INSTRUCTIONS : KEYLESS_PROFILE_INSTRUCTIONS,
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

function makeSearchProfile({
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

const FEEDBACK_DISABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);

function feedbackEnvEnabled(...keys: string[]): boolean {
  return keys.some((key) =>
    FEEDBACK_DISABLED_VALUES.has((process.env[key] || '').trim().toLowerCase())
  );
}

const hosted = process.env.CLOUD_SERVICE === 'true';
const httpStreaming = isHttpStreamingTransport();
const apiKey = resolveCredentialFromEnv();
const primaryProfile = makePrimaryProfile();

const searchFeedbackDisabled = feedbackEnvEnabled(
  'FIRECRAWL_NO_SEARCH_FEEDBACK',
  'FIRECRAWL_DISABLE_SEARCH_FEEDBACK'
);
const endpointFeedbackDisabled = feedbackEnvEnabled(
  'FIRECRAWL_NO_ENDPOINT_FEEDBACK',
  'FIRECRAWL_DISABLE_ENDPOINT_FEEDBACK'
);

if (searchFeedbackDisabled) {
  console.error(
    '[firecrawl-mcp] Search feedback tool disabled by FIRECRAWL_NO_SEARCH_FEEDBACK; firecrawl_search_feedback will not be registered.'
  );
}
if (endpointFeedbackDisabled) {
  console.error(
    '[firecrawl-mcp] Endpoint feedback tool disabled by FIRECRAWL_NO_ENDPOINT_FEEDBACK; firecrawl_feedback will not be registered.'
  );
}

const transport = hosted || httpStreaming ? 'httpStream' : 'stdio';
const options: Omit<FirecrawlMcpServerOptions, 'profile'> = {
  apiUrl: process.env.FIRECRAWL_API_URL,
  apiKey,
  transport,
  logging: transport === 'httpStream',
  safeMode: hosted,
  fileAccess: hosted ? 'upload' : 'local',
  requireCredential: hosted,
  searchFeedback: !searchFeedbackDisabled,
  endpointFeedback: !endpointFeedbackDisabled,
  hosted,
};

const { server, start } = createFirecrawlMcpServer({
  ...options,
  profile: primaryProfile,
});

const openAiAppsChallengeToken = normalizeHeader(
  process.env.OPENAI_APPS_CHALLENGE_TOKEN
);
if (openAiAppsChallengeToken) {
  server
    .getApp()
    .get('/.well-known/openai-apps-challenge', (context) =>
      context.text(openAiAppsChallengeToken)
    );
}

server.getApp().get('/ready', (context) => {
  if (!hosted) {
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

const PORT = Number(process.env.PORT || 3000);
const HOST = hosted ? '0.0.0.0' : process.env.HOST || 'localhost';

const args: FirecrawlMcpServerStartArgs =
  transport === 'httpStream'
    ? {
        transportType: 'httpStream',
        httpStream: {
          port: PORT,
          host: HOST,
          endpoint: primaryProfile.endpoint,
          stateless: true,
        },
      }
    : { transportType: 'stdio' };

if (
  hosted &&
  primaryProfile.allowKeyless &&
  !normalizeHeader(process.env.KEYLESS_PROXY_SECRET)
) {
  console.warn(
    '[firecrawl-mcp] KEYLESS_PROXY_SECRET is missing; keyless requests will be unavailable and /ready will fail.'
  );
}

if (
  transport === 'stdio' &&
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

await start(args);

// Bring up the search surface as a second in-process instance on its own port.
// The pod's nginx routes its public path here; the full surface above is
// untouched. Only registered in the hosted profile and when not disabled.
const searchProfileEnabled =
  hosted &&
  primaryProfile.id === 'full' &&
  process.env.FIRECRAWL_MCP_SEARCH_ENABLED !== 'false';

if (searchProfileEnabled) {
  const searchProfile = makeSearchProfile();
  const searchServer = createFirecrawlMcpServer({
    ...options,
    profile: searchProfile,
  });

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
