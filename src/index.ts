#!/usr/bin/env node
import dotenv from 'dotenv';
import { FastMCP, type Logger } from 'firecrawl-fastmcp';
import { z } from 'zod';
import FirecrawlApp from '@mendable/firecrawl-js';
import type { IncomingHttpHeaders } from 'http';

dotenv.config({ debug: false, quiet: true });

interface SessionData {
  firecrawlApiKey?: string;
  [key: string]: unknown;
}

// Content limiting configuration
const DEFAULT_MAX_RESPONSE_LENGTH = 0; // 0 means no limit (backward compatible)
const DEFAULT_MAX_ARRAY_ITEMS = 0; // 0 means no limit
const TRUNCATION_SUFFIX = '\n\n[... Content truncated due to size limit ...]';

interface TruncationMetadata {
  truncated: boolean;
  originalLength?: number;
  truncatedLength?: number;
  originalItems?: number;
  truncatedItems?: number;
  message?: string;
}

// Utility function to estimate token count (rough approximation)
function estimateTokens(text: string): number {
  // Rough estimate: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4);
}

// Intelligent content truncation
function truncateContent(
  content: string,
  maxLength: number,
  preserveStructure: boolean = true
): { content: string; metadata: TruncationMetadata } {
  if (maxLength <= 0 || content.length <= maxLength) {
    return {
      content,
      metadata: { truncated: false },
    };
  }

  const targetLength = maxLength - TRUNCATION_SUFFIX.length;
  let truncated = content.substring(0, targetLength);

  if (preserveStructure) {
    // Try to truncate at a natural boundary
    const lastNewline = truncated.lastIndexOf('\n');
    const lastSpace = truncated.lastIndexOf(' ');
    const lastPunctuation = Math.max(
      truncated.lastIndexOf('.'),
      truncated.lastIndexOf('!'),
      truncated.lastIndexOf('?')
    );

    // Prefer newline, then sentence end, then word boundary
    if (lastNewline > targetLength * 0.8) {
      truncated = truncated.substring(0, lastNewline);
    } else if (lastPunctuation > targetLength * 0.8) {
      truncated = truncated.substring(0, lastPunctuation + 1);
    } else if (lastSpace > targetLength * 0.8) {
      truncated = truncated.substring(0, lastSpace);
    }
  }

  return {
    content: truncated + TRUNCATION_SUFFIX,
    metadata: {
      truncated: true,
      originalLength: content.length,
      truncatedLength: truncated.length + TRUNCATION_SUFFIX.length,
      message: `Content truncated from ${content.length} to ${
        truncated.length + TRUNCATION_SUFFIX.length
      } characters`,
    },
  };
}

// Limit array items
function limitArray<T>(
  items: T[],
  maxItems: number
): { items: T[]; metadata: TruncationMetadata } {
  if (maxItems <= 0 || items.length <= maxItems) {
    return {
      items,
      metadata: { truncated: false },
    };
  }

  return {
    items: items.slice(0, maxItems),
    metadata: {
      truncated: true,
      originalItems: items.length,
      truncatedItems: maxItems,
      message: `Results limited from ${items.length} to ${maxItems} items`,
    },
  };
}

