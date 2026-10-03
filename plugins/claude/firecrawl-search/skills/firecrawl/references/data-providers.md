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

A provider whose data terms the organization has not accepted fails with
`THIRD_PARTY_DATA_TERMS_REQUIRED`. Do not skip it silently: show the user the
terms from the `terms/show` call the error returns and ask whether to accept
them. Only after the user explicitly agrees, call
`firecrawl_accept_provider_terms` with the returned version and digest, then
retry the original request with the same request ID. If the user declines,
continue without the provider and say it was not used.
