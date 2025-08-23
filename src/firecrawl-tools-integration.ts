/**
 * Firecrawl Tools Integration for MCP STREAMABLE_HTTP
 * 
 * This module integrates Firecrawl functionality with the standardized
 * MCP STREAMABLE_HTTP server implementation.
 */

import Firecrawl from '@mendable/firecrawl-js';

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

// Type guards (using any type for v2 compatibility)
function isScrapeOptions(args: unknown): args is any {
  return (
    typeof args === 'object' &&
    args !== null &&
    'url' in args &&
    typeof (args as { url: unknown }).url === 'string'
  );
}

function isMapOptions(args: unknown): args is any {
  return (
    typeof args === 'object' &&
    args !== null &&
    'url' in args &&
    typeof (args as { url: unknown }).url === 'string'
  );
}

function isCrawlOptions(args: unknown): args is any {
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

function isBatchScrapeOptions(args: unknown): args is {
  urls: string[];
  scrapeOptions?: any;
} {
  if (typeof args !== 'object' || args === null) return false;
  const { urls } = args as { urls?: unknown };
  return Array.isArray(urls) && urls.every((url): url is string => typeof url === 'string');
}

function isCrawlParamsPreviewOptions(args: unknown): args is {
  url: string;
  prompt?: string;
} {
  return (
    typeof args === 'object' &&
    args !== null &&
    'url' in args &&
    typeof (args as { url: unknown }).url === 'string'
  );
}

// Utility function to trim trailing whitespace from text responses
function trimResponseText(text: string): string {
  return text.trim();
}

// Format results helper  
function formatResults(data: any[]): string {
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
  private client: Firecrawl;

  constructor() {
    const FIRECRAWL_API_URL = process.env.FIRECRAWL_API_URL;
    const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;

    // Initialize Firecrawl client (v2 SDK)
    this.client = new Firecrawl({
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
        case 'firecrawl_batch_scrape':
          result = await this.handleBatchScrape(args);
          break;
        case 'firecrawl_check_batch_status':
          result = await this.handleCheckBatchStatus(args);
          break;
        case 'firecrawl_crawl_params_preview':
          result = await this.handleCrawlParamsPreview(args);
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
    
    // Set default formats if not specified
    if (!options.formats || options.formats.length === 0) {
      options.formats = ['markdown'];
    }
    
    return withRetry(async () => {
      // Use v2 SDK method: scrape instead of scrapeUrl
      const response = await this.client.scrape(url, options);

      if ('success' in response && !(response as any).success) {
        throw new Error((response as any).error || 'Scraping failed');
      }

      // Handle v2 response structure: response.data.*
      const data = (response as any).data || response;
      
      // Format content based on requested formats
      const contentParts = [];
      
      // Try to extract content in priority order
      const formats = options.formats || ['markdown'];
      for (const format of formats) {
        if (format === 'markdown' && data.markdown) {
          contentParts.push(data.markdown);
        } else if (format === 'html' && data.html) {
          contentParts.push(data.html);
        } else if (format === 'rawHtml' && data.rawHtml) {
          contentParts.push(data.rawHtml);
        } else if (format === 'summary' && data.summary) {
          contentParts.push(data.summary);
        } else if (format === 'links' && data.links) {
          contentParts.push(JSON.stringify(data.links, null, 2));
        }
      }
      
      // Fallback: if no content found but data exists, try to extract any available content
      if (contentParts.length === 0 && data) {
        if (data.markdown) {
          contentParts.push(data.markdown);
        } else if (data.html) {
          contentParts.push(data.html);
        } else if (data.rawHtml) {
          contentParts.push(data.rawHtml);
        } else if (data.content) {
          contentParts.push(data.content);
        }
      }

      return {
        url,
        content: contentParts.join('\n\n'),
        metadata: data.metadata,
        rawResponse: data // Include raw response for debugging
      };
    }, 'scrape operation');
  }

  private async handleMap(args: any): Promise<any> {
    if (!isMapOptions(args)) {
      throw new Error('Invalid arguments for firecrawl_map');
    }

    const { url, ...options } = args;
    
    return withRetry(async () => {
      // Use v2 SDK method: map instead of mapUrl
      const response = await this.client.map(url, options);
      
      if ('success' in response && !(response as any).success) {
        throw new Error((response as any).error || 'Mapping failed');
      }

      // Handle v2 response structure
      const data = (response as any).data || response;
      
      return {
        url,
        links: data.links || [],
        totalLinks: data.links?.length || 0
      };
    }, `map ${url}`);
  }

  private async handleCrawl(args: any): Promise<any> {
    if (!isCrawlOptions(args)) {
      throw new Error('Invalid arguments for firecrawl_crawl');
    }

    const { url, ...options } = args;
    
    return withRetry(async () => {
      // Use v2 SDK method: startCrawl instead of crawlUrl
      const response = await this.client.startCrawl(url, options);
      
      if ('success' in response && !(response as any).success) {
        throw new Error((response as any).error || 'Crawl failed');
      }

      // v2 returns {id: "..."}
      const jobId = response.id || 'unknown';
      
      return {
        jobId,
        status: 'started',
        url,
        message: `Crawl started for ${url} with ID: ${jobId}`
      };
    }, `crawl ${url}`);
  }

  private async handleCheckCrawlStatus(args: any): Promise<any> {
    if (!isStatusCheckOptions(args)) {
      throw new Error('Invalid arguments for firecrawl_check_crawl_status');
    }

    return withRetry(async () => {
      // Use v2 SDK method: getCrawlStatus instead of checkCrawlStatus
      const response = await this.client.getCrawlStatus(args.id);
      
      if ('success' in response && !(response as any).success) {
        throw new Error((response as any).error || 'Status check failed');
      }

      return {
        jobId: args.id,
        status: response.status,
        total: response.total || 0,
        completed: response.completed || 0,
        data: response.data || [],
        creditsUsed: response.creditsUsed
      };
    }, `check crawl status ${args.id}`);
  }

  private async handleSearch(args: any): Promise<any> {
    if (!isSearchOptions(args)) {
      throw new Error('Invalid arguments for firecrawl_search');
    }

    return withRetry(async () => {
      // Pass the query string directly as the first parameter, with minimal options
      const response = await this.client.search(args.query, {
        limit: args.limit,
        scrapeOptions: args.scrapeOptions
      });
      
      if ('success' in response && !response.success) {
        throw new Error((response as any).error || 'Search failed');
      }

      // Handle v2 response structure
      const results = (response as any).data || [];

      return {
        query: args.query,
        results: results,
        totalResults: results.length || 0
      };
    }, `search ${args.query}`);
  }

  private async handleExtract(args: any): Promise<any> {
    if (!isExtractOptions(args)) {
      throw new Error('Invalid arguments for firecrawl_extract');
    }

    return withRetry(async () => {
      // Use v2 SDK method: extract with proper parameters
      const response = await this.client.extract({
        urls: args.urls,
        prompt: args.prompt,
        schema: args.schema as any
      });
      
      if ('success' in response && !(response as any).success) {
        throw new Error((response as any).error || 'Extract failed');
      }

      return {
        urls: args.urls,
        extractedData: (response as any).data,
        schema: args.schema
      };
    }, `extract from ${args.urls.length} URLs`);
  }

  private async handleDeepResearch(args: any): Promise<any> {
    throw new Error('Deep research is not supported in this version. This feature may be available in future releases.');
  }

  private async handleGenerateLLMsText(args: any): Promise<any> {
    throw new Error('LLMs.txt generation is not supported in this version. This feature may be available in future releases.');
  }

  private async handleBatchScrape(args: any): Promise<any> {
    throw new Error('Batch scrape is not supported in this version. This feature may be available in future releases.');
  }

  private async handleCheckBatchStatus(args: any): Promise<any> {
    throw new Error('Batch status check is not supported in this version. This feature may be available in future releases.');
  }

  private async handleCrawlParamsPreview(args: any): Promise<any> {
    throw new Error('Crawl params preview is not supported in this version. This feature may be available in future releases.');
  }
}