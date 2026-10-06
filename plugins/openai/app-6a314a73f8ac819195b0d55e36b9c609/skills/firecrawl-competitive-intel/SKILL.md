---
name: firecrawl-competitive-intel
description: Produce a competitor pricing, feature, and release-change brief with a source-backed baseline and comparison matrix. Use for competitive alerts or repeat checks, not broad market analysis.
license: ISC
---

# Firecrawl Competitive Intel

Track specified competitors over time, rather than perform broad competitor or market analysis. Infer competitors, focus, cadence, and output format; ask at most 1–3 concise questions only if blocked. A cadence in a rerun block does not create a schedule.

## MCP collection

Use the named Firecrawl MCP tools, resolving deferred tools through the host's tool search.

Bound the competitor pages, comparison periods and credits for this check.
URL scraping is billed per URL.
Provider-only discovery is free; execution uses the selected capability’s price.

## Alexandria and live collection decisions

1. For repeated pricing tiers or release records, use compact `firecrawl_find_tools` discovery for the named competitors and required billing periods, limits, dates, and sources. Select only contracts whose coverage and timestamps support those fields; expand the best one or two with `expand: ["options", "response"]`. Execute using returned identifiers and declared options, not guessed provider names. Stop discovery after one targeted refinement if no fit exists.
2. Use sufficient matching records as a baseline, but verify consequential current prices on official pricing pages with `firecrawl_scrape` and `maxAge: 0`. Record currency, region, monthly versus annual billing, per-seat/unit basis, plan limits, discounts, taxes, and contact-sales or gated details where visible. Unknown data freshness must remain unknown; retrieval time is not an effective date. Search-with-scrape does not establish a live price.
3. Use official feature/product pages, changelogs, blogs, release notes, and docs for missing fields and live changes. Provider release records can locate releases; they cannot prove a current UI control or feature behavior. If available and needed, use `firecrawl_interact` to inspect billing toggles or expanded tables, then stop the session with `firecrawl_interact_stop` and its returned `scrapeId`. Inspect private competitor views only through a provided authorized remote session/profile. For billing-toggle inspection, start with `url` and continue with the returned `scrapeId`; interaction `timeout` is in seconds, and `scrapeOptions` applies only with `url`.
4. Preserve a dated evidence baseline: source URL, competitor, observed value, acquisition time, source/as-of date when supplied, and provider/version/request provenance. Compare only against an available prior baseline. Distinguish an observed change from newly discovered information; without an earlier comparable value, label it a current snapshot, not a price increase or launch. Retain conflicts and limitations.

For a fitting contract returning competitor pricing or release records, inspect only selected identifiers
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

Examples are tool arguments only. `firecrawl_find_tools` can seek a contract without claiming a particular provider exists:

```json
{"name":"firecrawl_find_tools","arguments":{"query":"Official competitor pricing tiers and release notes with source URLs and effective dates","limit":3,"expand":[]}}
```

Replace this illustrative URL with the competitor's official pricing URL for a live `firecrawl_scrape`:

```json
{"name":"firecrawl_scrape","arguments":{"url":"https://example.com/pricing","formats":["markdown"],"onlyMainContent":true,"maxAge":0}}
```

## Recurring checks

Default to a one-off report. Only if the user explicitly requests scheduling and the host exposes the necessary monitor tools, inspect `firecrawl_monitor_list`/`firecrawl_monitor_get`, then create or update the authorized target with `firecrawl_monitor_create`/`firecrawl_monitor_update` using live schemas. Preserve unrelated configuration and use only authorized notification destinations. For an explicitly requested immediate run, use `firecrawl_monitor_run`; read actual results through `firecrawl_monitor_checks` and `firecrawl_monitor_check` before claiming a change. Check existing monitors before creating one. If unavailable, return a rerun specification and disclose that no schedule was installed.

## Deliverable

Return real plan names, limits, dates, a pricing table, feature matrix, recent changes, and confidence/coverage notes. Do not guess gated information. For structured output, include `generatedAt`, `competitors`, `pricing`, `recentChanges`, `features`, and `sources`, preserving baseline evidence separately. Return inline Markdown/JSON/CSV if artifacts cannot be saved.

```markdown
# Competitive Intel: [Competitors]
## Alerts
[Verified changes, or current snapshot if no baseline exists]
## Per-Competitor Breakdown
[Pricing tiers, feature inventory, recent changes and evidence dates]
## Cross-Competitor Comparison
[Pricing table, feature matrix, differentiators and gaps]
## Suggested Follow-Ups
[Specific sources or unknowns to check next]
## Sources
[URLs and provider provenance actually used]
## Rerun Inputs
workflow: firecrawl-competitive-intel
competitors: [list]
focus: [all/pricing/features/changelog]
cadence: [one-off/weekly/monthly; state whether installed]
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
