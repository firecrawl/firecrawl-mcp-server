/**
 * Firecrawl Tools Integration for MCP STREAMABLE_HTTP
 * 
 * This module integrates Firecrawl functionality with the standardized
 * MCP STREAMABLE_HTTP server implementation.
 */

import FirecrawlApp, {
  type ScrapeParams,
  type MapParams,
  type CrawlParams,
  type FirecrawlDocument,
} from '@mendable/firecrawl-js';

// Configuration
const CONFIG = {
  retry: {
    maxAttempts: Number(process.env.FIRECRAWL_RETRY_MAX_ATTEMPTS) || 3,
    initialDelay: Number(process.env.FIRECRAWL_RETRY_INITIAL_DELAY) || 1000,
    maxDelay: Number(process.env.FIRECRAWL_RETRY_MAX_DELAY) || 10000,
    backoffFactor: Number(process.env.FIRECRAWL_RETRY_BACKOFF_FACTOR) || 2,
  },
  credit: {
    warningThreshold: Number(process.env.FIRECRAWL_CREDIT_WARNING_THRESHOLD) || 1000,
    criticalThreshold: Number(process.env.FIRECRAWL_CREDIT_CRITICAL_THRESHOLD) || 100,
  },
};

// Utility function for delay
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retry logic with exponential backoff
async function withRetry<T>(
  operation: () => Promise<T>,
  context: string,
  attempt = 1
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const isRateLimit =
      error instanceof Error &&
      (error.message.includes('rate limit') || error.message.includes('429'));

    if (isRateLimit && attempt < CONFIG.retry.maxAttempts) {
      const delayMs = Math.min(
        CONFIG.retry.initialDelay * Math.pow(CONFIG.retry.backoffFactor, attempt - 1),
        CONFIG.retry.maxDelay
      );

      console.log(
        `Rate limit hit for ${context}. Attempt ${attempt}/${CONFIG.retry.maxAttempts}. Retrying in ${delayMs}ms`
      );

      await delay(delayMs);
      return withRetry(operation, context, attempt + 1);
    }

    throw error;
  }
}

// Type guards
function isScrapeOptions(args: unknown): args is ScrapeParams & { url: string } {
  return (
    typeof args === 'object' &&
    args !== null &&
    'url' in args &&
    typeof (args as { url: unknown }).url === 'string'
  );
}

function isMapOptions(args: unknown): args is MapParams & { url: string } {
  return (
    typeof args === 'object' &&
    args !== null &&
    'url' in args &&
    typeof (args as { url: unknown }).url === 'string'
  );
}

function isCrawlOptions(args: unknown): args is CrawlParams & { url: string } {
  return (
    typeof args === 'object' &&
    args !== null &&
    'url' in args &&
    typeof (args as { url: unknown }).url === 'string'
  );
}

function isStatusCheckOptions(args: unknown): args is { id: string } {
  return (
    typeof args === 'object' &&
    args !== null &&
    'id' in args &&
    typeof (args as { id: unknown }).id === 'string'
  );
}

function isSearchOptions(args: unknown): args is {
  query: string;
  limit?: number;
  lang?: string;
  country?: string;
  tbs?: string;
  filter?: string;
  location?: { country?: string; languages?: string[] };
  scrapeOptions?: any;
} {
  return (
    typeof args === 'object' &&
    args !== null &&
    'query' in args &&
    typeof (args as { query: unknown }).query === 'string'
  );
}

function isExtractOptions(args: unknown): args is {
  urls: string[];
  prompt?: string;
  systemPrompt?: string;
  schema?: object;
  allowExternalLinks?: boolean;
  enableWebSearch?: boolean;
  includeSubdomains?: boolean;
} {
  if (typeof args !== 'object' || args === null) return false;
  const { urls } = args as { urls?: unknown };
  return Array.isArray(urls) && urls.every((url): url is string => typeof url === 'string');
}

function isGenerateLLMsTextOptions(args: unknown): args is {
  url: string;
  maxUrls?: number;
  showFullText?: boolean;
} {
  return (
    typeof args === 'object' &&
    args !== null &&
    'url' in args &&
    typeof (args as { url: unknown }).url === 'string'
  );
}

