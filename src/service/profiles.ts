import { normalizeHeader, withoutTrailingSlash } from '../server.js';

export const DEFAULT_OAUTH_ISSUER = 'https://www.firecrawl.dev';
export const DEFAULT_MCP_RESOURCE_URL = 'https://mcp.firecrawl.dev/v2/mcp';

/** The resource a server instance authenticates requests for. */
export type ServerProfile = {
  /** OAuth protected-resource identifier that access tokens must be issued for. */
  resourceUrl: string;
  /** Allow the keyless free-tier fallback (no credential required). */
  allowKeyless: boolean;
};

export function getOAuthIssuer(): string {
  return withoutTrailingSlash(
    normalizeHeader(process.env.FIRECRAWL_OAUTH_ISSUER) ?? DEFAULT_OAUTH_ISSUER
  );
}

export function resolveCredentialFromEnv(): string | undefined {
  return (
    normalizeHeader(process.env.FIRECRAWL_OAUTH_TOKEN) ??
    normalizeHeader(process.env.FIRECRAWL_API_KEY)
  );
}

export function makePrimaryProfile(): ServerProfile {
  return {
    resourceUrl:
      normalizeHeader(process.env.FIRECRAWL_MCP_RESOURCE_URL) ??
      DEFAULT_MCP_RESOURCE_URL,
    allowKeyless: true,
  };
}