// Smart response formatter with size limiting
function formatResponse(
  data: any,
  maxResponseLength: number = 0,
  maxArrayItems: number = 0
): string {
  let result = data;
  const metadata: TruncationMetadata[] = [];

  // Handle array responses (like map results, search results)
  if (Array.isArray(data) && maxArrayItems > 0) {
    const limited = limitArray(data, maxArrayItems);
    result = limited.items;
    if (limited.metadata.truncated) {
      metadata.push(limited.metadata);
    }
  }

  // Handle objects with array properties
  if (typeof result === 'object' && result !== null && !Array.isArray(result)) {
    const processedResult = { ...result };

    // Check for common array properties in Firecrawl responses
    const arrayProps = ['links', 'data', 'results', 'urls'];
    for (const prop of arrayProps) {
      if (Array.isArray(processedResult[prop]) && maxArrayItems > 0) {
        const limited = limitArray(processedResult[prop], maxArrayItems);
        processedResult[prop] = limited.items;
        if (limited.metadata.truncated) {
          metadata.push({
            ...limited.metadata,
            message: `${prop}: ${limited.metadata.message}`,
          });
        }
      }
    }

    // Handle content properties that might be very large
    const contentProps = ['markdown', 'html', 'rawHtml', 'content', 'text'];
    for (const prop of contentProps) {
      if (typeof processedResult[prop] === 'string' && maxResponseLength > 0) {
        const truncated = truncateContent(
          processedResult[prop],
          Math.floor(maxResponseLength / contentProps.length) // Distribute limit among content fields
        );
        if (truncated.metadata.truncated) {
          processedResult[prop] = truncated.content;
          metadata.push({
            ...truncated.metadata,
            message: `${prop}: ${truncated.metadata.message}`,
          });
        }
      }
    }

    result = processedResult;
  }

  // Convert to JSON string
  let jsonString = JSON.stringify(result, null, 2);

  // Apply overall response length limit if needed
  if (maxResponseLength > 0 && jsonString.length > maxResponseLength) {
    const truncated = truncateContent(jsonString, maxResponseLength, false);
    jsonString = truncated.content;
    metadata.push(truncated.metadata);
  }

  // Add metadata summary if content was truncated
  if (metadata.some((m) => m.truncated)) {
    const metadataNote =
      '\n\n--- Response Limiting Applied ---\n' +
      metadata
        .filter((m) => m.truncated && m.message)
        .map((m) => `• ${m.message}`)
        .join('\n');

    // Only add metadata if we have room
    if (
      maxResponseLength <= 0 ||
      jsonString.length + metadataNote.length <= maxResponseLength
    ) {
      jsonString += metadataNote;
    }
  }

  return jsonString;
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
  version: '3.3.0', // Bumped for new feature
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

// Enhanced asText function with size limiting
function asText(
  data: unknown,
  maxResponseLength?: number,
  maxArrayItems?: number
): string {
  const globalMaxResponse =
    Number(process.env.MCP_MAX_RESPONSE_LENGTH) || DEFAULT_MAX_RESPONSE_LENGTH;
  const globalMaxItems =
    Number(process.env.MCP_MAX_ARRAY_ITEMS) || DEFAULT_MAX_ARRAY_ITEMS;

  // Use provided limits or fall back to global/defaults
  const effectiveMaxLength = maxResponseLength ?? globalMaxResponse;
  const effectiveMaxItems = maxArrayItems ?? globalMaxItems;

  return formatResponse(data, effectiveMaxLength, effectiveMaxItems);
}

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

// Add response limiting params to schema
const responseLimitingSchema = z.object({
  maxResponseLength: z
    .number()
    .min(0)
    .optional()
    .describe(
      'Maximum length of response in characters. 0 or undefined means no limit.'
    ),
  maxArrayItems: z
    .number()
    .min(0)
    .optional()
    .describe(
      'Maximum number of items to return in array responses. 0 or undefined means no limit.'
    ),
});

const scrapeParamsSchema = z.object({
  url: z.string().url(),
  formats: z
    .array(
      z.union([
        z.enum([
          'markdown',
          'html',
          'rawHtml',
          'screenshot',
          'links',
          'summary',
          'changeTracking',
        ]),
        z.object({
          type: z.literal('json'),
          prompt: z.string().optional(),
          schema: z.record(z.string(), z.any()).optional(),
        }),
        z.object({
          type: z.literal('screenshot'),
          fullPage: z.boolean().optional(),
          quality: z.number().optional(),
          viewport: z
            .object({ width: z.number(), height: z.number() })
            .optional(),
        }),
      ])
    )
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
  maxAge: z.number().optional(),
  // Add response limiting params
  ...responseLimitingSchema.shape,
});

server.addTool({
  name: 'firecrawl_scrape',
  description: `
Scrape content from a single URL with advanced options. 
This is the most powerful, fastest and most reliable scraper tool, if available you should always default to using this tool for any web scraping needs.

**Response Size Control:**
- maxResponseLength: Limit total response size in characters (0 = no limit)
- Content is intelligently truncated to preserve structure when limits are applied

**Best for:** Single page content extraction, when you know exactly which page contains the information.
**Not recommended for:** Multiple pages (use batch_scrape), unknown page (use search), structured data (use extract).
**Common mistakes:** Using scrape for a list of URLs (use batch_scrape instead). If batch scrape doesnt work, just use scrape and call it multiple times.
**Prompt Example:** "Get the content of the page at https://example.com."
**Usage Example:**
\`\`\`json
{
  "name": "firecrawl_scrape",
  "arguments": {
    "url": "https://example.com",
    "formats": ["markdown"],
    "maxAge": 172800000,
    "maxResponseLength": 50000
  }
}
\`\`\`
**Performance:** Add maxAge parameter for 500% faster scrapes using cached data.
**Returns:** Markdown, HTML, or other formats as specified (with optional size limiting).
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
    const { url, maxResponseLength, maxArrayItems, ...options } = args as any;
    const client = getClient(session);
    const cleaned = removeEmptyTopLevel(options as Record<string, unknown>);
    log.info('Scraping URL', {
      url: String(url),
      maxResponseLength,
      maxArrayItems,
    });
    const res = await client.scrape(String(url), {
      ...cleaned,
      origin: ORIGIN,
    } as any);
    return asText(res, maxResponseLength, maxArrayItems);
  },
});

server.addTool({
  name: 'firecrawl_map',
  description: `
Map a website to discover all indexed URLs on the site.

**Response Size Control:**
- maxArrayItems: Limit number of URLs returned (0 = no limit)
- maxResponseLength: Limit total response size in characters (0 = no limit)

**Best for:** Discovering URLs on a website before deciding what to scrape; finding specific sections of a website.
**Not recommended for:** When you already know which specific URL you need (use scrape or batch_scrape); when you need the content of the pages (use scrape after mapping).
**Common mistakes:** Using crawl to discover URLs instead of map.
**Prompt Example:** "List all URLs on example.com."
**Usage Example:**
\`\`\`json
{
  "name": "firecrawl_map",
  "arguments": {
    "url": "https://example.com",
    "maxArrayItems": 100
  }
}
\`\`\`
**Returns:** Array of URLs found on the site (with optional limiting).
`,
  parameters: z.object({
    url: z.string().url(),
    search: z.string().optional(),
    sitemap: z.enum(['include', 'skip', 'only']).optional(),
    includeSubdomains: z.boolean().optional(),
    limit: z.number().optional(),
    ignoreQueryParameters: z.boolean().optional(),
    ...responseLimitingSchema.shape,
  }),
  execute: async (
    args: unknown,
    { session, log }: { session?: SessionData; log: Logger }
  ): Promise<string> => {
    const { url, maxResponseLength, maxArrayItems, ...options } = args as any;
    const client = getClient(session);
    const cleaned = removeEmptyTopLevel(options as Record<string, unknown>);
    log.info('Mapping URL', {
      url: String(url),
      maxResponseLength,
      maxArrayItems,
    });
    const res = await client.map(String(url), {
      ...cleaned,
      origin: ORIGIN,
    } as any);
    return asText(res, maxResponseLength, maxArrayItems);
  },
});

server.addTool({
  name: 'firecrawl_search',
  description: `
Search the web and optionally extract content from search results. This is the most powerful web search tool available, and if available you should always default to using this tool for any web search needs.

**Response Size Control:**
- maxArrayItems: Limit number of search results (0 = no limit)
- maxResponseLength: Limit total response size in characters (0 = no limit)
- Results and content are intelligently truncated when limits are applied

**Best for:** Finding specific information across multiple websites, when you don't know which website has the information; when you need the most relevant content for a query.
**Not recommended for:** When you need to search the filesystem. When you already know which website to scrape (use scrape); when you need comprehensive coverage of a single website (use map or crawl.
**Common mistakes:** Using crawl or map for open-ended questions (use search instead).
**Prompt Example:** "Find the latest research papers on AI published in 2023."
**Sources:** web, images, news, default to web unless needed images or news.
**Scrape Options:** Only use scrapeOptions when you think it is absolutely necessary. When you do so default to a lower limit to avoid timeouts, 5 or lower.
**Usage Example:**
\`\`\`json
{
  "name": "firecrawl_search",
  "arguments": {
    "query": "latest AI research papers 2023",
    "limit": 5,
    "maxArrayItems": 5,
    "maxResponseLength": 100000,
    "sources": ["web"],
    "scrapeOptions": {
      "formats": ["markdown"],
      "onlyMainContent": true
    }
  }
}
\`\`\`
**Returns:** Array of search results (with optional scraped content and size limiting).
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
    ...responseLimitingSchema.shape,
  }),
  execute: async (
    args: unknown,
    { session, log }: { session?: SessionData; log: Logger }
  ): Promise<string> => {
    const client = getClient(session);
    const { query, maxResponseLength, maxArrayItems, ...opts } = args as any;
    const cleaned = removeEmptyTopLevel(opts as Record<string, unknown>);
    log.info('Searching', {
      query: String(query),
      maxResponseLength,
      maxArrayItems,
    });
    const res = await client.search(query as string, {
      ...(cleaned as any),
      origin: ORIGIN,
    });
    return asText(res, maxResponseLength, maxArrayItems);
  },
});

server.addTool({
  name: 'firecrawl_crawl',
  description: `
 Starts a crawl job on a website and extracts content from all pages.
 
 **Response Size Control:**
 - maxArrayItems: Limit number of pages in results (0 = no limit)
 - maxResponseLength: Limit total response size in characters (0 = no limit)
 - Consider using these limits to prevent token overflow in MCP contexts
 
 **Best for:** Extracting content from multiple related pages, when you need comprehensive coverage.
 **Not recommended for:** Extracting content from a single page (use scrape); when token limits are a concern (use map + batch_scrape); when you need fast results (crawling can be slow).
 **Warning:** Crawl responses can be very large and may exceed token limits. Always use maxResponseLength or maxArrayItems, or limit the crawl depth and number of pages.
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
     "sitemap": "include",
     "maxArrayItems": 10,
     "maxResponseLength": 200000
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
          webhook: z
            .union([
              z.string(),
              z.object({
                url: z.string(),
                headers: z.record(z.string(), z.string()).optional(),
              }),
            ])
            .optional(),
        }),
    deduplicateSimilarURLs: z.boolean().optional(),
    ignoreQueryParameters: z.boolean().optional(),
    scrapeOptions: scrapeParamsSchema.omit({ url: true }).partial().optional(),
    ...responseLimitingSchema.shape,
  }),
  execute: async (args, { session, log }) => {
    const { url, maxResponseLength, maxArrayItems, ...options } = args as any;
    const client = getClient(session);
    const cleaned = removeEmptyTopLevel(options as Record<string, unknown>);
    log.info('Starting crawl', {
      url: String(url),
      maxResponseLength,
      maxArrayItems,
    });
    const res = await client.crawl(String(url), {
      ...(cleaned as any),
      origin: ORIGIN,
    });
    return asText(res, maxResponseLength, maxArrayItems);
  },
});

