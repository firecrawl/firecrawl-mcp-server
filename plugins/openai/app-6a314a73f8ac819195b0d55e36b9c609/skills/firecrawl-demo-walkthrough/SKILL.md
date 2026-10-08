---
name: firecrawl-demo-walkthrough
description: Document a product's screens, CTAs, forms, and transitions in a step-by-step UX walkthrough for demo preparation, onboarding review, pricing, docs, or core product exploration.
license: ISC
---

# Firecrawl Demo Walkthrough

Use this to document a product experience step by step. Infer the product URL, flow focus, constraints, and output format. If the URL is clear, proceed; ask for clarification only when a missing URL, flow boundary, or authorization blocks the work.

Use the existing Firecrawl connection, resolve deferred tools and follow the live schemas. Respect requested flows, time/credit limits and account restrictions without imposing budgets or screen quotas. Web searches are billed per request; provider-only discovery is free; page retrieval uses URL pricing and provider execution uses listed capability pricing; if reporting spend, use returned receipts rather than catalogue prices. Count aggregates and included child charges once, replace cumulative totals and exclude account-wide counters; missing usage is unknown.

A live walkthrough needs `firecrawl_interact` and `firecrawl_interact_stop`; if unavailable, offer a static content walkthrough with `firecrawl_scrape` and mark transitions and protected flows untested.

## Collection decisions

Start with the supplied URL and requested flow, reusing relevant captures or observations when their state and freshness fit. After each observation, choose the next missing screen or transition that matters to the walkthrough, not a fixed tour of every section. Alexandria is not a prerequisite for UI observation. A matching contract may supply requested product/plan comparisons, but cannot prove a transition or current UI state; check domain, plan identity, units and dates. Skip discovery for a single live flow unless a concrete missing fact warrants it.

For a missing public product fact, use normal `firecrawl_search` and inspect relevant pages and matching suggestions. When exposed, set `objective` to `[demo-walkthrough]` plus the consistent walkthrough goal; keep `query` focused and untagged, omit unsupported `objective` and sensitive details. Reuse complete contracts; expand only an incomplete selected one with `firecrawl_find_tools` or returned `nextTool.arguments`, preserving selectors. A combined catalogue ID may differ from execution selectors. Inspect inputs, `requiresOneOf`, `response.key`, pagination, freshness, price and effects; catalogue pagination is not record pagination.

Execute returned provider/capability/options through `firecrawl_scrape` Alexandria mode; use batches or `version` only as the live schema permits. Payload-bound `requestId` and millisecond `timeout` are separate from URL formats and `maxAge`. Inspect every `data.alexandria` item, retain successes and use documented item-specific continuation for failures. Page only with declared inputs, unchanged filters and a remaining comparison gap.

Retain identical request ID and payload for uncertain retries; changed inputs require a new ID. Do not duplicate in-flight requests or replay successful items. Stop unresolved access, terms or budget routes while retaining facts and continuing permitted UI flows. Terms require an organization administrator outside this workflow; resume retained requests after confirmed acceptance only when contract, access and budget permit. Keep provider/capability/version, request/record IDs, URLs and retrieval/as-of times beside comparison facts. Disclose unknown freshness and retention failures; do not silently rerun paid work.

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

Use this discovery only when the requested comparison needs a missing structured route. Reuse complete contracts; do not treat a catalogue listing as product facts or invent plan endpoints.

## Walk the product

1. Open the requested page with `firecrawl_interact`, supplying `url` and a bounded `prompt`. Continue with the actual returned `scrapeId`, not a new session for every step. Use one of `url` or `scrapeId`; `scrapeOptions` is valid only with `url`. A remote session does not inherit a local login; use a saved remote profile only when authorized, with `scrapeOptions.profile.saveChanges: false` unless writeback was requested. Interaction `timeout` uses seconds.
2. Cover only relevant flows: homepage/marketing, signup/onboarding, pricing, docs/developer experience, dashboard/core product, or help/support. Record each screen's URL, observation time, UI state, controls, action, resulting state, and friction with the supporting text/control or screenshot locator. Inspect results after each transition; a screenshot URL alone is not an inspected visual observation. Label unavailable evidence and state-specific access gaps.
3. Use `firecrawl_scrape` for supporting content or screenshots when needed to close a specific gap; use URL-mode `maxAge: 0` for a requested fresh capture when supported, without assuming it proves current content. A static capture does not prove every interactive state was tested. Reuse directly supporting returned content rather than recollecting unchanged pages.
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

Stop when the requested flow and material friction points are documented and further observation is unlikely to change the walkthrough, or when limits/access prevent progress. Return a host artifact or inline Markdown with screenshot/artifact URLs, observation times, coverage gaps and any retention limits. If the account and host support Intelligent UI, a cited flow diagram may clarify observed transitions but must not fill untested steps or replace the walkthrough.

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

Be specific about screens, CTAs, forms, and transitions. Verify meaningful claims against observed state and source locators, distinguishing observations from opinions and recommendations. Mark visited, attempted, blocked, and untested flows and explain where collection stopped. A product listing is not a live walkthrough; matching marketing and docs copy from the same source is not independent confirmation of behavior.

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
