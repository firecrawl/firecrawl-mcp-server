---
name: firecrawl-research-papers
description: Find and synthesize published papers into a literature review, study survey, paper summary, or research landscape using dedicated paper search, citation expansion, and in-body verification. Prefer for biomedical, clinical, life-science, and arXiv evidence; distinguish papers from reports and research blogs.
license: ISC
---

# Firecrawl Research Papers

Create a sourced literature review or paper synthesis. Use this rather than general web research when the evidence base is published papers, including clinical, drug, gene, disease, epidemiology, and public-health studies.

Use the existing Firecrawl connection, resolving deferred tools through the host's tool search and following live schemas. Start from supplied paper IDs, URLs, passages or reusable evidence; retrieve only what is missing for the requested review.

Respect user-specified counts, time, credit and source limits and returned account restrictions; do not impose default budgets, source quotas or minimum calls. Web and paper searches are billed per request; URL/PDF retrieval and provider execution have their own pricing. Track structured or parsed JSON receipts including nested totals, not catalogue estimates: count aggregates and included child charges once, replace cumulative totals rather than adding polls, and exclude account-wide counters. Missing usage is unknown, not zero; stop a costly route if the user's limit cannot be respected.

If the dedicated paper tools are unavailable, disclose the limitation and offer a reduced web-source review; do not claim ordinary web search is equivalent to the paper index.

## Scope

Infer topic, source constraints, target count, and output format. Proceed if clear; ask for clarification only when blocked by the topic, count, venue/date, or method constraints. A requested count is a scope target, not permission to pad the review with irrelevant papers.

## Dedicated paper collection

The index searches paper abstracts and offers full-text retrieval per indexed paper. It includes PubMed journal literature, bioRxiv and medRxiv preprints, and arXiv preprints in computer science, physics, and mathematics. Coverage of other sources may be thinner. Check returned coverage rather than promising a complete corpus.

- `firecrawl_research_search_papers`: semantic search using `query`, `k` chosen for the evidence need, and supported `authors`, `categories`, `from`, or `to` filters when required. Author/category filters require all supplied values to match; date filters concern created/updated dates, so verify a required publication date separately.
- `firecrawl_research_related_papers`: expand strong anchors using returned canonical IDs in `seed_ids`, an explicit `intent`, and `mode` of `similar`, `citers`, or `references`. Choose anchor batches and `k` to find the relevant family, not only the first strong hit, within live schema and user limits.
- `firecrawl_research_inspect_paper`: use `paperId` to verify canonical title, abstract, authors, source IDs, categories, and dates.
- `firecrawl_research_read_paper`: use `paperId`, a targeted `question`, and passage `k` chosen for the missing evidence to verify methods, outcomes, scores, benchmarks, affiliations, comparisons, or limitations inside the body. Do not read every candidate merely to summarize it.

Match retrieval to the question:

1. **Named paper:** use its known canonical ID directly, or one search to resolve it; inspect/read only as needed.
2. **Description, method, or topic family:** search strong anchors with alternate framings when thin, then expand close neighbors.
3. **Enumeration of papers doing a task or benchmark:** use multiple framings, expand several anchors, and re-seed from newly relevant papers. Do not mistake one ranked page for an enumeration.
4. **Property or mechanism:** start with its defining/strongest anchor, expand appropriate relationships, and read passages to verify the property.
5. **Superlative or leaderboard:** find the ranking with web search/scrape, then map top entries back to canonical papers and verify the ranking's date, scope, and measurement.
6. **Author, organization, venue, date, or methodology constraints:** inspect metadata or read the relevant body evidence before retaining a candidate.

Choose the next search, anchor expansion, metadata lookup or passage read for the highest-impact missing fact; inspect the returned evidence before choosing the next hop. Resolve metadata conflicts against canonical records and keep abstract, body and revisions version-specific. A revision date is not first publication, and available full text does not prove the needed passage was returned. Align populations, interventions, endpoints, denominators and follow-up periods before comparing outcomes.

Deduplicate discovered papers by canonical ID, retaining version differences and conflicting findings. If annotating a supplied paper list, preserve every input row, including duplicates and unmatched identifiers, with row-specific sources and gaps. Include the relevant family when uncertain; drop only clearly off-topic papers. Stop when the requested scope, major themes and material alternatives have support and further targeted retrieval is unlikely to change the synthesis, or user/account limits prevent progress. Report selection limits and unresolved gaps; do not label a partial search a completed systematic review.

## Web context and Alexandria decisions

Use `firecrawl_search` and `firecrawl_scrape` for accessible university/ACM/IEEE source pages, unindexed reports and whitepapers, industry reports, company research blogs, technical articles, conference summaries, and leaderboards. Note inaccessible or failed PDFs. `categories: ["research"]` is ordinary web filtering to research-affiliated sites, not abstract search, citation expansion, canonical metadata, or in-body retrieval.

