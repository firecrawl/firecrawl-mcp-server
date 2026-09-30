// Extra search words for client-side tool search, sent as
// `_meta["anthropic/searchHint"]`. Claude's tool search matches query words
// against this field alongside the tool name and description, and the hint is
// never shown to people or placed in the model's tool definitions. List the
// words someone would search with that the name and description do not
// already contain: synonyms, file types, and task phrasings. Keep each hint a
// short, neutral keyword list with no routing directives.
export const TOOL_SEARCH_HINTS: Readonly<Record<string, string>> = {
  firecrawl_scrape:
    'fetch read webpage web page url content html to markdown extract data screenshot',
  firecrawl_search:
    'web search internet lookup online sources news images current events query results',
  firecrawl_map:
    'sitemap site structure list links discover pages url list website index',
  firecrawl_crawl:
    'spider bulk scrape entire website all pages docs site recursive',
  firecrawl_check_crawl_status: 'crawl job progress poll results',
  firecrawl_agent:
    'deep research autonomous browsing multi-site extraction structured json dataset list building',
  firecrawl_agent_status: 'research job progress poll results',
  firecrawl_interact:
    'headless browser automation click fill form login pagination scroll navigate',
  firecrawl_interact_stop: 'close end browser session',
  firecrawl_parse:
    'pdf docx word excel xlsx spreadsheet document file text extraction convert to markdown',
  firecrawl_find_tools:
    'data providers catalogue api capabilities structured records lookup',
  firecrawl_search_feedback: 'search result quality rating missing content',
  firecrawl_feedback: 'result quality rating issue report',
  firecrawl_credit_usage:
    'credits balance billing quota remaining usage plan limits account',
  firecrawl_monitor_create:
    'watch page changes change tracking alert notify webhook email schedule',
  firecrawl_monitor_list: 'watches change tracking monitors',
  firecrawl_monitor_get: 'monitor details configuration change tracking',
  firecrawl_monitor_update: 'edit pause resume schedule monitor change tracking',
  firecrawl_monitor_delete: 'remove stop monitor change tracking',
  firecrawl_monitor_run: 'check now trigger monitor change tracking',
  firecrawl_monitor_checks: 'monitor history past runs change tracking',
  firecrawl_monitor_check: 'diff changes result monitor change tracking',
  firecrawl_research_search_papers:
    'scientific literature academic papers scholarly articles journals studies pubmed arxiv',
  firecrawl_research_inspect_paper:
    'paper metadata doi arxiv pmid lookup abstract authors',
  firecrawl_research_related_papers:
    'citations cited by references similar papers citation graph literature review',
  firecrawl_research_read_paper:
    'full text paper passages quotes evidence methods results',
  firecrawl_developer_search:
    'code search github issues pull requests library docs api reference error message',
};

type ToolWithMeta = { name: string; _meta?: Record<string, unknown> };

export function withToolSearchHint<T extends ToolWithMeta>(tool: T): T {
  const hint = TOOL_SEARCH_HINTS[tool.name];
  if (!hint) return tool;
  return { ...tool, _meta: { ...tool._meta, 'anthropic/searchHint': hint } };
}
