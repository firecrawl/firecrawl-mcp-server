# Locate and collect site pages

Use `firecrawl_map` to find a subpage or list a site's URLs. Add `search` when
looking for a particular topic. A URL list does not contain those pages' content;
use `firecrawl_scrape` for the pages the answer needs.

Use `firecrawl_crawl` when the request needs content from many linked pages.
Bound the starting URL with appropriate `includePaths`, `excludePaths`, `limit`,
or `maxDiscoveryDepth`. Match these bounds to the requested section.

The crawl tool polls the job and normally returns its final status and data.
Inspect that response first. Use `firecrawl_check_crawl_status` with the returned
job ID if the job is still pending or its results need to be retrieved later.
Do not restart an existing job merely to check progress.

Summarize the pages actually returned. If limits, errors, or missing pages
prevent complete coverage, state that limitation rather than claiming the
entire site was collected.
