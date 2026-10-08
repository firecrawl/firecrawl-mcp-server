---
name: firecrawl-market-research
description: Produce sourced market and financial research with company profiles, period-and-unit-aware metric comparisons, industry trends, forecasts, and risks. Use for public-company data, earnings, financial comparisons, and market reports; distinguish observations from estimates and do not provide financial advice.
license: ISC
---

# Firecrawl Market Research

Create a sourced market/financial report or structured dataset, not investment advice.

Use the existing Firecrawl connection, resolving deferred tools through the host's tool search and following live schemas. Start from supplied filings, report URLs, input rows or reusable observations before discovery.

Respect user-specified periods, counts, time, credit and source limits and returned account restrictions; do not impose default budgets, source quotas or minimum calls. Web searches are billed per request; provider-only discovery is free; URL/PDF retrieval uses URL/page pricing and provider execution uses listed capability pricing. Track structured or parsed JSON receipts including nested totals, not catalogue estimates: count aggregates and included child charges once, replace cumulative totals rather than adding polls, and exclude account-wide counters. Missing usage is unknown, not zero; stop a costly route if the user's limit cannot be respected.

## Scope

Infer market or companies, required data points, timeframe, geography, and output format. If clear, proceed. Ask for clarification only if blocked. Distinguish market size, company financials, trading metrics, and forecasts; these require different evidence. Resolve company identity by domain, ticker/exchange, or returned canonical ID as appropriate, without assuming identifier fields exist in a provider contract.

## Collection decisions

1. Define the requested metric matrix: entity, metric definition, denominator/accounting basis, period, frequency, currency/unit, geography, observed versus estimated value, and required as-of date. Mark annual, quarterly, trailing or point-in-time comparisons. Preserve parent/subsidiary and market-segment distinctions. When annotating supplied entities, preserve every original input row, including duplicates and unmatched rows, with nulls, field-level sources and row errors.
2. Read supplied sources or reuse supporting observations first. Otherwise use normal `firecrawl_search` for the missing financial evidence and inspect matching suggestions. Reuse complete contracts; use targeted `firecrawl_find_tools` for missing selected contracts or absent fitting suggestions. Check exact entity inputs, requested date coverage, pagination, output definitions, units/currencies, provenance and source timestamps. A company-profile contract is not a revenue/margin contract; a quote is not a valuation-multiple or filing record unless its response includes those fields.
3. Execute only fitting returned provider/capability identifiers and contract-supported options through `firecrawl_scrape` Alexandria mode. Preserve reported values and definitions before normalization. Do not invent period, currency, or filter options, or represent acquisition time as market as-of time. Missing source freshness stays unknown.
4. Use `firecrawl_search` and selected `firecrawl_scrape` calls for company investor relations, SEC filings, earnings releases, official statistics, industry reports, news, and analyst commentary. Verify contested or consequential numbers against official filings/current primary sources where accessible. Provider records can replace repeated numeric page assembly, but do not replace the narrative evidence explaining market mechanisms, assumptions, or risks.
5. Use `firecrawl_interact` only if exposed and legitimately accessible charts, tabs, or period selectors are needed to retrieve a value. Inspect the selected period and visible result; stop the returned session with `firecrawl_interact_stop` when done. Use a provided authorized remote session/profile for a private financial portal; otherwise use an accessible primary source or export and disclose the missing metrics. When opening with a saved profile, set `scrapeOptions.profile.saveChanges: false` unless profile writeback was requested. Open the financial page with `url` and continue with the returned `scrapeId`; interaction `timeout` uses seconds, and `scrapeOptions` applies only with `url`.

Choose each next filing, observation, contract or news source for the missing fact most likely to change the comparison; inspect it, update the matrix and choose the next hop. Change unproductive queries rather than repeat them. Stop when requested metrics, narrative questions and material alternatives have adequate support and further targeted retrieval is unlikely to change the report, or user/account limits prevent progress. Mark unfilled matrix cells and coverage gaps instead of collecting optional fields indefinitely.

When ordinary `firecrawl_search` exposes `objective`, use `[market-research]` followed by the broader market/financial-report goal consistently across related searches. Keep `query` focused on the missing evidence without the tag; omit unsupported `objective` and sensitive information. For PDF filings/reports, including extensionless document URLs, use supported `parsers: ["pdf"]` and choose `pdfOptions.maxPages` for the needed evidence and any user limit. Prefer sufficient HTML/passages, disclose truncated coverage and account for possible reread charges.

## Comparison integrity

