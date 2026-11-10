/**
 * Alexandria providers whose tools cover a scraped page's site, for the hint a
 * URL scrape returns in `agent_hints`. The lookup sends only the host, runs
 * beside the scrape, and never fails or holds up the scrape it serves.
 */

const MATCH_TTL_MS = 10 * 60_000;
const ERROR_TTL_MS = 30_000;
const LOOKUP_TIMEOUT_MS = 5_000;
const MAX_CACHED_HOSTS = 10_000;
const PROVIDER_ID = /^[a-z0-9][a-z0-9._-]{0,99}$/i;

type Providers = string[] | undefined;
type Resolve = (
  body: { urls: string[] },
  timeoutMs: number
) => Promise<unknown>;

const cache = new Map<string, { providers: Providers; expiresAt: number }>();
const inFlight = new Map<string, Promise<Providers>>();

function hostOf(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    )
      return undefined;
    return parsed.hostname.toLowerCase().replace(/\.$/, '') || undefined;
  } catch {
    return undefined;
  }
}

function remember(host: string, providers: Providers, ttlMs: number): void {
  cache.delete(host);
  if (cache.size >= MAX_CACHED_HOSTS) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(host, { providers, expiresAt: Date.now() + ttlMs });
}

/**
 * Starts (or reuses) the lookup for a URL's host through `resolve`, which
 * posts to the API's `/exchange/skills/resolve`. Resolves to the matching
 * provider ids, or undefined when the lookup failed; never rejects.
 */
export function lookupSiteProviders(
  url: string,
  resolve: Resolve
): Promise<Providers> | undefined {
  const host = hostOf(url);
  if (!host) return undefined;
  const cached = cache.get(host);
  if (cached && cached.expiresAt > Date.now())
    return Promise.resolve(cached.providers);
  const pending = inFlight.get(host);
  if (pending) return pending;
  const lookup = resolve({ urls: [`https://${host}/`] }, LOOKUP_TIMEOUT_MS)
    .then((response: any) => {
      const skills = response?.data?.skills;
      if (!Array.isArray(skills))
        throw new Error('Unexpected resolve response.');
      const providers = [
        ...new Set<string>(
          skills
            .map((skill: any) => skill?.id)
            .filter(
              (id: unknown): id is string =>
                typeof id === 'string' && PROVIDER_ID.test(id)
            )
        ),
      ];
      remember(host, providers, MATCH_TTL_MS);
      return providers;
    })
    .catch(() => {
      remember(host, undefined, ERROR_TTL_MS);
      return undefined;
    })
    .finally(() => inFlight.delete(host));
  inFlight.set(host, lookup);
  return lookup;
}

/** The scrape hint for the first provider, or undefined when the lookup is late, failed, or matched none. */
export async function siteProviderHint(
  lookup: Promise<Providers>,
  waitMs: number
): Promise<string | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), waitMs);
  });
  const provider = (await Promise.race([lookup, late]))?.[0];
  clearTimeout(timer);
  if (!provider) return undefined;
  return `This site has a structured-data provider (${provider}). To get typed records instead of page text, list its tools with firecrawl_find_tools {"providers":["${provider}"]}, then call firecrawl_scrape {"alexandria":{"provider":"${provider}","capability":"<capability>","options":{...}}}.`;
}
