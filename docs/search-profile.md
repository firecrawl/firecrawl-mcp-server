# Search-only MCP surface (`/v2/mcp-search`)

The server runs two FastMCP instances in one process:

- The **full** surface at `/v2/mcp` — the complete tool set, unchanged.
- The **search** surface at `/v2/mcp-search` — a fixed, read-only subset.

Only the request path selects the surface. There is no inspection of client
identity, `User-Agent`, or `clientInfo`.

## Tool contract

The search surface exposes exactly these six read-only tools and nothing else:

| Tool | Purpose |
| --- | --- |
| `firecrawl_search` | Ranked web / index search results |
| `firecrawl_research_search_papers` | Semantic search over indexed research papers |
| `firecrawl_research_inspect_paper` | Canonical metadata for one paper |
| `firecrawl_research_related_papers` | Citation-graph expansion from anchor papers |
| `firecrawl_research_read_paper` | Full-text passages from one paper |
| `firecrawl_research_search_github` | Search public repository history and readmes |

Registration on this instance is filtered against that allowlist, so any tool
outside the set — scrape, map, crawl, extract, agent, interact, parse, monitor,
and the feedback tools — is never registered. Both `tools/list` and
`tools/call` reflect only the six tools; calling anything else returns an
unknown-tool error.

## No page-content fetching

The search surface's `firecrawl_search` takes **no `scrapeOptions`**. Its input
schema is strict (unknown fields are rejected), and its executor builds the
outbound `/v2/search` body from an explicit list of allowed fields
(`query`, `limit`, `tbs`, `filter`, `location`, `sources`, `categories`,
`highlights`, `enterprise`) plus `origin`. It never spreads raw arguments, so
no request from this surface can ask the API to fetch third-party page content.
This is enforced by the schema and body construction, and covered by contract
tests — not by a runtime filter.

## OAuth

- **Resource identity.** The surface advertises its own protected resource,
  `https://mcp.firecrawl.dev/v2/mcp-search`, distinct from the full surface's
  `https://mcp.firecrawl.dev/v2/mcp`.
- **Path-scoped metadata (RFC 9728).** The protected-resource metadata document
  is served at `/.well-known/oauth-protected-resource/v2/mcp-search`. The 401
  challenge's `WWW-Authenticate: ... resource_metadata=...` points at that
  document.
- **Authenticated discovery.** Every request — including `tools/list` — requires
  a credential; the keyless free-tier fallback does not apply here.
- **Audience enforcement.** OAuth access tokens are introspected; a token whose
  audience does not name this resource is rejected with a 401. (Plain API keys
  carry no audience and are unaffected.)

The full surface's OAuth behavior is unchanged (origin-level metadata, no
audience enforcement, keyless fallback intact).

## Deployment

Both instances start from the same image and process. The in-pod reverse proxy
routes `/v2/mcp-search` and its metadata path to the search instance's local
port; everything else routes to the full instance as before. No new domain and
no infrastructure changes are required.

Relevant configuration lives in `FIRECRAWL_MCP_SEARCH_*` environment variables
(see the README) and the `/v2/mcp-search` routing in `docker/nginx.conf`.

## Tests

`tests/mcp-search-profile.test.mjs` asserts the six-tool contract, unknown-tool
rejection, `scrapeOptions` rejection, the clean outbound body, authenticated
`tools/list`, the path-scoped metadata document, audience acceptance/rejection,
and that the full surface is unaffected. It runs in CI via `pnpm test`.
