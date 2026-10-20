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

/** The header a connection sets to name the integration it comes from. */
export const DECLARED_ORIGIN_HEADER = 'x-firecrawl-origin';

const NAME_MAX = 48;

/**
 * User-Agent products that name an HTTP runtime or library rather than an MCP
 * client. Their stamp is the last resort, after every other signal.
 */
const RUNTIME_PRODUCTS = new Set([
  'apache-httpasyncclient',
  'apache-httpclient',
  'aiohttp',
  'axios',
  'bun',
  'curl',
  'dart',
  'deno',
  'faraday',
  'go-http-client',
  'got',
  'guzzlehttp',
  'java-http-client',
  'ktor-client',
  'libcurl-agent',
  'mozilla',
  'node',
  'node-fetch',
  'okhttp',
  'python',
  'python-httpx',
  'python-httpx2',
  'python-requests',
  'python-urllib',
  'reqwest',
  'ruby',
  'undici',
  'wget',
]);

/** Client names SDKs send by default, which say nothing about the integration. */
const GENERIC_CLIENT_NAMES = new Set([
  'client',
  'example-client',
  'mcp',
  'mcp-client',
  'test',
  'test-client',
]);

export type ClientImplementation = {
  name?: string;
  version?: string;
};

/** What a connection says about its client besides the call's own clientInfo. */
export type ClientSignals = {
  /** The `X-Firecrawl-Origin` header. */
  declaredOrigin?: string | null;
  /** The client an earlier initialize named, for calls that do not carry it. */
  initializeClient?: ClientImplementation | null;
  /** The OAuth client id of the session, when its token resolved one. */
  oauthClientId?: string | null;
  /** The registered name of that client, read when its id is not a URL. */
  oauthClientName?: string | null;
  /** The `Origin` or `Referer` header. */
  referrer?: string | null;
};

function slugOf(name: string | undefined | null): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, NAME_MAX)
    .replace(/-+$/, '');
}

function isOwnSlug(slug: string): boolean {
  return slug === '' || slug === 'fastmcp' || slug === 'firecrawl-fastmcp';
}

/**
 * The product token of a User-Agent header (`python-httpx/0.28.1` reads as
 * `python-httpx`, `node` as `node`), slugified the same way a client name is.
 */
export function userAgentProduct(userAgent: string | null | undefined): string {
  const first = (userAgent ?? '').trim().split(/\s+/)[0] ?? '';
  return slugOf(first.split('/')[0]);
}

/** Whether a User-Agent is absent or names an HTTP runtime rather than an MCP client. */
export function isRuntimeUserAgent(userAgent: string | null | undefined): boolean {
  const product = userAgentProduct(userAgent);
  return product === '' || RUNTIME_PRODUCTS.has(product);
}

/**
 * The token an initialize client name stamps when it reaches a call only
 * through `ClientSignals.initializeClient`; empty for the server's own names
 * and the defaults SDKs send when the integration sets none.
 */
export function initializeClientSlug(name: string | null | undefined): string {
  const slug = slugOf(name);
  return isOwnSlug(slug) || GENERIC_CLIENT_NAMES.has(slug) ? '' : slug;
}

function publicHost(url: string | null | undefined): string {
  let parsed: URL;
  try {
    parsed = new URL(url ?? '');
  } catch {
    return '';
  }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (
    !host.includes('.') ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    /^[\d.]+$/.test(host) ||
    host.startsWith('[')
  ) {
    return '';
  }
  return host.replace(/^www\./, '');
}

function referrerSlug(referrer: string | null | undefined): string {
  return slugOf(publicHost(referrer));
}

/** Hosts many unrelated projects share, so the first path segment tells them apart. */
const SHARED_STATIC_HOSTS = [
  'github.io',
  'gitlab.io',
  'pages.dev',
  'netlify.app',
  'vercel.app',
];

function isHttpUrl(value: string | null | undefined): boolean {
  try {
    return /^https?:$/.test(new URL(value ?? '').protocol);
  } catch {
    return false;
  }
}

