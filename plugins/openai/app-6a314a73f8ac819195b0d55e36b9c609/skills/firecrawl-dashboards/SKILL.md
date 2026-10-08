---
name: firecrawl-dashboards
description: Extract visible KPIs and tables from authorized analytics dashboards for a specified account and reporting period. Produce cross-platform metric summaries with units, dates, sources, and caveats.
license: ISC
---

# Firecrawl Dashboards

Use this when the user needs a dashboard report, not generic public company metrics. Infer dashboard URLs, account or workspace, metrics, reporting period, and output format. Ask for clarification if these inputs or authorized access are missing.

Use the existing Firecrawl connection, resolve deferred tools and follow the live schemas. Respect requested dashboard counts, metric scope, time/credit limits and account restrictions; do not impose budgets or collection quotas. URL retrieval and provider execution are billed. If reporting spend, use returned receipts, not catalogue prices: count aggregates and included child charges once, replace cumulative totals, and exclude account-wide counters. Missing usage is unknown, not zero.

Interactive collection needs `firecrawl_interact` and `firecrawl_interact_stop`; otherwise use a dashboard export or page-content report.

## Choose the collection path

- Start with the supplied dashboard URL or reusable export for the requested account and period, not a broad web search. Resolve relative dates to explicit bounds and confirm the visible account/workspace, date range, timezone, currency, filters, and comparison period before recording numbers.
- Alexandria is optional. Reuse a complete matching contract when it returns analytics fields for the exact authorized account and period. Discover or expand only a missing selected contract. A public company record or generic platform statistic cannot substitute for private dashboard KPIs. Check account scoping, definitions, period granularity, freshness, and effects; if an essential dimension is missing, use the dashboard or an authorized export instead.
- If a matching provider returns sufficient metrics and provenance, do not repeat UI collection just to meet a scrape quota. Use live UI verification when the user requires the currently displayed values, or when filters, definitions, or freshness remain uncertain. Never merge mismatched accounts or periods.

For a missing selected contract, use `firecrawl_find_tools` or its returned `nextTool.arguments`, preserving selectors; request `expand: ["options", "response"]` when supported. A combined catalogue ID is not necessarily an execution selector. Inspect required inputs, `requiresOneOf`, `response.key`, period coverage, pagination, price and effects. Catalogue pages contain contracts, not metrics.

Execute returned provider/capability/options through `firecrawl_scrape` Alexandria mode; batch and pin `version` only as the live schema permits. Payload-bound `requestId` and millisecond `timeout` are separate from URL formats and `maxAge`. Inspect every `data.alexandria` item, retain successful account/period rows and use documented item-specific continuation for failures. Page only with declared inputs and unchanged filters while the requested metric gap remains.

For uncertain retries retain the identical request ID and payload; changed inputs need a new ID. Do not duplicate in-flight requests or replay successful items. Stop unresolved access, terms or budget routes, keeping successful metrics and continuing permitted dashboards/exports. Terms need an organization administrator outside this workflow; resume retained requests after confirmed acceptance only when contract, access and budget permit. Preserve returned records and supported artifact handoffs; disclose retention failures rather than silently rerunning paid work.

If an external metric definition needs web evidence, use normal `firecrawl_search` and inspect matching suggestions; do not search for private dashboard data. When exposed, set `objective` to `[dashboards]` plus the consistent reporting goal, without sensitive account details; keep the focused `query` untagged and omit `objective` when unsupported.

Optional compact discovery with `firecrawl_find_tools`:

```json
{
  "name": "firecrawl_find_tools",
  "arguments": {
    "query": "dashboard analytics KPI metrics for a specified account and reporting period",
    "limit": 3,
    "expand": []
  }
}
```

Use this discovery only for a missing structured route, not before every dashboard. Reuse complete contracts and construct execution options from returned execution identifiers. Discovery is not metric data.

## Collect visible metrics

1. Open the dashboard with `firecrawl_interact`. Use `url` to start or the returned `scrapeId` to continue, never both. Use a natural-language `prompt` and, when supplied, the authorized remote profile supported by the live schema. `scrapeOptions` applies only when opening with `url`; set `scrapeOptions.profile.saveChanges: false` for a saved profile unless profile writeback was requested.
2. Verify the account and period. Set only the requested report filters, then read KPI cards, tables, labels, units, and comparison values. Navigate tabs, expand sections, and scroll tables only to resolve missing requested metrics. After each result, record the value and its card/table/row or screenshot locator, then choose the next unresolved metric. A session URL alone is not extracted evidence. Use URL-mode `maxAge: 0` for requested fresh captures when supported; record actual capture/as-of times rather than assuming freshness.
3. For an authorized dashboard export, inspect its contents and account/period before using it. For a PDF export, including extensionless document URLs, use supported `parsers: ["pdf"]` and choose `pdfOptions.maxPages` for the needed tables and user limits; disclose truncation and possible full-page charges on rereads.
4. If the dashboard session has expired, request a renewed session or an export for the same account and reporting period.
5. Call `firecrawl_interact_stop` with the session's returned `scrapeId` when finished, unless the user explicitly asks to keep it open. Record cleanup failures.

Example `firecrawl_interact` arguments:

```json
{
  "name": "firecrawl_interact",
  "arguments": {
    "url": "https://example.com/dashboard",
    "prompt": "Read the visible account or workspace label, reporting period, timezone, active filters, KPI cards and their units. Do not submit forms or change account settings. Report any missing access or unreadable chart values.",
    "timeout": 60
  }
}
```

For continuation, replace `url` with the actual returned `scrapeId` and provide the next bounded prompt. `timeout` for interaction is in seconds. The stop tool takes only `scrapeId`.

## Final deliverable

Stop when the requested metrics and material comparisons are supported, or limits/access prevent further progress; identify remaining gaps and the stop reason. Return the report as a host artifact or inline Markdown with CSV/JSON tables as requested. When the account and host support Intelligent UI, charts may clarify supported trends but must retain units, periods, sources and uncertainty, and must not replace requested tables or exports.

```markdown
# Dashboard Report

## Summary
[Highlights, alerts, and supported trends]

## Metrics By Dashboard
[Platform/account, metric, value, unit, change, period, source URL]

## Tables Or Exports
[Captured tables/files, contents, and actual host artifact links]

## Notes And Caveats
[Access gaps, chart-only data, missing metrics, filter/definition differences]

## Rerun Inputs
workflow: firecrawl-dashboards
dashboards: [urls]
account_or_workspace: [non-secret identifier]
date_range: [range and timezone]
metrics: [list]
output: [json/markdown/csv]
```

For JSON, preserve `reportedAt`, `dateRange`, `dashboards[]`, `metrics[]`, `tables[]`, `exports[]`, and `summary`. Keep each requested metric with its account, definition, unit/currency, period/timezone, filters, source URL and UI/record locator, capture/as-of times, and caveats; use null for unavailable values, not zero. Preserve provider/capability/version and request/record IDs when used. Align denominators and comparison periods before calculating changes; distinguish percentage points from percentage change. Verify meaningful numerical claims against printed values or inspected pixels, not chart captions. Label approximations, separate trends from causal explanations, and do not count an export and dashboard view of the same data as independent corroboration.

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
