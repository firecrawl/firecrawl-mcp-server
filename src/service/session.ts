import type { SessionData } from '../server.js';
import type { ServerProfile } from './profiles.js';
import type { CredentialSession } from './session-credential.js';

/** Session fields the hosted service adds on top of the core session. */
export interface ServiceSession extends SessionData, CredentialSession {
  /**
   * For keyless requests over the hosted MCP, the end-user's real client IP,
   * forwarded to the API so it can rate-limit per real IP instead of the
   * shared server IP.
   */
  keylessClientIp?: string;
  /** Internal nginx marker for the deprecated credential-in-path route. */
  keyTransport?: 'path';
  teamId?: string;
  userId?: string;
  apiKeyId?: string;
  oauthClientId?: string;
  resource?: string;
  /** Server profile that authenticated this session. */
  profile?: ServerProfile['id'];
}

/** Hosted keyless: admitted without an account credential. */
export function isHostedKeylessSession(session?: ServiceSession): boolean {
  return session?.authType === 'keyless' && !session.firecrawlApiKey;
}
