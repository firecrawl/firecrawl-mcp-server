---
name: firecrawl-lead-research
description: Produce a concise pre-meeting company and person intelligence brief with recent activity, evidence-backed pain-point hypotheses, 5–7 talking points, and an outreach angle. Use for sales calls, partnership meetings, investor conversations, and customer interviews, not prospect-list generation.
license: ISC
---

# Firecrawl Lead Research

Create a concise, actionable brief about a known lead before a meeting.

Use the named Firecrawl MCP tools, resolving deferred tools through the host's tool search.

Bound company/person coverage, recent-event sources and credits for the brief.
Web searches are billed per request; URL scraping is billed per URL.
Provider-only discovery is free; execution uses the selected capability’s price.

## Scope

Infer the company, person, meeting context, and desired depth. If the company is clear, proceed. Ask at most one to three concise questions only if blocked by identity or meeting context. Resolve ambiguous companies with domain and location rather than combining similarly named entities.

## Collection decisions

1. Establish the company's canonical website and the person's identity/relationship from public evidence. Gather relevant company about, product, pricing, customer, team, and careers pages using `firecrawl_search` and selected `firecrawl_scrape` calls. Do not retrieve every page type if the brief already has sufficient evidence.
2. If the brief needs structured company/person fields, such as company identity, stage/size signals, public role/background, or several related entities, use compact Alexandria suggestions or `firecrawl_find_tools`. Query for the known identifier and exact required fields. Expand only the best one or two contracts, checking whether company domain/ID or person identifier, disambiguation, and provenance are supported. A company contract is not evidence of a person's role unless it actually returns that relationship.
3. Execute only a fitting contract with returned provider/capability identifiers and declared options through `firecrawl_scrape` Alexandria mode. Use provider records to establish the fields they contain, not as proof of recent launches, funding, hiring, or partnerships they do not report. Follow the selected contract and execution checks below for prices, effects, item errors, and freshness.
4. Add dated company announcements, recent news, funding, launches, hiring, partnerships, and press relevant to the meeting. Use public talks, posts, interviews, and profiles for the person's background. Current role, price, or recent-event claims require current source evidence or an explicit freshness caveat; retrieval time alone is not an as-of date.
5. Collect just enough industry context to explain plausible business challenges. Label pain points as evidence-backed hypotheses and connect talking points to specific sources. Do not fabricate personal details, infer sensitive characteristics, or treat an outreach angle as permission to contact anyone.

After one compact discovery pass and at most one targeted refinement without a fitting contract, continue with public web sources. Stop when the brief supports the meeting's important questions, recent activity, and useful talking points, or the agreed budget is reached. Record gaps instead of collecting irrelevant enrichment.

For a fitting contract returning known-company or person enrichment, inspect only selected identifiers
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

Copy returned provider and capability IDs into a selected contract lookup with `expand: ["options", "response"]`. Use only the identifiers and options it actually declares for execution; this query does not promise any provider has those fields.

Arguments for `firecrawl_search` to find recent primary announcements:

```json
{
  "name": "firecrawl_search",
  "arguments": {
    "query": "site:example.com funding product launch partnership announcements",
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

Keep it short enough to use before a meeting. Separate verified facts, uncertain signals, and inferences. A rerun block records inputs, not a scheduled refresh.

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
