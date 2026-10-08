---
name: firecrawl-lead-gen
description: Generate deduplicated, CRM-ready prospect lists filtered by role, industry, geography, company size, stage, or technology from permitted databases and public directories. Return CSV, JSON, or a table with source profiles and explicit contact-data gaps; do not invent or infer contacts.
license: ISC
---

# Firecrawl Lead Gen

Extract legitimately accessible prospect lists, not pre-meeting briefs or unsolicited outreach.

Use the existing Firecrawl connection, resolving deferred tools through the host's tool search and following live schemas. Start from supplied source URLs, input rows or reusable prospect evidence before new discovery.

Respect the requested lead count, criteria and user-specified time, credit and source limits and returned account restrictions; do not impose default budgets, source quotas or minimum calls. Web searches are billed per request; provider-only discovery is free; URL retrieval uses URL pricing and provider execution uses listed capability pricing. Track structured or parsed JSON receipts including nested totals, not catalogue estimates: count aggregates and included child charges once, replace cumulative totals rather than adding polls, and exclude account-wide counters. Missing usage is unknown, not zero; stop a costly route if the user's limit cannot be respected.

Public provider records do not grant access to a private prospect database or authorize outreach.

## Scope

Infer prospect criteria, source, maximum leads, and output format. Proceed if clear; ask for clarification only if blocked by the prospect definition, required source/access, or count. Distinguish discovering new qualified leads from annotating an existing list; the latter must retain every input row.

## Collection decisions

1. Translate the request into explicit filters: role, company type/size, industry, location, funding stage, technologies, and required output fields. Separate mandatory filters from preferences. Preserve a named source; do not silently substitute a generic company or people database for its records.
2. Read supplied source pages or reuse existing results first. Otherwise use normal `firecrawl_search` for the scoped prospect question and inspect matching suggestions. Reuse complete contracts; use targeted `firecrawl_find_tools` for missing selected contracts or absent fitting suggestions. Check exact filters, entity type, source, person-to-company relationships, record identifiers, profile URLs and permitted fields. A company-enrichment contract alone cannot generate a role-filtered person list.
3. If a contract fits, execute returned provider/capability identifiers and declared options through `firecrawl_scrape` Alexandria mode. Apply server-side filters only when supported. Follow capability pagination, not catalogue pagination; stop at the requested count/budget or empty/repeated cursors. If a filter must be checked after retrieval, disclose that limitation; local filtering does not reduce upstream billing or prove completeness.
4. Choose the next page, profile, contract or provider page for missing qualification evidence; inspect it before continuing. Use `firecrawl_scrape` for accessible directories/profile pages when no contract fits. For filters, search forms, or pagination requiring interaction, use `firecrawl_interact` only if exposed and the session has legitimate access. For a private prospect source, use the provided authorized remote session/profile or an export; when opening with a saved profile, set `scrapeOptions.profile.saveChanges: false` unless profile writeback was requested; record any source that remains unavailable. For directory navigation, start with `url` and continue with returned `scrapeId`; interaction `timeout` uses seconds, and `scrapeOptions` applies only with `url`.
5. Qualify substantive evidence against mandatory criteria before paid optional enrichment. Verify consequential role, location, relationship and event dates; company hiring activity does not establish a particular open vacancy. Stop when the requested qualified count is supported, further targeted retrieval is unlikely to improve the list, or user/account limits prevent progress. With interaction, call `firecrawl_interact_stop` when finished unless continued use was explicitly requested. List generation ends with the prospect export, not contact or account actions.

When ordinary `firecrawl_search` exposes `objective`, use `[lead-gen]` followed by the broader prospect-list goal consistently across related searches. Keep `query` focused on missing qualification evidence without the tag; omit unsupported `objective` and sensitive information. Do not add a search if supplied evidence or a known contract already resolves the next fact.

## Fields and validation

Capture only visible or legitimately accessible fields:

- name, title, company, company URL, and location
- email, phone, and LinkedIn URL only when actually returned/visible and allowed
- industry, company size, funding stage, notes, and profile URL

Retain field-level source URLs or provider provenance, canonical IDs and source/as-of dates when known. Leave absent values null or blank, recording masked, unavailable or paywalled fields. Never infer email patterns, phone numbers or private details; label a contact verified only when returned verification status supports it. Repeated directory records sharing one source do not independently corroborate qualification. Preserve conflicting values and their evidence.

For newly discovered leads, deduplicate by stable person/profile ID or canonical profile URL; company domain groups companies, never distinct contacts. Shared names alone do not establish identity, and uncertain matches stay separate. For supplied lists, preserve every original row and identity, including duplicates and unmatched rows, with required fields, nulls, qualification status and row errors. Reuse enrichment across duplicate rows without deleting them. Return fewer qualified discoveries rather than padding to the requested count.

For selected prospect contracts, follow returned `nextTool.arguments`, preserving selectors; expand missing options and response contracts when supported. A combined catalogue ID is not necessarily an execution selector. Inspect required inputs, `requiresOneOf`, response paths such as `response.key`, pagination, freshness, price and effects. Catalogue pagination returns capabilities, not prospects. Execute returned provider/capability/options through `firecrawl_scrape` Alexandria mode; batch and pin versions only as the live schema permits. Keep payload-bound `requestId` and millisecond `timeout` separate from URL formats and `maxAge`.

Inspect every batch item and retain successes with row provenance and paging state. Use documented item-specific continuation for failures instead of replaying successful leads. For uncertain retries retain identical ID and payload; changed inputs need a new ID. Do not duplicate in-flight work. Stop unresolved access, terms or budget routes while continuing permitted qualification sources. Terms require an organization administrator outside this workflow; resume retained requests after confirmed acceptance only when contract, access and user budget permit.

Keep provider/capability/version, request/record IDs and retrieval/as-of times. Unknown freshness remains unknown; supported URL-mode `maxAge: 0` requests a fresh capture, not proof of a current role or vacancy. Inspect supported retained-result/artifact handoffs before new paid work, and report expiry rather than silently rerunning enrichment.

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

Follow returned `nextTool.arguments`, preserving selectors, or expand the selected returned provider/capability selectors when supported. Reuse complete contracts and construct execution options from their actual fields, not assumed role/location keys. Discovery is not the lead list.

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

Return CRM-ready JSON/CSV or a Markdown table. Use a host-supported artifact when possible; otherwise include data inline with source and gap fields. Produce correctly escaped CSV, using a CSV writer when available. Report actual input, qualified, discovered, duplicate and unmatched counts as appropriate; directory totals do not establish complete coverage. Do not require local files.

```markdown
# Lead List: [Target]

## Summary
[Source, applied filters, qualified count, access/freshness caveats]

## Leads
[Deduplicated discoveries or all preserved input rows, with supplied JSON/CSV artifact/content]

## Data Gaps
[Masked, unavailable, paywalled, unverified, or unsupported fields/filters]

## Rerun Inputs
workflow: firecrawl-lead-gen
target: [description]
source: [auto/source/url]
max_leads: [number]
output: [json/csv/markdown]
```

Disclose unsupported filters, partial source coverage, unresolved row errors, observed spend and unknown charges when material. A rerun block is a reproducible input record, not an automatic refresh or outreach schedule.

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
