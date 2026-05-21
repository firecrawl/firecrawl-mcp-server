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

const searchDomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/,
    'Domain must be a valid hostname without protocol or path'
  );

function buildSearchQueryWithDomains(
  query: string,
  includeDomains?: string[],
  excludeDomains?: string[]
): string {
  if (includeDomains?.length) {
    return `${query} (${includeDomains
      .map((domain) => `site:${domain}`)
      .join(' OR ')})`;
  }

  if (excludeDomains?.length) {
    return `${query} ${excludeDomains
      .map((domain) => `-site:${domain}`)
      .join(' ')}`;
  }

  return query;
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

function isPrivateOrLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === '::' || host === '::1') return true;
  if (host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) {
    return true;
  }
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = ipv4.slice(1).map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  }
  return false;
}

function validateWebhookUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(
      `Invalid webhook URL: ${raw}. Must be an absolute https:// URL.`
    );
  }
  if (url.protocol !== 'https:') {
    throw new Error(
      `Invalid webhook URL: ${raw}. Webhooks must use https:// (got ${url.protocol}).`
    );
  }
  if (isPrivateOrLoopbackHost(url.hostname)) {
    throw new Error(
      `Invalid webhook URL: ${raw}. Private, loopback, and link-local hosts are not allowed.`
    );
  }
  return url;
}

function buildWebhook(
  args: Record<string, unknown>
): string | Record<string, unknown> | undefined {
  const webhook = args.webhook as string | undefined;
  if (!webhook) return undefined;
  validateWebhookUrl(webhook);
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
      mode: z.enum(['directQuote', 'freeform']).default('freeform'),
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
Scrape a single URL into clean content. Default for any web page extraction.

**Best for:** Single page when you know the URL.
**Not for:** Multiple pages (crawl); unknown URL (search); multi-step interactions (interact).

**Formats:** \`markdown\` (default), \`json\` (+ \`jsonOptions.schema\`), \`query\` (+ \`queryOptions.prompt\`), \`html\`, \`rawHtml\`, \`links\`, \`screenshot\`, \`summary\`, \`changeTracking\`, \`branding\`.

**Empty output?** Add \`waitFor: 5000\` for JS pages, or \`firecrawl_map\` to find the right URL. **Speed:** \`maxAge\` enables ~5× cached scrapes; \`lockdown: true\` serves cache only (5 credits).

**Returns:** \`{ success, data: { markdown?, json?, html?, links?, screenshot?, metadata, scrapeId } }\`. Pass \`scrapeId\` to \`firecrawl_interact\`.

**Example:** \`{ "url": "https://example.com", "formats": ["json"], "jsonOptions": { "prompt": "Extract auth headers" } }\`${
  SAFE_MODE ? '\n**Safe Mode:** Read-only.' : ''
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
Discover indexed URLs on a site. Cheaper/faster than \`firecrawl_agent\` for finding the right page.

**Best for:** URL discovery before scraping.
**Not for:** Known URLs (use scrape); page content (scrape after).

**Edge cases:** No sitemap → try \`sitemap: "skip"\` + \`includeSubdomains: true\`, or fall back to crawl. \`limit\` defaults ~5000, no pagination.

**Returns:** \`{ success, links: string[] }\`. Empty = no match (not an error).

**Example:** \`{ "url": "https://docs.example.com", "search": "webhooks" }\`
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
Web/image/news search. Default for any web search.

**Best for:** Finding info when you don't know the URL.
**Not for:** Known URLs (use scrape); single-site (use map); filesystem search.

**Workflow:** Search without \`scrapeOptions\`, then scrape top URLs. Inline scrape only when needed — keep \`limit\` ≤ 5.

**Operators:** \`"exact"\`, \`-exclude\`, \`site:\`, \`inurl:\`, \`intitle:\`. **Filters:** \`includeDomains\` OR \`excludeDomains\` (not both). **Sources:** \`web\` (default), \`images\`, \`news\`.

**After results, call \`firecrawl_search_feedback\` with the returned \`id\`** to refund 1 credit.

**Returns:** \`{ success, data: { web?, images?, news? }, id, creditsUsed }\`.

**Example:** \`{ "query": "top AI startups 2024", "limit": 5 }\`
`,
  parameters: z
    .object({
      query: z.string().min(1),
      limit: z.number().optional(),
      tbs: z.string().optional(),
      filter: z.string().optional(),
      location: z.string().optional(),
      includeDomains: z.array(searchDomainSchema).optional(),
      excludeDomains: z.array(searchDomainSchema).optional(),
      sources: z
        .array(z.object({ type: z.enum(['web', 'images', 'news']) }))
        .optional(),
      scrapeOptions: scrapeParamsSchema
        .omit({ url: true })
        .partial()
        .optional(),
      enterprise: z.array(z.enum(['default', 'anon', 'zdr'])).optional(),
    })
    .refine(
      (args) => !(args.includeDomains?.length && args.excludeDomains?.length),
      'includeDomains and excludeDomains cannot both be specified'
    ),
  execute: async (
    args: unknown,
    { session, log }: { session?: SessionData; log: Logger }
  ): Promise<string> => {
    const client = getClient(session);
    const { query, ...opts } = args as Record<string, unknown>;

    const searchOpts = { ...opts } as Record<string, unknown>;
    const includeDomains = searchOpts.includeDomains as string[] | undefined;
    const excludeDomains = searchOpts.excludeDomains as string[] | undefined;
    delete searchOpts.includeDomains;
    delete searchOpts.excludeDomains;

    if (searchOpts.scrapeOptions) {
      searchOpts.scrapeOptions = transformScrapeParams(
        searchOpts.scrapeOptions as Record<string, unknown>
      );
    }

    const cleaned = removeEmptyTopLevel(searchOpts);
    const searchQuery = buildSearchQueryWithDomains(
      query as string,
      includeDomains,
      excludeDomains
    );
    log.info('Searching', { query: searchQuery });
    // Call /v2/search through the SDK's HTTP layer (auth + retries) instead
    // of `client.search()` so we preserve the full response envelope. The
    // high-level `search()` helper strips `id` and `creditsUsed`, which
    // breaks the `firecrawl_search_feedback` workflow that this server
    // explicitly tells the LLM to use after every search.
    const httpRes = await (client as any).http.post('/v2/search', {
      query: searchQuery,
      ...(cleaned as any),
      origin: ORIGIN,
    });
    return asText(httpRes?.data ?? {});
  },
});

