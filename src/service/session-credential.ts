export interface CredentialSession {
  /** Reusable general/API-key credential. Safe to pass directly to Core. */
  firecrawlApiKey?: string;
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
  | 'introspect_unusable_credential';

export type CredentialValidationDiagnostics = {
  reason: CredentialValidationReason;
  /** Introspection response status, when a response was actually received. */
  status?: number;
  /** Wall time spent on the introspection attempt, in milliseconds. */
  elapsedMs?: number;
  /** True when the introspection request was cut short by its own budget. */
  aborted?: boolean;
  /** MCP resource the credential was being validated against. */
  resource?: string;
  /** Edge firewall verdict on the response: deny, challenge, rate_limit or other. */
  edgeMitigation?: string;
};

/**
 * Every failed credential check funnels through this one error, so the client
 * sees a single stable sentence. The diagnostics ride along for the server log
 * and are never rendered into the response.
 *
 * Raise it with `credentialValidationUnavailable` below. Constructing it
 * directly skips the record and puts the failure back in the dark.
 */
export class CredentialValidationUnavailableError extends Error {
  readonly diagnostics: CredentialValidationDiagnostics;

  constructor(diagnostics: CredentialValidationDiagnostics) {
    super('Firecrawl credential validation is temporarily unavailable');
    this.name = 'CredentialValidationUnavailableError';
    this.diagnostics = diagnostics;
  }
}

/**
 * Builds the error and emits exactly one record for it, for operators only.
 *
 * The record is written here rather than wherever the error is caught, so any
 * throw site added later is recorded too.
 *
 * Intentionally low cardinality. `resource` is one of a handful of server-owned
 * URLs, and `edge_mitigation` is one of four fixed values. Never add the token,
 * the resolved API key, the upstream response body or raw headers, request
 * URLs, user agents, or hashes of any of them.
 */
export function credentialValidationUnavailable(
  diagnostics: CredentialValidationDiagnostics
): CredentialValidationUnavailableError {
  const { aborted, edgeMitigation, elapsedMs, reason, resource, status } =
    diagnostics;
  console.error(
    '[MCP_CREDENTIAL_VALIDATION]',
    JSON.stringify({
      aborted: aborted ?? null,
      edge_mitigation: edgeMitigation ?? null,
      elapsed_ms: elapsedMs ?? null,
      introspect_status: status ?? null,
      reason,
      resource: resource ?? null,
    })
  );
  return new CredentialValidationUnavailableError(diagnostics);
}
