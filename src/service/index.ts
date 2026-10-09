/**
 * Deployment-specific behaviour of the Firecrawl-operated MCP service, attached
 * to the core server through its hooks. Only the CLI imports this directory;
 * nothing in the core depends on it.
 */
import type {
  FirecrawlMcpServerHooks,
} from '../server.js';
import { createServiceAuthenticate } from './auth.js';
import {
  apiBaseUrl,
  keylessForwardingHeaders,
  requireKeylessEligibility,
} from './keyless.js';
import type { ServerProfile } from './profiles.js';
import {
  credentialForOutboundRequest,
  hasManagedOAuthCredential,
} from './session-credential.js';
import type { ServiceSession } from './session.js';
import { createToolGuard } from './tool-guard.js';

export {
  makePrimaryProfile,
  resolveCredentialFromEnv,
  type ServerProfile,
} from './profiles.js';

export type ServiceSettings = {
  /** The hosted deployment: credential policy and keyless gating. */
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
  const hooks: FirecrawlMcpServerHooks = {
    instructions: (defaults) =>
      settings.apiKey ? defaults.authenticated : defaults.keyless,
  };

  if (settings.transport === 'httpStream') {
    hooks.authenticate = createServiceAuthenticate(profile, settings);
    hooks.outboundRequest = (session) => {
      const serviceSession = session as ServiceSession | undefined;
      const credential = hasManagedOAuthCredential(serviceSession)
        ? credentialForOutboundRequest(serviceSession)
        : undefined;
      const headers = keylessForwardingHeaders(serviceSession);
      return credential || headers ? { credential, headers } : undefined;
    };
  }

  if (!settings.hosted) return hooks;

  const apiBase = apiBaseUrl(settings.apiUrl);
  return {
    ...hooks,
    wrapTool: createToolGuard({ apiBaseUrl: apiBase }),
    beforeKeylessRequest: (session, origin) =>
      requireKeylessEligibility(apiBase, session as ServiceSession, origin),
  };
}
