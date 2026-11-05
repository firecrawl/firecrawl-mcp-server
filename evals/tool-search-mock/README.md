# Tool-search mock MCP server

An offline stdio MCP server for measuring how agent harnesses (Claude Code, Codex) discover tools through their built-in tool search. It makes no network calls and returns canned results, so runs spend model tokens only.

It ships two commands from one package:

| Command | Tools | Shape |
| --- | --- | --- |
| `ax-ts-mock-a` | 28 | Today's hosted surface from `tests/contract-snapshots/hosted-full.json` (API-key session). Alexandria is reachable only through `firecrawl_search` and `firecrawl_find_tools`, then `firecrawl_scrape` with `alexandria`. |
| `ax-ts-mock-b` | 28 + 294 | The same, plus one tool per Alexandria capability, named `<provider>_<capability>` (for example `npmjs_packages_get_downloads`) and described with the capability and provider descriptions. |

Both variants serve the same server instructions, mark `firecrawl_search` and `firecrawl_scrape` with `_meta["anthropic/alwaysLoad"]` as the hosted server does, and drop `outputSchema` so canned results need no structured content. `firecrawl_find_tools` and the Alexandria section of `firecrawl_search` rank the same 294-capability catalogue with BM25, so both variants expose the same capabilities and differ only in how they are surfaced.

Set `TS_MOCK_LOG=/path/file.jsonl` to log every `tools/call`.

## Build

```bash
python3 build.py                     # writes package/data from raw/ and the contract snapshot
node selftest.mjs a && node selftest.mjs b
(cd package && npm pack --pack-destination ../dist)
```

`raw/` holds the catalogue pull the build uses: `seed-items.json` (capabilities returned by `firecrawl_find_tools` for 18 task queries), `filler-items.json` (every capability of 14 further providers) and `provider-directory.json` (names and descriptions of the 69 providers involved).

## Use

Install the packed tarball globally and point the harness at one command, keeping the `firecrawl` server id so tool names match production (`mcp__firecrawl__firecrawl_search` in Claude Code):

```bash
npm install -g ./dist/firecrawl-tool-search-mock-0.1.0.tgz
claude mcp add firecrawl -- ax-ts-mock-b
codex mcp add firecrawl -- ax-ts-mock-b
```
