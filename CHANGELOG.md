# Changelog

## [Unreleased]

### Removed

- Hosted mode (`CLOUD_SERVICE=true`) no longer writes per-call `[MCP_ACTION]` and `[MCP_AGENT_HINTS]` log lines or posts action-log records (`FIRECRAWL_MCP_ACTION_LOG_URL`, `FIRECRAWL_MCP_ACTION_LOG_SECRET`). These modules are now maintained with the hosted deployment. The `onToolResult` hook is unchanged, so embedders can still observe tool calls.
- Hosted mode no longer serves the `/.well-known/openai-apps-challenge` route (`OPENAI_APPS_CHALLENGE_TOKEN`), and its `/ready` no longer checks hosted deployment configuration. `/ready` now returns `{"ok":true}` in every HTTP mode, as it already did for self-hosted HTTP.
- The search-only and account server profiles are removed. `FASTMCP_ENDPOINT` no longer selects a profile: `/v2/mcp-search` and `/v2/mcp-oauth` are now ordinary endpoint paths for the standard tool set, and other values are no longer rejected. Hosted mode no longer starts the second in-process search instance, and the `FIRECRAWL_MCP_SEARCH_ENABLED`, `FIRECRAWL_MCP_SEARCH_PORT`, `FIRECRAWL_MCP_SEARCH_ENDPOINT`, `FIRECRAWL_MCP_SEARCH_RESOURCE_URL`, `FIRECRAWL_MCP_SEARCH_OAUTH_ONLY` and `MCP_OAUTH_ACCEPT_LEGACY_V2_MCP_AUD` variables are no longer read. The server no longer publishes OAuth protected-resource metadata. The README "Search-only endpoint" section and `docs/search-profile.md` are removed. The `firecrawl_search` tool and the `firecrawl-mcp/server` library are unchanged.
- Hosted keyless admission is removed. With `CLOUD_SERVICE=true`, an HTTP request without a credential is now rejected with 401 like any other missing credential, instead of being admitted as a rate-limited keyless session; `KEYLESS_PROXY_SECRET` is no longer read and client IPs are no longer forwarded. A request with an invalid credential is still admitted and every tool call returns the `CREDENTIAL_INVALID` recovery payload. Local keyless stdio (no `FIRECRAWL_API_KEY` and no `FIRECRAWL_API_URL`) is unchanged.
- Delegated credential signing for managed OAuth grants is removed (`MCP_DELEGATED_CREDENTIAL_SECRET` is no longer read). An OAuth access token whose grant needs a delegated credential now gets the same `503` credential-validation response it got when that secret was not configured. General-purpose OAuth access tokens (`fco_…`) are still accepted and exchanged through introspection in every HTTP mode.
- With `CLOUD_SERVICE=true`, a credential that is not a Firecrawl API key or access token is now rejected with `401` and the API-key recovery payload, instead of being admitted to a session whose tool calls all return `CREDENTIAL_INVALID`. A well-formed API key the API rejects still returns `CREDENTIAL_INVALID` from the tool call.

### Changed

- `CLOUD_SERVICE=true` is documented as a hardened HTTP preset: streamable HTTP bound to `0.0.0.0`, a credential required on every request, safe mode, and upload-only file access. `npm run start:cloud` still starts it.

## [3.29.0] - 2026-10-09

### Added

