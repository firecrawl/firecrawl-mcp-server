#!/usr/bin/env node
import dotenv from 'dotenv';
import { FastMCP, type Logger } from 'firecrawl-fastmcp';
import { z } from 'zod';
import FirecrawlApp from '@mendable/firecrawl-js';
import type { IncomingHttpHeaders } from 'http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

dotenv.config({ debug: false, quiet: true });

interface SessionData {
  firecrawlApiKey?: string;
  [key: string]: unknown;
}

function extractApiKey(headers: IncomingHttpHeaders): string | undefined {
  const headerAuth = headers['authorization'];
  const headerApiKey = (headers['x-firecrawl-api-key'] ||
    headers['x-api-key']) as string | string[] | undefined;

  if (headerApiKey) {
    return Array.isArray(headerApiKey) ? headerApiKey[0] : headerApiKey;
  }

  if (
    typeof headerAuth === 'string' &&
    headerAuth.toLowerCase().startsWith('bearer ')
  ) {
    return headerAuth.slice(7).trim();
  }

  return undefined;
}

function removeEmptyTopLevel<T extends Record<string, any>>(
  obj: T
): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (
      typeof v === 'object' &&
      !Array.isArray(v) &&
      Object.keys(v).length === 0
    )
      continue;
    // @ts-expect-error dynamic assignment
    out[k] = v;
  }
  return out;
}

class ConsoleLogger implements Logger {
  private shouldLog =
    process.env.CLOUD_SERVICE === 'true' ||
    process.env.SSE_LOCAL === 'true' ||
    process.env.HTTP_STREAMABLE_SERVER === 'true';

  debug(...args: unknown[]): void {
    if (this.shouldLog) {
      console.debug('[DEBUG]', new Date().toISOString(), ...args);
    }
  }
  error(...args: unknown[]): void {
    if (this.shouldLog) {
      console.error('[ERROR]', new Date().toISOString(), ...args);
    }
  }
  info(...args: unknown[]): void {
    if (this.shouldLog) {
      console.log('[INFO]', new Date().toISOString(), ...args);
    }
  }
  log(...args: unknown[]): void {
    if (this.shouldLog) {
      console.log('[LOG]', new Date().toISOString(), ...args);
    }
  }
  warn(...args: unknown[]): void {
    if (this.shouldLog) {
      console.warn('[WARN]', new Date().toISOString(), ...args);
    }
  }
}

const server = new FastMCP<SessionData>({
  name: 'firecrawl-fastmcp',
  version: '3.0.0',
  logger: new ConsoleLogger(),
  roots: { enabled: false },
  authenticate: async (request: {
    headers: IncomingHttpHeaders;
  }): Promise<SessionData> => {
    if (process.env.CLOUD_SERVICE === 'true') {
      const apiKey = extractApiKey(request.headers);

      if (!apiKey) {
        throw new Error('Firecrawl API key is required');
      }
      return { firecrawlApiKey: apiKey };
    } else {
      // For self-hosted instances, API key is optional if FIRECRAWL_API_URL is provided
      if (!process.env.FIRECRAWL_API_KEY && !process.env.FIRECRAWL_API_URL) {
        console.error(
          'Either FIRECRAWL_API_KEY or FIRECRAWL_API_URL must be provided'
        );
        process.exit(1);
      }
      return { firecrawlApiKey: process.env.FIRECRAWL_API_KEY };
    }
  },
  // Lightweight health endpoint for LB checks
  health: {
    enabled: true,
    message: 'ok',
    path: '/health',
    status: 200,
  },
});

function createClient(apiKey?: string): FirecrawlApp {
  const config: any = {
    ...(process.env.FIRECRAWL_API_URL && {
      apiUrl: process.env.FIRECRAWL_API_URL,
    }),
  };

  // Only add apiKey if it's provided (required for cloud, optional for self-hosted)
  if (apiKey) {
    config.apiKey = apiKey;
  }

  return new FirecrawlApp(config);
}

const ORIGIN = 'mcp-fastmcp';

// Safe mode is enabled by default for cloud service to comply with ChatGPT safety requirements
const SAFE_MODE = process.env.CLOUD_SERVICE === 'true';

function getClient(session?: SessionData): FirecrawlApp {
  // For cloud service, API key is required
  if (process.env.CLOUD_SERVICE === 'true') {
    if (!session || !session.firecrawlApiKey) {
      throw new Error('Unauthorized');
    }
    return createClient(session.firecrawlApiKey);
  }

  // For self-hosted instances, API key is optional if FIRECRAWL_API_URL is provided
  if (
    !process.env.FIRECRAWL_API_URL &&
    (!session || !session.firecrawlApiKey)
  ) {
    throw new Error(
      'Unauthorized: API key is required when not using a self-hosted instance'
    );
  }

  return createClient(session?.firecrawlApiKey);
}

