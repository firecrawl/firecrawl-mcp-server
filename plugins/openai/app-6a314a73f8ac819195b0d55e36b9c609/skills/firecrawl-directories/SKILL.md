---
name: firecrawl-directories
description: Export a filtered company list from a named directory such as YC, Product Hunt, G2, or a supplied directory URL into CSV, JSON, or a research table. Not generic company enrichment.
license: ISC
---

# Firecrawl Company Directories

Turn a specified startup or company directory into a structured list. Infer the directory, filters, result cap, and format from context; ask at most 1–3 concise questions only when blocked. Do not silently replace the named directory with a generic company database.

## MCP collection

Use the named Firecrawl MCP tools, resolving deferred tools through the host's tool search.

Set the directory export’s result count, page limit and credit ceiling.
URL scraping is billed per URL.
Provider-only discovery is free; execution uses the selected capability’s price.

## Alexandria and live collection decisions

1. For repeated listing fields, use `firecrawl_find_tools` for a contract tied to the requested directory. Check that its source, listing membership, supported filters, and profile links actually match the request. A company enrichment contract is not a directory export. If the fit is absent after a compact discovery pass and one targeted refinement, use the directory's pages instead.
2. Expand only the best one or two contracts with `expand: ["options", "response"]`. Execute through `firecrawl_scrape` with the exact returned provider/capability identifiers and contract-defined options. Apply only supported filters; if filtering returned rows yourself, disclose the examined population and that upstream collection was not filtered. Preserve the directory profile URL and any record/source identifiers.
3. Use `firecrawl_map`, if exposed, to locate public static listings and `firecrawl_scrape` for their content. If exposed, `firecrawl_interact` can inspect filters, next links, infinite scroll, or profiles. Track listing pages/cursors, applied filters, unique count, and failures; stop at the requested cap, exhausted pagination, or repeated/empty cursors. Catalogue pagination is not directory pagination. Close an interaction with `firecrawl_interact_stop` using its returned `scrapeId` unless the user wants it retained. Start the interaction with `url` and continue with its returned `scrapeId`; do not supply both. Interaction `timeout` uses seconds, and `scrapeOptions` applies only with `url`.
4. Collect only missing listing/profile fields needed for the export. Do not scrape again merely to duplicate complete provider records. Verify directory membership or freshness from the named source when it matters; an undated provider record does not establish current membership. Report restricted pages and request-handling or rate-limit failures without attempting unauthorized access.

For a fitting contract returning listings from the named directory, inspect only selected identifiers
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

These illustrate tool arguments, not retrieved results. Substitute the user's source and criteria. This `firecrawl_find_tools` discovery does not claim a YC capability exists:

```json
{"name":"firecrawl_find_tools","arguments":{"query":"YC company directory listings with batch and location filters and profile URLs","limit":3,"expand":[]}}
```

Use returned identifiers for contract expansion and execution, never the query text as a capability ID. For visible fields on one permitted directory page, `firecrawl_scrape` accepts:

```json
{"name":"firecrawl_scrape","arguments":{"url":"https://example.com/companies","formats":["json"],"onlyMainContent":true,"jsonOptions":{"prompt":"Extract only visible company listings into companies with name, profileUrl, websiteUrl, description and tags. Leave unavailable fields blank."}}}
```

## Export and quality bar

Capture visible `name`, `url`, `description`, `industry`, `stage`, `founded`, `location`, `teamSize`, `funding`, `tags`, `profileUrl`, and `websiteUrl`. Define `url` as the source listing/profile URL; keep `websiteUrl` separate. Leave unavailable fields blank; do not infer funding, stage, or contacts. Deduplicate by directory ID and canonical domain/profile URL without merging distinct entities or discarding conflicting values.

For JSON, use `source`, `filters`, `extractedAt`, `totalResults`, and `companies[]` with those fields. `totalResults` is the exported unique count, not an unsupported claim about the full directory. Keep per-row provenance and missing-field notes in accompanying metadata when needed. Return inline Markdown, CSV, or JSON if the host cannot save an artifact.

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
