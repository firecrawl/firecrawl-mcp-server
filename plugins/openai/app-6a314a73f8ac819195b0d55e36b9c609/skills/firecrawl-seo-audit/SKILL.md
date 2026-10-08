---
name: firecrawl-seo-audit
description: Audit a site's metadata, headings, internal links, content structure, and keyword opportunities. Return page-specific SEO findings and prioritized recommendations with source evidence and scoped SERP comparisons.
license: ISC
---

# Firecrawl SEO Audit

Use this to turn a website into a specific, prioritized SEO audit. Infer site, keywords, relevant pages or competitors, and output format. Proceed when the site is clear; ask for clarification only for blocking inputs, such as a required keyword set or target geography.

Use the existing Firecrawl connection, resolve deferred tools and follow the live schemas. Respect requested pages, keywords/geography, time/credit limits and account restrictions without imposing source quotas or default budgets. Web searches are billed per request; provider-only discovery is free; page retrieval uses URL pricing and provider execution uses listed capability pricing. If reporting spend, use returned receipts rather than catalogue prices, counting aggregates and included child charges once. Replace cumulative totals instead of summing repeated returns, exclude account-wide counters and mark missing usage unknown.

## Choose structured data selectively

Start with supplied URLs or reusable audit evidence whose page/version/date fits. For missing keyword or competitor evidence, use normal `firecrawl_search` and inspect both relevant pages and matching capability suggestions. When exposed, set `objective` to `[seo-audit]` plus the consistent audit goal; keep `query` focused and untagged, omit unsupported `objective` and avoid sensitive details. No provider hop is needed for a known page. For repeated keyword/ranking fields or a requested backlink dataset, select only a contract covering the required domains, geography, device, units and dates; no SEO provider is assumed to exist.

Keep provider observations separate from current on-page evidence. A backlink record cannot prove a page's current heading structure; a historic ranking record cannot establish today's search position. If sufficient records answer a requested comparison, do not scrape every competitor merely for volume. Retrieve pages only to support material content/metadata findings, resolve gaps, or satisfy a current-page requirement. When no suitable contract exists, use bounded web retrieval and disclose unavailable ranking/backlink data.

Reuse complete contracts; expand only missing selected contracts with `firecrawl_find_tools` or returned `nextTool.arguments`, preserving selectors. Use `expand: ["options", "response"]` when supported. A combined catalogue ID is not necessarily an execution selector. Inspect required inputs, `requiresOneOf`, `response.key`, pagination, freshness, price and effects; catalogue pagination returns contracts, not keyword/backlink records.

Execute returned provider/capability/options through `firecrawl_scrape` Alexandria mode; batch or pin `version` only as the live schema permits. Payload-bound `requestId` and millisecond `timeout` are separate from URL formats and `maxAge`. Inspect every `data.alexandria` item, retain successful observations and use documented item-specific continuation for failures. Page only with declared inputs and unchanged filters while a material audit gap remains.

For uncertain retries retain identical request ID and payload; changed inputs need a new ID. Do not duplicate in-flight requests or replay successful items. Stop unresolved access, terms or budget routes while preserving findings and continuing permitted page/search routes. Terms need an organization administrator outside this workflow; resume retained requests after confirmed acceptance only when contract, access and budget permit. Keep provider/capability/version, request/record IDs, URLs and retrieval/as-of times with observations. Disclose unknown freshness and retention failures; do not silently rerun paid work.

Optional `firecrawl_find_tools` arguments:

```json
{
  "name": "firecrawl_find_tools",
  "arguments": {
    "query": "SEO keyword rankings and backlink records by domain and observation date",
    "limit": 3,
    "expand": []
  }
}
```

Use targeted discovery only when structured evidence is needed and existing suggestions/contracts do not cover it. Construct options from the selected complete contract, not guessed SEO parameters.

## Collect and audit

1. Map the site only when URL discovery is needed for site structure. Select relevant high-value pages, not a fixed sample of every category. After each retrieval, inspect the supporting fields or passages, update the finding and choose the next missing fact that could change a recommendation. Do not call the map exhaustive.
2. Scrape selected pages with `onlyMainContent: false` when navigation, metadata, and linking context matter. Use markdown, HTML, and links as needed to inspect titles, descriptions, H1/H2 hierarchy, content, internal links, canonical signals, and image alt text actually present in the output. Use supported `maxAge: 0` for requested fresh captures, distinguishing requested freshness from returned cache/as-of evidence. If a relevant source is a PDF, including an extensionless document URL, use supported `parsers: ["pdf"]` and choose `pdfOptions.maxPages` for the needed evidence and user limits; mark truncation and possible full requested-page charges on rereads.
3. Compare URL patterns and internal links. Map omissions alone do not prove orphaning, sitemap failure, or deindexing. Retrieval failures need corroboration before being called broken links. Distinguish duplicate-content signals from confirmed duplicates.
4. For supplied target keywords, use `firecrawl_search` and collect only the comparison pages needed to explain meaningful differences. Returned search order is scoped evidence from this search, not a verified universal rank or proof of why a search engine ranks a page. Preserve query, geography if specified, date, and source URLs. Do not invent search volume, traffic, indexing status, Core Web Vitals, or causal ranking explanations.

Example bounded `firecrawl_map` arguments:

```json
{
  "name": "firecrawl_map",
  "arguments": {
    "url": "https://example.com",
    "limit": 30,
    "includeSubdomains": false,
    "sitemap": "include"
  }
}
```

Example `firecrawl_scrape` arguments:

```json
{
  "name": "firecrawl_scrape",
  "arguments": {
    "url": "https://example.com/product",
    "formats": ["markdown", "html", "links"],
    "onlyMainContent": false,
    "maxAge": 0
  }
}
```

Example keyword comparison with `firecrawl_search`:

```json
{
  "name": "firecrawl_search",
  "arguments": {
    "query": "project management software for small teams",
    "objective": "[seo-audit] Audit the site's search visibility and content opportunities for small-team project management software",
    "limit": 5
  }
}
```

## Final deliverable

Stop when the requested audit areas and material recommendation gaps are supported and further targeted retrieval is unlikely to change priorities, or when limits/access prevent progress. Return a host artifact or inline Markdown/JSON with page-level evidence, missing fields, coverage limits and stop reason. If the account and host support Intelligent UI, cited page/keyword comparisons may clarify findings but must retain dates, scope and uncertainty and not replace the audit.

```markdown
# SEO Audit: [Site]

## Executive Summary
[Top supported risks and opportunities; coverage limits]

## Site Structure
[Pages found, URL quality, sitemap/internal-link evidence]

## On-Page SEO
[Per-page title, meta, headings, content, linking findings]

## Keyword Opportunities
[Target keywords, missing content, proposed pages; label strategy hypotheses]

## Competitor/SERP Comparison
[Observed comparison results and page patterns; scoped query/date/location]

## Prioritized Recommendations
[High/medium/low impact, exact page changes, evidence, effort]

## Sources
[URLs, capture times, provider provenance if used, checks performed]

## Rerun Inputs
workflow: firecrawl-seo-audit
site: [url]
keywords: [list]
geography: [if specified]
output: [markdown/json]
```

Make recommendations specific to a page and cite the exact metadata field, heading, link, passage or dated provider row behind each material claim. Preserve requested/final URLs, page identity, capture/as-of dates, keyword/location/device and metric units where relevant; resolve contradictions before comparing. Syndicated content and repeated provider reports with the same origin are not independent evidence. Separate technical findings from strategy hypotheses, disclose untested sections and missing comparison fields, and do not label a representative-page audit comprehensive.

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
