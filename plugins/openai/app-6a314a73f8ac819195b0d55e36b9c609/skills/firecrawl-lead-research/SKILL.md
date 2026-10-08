---
name: firecrawl-lead-research
description: Produce a concise pre-meeting company and person intelligence brief with recent activity, evidence-backed pain-point hypotheses, 5–7 talking points, and an outreach angle. Use for sales calls, partnership meetings, investor conversations, and customer interviews, not prospect-list generation.
license: ISC
---

# Firecrawl Lead Research

Create a concise, actionable brief about a known lead before a meeting.

Use the existing Firecrawl connection, resolving deferred tools through the host's tool search and following live schemas. Start from supplied company/person URLs and reusable evidence before discovery.

Respect user-specified time, credit and source limits and returned account restrictions; do not impose default budgets, source quotas or minimum calls. Web searches, URL/PDF retrieval and provider execution can incur charges. Track structured or parsed JSON receipts including nested totals, not catalogue estimates: count aggregates and included child charges once, replace cumulative totals rather than adding polls, and exclude account-wide counters. Missing usage is unknown, not zero; stop a costly route if the user's limit cannot be respected.

## Scope

Infer the company, person, meeting context, and desired depth. If the company is clear, proceed. Ask for clarification only if blocked by identity or meeting context. Resolve ambiguous companies with domain and location rather than combining similarly named entities.

## Collection decisions

1. Establish the company's canonical website and the person's identity/relationship from public evidence. Read supplied pages or reuse supporting passages first; otherwise use normal `firecrawl_search` and relevant `firecrawl_scrape` calls for company about, product, pricing, customer, team and careers evidence. Resolve parent/subsidiary and headquarters/local-presence distinctions; a shared name is not a shared identity.
2. If structured company/person fields are missing, inspect matching suggestions from search and reuse complete contracts. Use targeted `firecrawl_find_tools` only for missing selected contracts or absent fitting suggestions. Check company domain/ID or person identifier, required fields, dates, disambiguation and provenance. A company contract is not evidence of a person's current role unless it returns that relationship.
3. Execute only a fitting contract with returned provider/capability identifiers and declared options through `firecrawl_scrape` Alexandria mode. Use provider records to establish the fields they contain, not as proof of recent launches, funding, hiring, or partnerships they do not report. Follow the selected contract and execution checks below for prices, effects, item errors, and freshness.
4. Add dated company announcements, recent news, funding, launches, hiring, partnerships, and press relevant to the meeting. Use public talks, posts, interviews, and profiles for the person's background. Current role, price, or recent-event claims require current source evidence or an explicit freshness caveat; retrieval time alone is not an as-of date. Hiring activity does not establish a particular open vacancy. Syndicated announcements sharing one origin are not independent confirmation.
5. Collect just enough industry context to explain plausible business challenges. Label pain points as evidence-backed hypotheses and connect talking points to specific sources. Do not fabricate personal details, infer sensitive characteristics, or treat an outreach angle as permission to contact anyone.

Choose each next hop for the missing fact most likely to change the meeting brief, inspect the evidence, then update the brief. Change an unproductive query or source instead of repeating it. Stop when the meeting questions and useful talking points have adequate support and further targeted retrieval is unlikely to change them, or user/account limits prevent progress. Do not spend on optional enrichment after the brief is supported. If annotating supplied entities, preserve every original row, including duplicates and unmatched identities, with nulls and row-specific gaps.

When ordinary `firecrawl_search` exposes `objective`, use `[lead-research]` followed by the broader meeting-research goal consistently across related searches. Keep `query` focused on the specific missing evidence without the tag; omit unsupported `objective` and sensitive information. For a relevant PDF, including an extensionless URL, use supported `parsers: ["pdf"]` and choose `pdfOptions.maxPages` for the needed evidence and any user limit; disclose truncation and possible reread charges.

For selected company/person contracts, follow returned `nextTool.arguments`, preserving selectors; expand options and responses when supported. A combined catalogue ID is not necessarily an execution selector. Inspect required inputs, `requiresOneOf`, response paths such as `response.key`, pagination, freshness, price and effects. Catalogue pages describe capabilities, not lead records. Execute returned provider/capability/options through `firecrawl_scrape` Alexandria mode, batching or pinning versions only as the live schema permits. Keep payload-bound `requestId` and millisecond `timeout` separate from URL formats and `maxAge`.

Inspect every batch item, preserve successful enrichment and use documented item-specific continuation for failures. For uncertain retries retain identical ID and payload; changed inputs need a new ID. Do not duplicate in-flight requests or replay successes. Stop unresolved access, terms or budget routes while continuing permitted evidence. Terms require an organization administrator outside this workflow; resume retained requests after confirmed acceptance only when contract, access and user budget permit.

Keep field-level sources/dates, provider/capability/version, request/record IDs and retrieval/as-of times. Unknown freshness remains unknown; supported URL-mode `maxAge: 0` requests a fresh capture, not proof of current content. Inspect supported retained-result/artifact handoffs before further paid work; disclose expired retention rather than silently rerunning it.

## Small MCP argument examples

Arguments for `firecrawl_find_tools` when known-company enrichment is needed; substitute the resolved company identifier in the actual scoped query:

```json
{
  "name": "firecrawl_find_tools",
  "arguments": {
    "query": "company profile by website domain with products industry size signals and source dates",
    "limit": 3,
    "expand": []
  }
}
```

Follow the selected returned `nextTool.arguments`, preserving selectors, or use returned provider/capability selectors to expand missing options and response contracts. Reuse a complete contract; this query does not promise a provider has the requested fields.

Arguments for `firecrawl_search` to find recent primary announcements:

```json
{
  "name": "firecrawl_search",
  "arguments": {
    "query": "site:example.com funding product launch partnership announcements",
    "objective": "[lead-research] Prepare a pre-meeting company brief with recent activity and evidence-backed talking points",
    "limit": 5
  }
}
```

Replace `example.com` with the resolved company's domain. Reuse sufficient returned evidence and scrape only sources needing detail or verification.

## Deliverable

Return the brief inline, or as a host-supported artifact if available:

```markdown
# Lead Brief: [Company]

## Company Overview
[What they do, stage/size signals, products, customers]

## Recent Activity
[Dated news, launches, funding, hiring, partnerships]

## Key People
[Relevant people and verified public background]

## Talking Points
[5–7 specific conversation starters tied to evidence]

## Likely Pain Points
[Evidence-backed hypotheses, clearly distinguished from facts]

## Outreach Angle
[Suggested positioning or next step; no outreach performed]

## Sources
[URLs, record provenance, dates, and material gaps]

## Rerun Inputs
workflow: firecrawl-lead-research
company: [name/url]
person: [optional]
context: [meeting context]
```

Keep it short enough to use before a meeting. Cite meaningful facts and hypotheses beside the claims with the supporting passage or field, entity and date. Separate verified facts, uncertain signals and inference, retaining contradictions and unsupported meeting questions as gaps. Report partial coverage, observed spend and unknown charges when material. A rerun block records inputs, not a scheduled refresh.

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
