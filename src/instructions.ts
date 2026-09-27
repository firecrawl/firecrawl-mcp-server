// Server instructions, one string per tool surface. Clients read them before a
// tool is loaded: Claude Code truncates server instructions at 2,048
// characters, OpenAI asks for the key details in the first 512, and Codex code
// mode prepends them to every tool entry in ALL_TOOLS. Each string routes
// between the tools its surface registers and stays under 1,024 characters;
// tests/mcp-instructions.test.mjs checks both against what each surface
// actually serves (budgets in tests/helpers/instructions.mjs).

/** Keyed and OAuth sessions on the full surface (hosted /v2/mcp, /v2/mcp-oauth, stdio with a key). */
export const FULL_INSTRUCTIONS =
  'Firecrawl gives agents live web data: search the web, read pages, and collect data across sites. ' +
  'Pick the tool by what you have: no URL, firecrawl_search; one known URL, firecrawl_scrape (formats: ["json"] for fields); ' +
  "a site's URLs, firecrawl_map; many pages of one site, firecrawl_crawl; pages behind clicks, forms, or login, firecrawl_interact; " +
  'URLs unknown or the answer spans many sites, firecrawl_agent; a local file, firecrawl_parse. ' +
  'Programming questions: firecrawl_developer_search. Research papers: firecrawl_research_search_papers, then the other firecrawl_research_* tools. ' +
  'Recurring page checks: firecrawl_monitor_*. ' +
  'firecrawl_agent returns a job ID; read the result with firecrawl_agent_status. ' +
  "firecrawl_search also returns matching Alexandria data providers in data.tools; firecrawl_find_tools reads a provider's contract and firecrawl_scrape with alexandria runs it.";

/** The search surface (/v2/mcp-search). */
export const SEARCH_INSTRUCTIONS =
  'Firecrawl Search: web, developer, and research search, plus Alexandria data providers. ' +
  'No URL, firecrawl_search; one known URL, firecrawl_scrape with url. ' +
  'Programming questions (code, libraries, APIs, errors): firecrawl_developer_search. ' +
  'Research papers: firecrawl_research_search_papers, then firecrawl_research_inspect_paper, firecrawl_research_related_papers, or firecrawl_research_read_paper. ' +
  "firecrawl_search also returns matching Alexandria providers in data.tools; firecrawl_find_tools reads a provider's contract and firecrawl_scrape with alexandria runs it. " +
  'Web, developer, and research searches and URL scrapes are billed per request, Alexandria capabilities at their listed price; provider discovery is free.';

/** Keyless sessions (hosted keyless tier, stdio without a key). */
export const KEYLESS_INSTRUCTIONS =
  'Firecrawl keyless access is usage-limited. No URL, firecrawl_search (categories: ["developer"] for programming questions); ' +
  'one known URL, firecrawl_scrape; a local file, firecrawl_parse. ' +
  'An API key adds site mapping, crawling, interaction, and the research agent, with higher limits.';
