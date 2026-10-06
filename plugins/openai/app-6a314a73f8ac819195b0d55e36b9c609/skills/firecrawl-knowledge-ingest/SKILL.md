---
name: firecrawl-knowledge-ingest
description: Extract articles and section metadata from a docs portal or help center, including JavaScript navigation and pagination when supported. Return structured JSON or Markdown with extraction progress and failed pages.
license: ISC
---

# Firecrawl Knowledge Ingest

Collect a specified docs portal when navigation, pagination, rendering, or authorized access needs special handling. Infer portal URL, format, access needs, and page limit; ask at most 1–3 concise questions only if blocked. This produces an article corpus, not a generic company-information dataset.

## MCP collection

Use the named Firecrawl MCP tools, resolving deferred tools through the host's tool search.

Set the portal sections, article/page cap and credit ceiling before ingestion.
Web searches are billed per request; URL scraping is billed per URL.
Provider-only discovery is free; execution uses the selected capability’s price.

## Alexandria and live collection decisions

1. For repeated articles, use compact `firecrawl_find_tools` discovery for a direct article/export contract covering the exact portal, section, format, and authorized scope. Expand the best one or two candidates with `expand: ["options", "response"]`. Require article bodies, section membership, source URLs, and relevant metadata, not just document titles or generic entity metadata. Alexandria does not inherently have access to private portals.
2. Execute a fitting contract with returned identifiers and declared options. Use its actual article pagination/filter contract, not catalogue `nextTool` as article pagination. Stop at the page cap or exhausted/empty/repeated cursor. Retain article IDs and provenance. If full article content and requested metadata suffice, do not re-fetch them merely to duplicate results; verify missing formatting, sections, or freshness on authoritative portal pages. If no contract fits after one refinement, use source collection.
3. For public URLs, use `firecrawl_map` as a navigation supplement only if exposed, and `firecrawl_scrape` for article Markdown. When mapping is unavailable, enumerate supported links from supplied portal pages or use scoped `firecrawl_search`; disclose incomplete discovery. If exposed and required, use `firecrawl_interact` to inspect categories, sidebars, article links, next links, load-more controls, or portal search. Collect only the agreed sections; navigation enumeration is not article extraction. Reuse returned `scrapeId` for interaction continuation, inspect each result, and close with `firecrawl_interact_stop` unless retention is requested. Open portal navigation with `url`, then continue with the returned `scrapeId`; interaction `timeout` uses seconds, and `scrapeOptions` applies only with `url`.
4. For a restricted portal, use the provided authorized remote session/profile. If it cannot open the required articles, use an authorized export or collect the public subset and report the missing sections.
5. Track discovered and extracted URLs, unique articles per section, pagination progress, failed/restricted pages, and reasons. Preserve code, tables, and formatting while removing navigation chrome, headers, and footers. Extract visible title, section, author, last-updated date, and tags; leave absent metadata unknown. Acquisition time is not an article update date. Deduplicate canonical article IDs/URLs without discarding distinct versions.

For a fitting contract returning articles from the specified portal and section, inspect only selected identifiers
with `expand: ["options", "response"]`: required inputs, `requiresOneOf`,
`response.key`, declared pagination, freshness, price and external effects.
Alexandria is not a page cache; catalogue `nextTool` pages contracts, not records.
Execute exact returned provider/capability/options through `firecrawl_scrape`
with `alexandria: {provider, capability, options}` or an array of 1–10 calls;
a returned `version` can pin the workflow.
Only payload-bound `requestId` and millisecond `timeout` accompany execution,
not URL formats or `maxAge`. Inspect every item in `data.alexandria` despite outer
success, keeping successful records and reporting item errors/empty/partial data.
Page only as declared, with unchanged filters and bounded pages/records/credits.

For uncertain retries preserve the identical ID and payload with bounded attempts;
changed inputs need a new ID. Do not re-charge in-flight requests or successful
items. Execution needs a connected account on an enabled team; stop on access,
terms or budget restrictions. Terms require an organization admin outside this
workflow; do not accept terms through a capability. Do not retry unresolved
restrictions. After an organization admin confirms acceptance, resume the requested
retrieval with the identical payload and `requestId`, only if access and budget
still permit.
Use URL-mode `maxAge: 0` for requested fresh captures.
Keep provider/capability/version, record IDs, URLs and retrieval/as-of times
with the output; disclose unknown freshness and use authorized live search/page
retrieval for missing or freshness-critical facts, or report gaps. For large
results, use supported artifact handoffs; retention may expire or be unavailable.
Report retention failures and do not silently rerun paid work.

## Small argument examples

These are arguments, not a claim of provider coverage. `firecrawl_find_tools` discovery:

```json
{"name":"firecrawl_find_tools","arguments":{"query":"Help center article export with full content, section membership, canonical URLs and updated dates","limit":3,"expand":[]}}
```

For a permitted article, replace the illustrative URL in this `firecrawl_scrape` call:

```json
{"name":"firecrawl_scrape","arguments":{"url":"https://example.com/help/article","formats":["markdown"],"onlyMainContent":true}}
```

If exposed, a small navigation-only `firecrawl_interact` call can start at the user's portal:

```json
{"name":"firecrawl_interact","arguments":{"url":"https://example.com/help","prompt":"Inspect the visible sections and article links. Return their titles and URLs without submitting forms or changing account settings.","timeout":30}}
```

## Deliverable

For JSON, use `source`, `url`, `extractedAt`, `totalArticles`, and `sections[]`. Each section contains its name and articles with `title`, `url`, `section`, `content`, and `metadata`. Include actual source update dates and provenance when available; report the unique extracted count rather than an unverified portal total. Return JSON, individual Markdown articles, or merged Markdown with article boundaries and source URLs. Use inline content if the host cannot save artifacts.

```markdown
# Knowledge Ingest: [Portal]
## Summary
[Extracted pages, covered sections, scope and limitations]
## Output
[Accessible artifacts or actual inline JSON/Markdown/merged content]
## Sections
[Section names and unique article counts]
## Failed Or Restricted Pages
[URLs, access/loading errors and incomplete pagination]
## Sources
[Extracted article URLs and provider provenance]
## Rerun Inputs
workflow: firecrawl-knowledge-ingest
url: [portal URL]
format: [json/markdown/merged]
max_pages: [number]
```

<!--
ISC License

Copyright (c) 2026 Firecrawl

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
-->
