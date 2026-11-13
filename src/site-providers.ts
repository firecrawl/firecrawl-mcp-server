/**
 * Alexandria providers whose tools cover a scraped page's site, for the hint a
 * URL scrape returns in `agent_hints`. The lookup sends only the host, runs
 * beside the scrape, and never fails the scrape it serves.
 */

import { createHash } from 'node:crypto';
import {
  ALEXANDRIA_LIBRARY_TOOL,
  ALEXANDRIA_READ_TOOL,
  type AlexandriaTools,
} from './alexandria.js';

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

/**
 * A lookup cache for one server instance. `lookup` starts (or reuses) the
 * lookup for a URL's host through `resolve`, which posts to the API's
 * `/exchange/skills/resolve`, and resolves to the matching provider ids, or
 * undefined when the lookup failed; it never rejects. Results are kept per
 * credential, since the catalogue a team sees can differ.
 */
export function createSiteProviderLookup() {
  const cache = new Map<string, { providers: Providers; expiresAt: number }>();
  const inFlight = new Map<string, Promise<Providers>>();

  function remember(key: string, providers: Providers, ttlMs: number): void {
    cache.delete(key);
    if (cache.size >= MAX_CACHED_HOSTS) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, { providers, expiresAt: Date.now() + ttlMs });
  }

  return function lookup(
    url: string,
    credential: string | undefined,
    resolve: Resolve
  ): Promise<Providers> | undefined {
    const host = hostOf(url);
    if (!host) return undefined;
    const key = `${createHash('sha256')
      .update(credential ?? '')
      .digest('hex')}:${host}`;
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now())
      return Promise.resolve(cached.providers);
    const pending = inFlight.get(key);
    if (pending) return pending;
    const request = resolve({ urls: [`https://${host}/`] }, LOOKUP_TIMEOUT_MS)
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
        remember(key, providers, MATCH_TTL_MS);
        return providers;
      })
      .catch(() => {
        remember(key, undefined, ERROR_TTL_MS);
        return undefined;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, request);
    return request;
  };
}

/**
 * The scrape hint for the first provider, naming the Alexandria tools the
 * surface lists, or undefined when the lookup failed, matched none, or was not
 * back by `deadline` (epoch ms).
 */
export async function siteProviderHint(
  lookup: Promise<Providers>,
  deadline: number,
  alexandriaTools: AlexandriaTools
): Promise<string | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<undefined>((resolve) => {
    timer = setTimeout(
      () => resolve(undefined),
      Math.max(0, deadline - Date.now())
    );
  });
  const provider = (await Promise.race([lookup, late]))?.[0];
  clearTimeout(timer);
  if (!provider) return undefined;
  if (alexandriaTools === 'dedicated')
    return `This site has a structured-data provider (${provider}). To get typed records instead of page text, list its capabilities with ${ALEXANDRIA_LIBRARY_TOOL} {"command":"cat /library/*/${provider}/README.md"}, then call ${ALEXANDRIA_READ_TOOL} {"calls":[{"provider":"${provider}","capability":"<capability>","options":{...}}]}.`;
  return `This site has a structured-data provider (${provider}). To get typed records instead of page text, list its tools with firecrawl_find_tools {"providers":["${provider}"]}, then call firecrawl_scrape {"alexandria":{"provider":"${provider}","capability":"<capability>","options":{...}}}.`;
}