function asText(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

// scrape tool (v2 semantics, minimal args)
// Centralized scrape params (used by scrape, and referenced in search/crawl scrapeOptions)

// Define safe action types
const safeActionTypes = ['wait', 'screenshot', 'scroll', 'scrape'] as const;
const otherActions = [
  'click',
  'write',
  'press',
  'executeJavascript',
  'generatePDF',
] as const;
const allActionTypes = [...safeActionTypes, ...otherActions] as const;

// Use appropriate action types based on safe mode
const allowedActionTypes = SAFE_MODE ? safeActionTypes : allActionTypes;

function buildFormatsArray(
  args: Record<string, unknown>
): Record<string, unknown>[] | undefined {
  const formats = args.formats as string[] | undefined;
  if (!formats || formats.length === 0) return undefined;

  const result: Record<string, unknown>[] = [];
  for (const fmt of formats) {
    if (fmt === 'json') {
      const jsonOpts = args.jsonOptions as Record<string, unknown> | undefined;
      result.push({ type: 'json', ...jsonOpts });
    } else if (fmt === 'query') {
      const queryOpts = args.queryOptions as Record<string, unknown> | undefined;
      result.push({ type: 'query', ...queryOpts });
    } else if (fmt === 'screenshot' && args.screenshotOptions) {
      const ssOpts = args.screenshotOptions as Record<string, unknown>;
      result.push({ type: 'screenshot', ...ssOpts });
    } else {
      result.push(fmt as unknown as Record<string, unknown>);
    }
  }
  return result;
}

function buildParsersArray(
  args: Record<string, unknown>
): Record<string, unknown>[] | undefined {
  const parsers = args.parsers as string[] | undefined;
  if (!parsers || parsers.length === 0) return undefined;

  const result: Record<string, unknown>[] = [];
  for (const p of parsers) {
    if (p === 'pdf' && args.pdfOptions) {
      const pdfOpts = args.pdfOptions as Record<string, unknown>;
      result.push({ type: 'pdf', ...pdfOpts });
    } else {
      result.push(p as unknown as Record<string, unknown>);
    }
  }
  return result;
}

function buildWebhook(
  args: Record<string, unknown>
): string | Record<string, unknown> | undefined {
  const webhook = args.webhook as string | undefined;
  if (!webhook) return undefined;
  const headers = args.webhookHeaders as Record<string, string> | undefined;
  if (headers && Object.keys(headers).length > 0) {
    return { url: webhook, headers };
  }
  return webhook;
}

function transformScrapeParams(
  args: Record<string, unknown>
): Record<string, unknown> {
  const out = { ...args };

  const formats = buildFormatsArray(out);
  if (formats) out.formats = formats;

  const parsers = buildParsersArray(out);
  if (parsers) out.parsers = parsers;

  delete out.jsonOptions;
  delete out.queryOptions;
  delete out.screenshotOptions;
  delete out.pdfOptions;

  return out;
}

const scrapeParamsSchema = z.object({
  url: z.string().url(),
  formats: z
    .array(
      z.enum([
        'markdown',
        'html',
        'rawHtml',
        'screenshot',
        'links',
        'summary',
        'changeTracking',
        'branding',
        'json',
        'query',
        'audio',
      ])
    )
    .optional(),
  jsonOptions: z
    .object({
      prompt: z.string().optional(),
      schema: z.record(z.string(), z.any()).optional(),
    })
    .optional(),
  queryOptions: z
    .object({
      prompt: z.string().max(10000),
    })
    .optional(),
  screenshotOptions: z
    .object({
      fullPage: z.boolean().optional(),
      quality: z.number().optional(),
      viewport: z
        .object({ width: z.number(), height: z.number() })
        .optional(),
    })
    .optional(),
  parsers: z.array(z.enum(['pdf'])).optional(),
  pdfOptions: z
    .object({
      maxPages: z.number().int().min(1).max(10000).optional(),
    })
    .optional(),
  onlyMainContent: z.boolean().optional(),
  includeTags: z.array(z.string()).optional(),
  excludeTags: z.array(z.string()).optional(),
  waitFor: z.number().optional(),
  ...(SAFE_MODE
    ? {}
    : {
        actions: z
          .array(
            z.object({
              type: z.enum(allowedActionTypes),
              selector: z.string().optional(),
              milliseconds: z.number().optional(),
              text: z.string().optional(),
              key: z.string().optional(),
              direction: z.enum(['up', 'down']).optional(),
              script: z.string().optional(),
              fullPage: z.boolean().optional(),
            })
          )
          .optional(),
      }),
  mobile: z.boolean().optional(),
  skipTlsVerification: z.boolean().optional(),
  removeBase64Images: z.boolean().optional(),
  location: z
    .object({
      country: z.string().optional(),
      languages: z.array(z.string()).optional(),
    })
    .optional(),
  storeInCache: z.boolean().optional(),
  zeroDataRetention: z.boolean().optional(),
  maxAge: z.number().optional(),
  lockdown: z.boolean().optional(),
  proxy: z.enum(['basic', 'stealth', 'enhanced', 'auto']).optional(),
  profile: z
    .object({
      name: z.string(),
      saveChanges: z.boolean().optional(),
    })
    .optional(),
});

server.addTool({
  name: 'firecrawl_scrape',
  annotations: {
    title: 'Scrape a URL',
    readOnlyHint: SAFE_MODE,
    openWorldHint: true,
  },
  description: `
Scrape content from a single URL with advanced options.
This is the most powerful, fastest and most reliable scraper tool, if available you should always default to using this tool for any web scraping needs.

**Best for:** Single page content extraction, when you know exactly which page contains the information.
**Not recommended for:** Multiple pages (call scrape multiple times or use crawl), unknown page location (use search).
**Common mistakes:** Using markdown format when extracting specific data points (use JSON instead).
**Other Features:** Use 'branding' format to extract brand identity (colors, fonts, typography, spacing, UI components) for design analysis or style replication.

**CRITICAL - Format Selection (you MUST follow this):**
When the user asks for SPECIFIC data points, you MUST use JSON format with a schema. Only use markdown when the user needs the ENTIRE page content.

**Use JSON format when user asks for:**
- Parameters, fields, or specifications (e.g., "get the header parameters", "what are the required fields")
- Prices, numbers, or structured data (e.g., "extract the pricing", "get the product details")
- API details, endpoints, or technical specs (e.g., "find the authentication endpoint")
- Lists of items or properties (e.g., "list the features", "get all the options")
- Any specific piece of information from a page

**Use markdown format ONLY when:**
- User wants to read/summarize an entire article or blog post
- User needs to see all content on a page without specific extraction
- User explicitly asks for the full page content

**Handling JavaScript-rendered pages (SPAs):**
If JSON extraction returns empty, minimal, or just navigation content, the page is likely JavaScript-rendered or the content is on a different URL. Try these steps IN ORDER:
1. **Add waitFor parameter:** Set \`waitFor: 5000\` to \`waitFor: 10000\` to allow JavaScript to render before extraction
2. **Try a different URL:** If the URL has a hash fragment (#section), try the base URL or look for a direct page URL
3. **Use firecrawl_map to find the correct page:** Large documentation sites or SPAs often spread content across multiple URLs. Use \`firecrawl_map\` with a \`search\` parameter to discover the specific page containing your target content, then scrape that URL directly.
   Example: If scraping "https://docs.example.com/reference" fails to find webhook parameters, use \`firecrawl_map\` with \`{"url": "https://docs.example.com/reference", "search": "webhook"}\` to find URLs like "/reference/webhook-events", then scrape that specific page.
4. **Use firecrawl_agent:** As a last resort for heavily dynamic pages where map+scrape still fails, use the agent which can autonomously navigate and research

**Usage Example (JSON format - REQUIRED for specific data extraction):**
\`\`\`json
{
  "name": "firecrawl_scrape",
  "arguments": {
    "url": "https://example.com/api-docs",
    "formats": ["json"],
    "jsonOptions": {
      "prompt": "Extract the header parameters for the authentication endpoint",
      "schema": {
        "type": "object",
        "properties": {
          "parameters": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "name": { "type": "string" },
                "type": { "type": "string" },
                "required": { "type": "boolean" },
                "description": { "type": "string" }
              }
            }
          }
        }
      }
    }
  }
}
\`\`\`

**Prefer markdown format by default.** You can read and reason over the full page content directly — no need for an intermediate query step. Use markdown for questions about page content, factual lookups, and any task where you need to understand the page.

**Use JSON format when user needs:**
- Structured data with specific fields (extract all products with name, price, description)
- Data in a specific schema for downstream processing

**Use query format only when:**
- The page is extremely long and you need a single targeted answer without processing the full content
- You want a quick factual answer and don't need to retain the page content

**Usage Example (markdown format - default for most tasks):**
\`\`\`json
{
  "name": "firecrawl_scrape",
  "arguments": {
    "url": "https://example.com/article",
    "formats": ["markdown"],
    "onlyMainContent": true
  }
}
\`\`\`
**Usage Example (branding format - extract brand identity):**
\`\`\`json
{
  "name": "firecrawl_scrape",
  "arguments": {
    "url": "https://example.com",
    "formats": ["branding"]
  }
}
\`\`\`
**Branding format:** Extracts comprehensive brand identity (colors, fonts, typography, spacing, logo, UI components) for design analysis or style replication.
**Performance:** Add maxAge parameter for 500% faster scrapes using cached data.
**Lockdown mode:** Set \`lockdown: true\` to serve the request only from the existing index/cache without any outbound network request. For air-gapped or compliance-constrained use where the request URL itself is considered sensitive. Errors on cache miss. Billed at 5 credits.
**Returns:** JSON structured data, markdown, branding profile, or other formats as specified.
${
  SAFE_MODE
    ? '**Safe Mode:** Read-only content extraction. Interactive actions (click, write, executeJavascript) are disabled for security.'
    : ''
}
`,
  parameters: scrapeParamsSchema,
  execute: async (
    args: unknown,
    { session, log }: { session?: SessionData; log: Logger }
  ): Promise<string> => {
    const { url, ...options } = args as { url: string } & Record<
      string,
      unknown
    >;
    const client = getClient(session);
    const transformed = transformScrapeParams(options as Record<string, unknown>);
    const cleaned = removeEmptyTopLevel(transformed);
    if (cleaned.lockdown) {
      log.info('Scraping URL (lockdown)');
    } else {
      log.info('Scraping URL', { url: String(url) });
    }
    const res = await client.scrape(String(url), {
      ...cleaned,
      origin: ORIGIN,
    } as any);
    return asText(res);
  },
});

server.addTool({
  name: 'firecrawl_map',
  annotations: {
    title: 'Map a website',
    readOnlyHint: true,
    openWorldHint: true,
  },
  description: `
Map a website to discover all indexed URLs on the site.

**Best for:** Discovering URLs on a website before deciding what to scrape; finding specific sections or pages within a large site; locating the correct page when scrape returns empty or incomplete results.
**Not recommended for:** When you already know which specific URL you need (use scrape); when you need the content of the pages (use scrape after mapping).
**Common mistakes:** Using crawl to discover URLs instead of map; jumping straight to firecrawl_agent when scrape fails instead of using map first to find the right page.

**IMPORTANT - Use map before agent:** If \`firecrawl_scrape\` returns empty, minimal, or irrelevant content, use \`firecrawl_map\` with the \`search\` parameter to find the specific page URL containing your target content. This is faster and cheaper than using \`firecrawl_agent\`. Only use the agent as a last resort after map+scrape fails.

**Prompt Example:** "Find the webhook documentation page on this API docs site."
**Usage Example (discover all URLs):**
\`\`\`json
{
  "name": "firecrawl_map",
  "arguments": {
    "url": "https://example.com"
  }
}
\`\`\`
**Usage Example (search for specific content - RECOMMENDED when scrape fails):**
\`\`\`json
{
  "name": "firecrawl_map",
  "arguments": {
    "url": "https://docs.example.com/api",
    "search": "webhook events"
  }
}
\`\`\`
**Returns:** Array of URLs found on the site, filtered by search query if provided.
`,
  parameters: z.object({
    url: z.string().url(),
    search: z.string().optional(),
    sitemap: z.enum(['include', 'skip', 'only']).optional(),
    includeSubdomains: z.boolean().optional(),
    limit: z.number().optional(),
    ignoreQueryParameters: z.boolean().optional(),
  }),
  execute: async (
    args: unknown,
    { session, log }: { session?: SessionData; log: Logger }
  ): Promise<string> => {
    const { url, ...options } = args as { url: string } & Record<
      string,
      unknown
    >;
    const client = getClient(session);
    const cleaned = removeEmptyTopLevel(options as Record<string, unknown>);
    log.info('Mapping URL', { url: String(url) });
    const res = await client.map(String(url), {
      ...cleaned,
      origin: ORIGIN,
    } as any);
    return asText(res);
  },
});

server.addTool({
  name: 'firecrawl_search',
  annotations: {
    title: 'Search the web',
    readOnlyHint: true,
    openWorldHint: true,
  },
  description: `
Search the web and optionally extract content from search results. This is the most powerful web search tool available, and if available you should always default to using this tool for any web search needs.

The query also supports search operators, that you can use if needed to refine the search:
| Operator | Functionality | Examples |
---|-|-|
| \`"\"\` | Non-fuzzy matches a string of text | \`"Firecrawl"\`
| \`-\` | Excludes certain keywords or negates other operators | \`-bad\`, \`-site:firecrawl.dev\`
| \`site:\` | Only returns results from a specified website | \`site:firecrawl.dev\`
| \`inurl:\` | Only returns results that include a word in the URL | \`inurl:firecrawl\`
| \`allinurl:\` | Only returns results that include multiple words in the URL | \`allinurl:git firecrawl\`
| \`intitle:\` | Only returns results that include a word in the title of the page | \`intitle:Firecrawl\`
| \`allintitle:\` | Only returns results that include multiple words in the title of the page | \`allintitle:firecrawl playground\`
| \`related:\` | Only returns results that are related to a specific domain | \`related:firecrawl.dev\`
| \`imagesize:\` | Only returns images with exact dimensions | \`imagesize:1920x1080\`
| \`larger:\` | Only returns images larger than specified dimensions | \`larger:1920x1080\`

**Best for:** Finding specific information across multiple websites, when you don't know which website has the information; when you need the most relevant content for a query.
**Not recommended for:** When you need to search the filesystem. When you already know which website to scrape (use scrape); when you need comprehensive coverage of a single website (use map or crawl.
**Common mistakes:** Using crawl or map for open-ended questions (use search instead).
**Prompt Example:** "Find the latest research papers on AI published in 2023."
**Sources:** web, images, news, default to web unless needed images or news.
**Scrape Options:** Only use scrapeOptions when you think it is absolutely necessary. When you do so default to a lower limit to avoid timeouts, 5 or lower.
**Optimal Workflow:** Search first using firecrawl_search without formats, then after fetching the results, use the scrape tool to get the content of the relevantpage(s) that you want to scrape

**Usage Example without formats (Preferred):**
\`\`\`json
{
  "name": "firecrawl_search",
  "arguments": {
    "query": "top AI companies",
    "limit": 5,
    "sources": [
      { "type": "web" }
    ]
  }
}
\`\`\`
**Usage Example with formats:**
\`\`\`json
{
  "name": "firecrawl_search",
  "arguments": {
    "query": "latest AI research papers 2023",
    "limit": 5,
    "lang": "en",
    "country": "us",
    "sources": [
      { "type": "web" },
      { "type": "images" },
      { "type": "news" }
    ],
    "scrapeOptions": {
      "formats": ["markdown"],
      "onlyMainContent": true
    }
  }
}
\`\`\`
**Returns:** Array of search results (with optional scraped content).
`,
  parameters: z.object({
    query: z.string().min(1),
    limit: z.number().optional(),
    tbs: z.string().optional(),
    filter: z.string().optional(),
    location: z.string().optional(),
    sources: z
      .array(z.object({ type: z.enum(['web', 'images', 'news']) }))
      .optional(),
    scrapeOptions: scrapeParamsSchema.omit({ url: true }).partial().optional(),
    enterprise: z.array(z.enum(['default', 'anon', 'zdr'])).optional(),
  }),
  execute: async (
    args: unknown,
    { session, log }: { session?: SessionData; log: Logger }
  ): Promise<string> => {
    const client = getClient(session);
    const { query, ...opts } = args as Record<string, unknown>;

    const searchOpts = { ...opts } as Record<string, unknown>;
    if (searchOpts.scrapeOptions) {
      searchOpts.scrapeOptions = transformScrapeParams(
        searchOpts.scrapeOptions as Record<string, unknown>
      );
    }

    const cleaned = removeEmptyTopLevel(searchOpts);
    log.info('Searching', { query: String(query) });
    const res = await client.search(query as string, {
      ...(cleaned as any),
      origin: ORIGIN,
    });
    return asText(res);
  },
});

server.addTool({
  name: 'firecrawl_crawl',
  annotations: {
    title: 'Start a site crawl',
    readOnlyHint: false,
    openWorldHint: true,
    destructiveHint: false,
  },
  description: `
 Starts a crawl job on a website and extracts content from all pages.
 
 **Best for:** Extracting content from multiple related pages, when you need comprehensive coverage.
 **Not recommended for:** Extracting content from a single page (use scrape); when token limits are a concern (use map + batch_scrape); when you need fast results (crawling can be slow).
 **Warning:** Crawl responses can be very large and may exceed token limits. Limit the crawl depth and number of pages, or use map + batch_scrape for better control.
 **Common mistakes:** Setting limit or maxDiscoveryDepth too high (causes token overflow) or too low (causes missing pages); using crawl for a single page (use scrape instead). Using a /* wildcard is not recommended.
 **Prompt Example:** "Get all blog posts from the first two levels of example.com/blog."
 **Usage Example:**
 \`\`\`json
 {
   "name": "firecrawl_crawl",
   "arguments": {
     "url": "https://example.com/blog/*",
     "maxDiscoveryDepth": 5,
     "limit": 20,
     "allowExternalLinks": false,
     "deduplicateSimilarURLs": true,
     "sitemap": "include"
   }
 }
 \`\`\`
 **Returns:** Operation ID for status checking; use firecrawl_check_crawl_status to check progress.
 ${
   SAFE_MODE
     ? '**Safe Mode:** Read-only crawling. Webhooks and interactive actions are disabled for security.'
     : ''
 }
 `,
  parameters: z.object({
    url: z.string(),
    prompt: z.string().optional(),
    excludePaths: z.array(z.string()).optional(),
    includePaths: z.array(z.string()).optional(),
    maxDiscoveryDepth: z.number().optional(),
    sitemap: z.enum(['skip', 'include', 'only']).optional(),
    limit: z.number().optional(),
    allowExternalLinks: z.boolean().optional(),
    allowSubdomains: z.boolean().optional(),
    crawlEntireDomain: z.boolean().optional(),
    delay: z.number().optional(),
    maxConcurrency: z.number().optional(),
    ...(SAFE_MODE
      ? {}
      : {
          webhook: z.string().optional(),
          webhookHeaders: z.record(z.string(), z.string()).optional(),
        }),
    deduplicateSimilarURLs: z.boolean().optional(),
    ignoreQueryParameters: z.boolean().optional(),
    scrapeOptions: scrapeParamsSchema.omit({ url: true }).partial().optional(),
  }),
  execute: async (args, { session, log }) => {
    const { url, ...options } = args as Record<string, unknown>;
    const client = getClient(session);

    const opts = { ...options } as Record<string, unknown>;
    if (opts.scrapeOptions) {
      opts.scrapeOptions = transformScrapeParams(
        opts.scrapeOptions as Record<string, unknown>
      );
    }

    const webhook = buildWebhook(opts);
    if (webhook) opts.webhook = webhook;
    delete opts.webhookHeaders;

    const cleaned = removeEmptyTopLevel(opts);
    log.info('Starting crawl', { url: String(url) });
    const res = await client.crawl(String(url), {
      ...(cleaned as any),
      origin: ORIGIN,
    });
    return asText(res);
  },
});

server.addTool({
  name: 'firecrawl_check_crawl_status',
  annotations: {
    title: 'Get crawl status',
    readOnlyHint: true,
    openWorldHint: false,
  },
  description: `
Check the status of a crawl job.

**Usage Example:**
\`\`\`json
{
  "name": "firecrawl_check_crawl_status",
  "arguments": {
    "id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
\`\`\`
**Returns:** Status and progress of the crawl job, including results if available.
`,
  parameters: z.object({ id: z.string() }),
  execute: async (
    args: unknown,
    { session }: { session?: SessionData }
  ): Promise<string> => {
    const client = getClient(session);
    const res = await client.getCrawlStatus((args as any).id as string);
    return asText(res);
  },
});

server.addTool({
  name: 'firecrawl_extract',
  annotations: {
    title: 'Extract structured data',
    readOnlyHint: true,
    openWorldHint: true,
  },
  description: `
Extract structured information from web pages using LLM capabilities. Supports both cloud AI and self-hosted LLM extraction.

**Best for:** Extracting specific structured data like prices, names, details from web pages.
**Not recommended for:** When you need the full content of a page (use scrape); when you're not looking for specific structured data.
**Arguments:**
- urls: Array of URLs to extract information from
- prompt: Custom prompt for the LLM extraction
- schema: JSON schema for structured data extraction
- allowExternalLinks: Allow extraction from external links
- enableWebSearch: Enable web search for additional context
- includeSubdomains: Include subdomains in extraction
**Prompt Example:** "Extract the product name, price, and description from these product pages."
**Usage Example:**
\`\`\`json
{
  "name": "firecrawl_extract",
  "arguments": {
    "urls": ["https://example.com/page1", "https://example.com/page2"],
    "prompt": "Extract product information including name, price, and description",
    "schema": {
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "price": { "type": "number" },
        "description": { "type": "string" }
      },
      "required": ["name", "price"]
    },
    "allowExternalLinks": false,
    "enableWebSearch": false,
    "includeSubdomains": false
  }
}
\`\`\`
**Returns:** Extracted structured data as defined by your schema.
`,
  parameters: z.object({
    urls: z.array(z.string()),
    prompt: z.string().optional(),
    schema: z.record(z.string(), z.any()).optional(),
    allowExternalLinks: z.boolean().optional(),
    enableWebSearch: z.boolean().optional(),
    includeSubdomains: z.boolean().optional(),
  }),
  execute: async (
    args: unknown,
    { session, log }: { session?: SessionData; log: Logger }
  ): Promise<string> => {
    const client = getClient(session);
    const a = args as Record<string, unknown>;
    log.info('Extracting from URLs', {
      count: Array.isArray(a.urls) ? a.urls.length : 0,
    });
    const extractBody = removeEmptyTopLevel({
      urls: a.urls as string[],
      prompt: a.prompt as string | undefined,
      schema: (a.schema as Record<string, unknown>) || undefined,
      allowExternalLinks: a.allowExternalLinks as boolean | undefined,
      enableWebSearch: a.enableWebSearch as boolean | undefined,
      includeSubdomains: a.includeSubdomains as boolean | undefined,
      origin: ORIGIN,
    });
    const res = await client.extract(extractBody as any);
    return asText(res);
  },
});

server.addTool({
  name: 'firecrawl_agent',
  annotations: {
    title: 'Start a research agent',
    readOnlyHint: false,
    openWorldHint: true,
    destructiveHint: false,
  },
  description: `
Autonomous web research agent. This is a separate AI agent layer that independently browses the internet, searches for information, navigates through pages, and extracts structured data based on your query. You describe what you need, and the agent figures out where to find it.

**How it works:** The agent performs web searches, follows links, reads pages, and gathers data autonomously. This runs **asynchronously** - it returns a job ID immediately, and you poll \`firecrawl_agent_status\` to check when complete and retrieve results.

**IMPORTANT - Async workflow with patient polling:**
1. Call \`firecrawl_agent\` with your prompt/schema → returns job ID immediately
2. Poll \`firecrawl_agent_status\` with the job ID to check progress
3. **Keep polling for at least 2-3 minutes** - agent research typically takes 1-5 minutes for complex queries
4. Poll every 15-30 seconds until status is "completed" or "failed"
5. Do NOT give up after just a few polling attempts - the agent needs time to research

**Expected wait times:**
- Simple queries with provided URLs: 30 seconds - 1 minute
- Complex research across multiple sites: 2-5 minutes
- Deep research tasks: 5+ minutes

**Best for:** Complex research tasks where you don't know the exact URLs; multi-source data gathering; finding information scattered across the web; extracting data from JavaScript-heavy SPAs that fail with regular scrape.
**Not recommended for:**
- Single-page extraction when you have a URL (use firecrawl_scrape, faster and cheaper)
- Web search (use firecrawl_search first)
- Interactive page tasks like clicking, filling forms, login, or navigating JS-heavy SPAs (use firecrawl_scrape + firecrawl_interact)
- Extracting specific data from a known page (use firecrawl_scrape with JSON format)

**Arguments:**
- prompt: Natural language description of the data you want (required, max 10,000 characters)
- urls: Optional array of URLs to focus the agent on specific pages
- schema: Optional JSON schema for structured output

**Prompt Example:** "Find the founders of Firecrawl and their backgrounds"
**Usage Example (start agent, then poll patiently for results):**
\`\`\`json
{
  "name": "firecrawl_agent",
  "arguments": {
    "prompt": "Find the top 5 AI startups founded in 2024 and their funding amounts",
    "schema": {
      "type": "object",
      "properties": {
        "startups": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "name": { "type": "string" },
              "funding": { "type": "string" },
              "founded": { "type": "string" }
            }
          }
        }
      }
    }
  }
}
\`\`\`
Then poll with \`firecrawl_agent_status\` every 15-30 seconds for at least 2-3 minutes.

**Usage Example (with URLs - agent focuses on specific pages):**
\`\`\`json
{
  "name": "firecrawl_agent",
  "arguments": {
    "urls": ["https://docs.firecrawl.dev", "https://firecrawl.dev/pricing"],
    "prompt": "Compare the features and pricing information from these pages"
  }
}
\`\`\`
**Returns:** Job ID for status checking. Use \`firecrawl_agent_status\` to poll for results.
`,
  parameters: z.object({
    prompt: z.string().min(1).max(10000),
    urls: z.array(z.string().url()).optional(),
    schema: z.record(z.string(), z.any()).optional(),
  }),
  execute: async (
    args: unknown,
    { session, log }: { session?: SessionData; log: Logger }
  ): Promise<string> => {
    const client = getClient(session);
    const a = args as Record<string, unknown>;
    log.info('Starting agent', {
      prompt: (a.prompt as string).substring(0, 100),
      urlCount: Array.isArray(a.urls) ? a.urls.length : 0,
    });
    const agentBody = removeEmptyTopLevel({
      prompt: a.prompt as string,
      urls: a.urls as string[] | undefined,
      schema: (a.schema as Record<string, unknown>) || undefined,
    });
    const res = await (client as any).startAgent({
      ...agentBody,
      origin: ORIGIN,
    });
    return asText(res);
  },
});

server.addTool({
  name: 'firecrawl_agent_status',
  annotations: {
    title: 'Get agent job status',
    readOnlyHint: true,
    openWorldHint: false,
  },
  description: `
Check the status of an agent job and retrieve results when complete. Use this to poll for results after starting an agent with \`firecrawl_agent\`.

**IMPORTANT - Be patient with polling:**
- Poll every 15-30 seconds
- **Keep polling for at least 2-3 minutes** before considering the request failed
- Complex research can take 5+ minutes - do not give up early
- Only stop polling when status is "completed" or "failed"

**Usage Example:**
\`\`\`json
{
  "name": "firecrawl_agent_status",
  "arguments": {
    "id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
\`\`\`
**Possible statuses:**
- processing: Agent is still researching - keep polling, do not give up
- completed: Research finished - response includes the extracted data
- failed: An error occurred (only stop polling on this status)

**Returns:** Status, progress, and results (if completed) of the agent job.
`,
  parameters: z.object({ id: z.string() }),
  execute: async (
    args: unknown,
    { session, log }: { session?: SessionData; log: Logger }
  ): Promise<string> => {
    const client = getClient(session);
    const { id } = args as { id: string };
    log.info('Checking agent status', { id });
    const res = await (client as any).getAgentStatus(id);
    return asText(res);
  },
});

// Browser session tools (deprecated — prefer firecrawl_scrape + firecrawl_interact)
server.addTool({
  name: 'firecrawl_browser_create',
  annotations: {
    title: 'Create browser session',
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: false,
  },
  description: `
**DEPRECATED — prefer firecrawl_scrape + firecrawl_interact instead.** Interact lets you scrape a page and then click, fill forms, and navigate without managing sessions manually.

Create a browser session for code execution via CDP (Chrome DevTools Protocol).

**Arguments:**
- ttl: Total session lifetime in seconds (30-3600, optional)
- activityTtl: Idle timeout in seconds (10-3600, optional)
- streamWebView: Whether to enable live view streaming (optional)
- profile: Save and reuse browser state (cookies, localStorage) across sessions (optional)
  - name: Profile name (sessions with the same name share state)
  - saveChanges: Whether to save changes back to the profile (default: true)

**Usage Example:**
\`\`\`json
{
  "name": "firecrawl_browser_create",
  "arguments": {
    "profile": { "name": "my-profile", "saveChanges": true }
  }
}
\`\`\`
**Returns:** Session ID, CDP URL, and live view URL.
`,
  parameters: z.object({
    ttl: z.number().min(30).max(3600).optional(),
    activityTtl: z.number().min(10).max(3600).optional(),
    streamWebView: z.boolean().optional(),
    profile: z.object({
      name: z.string().min(1).max(128),
      saveChanges: z.boolean().default(true),
    }).optional(),
  }),
  execute: async (
    args: unknown,
    { session, log }: { session?: SessionData; log: Logger }
  ): Promise<string> => {
    const client = getClient(session);
    const a = args as Record<string, unknown>;
    const cleaned = removeEmptyTopLevel(a);
    log.info('Creating browser session');
    const res = await client.browser(cleaned as any);
    return asText(res);
  },
});

if (!SAFE_MODE) {
  server.addTool({
    name: 'firecrawl_browser_execute',
    annotations: {
      title: 'Run code in browser session',
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: true,
    },
    description: `
**DEPRECATED — prefer firecrawl_scrape + firecrawl_interact instead.** Interact lets you scrape a page and then click, fill forms, and navigate without managing sessions manually.

Execute code in a browser session. Supports agent-browser commands (bash), Python, or JavaScript.
**Requires:** An active browser session (create one with firecrawl_browser_create first).

**Arguments:**
- sessionId: The browser session ID (required)
- code: The code to execute (required)
- language: "bash", "python", or "node" (optional, defaults to "bash")

**Recommended: Use bash with agent-browser commands** (pre-installed in every sandbox):
\`\`\`json
{
  "name": "firecrawl_browser_execute",
  "arguments": {
    "sessionId": "session-id-here",
    "code": "agent-browser open https://example.com",
    "language": "bash"
  }
}
\`\`\`

**Common agent-browser commands:**
- \`agent-browser open <url>\` — Navigate to URL
- \`agent-browser snapshot\` — Get accessibility tree with clickable refs (for AI)
- \`agent-browser snapshot -i -c\` — Interactive elements only, compact
- \`agent-browser click @e5\` — Click element by ref from snapshot
- \`agent-browser type @e3 "text"\` — Type into element
- \`agent-browser fill @e3 "text"\` — Clear and fill element
- \`agent-browser get text @e1\` — Get text content
- \`agent-browser get title\` — Get page title
- \`agent-browser get url\` — Get current URL
- \`agent-browser screenshot [path]\` — Take screenshot
- \`agent-browser scroll down\` — Scroll page
- \`agent-browser wait 2000\` — Wait 2 seconds
- \`agent-browser --help\` — Full command reference

**For Playwright scripting, use Python** (has proper async/await support):
\`\`\`json
{
  "name": "firecrawl_browser_execute",
  "arguments": {
    "sessionId": "session-id-here",
    "code": "await page.goto('https://example.com')\\ntitle = await page.title()\\nprint(title)",
    "language": "python"
  }
}
\`\`\`

**Note:** Prefer bash (agent-browser) or Python.
**Returns:** Execution result including stdout, stderr, and exit code.
`,
    parameters: z.object({
      sessionId: z.string(),
      code: z.string(),
      language: z.enum(['bash', 'python', 'node']).optional(),
    }),
    execute: async (
      args: unknown,
      { session, log }: { session?: SessionData; log: Logger }
    ): Promise<string> => {
      const client = getClient(session);
      const { sessionId, code, language } = args as {
        sessionId: string;
        code: string;
        language?: 'python' | 'node' | 'bash';
      };
      log.info('Executing code in browser session', { sessionId });
      const res = await client.browserExecute(sessionId, { code, language });
      return asText(res);
    },
  });
}

server.addTool({
  name: 'firecrawl_browser_delete',
  annotations: {
    title: 'Delete browser session',
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: true,
  },
  description: `
**DEPRECATED — prefer firecrawl_scrape + firecrawl_interact instead.**

Destroy a browser session.

**Usage Example:**
\`\`\`json
{
  "name": "firecrawl_browser_delete",
  "arguments": {
    "sessionId": "session-id-here"
  }
}
\`\`\`
**Returns:** Success confirmation.
`,
  parameters: z.object({
    sessionId: z.string(),
  }),
  execute: async (
    args: unknown,
    { session, log }: { session?: SessionData; log: Logger }
  ): Promise<string> => {
    const client = getClient(session);
    const { sessionId } = args as { sessionId: string };
    log.info('Deleting browser session', { sessionId });
    const res = await client.deleteBrowser(sessionId);
    return asText(res);
  },
});

server.addTool({
  name: 'firecrawl_browser_list',
  annotations: {
    title: 'List browser sessions',
    readOnlyHint: true,
    openWorldHint: false,
  },
  description: `
**DEPRECATED — prefer firecrawl_scrape + firecrawl_interact instead.**

List browser sessions, optionally filtered by status.

**Usage Example:**
\`\`\`json
{
  "name": "firecrawl_browser_list",
  "arguments": {
    "status": "active"
  }
}
\`\`\`
**Returns:** Array of browser sessions.
`,
  parameters: z.object({
    status: z.enum(['active', 'destroyed']).optional(),
  }),
  execute: async (
    args: unknown,
    { session, log }: { session?: SessionData; log: Logger }
  ): Promise<string> => {
    const client = getClient(session);
    const { status } = args as { status?: 'active' | 'destroyed' };
    log.info('Listing browser sessions', { status });
    const res = await client.listBrowsers({ status });
    return asText(res);
  },
});

// Interact tools (scrape-bound browser sessions)
server.addTool({
  name: 'firecrawl_interact',
  annotations: {
    title: 'Interact with a scraped page',
    readOnlyHint: false,
    openWorldHint: true,
    destructiveHint: false,
  },
  description: `
Interact with a previously scraped page in a live browser session. Scrape a page first with firecrawl_scrape, then use the returned scrapeId to click buttons, fill forms, extract dynamic content, or navigate deeper.

**Best for:** Multi-step workflows on a single page — searching a site, clicking through results, filling forms, extracting data that requires interaction.
**Requires:** A scrapeId from a previous firecrawl_scrape call (found in the metadata of the scrape response).

**Arguments:**
- scrapeId: The scrape job ID from a previous scrape (required)
- prompt: Natural language instruction describing the action to take (use this OR code)
- code: Code to execute in the browser session (use this OR prompt)
- language: "bash", "python", or "node" (optional, defaults to "node", only used with code)
- timeout: Execution timeout in seconds, 1-300 (optional, defaults to 30)

**Usage Example (prompt):**
\`\`\`json
{
  "name": "firecrawl_interact",
  "arguments": {
    "scrapeId": "scrape-id-from-previous-scrape",
    "prompt": "Click on the first product and tell me its price"
  }
}
\`\`\`

**Usage Example (code):**
\`\`\`json
{
  "name": "firecrawl_interact",
  "arguments": {
    "scrapeId": "scrape-id-from-previous-scrape",
    "code": "agent-browser click @e5",
    "language": "bash"
  }
}
\`\`\`
**Returns:** Execution result including output, stdout, stderr, exit code, and live view URLs.
`,
  parameters: z.object({
    scrapeId: z.string(),
    prompt: z.string().optional(),
    code: z.string().optional(),
    language: z.enum(['bash', 'python', 'node']).optional(),
    timeout: z.number().min(1).max(300).optional(),
  }).refine(data => data.code || data.prompt, {
    message: "Either 'code' or 'prompt' must be provided.",
  }),
  execute: async (
    args: unknown,
    { session, log }: { session?: SessionData; log: Logger }
  ): Promise<string> => {
    const client = getClient(session);
    const { scrapeId, prompt, code, language, timeout } = args as {
      scrapeId: string;
      prompt?: string;
      code?: string;
      language?: 'bash' | 'python' | 'node';
      timeout?: number;
    };
    log.info('Interacting with scraped page', { scrapeId });
    const interactArgs: Record<string, unknown> = { origin: ORIGIN };
    if (prompt) interactArgs.prompt = prompt;
    if (code) interactArgs.code = code;
    if (language) interactArgs.language = language;
    if (timeout != null) interactArgs.timeout = timeout;
    const res = await client.interact(scrapeId, interactArgs as any);
    return asText(res);
  },
});

server.addTool({
  name: 'firecrawl_interact_stop',
  annotations: {
    title: 'Stop interact session',
    readOnlyHint: false,
    openWorldHint: false,
    destructiveHint: true,
  },
  description: `
Stop an interact session for a scraped page. Call this when you are done interacting to free resources.

**Usage Example:**
\`\`\`json
{
  "name": "firecrawl_interact_stop",
  "arguments": {
    "scrapeId": "scrape-id-here"
  }
}
\`\`\`
**Returns:** Success confirmation.
`,
  parameters: z.object({
    scrapeId: z.string(),
  }),
  execute: async (
    args: unknown,
    { session, log }: { session?: SessionData; log: Logger }
  ): Promise<string> => {
    const client = getClient(session);
    const { scrapeId } = args as { scrapeId: string };
    log.info('Stopping interact session', { scrapeId });
    const res = await client.stopInteraction(scrapeId);
    return asText(res);
  },
});

// Local-only: parse a local file via the self-hosted Firecrawl /v2/parse endpoint.
// The parse endpoint is only exposed on self-hosted/local Firecrawl API deployments,
// so this tool is registered only when the MCP is NOT running in cloud mode.
if (process.env.CLOUD_SERVICE !== 'true') {
  const parseParamsSchema = z.object({
    filePath: z
      .string()
      .min(1)
      .describe(
        'Absolute or relative path to a local file to parse. Supported: .html, .htm, .pdf, .docx, .doc, .odt, .rtf, .xlsx, .xls'
      ),
    contentType: z
      .string()
      .optional()
      .describe(
        'Optional MIME type override. If omitted, the server infers the file kind from the extension.'
      ),
    formats: z
      .array(
        z.enum([
          'markdown',
          'html',
          'rawHtml',
          'links',
          'summary',
          'json',
          'query',
        ])
      )
      .optional(),
    jsonOptions: z
      .object({
        prompt: z.string().optional(),
        schema: z.record(z.string(), z.any()).optional(),
      })
      .optional(),
    queryOptions: z
      .object({
        prompt: z.string().max(10000),
      })
      .optional(),
    parsers: z.array(z.enum(['pdf'])).optional(),
    pdfOptions: z
      .object({
        maxPages: z.number().int().min(1).max(10000).optional(),
      })
      .optional(),
    onlyMainContent: z.boolean().optional(),
    includeTags: z.array(z.string()).optional(),
    excludeTags: z.array(z.string()).optional(),
    removeBase64Images: z.boolean().optional(),
    skipTlsVerification: z.boolean().optional(),
    storeInCache: z.boolean().optional(),
    zeroDataRetention: z.boolean().optional(),
    maxAge: z.number().optional(),
    proxy: z.enum(['basic', 'auto']).optional(),
  });

  const EXTENSION_CONTENT_TYPES: Record<string, string> = {
    '.html': 'text/html',
    '.htm': 'text/html',
    '.pdf': 'application/pdf',
    '.docx':
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.odt': 'application/vnd.oasis.opendocument.text',
    '.rtf': 'application/rtf',
    '.xlsx':
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
  };

  function inferContentType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    return EXTENSION_CONTENT_TYPES[ext] ?? 'application/octet-stream';
  }

  server.addTool({
    name: 'firecrawl_parse',
    annotations: {
      title: 'Parse a local file',
      readOnlyHint: true,
      openWorldHint: false,
    },
    description: `
Parse a file from the local filesystem using a self-hosted Firecrawl API's /v2/parse endpoint.
This is the fastest and most reliable way to extract content from a document on disk — if the file lives locally and the MCP is pointed at a self-hosted Firecrawl instance, you should always prefer this tool over uploading the file elsewhere and then scraping it.

**Best for:** Extracting content from a local document (PDF, Word, Excel, HTML, etc.) when you don't want to host it on the public web first; pulling structured data out of a file with JSON format; converting binary documents into markdown for downstream reasoning.
**Not recommended for:** Remote URLs (use firecrawl_scrape); multiple files at once (call parse multiple times); documents that require interactive actions, screenshots, or change tracking — those aren't supported by the parse endpoint.
**Common mistakes:** Passing a URL instead of a local file path; requesting an unsupported format (screenshot, branding, changeTracking); setting waitFor, location, mobile, or a non-basic/auto proxy — parse uploads reject all of those.

**Supported file types:** .html, .htm, .xhtml, .pdf, .docx, .doc, .odt, .rtf, .xlsx, .xls
**Unsupported options:** actions, screenshot/branding/changeTracking formats, waitFor > 0, location, mobile, proxy values other than "auto" or "basic".

**CRITICAL - Format Selection (same rules as firecrawl_scrape):**
When the user asks for SPECIFIC data points from a document, you MUST use JSON format with a schema. Only use markdown when the user needs the ENTIRE document content.

**Use JSON format when the user asks for:**
- Specific fields, parameters, or values from a form / PDF / spreadsheet
- Prices, numbers, or other structured data
- Lists of items or properties

**Use markdown format when:**
- User wants to read, summarize, or analyze the full document
- User explicitly asks for the complete content

**Handling PDFs:**
Add \`"parsers": ["pdf"]\` (optionally with \`pdfOptions.maxPages\`) when parsing a PDF so the PDF engine is invoked explicitly. For very long documents, cap \`maxPages\` to keep the response within token limits.

**Usage Example (markdown from a local PDF):**
\`\`\`json
{
  "name": "firecrawl_parse",
  "arguments": {
    "filePath": "/absolute/path/to/document.pdf",
    "formats": ["markdown"],
    "parsers": ["pdf"],
    "onlyMainContent": true
  }
}
\`\`\`

**Usage Example (structured JSON extraction from a local HTML file):**
\`\`\`json
{
  "name": "firecrawl_parse",
  "arguments": {
    "filePath": "./invoice.html",
    "formats": ["json"],
    "jsonOptions": {
      "prompt": "Extract the invoice number, total, and line items",
      "schema": {
        "type": "object",
        "properties": {
          "invoiceNumber": { "type": "string" },
          "total": { "type": "number" },
          "lineItems": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "description": { "type": "string" },
                "amount": { "type": "number" }
              }
            }
          }
        }
      }
    }
  }
}
\`\`\`
**Returns:** A parsed document with markdown, html, links, summary, json, or query results depending on the requested formats.
`,
    parameters: parseParamsSchema,
    execute: async (
      args: unknown,
      { session, log }: { session?: SessionData; log: Logger }
    ): Promise<string> => {
      const apiUrl = process.env.FIRECRAWL_API_URL;
      if (!apiUrl) {
        throw new Error(
          'firecrawl_parse requires FIRECRAWL_API_URL to be set to a self-hosted Firecrawl API instance.'
        );
      }

      const {
        filePath,
        contentType: overrideContentType,
        ...options
      } = args as {
        filePath: string;
        contentType?: string;
      } & Record<string, unknown>;

      const absPath = path.resolve(filePath);
      const buffer = await readFile(absPath);
      const filename = path.basename(absPath);
      const fileContentType =
        overrideContentType && overrideContentType.length > 0
          ? overrideContentType
          : inferContentType(filename);

      const transformed = transformScrapeParams(
        options as Record<string, unknown>
      );
      const cleaned = removeEmptyTopLevel(transformed) as Record<
        string,
        unknown
      >;
      const optionsPayload = { origin: ORIGIN, ...cleaned };

      const form = new FormData();
      const blob = new Blob([new Uint8Array(buffer)], { type: fileContentType });
      form.append('file', blob, filename);
      form.append('options', JSON.stringify(optionsPayload));

      const headers: Record<string, string> = {};
      const apiKey = session?.firecrawlApiKey;
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const endpoint = `${apiUrl.replace(/\/$/, '')}/v2/parse`;
      log.info('Parsing local file', {
        endpoint,
        filename,
        size: buffer.length,
      });

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: form,
      });

      const responseText = await response.text();
      if (!response.ok) {
        throw new Error(
          `Parse request failed with status ${response.status}: ${responseText}`
        );
      }

      try {
        return asText(JSON.parse(responseText));
      } catch {
        return responseText;
      }
    },
  });
}

const PORT = Number(process.env.PORT || 3000);
const HOST =
  process.env.CLOUD_SERVICE === 'true'
    ? '0.0.0.0'
    : process.env.HOST || 'localhost';
type StartArgs = Parameters<typeof server.start>[0];
let args: StartArgs;

if (
  process.env.CLOUD_SERVICE === 'true' ||
  process.env.SSE_LOCAL === 'true' ||
  process.env.HTTP_STREAMABLE_SERVER === 'true'
) {
  args = {
    transportType: 'httpStream',
    httpStream: {
      port: PORT,
      host: HOST,
      stateless: true,
    },
  };
} else {
  // default: stdio
  args = {
    transportType: 'stdio',
  };
}

await server.start(args);
