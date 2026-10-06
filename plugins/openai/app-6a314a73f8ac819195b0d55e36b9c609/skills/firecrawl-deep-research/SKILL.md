---
name: firecrawl-deep-research
description: Produce a cited, multi-source analytical report on a complex web-evidence topic, with findings, competing views, risks, and open questions. Use for deep research or a formal research report, not quick lookups, product recommendations, or paper literature reviews.
license: ISC
---

# Firecrawl Deep Research

Use this only when the user explicitly wants report-scale, rigorous synthesis of a complex scientific, technical, policy, or market-analytical topic. Do not turn routine "research X", a product pick, a top-N list, or a quick lookup into a formal report.

Use the named Firecrawl MCP tools, resolving deferred tools through the host's tool search.

Bound the report’s source pages, research time and credits for the chosen depth.
Web and developer searches are billed per request; URL scraping is billed per URL.
Provider-only discovery is free; execution uses the selected capability’s price.

## Scope and depth

Infer the topic and output format. Unless already specified, ask one short question before collection: "How long do you want this research task to run?" Ask at most one or two additional questions only for an unclear topic or critical angle/source constraint.

Map the answer to depth, not minimum scrape counts:

- **Quick (a few minutes):** resolve the central questions with a focused set of strong sources; disclose unexamined angles.
- **Thorough (about 10–15 minutes):** compare multiple perspectives, verify load-bearing claims, and investigate material conflicts.
- **Exhaustive (longer/no stated limit):** broaden primary evidence, expert views, risks, and contrarian sources until marginal evidence stops changing the synthesis. Agree a finite collection/spending budget; "no limit" is not authorization for unlimited charges.

## Evidence collection

1. Turn the topic into evidence questions: definitions, mechanisms, magnitude, timeline, competing explanations, and decisions or uncertainties the report must illuminate. Keep an evidence ledger linking claims to URLs or canonical IDs, source quality, acquisition/as-of times, and gaps.
2. Use `firecrawl_search` for primary sources and contrasting views. Read selected URLs with `firecrawl_scrape`; reuse full content already returned rather than retrieving it again. Search snippets can establish discovery or answer a small factual gap, but do not substitute them for evidence supporting complex conclusions.
3. For a structured angle, such as comparing companies, filings, public records, or economic observations, inspect compact Alexandria suggestions from search or use `firecrawl_find_tools`. Ask for the actual entities, fields, geography, period, and provenance needed by that angle. Expand only the best one or two candidate contracts. A catalogue match is useful only if its declared inputs and output cover those evidence questions; it is not a cache of arbitrary pages.
4. If a contract fits, use its returned provider/capability identifiers and declared options in `firecrawl_scrape` Alexandria mode under the selected contract and the execution checks below. Reuse typed records for that angle; collect live primary analysis and competing views for interpretation. Do not use a company-record contract to establish an unreturned policy claim or a news contract to establish financial metrics. If no candidate fits after one compact discovery pass and at most one targeted refinement, continue with web evidence.
5. Use `firecrawl_developer_search` when the evidence is code behavior, API contracts, bugs, or repository documentation, if exposed. Published-paper evidence belongs to `firecrawl-research-papers`: use that skill's dedicated `firecrawl_research_*` approach, not ordinary web search. For mixed reports, collect the paper component with that approach and synthesize it with the web/policy/market component here.
6. Stop when central claims have adequate evidence, important opposing views and limitations are represented, and remaining gaps are explicit, or when the agreed budget is reached. Do not scrape extra pages to satisfy a quota.

`firecrawl_search` with `categories: ["research"]` filters ordinary web results to research-affiliated websites; it does not search paper abstracts, expand citation graphs, retrieve canonical paper metadata, or verify in-body passages. Biomedical, clinical, drug, gene, disease, epidemiology, public-health, and literature-review requests whose evidence lives in studies belong to the paper workflow.

For a fitting contract returning structured evidence for a report angle, inspect only selected identifiers
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

Arguments for `firecrawl_search` when researching a web-policy angle; replace the example topic with the scoped question:

```json
{
  "name": "firecrawl_search",
  "arguments": {
    "query": "electricity grid interconnection reform primary evidence competing views",
    "limit": 5
  }
}
```

Arguments for `firecrawl_find_tools` only if the report needs structured observations:

```json
{
  "name": "firecrawl_find_tools",
  "arguments": {
    "query": "electricity generation observations by country year with units and source dates",
    "limit": 3,
    "expand": []
  }
}
```

These return evidence candidates or catalogue summaries, not executed provider records. For a selected summary, copy its returned provider and capability IDs into a targeted `firecrawl_find_tools` call with `expand: ["options", "response"]`; build execution options from that contract. Do not invent a provider, capability, or field to make an example executable.

## Deliverable

Return the requested Markdown, JSON, or brief. Save only when the host supports artifacts; otherwise return the report and sources inline.

```markdown
# Deep Research: [Topic]

## Executive Summary
[2–3 paragraphs]

## Key Findings
[Numbered findings with source links]

## Detailed Analysis
[Themes, evidence, and synthesis]

## Contrarian Views And Risks
[Counterarguments, limitations, failure modes]

## Open Questions
[Uncertainty and collection gaps]

## Sources
[Every URL or persistent identifier used, with a one-line note]

## Rerun Inputs
workflow: firecrawl-deep-research
topic: [topic]
depth: [quick/thorough/exhaustive]
output: [markdown/json/brief]
```

Cite factual claims, prefer primary sources, distinguish facts from synthesis, and retain conflicting evidence rather than smoothing it away. A rerun block records inputs; it does not create a scheduled task. Do not claim exhaustive coverage when collection was partial.

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