When ordinary `firecrawl_search` exposes `objective`, use `[research-papers]` followed by the broader review goal consistently across related searches. Keep `query` focused on the missing evidence without the tag; omit unsupported `objective` and sensitive information. Reuse normal search results and complete matching contracts rather than adding discovery calls automatically.

For PDF evidence, including extensionless document URLs, use supported `parsers: ["pdf"]` and choose `pdfOptions.maxPages` for the needed passages and any user limit. Prefer suitable HTML or indexed passages when sufficient; mark truncated coverage and remember rereads may charge the requested pages again.

Do not insert a compulsory catalogue hop before paper tools. Alexandria can supply separate structured context, such as dated benchmark records or report metadata across entities, only when its contract returns the needed identifiers, measurements, periods and provenance. A research label does not establish paper-corpus or full-text coverage. Use dedicated tools for paper-family expansion and body verification. For missing selected contracts, follow returned `nextTool.arguments`, preserving selectors, or use targeted `firecrawl_find_tools`; expand options and responses when supported. A combined catalogue ID is not necessarily an execution selector, and catalogue pagination returns contracts, not records.

Inspect required inputs, `requiresOneOf`, response paths such as `response.key`, pagination, freshness, price and effects before executing returned provider/capability/options through `firecrawl_scrape` Alexandria mode. Batch, pin versions and use payload-bound `requestId`/millisecond `timeout` only as the live schema permits; keep URL formats and `maxAge` separate. Inspect every item, preserve successes, and continue failed items only through documented item-specific routes. For an uncertain retry retain identical ID and payload; changed inputs need a new ID. Do not duplicate in-flight work or replay successful items.

Stop unresolved access, terms or budget routes, not the entire review; continue permitted paper/web evidence and disclose missing context. Terms require an organization administrator outside this workflow; resume retained requests after confirmed acceptance only when contract, access and user budget permit. Retain provider/capability/version, request and record IDs, URLs, paging state and retrieval/as-of times. Unknown freshness remains unknown; use supported URL-mode `maxAge: 0` for requested fresh captures, without treating a fresh fetch as proof of current content. Inspect supported retained-result/artifact handoffs and report expiry rather than silently rerunning paid work.

## Small MCP argument examples

Arguments for `firecrawl_research_search_papers`:

```json
{
  "name": "firecrawl_research_search_papers",
  "arguments": {
    "query": "randomized trials of exercise interventions for adults with type 2 diabetes",
    "k": 8
  }
}
```

Arguments for `firecrawl_research_related_papers` when the user supplied the known Attention Is All You Need identifier; in a discovery flow, substitute IDs actually returned by search:

```json
{
  "name": "firecrawl_research_related_papers",
  "arguments": {
    "seed_ids": ["arxiv:1706.03762"],
    "intent": "transformer attention mechanisms and limitations",
    "mode": "citers",
    "k": 8
  }
}
```

Arguments for `firecrawl_research_inspect_paper` and `firecrawl_research_read_paper` for that same known paper:

```json
{
  "name": "firecrawl_research_inspect_paper",
  "arguments": {
    "paperId": "arxiv:1706.03762"
  }
}
```

```json
{
  "name": "firecrawl_research_read_paper",
  "arguments": {
    "paperId": "arxiv:1706.03762",
    "question": "What comparisons and limitations support the reported translation results?",
    "k": 3
  }
}
```

For any optional Alexandria context, execute only provider/capability identifiers returned by discovery and options allowed by the expanded contract, following the selected contract and execution checks. No provider or capability is implied by the paper examples.

## Deliverable

Return Markdown or a brief inline when the host cannot save an artifact. Organize evidence by source class or subtopic.

```markdown
# Literature Review: [Topic]

## Abstract
[2–3 paragraph summary]

## Key Papers
[Title, authors, source URL or persistent ID, findings, methodology, relevance]

## Themes And Consensus
[Agreement with citations]

## Open Questions And Debates
[Disagreement and unresolved questions]

## Emerging Trends
[Recent developments with dates]

## Sources
[Organized by paper/report/article; note full text, abstract-only evidence, and failures]

## Rerun Inputs
workflow: firecrawl-research-papers
topic: [topic]
target_count: [number]
output: [markdown/brief]
```

Every meaningful claim must trace to an exact passage or field and its paper/version or source URL. Distinguish authors' claims from synthesis, and separate peer-reviewed studies, preprints, blogs and vendor reports. Papers, press releases and reports repeating the same study are not independent corroboration. Mark abstract-only support, unresolved contradictions, truncated documents and actual selection/coverage limits. Report observed spend and unknown charges when material. The rerun block does not schedule another review.

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
