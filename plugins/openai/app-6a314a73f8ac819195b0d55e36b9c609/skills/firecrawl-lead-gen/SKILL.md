---
name: firecrawl-lead-gen
description: Generate deduplicated, CRM-ready prospect lists filtered by role, industry, geography, company size, stage, or technology from permitted databases and public directories. Return CSV, JSON, or a table with source profiles and explicit contact-data gaps; do not invent or infer contacts.
license: ISC
---

# Firecrawl Lead Gen

Extract legitimately accessible prospect lists, not pre-meeting briefs or unsolicited outreach.

Use the named Firecrawl MCP tools, resolving deferred tools through the host's tool search.

Set the qualification criteria, maximum leads, source pages and credit ceiling.
Web searches are billed per request; URL scraping is billed per URL.
Provider-only discovery is free; execution uses the selected capability’s price.

Public provider records do not grant access to a private prospect database or authorize outreach.

## Scope

Infer prospect criteria, source, maximum leads, and output format. Proceed if clear; ask at most one to three concise questions only if blocked by the prospect definition, required source/access, or count. Establish bounded record/page/time/spending limits before collection.

## Collection decisions

1. Translate the request into explicit filters: role, company type/size, industry, location, funding stage, technologies, and required output fields. Separate mandatory filters from preferences. Preserve a named source; do not silently substitute a generic company or people database for its records.
2. For multiple similarly structured leads, discover compact prospect/search capabilities with `firecrawl_find_tools` or existing search suggestions. Ask for the exact filters, entity type, source, and allowed fields. Expand only the best one or two contracts. Check whether filters, person-to-company relationships, record identifiers, profile URLs, and permitted contact fields are actually returned. A company-enrichment contract alone cannot generate a role-filtered person list.
3. If a contract fits, execute returned provider/capability identifiers and declared options through `firecrawl_scrape` Alexandria mode. Apply server-side filters only when supported. Follow capability pagination, not catalogue pagination; stop at the requested count/budget or empty/repeated cursors. If a filter must be checked after retrieval, disclose that limitation; local filtering does not reduce upstream billing or prove completeness.
4. If no candidate fits after one discovery pass and one targeted refinement, use `firecrawl_search` and `firecrawl_scrape` for public directories and profile pages. For filters, search forms, or pagination requiring interaction, use `firecrawl_interact` only if exposed and the session has legitimate access. For a private prospect source, use the provided authorized remote session/profile or an export; record any source that remains unavailable. For directory navigation, start with `url` and continue with returned `scrapeId`; interaction `timeout` uses seconds, and `scrapeOptions` applies only with `url`.
5. Inspect a small page/result batch, validate mandatory filters, then continue within scope. With interaction, use returned `scrapeId` for continuation and call `firecrawl_interact_stop` when finished unless continued use was explicitly requested. List generation ends with the prospect export, not contact or account actions.

## Fields and validation

Capture only visible or legitimately accessible fields:

- name, title, company, company URL, and location
- email, phone, and LinkedIn URL only when actually returned/visible and allowed
- industry, company size, funding stage, notes, and profile URL

Retain per-lead source URL or provider provenance, canonical IDs when supplied, and source/as-of dates if known. Leave absent values null or blank and record whether masked, unavailable, or paywalled. Never infer email patterns, phone numbers, or private details. Deduplicate people by stable person/profile ID or canonical profile URL where available; use company domain only for company-level grouping, never to collapse distinct contacts. Without a reliable person identifier, retain uncertain matches separately. Name alone can merge different people. Keep conflicting fields with their sources. Return fewer qualified leads rather than padding to the requested count.

For a fitting contract returning qualified prospects from the requested source, inspect only selected identifiers
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

## Small MCP argument examples

Arguments for `firecrawl_find_tools` for a scoped prospect list:

```json
{
  "name": "firecrawl_find_tools",
  "arguments": {
    "query": "prospect search with role geography company industry filters and public profile URLs",
    "limit": 3,
    "expand": []
  }
}
```

Read the selected contract with returned provider/capability IDs and `expand: ["options", "response"]`. Construct execution options from that contract, not assumed role/location keys. Discovery describes capabilities; it is not the lead list.

Arguments for `firecrawl_interact` only when a legitimately accessible public directory needs navigation; replace the example URL with the selected source:

```json
{
  "name": "firecrawl_interact",
  "arguments": {
    "url": "https://example.com/directory",
    "prompt": "Read the available role and location filters and the visible first-page profile fields. Do not submit contact forms or change account settings.",
    "timeout": 30
  }
}
```

The interaction timeout is in seconds. This example does not establish that interaction is available or that a source permits collection.

## Deliverable

Return CRM-ready JSON/CSV or a Markdown table. Use a host-supported artifact when possible; otherwise include the data inline, along with source and gap fields. Do not require local files.

```markdown
# Lead List: [Target]

## Summary
[Source, applied filters, qualified count, access/freshness caveats]

## Leads
[Deduplicated table or supplied JSON/CSV artifact/content]

## Data Gaps
[Masked, unavailable, paywalled, unverified, or unsupported fields/filters]

## Rerun Inputs
workflow: firecrawl-lead-gen
target: [description]
source: [auto/source/url]
max_leads: [number]
output: [json/csv/markdown]
```

A rerun block is a reproducible input record, not an automatic refresh or outreach schedule.

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