const DEFAULT_CLOUD_API_URL = 'https://api.firecrawl.dev';

function resolveApiBaseUrl(): string {
  return (process.env.FIRECRAWL_API_URL || DEFAULT_CLOUD_API_URL).replace(
    /\/$/,
    ''
  );
}

const SEARCH_FEEDBACK_DISABLED = ['1', 'true', 'yes', 'on'].includes(
  (
    process.env.FIRECRAWL_NO_SEARCH_FEEDBACK ||
    process.env.FIRECRAWL_DISABLE_SEARCH_FEEDBACK ||
    ''
  )
    .trim()
    .toLowerCase()
);

if (SEARCH_FEEDBACK_DISABLED) {
  console.error(
    '[firecrawl-mcp] Search feedback tool disabled by FIRECRAWL_NO_SEARCH_FEEDBACK; firecrawl_search_feedback will not be registered.'
  );
}

if (!SEARCH_FEEDBACK_DISABLED) {
server.addTool({
  name: 'firecrawl_search_feedback',
  annotations: {
    title: 'Send feedback on a search result',
    readOnlyHint: false,
    openWorldHint: true,
  },
  description: `
Submit feedback on a \`firecrawl_search\` result. Within ~2 min refunds 1 credit (first feedback only).

**Required by rating:** \`good\` → \`valuableSources\` (≥1). \`partial\` → \`valuableSources\` OR \`missingContent\`. \`bad\` → \`missingContent\` OR \`querySuggestions\`. Empty = 400.

**\`missingContent\`:** one entry per distinct gap (short \`topic\`, optional \`description\`).

**Terminal (don't retry):** 409 \`FEEDBACK_WINDOW_EXPIRED\`, \`dailyCapReached: true\`, any 4xx.

**Returns:** \`{ success, feedbackId, creditsRefunded, creditsRefundedToday, dailyRefundCap, dailyCapReached?, alreadySubmitted? }\`. Idempotent per \`searchId\`.

**Example:** \`{ "searchId": "uuid", "rating": "bad", "missingContent": [{ "topic": "Recent benchmarks" }] }\`
`,
  parameters: z.object({
    searchId: z
      .string()
      .uuid('searchId must be the UUID returned by firecrawl_search'),
    rating: z.enum(['good', 'bad', 'partial']),
    valuableSources: z
      .array(
        z.object({
          url: z.string().url(),
          reason: z.string().max(1000).optional(),
        })
      )
      .max(50)
      .optional(),
    missingContent: z
      .array(
        z.object({
          topic: z
            .string()
            .min(1, 'topic must not be empty')
            .max(200, 'topic must be 200 characters or fewer'),
          description: z.string().max(2000).optional(),
        })
      )
      .max(20)
      .optional()
      .describe(
        'Array of specific pieces of content the agent expected to find but did not. ' +
          'One entry per distinct topic. Each entry has a short `topic` and optional ' +
          'longer `description`.'
      ),
    querySuggestions: z.string().max(2000).optional(),
  }),
  execute: async (
    args: unknown,
    { session, log }: { session?: SessionData; log: Logger }
  ): Promise<string> => {
    const {
      searchId,
      rating,
      valuableSources,
      missingContent,
      querySuggestions,
    } = args as {
      searchId: string;
      rating: 'good' | 'bad' | 'partial';
      valuableSources?: { url: string; reason?: string }[];
      missingContent?: { topic: string; description?: string }[];
      querySuggestions?: string;
    };

    const apiBase = resolveApiBaseUrl();
    const endpoint = `${apiBase}/v2/search/${encodeURIComponent(searchId)}/feedback`;

    const body: Record<string, unknown> = {
      rating,
      origin: ORIGIN,
    };
    if (valuableSources && valuableSources.length > 0) {
      body.valuableSources = valuableSources;
    }
    if (missingContent && missingContent.length > 0) {
      body.missingContent = missingContent;
    }
    if (querySuggestions) body.querySuggestions = querySuggestions;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const apiKey = session?.firecrawlApiKey;
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    } else if (process.env.CLOUD_SERVICE === 'true') {
      throw new Error('Unauthorized: missing API key for search feedback.');
    }

    log.info('Submitting search feedback', { searchId, rating });
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const responseText = await response.text();
    let parsed: any;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      parsed = { raw: responseText };
    }

    // 4xx is terminal; surface a structured payload (with retryable=false)
    // so agents do not retry-loop on substantive-feedback rejections,
    // expired windows, etc.
    if (!response.ok) {
      log.warn('Search feedback rejected', {
        status: response.status,
        feedbackErrorCode: parsed?.feedbackErrorCode,
      });
      return asText({
        success: false,
        status: response.status,
        feedbackErrorCode: parsed?.feedbackErrorCode,
        error: parsed?.error ?? `HTTP ${response.status}`,
        retryable: response.status >= 500,
      });
    }

    return asText(parsed);
  },
});
}

