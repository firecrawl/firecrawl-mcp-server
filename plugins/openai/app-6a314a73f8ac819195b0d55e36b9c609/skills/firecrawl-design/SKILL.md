---
name: firecrawl-design
description: Extract a website's design language into an agent-ready DESIGN.md with colors, typography, spacing, components, layout, imagery, and evidence. Distinguish observed tokens from inferred approximations and asset-rights limitations.
license: ISC
---

# Firecrawl Design

Use this when the user wants a URL turned into a practical design system for a new site or an inspired implementation. Default output is `DESIGN.md`, not a guaranteed faithful clone or a downloaded asset bundle. Infer source URL, target stack, and whether implementation is requested. Ask for clarification only for blocking inputs. If the user asks to implement, produce or update `DESIGN.md` first and use it as the build's source of truth.

Use the existing Firecrawl connection, resolve deferred tools and follow the live schemas. Respect requested pages, time/credit limits and account restrictions without default budgets or capture quotas. Retrieval is billed; if reporting spend, use returned receipts rather than catalogue prices. Count aggregates and included child charges once, replace cumulative totals and exclude account-wide counters; missing usage is unknown.

Inspect `firecrawl_scrape`'s live formats enum before capture: deployed servers may lag the skill. Do not promise unsupported image collection or measurements.

## Capture complementary evidence

Start with the supplied representative URL or reusable captures whose page, state and date fit; do not map or crawl the site by default. Collect missing complementary evidence: structured `branding`, page `images` when supported, a full-page `screenshot`, and `markdown`. These can be combined in a supported scrape request. Keep `onlyMainContent: false` for navigation and section context. Use supported `maxAge: 0` for requested fresh captures, distinguishing requested freshness from returned cache/as-of evidence. After inspecting each result, choose the next unresolved token, component or layout fact needed for the requested build; do not recapture evidence already sufficient.

`firecrawl_scrape` example, only after confirming `images` is accepted:

```json
{
  "name": "firecrawl_scrape",
  "arguments": {
    "url": "https://example.com",
    "formats": ["branding", "images", "screenshot", "markdown"],
    "screenshotOptions": {"fullPage": true},
    "onlyMainContent": false,
    "maxAge": 0
  }
}
```

If the live schema lacks `images`, omit it and explicitly disclose incomplete content-image collection. Do not retry an unsupported format or imply `branding.images` is an equivalent substitute: branding includes curated assets such as logo, favicon, ogImage, and logoHref, not the full page's hero photography, product shots, carousels, illustrations, or decorative graphics.

- Use structured branding as the primary evidence for colors, typography, spacing, buttons, brand assets, personality, and confidence notes. Report missing branding fields rather than fabricating tokens.
- When returned, use the page-level `images` list to identify representative hero, product, feature, section, and decorative imagery beyond curated brand assets. A returned URL list is not proof of a complete downloaded bundle, all carousel states, or reusable asset rights.
- Use the full-page screenshot for layout, hierarchy, density, and overall feel. Preserve its returned URL or host artifact near the top of `DESIGN.md`; disclose expiry/retention limitations. Do not invent a local path or claim an image was downloaded when the host cannot save it.
- Use markdown for headings, CTAs, navigation, copy hierarchy, and section order. Add HTML only to resolve missing font names, CSS variables, classes, or component structure. Fetch related pages only for a requested broader system or a material unresolved design question. For user-supplied PDF brand guidelines, including extensionless document URLs, use supported `parsers: ["pdf"]` and choose `pdfOptions.maxPages` for the relevant tokens and user limits; disclose truncation and possible full requested-page charges on rereads.

Example supplemental `firecrawl_scrape` arguments:

```json
{
  "name": "firecrawl_scrape",
  "arguments": {
    "url": "https://example.com",
    "formats": ["html"],
    "onlyMainContent": false,
    "maxAge": 0
  }
}
```

Alexandria is optional, not a prerequisite for visual capture. Use a fitting contract only for relevant branding/asset metadata for the exact source domain, scope and date. Generic company logos or profiles cannot replace page screenshots, layout or content imagery. Reuse complete contracts and tokens rather than recollecting them.

