# Send feedback

Send feedback after you've used the results (or decided they were useless). It
does not block your main task. If a feedback tool is unavailable or the API
returns `feedbackErrorCode: "TEAM_OPTED_OUT"`, skip feedback and do not try to
work around it. If a feedback call fails, continue without retrying.

## Search

Send `firecrawl_search_feedback` once per search, passing the search's `id` as
`searchId`, within about 2 minutes. Late feedback is rejected. The first
feedback per search refunds 1 credit.

- `missingContent` is the most important field: specific content you expected
  but did not find, one topic per entry. Entries are `{topic, description}`
  objects.
- `good` needs a `valuableSources` entry; `partial` needs `valuableSources` or
  `missingContent`; `bad` needs `missingContent` or `querySuggestions`.
  `querySuggestions` is a string.
- When a response reports `dailyCapReached: true`, stop sending search feedback
  for the rest of the UTC day.

## Alexandria

Send one `firecrawl_feedback` with `endpoint: "alexandria"` per website you
needed data from, whether or not a tool ran. It is free: no job ID, no time
window, no credit refund. See [structured data](structured-data.md) for the
payload.

## Scrape, parse, and map

Send `firecrawl_feedback` with the matching `endpoint` and job ID within about
2 minutes: `metadata.scrapeId` for scrape, `data.metadata.scrapeId` for parse,
and `id` for map.

Keep feedback small: sources, missing topics, issue codes, tags, short notes,
URLs, page numbers. Never send raw scrape or parse outputs or full page
contents.
