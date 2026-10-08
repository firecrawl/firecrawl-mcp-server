import { originHeaders, requestOrigin } from '../origin';
import {
  keylessQuotaReason,
  keylessSignupUrlFrom,
  recoveryPayload,
} from '../recovery.js';
import { UserError, type OutboundRequest } from '../server.js';
import { isHostedKeylessSession, type ServiceSession } from './session.js';

const DEFAULT_CLOUD_API_URL = 'https://api.firecrawl.dev';

/** The Firecrawl API base URL the service talks to. */
export function apiBaseUrl(apiUrl: string | undefined): string {
  return (apiUrl || DEFAULT_CLOUD_API_URL).replace(/\/$/, '');
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
  signupUrl?: string;
};

async function keylessEligible(
  apiBaseUrl: string,
  clientIp: string,
  origin: string,
  { signupLink = false }: { signupLink?: boolean } = {}
): Promise<KeylessEligibility> {
  const secret = process.env.KEYLESS_PROXY_SECRET;
  if (!secret) return { eligible: false, unavailable: true };
  try {
    const response = await fetch(
      `${apiBaseUrl}/v2/keyless/eligibility${signupLink ? '?signup_link=1' : ''}`,
      {
        headers: {
          ...originHeaders(origin),
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
      ...(keylessSignupUrlFrom(json?.signupUrl)
        ? { signupUrl: json.signupUrl }
        : {}),
    };
  } catch {
    return { eligible: false, unavailable: true };
  }
}

/**
 * The hosted keyless caller's own signup link, for recovery the API did not
 * produce (a tool keyless sessions cannot use). Undefined falls back to the
 * regular MCP signin link.
 */
export async function hostedKeylessSignupUrl(
  apiBaseUrl: string,
  session?: ServiceSession
): Promise<string | undefined> {
  if (!session?.keylessClientIp) return undefined;
  const eligibility = await keylessEligible(
    apiBaseUrl,
    session.keylessClientIp,
    requestOrigin(undefined, session),
    { signupLink: true }
  );
  return eligibility.signupUrl;
}

/**
 * Refuses a hosted keyless request when the caller's IP is not eligible, with
 * the recovery payload the agent acts on.
 */
export async function requireKeylessEligibility(
  apiBase: string,
  session: ServiceSession | undefined,
  origin: string
): Promise<void> {
  if (!isHostedKeylessSession(session)) return;
  const eligibility = session?.keylessClientIp
    ? await keylessEligible(apiBase, session.keylessClientIp, origin)
    : { eligible: false };
  if (!eligibility.eligible) {
    const code = eligibility.unavailable
      ? 'KEYLESS_ELIGIBILITY_UNAVAILABLE'
      : keylessQuotaReason(eligibility.reason)
        ? 'KEYLESS_QUOTA_EXHAUSTED'
        : 'KEYLESS_ACCESS_NOT_AVAILABLE';
    const payload = recoveryPayload(code, session?.requestId, {
      retryAfterSeconds: eligibility.retryAfterSeconds,
      signupUrl: eligibility.signupUrl,
    });
    throw new UserError(String(payload.message), payload);
  }
}

/**
 * Forward the real client IP (secret-authenticated) when proxying keyless
 * requests through the hosted MCP, so the API rate-limits per real IP.
 */
export function keylessForwardingHeaders(
  session: ServiceSession | undefined
): OutboundRequest['headers'] {
  const secret = process.env.KEYLESS_PROXY_SECRET;
  if (!session?.keylessClientIp || !secret) return undefined;
  return {
    'x-firecrawl-keyless-ip': session.keylessClientIp,
    'x-firecrawl-keyless-secret': secret,
  };
}
