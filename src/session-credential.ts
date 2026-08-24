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
 * Why credential validation could not complete. Every value maps 1:1 to a
 * single throw site so an operator can tell a dependency outage (introspection
 * 5xx, timeout) apart from a deploy fault (missing secret) without a repro.
 */
export type CredentialUnavailableReason =
  | 'delegation_secret_missing'
  | 'introspect_secret_missing'
  | 'introspect_fetch_failed'
  | 'introspect_non_2xx'
  | 'introspect_non_json'
  | 'introspect_active_not_boolean'
  | 'introspect_payload_invalid'
  | 'outbound_interceptor_unavailable'
  | 'outbound_credential_missing';

/** Non-sensitive context for one failure. Never carries tokens or api keys. */
export type CredentialUnavailableDetail = {
  /** HTTP status from the introspection endpoint, when there was a response. */
  status?: number;
  /** Wall time spent on the introspection request, in ms. */
  elapsedMs?: number;
  /** True when the 1500ms AbortController fired rather than the socket failing. */
  aborted?: boolean;
  /** Response content-type, when the body was not JSON. */
  contentType?: string;
  /** MCP resource URL the token was introspected against. */
  resource?: string;
};

export class CredentialValidationUnavailableError extends Error {
  readonly reason: CredentialUnavailableReason;
  readonly detail: CredentialUnavailableDetail;

  constructor(
    reason: CredentialUnavailableReason,
    detail: CredentialUnavailableDetail = {}
  ) {
    // The user-facing message is deliberately unchanged and reason-free: it is
    // asserted by the smoke tests and shown verbatim to MCP clients.
    super('Firecrawl credential validation is temporarily unavailable');
    this.name = 'CredentialValidationUnavailableError';
    this.reason = reason;
    this.detail = detail;
  }
}

/**
 * Builds the error and emits exactly one structured record for it.
 *
 * Every throw site goes through here. Previously all nine were bare `throw new
 * ...()` with no logging, so a 503 storm left no trace in stdout, in the
 * request tables, or in the warehouse, and the surviving evidence could not
 * distinguish an absent secret from an introspection outage.
 */
export function credentialValidationUnavailable(
  reason: CredentialUnavailableReason,
  detail: CredentialUnavailableDetail = {}
): CredentialValidationUnavailableError {
  console.error(
    '[MCP_CREDENTIAL_UNAVAILABLE]',
    JSON.stringify({ reason, ...detail })
  );
  return new CredentialValidationUnavailableError(reason, detail);
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
  if (!secret) throw credentialValidationUnavailable('delegation_secret_missing');
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