- Unstable library entry point `firecrawl-mcp/server`: `createFirecrawlMcpServer(options)` builds a server instance for embedding in another runtime, with extension hooks under `unstable_hooks` (`authenticate`, `wrapTool`, `onToolResult`, `instructions`, `registerExtraTools`, `outboundRequest`, `beforeKeylessRequest`, `toolFilter`, `configureHttp`, `oauth`) and its own type declarations, so embedders do not import `fastmcp`. The API may change in any release. The `firecrawl-mcp` CLI is unchanged.
- `firecrawl-mcp/server` also exports the helpers the built-in tools use (credential recovery payloads, header and origin helpers, search field definitions, the search output schema, search request and Alexandria error helpers, the read-only `KEYLESS_TOOL_NAMES` set, and `structuredCompact`), so embedded tools and hooks can behave like the built-in ones. They are unstable too.
- `firecrawl_gov_search` queries `/v2/search/gov`, an index of primary law and regulatory material from US federal, state, and local government sources (statutes, regulations, codes, court opinions, and other government publications). It takes `query` and an optional `k` (1 to 100) and returns ranked results with a position, title, URL, and matched snippet. It is registered on the full surface for authenticated sessions and on the search surface (`/v2/mcp-search`), whose fixed tool set grows to nine.
- `firecrawl_agent` now exposes the optional `effort` (`low`, `medium`, `high`), `maxCredits`, and `strictConstrainToURLs` parameters that `POST /v2/agent` already accepts, and forwards them in the request body.
- `firecrawl_agent` can continue a thread: it accepts `threadId` and `mode` (`"extract"` or `"chat"`) and forwards them to `POST /v2/agent` through the SDK. On a follow-up, omitted `mode`, `urls` and `schema` carry over from the previous turn. `firecrawl_agent_status` now keeps `message` and `suggestions` in its structured content, next to `threadId` and `threadTurn`.
- `firecrawl_agent` accepts an `exchange` object that mirrors the API's (`enabled`, `toolkits` (at most 5), `maxCalls`, `requireApproval`, `approve: { approvalId, callIds?, always? }`, `decline: { approvalId }`, `onTermsRequired`) and forwards it to `POST /v2/agent` through the SDK. `exchange.onTermsRequired` (`"skip"` or `"ask"`) controls Alexandria providers whose data terms the team has not accepted; they are never called. After an ask-mode terms offer and the user's explicit consent to `terms/accept`, a caller answers the offer on the same thread with `exchange.approve: { approvalId }` (or `exchange.decline`) instead of starting over. `approve` and `decline` require `threadId` and cannot be sent together, and `exchange.requireApproval` requires `mode: "chat"` on the same call. There is no auto-accept. `firecrawl_agent_status` now keeps `exchange` (including `skippedProviders` and `requiresAction`, whose provider `digest` is `string | null` and always present) and `pendingApproval` in its structured content.

- `firecrawl_agent_status` flags a run that stopped at its credit limit. When the API reports `status: "failed"` with `stopReason: "credit_limit_reached"`, the text result starts with a plain notice: the run hit `maxCredits`, `partial` (when present) is an incomplete best-effort result and whether it matches the requested schema, the agent's `message`, and how to continue (a follow-up on the same `threadId`, or a new run with a higher `maxCredits`). Structured content keeps `partial`, `partialSchemaValid` and `stopReason` and adds the same `notice`. Every other status is returned unchanged.

### Changed

- The `ghcr.io/firecrawl/firecrawl-mcp-server` container image now packages the standard server: stdio by default, Streamable HTTP with `HTTP_STREAMABLE_SERVER=true` on `PORT` (default `3000`), entrypoint `node dist/index.js`, running as the non-root `node` user. Earlier `latest` builds ran a deployment-specific image listening on port `8080`; if you ran that image, update your port mapping and configuration. Images are tagged `latest`, `v<package version>` and `sha-<commit sha>`, and the `firecrawl-mcp-server-alpha` image is no longer published. See "Running with Docker" in the README.
- `tools/list` now sends each tool's top-level `title` (MCP 2025-06-18), copied from `annotations.title`. The title wording is unchanged. Clients that read only the top-level field, such as Codex's tool search, now see the same display names.
- The npm package now bundles the pnpm-patched fastmcp. npm does not apply pnpm patches, so `npx firecrawl-mcp` installs were loading unpatched fastmcp from the registry, without the top-level titles or the `canList` and `beforeValidate` hooks. fastmcp's runtime imports (`@modelcontextprotocol/sdk`, `fuse.js`, `hono`, `mcp-proxy`, `undici`, `uri-templates`, `xsschema`) are now direct dependencies so they resolve under pnpm's non-hoisted layout too.
- Keyless recovery messages now link to the caller's own signup link, `https://firecrawl.dev/k/<token>` (a 12-character encrypted token), instead of `/app/api-keys`. The API issues the link (the `signup_url` of a keyless 429, or `signupUrl` from the eligibility check, which the server now also asks for when a keyless session calls an account-only tool) and the site decrypts it to MCP keyless attribution. When the API can't give one it sends the regular keyless signup link, which is relayed as is; with no API link at all the message uses the regular MCP signup link (`signin?utm_source=keyless&utm_medium=mcp`). Recovery payloads carry the link as `signup_url`. Signed-in users who open it land on the API keys page.
- The search surface (`/v2/mcp-search`) now exposes `firecrawl_find_tools` and `firecrawl_scrape` alongside its six search tools, so agents can execute the Alexandria providers that `firecrawl_search` already returns. Both carry surface-scoped descriptions that name only tools registered on that surface, and Alexandria results there omit the `firecrawl_feedback` pointer. See docs/search-profile.md.