- Include period, unit/currency, source, and known as-of date for every metric. Keep original values alongside any conversions; state conversion source/date and formula.
- Align entity, period, unit, currency, accounting basis and denominator before comparing or calculating. Resolve conflicting scales against source evidence; distinguish percentage points from percentage changes. Do not directly compare annual with quarterly values, fiscal with calendar periods, nominal with real measures, or reported with adjusted metrics without explaining the distinction.
- Label market-size estimates and forecasts with their geography, methodology, forecast horizon, and source. Do not silently blend incompatible estimates.
- Cross-reference important numbers where possible, checking source independence: syndicated news and repeated earnings releases may share one origin. Retain conflicts and explain likely definition/date differences; do not average them merely to hide disagreement.
- Label derived ratios and calculations separately from reported figures. If a required input is absent, leave the metric unavailable rather than inventing it.

For selected financial contracts, follow returned `nextTool.arguments`, preserving selectors; expand missing options and responses when supported. A combined catalogue ID is not necessarily an execution selector. Inspect required inputs, `requiresOneOf`, response paths such as `response.key`, pagination, freshness, price and effects. Catalogue pages describe capabilities, not financial observations. Execute returned provider/capability/options through `firecrawl_scrape` Alexandria mode; batch and pin versions only as the live schema permits. Keep payload-bound `requestId` and millisecond `timeout` separate from URL formats and `maxAge`; page only with declared inputs and unchanged filters within user/account limits.

Inspect every batch item, retaining successful metrics and item-specific errors. Use documented item-specific continuation rather than replay successful observations. For uncertain retries retain identical ID and payload; changed inputs need a new ID. Do not duplicate in-flight work. Stop unresolved access, terms or budget routes while continuing permitted filings/observations. Terms require an organization administrator outside this workflow; resume retained requests after confirmed acceptance only when contract, access and user budget permit.

Retain provider/capability/version, request/record IDs, paging state, URLs and retrieval/as-of times alongside metric provenance. Unknown freshness remains unknown; supported URL-mode `maxAge: 0` requests a fresh capture, not proof of current source content. Inspect publication dates, represented periods and official indexes for freshness-sensitive figures. For historical comparisons, distinguish capture, publication and event dates; repeated or equal captures do not prove continuous stability. Inspect supported retained-result/artifact handoffs and report expiry rather than silently rerunning paid work.

## Small MCP argument examples

Arguments for `firecrawl_find_tools` when repeated company financials are needed:

```json
{
  "name": "firecrawl_find_tools",
  "arguments": {
    "query": "public company annual revenue operating margin financial filings with fiscal period currency and source URL",
    "limit": 3,
    "expand": []
  }
}
```

Follow returned `nextTool.arguments`, preserving selectors, or expand selected returned provider/capability selectors when supported. Reuse complete contracts. Execution options must use actual entity, date and metric identifiers; the discovery query does not guarantee those inputs or outputs exist.

Arguments for `firecrawl_search` to find primary financial evidence:

```json
{
  "name": "firecrawl_search",
  "arguments": {
    "query": "annual report revenue operating income fiscal year",
    "objective": "[market-research] Compare public-company financial performance using period-aligned primary evidence",
    "includeDomains": ["sec.gov"],
    "limit": 5
  }
}
```

Add the resolved company's name to the actual query, then read only the filings or releases needed to verify the specified periods and values.

## Deliverable

Return requested JSON or Markdown, saving an artifact only if the host supports it; otherwise provide report/data and sources inline.

When the user's account and current host support Intelligent UI, use interactive charts or comparisons only when they clarify aligned metrics and trends. Preserve citations, units, periods and uncertainty, and still deliver the requested report or dataset.

```markdown
# Market Research: [Market]

## Market Overview
[Industry, dated size/growth estimates, key players]

## Company Profiles
[Financial summary, market metrics, recent developments]

## Comparison Tables
[Revenue, margins, valuation multiples, growth with periods, units, definitions, sources]

## Trends And Outlook
[Trends, forecasts, assumptions, risks]

## Sources
[URLs/provenance, extracted data, dates, conflicts, and gaps]

## Rerun Inputs
workflow: firecrawl-market-research
query: [market/company]
companies: [list]
data_points: [all/financial/metrics/trends]
output: [json/markdown]
```

Cite meaningful claims and metric cells beside the exact supporting passage or field. Distinguish reported facts, calculations, estimates and inference. Do not infer causation from co-movement or completeness from missing data, and do not provide financial advice. Disclose stale/unknown freshness, incomplete coverage, truncated documents, inaccessible sources, observed spend and unknown charges when material. Rerun inputs do not create a schedule or monitoring job.

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
