---
name: firecrawl-directories
description: Export a filtered company list from a named directory such as YC, Product Hunt, G2, or a supplied directory URL into CSV, JSON, or a research table. Not generic company enrichment.
license: ISC
---

# Firecrawl Company Directories

Turn a specified startup or company directory into a structured list. Infer the directory, filters, result cap, and format from context; ask for clarification only when blocked. Do not silently replace the named directory with a generic company database.

## MCP collection

Use the existing Firecrawl connection, resolve deferred tools and follow the live schema. Start from supplied directory URLs, listings or reusable evidence. Otherwise use `firecrawl_search` for the named source and filters, inspecting matching structured suggestions alongside page results. When search exposes `objective`, use `[directories]` followed by the export goal consistently across searches; keep each `query` focused on the missing listing evidence without the tag. Omit unsupported `objective` and avoid sensitive information in the goal.

Respect requested source/tool choices, provider opt-outs, result/page/time/credit limits and returned account restrictions; do not impose default budgets, source quotas or minimum calls. Stop when the requested rows and fields are supported, the directory inventory is exhausted, or limits prevent progress. When reporting spend, use returned receipts, not catalogue prices: count nested/aggregate charges once, replace cumulative totals rather than adding every poll, exclude account-wide counters, and mark missing usage unknown.

## Alexandria and live collection decisions

1. Choose the next retrieval from the highest-impact missing listing or field, inspect it, then update coverage. Reuse complete matching contracts from search or earlier evidence. Use `firecrawl_find_tools` only for missing selected contracts or targeted discovery when repeated fields need a directory-specific route. Check source, membership, supported filters and profile links; generic company enrichment is not a named-directory export. If a route does not fit, use the directory's pages rather than walking unrelated catalogue entries.
2. Follow selected `nextTool.arguments`, preserving selectors, and expand options/response when supported, commonly `expand: ["options", "response"]`. A combined catalogue ID may not be an execution selector. Inspect required inputs, `requiresOneOf`, `response.key`, record pagination, freshness, price and effects before execution. Apply only supported filters; if filtering returned rows yourself, disclose the examined population and that upstream collection was not filtered. Preserve profile URLs and source/record identifiers.
3. Use `firecrawl_map`, if exposed, to locate public static listings and `firecrawl_scrape` for their content. If exposed, `firecrawl_interact` can inspect filters, next links, infinite scroll, or profiles. Track listing pages/cursors, applied filters, unique count, and failures; stop that paging route at the requested cap, exhausted pagination, or repeated/empty cursors, then assess remaining field gaps. Catalogue pagination is not directory pagination. Close an interaction with `firecrawl_interact_stop` using its returned `scrapeId` unless the user wants it retained. Start the interaction with `url` and continue with its returned `scrapeId`; do not supply both. Interaction `timeout` uses seconds, and `scrapeOptions` applies only with `url`.
4. Collect only missing listing/profile fields needed for the export. Do not scrape again merely to duplicate complete provider records. Verify directory membership or freshness from the named source when it matters; an undated provider record does not establish current membership. Report restricted pages and request-handling or rate-limit failures without attempting unauthorized access.

Execute returned provider/capability/options through `firecrawl_scrape` Alexandria mode; batch listings/profile requests and pin returned versions only as the live schema permits. Keep payload-bound `requestId` and millisecond `timeout` separate from URL formats/`maxAge`. Catalogue pagination yields contracts, not company rows. Inspect every `data.alexandria` item and its declared response path; preserve successful listings, empty results and item errors. Continue failed items only through documented item-specific routes, not by replaying successful items. Retain IDs, filters, paging state and checkpoints for bulk exports.

For uncertain retries preserve the identical request ID and payload; changed inputs need a new ID. Do not duplicate in-flight requests. Stop unresolved access, terms or budget routes while retaining successes and continuing permitted source routes. Terms require an organization admin outside this workflow; resume retained requests after confirmed acceptance only when contract, access and user budget permit. Inspect supported large-result handoffs before another execution; report expired/unavailable retention rather than silently rerunning paid work. Use supported URL-mode `maxAge: 0` for requested fresh membership captures, distinguishing requested freshness from returned cache evidence.

## Small argument examples

These illustrate tool arguments, not retrieved results. Substitute the user's source and criteria. This `firecrawl_find_tools` discovery does not claim a YC capability exists:

```json
{"name":"firecrawl_find_tools","arguments":{"query":"YC company directory listings with batch and location filters and profile URLs","limit":3,"expand":[]}}
```

Use returned identifiers for contract expansion and execution, never the query text as a capability ID. For visible fields on one permitted directory page, `firecrawl_scrape` accepts:

```json
{"name":"firecrawl_scrape","arguments":{"url":"https://example.com/companies","formats":["json"],"onlyMainContent":true,"jsonOptions":{"prompt":"Extract only visible company listings into companies with name, profileUrl, websiteUrl, description and tags. Leave unavailable fields blank."}}}
```

## Export and quality bar

Capture visible `name`, `url`, `description`, `industry`, `stage`, `founded`, `location`, `teamSize`, `funding`, `tags`, `profileUrl`, and `websiteUrl`. Define `url` as the source listing/profile URL; keep `websiteUrl` separate. Leave unavailable fields blank/null; do not infer funding, stage, or contacts. For discovered lists, deduplicate by directory ID and canonical domain/profile URL without merging distinct entities or discarding conflicting values. For supplied rows, preserve every original row/identity, including duplicates and unmatched entries, with row errors instead of silently dropping them. Keep parent/subsidiary and shared-name entities distinct.

For JSON, use `source`, `filters`, `extractedAt`, `totalResults`, and `companies[]` with those fields. `totalResults` is the exported row count; report unique entity count separately when supplied duplicates are preserved. Neither proves directory completeness. Attach field/row source URLs, provider/capability/version/request and record IDs, source dates, retrieval time, criteria and gaps. Align funding currencies and dated headcounts before comparisons; unknown freshness remains unknown. Use the host's CSV writer when available; otherwise return correctly quoted CSV, Markdown or JSON inline, with actual counts, partial coverage and stop reason.

```markdown
# Company Directory Export: [Source]
## Summary
[Applied filters, exported count, pagination coverage, freshness and limitations]
## Companies
[Table or accessible CSV/JSON artifact]
## Sources
[Directory pages/profiles and provider provenance actually used]
## Rerun Inputs
workflow: firecrawl-directories
directory: [source]
filters: [criteria]
max_results: [number]
output: [json/csv/markdown]
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
