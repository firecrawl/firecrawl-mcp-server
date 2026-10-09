/**
 * Credential resolution for the CLI's HTTP transports (API keys, OAuth access
 * tokens and the CLOUD_SERVICE credential policy), attached to the core server
 * through its hooks. Only the CLI imports this directory; nothing in the core
 * depends on it.
 */
import type { FirecrawlMcpServerHooks } from '../server.js';
import { createServiceAuthenticate } from './auth.js';
import type { ServerProfile } from './profiles.js';

export {
  makePrimaryProfile,
  resolveCredentialFromEnv,
  type ServerProfile,
} from './profiles.js';

export type ServiceSettings = {
  /** CLOUD_SERVICE: every HTTP request must carry a credential. */
  hosted: boolean;
  transport: 'stdio' | 'httpStream';
  apiKey?: string;
  apiUrl?: string;
};

/** Hooks that give the server instance its service behaviour. */
export function createServiceHooks(
  profile: ServerProfile,
  settings: ServiceSettings
): FirecrawlMcpServerHooks {
  return {
    instructions: (defaults) =>
      settings.apiKey ? defaults.authenticated : defaults.keyless,
    ...(settings.transport === 'httpStream'
      ? { authenticate: createServiceAuthenticate(profile, settings) }
      : {}),
  };
}
