# Search-only MCP surface (`/v2/mcp-search`)

The hosted server serves two surfaces:

- The **full** surface at `/v2/mcp`, with the complete tool set.
- The **search** surface at `/v2/mcp-search`, with a fixed subset.

Only the request path selects the surface. There is no inspection of client
identity, `User-Agent`, or `clientInfo`.

## Why the tool set is fixed

The search surface backs a published connector listing. Its tool set is a
contract with that listing, not an internal preference: `tools/list` on this
path must match the tool names the listing declares. Changing the set (adding,
removing, renaming, or hiding a tool) therefore needs the listing updated as
well, and that cannot be done from this repo. Tell partnerships before the
change merges, not after it deploys; every merge to `main` reaches production
within the hour.

## Tool contract

The search surface exposes exactly these eight tools and nothing else:

| Tool | Purpose |
| --- | --- |
| `firecrawl_search` | Ranked web / index search results |
| `firecrawl_developer_search` | Ranked developer-index results with matched passages |
| `firecrawl_research_search_papers` | Semantic search over indexed research papers |
| `firecrawl_research_inspect_paper` | Canonical metadata for one paper |
| `firecrawl_research_related_papers` | Citation-graph expansion from anchor papers |
| `firecrawl_research_read_paper` | Full-text passages from one paper |
| `firecrawl_find_tools` | Browse the Alexandria catalogue and read provider contracts (free) |
| `firecrawl_scrape` | Execute an Alexandria capability with an `alexandria` body, or retrieve one supplied URL (billed) |

Registration on this instance is filtered against that allowlist, so any tool
outside the set, including map, crawl, extract, agent, interact, parse,
monitor, and the feedback tools, is never registered, except for one
deprecated name kept for backward compatibility and described below.
`tools/list` reflects only these eight tools.

One additional name, the deprecated `firecrawl_research_search_github`, is
also registered on this instance but hidden from `tools/list`; a `tools/call`
for it returns a `DEPRECATED_TOOL` payload pointing callers at
`firecrawl_developer_search`, so cached sessions that predate its removal
still get a meaningful response instead of an unknown-tool error. Calling any
other name not in the eight-tool set returns an unknown-tool error.

`firecrawl_developer_search` queries `/v2/search/developer` and returns the
matched passages; `firecrawl_search` with `categories: ["developer"]` reaches the
same index beside ordinary web results. Both are available here.

## `firecrawl_search` fetches no page content

The search surface's `firecrawl_search` takes **no `scrapeOptions`**. Its input
schema is strict (unknown fields are rejected), and its executor builds the
outbound `/v2/search` body from an explicit list of allowed fields
(`query`, `limit`, `tbs`, `filter`, `location`, `sources`, `categories`,
`highlights`, `enterprise`) plus `origin`. It never spreads raw arguments, so
no request from this surface can ask the API to fetch third-party page content.
The schema and body construction enforce this directly, and contract tests guard
the behavior. No runtime filter is involved.

`firecrawl_scrape` on this surface is the same tool as on the full surface
(URL retrieval or Alexandria execution), registered with a description that
names only tools this surface exposes. `firecrawl_find_tools` is registered the
same way. Alexandria results on this surface carry no `feedbackTool` pointer,
since `firecrawl_feedback` is not registered here.

## Alexandria source

`sources` entries are source names (`web`, `news`, `images`, `alexandria`) or
`{ type }` objects. Alexandria returns compact tool suggestions by default in
`data.tools`; these are catalogue entries, not executed provider results.
Discovery costs no credits and requires an authenticated team with Alexandria
access; keyless sessions get an explanatory error before any request.

Search requires a query and does not accept catalogue browse mode; use
`firecrawl_find_tools` to browse the catalogue or read a full contract, and
`firecrawl_scrape` with `alexandria` to execute a capability. Both are part of
the eight-tool surface.

## OAuth

- **Resource identity.** The surface advertises its own protected resource,
  `https://mcp.firecrawl.dev/v2/mcp-search`, distinct from the full surface's
  `https://mcp.firecrawl.dev/v2/mcp`.
- **Path-scoped metadata (RFC 9728).** The protected-resource metadata document
  is served at `/.well-known/oauth-protected-resource/v2/mcp-search`. The 401
  challenge's `WWW-Authenticate: ... resource_metadata=...` points at that
  document.
- **Authenticated discovery.** Every request, including `tools/list`, requires
  a credential; the keyless free-tier fallback does not apply here.
- **Audience enforcement.** OAuth access tokens are introspected and must be
  bound to this exact resource: a token whose audience names a different
  resource, or that carries no audience binding at all, is rejected with a
  401 (fail closed). Plain API keys carry no audience and are a direct
  credential, so they are unaffected.

The full surface's OAuth behavior is unchanged (origin-level metadata, no
audience enforcement, keyless fallback intact).

## Deployment

Both instances start from the same image and process. The in-pod reverse proxy
routes `/v2/mcp-search` (and its key-in-path form `/{apiKey}/v2/mcp-search`)
plus the metadata path to the search instance's local port; everything else
routes to the full instance as before. If the search instance fails to bind its
port, it is logged and skipped; the full instance is unaffected. No new domain
and no infrastructure changes are required.

The bundled hosted deployment fixes the public path at `/v2/mcp-search`, the
internal search port at `3001`, and the OAuth resource at
`https://mcp.firecrawl.dev/v2/mcp-search`. `FIRECRAWL_MCP_SEARCH_ENABLED` is the
supported operational toggle. Node-level overrides for the port, endpoint, and
resource exist for isolated tests only; they do not update `docker/nginx.conf`
or the authorization server allowlist.

## Tests

`tests/mcp-search-profile.test.mjs` asserts the eight-tool contract, unknown-tool
rejection, `scrapeOptions` rejection, the clean outbound body, authenticated
`tools/list`, the path-scoped metadata document, audience acceptance/rejection,
and that the full surface is unaffected. It runs in CI via `pnpm test`.
