---
name: firecrawl-knowledge-base
description: Assemble web sources into a reference collection, RAG chunks, a training dataset, or a documentation mirror with a source manifest. Use for organized reusable content, not a one-off research answer.
license: ISC
---

# Firecrawl Knowledge Base

Turn specified URLs or a topic into organized LLM-ready content. Infer source, goal, depth, and output destination. Ask at most 1–3 concise questions only if blocked, including the training format when training is requested.

## MCP collection

Use the named Firecrawl MCP tools, resolving deferred tools through the host's tool search.

Bound the documentation sections, page count and credits for the chosen output mode.
Web and developer searches are billed per request; URL scraping is billed per URL.
Provider-only discovery is free; execution uses the selected capability’s price.

## Alexandria and live collection decisions

1. Distinguish a topical subset from a bounded documentation corpus or mirror. For a small topical subset, `firecrawl_search` or, for code/API documentation, `firecrawl_developer_search` can locate relevant passages. Read authoritative sources when passages lack necessary context. Search hits or metadata alone are not complete documentation.
2. When many documents need the same content fields, try a compact `firecrawl_find_tools` lookup for an article/document export or indexed source contract that genuinely covers the requested sources, version, and section. Expand only the best one or two contracts with `expand: ["options", "response"]`. Require actual content or a resolvable authoritative document URL and provenance, not generic company/product metadata. Execute exact returned identifiers and options. If no fit exists after one refinement, continue with source pages.
3. Reuse sufficient provider article content for the selected subset, but verify missing code examples, tables, version context, and full sections against authoritative docs. A provider index does not establish complete mirror coverage. For a requested corpus/mirror, use `firecrawl_map`, if exposed, to enumerate the chosen scope, then bounded `firecrawl_crawl` or selected `firecrawl_scrape` calls. Set section paths and page limits to the requested depth; do not expand to an entire domain by default. A map returns URLs, not content. If map/crawl is unavailable, collect supplied or discovered document URLs with `firecrawl_scrape` and report the limited inventory.
4. Inspect crawl data first; if pending, continue the returned job through `firecrawl_check_crawl_status` rather than restarting. Track discovered, collected, excluded, duplicate, failed, and restricted pages. Stop when the agreed scope is sufficiently covered, not at a mandatory scrape count. Call a mirror complete only against a defined inventory with disclosed failures and exclusions.
5. Preserve code blocks, tables, headings, source URLs, document/version labels, acquisition time, source update dates when supplied, and provider provenance. Remove navigation chrome without deleting substantive content. Deduplicate canonical pages while preserving conflicting versions. Do not present retrieval time as document freshness.

For a fitting contract returning authoritative documentation content or export records, inspect only selected identifiers
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

## Small argument examples

These illustrate arguments, not retrieval results. For contract discovery with `firecrawl_find_tools`:

```json
{"name":"firecrawl_find_tools","arguments":{"query":"Documentation article export with full markdown content, canonical URLs, version and section metadata","limit":3,"expand":[]}}
```

For a bounded docs inventory with `firecrawl_map`, replace the illustrative source:

```json
{"name":"firecrawl_map","arguments":{"url":"https://example.com/docs","search":"API reference","limit":20,"includeSubdomains":false}}
```

## Output modes

- **Reference:** Markdown documents, `index.md`, and `sources.json` with links and coverage.
- **RAG:** Markdown documents, chunk files, and `manifest.json`. Each chunk needs a stable ID, canonical source URL, section/heading, document version when known, and source offsets or another reproducible location. Split at meaningful boundaries and preserve code/table context; disclose overlap and chunking choices.
- **Training:** Source documents, `training-data.jsonl`, and `training-metadata.json` in the user's requested format. Preserve provenance, permitted-use limitations, exclusions, and transformation rules. Public availability does not establish training rights.
- **Docs mirror:** Markdown documents with a table of contents and an inventory of scope, versions, collected pages, and failures.

If the host supports files, a logical layout can use `<hostname>/<path>/index.md`; do not require a local directory. Otherwise return a named artifact manifest and the corresponding Markdown/JSON/JSONL inline, in bounded parts if necessary.

```markdown
# Knowledge Base: [Source]
## Summary
[What was collected and why]
## Output Structure
[Accessible artifacts or named inline outputs actually delivered]
## Coverage
[Sections, source types, counts, versions, exclusions and failures]
## Usage Notes
[Reference/RAG/training/docs usage, transformations and limitations]
## Sources
[Collected URLs and provider provenance]
## Rerun Inputs
workflow: firecrawl-knowledge-base
source: [url/topic]
goal: [reference/rag/train/docs]
depth: [quick/thorough/exhaustive with explicit scope]
output: [host-supported artifact or inline format]
```

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