server.addTool({
  name: 'firecrawl_crawl',
  annotations: {
    title: 'Start a site crawl',
    readOnlyHint: false,
    openWorldHint: true,
    destructiveHint: false,
  },
  description: `
Async crawl over multiple pages on a site. Returns a job id to poll.

**Best for:** Comprehensive site/section coverage.
**Not for:** Single pages (use scrape); when fast (crawls are slow); tight token budgets (use map + scrape).

**Critical:** Always set \`limit\` (10–50) and \`maxDiscoveryDepth\` (2–5). Unbounded crawls overflow tokens. Avoid \`/*\` wildcards.

**Webhook security:** \`webhook\` must be HTTPS and resolve to a public IP. Private/loopback/link-local rejected.

**Returns:** \`{ success, id }\`. Poll with \`firecrawl_check_crawl_status\`.

**Example:** \`{ "url": "https://example.com/blog", "maxDiscoveryDepth": 3, "limit": 20, "sitemap": "include" }\`
${
  SAFE_MODE
    ? '**Safe Mode:** Webhooks and interactive actions disabled.'
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
Check status and results of a crawl job from \`firecrawl_crawl\`.

**Polling:** Every 5–15s while \`status === "scraping"\`. \`data\` populated only when \`completed\`. 10–50 pages: 30–180s; \`limit\` >100: 5+ min.

**Returns:** \`{ success, status, completed, total, creditsUsed, data?: [{ markdown?, json?, html?, metadata }] }\`. Status: \`scraping|completed|failed|cancelled\`. On \`failed\`/\`cancelled\`, \`data\` may be partial.

**Example:** \`{ "id": "550e8400-e29b-41d4-a716-446655440000" }\`
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
Extract structured data from one or more URLs via LLM + JSON schema.

**Best for:** Specific fields across multiple pages with one schema.
**Not for:** Full page content (use scrape markdown); single page (scrape \`json\` — cheaper).

**Edge cases:** Missing fields → \`null\` (or omit). \`enableWebSearch: true\` browses beyond supplied URLs. \`urls\` supports glob suffixes (\`https://example.com/blog/*\`).

**Returns:** \`{ success, data: <matches schema> }\`. Per-URL failures omitted.

**Example:** \`{ "urls": ["https://example.com/p1"], "prompt": "Extract product info", "schema": { "type": "object", "properties": { "name": {"type": "string"}, "price": {"type": "number"} } } }\`
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
Async research agent: searches the web, follows links, gathers data. Returns a job id — poll \`firecrawl_agent_status\`.

**Best for:** Multi-source research without known URLs; JS-heavy SPAs where scrape fails.
**Not for:** Known URLs (use scrape — faster/cheaper); plain web search (use search); form interactions (use scrape + interact).

**Polling:** Every 15–30s. Typical 1–5 min; complex 5+ min.

**Returns:** \`{ success, id }\`.

**Example:** \`{ "prompt": "Top 5 AI startups founded in 2024 and their funding", "schema": { "type": "object", "properties": { "startups": { "type": "array" } } } }\`
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
Poll a \`firecrawl_agent\` job for results.

**Polling:** Every 15–30s. Statuses: \`processing\` (keep polling), \`completed\` (data ready), \`failed\` (stop). Allow 2–5+ min for complex research.

**Returns:** \`{ success, status, data?, error? }\`. \`data\` matches the schema passed to \`firecrawl_agent\`.

**Example:** \`{ "id": "550e8400-e29b-41d4-a716-446655440000" }\`
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

// Interact tools (scrape-bound browser sessions; replace deprecated firecrawl_browser_* tools)
server.addTool({
  name: 'firecrawl_interact',
  annotations: {
    title: 'Interact with a scraped page',
    readOnlyHint: false,
    openWorldHint: true,
    destructiveHint: false,
  },
  description: `
Drive a live browser on a previously scraped page — click, fill forms, navigate, extract dynamic content.

**Requires:** \`scrapeId\` from a prior \`firecrawl_scrape\` (in \`data.metadata.scrapeId\`). Unknown/expired returns an error.
**Best for:** Multi-step flows on one page.
**Not for:** First fetch (use scrape); multi-URL extraction (crawl + extract).

**Inputs:** Exactly one of \`prompt\` or \`code\`. With \`code\` set \`language: bash|python|node\` (default \`node\`). \`timeout\` 1–300s (default 30). Session reuses until \`firecrawl_interact_stop\` or idle reap.

**Returns:** \`{ success, output, stdout, stderr, exitCode, liveViewUrl? }\`. \`exitCode !== 0\` = errored.

**Example:** \`{ "scrapeId": "<id>", "prompt": "Click the first product and read its price" }\`
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
End an \`firecrawl_interact\` session to free browser resources. Call when done — otherwise the server idle-reaps it.

**Idempotent:** Already-stopped or unknown \`scrapeId\` is a no-op. After stopping, the \`scrapeId\` is dead — start a new scrape.

**Returns:** \`{ success }\`. **Example:** \`{ "scrapeId": "<id>" }\`
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
        mode: z.enum(['directQuote', 'freeform']).default('freeform'),
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
Parse a local document via self-hosted Firecrawl \`/v2/parse\`. Requires \`FIRECRAWL_API_URL\` set to a self-hosted instance.

**Best for:** Local PDFs, Word, Excel, HTML you don't want to host publicly.
**Not for:** Remote URLs (use scrape); batches (one file/call); actions/screenshots/changeTracking.

**Supported:** .html, .htm, .pdf, .docx, .doc, .odt, .rtf, .xlsx, .xls. **Formats:** \`markdown\` (default), \`json\`, \`query\`, \`html\`, \`links\`, \`summary\`. For long PDFs use \`parsers: ["pdf"]\` + \`pdfOptions.maxPages\`.

**Returns:** \`{ success, data: { markdown?, json?, html?, links?, summary?, metadata } }\`.

**Example:** \`{ "filePath": "/abs/path/invoice.pdf", "formats": ["json"], "jsonOptions": { "prompt": "Extract total" } }\`
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
