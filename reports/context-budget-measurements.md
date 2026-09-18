# MCP context-budget measurements

Measured September 18, 2026. Baseline: `1d82247` (before response budgets). Candidate: the existing `alexandria-mcp` branch with the oversized-error fix and dual-tokenizer framing checks.

## Scope

- Synthetic fixtures at the sizes reported in F73; these are not measurements of fresh SAM.gov/Indeed/YC provider data.
- 28 fixture/budget combinations: seven payload types at 512, 1,000, 4,000 and 16,000 tokens; three local formatting timings per combination.
- Real stdio MCP transport against a local fake API, for search, expanded discovery, execution and a large provider error.
- `cl100k_base` and `o200k_base` counts; no claim of exact Claude/Cursor/Codex context accounting. Client framing and other tokenizers differ.
- 124 MCP tests pass, including a further 20 adversarial text/budget combinations, escaped JSON Pointer paths, eight concurrent owners, eviction, expiry, failed file writes, ZDR and HTTP credential isolation. Build and TypeScript checks pass.

## Default budget: initial output and selective reads

Token figures below use cl100k_base. The enforced 4,000-token ceiling includes serialized MCP content framing, so text normally lands below 4,000.

| Synthetic fixture | Original tokens | Preview tokens | Selected fields tokens | Median formatting ms | Max of 3 ms |
|---|---:|---:|---:|---:|---:|
| batch-72KB | 11,674 | 3,420 | 72 | 69.13 | 81.46 |
| search-144KB | 23,236 | 3,584 | 71 | 49.82 | 56.14 |
| jobs-431KB | 70,486 | 3,586 | 73 | 51.51 | 57.25 |
| contracts-1.14MB | 195,114 | 3,658 | 76 | 44.99 | 60.13 |
| opportunities-2.5MB | 370,296 | 3,591 | 75 | 99.57 | 104.45 |
| unicode-72KB | 22,792 | 3,714 | 77 | 117.64 | 131.99 |
| escaped-72KB | 25,774 | 3,018 | 70 | 148.24 | 162.68 |

Selected reads retrieve the last record's ID/title, rather than loading the whole result. Expanded discovery and contract examples remain present in the retained result.

## Actual MCP transport

| Call | Baseline text tokens | Candidate text tokens | Candidate serialized result tokens | Candidate round-trip ms |
|---|---:|---:|---:|---:|
| firecrawl_search | 402,135 | 3,592 | 3,963 | 849.7 |
| firecrawl_exchange_discover | 402,135 | 3,592 | 3,963 | 111.07 |
| firecrawl_scrape | 402,158 | 3,592 | 3,963 | 119.46 |
| firecrawl_scrape (error) | 30,039 | 3,945 | 3,967 | 43.43 |

Round-trip measurements stop when the MCP response arrives, before benchmark token counting. The first candidate call includes cold tokenizer initialization; subsequent calls are warm. These are local single-run timings, not production latency percentiles.

### Bugs found by measurement

- Large thrown errors bypassed the response guard and duplicated their message in structuredContent: approximately 30,000 text tokens and 60,000 serialized tokens. The guard now bounds those errors while retaining `isError: true`, without sending the large structured payload a second time.
- Limiting only text to 4,000 cl100k tokens allowed JSON framing and escaped content to exceed the budget. The guard now checks the serialized content envelope with both cl100k_base and o200k_base and reserves 32 tokens for outer framing.

## Tool-definition overhead

- baseline: 31 tools; 10,660 serialized listing tokens; 591 server-instruction tokens.
- current: 32 tools; 11,515 serialized listing tokens; 591 server-instruction tokens.

The budget argument and reader add 855 listing tokens. This is setup overhead, not a response-size regression. Clients that load every tool eagerly still pay it; the output cap does not cap tools/list.

## Reading everything does not save total context

The batch-72KB fixture reconstructs byte-for-byte through 4 responses: 12,237 text tokens cumulatively versus 11,674 original tokens (4.8% continuation overhead). Savings require selecting relevant paths/fields or saving data outside the conversation. Reading all chunks into context defeats that purpose.

A conservative 20-response allowance at 4,000 tokens plus the full tool listing and server instructions is about 92,106 tokens before user messages, reasoning or previous history. At a 1,000-token response budget it is about 32,106 tokens. Per-response limits cannot guarantee the remaining conversation window.

## Remaining deployment limitation

A result written into one ResultStore instance cannot be read from another. This is expected and tested: the cache is process-local. Hosted MCP has multiple replicas, so shared storage or equivalent routing is still required for reliable follow-up reads. No infra changes or production deployments were made. F73 remains open.

## Reproduce

```bash
npm run measure:context
# Optional: compare a separately built baseline checkout
MCP_BASELINE_DIR=/path/to/baseline npm run measure:context
```

Raw data: [context-budget-measurements.json](context-budget-measurements.json). Timings vary with hardware and load. The script makes only local fixture API calls and does not need real credentials.
