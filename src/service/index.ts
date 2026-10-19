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
  getOAuthIssuer,
  SEARCH_PROFILE_INSTRUCTIONS,
  type ServerProfile,
} from './profiles.js';
import {
  searchSurfaceTools,
  searchSurfaceToolFilter,
} from './search-surface.js';
import {
  credentialForOutboundRequest,
  hasManagedOAuthCredential,
} from './session-credential.js';
import type { ServiceSession } from './session.js';
import { createToolGuard } from './tool-guard.js';

export {
  getPrimaryEndpoint,
  makePrimaryProfile,
  makeSearchProfile,
  resolveCredentialFromEnv,
  type ServerProfile,
} from './profiles.js';

export type ServiceSettings = {
  /** The hosted deployment: credential policy and OAuth metadata. */
  hosted: boolean;
  transport: 'stdio' | 'httpStream';
  apiKey?: string;
  apiUrl?: string;
};

/** Hooks that give one server instance the behaviour of a service profile. */
export function createServiceHooks(
  profile: ServerProfile,
  settings: ServiceSettings
): FirecrawlMcpServerHooks {
  const searchSurface = profile.id === 'search';
  const hooks: FirecrawlMcpServerHooks = {
    instructions: (defaults) =>
      searchSurface
        ? SEARCH_PROFILE_INSTRUCTIONS
        : profile.id === 'account' || settings.apiKey
          ? defaults.authenticated
          : defaults.keyless,
    ...(searchSurface
      ? {
          toolFilter: searchSurfaceToolFilter,
          registerExtraTools: searchSurfaceTools({ safeMode: settings.hosted }),
        }
      : {}),
  };

  if (settings.transport === 'httpStream') {
    hooks.authenticate = createServiceAuthenticate(profile, settings);
    hooks.outboundRequest = (session) => {
      const serviceSession = session as ServiceSession | undefined;
      const credential = hasManagedOAuthCredential(serviceSession)
        ? credentialForOutboundRequest(serviceSession)
        : undefined;
      return credential ? { credential } : undefined;
    };
  }

  if (!settings.hosted) return hooks;

  return {
    ...hooks,
    wrapTool: createToolGuard(),
    ...(profile.advertiseOAuth
      ? {
          oauth: {
            protectedResource: {
              authorizationServers: [getOAuthIssuer()],
              bearerMethodsSupported: ['header'],
              resource: profile.resourceUrl,
              resourceName: profile.resourceName,
              scopesSupported: ['firecrawl:global'],
            },
          },
        }
      : {}),
  };
}
