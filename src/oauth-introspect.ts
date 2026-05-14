/**
 * Resolves opaque OAuth access tokens via firecrawl.dev token introspection (RFC 7662).
 * No database credentials in this package — only HTTPS + a shared secret.
 */

const INTROSPECT_HEADER = 'x-firecrawl-mcp-introspect-secret';

export type IntrospectSuccess = {
  active: true;
  firecrawl_api_key: string;
};

export type IntrospectInactive = {
  active: false;
};

export async function introspectAccessToken(
  accessToken: string
): Promise<IntrospectSuccess | IntrospectInactive | null> {
  const url = process.env.FIRECRAWL_OAUTH_INTROSPECT_URL?.trim();
  const secret = process.env.FIRECRAWL_OAUTH_INTROSPECT_SECRET?.trim();
  if (!url || !secret) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        [INTROSPECT_HEADER]: secret,
      },
      body: new URLSearchParams({
        token: accessToken,
        token_type_hint: 'access_token',
      }).toString(),
      signal: controller.signal,
    });

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { active: false };
    }

    if (!res.ok) {
      return { active: false };
    }

    const rec = body as { active?: boolean; firecrawl_api_key?: string };
    if (
      !rec.active ||
      typeof rec.firecrawl_api_key !== 'string' ||
      !rec.firecrawl_api_key
    ) {
      return { active: false };
    }

    return { active: true, firecrawl_api_key: rec.firecrawl_api_key };
  } catch {
    return { active: false };
  } finally {
    clearTimeout(timeout);
  }
}
