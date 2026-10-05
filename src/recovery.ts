import { randomUUID } from 'node:crypto';
import { UserError } from 'fastmcp';
import { agentHintsText, readErrorAgentHints } from './agent-hints';
import { checkKeylessSignupUrl } from './keyless-signup-link';

// Human-facing guidance value. MCP_CONNECTION_GUIDE_URL stays a stable,
// neutral entry point even while the docs routing evolves; do not bind
// recovery payloads to an auth-mode leaf page. It is a human-facing guide,
// not an MCP endpoint.
export const MCP_CONNECTION_GUIDE_URL = 'https://docs.firecrawl.dev/mcp-server';

export const KEYLESS_TOOL_NAMES = new Set([
  'firecrawl_scrape',
  'firecrawl_search',
  'firecrawl_parse',
]);

// FastMCP copies UserError.message onto both content[0].text and
// structuredContent.message. Hosts forward the text block, not
// structured next_actions, so bearer and OAuth recovery strings live here.
//
// The signup link is the caller's own firecrawl.dev/k/<token> link, issued by
// the API (the 429 body's signup_url, or signupUrl from the eligibility check):
// a 12-character encrypted token the site decrypts to keyless attribution.
// When the API has no token to give it sends the regular keyless signin link,
// which is relayed as is; without any API link, the regular MCP signin link is used.
export const KEYLESS_SIGNUP_FALLBACK_URL =
  'https://www.firecrawl.dev/signin?utm_source=keyless&utm_medium=mcp&redirect=%2Fapp%2Fapi-keys';
// Firecrawl-hosted links that fail the check are logged once each, so a change
// in the API's link format shows up instead of silently falling back.
const droppedKeylessSignupUrls = new Set<string>();

/** An API-issued keyless signup link, or undefined for anything else. */
export function keylessSignupUrlFrom(value: unknown): string | undefined {
  const check = checkKeylessSignupUrl(value);
  if (check.ok) return check.url;
  if (
    check.firecrawlHost &&
    typeof value === 'string' &&
    droppedKeylessSignupUrls.size < 50 &&
    !droppedKeylessSignupUrls.has(value)
  ) {
    droppedKeylessSignupUrls.add(value);
    console.warn(
      '[WARN]',
      new Date().toISOString(),
      'Ignoring an unrecognized Firecrawl keyless signup link from the API; using the fallback',
      { signupUrl: value }
    );
  }
  return undefined;
}

function keylessAccountFix(signupUrl: string): string {
  return `Fix: Create an API key at ${signupUrl} and then:\n- Set the header: Authorization: Bearer YOUR_API_KEY on https://mcp.firecrawl.dev/v2/mcp\nThen start a new session.`;
}
const keylessQuotaMessage = (signupUrl: string) =>
  `You've hit Firecrawl's free MCP rate limit. To continue using without limits, create a Firecrawl API key.\n\n${keylessAccountFix(signupUrl)}`;
const keylessToolMessage = (signupUrl: string) =>
  `This tool needs a Firecrawl account.\n\n${keylessAccountFix(signupUrl)}`;
const keylessAccessMessage = (signupUrl: string) =>
  `Anonymous keyless access is unavailable for this request.\n\n${keylessAccountFix(signupUrl)}`;
export const INVALID_API_KEY_MESSAGE =
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

export function invalidApiKeyRecoveryPayload(): Record<string, unknown> & {
  message: string;
} {
  return connectionRecoveryPayload({
    code: 'CREDENTIAL_INVALID',
    authMode: 'api_key',
    message: INVALID_API_KEY_MESSAGE,
  });
}

export function invalidOAuthRecoveryPayload(): Record<string, unknown> & {
  message: string;
} {
  return connectionRecoveryPayload({
    code: 'OAUTH_CONNECTION_INVALID',
    authMode: 'oauth',
    message: INVALID_OAUTH_MESSAGE,
  });
}

/**
 * Core rejected the credential this session forwarded. Tools reach Core by
 * several routes, the SDK helpers, the SDK's HTTP layer, and plain fetch, so
 * this reads the status rather than the error's type: every route reports one,
 * and inside a tool a 401 can only have come from Core. Only 401 is matched,
 * because that is a verdict on the credential; a 403 can mean an entitlement
 * the key legitimately lacks.
 */
function isCoreCredentialRejection(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const candidate = error as {
    response?: { status?: unknown };
    status?: unknown;
  };
  return candidate.status === 401 || candidate.response?.status === 401;
}

/**
 * API keys reach Core unresolved, so an invalid one is discovered when a tool
 * runs rather than at connect time. Translate that rejection into the same
 * CREDENTIAL_INVALID recovery the agent already knows how to act on, so the
 * guidance does not depend on having introspected the key first.
 */
export async function runWithCredentialRecovery<T>(
  run: () => T | Promise<T>,
  requestId: string,
  session?: { authType?: string }
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    // Only an API-key session hands Core a credential nothing resolved first.
    // An OAuth session was validated at connect time, so a rejection there is a
    // different fault and keeps its own reconnect guidance; a keyless session
    // never sent an account credential at all.
    if (session?.authType !== 'api-key' || !isCoreCredentialRejection(error)) {
      const hints = readErrorAgentHints(error);
      if (hints) {
        const message = error instanceof Error ? error.message : String(error);
        throw new UserError(
          hints.length ? `${message}\n\n${agentHintsText(hints)}` : message,
          {
            ...(error instanceof UserError ? error.extras : {}),
            error: message,
            agent_hints: hints,
          }
        );
      }
      throw error;
    }
    const payload = recoveryPayload('CREDENTIAL_INVALID', requestId);
    throw new UserError(String(payload.message), payload);
  }
}

export function recoveryPayload(
  code: string,
  requestId: string = randomUUID(),
  options: { retryAfterSeconds?: number; signupUrl?: string } = {}
): Record<string, unknown> {
  const retryAfterSeconds = options.retryAfterSeconds;
  const signupUrl = options.signupUrl ?? KEYLESS_SIGNUP_FALLBACK_URL;
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
          ? keylessQuotaMessage(signupUrl)
          : isToolUnavailable
            ? keylessToolMessage(signupUrl)
            : isKeylessAccessUnavailable
              ? keylessAccessMessage(signupUrl)
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
    ...(isKeylessConversion ? { signup_url: signupUrl } : {}),
    docs_url: MCP_CONNECTION_GUIDE_URL,
    ...(retryAfterSeconds ? { retry_after_seconds: retryAfterSeconds } : {}),
    ...(isKeylessEligibilityUnavailable
      ? { next_actions: [{ kind: 'retry_later', after_seconds: 30 }] }
      : {}),
  };
}

export function keylessQuotaReason(
  reason: unknown
): reason is 'requests' | 'credits' {
  return reason === 'requests' || reason === 'credits';
}
