---
name: firecrawl-demo-walkthrough
description: Document a product's screens, CTAs, forms, and transitions in a step-by-step UX walkthrough for demo preparation, onboarding review, pricing, docs, or core product exploration.
license: ISC
---

# Firecrawl Demo Walkthrough

Use this to document a product experience step by step. Infer the product URL, flow focus, constraints, and output format. If the URL is clear, proceed; ask at most 1–3 concise questions only when a missing URL, flow boundary, or authorization blocks the work.

Use the named Firecrawl MCP tools, resolving deferred tools through the host's tool search.

Bound the screens, transitions and credits for the requested walkthrough.
URL scraping is billed per URL.
Provider-only discovery is free; execution uses the selected capability’s price.

A live walkthrough needs `firecrawl_interact` and `firecrawl_interact_stop`; if unavailable, offer a static content walkthrough with `firecrawl_scrape` and mark transitions and protected flows untested.

## Collection decisions

Start directly with the supplied URL and requested flow. Alexandria is not a prerequisite for observing UI behavior. For a requested comparison across products, a discovered provider contract may supply product descriptions or plan facts, but it cannot prove a screen transition, onboarding experience, or current UI state. Select it only when its domain, fields, and freshness fit the comparison; use live evidence for the actual walkthrough. Skip provider discovery for a single live flow unless a concrete missing fact warrants it.

For a fitting contract returning product comparison facts, not screen transitions, inspect only selected identifiers
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

For optional structured comparison discovery, `firecrawl_find_tools` accepts:

```json
{
  "name": "firecrawl_find_tools",
  "arguments": {
    "query": "product descriptions and pricing plans for a product comparison",
    "limit": 3,
    "expand": []
  }
}
```

Use only returned provider/capability identifiers and inspect the selected full input/response contract before execution. Do not treat a catalogue listing as product facts or invent plan endpoints.

## Walk the product

1. Open the requested page with `firecrawl_interact`, supplying `url` and a bounded `prompt`. Continue with the actual returned `scrapeId`, not a new session for every step. Use one of `url` or `scrapeId`; `scrapeOptions` is valid only with `url`. Interaction `timeout` uses seconds.
2. Cover only relevant flows: homepage/marketing, signup/onboarding, pricing, docs/developer experience, dashboard/core product, or help/support. Record each screen's URL, visible content, CTA/form controls, action taken, resulting state, and friction. Inspect the output after every transition. Obtain screenshots when the available surface returns them; label missing visual evidence rather than inventing captures.
3. Use `firecrawl_scrape` for supporting page content or screenshots when useful. These captures are evidence of the returned page, not proof that every interactive state was tested. Do not over-collect unchanged pages once the requested flow is documented.
4. Do not submit real credentials, make purchases, or perform irreversible actions unless the user explicitly instructs them and has permission. Do not create accounts or send form submissions merely to complete a walkthrough. Pause at an authorization boundary and document where the observed flow ends.
5. Finish with `firecrawl_interact_stop` using the session's returned `scrapeId`, unless the user explicitly requests continued use. Report an incomplete action or failed cleanup honestly.

Example initial `firecrawl_interact` arguments:

```json
{
  "name": "firecrawl_interact",
  "arguments": {
    "url": "https://example.com",
    "prompt": "Inspect the homepage and describe visible navigation, main CTAs and links to pricing and documentation. Do not submit forms, sign up, purchase, or change settings. Return the current URL and observations.",
    "timeout": 60
  }
}
```

Example supporting `firecrawl_scrape` arguments:

```json
{
  "name": "firecrawl_scrape",
  "arguments": {
    "url": "https://example.com/pricing",
    "formats": ["markdown", "screenshot"],
    "screenshotOptions": {"fullPage": true},
    "onlyMainContent": false,
    "maxAge": 0
  }
}
```

## Final deliverable

Return a host artifact or inline Markdown. Preserve screenshot/artifact URLs with capture times and any expiry limitations; no local file is required.

```markdown
# Product Walkthrough: [Product]

## Product Overview
[What the product does, with sources]

## Flow Walkthroughs
### [Flow Name]
1. [Screen/URL] — what appears, available actions, action actually taken
2. [Next Screen/URL] — observed change and supporting evidence

## Key Findings
[First impression, standout patterns, friction; distinguish fact from opinion]

## Recommendations
[UX/product improvements grounded in observed flows]

## Pages Visited
[Every URL visited and capture time]

## Rerun Inputs
workflow: firecrawl-demo-walkthrough
url: [url]
focus: [full/signup/pricing/docs/dashboard/help]
constraints: [actions excluded or requiring permission]
```

Be specific about screens, CTAs, forms, and transitions. Separate observations from recommendations and distinguish visited, attempted, blocked, and untested flows. A page listing or product description is not a completed live walkthrough.

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
