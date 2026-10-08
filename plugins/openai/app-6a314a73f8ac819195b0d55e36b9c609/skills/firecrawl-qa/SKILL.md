---
name: firecrawl-qa
description: Test website navigation, forms, content, and visible error states with evidence-backed reproduction steps and a severity-ranked QA report. Scope responsive or performance checks to capabilities actually available.
license: ISC
---

# Firecrawl QA

Use this to test a live site and return a unified QA report. Infer URL, focus, output format, and permitted actions. Ask for clarification only if a missing target, test scope, or authorization blocks progress.

Use the existing Firecrawl connection, resolve deferred tools and follow the live schemas. Respect requested routes, test actions, time/credit limits and account restrictions without default budgets or test quotas. Retrieval is billed; if reporting spend, use returned receipts rather than catalogue prices. Count aggregates and included child charges once, replace cumulative totals and exclude account-wide counters; missing usage is unknown.

`firecrawl_interact` and `firecrawl_interact_stop` are required for functional interaction tests. Use available map/scrape tools for discovery and captures; narrow the report and mark affected tests untested when tools or instrumentation are absent.

## Plan evidence, not quotas

Start with the supplied site and highest-risk requested flow, reusing relevant test evidence when its state, version and capture time fit. Use `firecrawl_map` only when route discovery is needed. A map lists indexed URLs, not verified links or complete coverage. After each result, choose the next missing test or reproduction step that could change the QA conclusion; do not tour every route merely because this skill is active.

Alexandria is optional, not a gate before live QA. Use discovery only if the user requests a structured audit dataset or an external fact needed for a test, and a published contract plausibly covers the exact domain and required fields. Provider records do not prove a form works, a route navigates correctly, or a layout renders correctly. Verify reported site defects with current page or interaction evidence, and identify historical provider findings separately. Skip Alexandria when the task is simply to exercise a live flow.

If a test needs an external fact, use normal `firecrawl_search` and inspect relevant pages and matching suggestions. When exposed, set `objective` to `[qa]` plus the consistent QA goal, without sensitive test/account details; keep the focused `query` untagged and omit unsupported `objective`. Reuse complete contracts. Expand only a missing selected contract with `firecrawl_find_tools` or returned `nextTool.arguments`, preserving selectors; a combined catalogue ID may not be an execution selector. Inspect inputs, `requiresOneOf`, `response.key`, pagination, freshness, price and effects. Catalogue pagination returns contracts, not test evidence.

Execute returned provider/capability/options through `firecrawl_scrape` Alexandria mode, using batches or `version` only as the live schema permits. Keep payload-bound `requestId` and millisecond `timeout` separate from URL formats and `maxAge`. Inspect every `data.alexandria` item, retain successes and use documented item-specific continuation for failures. Page only with declared inputs and unchanged filters while the requested evidence gap remains.

For uncertain retries retain identical request ID and payload; changed inputs require a new ID. Do not duplicate in-flight requests or replay successful items. Stop unresolved access, terms or budget routes while retaining evidence and continuing permitted live tests. Terms require an organization administrator outside this workflow; resume retained requests after confirmed acceptance only when contract, access and budget permit. Keep provider/capability/version, request/record IDs, URLs and retrieval/as-of times with external facts. Disclose unknown freshness and retention failures instead of silently rerunning paid work.

Example `firecrawl_map` arguments:

```json
{
  "name": "firecrawl_map",
  "arguments": {
    "url": "https://example.com",
    "limit": 20,
    "includeSubdomains": false,
    "ignoreQueryParameters": true
  }
}
```

If a structured audit is relevant, compact `firecrawl_find_tools` discovery can use:

```json
{
  "name": "firecrawl_find_tools",
  "arguments": {
    "urls": ["https://example.com"],
    "query": "website audit findings with page URLs and evidence",
    "limit": 3,
    "expand": []
  }
}
```

Only execute a returned provider/capability after inspecting its complete contract and confirming scope, freshness, price and effects; reuse a contract already returned in full. No provider is assumed to offer QA capabilities.

