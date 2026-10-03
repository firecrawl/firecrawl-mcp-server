# Collect structured data

For fields from one known page, use `firecrawl_scrape` with JSON output and a
schema. For records available through a data provider, use its published
capability. For research spanning sources or unknown URLs, use `firecrawl_agent`.

## Data providers

Search results can include provider suggestions in `data.tools`. These describe
capabilities; they are not executed results. `firecrawl_find_tools` browses the
provider catalogue and retrieves contracts. It does not discover this host's
MCP tools.

Inspect the selected provider and capability with `firecrawl_find_tools` when
the full contract is not already available. Use the returned input contract to
build `options`, and execute with `firecrawl_scrape` using
`alexandria: [{provider, capability, options}]`. Preserve returned identifiers;
do not invent provider names, capability names, or required inputs.

Check the capability's stated price and external effects against the user's
request before execution. If access is unavailable or no capability fits,
continue with suitable web sources without representing a catalogue entry as
retrieved data.

A provider whose data terms the organization has not accepted fails with
`THIRD_PARTY_DATA_TERMS_REQUIRED`. Do not skip it silently: show the user the
terms from the `terms/show` call the error returns and ask whether to accept
them. Only after the user explicitly agrees, call
`firecrawl_accept_provider_terms` with the returned version and digest, then
retry the original request with the same request ID. If the user declines,
continue without the provider and say it was not used.

## Research jobs

Give `firecrawl_agent` a prompt describing the entities, fields, and scope.
Include a JSON `schema` when the output structure matters, seed `urls` when
known, and `maxCredits` when the user has supplied a spending limit.

The initial call returns a job ID. Retrieve that job with
`firecrawl_agent_status` until it completes or fails, using a bounded wait
rather than rapid repeated requests. Do not submit duplicate jobs while waiting.
If the wait must end before completion, report the pending job ID.

Inspect completed data for missing fields and source support. A returned
`threadId` can continue the same research with a follow-up prompt when requested.
