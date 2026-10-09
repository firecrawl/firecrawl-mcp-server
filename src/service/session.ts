import type {
  SessionData,
} from '../server.js';
import type { ServerProfile } from './profiles.js';
import type { CredentialSession } from './session-credential.js';

/** Session fields the hosted service adds on top of the core session. */
export interface ServiceSession extends SessionData, CredentialSession {
  teamId?: string;
  userId?: string;
  apiKeyId?: string;
  oauthClientId?: string;
  resource?: string;
  /** Server profile that authenticated this session. */
  profile?: ServerProfile['id'];
}
