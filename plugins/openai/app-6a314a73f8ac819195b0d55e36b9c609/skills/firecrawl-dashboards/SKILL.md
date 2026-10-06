---
name: firecrawl-dashboards
description: Extract visible KPIs and tables from authorized analytics dashboards for a specified account and reporting period. Produce cross-platform metric summaries with units, dates, sources, and caveats.
license: ISC
---

# Firecrawl Dashboards

Use this when the user needs a dashboard report, not generic public company metrics. Infer dashboard URLs, account or workspace, metrics, reporting period, and output format. Ask at most 1–3 concise questions if these inputs or authorized access are missing.

Use the named Firecrawl MCP tools, resolving deferred tools through the host's tool search.

Agree the dashboard count, reporting period, metric scope and credit ceiling.
URL scraping is billed per URL.
Provider-only discovery is free; execution uses the selected capability’s price.

Interactive collection needs `firecrawl_interact` and `firecrawl_interact_stop`; otherwise use a dashboard export or page-content report.

## Choose the collection path

- Start with the specified dashboard and period, not a broad web search. Confirm the visible account/workspace, date range, timezone, currency, filters, and comparison period before recording numbers.
- Alexandria is optional. Consider `firecrawl_find_tools` only when a published contract could return the requested analytics fields for the exact authorized account and reporting period. A public company record or generic platform statistic cannot substitute for private dashboard KPIs. Check account scoping, metric definitions, period granularity, freshness, and read/write effects in the selected contract; if any essential dimension is missing, use the dashboard or an authorized export instead.
- If a matching provider returns sufficient metrics and provenance, do not repeat UI collection just to meet a scrape quota. Use live UI verification when the user requires the currently displayed values, or when filters, definitions, or freshness remain uncertain. Never merge mismatched accounts or periods.

For a fitting contract returning metrics for the authorized account and reporting period, inspect only selected identifiers
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

Select only returned provider and capability identifiers, expand their input and response contracts, and construct execution options from those contracts using the execution checks in this skill. Discovery is not metric data.

## Collect visible metrics

1. Open the dashboard with `firecrawl_interact`. Use `url` to start or the returned `scrapeId` to continue, never both. Use a natural-language `prompt` and, when supplied, the authorized remote profile supported by the live schema. `scrapeOptions` applies only when opening with `url`; set `scrapeOptions.profile.saveChanges: false` for a saved profile unless profile writeback was requested.
2. Verify the account and period. Set only the requested report filters, then read KPI cards, tables, labels, units, and comparison values. Navigate tabs, expand sections, and scroll tables as needed. Inspect each result before continuing; a session URL alone is not extracted evidence.
3. For an authorized dashboard export, report the returned table or file and its account/period. Use the export in the report only when the host provides access to its contents.
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

Return this report as an artifact if the host can create one, otherwise inline Markdown with optional CSV/JSON tables:

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

For JSON, preserve `reportedAt`, `dateRange`, `dashboards[]`, `metrics[]`, `tables[]`, `exports[]`, and `summary`. Each metric needs its dashboard/account, definition, value, unit, period, source URL, capture time, and caveats. Use null for unavailable numbers, not zero. Extract actual numbers rather than chart labels; label approximations and never infer precise values from an unreadable chart. Separate observed changes from explanations that the data does not establish.

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