If an external design fact requires search, use normal `firecrawl_search` and inspect relevant pages and matching suggestions. When exposed, set `objective` to `[design]` plus the consistent design-extraction goal; keep `query` focused and untagged, omit unsupported `objective` and avoid sensitive details. Expand only a missing selected contract with `firecrawl_find_tools` or returned `nextTool.arguments`, preserving selectors. A combined catalogue ID may not be an execution selector. Inspect required inputs, `requiresOneOf`, `response.key`, pagination, freshness, price and effects; catalogue pagination is not an asset inventory.

Execute returned provider/capability/options through `firecrawl_scrape` Alexandria mode, batching or pinning `version` only as the live schema permits. Payload-bound `requestId` and millisecond `timeout` are separate from URL formats and `maxAge`. Inspect every `data.alexandria` item, retain successful metadata and use documented item-specific continuation for failures. Page only with declared inputs and unchanged filters while a needed asset/token gap remains.

For uncertain retries retain identical request ID and payload; changed inputs need a new ID. Do not duplicate in-flight requests or replay successful items. Stop unresolved access, terms or budget routes while preserving tokens and continuing permitted page evidence. Terms require an organization administrator outside this workflow; resume retained requests after confirmed acceptance only when contract, access and budget permit. Preserve provider/capability/version, request/record IDs, URLs and retrieval/as-of times. Disclose unknown freshness and retention failures, using supported artifact handoffs without silently rerunning paid work.

## Extract the design language

Document color roles (primary, secondary, accent, background, border, text, state); detectable font families, type scale, weights and line heights; containers, section rhythm, grid gaps, padding, density, radius and shadows; hero/nav/footer patterns; buttons, inputs, cards, badges, pricing, testimonials, feature rows and forms; imagery/icon treatment and logo constraints; CTA wording and copy rhythm.

Attach each material token or pattern to its branding field, HTML/CSS value, text passage or inspected screenshot region, preserving source page, state and capture time. Resolve conflicting tokens against the relevant component rather than merging unlike states. Inspect actual pixels for visual claims; screenshot captions and locators alone are not evidence. Repeated branding and page outputs from one origin are not independent corroboration.

Mark unmeasured values as inferred approximations, with units, practical recommendations and confidence. Do not claim exact spacing from a screenshot alone. A single full-page capture does not establish responsive behavior, hover states, transitions, or animations; label these unobserved or inferred unless additional supported evidence demonstrates them. Do not promise pixel-perfect reconstruction or complete asset capture.

## Final deliverable

Stop when the requested design tokens, components and page patterns have usable evidence and further targeted capture is unlikely to change build guidance, or when limits/access prevent progress; disclose gaps and stop reason. Create a host artifact if supported, otherwise return inline Markdown named `DESIGN.md`. Embed the actual screenshot URL/artifact when available; if absent, retain the section with an explicit gap. If the account and host support Intelligent UI, cited token/component comparisons may clarify the findings but must not create measurements or replace `DESIGN.md` and its evidence. Preserve the structure below:

```markdown
# DESIGN.md: [Source Site]

## Source
- URL: [source URL]
- Capture date: [date]
- Evidence: [branding/images/screenshot/markdown/html/links actually used]
- Limitations: [missing formats, incomplete assets, unknown states]

## Reference Screenshot
![Full-page screenshot of source site](https://example.com/returned-screenshot-url)
[Replace with the actual returned URL or host artifact; note expiry if known]

Use this screenshot as visual evidence for the captured page's layout,
hierarchy, density, and feel. Tokens below describe that evidence.

## Design Summary
[Short visual-language description]

## Design Tokens

### Colors
[Named roles with known hex values; mark inferred values]

### Typography
[Fonts, fallback recommendations, scale, weights, heading/body rules]

### Spacing And Layout
[Scale, containers, grids, radius, shadows, borders; measurement confidence]

## Components
[Buttons, cards, nav, forms, hero, feature sections, pricing, footer]

## Page Patterns
[Section order, common layouts; observed vs inferred responsive behavior]

## Content Style
[Voice, CTA style, headings, copy density]

## Agent Build Instructions
[Concrete implementation guidance and evidence/asset limitations]

## Rerun Inputs
workflow: firecrawl-design
source_url: [url]
target_stack: [stack]
output: DESIGN.md
```

Prefer reusable design tokens over one-off observations and keep the result compact enough for another agent to build from. Preserve source URLs and actual scrape artifacts for review. Do not imply rights to third-party logos, images, trademarks, or copy; recommend licensed or original replacements unless the user has established rights. Distinguish the page's visual style from permission to reuse its assets.

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
