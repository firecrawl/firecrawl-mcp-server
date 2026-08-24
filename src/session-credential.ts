import { createHmac } from 'node:crypto';

const managedOAuthApiKey = Symbol('firecrawlManagedOAuthApiKey');

export interface CredentialSession {
  /** Reusable general/API-key credential. Safe to pass directly to Core. */
  firecrawlApiKey?: string;
  /**
   * Process-local managed credential for a hosted OAuth grant. Symbol-keyed so
   * JSON/session serialization cannot expose it. Never use this value directly
   * as an outbound Authorization credential.
   */
  [managedOAuthApiKey]?: string;
}

/**
 * Names the validation step that failed. Deliberately low cardinality and
 * server-side only: these tags are for operators triaging a credential
 * validation outage, and they never carry credential material.
 */
export type CredentialValidationReason =
  | 'introspect_secret_missing'
  | 'introspect_transport_error'
  | 'introspect_http_status'
  | 'introspect_content_type'
  | 'introspect_malformed_body'
  | 'introspect_unusable_credential'
  | 'delegated_signing_secret_missing'
  | 'delegated_credential_unavailable'
  | 'outbound_client_uninstrumented';

export type CredentialValidationDiagnostics = {
  reason: CredentialValidationReason;
  /** Introspection response status, when a response was actually received. */
  status?: number;
  /** Wall time spent on the introspection attempt, in milliseconds. */
  elapsedMs?: number;
  /** True when the introspection request was cut short by its own budget. */
  aborted?: boolean;
};

/**
 * Every failed credential check funnels through this one error, so the client
 * sees a single stable sentence. The diagnostics ride along for the server log
 * and are never rendered into the response.
 */
export class CredentialValidationUnavailableError extends Error {
  readonly diagnostics: CredentialValidationDiagnostics;

  constructor(diagnostics: CredentialValidationDiagnostics) {
    super('Firecrawl credential validation is temporarily unavailable');
    this.name = 'CredentialValidationUnavailableError';
    this.diagnostics = diagnostics;
  }
}

type McpDelegatedCredentialPayload = {
  v: 1;
  aud: 'firecrawl-core';
  purpose: 'hosted_mcp_oauth';
  api_key: string;
  iat: number;
  exp: number;
};

function delegationSecret(): string {
  const secret = process.env.MCP_DELEGATED_CREDENTIAL_SECRET?.trim();
  if (!secret) {
    throw new CredentialValidationUnavailableError({
      reason: 'delegated_signing_secret_missing',
    });
  }
  return secret;
}

export function requireDelegatedCredentialSigning(): void {
  delegationSecret();
}

export function setManagedOAuthApiKey<T extends CredentialSession>(
  session: T,
  apiKey: string
): T {
  Object.defineProperty(session, managedOAuthApiKey, {
    configurable: false,
    enumerable: false,
    value: apiKey,
    writable: false,
  });
  return session;
}

export function copyManagedOAuthApiKey(
  source: CredentialSession | undefined,
  target: CredentialSession
): void {
  const apiKey = source?.[managedOAuthApiKey];
  if (apiKey) setManagedOAuthApiKey(target, apiKey);
}

export function hasCredential(session?: CredentialSession): boolean {
  return Boolean(session?.firecrawlApiKey || session?.[managedOAuthApiKey]);
}

export function hasManagedOAuthCredential(
  session?: CredentialSession
): boolean {
  return Boolean(session?.[managedOAuthApiKey]);
}

export function credentialForOutboundRequest(
  session?: CredentialSession
): string | undefined {
  const managedApiKey = session?.[managedOAuthApiKey];
  if (!managedApiKey) return session?.firecrawlApiKey;

  const iat = Math.floor(Date.now() / 1000);
  const payload: McpDelegatedCredentialPayload = {
    v: 1,
    aud: 'firecrawl-core',
    purpose: 'hosted_mcp_oauth',
    api_key: managedApiKey,
    iat,
    exp: iat + 60,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    'base64url'
  );
  const signature = createHmac('sha256', delegationSecret())
    .update(encodedPayload)
    .digest('base64url');
  return `fcmcp_${encodedPayload}.${signature}`;
}
