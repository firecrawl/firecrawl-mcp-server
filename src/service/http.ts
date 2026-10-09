import {
  type HttpApp,
  normalizeHeader,
  withoutTrailingSlash,
} from '../server.js';
import {
  DEFAULT_MCP_SEARCH_RESOURCE_URL,
  getPrimaryEndpoint,
  type ServerProfile,
} from './profiles.js';

/**
 * Routes of the primary listener: the optional apps challenge token and
 * `/ready`, which in the hosted deployment reports missing configuration.
 */
export function registerServiceRoutes(
  app: HttpApp,
  profile: ServerProfile,
  { hosted }: { hosted: boolean }
): void {
  const openAiAppsChallengeToken = normalizeHeader(
    process.env.OPENAI_APPS_CHALLENGE_TOKEN
  );
  if (openAiAppsChallengeToken) {
    app.get('/.well-known/openai-apps-challenge', (context) =>
      context.text(openAiAppsChallengeToken)
    );
  }

  app.get('/ready', (context) => {
    if (!hosted) {
      return context.json({ ok: true }, 200);
    }
    const searchPrimary = profile.id === 'search';
    // Readiness covers only dependencies that can prevent this profile from
    // serving authenticated requests. Account and search identities never take
    // the keyless path; action logging is intentionally best-effort (see
    // emitActionLog), so neither should make those profiles unavailable.
    const required = [
      'FIRECRAWL_API_URL',
      'FIRECRAWL_OAUTH_INTROSPECT_SECRET',
      'MCP_DELEGATED_CREDENTIAL_SECRET',
    ];
    if (profile.allowKeyless) {
      required.push('KEYLESS_PROXY_SECRET');
    }
    const missing = required.filter((name) => !normalizeHeader(process.env[name]));
    const configuredEndpoint = getPrimaryEndpoint();
    const resourceMatchesEndpoint = searchPrimary
      ? withoutTrailingSlash(profile.resourceUrl) ===
        DEFAULT_MCP_SEARCH_RESOURCE_URL
      : withoutTrailingSlash(profile.resourceUrl).endsWith(configuredEndpoint);
    if (!resourceMatchesEndpoint) {
      missing.push(
        searchPrimary
          ? 'FIRECRAWL_MCP_SEARCH_RESOURCE_URL (endpoint mismatch)'
          : 'FIRECRAWL_MCP_RESOURCE_URL (endpoint mismatch)'
      );
    }
    return missing.length
      ? context.json({ ok: false, missing }, 503)
      : context.json({ ok: true }, 200);
  });
}
