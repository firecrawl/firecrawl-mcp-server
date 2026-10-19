// Keyless signup links the API may hand the MCP server to relay: the caller's
// own https://firecrawl.dev/k/<token> link, or the regular keyless signin link
// the API sends when it has no token. The URL is parsed and checked field by
// field, so parameter order and percent-encoding case don't matter, but only
// Firecrawl's own signup links are ever relayed.

const SIGNUP_HOSTS = new Set(['firecrawl.dev', 'www.firecrawl.dev']);
const TOKEN_PATH = /^\/k\/[0-9abcdefghjkmnpqrstvwxyz]{12}$/;
const SURFACES = new Set(['api', 'mcp', 'cli']);
const SIGNIN_PARAMS = new Set(['utm_source', 'utm_medium', 'redirect']);
const SIGNIN_REDIRECT = '/app/api-keys';

/** Why a Firecrawl-hosted link was not relayed, for drift logging. */
export type KeylessSignupUrlCheck =
  | { ok: true; url: string }
  | { ok: false; firecrawlHost: boolean };

export function checkKeylessSignupUrl(value: unknown): KeylessSignupUrlCheck {
  if (typeof value !== 'string') return { ok: false, firecrawlHost: false };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, firecrawlHost: false };
  }
  const firecrawlHost = SIGNUP_HOSTS.has(url.hostname);
  if (
    url.protocol !== 'https:' ||
    !firecrawlHost ||
    url.port ||
    url.username ||
    url.password ||
    url.hash
  ) {
    return { ok: false, firecrawlHost };
  }
  if (TOKEN_PATH.test(url.pathname) && !url.search) {
    return { ok: true, url: value };
  }
  if (url.pathname === '/signin') {
    const params = url.searchParams;
    const keys = [...params.keys()];
    const known =
      keys.every((key) => SIGNIN_PARAMS.has(key)) &&
      new Set(keys).size === keys.length;
    if (
      known &&
      params.get('utm_source') === 'keyless' &&
      SURFACES.has(params.get('utm_medium') ?? '') &&
      (!params.has('redirect') || params.get('redirect') === SIGNIN_REDIRECT)
    ) {
      return { ok: true, url: value };
    }
  }
  return { ok: false, firecrawlHost };
}
