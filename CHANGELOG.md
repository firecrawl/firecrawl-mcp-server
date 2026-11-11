# Changelog

## [3.39.0] - 2026-11-09

### Added

- `alexandria_library_search` explores the Alexandria catalogue as a read-only filesystem with one shell command per call (`ls`, `grep`, `cat`, `jq`, pipes). `/library/<category>/<provider>/<capability>.md` holds one contract per capability, every folder has a `README.md`, and recorded responses are under `/examples`. The result is the command's output as text, with `stdout`, `stderr` and `exitCode` in `structuredContent`. It is free, runs no provider, and needs an Alexandria API that serves `firecrawl/library`.
- `alexandria_library_read` runs Alexandria capabilities: `calls` is an array of one to ten `{provider, capability, options}` entries (each optionally with `version`), which may name different providers, with optional `requestId` and `timeout`. The result envelope is the one `firecrawl_scrape` with `alexandria` returned, with one result per call, in the same order, in `data.alexandria`.
- `people_company_enrich` accepts `people` and `companies` in the same call, in one provider block or across blocks. Each kind runs as its own request and is reported as its own `providers` entry with `kind: "people"` or `kind: "companies"`, so a provider given both has two entries, each with its own records, `input_index` into that kind's list, credits and errors. One kind failing does not fail the other. `max_credits` is checked against the estimate for both. `contact_fields` applies to the people, and companies in the same call get firmographics. Such calls used to be refused with `Give <provider> exactly one of people or companies` or `Send people and companies in separate calls`. Every `people_company_enrich` entry for a provider that ran now carries `kind`.

### Changed

- On the full surface (stdio, `/v2/mcp`, `/v2/mcp-oauth`), Alexandria has its own tools, `alexandria_library_search` and `alexandria_library_read`. The earlier paths keep working:
  - `firecrawl_scrape` no longer lists `alexandria` and `requestId` in its input schema or describes them. It still accepts them and runs the call or batch exactly as before, so clients and prompts that learned that shape keep working.
  - `firecrawl_find_tools` stays listed beside the new tools and answers as before, so a client that takes up a new tool only after its own review keeps catalogue discovery in the meantime. It is not marked always-load there, so the library tools lead where a client defers tools.
  - `alexandria_library_read` lists `calls` only. It also reads an `alexandria` body (one call or an array) and one call sent as the arguments themselves (`{provider, capability, options}`) as `calls`.
  - Follow-up calls in results (`nextTool` for provider terms, for a retained result, and `next_tool` for a pending enrichment job) are addressed to `alexandria_library_read`.
  - Server instructions, the `firecrawl_search` and `firecrawl_scrape` descriptions and the `toolDetail` and `query` parameters name the new tools.
  - An embedder whose `toolFilter` leaves either new tool out keeps `firecrawl_find_tools` and `firecrawl_scrape` with `alexandria` listed, with the earlier copy.
  - The search-only endpoint is unchanged: it keeps listing `firecrawl_find_tools` and `firecrawl_scrape` with `alexandria`, because its tool list is fixed by its connector listing.
- `firecrawl_scrape` no longer advertises the `json` format or `jsonOptions`. Cached calls using them keep the existing JSON extraction, validation and results for compatibility. Other formats and tools are unchanged.
- The `max_credits` description on `people_company_search` and `people_company_enrich` says to set it only to a budget the user gave, and that it is 1000 when left out. It no longer says that 0 runs only free calls, though 0 still does. A `max_credits_exceeded` error now says to retry the same call with the minimum `max_credits` when the user did not ask for the cap, and to ask the user first when they did.
- A `people_company_search` or `people_company_enrich` call that fails only because a provider's terms are not yet accepted for the organization fails with `third_party_data_terms_required` instead of `no_provider_ran`. The error names the provider, its terms version and the dashboard page where an organization admin accepts them. It also gives an example call without that provider, with `max_credits` set high enough for it to run. The provider's `note`, which agents also see when another provider failed or succeeded in the same call, now says to retry without it, names a provider that did not fail in the call, or says to wait for acceptance. It used to say not to retry until the terms were accepted. Both tool descriptions say Apollo runs once an organization admin has accepted its terms.
- `people_company_search` and `people_company_enrich` state their limits and rules in the tool descriptions and repair or explain more mistakes:
  - A page size above its maximum (Apollo `per_page` 25, FullEnrich `limit` 25, People Data Labs `limit` 10) runs at the maximum with a `note`, where it used to be refused. The maximum is in each field's description and advertised schema.
  - A call whose every provider block errors or is skipped fails with `no_provider_ran`, each provider's reason, the credits charged and an example of a working call. It used to return a normal result with only errored or skipped providers. The per-provider report is still in `structuredContent`.
  - The `firecrawl_search` block is estimated at its listed price, 2 credits per 10 results (10 with enterprise zdr), without the 2 credits per result a team that scans results pays. That charge is described, and `max_credits` does not count it.
  - `entity` is described as required, exactly `"person"` or `"company"` (plural and `organization` forms are still read as these, as before). A call without it, or with any other value, is refused with an error that names it, every unknown top-level field and an example call.
  - The `max_credits` description says how the estimate is made. A `max_credits_exceeded` error gives the minimum `max_credits`, and the same call raised to it when the call is short enough to quote.
  - `contact_fields` is described as people only. Every argument error that reaches schema validation names all invalid fields, not the first five, and every enrich shape error (no provider, a block with neither people nor companies, `contact_fields` with companies only) includes an example call, built from the caller's own arguments when they are short.
