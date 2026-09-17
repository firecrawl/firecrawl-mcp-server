import { createRequire } from 'node:module';

/**
 * The origin this server stamps on every request it makes to the Firecrawl
 * API, as the `origin` body field and the `X-Origin` header.
 *
 * It names the MCP client that connected, from the `clientInfo` the client
 * sends at initialize (fastmcp hands it to every tool call as
 * `context.client.version`), and this server's version:
 * `mcp-claude-code@3.24.1`. The `mcp-` prefix is what classifies the request
 * as MCP traffic downstream; the client name is what tells one MCP client from
 * another. A client that sends no name, or one this server cannot turn into a
 * token, reads as the server itself, which is what every request read before
 * the client name was carried.
 */

/** The origin of a request whose client is unknown, and the prefix every client origin carries. */
export const ORIGIN_SERVER = 'mcp-fastmcp';

const NAME_MAX = 48;

export type ClientImplementation = {
  name?: string;
  version?: string;
};

function slugOf(name: string | undefined): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, NAME_MAX)
    .replace(/-+$/, '');
}

/**
 * The product token of a User-Agent header (`python-httpx/0.28.1` reads as
 * `python-httpx`, `node` as `node`), slugified the same way a client name is.
 */
export function userAgentProduct(userAgent: string | null | undefined): string {
  const first = (userAgent ?? '').trim().split(/\s+/)[0] ?? '';
  return slugOf(first.split('/')[0]);
}

/**
 * `mcp-<client>@<serverVersion>`: the client name lowercased and reduced to
 * letters, digits and single dashes, cut at 48 characters. Without a usable
 * client name (the server's own fastmcp names, an empty name, or a stateless
 * HTTP call that never saw the client's initialize) the origin falls back to
 * the User-Agent product token as `mcp-ua-<product>@<serverVersion>`, and
 * without that to `mcp-fastmcp@<serverVersion>`.
 */
export function originForClient(
  client: ClientImplementation | null | undefined,
  serverVersion: string,
  userAgent?: string | null
): string {
  const slug = slugOf(client?.name);
  const own = slug === '' || slug === 'fastmcp' || slug === 'firecrawl-fastmcp';
  const product = own ? userAgentProduct(userAgent) : '';
  const base = !own
    ? `mcp-${slug}`
    : product
      ? `mcp-ua-${product}`
      : ORIGIN_SERVER;
  return serverVersion ? `${base}@${serverVersion}` : base;
}

/** The header form of an origin, for the requests that reach the API without a body. */
export function originHeaders(origin: string): Record<string, string> {
  return { 'X-Origin': origin };
}

const { version: serverVersion } = createRequire(import.meta.url)(
  '../package.json'
) as { version: string };

/**
 * The client as fastmcp hands it to a tool call (`context.client`); its
 * `version` is the `clientInfo` the client sent at initialize.
 */
export type McpClient =
  { version?: ClientImplementation | undefined } | undefined;

/**
 * The origin of every request a tool call makes: the call's client, the
 * User-Agent the session was authenticated with (stateless HTTP calls carry
 * no client name), and this server's version.
 */
export function requestOrigin(
  client: McpClient,
  session?: { clientUserAgent?: string } | undefined
): string {
  return originForClient(
    client?.version ?? null,
    serverVersion,
    session?.clientUserAgent
  );
}
