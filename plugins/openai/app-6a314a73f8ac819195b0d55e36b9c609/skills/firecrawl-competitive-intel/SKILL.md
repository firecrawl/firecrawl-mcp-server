---
name: firecrawl-competitive-intel
description: Produce a competitor pricing, feature, and release-change brief with a source-backed baseline and comparison matrix. Use for competitive alerts or repeat checks, not broad market analysis.
license: ISC
---

# Firecrawl Competitive Intel

Track specified competitors over time, rather than perform broad competitor or market analysis. Infer competitors, focus, cadence, and output format; ask for clarification only if blocked. A cadence in a rerun block does not create a schedule.

## MCP collection

Use the existing Firecrawl connection, resolve deferred tools and follow the live schema. Start with supplied competitor URLs and reusable dated baselines. Otherwise use `firecrawl_search` for the missing pricing, feature or release evidence and inspect matching structured suggestions. When exposed, set `objective` to `[competitive-intel]` plus the broader comparison goal consistently across related searches; keep `query` specific and untagged. Omit unsupported `objective` and avoid sensitive information in the goal.

Respect user-specified source/tool choices, provider opt-outs, comparison periods and time/page/result/credit limits and returned account restrictions; do not impose default budgets, source quotas or minimum calls. Stop when the requested comparison/change claims are supported or limits prevent progress. Report material spend from returned receipts rather than catalogue prices, count nested/aggregate charges once, replace cumulative totals on polls, exclude account-wide counters, and mark missing usage unknown.

## Alexandria and live collection decisions

1. Choose the next hop for the missing fact that could change the brief, inspect it, then update the comparison. Reuse complete fitting pricing/release contracts; expand missing selected contracts through `firecrawl_find_tools` or use targeted discovery if structured gaps lack a suggestion. Require the named competitors, billing periods, limits, dates and source coverage to match. Follow selected `nextTool.arguments` preserving selectors, expand options/response when supported, and do not treat a combined catalogue ID as an execution selector.
2. Reuse sufficiently current matching evidence; close consequential current-price gaps on official pages with `firecrawl_scrape`, using supported `maxAge: 0` for requested fresh captures. Record currency, region, monthly versus annual billing, per-seat/unit basis, plan limits, discounts, taxes, and contact-sales or gated details where visible. Align these bases before calculating changes. Unknown freshness remains unknown; retrieval time is not an effective date. Search-with-scrape or a fresh fetch alone does not establish a current price.
3. Use official feature/product pages, changelogs, blogs, release notes, and docs for missing fields and live changes. Provider release records can locate releases; they cannot prove a current UI control or feature behavior. If available and needed, use `firecrawl_interact` to inspect billing toggles or expanded tables, then stop the session with `firecrawl_interact_stop` and its returned `scrapeId`. Inspect private competitor views only through a provided authorized remote session/profile; when opening with a saved profile, set `scrapeOptions.profile.saveChanges: false` unless profile writeback was requested. For billing-toggle inspection, start with `url` and continue with the returned `scrapeId`; interaction `timeout` is in seconds, and `scrapeOptions` applies only with `url`.
4. Preserve a dated evidence baseline: source URL, competitor/plan identity, observed value, acquisition time, source/as-of date when supplied, and provider/version/request provenance. Compare only against an available prior baseline on the same basis. Distinguish an observed change from newly discovered information; without an earlier comparable value, label it a current snapshot, not a price increase or launch. Separate publication, capture and release dates; endpoint snapshots do not establish continuous stability. Retain conflicts and limitations, and do not count syndicated releases as independent corroboration.

For relevant PDF release reports or product documents, including extensionless URLs, use supported `parsers: ["pdf"]` and choose `pdfOptions.maxPages` for needed evidence and any user limit. Keep page locators and truncated-document limitations; rereads may charge the requested pages again.

For selected contracts, inspect required inputs, `requiresOneOf`, `response.key`, pagination, freshness, price and effects. Execute returned provider/capability/options through `firecrawl_scrape` Alexandria mode, batching independent competitor records or pinning returned versions only as the live schema permits. Keep payload-bound `requestId` and millisecond `timeout` separate from URL formats/`maxAge`. Catalogue paging returns contracts, not release history. Inspect every `data.alexandria` item, retain successes and use documented item-specific continuation for failures; never replay successful batch items to recover others. Preserve competitor/plan IDs, filters and checkpoints across bulk comparisons.

For uncertain retries retain identical request ID/payload; changed inputs need a new ID and in-flight requests must not be duplicated. Stop unresolved access, terms or budget routes while preserving usable baselines and continuing permitted evidence routes. Terms recovery requires an organization admin outside the workflow; resume retained requests after confirmation only if contract, access and user budget permit. Inspect supported retained results before another execution; disclose expired/unavailable retention and do not silently rerun paid work.

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

Return real plan names, limits, dates, a pricing table, feature matrix, recent changes, and confidence/coverage notes. Attach meaningful claims and comparison cells to the source field/passage and date; label inference. Do not guess gated information. For structured output, include `generatedAt`, `competitors`, `pricing`, `recentChanges`, `features`, and `sources`, preserving baseline evidence and provider/capability/version/request/record provenance separately. Keep supplied competitor-row identities, duplicates and unresolved matches when a row-based output is requested. Report partial coverage and stop reason. Use the host's CSV writer when available or correctly quoted inline CSV/Markdown/JSON otherwise. If the host and account support Intelligent UI, an interactive pricing/feature comparison may clarify the brief without replacing the requested export or citations.

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