/**
 * The product an OAuth client names: a URL id by its host
 * (`https://app.example.com/oauth/client.json` reads as `app-example-com`,
 * nothing for Firecrawl's own hosts), any other id by its registered name.
 */
function oauthClientSlug(
  clientId: string | null | undefined,
  clientName: string | null | undefined
): string {
  if (!isHttpUrl(clientId)) return initializeClientSlug(clientName);
  const host = publicHost(clientId);
  if (!host || host === 'firecrawl.dev' || host.endsWith('.firecrawl.dev')) {
    return '';
  }
  if (
    !SHARED_STATIC_HOSTS.some(
      (shared) => host === shared || host.endsWith(`.${shared}`)
    )
  ) {
    return slugOf(host);
  }
  const [first = ''] = new URL(clientId ?? '').pathname
    .split('/')
    .filter(Boolean);
  const segment = slugOf(first).slice(0, NAME_MAX / 2);
  if (!segment) return slugOf(host);
  const room = NAME_MAX - segment.length - 1;
  return slugOf(`${slugOf(host).slice(0, room)}-${segment}`);
}

/**
 * `mcp-<client>@<serverVersion>`: the client name lowercased and reduced to
 * letters, digits and single dashes, cut at 48 characters. The first signal
 * that yields a token wins:
 *
 * 1. `X-Firecrawl-Origin`, as `mcp-<origin>`;
 * 2. the call's own initialize client name, as `mcp-<client>`;
 * 3. a User-Agent that names a client, as `mcp-ua-<product>`;
 * 4. a client name an earlier initialize carried, as `mcp-<client>`;
 * 5. the host of a URL OAuth client id, or the registered name of any other
 *    client, as `mcp-oauth-<host or name>` (a shared static host adds the
 *    first path segment);
 * 6. the `Origin` or `Referer` host, as `mcp-ref-<host>`;
 * 7. a runtime User-Agent (`node`, `python-httpx`), as `mcp-ua-<product>`;
 * 8. otherwise `mcp-fastmcp`.
 *
 * Signals 4 to 6 only ever replace a runtime User-Agent or a missing one, so a
 * client that stamped `mcp-ua-<product>` for a named client keeps its token.
 */
export function originForClient(
  client: ClientImplementation | null | undefined,
  serverVersion: string,
  userAgent?: string | null,
  signals: ClientSignals = {}
): string {
  const declared = slugOf(signals.declaredOrigin);
  const slug = slugOf(client?.name);
  const product = userAgentProduct(userAgent);
  const remembered = initializeClientSlug(signals.initializeClient?.name);
  const oauthClient = oauthClientSlug(
    signals.oauthClientId,
    signals.oauthClientName
  );
  const referrer = referrerSlug(signals.referrer);
  const base = !isOwnSlug(declared)
    ? `mcp-${declared}`
    : !isOwnSlug(slug)
      ? `mcp-${slug}`
      : product && !RUNTIME_PRODUCTS.has(product)
        ? `mcp-ua-${product}`
        : remembered
          ? `mcp-${remembered}`
          : oauthClient
            ? `mcp-oauth-${oauthClient}`
            : referrer
              ? `mcp-ref-${referrer}`
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

/** The client signals the authenticated session carries (see SessionData). */
export type OriginSession = {
  clientUserAgent?: string;
  clientOrigin?: string;
  clientReferrer?: string;
  initializeClient?: ClientImplementation;
  oauthClientId?: string;
  oauthClientName?: string;
};

/**
 * The origin of every request a tool call makes: the call's client, the
 * client signals of the request the session was authenticated with
 * (stateless HTTP calls carry no client name), and this server's version.
 */
export function requestOrigin(
  client: McpClient,
  session?: OriginSession | undefined
): string {
  return originForClient(
    client?.version ?? null,
    serverVersion,
    session?.clientUserAgent,
    {
      declaredOrigin: session?.clientOrigin,
      initializeClient: session?.initializeClient,
      oauthClientId: session?.oauthClientId,
      oauthClientName: session?.oauthClientName,
      referrer: session?.clientReferrer,
    }
  );
}
