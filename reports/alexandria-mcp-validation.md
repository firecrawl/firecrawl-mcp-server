# Alexandria MCP validation — September 19, 2026

Tested branch `alexandria-mcp` locally over MCP stdio against the production Firecrawl API. Automated tests also cover local HTTP transports with API fixtures. These results do not certify hosted deployment or every agent harness.

## Automated checks

- Build and TypeScript check pass.
- All 117 tests pass, including authenticated/keyless surfaces, credential recovery, provider terms, default search and source opt-outs, progressive listing, selected contract expansion, large-output preservation, and Bash forwarding.
- Fixed a test isolation issue: the smoke-test child previously inherited local API/OAuth credentials, making a nominally keyless instruction check fail on an authenticated developer machine. The helper now starts without credentials unless a test explicitly supplies them.

## Live MCP observations

| Operation | Response bytes | Time | Outcome |
| --- | ---: | ---: | --- |
| Default search | 49,514 | 3.75 s | 3 web results + 3 tool matches |
| Semantic-only search | 45,691 | 1.43 s | 3 tools, no web results |
| Web-only search | 3,043 | 0.81 s | 2 web results, no tools |
| Categories | 1,112 | 0.14 s | Returned continuation; next page worked |
| Compact provider tools | 2,215 | 0.25 s | Small tool list |
| Selected full contract | 12,270 | 0.17 s | Inputs, output contract and example available |
| SAM.gov search, 100 detailed records | 2,322,056 | 4.10 s | Full result received by the test MCP client |
| Bash source loading + shape inspection | 847 | 0.87 s | `response.json` available; keys inspected |
| Bash count + 3 projected records | 1,218 | 0.55 s | 100 records counted; stdout only 624 bytes |
| Regular URL scrape | 584 | 0.40 s | Scrape ID available |
| Regular scrape → Bash | 772 | 0.36 s | `document.md` readable |
| Workspace read from another MCP process | 554 | 0.65 s | Same workspace accessible with same credentials |
| Identical request replay | 2,322,056 | 0.44 s | Same scrape ID and identical data |
| Saved-output readback | 583 | 0.44 s | Correct count read from returned virtual stdout file |

Times are single local observations, not production latency percentiles. SAM.gov was the large-result test target, not a recommended default provider in tool instructions. No terms acceptance was performed.

## Failure and continuation checks

- Supplying both URL and Alexandria execution is rejected by MCP parameter validation.
- An unavailable workspace returns a per-capability `workspace_unavailable`/404. This is not a timed expiry test.
- A missing virtual file returns command exit code 1 and stderr. The following command succeeds in the same workspace.
- Unicode stdout round-trips intact.
- `saveOutput:true` returns virtual output paths; a later MCP process reads the saved result successfully.
- API/provider and Bash command errors can appear inside a successful outer envelope. Agents must inspect per-capability errors and `exitCode`, as documented.

## Context measurements and limits

Measured with `cl100k_base` using local js-tiktoken 1.0.21 over reserialized compact JSON, excluding MCP transport framing. These are comparisons, not client-specific context limits:

| Content | Tokens |
| --- | ---: |
| All 31 tool definitions | 11,017 |
| Default search result | 14,295 |
| Semantic-only search result | 11,013 |
| Compact provider tool list | 569 |
| Selected full contract | 3,273 |
| Full SAM.gov response | 522,758 |
| Bash count + selected records response | 417 |

Progressive listing and remote selection work. Search can still return large full contracts, and the initial full execution can overwhelm a harness. There is no automatic overflow interception or knowledge of the client's remaining context. The test client saves payloads outside model context, so successful transport here does not prove an agent can accept the entire payload.

Keep F73 open: verify agent-level behavior in target harnesses and decide how to route large initial results before delivery. No default token cap is introduced. Workflow retention eligibility, source expiry, and the five-minute idle workspace TTL still apply. Actual TTL expiry, cross-account isolation against live production, and hosted multi-replica behavior were not independently exercised in this run.