## Run bounded tests

- **Navigation and links:** capture visible links with `firecrawl_scrape`, then follow relevant routes with `firecrawl_interact`. Record destinations, redirects, visible failures, and expected versus actual behavior. A missing map entry does not establish an orphan page; a retrieval error alone does not establish a broken link.
- **Forms and interactions:** inspect controls, validation, happy paths, and edge cases within the authorized scope. Use approved test data only. Do not send messages, create accounts, purchase, or perform persistent actions without explicit permission. Pause before a consequential submission; a visible button is not permission to press it.
- **Content, visual, and error states:** collect screenshots or page evidence for missing copy, overlapping content, misleading CTAs, and reproducible visible failures. Inspect actual pixels or returned text, not screenshot captions or locators alone. Keep URL, observation time, state, viewport and supporting control/text/screenshot locator with each finding. Report inferred concerns separately from confirmed bugs.
- **Responsive:** when supported, compare screenshot captures with declared `screenshotOptions.viewport` sizes or `mobile`. This is a capture comparison, not proof of full device behavior. Do not claim interactive mobile/tablet testing without corresponding session evidence. Record tested dimensions, pages, and states.
- **Performance:** report only measured values returned by available tooling or clearly labeled observations. Do not invent load times, Core Web Vitals, network diagnostics, or console errors from scrape success, timeout, or screenshot appearance. Mark unavailable instrumentation as untested.

Example initial `firecrawl_interact` arguments:

```json
{
  "name": "firecrawl_interact",
  "arguments": {
    "url": "https://example.com/contact",
    "prompt": "Inspect the contact form fields, required indicators, labels and visible validation guidance. Do not submit the form or send a message. Return the URL and concrete observations.",
    "timeout": 60
  }
}
```

Continue using the actual returned `scrapeId` and a bounded `prompt`; use either `url` or `scrapeId`, never both. `scrapeOptions` is only valid with `url`; use an authorized saved remote profile with `scrapeOptions.profile.saveChanges: false` unless writeback was requested. Do not assume inherited local login. Interaction `timeout` uses seconds. Use URL-mode `maxAge: 0` for requested fresh captures when supported, preserving returned freshness evidence. Inspect each result before the next test. Stop with `firecrawl_interact_stop` and that `scrapeId` when finished, unless the user requests continuation; report failed cleanup.

## Final deliverable

Stop when the requested tests and material reproduction gaps are supported and further targeted testing is unlikely to change the report, or when limits/access prevent progress. Return a host artifact or inline Markdown/JSON with source URLs, observation times, actual evidence links, coverage gaps and stop reason. If the account and host support Intelligent UI, a cited state/issue diagram may clarify findings but must not imply untested transitions or replace reproduction steps.

```markdown
# QA Report: [Site]

## Summary
- Health score: [x/10 with rubric and coverage, or not rated]
- Pages tested: [count]
- Issues found: [critical/major/minor counts]

## Critical Issues
[C-1] URL | Description | Evidence | Steps | Expected vs actual

## Major Issues
[M-1] URL | Description | Evidence | Steps | Expected vs actual

## Minor Issues
[m-1] URL | Description | Evidence | Steps

## Positive Observations
[What was verified to work]

## Pages Tested
[URLs, states, viewport if relevant, tested/blocked/untested status]

## Agent/Test Summary
[Actual test methods, scope, limitations]

## Rerun Inputs
workflow: firecrawl-qa
url: [url]
focus: [full/forms/navigation/responsive/performance]
constraints: [authorized actions and exclusions]
```

Deduplicate findings by root cause and include reproducible steps, preconditions and expected versus actual behavior for functional issues. Severity must reflect observed impact, not invented measurements. Verify consequential claims against the tested version/state; mark contradicted or non-reproducible findings unresolved. Repeated captures of one failure are not independent issues. Keep attempted, blocked and untested cases visible rather than counting them as passes or confirmed failures.

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
