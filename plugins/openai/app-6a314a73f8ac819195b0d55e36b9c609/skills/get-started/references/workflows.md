# Firecrawl paths and first results

Adapted from Firecrawl's public onboarding guide and workflow resources. Use this guide to tailor tool choice and deliver a first result. The agent owns discovery and execution; these examples are work patterns, not prompts the user must copy or instructions to browse providers.

## Route by the outcome

| User wants | Starting point | Useful onboarding input |
| --- | --- | --- |
| Web data in this chat | Available Firecrawl search, scrape, or provider tools | Topic or URL and desired fields |
| Firecrawl in their product | Product-code integration guidance | What the feature should do, stack, and existing project |
| A finished deliverable | Evidence collection followed by synthesis | Scope and expected artifact |

Users can combine paths. Preserve their chosen scope. A quick product recommendation does not require a formal deep-research report; a plugin user does not need a CLI installation to use already connected MCP tools.

## Match the operation to exposed tools

The public onboarding skill covers several Firecrawl clients. Check the live tool list before promising a feature; deployments and account access differ.

- **Discovery:** Search when URLs are unknown. Use free Alexandria-only discovery or `firecrawl_find_tools` to choose appropriate providers yourself. Ordinary web search and data execution are billed and can be part of a concrete first task.
- **Known page:** Scrape the supplied URL. Public document URLs belong here too.
- **Same fields across entities:** Prefer an Alexandria provider when its contract covers the target records, required fields, provenance, and scale. If web results already answer the question, use them.
- **Complex multi-source extraction:** Use agent research when the exposed tool supports it and the answer spans sites or needs structured output. Read results through its status tool.
- **Site structure:** Map discovers URLs without retrieving their content. Crawl collects multiple pages when available.
- **Dynamic pages:** Use interact when page extraction cannot supply the required data and an exposed browser tool supports the task.
- **Local/private documents:** Use parse or the host's authorized file workflow. Do not fabricate access to a local file from its name.
- **Scientific literature:** Prefer exposed paper-index search, metadata, full-text, and citation tools. A research category on ordinary web search reaches different sources.
- **Programming questions:** Use the exposed `firecrawl_developer_search` for code documentation, READMEs, issues, and merged pull requests. If unavailable, use exposed web search and official documentation; do not claim the developer index ran.
- **Recurring change detection:** Route to monitor when available and the user requests alerts or tracking. Explain setup and notification channels before creating a monitor. Onboarding itself does not schedule checks.

For Alexandria, discovery returns tool matches, not executed data. Expand the chosen live contract before execution. Use exact discovered IDs and declared input shapes; do not convert a web URL into a guessed provider ID.

## Finished deliverables

These patterns draw on the Firecrawl workflow resources. Ask only for missing information that blocks useful work. Choose sources from the live catalogue; suggested categories below are not promises of provider availability.

| Goal | Evidence or sources to look for | First-request pattern |
| --- | --- | --- |
| Product comparison | Product specifications, current offers, reviews, seller/shipping details | "Compare [products] for [use case] in [region], under [budget]. Give me a table and a sourced recommendation." |
| Company discovery | Company profiles, directories, relevant firmographic fields | "Find [number] companies matching [criteria] in [region], with [fields] and source links." |
| Lead research | Public company/person information relevant to the stated purpose | "Prepare a brief on [company/person]: priorities, recent developments, and evidence for [meeting purpose]." |
| Market research | Market reports, company filings, dated industry evidence | "Compare [markets/companies] on [metrics], with dates, sources, and gaps in the evidence." |
| Competitive intelligence | Product pages, pricing, documentation, changelogs | "Compare [competitors] on [features/pricing] and summarize the differences with source links." |
| Scientific research | Indexed papers, abstracts, full-text passages, citation relationships | "Find papers on [question] and summarize methods, findings, limitations, and citations." |
| SEO audit | Public pages, metadata, headings, internal links | "Audit [site] for [scope] and give me prioritized fixes backed by page evidence." |
| Website QA | Relevant pages and available interactive browser tools | "Check [site/flow] for [behaviors] and report reproducible issues with evidence." |
| Knowledge base | Selected documentation or knowledge sources | "Build a source-linked reference for [topic] from [URLs], organized by [sections]." |
| Design-system extraction | Target website's visual and content evidence | "Inspect [site] and document its typography, colors, spacing, and component patterns with evidence." |
| Product walkthrough | Available browser access to the specified product | "Walk through [product/flow] and explain the key steps and friction with evidence." |
| Recurring monitoring | Known URLs and the user's definition of meaningful change | "Help me set up alerts for [change] on [URLs], at [frequency], delivered through [supported channel]." |

For a formal deep-research report, infer or ask for the intended depth/runtime before execution if absent. Keep ordinary lookups and shopping recommendations lighter. Product comparisons may need region and budget; a small unfiltered company list need not require geography or industry. Use contract defaults when they yield a useful starter result, state those defaults, and ask only for inputs that block meaningful work. Do not invent required URLs, identifiers, or user constraints.

## First-use behavior examples

- **Developer index:** Given a programming question with its library or error, retrieve a small ranked set through `firecrawl_developer_search`, read the returned passages, and answer with source links. Ask for the error or library only when context cannot identify the target.
- **Scrape a page:** Given a URL, retrieve that page through `firecrawl_scrape` and show the requested content or fields with its source. Ask for the URL if missing; do not substitute an invented example site.
- **Web search:** Given a topic, run a focused `firecrawl_search`, then summarize the returned evidence with source links. Keep the user's time window and distinguish search snippets from retrieved page content.
- **Company discovery → YC companies:** Discover the directory's live company-search contract, then retrieve up to five companies if a result limit exists, or one page otherwise. Show supported fields and source links. Explain the value of structured records, then offer supported refinements. Do not impose an active-company, geography, or batch filter the user did not request.
- **Compare two named products:** Discover relevant product contracts and retrieve the specified products if their required identities are known. Ask for a product URL or region only if needed to identify the product or make prices comparable. Show a sourced comparison rather than provider-picking instructions.
- **Generic company discovery:** Ask which kinds of companies if context does not establish a target. Do not execute an invented search while waiting.
- **Not sure what to use Firecrawl for:** Use free `firecrawl_find_tools` discovery to show a small available provider set in chat, with concrete examples for developer search, scraping, Alexandria records, and web search. Use free discovery to ground provider suggestions; do not require selection or execute a paid sample until a target is clear.
- **Learn what Firecrawl can do / don't spend credits:** Explain relevant capabilities and use free discovery if it helps. Do not run paid samples.
- **Provider access blocked:** Follow the returned access action. Do not fabricate a result, accept terms automatically, or make the user browse the catalogue to solve an access gate.
- **User wants to browse:** Show relevant categories or a compact discovered provider list in chat. Do not make browsing a prerequisite for direct tool execution or promise a provider side pane in this package.

Collect source evidence, distinguish provider data from inferences, and state material gaps. Never claim current prices or facts based only on a catalogue description. Cart actions, outreach, and other external mutations require the user's instruction for those actions.

## Product-code integration

When the user explicitly wants an integration, ask what Firecrawl should do in the product and inspect the existing project before proposing changes. Match the endpoint to the operation above, use the project's normal secret management, and validate with a relevant real request when execution is authorized. Reuse existing credentials through their configured secret channel; keep secrets out of chat and generated artifacts.

If available, route to the installed build skill for project setup, search, scrape, or interaction. Do not require those skills or install them merely to finish plugin onboarding. SDK and CLI resources are in [Setup and resource links](setup-and-resources.md).
