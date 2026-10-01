# Retrieve data-provider records

Search results can include provider suggestions in `data.tools`. These describe
capabilities; they are not executed results. `firecrawl_find_tools` browses the
provider catalogue and retrieves contracts. It does not discover this host's
MCP tools.

Inspect the selected provider and capability with `firecrawl_find_tools` when
the full contract is not already available. Build `options` from that contract
and execute with `firecrawl_scrape` using
`alexandria: [{provider, capability, options}]`. Preserve returned identifiers
and do not invent required inputs.

Check the capability's stated price and external effects against the user's
request before execution. If access is unavailable or no capability fits, use
`firecrawl_search` and page retrieval where suitable. Read the executed result
before answering; a catalogue match alone does not supply the requested data.