### Fixed

- Hosted OAuth reuses a token's introspection answer for up to 60 seconds, capped by the token's expiry, and 10 seconds for an inactive answer. Concurrent requests with one token share a single introspection call, and failed introspections are never cached. This keeps each node under the issuer's per-IP rate limit, which was turning bursts into `Firecrawl credential validation is temporarily unavailable`. A revoked token can keep working for up to 60 seconds on a pod that cached it. Set `FIRECRAWL_OAUTH_INTROSPECT_CACHE_TTL_MS=0` to turn the cache off. `[MCP_CREDENTIAL_VALIDATION]` records now include `edge_mitigation` (`deny`, `challenge`, `rate_limit` or `other`) when the edge firewall blocked the introspection.
- `firecrawl_search` on both surfaces now forwards `includeDomains` and `excludeDomains` to `/v2/search` as body fields instead of rewriting the query with `site:` operators, so the API's domain enforcement applies to MCP callers.

## [3.25.0] - Unreleased

### Added

- Alexandria discovery through `firecrawl_search` with `sources: ["alexandria"]` or `sources: [{ "type": "alexandria" }]`. Both profiles normalize the legacy `exchange` source to `alexandria` and return compact tool suggestions by default in `data.tools` with `creditsUsed` preserved.
- `firecrawl_find_tools` on the full surface provides category browsing, compact provider tools, selected full contracts, URL lookup and `nextTool` navigation.
- `firecrawl_scrape` executes one or up to ten calls using `alexandria: [{ provider, capability, options }]` instead of `url`. Results are returned as `{ success, scrape_id, requestId, data: { alexandria, creditsCost } }`. Errors preserve their code and available charge ID. Keyless sessions receive `Alexandria requires an API key on a team with Alexandria access`.
- Provider terms are read and accepted through nested `firecrawl_scrape` capabilities after a blocked request. Acceptance requires the reviewed version and digest, explicit user authorization and `confirmed: true`.
- Successful large Alexandria results use a retained-result handoff above 20,000 estimated tokens when remote access is verified.

## [3.21.4] - 2026-06-23

### Added

- `firecrawl_parse` now works on the remote hosted MCP server (`CLOUD_SERVICE`), not just local mode. Because the hosted server cannot read the caller's filesystem, hosted parse uses a two-call flow: the first call (`filePath`) returns a short-lived signed upload command plus a `nextToolCall` carrying an `uploadRef`; after the bytes are uploaded, the second call (`uploadRef`) parses the file server-side. The generated upload command never includes your Firecrawl API key, and the flow also works on the keyless remote URL.

## [3.20.2] - 2026-06-01

### Added

- Added `redactPII` to scrape, parse, and nested scrape option schemas so MCP callers can request PII redaction with a single flag.

## [3.20.1] - 2026-05-28

### Fixed

- Fix stdio transport regression introduced in 3.18.0 where every tool call
  failed with `Unauthorized: API key is required when not using a self-hosted
  instance` even when `FIRECRAWL_API_KEY` was set. The OAuth refactor in 3.18.0
  made the `authenticate` callback unconditionally read `request.headers`, but
  `firecrawl-fastmcp` invokes `authenticate(undefined)` for stdio (there is no
  HTTP request context). The resulting `TypeError` was swallowed by FastMCP,
  leaving the session unauthenticated. Added a null guard so env-var
  credentials (`FIRECRAWL_API_KEY` / `FIRECRAWL_OAUTH_TOKEN`) are honored on
  stdio again.

