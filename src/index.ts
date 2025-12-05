#!/usr/bin/env node
/**
 * Firecrawl MCP Server - Redesigned to match CLI architecture
 *
 * Tools:
 *   firecrawl_scrape      - Scrape single URL
 *   firecrawl_crawl       - Crawl website (async with polling)
 *   firecrawl_batch       - Batch scrape multiple URLs
 *   firecrawl_map         - Discover all URLs on a site
 *   firecrawl_search      - Web search with content extraction
 *   firecrawl_extract     - LLM structured data extraction
 *   firecrawl_cancel      - Cancel crawl/batch job
 *   firecrawl_status      - Check job status
 */

import dotenv from 'dotenv';
import { FastMCP, type Logger } from 'firecrawl-fastmcp';
import { z } from 'zod';
import FirecrawlApp from '@mendable/firecrawl-js';
import type { IncomingHttpHeaders } from 'http';

dotenv.config({ debug: false, quiet: true });

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const API_URL = process.env.FIRECRAWL_API_URL;
const API_KEY = process.env.FIRECRAWL_API_KEY;
const ORIGIN = 'mcp-server';

// Crawl timeout (seconds). 0 = no timeout
const CRAWL_TIMEOUT = (() => {
  const val = process.env.FIRECRAWL_CRAWL_TIMEOUT;
  if (!val) return 120;
  const n = parseInt(val, 10);
  return isNaN(n) || n < 0 ? 120 : n === 0 ? undefined : n;
})();

const CRAWL_POLL_INTERVAL = Math.max(
  1,
  parseInt(process.env.FIRECRAWL_CRAWL_POLL_INTERVAL || '2', 10)
);

// ─────────────────────────────────────────────────────────────────────────────
// Types & Utilities
// ─────────────────────────────────────────────────────────────────────────────

interface SessionData {
  firecrawlApiKey?: string;
}

class ConsoleLogger implements Logger {
  private enabled =
    process.env.CLOUD_SERVICE === 'true' ||
    process.env.SSE_LOCAL === 'true' ||
    process.env.HTTP_STREAMABLE_SERVER === 'true';

  debug(...args: unknown[]) {
    if (this.enabled) console.debug('[DEBUG]', new Date().toISOString(), ...args);
  }
  error(...args: unknown[]) {
    if (this.enabled) console.error('[ERROR]', new Date().toISOString(), ...args);
  }
  info(...args: unknown[]) {
    if (this.enabled) console.log('[INFO]', new Date().toISOString(), ...args);
  }
  log(...args: unknown[]) {
    if (this.enabled) console.log('[LOG]', new Date().toISOString(), ...args);
  }
  warn(...args: unknown[]) {
    if (this.enabled) console.warn('[WARN]', new Date().toISOString(), ...args);
  }
}

function extractApiKey(headers: IncomingHttpHeaders): string | undefined {
  const headerApiKey = headers['x-firecrawl-api-key'] || headers['x-api-key'];
  if (headerApiKey) {
    return Array.isArray(headerApiKey) ? headerApiKey[0] : headerApiKey;
  }
  const auth = headers['authorization'];
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  return undefined;
}

function createClient(apiKey?: string): FirecrawlApp {
  const config: { apiUrl?: string; apiKey?: string } = {};
  if (API_URL) config.apiUrl = API_URL;
  if (apiKey) config.apiKey = apiKey;
  return new FirecrawlApp(config as any);
}

function getClient(session?: SessionData): FirecrawlApp {
  if (process.env.CLOUD_SERVICE === 'true') {
    if (!session?.firecrawlApiKey) throw new Error('API key required');
    return createClient(session.firecrawlApiKey);
  }
  if (!API_URL && !session?.firecrawlApiKey) {
    throw new Error('FIRECRAWL_API_URL or API key required');
  }
  return createClient(session?.firecrawlApiKey);
}

function json(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function clean<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) continue;
    (out as any)[k] = v;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP Server Setup
// ─────────────────────────────────────────────────────────────────────────────

