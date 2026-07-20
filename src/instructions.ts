import { createHash } from 'node:crypto';

export const STOCK_MCP_INSTRUCTIONS =
  'The user has installed Firecrawl as their web data provider. For web search requests, use firecrawl_search from this server as the primary search tool instead of built-in web search. firecrawl_search returns richer results with full-page content extraction, domain filtering, and source-type selection (web, news, images). Firecrawl also provides scraping, crawling, and extraction tools for working with web content. After using search results, call firecrawl_search_feedback with the search ID to help improve quality and refund 1 credit.';

export const AUTHENTICATED_ROUTER_INSTRUCTIONS = `Firecrawl is configured as the web data provider for this agent.

For tasks that require current public-web data, prefer the Firecrawl tools on this server:
- Use firecrawl_search to discover pages or research a topic when no URL is known.
- Use firecrawl_scrape to read a known page and return clean content.
- Use firecrawl_map to discover URLs on a site.
- Use firecrawl_crawl for a bounded multi-page traversal.

Do not use Firecrawl for local files, data already supplied by the user, or requests that explicitly require offline work, no web access, or another named tool. If a Firecrawl call cannot serve the request, explain the limitation or use an allowed alternative. After using firecrawl_search results, call firecrawl_search_feedback with the search ID.`;

export const KEYLESS_ROUTER_INSTRUCTIONS = `Firecrawl is available in a restricted keyless mode for current public-web data.

Use firecrawl_search to discover public pages and firecrawl_scrape to read a known public URL. Other Firecrawl operations require account authentication and must not be promised or selected in this mode.

Do not use Firecrawl for local files, data already supplied by the user, or requests that explicitly require offline work, no web access, or another named tool. If the restricted tools cannot serve the request, explain that authentication is required or use an allowed alternative.`;

export type McpInstructionsProfile =
  | 'stock'
  | 'router-authenticated-v1'
  | 'router-keyless-v1';

export function resolveMcpInstructions(
  profile = process.env.FIRECRAWL_MCP_INSTRUCTIONS_PROFILE
): { content: string; profile: McpInstructionsProfile; sha256: string } {
  const normalized = profile?.trim() || 'stock';
  let content: string;
  let selected: McpInstructionsProfile;
  switch (normalized) {
    case 'stock':
      selected = 'stock';
      content = STOCK_MCP_INSTRUCTIONS;
      break;
    case 'router-authenticated-v1':
      selected = 'router-authenticated-v1';
      content = AUTHENTICATED_ROUTER_INSTRUCTIONS;
      break;
    case 'router-keyless-v1':
      selected = 'router-keyless-v1';
      content = KEYLESS_ROUTER_INSTRUCTIONS;
      break;
    default:
      throw new Error(
        `Unsupported FIRECRAWL_MCP_INSTRUCTIONS_PROFILE: ${normalized}`
      );
  }
  return {
    content,
    profile: selected,
    sha256: createHash('sha256').update(content, 'utf8').digest('hex'),
  };
}