## [3.19.1] - 2026-05-27

### Changed

- Refined monitor goal guidance for meaningful-change monitoring.
- Documented `isMeaningful`, `judgment`, and `meaningfulChanges` monitor results.

## [3.19.0] - 2026-05-25

### Added

- Added a simplified `firecrawl_monitor_create` path using `page` or `pages` plus `goal`.
- Added monitor check status filtering to `firecrawl_monitor_checks`.

### Changed

- Updated monitor tool guidance to prefer goal-based meaningful-change monitoring and document `judgment` results.

## [1.7.0] - 2025-03-18

### Fixed

- Critical bugfix for stdio transport hanging issues with Python clients
- Implemented transport-aware logging that directs logs to stderr when using stdio transport
- Resolves issue #22 where Python clients would hang during initialization or tool execution
- Improves compatibility with non-JavaScript MCP clients

## [1.2.4] - 2024-02-05

### Added

- Environment variable support for all configuration options
- Detailed configuration documentation in README

### Changed

- Made retry and credit monitoring settings configurable via environment variables:
  - `FIRECRAWL_RETRY_MAX_ATTEMPTS`
  - `FIRECRAWL_RETRY_INITIAL_DELAY`
  - `FIRECRAWL_RETRY_MAX_DELAY`
  - `FIRECRAWL_RETRY_BACKOFF_FACTOR`
  - `FIRECRAWL_CREDIT_WARNING_THRESHOLD`
  - `FIRECRAWL_CREDIT_CRITICAL_THRESHOLD`
- Enhanced configuration examples with detailed comments and use cases
- Improved documentation for retry behavior and credit monitoring

### Documentation

- Added comprehensive configuration examples for both cloud and self-hosted setups
- Added detailed explanations of retry behavior with timing examples
- Added credit monitoring threshold explanations
- Updated Claude Desktop configuration documentation

## [1.2.3] - 2024-02-05

### Changed

- Removed redundant batch configuration to rely on Firecrawl library's built-in functionality
- Simplified batch processing logic by leveraging library's native implementation
- Optimized parallel processing and rate limiting handling
- Reduced code complexity and potential configuration conflicts

### Technical

- Removed custom `CONFIG.batch` settings (`maxParallelOperations` and `delayBetweenRequests`)
- Simplified batch operation processing to use library's built-in batch handling
- Updated server startup logging to remove batch configuration references
- Maintained credit usage tracking and error handling functionality

## [1.2.2] - 2025-02-05

### Fixed

- Resolved unused interface warnings for ExtractParams and ExtractResponse
- Improved type safety in extract operations
- Fixed type casting issues in API responses

### Changed

- Improved type guards for better type inference
- Enhanced error messages for configuration validation

## [1.2.0] - 2024-01-03

### Added

- Implemented automatic retries with exponential backoff for rate limits
- Added queue system for batch operations with parallel processing
- Integrated credit usage monitoring with warning thresholds
- Enhanced content validation with configurable criteria
- Added comprehensive logging system for operations and errors
- New search tool (`firecrawl_search`) for web search with content extraction
- Support for self-hosted Firecrawl instances via optional API URL configuration
  - New `FIRECRAWL_API_URL` environment variable
  - Automatic fallback to cloud API
  - Improved error messages for self-hosted instances

### Changed

- Improved error handling for HTTP errors including 404s
- Enhanced URL validation before scraping
- Updated configuration with new retry and batch processing options
- Optimized rate limiting with automatic backoff strategy
- Improved documentation with new features and examples
- Added detailed self-hosted configuration guide

### Fixed

- Rate limit handling in batch operations
- Error response formatting
- Type definitions for response handlers
- Test suite mock responses
- Error handling for invalid search queries
- API configuration validation

## [1.0.1] - 2023-12-03

### Added

- Initial release with basic scraping functionality
- Support for batch scraping
- URL discovery and crawling capabilities
- Rate limiting implementation