function isDeepResearchOptions(args: unknown): args is {
  query: string;
  maxDepth?: number;
  timeLimit?: number;
  maxUrls?: number;
} {
  return (
    typeof args === 'object' &&
    args !== null &&
    'query' in args &&
    typeof (args as { query: unknown }).query === 'string'
  );
}

// Utility function to trim trailing whitespace from text responses
function trimResponseText(text: string): string {
  return text.trim();
}

// Format results helper
function formatResults(data: FirecrawlDocument[]): string {
  return data
    .map((doc) => {
      const content = doc.markdown || doc.html || doc.rawHtml || 'No content';
      return `URL: ${doc.url || 'Unknown URL'}
Content: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}
${doc.metadata?.title ? `Title: ${doc.metadata.title}` : ''}`;
    })
    .join('\n\n');
}

export class FirecrawlToolsIntegration {
  private client: FirecrawlApp;

  constructor() {
    const FIRECRAWL_API_URL = process.env.FIRECRAWL_API_URL;
    const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;

    // Initialize Firecrawl client
    this.client = new FirecrawlApp({
      apiKey: FIRECRAWL_API_KEY,
      ...(FIRECRAWL_API_URL ? { apiUrl: FIRECRAWL_API_URL } : {}),
    });

    console.log('Firecrawl Tools Integration initialized:', {
      apiUrl: FIRECRAWL_API_URL || 'default',
      hasApiKey: !!FIRECRAWL_API_KEY
    });
  }