- `firecrawl_agent` and `people_company_enrich` are annotated `readOnlyHint: true`. Both read the web or provider data and return it. They spend credits but change nothing on the web or in the account, so clients that confirm non-read-only tools first, such as Hermes with `trust: untrusted`, no longer ask before every research or enrichment call. `max_credits` / `maxCredits` still cap what a call can spend.
- On the search-only endpoint and the full surface in `legacy` mode, `firecrawl_find_tools` is marked always-load (`_meta["anthropic/alwaysLoad"]`), so clients that defer MCP tools behind a tool search, such as Claude Code, list it with the agent's other tools from the first turn. Its description no longer tells the agent to prefer `firecrawl_search` for data tasks. In agent evals, both changes together made agents look up and run Alexandria providers on data tasks much more often, with no extra lookups on tasks that need only the web.

### Fixed

- A provider call the API refused before any provider ran (`retryable: true`: an agreement, quote or credit-reservation outage) is resent once, after 300-500 ms, when the call can safely repeat: an Alexandria scrape or enrich chunk pinned to its request id, or a catalogue read. A resend stays inside the caller's `timeout` and is skipped when too little of it is left. A retryable refusal now reaches the agent with its `retryable` flag, and the enrich report marks `precheck_unavailable` and `billing_unavailable` retryable.
- More argument mistakes are refused as tool errors with an error code, like the json format check: a `query` format without `queryOptions.prompt` in `firecrawl_scrape` and in `firecrawl_interact` `scrapeOptions` (`invalid_request`, with the text `formats "query" needs queryOptions with a non-empty prompt.` in place of the SDK's `query format requires a non-empty 'prompt' string`), a `json` format without a prompt or schema in `firecrawl_interact` `scrapeOptions` (`invalid_request`), and the input checks of `firecrawl_find_tools`, `firecrawl_monitor_create` and `firecrawl_credit_usage` (`invalid_input`). The error code reaches `onToolResult` on the thrown `UserError`'s `extras`, and for the `invalid_input` tools only there: their `outputSchema` does not declare `code`, so the code is not in the client's `structuredContent`. The text block no longer carries the `Tool '<name>' execution failed:` prefix for these errors.

## [3.38.0] - 2026-11-06

### Added

- Per-call feedback tokens for Alexandria. Alexandria call results can carry a `feedbackToken`; the server keeps up to 20 per session for 24 hours and shows the agent a short `feedbackRef` (`c1`, `c2`, ...) in its place, and retained results list their refs in `feedbackRefs`. `firecrawl_feedback` with endpoint `alexandria` sends the session's tokens with the overall rating, so it covers the calls in the session, and takes an optional `callRatings: [{ ref, rating }]` to rate single calls. Unknown or expired refs are dropped and reported in `note`, a successful submission clears the tokens it sent, and `rejectedTokens` from the API is passed through. Sessions are keyed by `Mcp-Session-Id`, or by a hash of the credential without one. Clients and results without tokens behave as before.
- Two enrichment tools over Alexandria's B2B data providers, listed by default wherever the server has a credential, including the search-only endpoint (not in local keyless mode and not to keyless sessions): `people_company_search` finds people or companies (`entity: "person" | "company"`), optionally beside web results from a `firecrawl_search` block, and `people_company_enrich` looks up and enriches known people or companies, or with `contact_fields` finds work email, personal email or mobile for known people. Each tool has a block for each provider it supports (from Apollo, FullEnrich, People Data Labs and Data Legion) that takes that provider's own parameters, with nothing shared between providers, and a provider runs only when the call includes its block. Providers given a block run in parallel, and every response reports, per provider, its own records, what it charged and any error, with `retryable` on provider and web search failures a later try may fix. Each call takes `max_credits` (default 1000) and is refused before any provider runs when its estimated most possible cost is higher. Arguments may carry `conversationId` and `objective`, which are dropped; common near-miss shapes are repaired, and an argument that still fails schema validation is refused with the field, what its block takes and an example. These tools add two entries to the default tool list and to the search-only endpoint's fixed tool set.

### Changed

- When a keyless session reaches its daily limit, the tool error now tells the agent to stop rather than finish the task another way: "Stop here and don't finish the task another way. Tell the user the Fix above and offer to continue once it is set up, then end your answer with this line:". It replaces "Finish the task without Firecrawl, then end your answer with this line:". The setup steps and the closing signup line are unchanged. In testing with two coding agents, the old line led both to fall back to another web tool without telling the user how to set up Firecrawl. With the new line, every answer passed the setup steps on to the user and offered to continue once they were in place, and the agents no longer completed the task another way.

### Fixed

- `firecrawl_scrape`, `firecrawl_map` and `firecrawl_interact` `url`, and `firecrawl_agent` and `firecrawl_find_tools` `urls`, accept a URL without a scheme (`example.com/page`) and read it as `https://example.com/page`, as `firecrawl_crawl` already did through the API. Some MCP clients rewrite full URLs in tool arguments but pass scheme-less ones through intact, and these calls used to fail with `url: Invalid URL` before reaching the API. The fields are advertised as plain strings, without `format: "uri"` or the `^https?://` pattern, and other schemes are still refused. The scrape, map and interact descriptions say the scheme may be omitted.
- The server instructions for keyless sessions no longer say `firecrawl_developer_search` takes repository, language, and license filters. The tool takes `query`, `k` and `skills`; the instructions now describe what it searches: public repositories, GitHub issues, merged pull requests, repository READMEs, and code documentation. 3.37.0 shipped the incorrect sentence.
- A tool call on a site the API does not support reports `Firecrawl can't scrape this site because it is currently not supported. Check Alexandria for a relevant provider if available, or use another source.`, with error code `unsupported_site`, in place of the API's text, which apologizes and points to a sales contact an agent can't act on. The text block keeps its `Tool '<name>' execution failed:` prefix, and the API's own response is unchanged.
- Direct HTTP requests preserve API error codes too, including HTTP 200 bodies with `success: false`, for keyless requests, parsing and monitoring. Research paper lookups only treat the API's specific `NOT_FOUND` / `paper metadata not found` response as a missing paper; route and configuration 404s remain errors.
- A scrape the API answers with HTTP 200, `success: false` and an error code, as it does when the host has no DNS record (`SCRAPE_DNS_RESOLUTION_ERROR`), is reported like any other failed API request: the error result carries `structuredContent` with `success: false` and `error: { code, status, message }`. It used to carry only the text block, unlike every other API failure, and some clients showed such results as a bare tool error without the API's explanation.
- `firecrawl_scrape` refuses `formats: ["json"]` without a `jsonOptions` prompt or schema with `formats "json" needs jsonOptions with a prompt or a schema. To ask a question about the page, use formats ["query"] with queryOptions.prompt instead.`, and `structuredContent` with error code `invalid_request`. The SDK already refused these calls before sending them, with a plain error that reached clients as text alone, so some showed a bare tool error. Agents that hit it had often put their question in `queryOptions`. Keyless scrapes, which the API accepts without a prompt or schema, are unchanged.
- `firecrawl_research_read_paper` and `firecrawl_research_inspect_paper` report a paper ID the research index does not know as `(paper not found: no indexed paper has the ID "<id>". Use a paperId or primaryId from firecrawl_research_search_papers results.)`, with `passages: []` and no `paper` in `structuredContent`, as their output schemas describe. The API answers such an ID with 404, and both tools used to fail with `Request failed with status code 404` as text alone, which some clients showed as a bare tool error.
- `firecrawl_feedback` accepts `objective`, `rationale`, `requestedWebsite`, `providerFeedback` and `capabilityFeedback` on `search`, `scrape`, `parse` and `map` feedback. The tool advertises these fields, and agents often carry `objective` over from their search and scrape calls, but a job feedback call that included one failed validation with "<field> is only supported for Alexandria feedback" and was never sent. They are left out of the `/v2/feedback` body, which rejects unknown keys, except that `rationale` is sent as `note` when the call has no `note`. Alexandria feedback, and the advertised input schema, are unchanged.
- `firecrawl_feedback` and `firecrawl_search_feedback` add the API's validation messages to `error` when it rejects a body with `INVALID_BODY`, for example `Invalid request body: Feedback must be substantive. 'good' requires valuableSources or valuableResults; ...`. The error used to read only `Invalid request body`, so an agent could not tell which rule its call broke and sent the same call again. Other rejections read as before, and the output schema is unchanged.

## [3.37.0] - 2026-11-04

### Added

- `firecrawl_research_search_papers` takes `sort`: `relevance` (default) or `date_desc`, which returns the newest of the most relevant matches.
- `firecrawl_research_search_papers` and `firecrawl_research_related_papers` print authors and created and updated dates when the result includes them.

### Changed

- The server instructions for keyless sessions list `firecrawl_research_*` for paper-index research only and name `firecrawl_developer_search` among the tools an API key exposes. The README points GitHub repository, issue and pull request research to `firecrawl_developer_search`.

## [3.36.1] - 2026-11-03

### Changed

- The `firecrawl` JS SDK dependency moves from 4.50.0 to 4.51.0. That release adds the Government Index filters (`jurisdiction`, `court`, `courtType`, `cites`, `domain`) to the SDK's `govSearch`, `location` and `zeroDataRetention` to agent requests, and `insufficient_credits` and `zeroDataRetention` to the agent trace types. The server uses none of them: `firecrawl_gov_search` already sends its filters through the SDK's HTTP client, and `firecrawl_agent` offers neither `location` nor `zeroDataRetention`, so tools, schemas and results are unchanged.

### Fixed

- The Gemini CLI extension starts the firecrawl-mcp release it ships, `npx -y firecrawl-mcp@3.36.1`, instead of `npx -y firecrawl-mcp`. Without a version, npm picks the newest release whose `engines` accepts the running Node, so on Node 20, which Gemini CLI supports, the extension ran firecrawl-mcp 3.22.2. npm installs an exact version as asked, and 3.36.1 starts on Node 20 with an engine warning. The pin moves with each release: a test checks that it matches the package version.

## [3.36.0] - 2026-10-27

### Changed

- Local HTTP mode (`HTTP_STREAMABLE_SERVER=true` or `SSE_LOCAL=true` without `CLOUD_SERVICE=true`) checks the `Host` and `Origin` headers. It answers `localhost`, `127.0.0.1` and `[::1]` on any port, the address in `HOST` unless it is `0.0.0.0` or `::`, and the hosts listed in the new `FIRECRAWL_MCP_ALLOWED_HOSTS` (comma-separated). Any other `Host`, or an `Origin` naming any other host (including `null`), gets `403` with a JSON-RPC error, and the server logs a warning that names `FIRECRAWL_MCP_ALLOWED_HOSTS`, so a web page can't reach the server through DNS rebinding or a cross-origin request and spend the configured `FIRECRAWL_API_KEY`. CORS headers echo an allowed origin, with `Vary: Origin`, instead of `Access-Control-Allow-Origin: *`. `GET` and `HEAD` requests to `/health` are answered for any host, so health checks that address the server by IP keep working; they get no CORS allow for other origins. Clients that reach the server under another name, such as a LAN address or a reverse-proxy hostname, need that name in `FIRECRAWL_MCP_ALLOWED_HOSTS`; `FIRECRAWL_MCP_ALLOWED_HOSTS=*` restores the previous behaviour. `CLOUD_SERVICE=true` and stdio are unchanged.
- The `firecrawl_scrape` description's Alexandria contract guidance says "a key field under response" instead of `response.key`. Some MCP gateways scan tool descriptions for sensitive file names, read `response.key` as a private key file, and flagged the tool.

### Fixed

- `tools/list` advertises record-typed inputs as open objects again. Since 3.35.0 they were advertised with `additionalProperties: false` and no properties, which allows only `{}`, so clients that validate arguments against the advertised schema before sending a call refused any real value. The server's own validation accepted them throughout. The affected fields are `jsonOptions.schema` on `firecrawl_scrape` and `firecrawl_parse`, `scrapeOptions.jsonOptions.schema` on `firecrawl_search`, `firecrawl_crawl` and `firecrawl_interact`, `schema` on `firecrawl_agent`, `webhookHeaders` on `firecrawl_crawl` (now `additionalProperties: { type: "string" }`), `metadata` on `firecrawl_feedback`, and `body` on `firecrawl_monitor_create` and `firecrawl_monitor_update`; the rest advertise `additionalProperties: {}`. Every other input schema, and every output schema, is unchanged.
- stdio no longer starts when authentication fails. If an `unstable_hooks.authenticate` hook throws, returns nothing or returns `{ authenticated: false }`, `start({ transportType: 'stdio' })` now rejects with `Authentication failed for stdio transport: <reason>`, and the `firecrawl-mcp` command prints `[firecrawl-mcp] Failed to start:` with that error and exits with status 1. Before, the server logged the failure and served every tool without a session. The built-in stdio authentication doesn't fail, so the command is unaffected unless a hook is supplied: a missing `FIRECRAWL_API_KEY` still starts keyless mode, and a key the API rejects is still reported on each tool call.
- `GET /sse` answers an authentication failure with `401` and the same JSON-RPC error body and `WWW-Authenticate` challenge as the Streamable HTTP endpoint. It used to answer `500 Error creating server` when the hook threw an error that wasn't a `Response`, returned nothing or returned `{ authenticated: false }`. A `Response` thrown by the hook is still sent as is.
- The Streamable HTTP endpoint and `GET /sse` check the `Host` header before they call the authentication hook, so a malformed `Host` gets `400` without a credential check, also when the request target is in absolute form. `/sse` didn't check `Host` before. It accepts IPv6 literals in any valid spelling (`[::1]`, `[0:0:0:0:0:0:0:1]:8080`) and host names in any case with a port (`EXAMPLE.COM:8080`), which used to get `400`.
- A server bound to an IPv6 address (`httpStream.host: '::'`) serves `/health`, `/ready` and the protected-resource metadata. They used to fail with `500`.
- `WWW-Authenticate` challenges escape backslashes as well as quotes, and turn line breaks, other control characters and non-ASCII characters into spaces. An error message with a line break used to make the response fail with `500`. The JSON-RPC error message keeps the original text.
- Authentication errors on the HTTP endpoints are logged through the server logger (`[ERROR] <time> [FastMCP error] Authentication error: …`) instead of a bare `console.error`.

### Added

- `firecrawl_search` stamps every result in `data.web`, `data.images` and `data.news` with its `source` and a 1-indexed `position` within that group, keyless responses included. Each group is numbered from 1 on its own, so the pair identifies one result; a field of either name in the API's result is replaced. The `data` description in the output schema says so.
- `firecrawl_search_feedback` takes `valuableResults`, up to 50 `{ source, position, reason? }` entries copied from those stamps, and sends them to the search feedback endpoint as `valuableResults`. Before, a useful news or image result could only be cited by URL, which those results don't always have. The description asks for every useful result and keeps `valuableSources` for useful URLs that weren't among the results; `valuableSources` itself is unchanged.
- `modernProtocol` on `createFirecrawlMcpServer()` in `firecrawl-mcp/server`, default `false`. With it on, the server also serves protocol revision 2026-07-28 over stdio and Streamable HTTP: `server/discover`, per-request client capabilities, multi round-trip requests and MCP Tasks (`io.modelcontextprotocol/tasks`). For a client that declares the tasks extension, `firecrawl_agent` and `firecrawl_crawl` return a task as soon as the API accepts the job; `tasks/get` reads the job and, once it ends, returns the result `firecrawl_agent_status` or a waiting `firecrawl_crawl` would, and `tasks/cancel` cancels the job. Task ids carry the job id, so the server keeps no task state and any instance can answer for any task. Every 2025-era request is served as before. For embedders: `ToolContext.mcp` carries a 2026-07-28 call's declared capabilities and input responses, a tool can return `inputRequired(...)` or its own task, `ExtraToolsContext.addTaskHandler` serves an embedder's tasks, the `taskResult` hook decorates a finished agent or crawl task, `onToolResult` reports `tasks/get:<tool>` and `tasks/cancel:<tool>`, and `acceptedContent`, `inputRequired` and `inputResponse` are re-exported from the SDK.

  The `firecrawl-mcp` command does not turn `modernProtocol` on and has no setting for it, so `npx firecrawl-mcp` over stdio, and its HTTP modes, negotiate the same protocol revisions as 3.35.0 and don't offer MCP Tasks; `firecrawl_agent` and `firecrawl_crawl` behave as before there. Only code that embeds the server through `firecrawl-mcp/server` and passes `modernProtocol: true` gets 2026-07-28.
- `escapeWWWAuthenticateValue` is exported from `firecrawl-mcp/server`.
- `httpStream.allowedHosts` on `start()` in `firecrawl-mcp/server`: the host names the server answers in `Host` and `Origin`, with the behaviour described under Changed. Unset, the server answers every host and CORS allows any origin, as before.

## [3.35.0] - 2026-10-26

### Added

- A tool call that fails because the Firecrawl API refused the request now carries a machine-readable error next to its message when the tool's `outputSchema` declares `success` and `error`: `structuredContent` is `{ success: false, error: { code, status, message, retryAfterSeconds? } }`. Two kinds of failure get it:
  - An error from the Firecrawl SDK with a 4xx or 5xx status. `code` is the code in the API's error response when it is a plain identifier, otherwise the status name; a network code the SDK reports, such as `ECONNRESET` or `ERR_BAD_RESPONSE`, is never used. `retryAfterSeconds` comes from `retryAfterSeconds` or `retry_after_seconds` in the error details the SDK reports, or else from a `retry after <n>s` phrase in the message.
  - A `CoreHttpError`, which the server raises where it calls the API without the SDK, such as the monitor and feedback tools. `code` is always the status name, and `retryAfterSeconds` comes only from a `retry after <n>s` phrase in the message.

  Status names are `invalid_request` (400, 422), `unauthorized` (401), `insufficient_credits` (402), `forbidden` (403), `not_found` (404), `timeout` (408), `conflict` (409), `payload_too_large` (413), `rate_limited` (429), `server_error` (any 5xx) and `http_<status>` for any other 4xx. The text block is unchanged. Refusals the server already turns into a recovery result keep that result, such as an API key the API rejects in an API-key session (`CREDENTIAL_INVALID`) or a keyless limit. Every other error keeps its current result, including network failures with no status, bugs, and errors of other types that a tool added through `unstable_hooks.registerExtraTools` throws, as do errors that already carried structured content and tools whose schema has no `error` field.

### Changed

- The server is built on the official MCP TypeScript SDK (`@modelcontextprotocol/server` 2.3.1) instead of `fastmcp` and `mcp-proxy`. It negotiates the same protocol revisions as before (2025-11-25, 2025-06-18, 2025-03-26, 2024-11-05 and 2024-10-07) over stdio, Streamable HTTP and the legacy HTTP+SSE endpoints. Tool names, input and output schemas, descriptions, server instructions, `serverInfo`, the advertised capabilities, the HTTP routes (`/health`, `/ready`, `/ping`, OAuth protected-resource metadata, the legacy `/sse` and `/messages` endpoints) and the 1 MiB body limit are unchanged. HTTP serving is stateless: no `Mcp-Session-Id` is issued. Streamable HTTP responses differ only in framing: SSE events no longer carry an `id` or an empty priming event, `Cache-Control` is `no-cache, no-transform`, a `202 Accepted` has no `Content-Type`, and a body that is not valid JSON is answered with `Parse error: Invalid JSON` instead of `Parse error: Invalid JSON-RPC message`.
- `start()` with `httpStream.stateless: false` (or `FASTMCP_STATELESS` unset) logs a warning and serves every request statelessly; session-based HTTP serving is no longer available. Stateless serving answers every protocol revision.
- `fastmcp`, `mcp-proxy`, `fuse.js`, `uri-templates` and `undici` are no longer dependencies, and the local `fastmcp` patch is gone.
- The crawl, agent, interact and monitor tools that change state now state `idempotentHint`. `firecrawl_interact_stop`, `firecrawl_monitor_update` and `firecrawl_monitor_delete` are idempotent: repeating a call with the same arguments changes nothing further. `firecrawl_crawl`, `firecrawl_agent`, `firecrawl_interact`, `firecrawl_monitor_create` and `firecrawl_monitor_run` are not: each call starts another job, acts on the page again or creates another record. Clients that retry, replay or resume tool calls can use the hint to decide whether a repeat is safe. Read-only tools and the two feedback tools are unchanged.

### Fixed

- `firecrawl_find_tools` no longer fails when `level` conflicts with the other arguments. With `query`, or a non-empty `expand` alongside any selector, the call is sent at `tools` level whatever `level` says or defaults to, since the catalogue returns tools for both and refused the call otherwise. A non-empty `expand` with no selector still gets the category-index error. With `capabilities` at `providers` or `groups` level and no `expand`, the call sends `expand: []`, because full contracts only exist at tools level. `level` now has a description that says to omit it in most calls and when to set `providers` or `groups`.

## [3.34.1] - 2026-10-22

### Changed

- `mcp-proxy` moves from 6.5.1 to 6.6.0. In the HTTP stream transports (`CLOUD_SERVICE=true`, `HTTP_STREAMABLE_SERVER=true`, or `SSE_LOCAL=true`), the server now accepts request bodies up to 1 MiB and answers a larger one with HTTP 413; it used to read the whole body with no limit. A caller of `start()` can pass `httpStream.maxBodySize` to set a different limit. stdio is unchanged.
- `body-parser` adds pnpm overrides: versions below 1.20.9 resolve to 1.20.9, and 2.x versions below 2.4.0 resolve to 2.4.0.

## [3.34.0] - 2026-10-22

### Added

- `firecrawl_credit_usage` can say what credits were spent on. In the historical view, `byEndpoint: true` splits each period by the endpoint that used the credits (scrape, search, crawl, map, agent, ...), and `bin: "day"` returns one period per UTC day instead of per calendar month. Against an API that does not offer these yet, the tool returns the monthly figures with a `notice` saying so instead of failing. The description now also says what the tool cannot attribute (single jobs, URLs or MCP clients) and where per-call costs appear.
- `firecrawl_gov_search` takes optional Government Index filters: `jurisdiction`, `court`, `courtType`, `cites` and `domain`. They combine, and only the filters a call sets are sent to `/v2/search/gov`, as query parameters with the same names; a call without filters sends the same request as before. `jurisdiction` is trimmed and lowercased and must be `us` or `us-` plus a two-letter code. The description notes that filters keep only pages the index has labeled, so a filtered search can leave out relevant pages. Filtered calls need an API that accepts these parameters. When the API refuses a call with a 400 and a reason, such as an unknown court id, the tool returns that reason instead of a generic request failure; other errors are handled as before. `firecrawl_search` with `categories: ["gov"]` is unchanged and does not take these filters.

### Changed

- The `firecrawl_search` description of `scrapeOptions` says it is opt-in: every web result is then fetched and billed as a scrape, so leave it unset unless the task needs the full text of a few results.
- Server instructions and tool descriptions no longer warn that Alexandria needs an API key on a team with it enabled. Runtime credential and entitlement checks are unchanged, and a provider that requires accepted terms still points the user to the Firecrawl dashboard URL in its response.
- `@modelcontextprotocol/sdk` moves from 1.29.0 to 1.32.1.

### Fixed

- `firecrawl_search` keeps its result under 900,000 bytes, text block and structured content together, for clients whose User-Agent names a platform that refuses tool results above 1 MB. A search with `scrapeOptions` could return several megabytes there and fail outright. When a result is over budget, every result's page content (`markdown`, `html`, `rawHtml`, `summary`, `description`, `links`, `images`) is cut to one shared length, the largest that fits; each cut text ends with a `[Truncated: ...]` line naming the URL to pass to `firecrawl_scrape`, the result gains a `truncated` field, and the response gains a `warning`. If even empty content does not fit, the lowest-ranked results are left out and the warning says how many. A result that already fits is returned unchanged, and every other client gets the same bytes as before.
- The `firecrawl_scrape` sentence about provider discovery says again that it applies to authenticated sessions. Hosted keyless sessions list only `firecrawl_search`, `firecrawl_scrape` and `firecrawl_parse`, so they no longer read an unscoped pointer to `firecrawl_find_tools`.
- A tool error carries `structuredContent` only when it matches the tool's declared `outputSchema`. Clients that validate structured content against that schema, such as those built on the official TypeScript SDK, now show the error message instead of failing with `Structured content does not match the tool's output schema`. The message text is unchanged.
- `firecrawl_gov_search` refuses an argument it does not define, such as `yearFrom` or `court_type`, with a validation error that names it, as `/v2/search/gov` does. It used to drop the argument and run the search without that filter. The advertised input schema is unchanged; it already disallowed additional properties.

## [3.33.4] - 2026-10-19

### Changed

- When use without an account reaches its daily limit, `firecrawl_search`, `firecrawl_scrape` and `firecrawl_parse` tell the agent to finish the task without Firecrawl and end its answer with one line for the user: `You've reached Firecrawl's daily limit without an account. Sign up free for 1,000 credits a month: <signup link>`. That line closes the message; the setup steps before it are unchanged. The previous text called the limit a rate limit and gave the agent no line to pass on. A 429 without a known reason keeps a generic message, since its cause may be transient.
- The default server instructions, for sessions with and without a credential, now open with one sentence: if Firecrawl reports that credits ran out or the daily limit without an account was reached, end the final answer with the line it provides, link included. It comes first so clients that cut server instructions short still keep it; the rest of the instructions are unchanged.
- The `firecrawl_search` description says when to use it: for current information, or to list businesses, people, products, jobs or events with websites, prices or contacts. The sentence pointing to the parameter descriptions is removed to stay inside the 2,048-character description budget. Behavior is unchanged.
- The `firecrawl_scrape` description says when to use it: the user gives a URL or names a page or PDF and wants it read or summarized, or wants prices, specs, contact details or a table from it. Its Alexandria lines state what the `alexandria` argument does and that it needs an API key on a team with Alexandria enabled, instead of reading as access rules. Behavior is unchanged.

## [3.33.3] - 2026-10-19

### Changed

- The `firecrawl` JS SDK dependency moves from 4.49.1 to 4.50.0. That release lets the SDK load in browser bundles and on Node 18 and 20, and makes v2 requests work on Cloudflare Workers; the server uses none of those paths, so it behaves the same on Node. The server still requires Node 22 or later because `mcp-proxy`'s `pipenet` dependency sets that floor; `undici` 7 alone would rule out Node 18.

### Fixed

- `firecrawl_crawl` with a wait keeps polling when a status read is rate limited (429), waiting the `Retry-After` time (seconds or an HTTP date, capped at 60 s) instead of failing, and reads result pages only once the crawl ends.
- `firecrawl_crawl` relays the API's reason, status and code when the API refuses to start a crawl, instead of a generic request error.

## [3.33.2] - 2026-10-19

### Changed

- The `firecrawl` JS SDK dependency moves from 4.49.0 to 4.49.1. That release changes only the SDK's package description, so the server behaves the same; the bump keeps the SDK pin at our latest release.

## [3.33.1] - 2026-10-18

### Changed

- The `firecrawl` JS SDK dependency moves from 4.46.0 to 4.49.0. The SDK now keeps v1-style method calls working on the v2 client with a one-time deprecation warning; the server makes no such calls. A request the server does not stamp with its own origin carries the SDK's wrapper default, `js-sdk.firecrawl-mcp@<version>` when installed from npm, in place of `js-sdk@<version>`.
- `firecrawl_search` reads an `includeDomains` or `excludeDomains` entry given as a URL that names only a host, such as `https://docs.firecrawl.dev/`, as that host. A URL with a path, query, fragment, port or credentials is still refused, since it would change the filter.
- Tool arguments are normalized before validation, on every tool and surface. An optional parameter sent as `null` is treated as absent. A numeric string in a number parameter, such as `limit: "5"`, is read as a number and checked against the same bounds. A format or parser object the API accepts is read as the tool's own form: `{type: "markdown"}` as `"markdown"`, and `{type: "json", prompt, schema}`, `{type: "query", ...}`, `{type: "screenshot", ...}` or `{type: "pdf", maxPages}` as the format or parser plus its options field, when that field is not also set and the object carries only options that field declares.
- `firecrawl_search` refuses `developer` or `gov` combined with another category before calling the API, with the API's reason instead of `Invalid request body`.

### Unchanged

- Tool definitions, descriptions and input schemas. Required parameters sent as `null`, out-of-range numbers, unknown formats and domain filters given as URLs with a path are still refused.

## [3.33.0] - 2026-10-18

### Added

- A session's OAuth client id (`session.oauthClientId`) can name the integration. When the id is a metadata URL and the User-Agent names only an HTTP runtime or is missing, the origin uses the URL host as `mcp-oauth-<host>`, after a carried initialize name and before the `Origin` or `Referer` host. Shared static hosts (`github.io`, `gitlab.io`, `pages.dev`, `netlify.app`, `vercel.app`) add the first path segment. Firecrawl's own hosts name nothing. For an id that is not a URL, such as a dynamically registered client, `session.oauthClientName` (the registered client name) stamps `mcp-oauth-<name>` in the same position; SDK default names such as `mcp` are skipped.

### Unchanged

- Every origin a request stamped before keeps its value unless its User-Agent is a runtime or missing and the session carries an OAuth client id that names a product.

## [3.32.0] - 2026-10-18

### Added

- `FIRECRAWL_INTEGRATION` sets the `integration` field on the API requests that accept it: scrape, batch scrape, crawl, map, search, extract, agent, parse, interact and feedback. Apps that launch the server, such as editor extensions, use it to tag their traffic, for example `FIRECRAWL_INTEGRATION=_zed`. Requests that already carry an `integration` keep it, and other endpoints, such as monitors, are unchanged. Unset or blank sends no field, as before.

## [3.31.1] - 2026-10-18

### Changed

- The `firecrawl` JS SDK dependency moves from 4.42.0 to 4.46.0.

## [3.31.0] - 2026-10-18

### Added

- The request origin can be named by the connection. An `X-Firecrawl-Origin` header stamps `mcp-<name>` ahead of every other signal.
- When the User-Agent names only an HTTP runtime (`node`, `undici`, `python-httpx`, `Go-http-client` and similar) or is missing, the origin uses, in order, a client name an embedder recovered from an earlier `initialize` (`session.initializeClient`, stamped `mcp-<client>`), then the `Origin` or `Referer` host (`mcp-ref-<host>`), before falling back to `mcp-ua-<runtime>` as before. SDK default names such as `mcp` and local or IP-address hosts are skipped.
- `firecrawl-mcp/server` exports `isRuntimeUserAgent`, `initializeClientSlug` and `DECLARED_ORIGIN_HEADER`.

### Unchanged

- Every origin a request stamped before keeps its value unless the request sends `X-Firecrawl-Origin`, or its User-Agent is a runtime and it carries one of the new signals.

## [3.30.3] - 2026-10-16

### Changed

- Authenticated `firecrawl_search` always includes Alexandria. When `sources` is omitted it sends `["web", "alexandria"]` as before; when the caller passes sources without `alexandria`, such as `["web"]` or `["news"]`, `alexandria` is added and the requested sources are kept. `["alexandria"]` alone is unchanged. Keyless sessions, sessions without a credential, and `enterprise` searches with `zdr` or `anon` are unchanged, because the API refuses provider discovery there. If the API refuses discovery the caller did not ask for, the search retries on the requested sources alone.
- Search tool descriptions and instructions describe the always-on behaviour in place of the `sources: ["web"]` opt-out.

## [3.30.2] - 2026-10-15

### Fixed

- `firecrawl_search` relays the API's error message for every search. Searches with explicit sources that excluded `alexandria` (for example `["web"]`) previously surfaced only `Request failed with status code 402`, dropping the out-of-credits message and upgrade link. The fallback for an error without a message now reads `Firecrawl request failed (HTTP N)`.

## [3.30.1] - 2026-10-14

### Added

- `firecrawl_find_tools` accepts `includeCosts`. When it is `true`, tool results carry per-capability credit prices as before, and `nextTool` arguments keep the flag. The server handles it locally and does not send it upstream.

### Changed

- Alexandria output omits per-capability credit prices by default. `creditsCost`, `perRecord`, `billing`, `recordsPerUnit` and `zeroDataRetentionCreditsCost` are dropped from `firecrawl_find_tools` items and related tools, from `data.tools` in `firecrawl_search` and URL-mode `firecrawl_scrape`, and from each Alexandria result entry. Execution request totals such as `data.creditsCost` are unchanged; the free `firecrawl_find_tools` response omits its zero total.
- Hosted instructions say Alexandria execution is billed per capability, replacing "billed at the capability's listed price".

## [3.30.0] - 2026-10-14

### Added

- `firecrawl-mcp/server` (unstable): `unstable_hooks.registerResources(registrar)` lets an embedder register MCP resources after the built-in tools. Resource definitions take a `uri`, `name`, optional `description` and `mimeType`, and a `load(session)` that returns one or more text or blob contents, each with optional `uri`, `mimeType` and `_meta` overrides. The `ResourceDefinition`, `ResourceContent` and `ResourceRegistrar` types are exported.
- Tool definitions passed to `registerExtraTools` accept `icons` (`src`, optional `mimeType`, `sizes`, `theme`), which `tools/list` now sends. Built-in tools, resources and local stdio behaviour are unchanged.

### Removed

- The server no longer sends `X-Firecrawl-Agent-Hints: true` on its Firecrawl API requests and no longer relays the API's optional `agent_hints` field. `agent_hints` is removed from every tool's output schema, structured content and error payloads, and `ToolCallEvent` (passed to `onToolResult`) no longer has `agentHints`. The API no longer sends this field, so tool results are otherwise unchanged.
- `firecrawl_search` no longer advertises or forwards the optional `objective` and `clientModel` inputs, on both the full and the search-only surface. Clients that still send them keep working: the values are ignored and not sent to `/v2/search`. `firecrawl_feedback` keeps its `objective` field.

### Changed

- The README's `CLOUD_SERVICE=true` and search-only sections are shortened into one section. Behaviour is unchanged.

## [3.29.1] - 2026-10-09

### Added

- Scrape formats accept `images` for page image URLs, including the shared scrape options used by search, crawl, and browser interaction. Other formats are unchanged.

### Removed

- Hosted mode (`CLOUD_SERVICE=true`) no longer writes per-call `[MCP_ACTION]` and `[MCP_AGENT_HINTS]` log lines or posts action-log records (`FIRECRAWL_MCP_ACTION_LOG_URL`, `FIRECRAWL_MCP_ACTION_LOG_SECRET`). These modules are now maintained with the hosted deployment. The `onToolResult` hook is unchanged, so embedders can still observe tool calls.
- The `/.well-known/openai-apps-challenge` route (`OPENAI_APPS_CHALLENGE_TOKEN`) is removed in every HTTP mode. Hosted `/ready` no longer checks deployment configuration: the primary HTTP listener's `/ready` now returns `{"ok":true}` in every mode, as it already did for self-hosted HTTP. The hosted search instance keeps FastMCP's own `/ready` response.
- Hosted keyless admission is removed. With `CLOUD_SERVICE=true`, an HTTP request without a credential is now rejected with 401 like any other missing credential, instead of being admitted as a rate-limited keyless session; `KEYLESS_PROXY_SECRET` is no longer read and client IPs are no longer forwarded. A request with an invalid credential on the full endpoint is still admitted and every tool call returns the `CREDENTIAL_INVALID` recovery payload. The search-only and account profiles never admitted keyless sessions and are unchanged. Local keyless stdio (no `FIRECRAWL_API_KEY` and no `FIRECRAWL_API_URL`) is unchanged.
- The service image files `docker/nginx.conf` and `docker/entrypoint.sh` are removed, along with the internal marker header and log line for their credential-in-path route (`X-Firecrawl-Key-Transport`, `[MCP_LEGACY_KEY_PATH]`). The standard `Dockerfile` image is unchanged.

### Changed

- `CLOUD_SERVICE=true` is documented as a hardened HTTP preset: streamable HTTP bound to `0.0.0.0`, a credential required on every request, safe mode, and upload-only file access. The account and search-only surfaces selected by `FASTMCP_ENDPOINT` are unchanged, and `npm run start:cloud` still starts the preset.

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
