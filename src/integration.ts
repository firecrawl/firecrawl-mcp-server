/**
 * The integration tag a launcher sets with `FIRECRAWL_INTEGRATION` (for
 * example an editor extension that starts this server), sent as the
 * `integration` body field of the Firecrawl API requests that accept one.
 */

const TAGGED_PATH =
  /^\/v2\/(scrape|batch\/scrape|crawl|map|search|extract|agent|parse|feedback|scrape\/[^/]+\/interact|search\/[^/]+\/feedback)$/;

/** The trimmed tag, or undefined when it is unset or blank. */
export function integrationFrom(value: string | null | undefined): string | undefined {
  const tag = (value ?? '').trim();
  return tag === '' ? undefined : tag;
}

function pathOf(url: string): string {
  const path = url.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, '').split(/[?#]/)[0];
  return path.replace(/\/+$/, '');
}

/**
 * The body with `integration` set, when a tag is configured, the path is an
 * endpoint whose schema accepts the field (others reject unknown keys), and
 * the body does not already name one.
 */
export function withIntegration<T extends Record<string, unknown>>(
  url: string,
  body: T,
  integration: string | undefined
): T {
  if (!integration || body.integration != null) return body;
  if (!TAGGED_PATH.test(pathOf(url))) return body;
  return { ...body, integration };
}