  async executeToolCall(toolName: string, args: any): Promise<any> {
    const startTime = Date.now();
    
    console.log(`[${new Date().toISOString()}] Executing tool: ${toolName}`);
    console.log('Arguments:', JSON.stringify(args, null, 2));

    try {
      let result: any;

      switch (toolName) {
        case 'firecrawl_scrape':
          result = await this.handleScrape(args);
          break;
        case 'firecrawl_map':
          result = await this.handleMap(args);
          break;
        case 'firecrawl_crawl':
          result = await this.handleCrawl(args);
          break;
        case 'firecrawl_check_crawl_status':
          result = await this.handleCheckCrawlStatus(args);
          break;
        case 'firecrawl_search':
          result = await this.handleSearch(args);
          break;
        case 'firecrawl_extract':
          result = await this.handleExtract(args);
          break;
        case 'firecrawl_deep_research':
          result = await this.handleDeepResearch(args);
          break;
        case 'firecrawl_generate_llmstxt':
          result = await this.handleGenerateLLMsText(args);
          break;
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }

      const duration = Date.now() - startTime;
      console.log(`Tool ${toolName} completed in ${duration}ms`);

      return {
        success: true,
        data: result,
        executionTime: duration,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`Tool ${toolName} failed after ${duration}ms:`, error);

      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          code: 'TOOL_EXECUTION_ERROR',
          tool: toolName,
          executionTime: duration
        },
        timestamp: new Date().toISOString()
      };
    }
  }

  private async handleScrape(args: any): Promise<any> {
    if (!isScrapeOptions(args)) {
      throw new Error('Invalid arguments for firecrawl_scrape');
    }

    const { url, ...options } = args;
    
    return withRetry(async () => {
      // Pass url as string and options as separate parameter
      const response = await this.client.scrapeUrl(url, options);

      if ('success' in response && !response.success) {
        throw new Error(response.error || 'Scraping failed');
      }

      // Format content based on requested formats
      const contentParts = [];
      if (options.formats?.includes('markdown') && response.markdown) {
        contentParts.push(response.markdown);
      }
      if (options.formats?.includes('html') && response.html) {
        contentParts.push(response.html);
      }
      if (options.formats?.includes('rawHtml') && response.rawHtml) {
        contentParts.push(response.rawHtml);
      }

      return {
        url,
        content: contentParts.join('\n\n'),
        metadata: response.metadata,
        formats: options.formats || ['markdown']
      };
    }, `scrape ${url}`);
  }

  private async handleMap(args: any): Promise<any> {
    if (!isMapOptions(args)) {
      throw new Error('Invalid arguments for firecrawl_map');
    }

    const { url, ...options } = args;
    
    return withRetry(async () => {
      const response = await this.client.mapUrl(url, options);
      
      if ('success' in response && !response.success) {
        throw new Error(response.error || 'Mapping failed');
      }

      return {
        url,
        links: response.links || [],
        totalLinks: response.links?.length || 0
      };
    }, `map ${url}`);
  }

  private async handleCrawl(args: any): Promise<any> {
    if (!isCrawlOptions(args)) {
      throw new Error('Invalid arguments for firecrawl_crawl');
    }

    const { url, ...options } = args;
    
    return withRetry(async () => {
      const response = await this.client.crawlUrl(url, options);
      
      if ('success' in response && !response.success) {
        throw new Error(response.error || 'Crawl failed');
      }

      // Handle different response formats - some versions return 'id', others return 'jobId'
      const jobId = (response as any).id || (response as any).jobId || 'unknown';
      
      return {
        jobId,
        status: 'started',
        url,
        message: `Crawl started with job ID: ${jobId}`
      };
    }, `crawl ${url}`);
  }

  private async handleCheckCrawlStatus(args: any): Promise<any> {
    if (!isStatusCheckOptions(args)) {
      throw new Error('Invalid arguments for firecrawl_check_crawl_status');
    }

    return withRetry(async () => {
      const response = await this.client.checkCrawlStatus(args.id);
      
      if ('success' in response && !response.success) {
        throw new Error(response.error || 'Status check failed');
      }

      return {
        jobId: args.id,
        status: response.status,
        data: response.data,
        total: response.total,
        completed: response.completed,
        creditsUsed: response.creditsUsed
      };
    }, `check crawl status ${args.id}`);
  }

  private async handleSearch(args: any): Promise<any> {
    if (!isSearchOptions(args)) {
      throw new Error('Invalid arguments for firecrawl_search');
    }

    return withRetry(async () => {
      // Pass the query string directly as the first parameter
      const response = await this.client.search(args.query, {
        limit: args.limit,
        lang: args.lang,
        country: args.country,
        tbs: args.tbs,
        filter: args.filter,
        location: args.location,
        scrapeOptions: args.scrapeOptions
      });
      
      if ('success' in response && !response.success) {
        throw new Error(response.error || 'Search failed');
      }

      return {
        query: args.query,
        results: response.data || [],
        totalResults: response.data?.length || 0
      };
    }, `search ${args.query}`);
  }

  private async handleExtract(args: any): Promise<any> {
    if (!isExtractOptions(args)) {
      throw new Error('Invalid arguments for firecrawl_extract');
    }

    return withRetry(async () => {
      // Pass URLs as the first parameter, then options
      const response = await this.client.extract(args.urls, {
        prompt: args.prompt,
        systemPrompt: args.systemPrompt,
        schema: args.schema,
        allowExternalLinks: args.allowExternalLinks,
        enableWebSearch: args.enableWebSearch,
        includeSubdomains: args.includeSubdomains
      });
      
      if ('success' in response && !response.success) {
        throw new Error(response.error || 'Extract failed');
      }

      return {
        urls: args.urls,
        extractedData: response.data,
        schema: args.schema
      };
    }, `extract from ${args.urls.length} URLs`);
  }

  private async handleDeepResearch(args: any): Promise<any> {
    if (!isDeepResearchOptions(args)) {
      throw new Error('Invalid arguments for firecrawl_deep_research');
    }

    const { query, ...params } = args;
    
    return withRetry(async () => {
      const response = await this.client.deepResearch(query, params);
      
      if ('success' in response && !response.success) {
        throw new Error(response.error || 'Deep research failed');
      }

      return {
        query,
        analysis: response.data?.finalAnalysis,
        sources: response.data?.sources,
        activities: response.data?.activities
      };
    }, `deep research: ${query}`);
  }

  private async handleGenerateLLMsText(args: any): Promise<any> {
    if (!isGenerateLLMsTextOptions(args)) {
      throw new Error('Invalid arguments for firecrawl_generate_llmstxt');
    }

    return withRetry(async () => {
      // Pass URL as the first parameter, then options
      const response = await this.client.generateLLMsText(args.url, {
        maxUrls: args.maxUrls,
        showFullText: args.showFullText
      });
      
      if ('success' in response && !response.success) {
        throw new Error(response.error || 'LLMs.txt generation failed');
      }

      return {
        url: args.url,
        llmstxt: response.data?.llmstxt,
        llmsfulltxt: args.showFullText ? response.data?.llmsfulltxt : undefined
      };
    }, `generate LLMs.txt for ${args.url}`);
  }
}