server.addTool({
  name: 'firecrawl_check_crawl_status',
  description: `
Check the status of a crawl job.

**Response Size Control:**
- maxArrayItems: Limit number of pages in results (0 = no limit)
- maxResponseLength: Limit total response size in characters (0 = no limit)

**Usage Example:**
\`\`\`json
{
  "name": "firecrawl_check_crawl_status",
  "arguments": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "maxArrayItems": 20,
    "maxResponseLength": 150000
  }
}
\`\`\`
**Returns:** Status and progress of the crawl job, including results if available (with optional size limiting).
`,
  parameters: z.object({
    id: z.string(),
    ...responseLimitingSchema.shape,
  }),
  execute: async (
    args: unknown,
    { session }: { session?: SessionData }
  ): Promise<string> => {
    const client = getClient(session);
    const { id, maxResponseLength, maxArrayItems } = args as any;
    const res = await client.getCrawlStatus(id as string);
    return asText(res, maxResponseLength, maxArrayItems);
  },
});

server.addTool({
  name: 'firecrawl_extract',
  description: `
Extract structured information from web pages using LLM capabilities. Supports both cloud AI and self-hosted LLM extraction.

**Response Size Control:**
- maxResponseLength: Limit total response size in characters (0 = no limit)
- Extracted data is truncated intelligently when limits are applied

**Best for:** Extracting specific structured data like prices, names, details from web pages.
**Not recommended for:** When you need the full content of a page (use scrape); when you're not looking for specific structured data.
**Arguments:**
- urls: Array of URLs to extract information from
- prompt: Custom prompt for the LLM extraction
- schema: JSON schema for structured data extraction
- allowExternalLinks: Allow extraction from external links
- enableWebSearch: Enable web search for additional context
- includeSubdomains: Include subdomains in extraction
- maxResponseLength: Limit response size for MCP compatibility
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
    "maxResponseLength": 50000
  }
}
\`\`\`
**Returns:** Extracted structured data as defined by your schema (with optional size limiting).
`,
  parameters: z.object({
    urls: z.array(z.string()),
    prompt: z.string().optional(),
    schema: z.record(z.string(), z.any()).optional(),
    allowExternalLinks: z.boolean().optional(),
    enableWebSearch: z.boolean().optional(),
    includeSubdomains: z.boolean().optional(),
    ...responseLimitingSchema.shape,
  }),
  execute: async (
    args: unknown,
    { session, log }: { session?: SessionData; log: Logger }
  ): Promise<string> => {
    const client = getClient(session);
    const a = args as Record<string, unknown>;
    const { maxResponseLength, maxArrayItems, ...extractArgs } = a;
    log.info('Extracting from URLs', {
      count: Array.isArray(extractArgs.urls) ? extractArgs.urls.length : 0,
      maxResponseLength,
    });
    const extractBody = removeEmptyTopLevel({
      urls: extractArgs.urls as string[],
      prompt: extractArgs.prompt as string | undefined,
      schema: (extractArgs.schema as Record<string, unknown>) || undefined,
      allowExternalLinks: extractArgs.allowExternalLinks as boolean | undefined,
      enableWebSearch: extractArgs.enableWebSearch as boolean | undefined,
      includeSubdomains: extractArgs.includeSubdomains as boolean | undefined,
      origin: ORIGIN,
    });
    const res = await client.extract(extractBody as any);
    return asText(res, maxResponseLength as number, maxArrayItems as number);
  },
});

// Environment configuration section
const PORT = Number(process.env.PORT || 3000);
const HOST =
  process.env.CLOUD_SERVICE === 'true'
    ? '0.0.0.0'
    : process.env.HOST || 'localhost';

// Log response limiting configuration on startup
if (process.env.MCP_MAX_RESPONSE_LENGTH || process.env.MCP_MAX_ARRAY_ITEMS) {
  console.log('Response limiting configured:', {
    maxResponseLength: process.env.MCP_MAX_RESPONSE_LENGTH || 'unlimited',
    maxArrayItems: process.env.MCP_MAX_ARRAY_ITEMS || 'unlimited',
  });
}

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