const server = new FastMCP<SessionData>({
  name: 'firecrawl-mcp',
  version: '4.0.0',
  logger: new ConsoleLogger(),
  roots: { enabled: false },
  authenticate: async (request: { headers: IncomingHttpHeaders }): Promise<SessionData> => {
    if (process.env.CLOUD_SERVICE === 'true') {
      const apiKey = extractApiKey(request.headers);
      if (!apiKey) throw new Error('Firecrawl API key required');
      return { firecrawlApiKey: apiKey };
    }
    if (!API_KEY && !API_URL) {
      console.error('FIRECRAWL_API_KEY or FIRECRAWL_API_URL required');
      process.exit(1);
    }
    return { firecrawlApiKey: API_KEY };
  },
  health: { enabled: true, message: 'ok', path: '/health', status: 200 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Shared Schemas
// ─────────────────────────────────────────────────────────────────────────────

const formatsSchema = z
  .array(z.enum(['markdown', 'html', 'rawHtml', 'screenshot', 'links', 'summary', 'branding']))
  .optional()
  .default(['markdown']);

const locationSchema = z
  .object({
    country: z.string().optional(),
    languages: z.array(z.string()).optional(),
  })
  .optional();

// ─────────────────────────────────────────────────────────────────────────────
// Tool: Scrape
// ─────────────────────────────────────────────────────────────────────────────

server.addTool({
  name: 'firecrawl_scrape',
  description: `Scrape content from a single URL.

Best for: Single page extraction when you know the exact URL.
Formats: markdown (default), html, rawHtml, screenshot, links, summary, branding

Example:
  {"url": "https://example.com", "formats": ["markdown"]}`,
  parameters: z.object({
    url: z.string().url().describe('URL to scrape'),
    formats: formatsSchema.describe('Output formats'),
    onlyMainContent: z.boolean().optional().default(true).describe('Exclude headers/footers'),
    waitFor: z.number().optional().describe('Wait ms for JS to load'),
    timeout: z.number().optional().default(30000).describe('Request timeout ms'),
    location: locationSchema.describe('Geo location (country ISO code)'),
    maxAge: z.number().optional().describe('Cache freshness in ms (0 = always fresh)'),
  }),
  execute: async (args, { session, log }): Promise<string> => {
    const { url, formats, onlyMainContent, waitFor, timeout, location, maxAge } = args as any;
    const client = getClient(session);
    log.info('Scraping', { url });

    const opts = clean({
      formats,
      onlyMainContent,
      waitFor,
      timeout,
      location,
      maxAge,
      origin: ORIGIN,
    });

    const result = await client.scrape(url, opts as any);
    return json(result);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool: Crawl
// ─────────────────────────────────────────────────────────────────────────────

server.addTool({
  name: 'firecrawl_crawl',
  description: `Crawl a website and all subpages.

Best for: Multi-page content extraction from related pages.
Warning: Can be slow and produce large results. Use map + batch for better control.

Example:
  {"url": "https://docs.example.com", "limit": 20, "maxDepth": 2}`,
  parameters: z.object({
    url: z.string().describe('Starting URL'),
    limit: z.number().optional().default(100).describe('Max pages to crawl'),
    maxDepth: z.number().optional().default(2).describe('Max crawl depth'),
    formats: formatsSchema,
    includePaths: z.array(z.string()).optional().describe('Include path patterns'),
    excludePaths: z.array(z.string()).optional().describe('Exclude path patterns'),
    allowSubdomains: z.boolean().optional().describe('Include subdomains'),
    deduplicateSimilarURLs: z.boolean().optional().default(true),
  }),
  execute: async (args, { session, log }): Promise<string> => {
    const { url, limit, maxDepth, formats, includePaths, excludePaths, allowSubdomains, deduplicateSimilarURLs } =
      args as any;
    const client = getClient(session);
    log.info('Starting crawl', { url, limit, maxDepth });

    const opts = clean({
      limit,
      maxDepth,
      scrapeOptions: { formats },
      includePaths,
      excludePaths,
      allowSubdomains,
      deduplicateSimilarURLs,
      origin: ORIGIN,
    });

    // Start async crawl
    const job = await client.startCrawl(url, opts as any);
    const startTime = Date.now();
    const timeoutMs = CRAWL_TIMEOUT ? CRAWL_TIMEOUT * 1000 : undefined;
    const pollMs = CRAWL_POLL_INTERVAL * 1000;

    // Poll until completion
    while (true) {
      if (timeoutMs && Date.now() - startTime > timeoutMs) {
        throw new Error(`Crawl ${job.id} timed out after ${CRAWL_TIMEOUT}s`);
      }

      const status = await client.getCrawlStatus(job.id, { autoPaginate: false });

      if (['completed', 'failed', 'cancelled'].includes(status.status)) {
        return json(status);
      }

      log.info('Crawl progress', {
        id: job.id,
        status: status.status,
        completed: status.completed,
        total: status.total,
      });

      await new Promise((r) => setTimeout(r, pollMs));
    }
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool: Batch Scrape
// ─────────────────────────────────────────────────────────────────────────────

server.addTool({
  name: 'firecrawl_batch',
  description: `Batch scrape multiple URLs in parallel.

Best for: Scraping a known list of URLs efficiently.
Use map first to discover URLs, then batch to scrape them.

Example:
  {"urls": ["https://a.com", "https://b.com"], "formats": ["markdown"]}`,
  parameters: z.object({
    urls: z.array(z.string().url()).min(1).describe('URLs to scrape'),
    formats: formatsSchema,
    onlyMainContent: z.boolean().optional().default(true),
  }),
  execute: async (args, { session, log }): Promise<string> => {
    const { urls, formats, onlyMainContent } = args as any;
    const client = getClient(session);
    log.info('Batch scraping', { count: urls.length });

    // Start batch job
    const job = await client.startBatchScrape(urls, { formats, onlyMainContent } as any);
    const startTime = Date.now();
    const timeoutMs = 120 * 1000;
    const pollMs = 2000;

    while (true) {
      if (Date.now() - startTime > timeoutMs) {
        throw new Error(`Batch ${job.id} timed out`);
      }

      const status = await client.getBatchScrapeStatus(job.id);
      if (['completed', 'failed', 'cancelled'].includes(status.status)) {
        return json(status);
      }

      log.info('Batch progress', { id: job.id, completed: status.completed, total: status.total });
      await new Promise((r) => setTimeout(r, pollMs));
    }
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool: Map
// ─────────────────────────────────────────────────────────────────────────────

server.addTool({
  name: 'firecrawl_map',
  description: `Discover all URLs on a website.

Best for: Finding URLs before deciding what to scrape.
Use this before batch scrape for better control than crawl.

Example:
  {"url": "https://example.com", "search": "docs", "limit": 100}`,
  parameters: z.object({
    url: z.string().url().describe('Website to map'),
    search: z.string().optional().describe('Filter URLs containing this term'),
    limit: z.number().optional().default(1000).describe('Max URLs to return'),
    includeSubdomains: z.boolean().optional().describe('Include subdomains'),
  }),
  execute: async (args, { session, log }): Promise<string> => {
    const { url, search, limit, includeSubdomains } = args as any;
    const client = getClient(session);
    log.info('Mapping', { url, search });

    const opts = clean({ search, limit, includeSubdomains, origin: ORIGIN });
    const result = await client.map(url, opts as any);
    return json(result);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool: Search
// ─────────────────────────────────────────────────────────────────────────────

server.addTool({
  name: 'firecrawl_search',
  description: `Search the web and get full page content.

Best for: Finding information across multiple websites.
Supports search operators: "exact", -exclude, site:, inurl:, intitle:

Example:
  {"query": "python web scraping tutorial", "limit": 5}`,
  parameters: z.object({
    query: z.string().min(1).describe('Search query'),
    limit: z.number().optional().default(5).describe('Max results'),
    scrapeContent: z.boolean().optional().default(false).describe('Also scrape full content'),
  }),
  execute: async (args, { session, log }): Promise<string> => {
    const { query, limit, scrapeContent } = args as any;
    const client = getClient(session);
    log.info('Searching', { query, limit });

    const opts: any = { limit, origin: ORIGIN };
    if (scrapeContent) {
      opts.scrapeOptions = { formats: ['markdown'], onlyMainContent: true };
    }

    const result = await client.search(query, opts);
    return json(result);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool: Extract
// ─────────────────────────────────────────────────────────────────────────────

server.addTool({
  name: 'firecrawl_extract',
  description: `Extract structured data from pages using LLM.

Best for: Getting specific structured data like prices, names, lists.
Provide a prompt for freeform or schema for structured output.

Example:
  {"urls": ["https://example.com/pricing"], "prompt": "Extract pricing tiers"}`,
  parameters: z.object({
    urls: z.array(z.string()).min(1).describe('URLs to extract from (supports wildcards)'),
    prompt: z.string().optional().describe('Extraction prompt'),
    schema: z.record(z.string(), z.any()).optional().describe('JSON schema for output'),
    enableWebSearch: z.boolean().optional().describe('Enable web search for context'),
    includeSubdomains: z.boolean().optional(),
  }),
  execute: async (args, { session, log }): Promise<string> => {
    const { urls, prompt, schema, enableWebSearch, includeSubdomains } = args as any;
    const client = getClient(session);
    log.info('Extracting', { urls: urls.length, hasPrompt: !!prompt });

    const opts = clean({
      urls,
      prompt,
      schema,
      enableWebSearch,
      includeSubdomains,
      origin: ORIGIN,
    });

    const result = await client.extract(opts as any);
    return json(result);
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool: Cancel
// ─────────────────────────────────────────────────────────────────────────────

server.addTool({
  name: 'firecrawl_cancel',
  description: `Cancel a running crawl or batch job.

Example:
  {"jobId": "abc-123", "jobType": "crawl"}`,
  parameters: z.object({
    jobId: z.string().describe('Job ID to cancel'),
    jobType: z.enum(['crawl', 'batch']).default('crawl').describe('Type of job'),
  }),
  execute: async (args, { session, log }): Promise<string> => {
    const { jobId, jobType } = args as any;
    const client = getClient(session);
    log.info('Cancelling', { jobId, jobType });

    if (jobType === 'crawl') {
      const result = await client.cancelCrawl(jobId);
      return json({ cancelled: true, jobId, result });
    } else {
      const result = await client.cancelBatchScrape(jobId);
      return json({ cancelled: true, jobId, result });
    }
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool: Status
// ─────────────────────────────────────────────────────────────────────────────

server.addTool({
  name: 'firecrawl_status',
  description: `Check status of a crawl or batch job.

Example:
  {"jobId": "abc-123", "jobType": "crawl"}`,
  parameters: z.object({
    jobId: z.string().describe('Job ID to check'),
    jobType: z.enum(['crawl', 'batch']).default('crawl').describe('Type of job'),
  }),
  execute: async (args, { session, log }): Promise<string> => {
    const { jobId, jobType } = args as any;
    const client = getClient(session);
    log.info('Checking status', { jobId, jobType });

    if (jobType === 'crawl') {
      const status = await client.getCrawlStatus(jobId, { autoPaginate: false });
      return json(status);
    } else {
      const status = await client.getBatchScrapeStatus(jobId);
      return json(status);
    }
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Server Startup
// ─────────────────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.CLOUD_SERVICE === 'true' ? '0.0.0.0' : process.env.HOST || 'localhost';

type StartArgs = Parameters<typeof server.start>[0];

const args: StartArgs =
  process.env.CLOUD_SERVICE === 'true' ||
  process.env.SSE_LOCAL === 'true' ||
  process.env.HTTP_STREAMABLE_SERVER === 'true'
    ? { transportType: 'httpStream', httpStream: { port: PORT, host: HOST, stateless: true } }
    : { transportType: 'stdio' };

await server.start(args);
