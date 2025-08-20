import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import FirecrawlApp from '@mendable/firecrawl-js';
import type {
  SearchResponse,
  BatchScrapeResponse,
  BatchScrapeStatusResponse,
  CrawlResponse,
  CrawlStatusResponse,
  ScrapeResponse,
  FirecrawlDocument,
  SearchParams,
} from '@mendable/firecrawl-js';
import {
  describe,
  expect,
  jest,
  test,
  beforeEach,
  afterEach,
} from '@jest/globals';
import { mock, MockProxy } from 'jest-mock-extended';

// Mock FirecrawlApp
jest.mock('@mendable/firecrawl-js');

// Test interfaces
interface RequestParams {
  method: string;
  params: {
    name: string;
    arguments?: Record<string, any>;
  };
}

interface BatchScrapeArgs {
  urls: string[];
  options?: {
    formats?: string[];
    [key: string]: any;
  };
}

interface StatusCheckArgs {
  id: string;
}

interface SearchArgs {
  query: string;
  scrapeOptions?: {
    formats?: string[];
    onlyMainContent?: boolean;
  };
}

interface ScrapeArgs {
  url: string;
  formats?: string[];
  onlyMainContent?: boolean;
}

interface CrawlArgs {
  url: string;
  maxDepth?: number;
  limit?: number;
}

// Mock client interface
interface MockFirecrawlClient {
  scrapeUrl(url: string, options?: any): Promise<ScrapeResponse>;
  search(query: string, params?: SearchParams): Promise<SearchResponse>;
  asyncBatchScrapeUrls(
    urls: string[],
    options?: any
  ): Promise<BatchScrapeResponse>;
  checkBatchScrapeStatus(id: string): Promise<BatchScrapeStatusResponse>;
  asyncCrawlUrl(url: string, options?: any): Promise<CrawlResponse>;
  checkCrawlStatus(id: string): Promise<CrawlStatusResponse>;
  cancelCrawl(id: string): Promise<{ success: boolean; error?: string }>;
  mapUrl(url: string, options?: any): Promise<{ links: string[] }>;
}

describe('Firecrawl Tool Tests', () => {
  let mockClient: MockProxy<MockFirecrawlClient>;
  let requestHandler: (request: RequestParams) => Promise<any>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = mock<MockFirecrawlClient>();

    // Set up mock implementations
    const mockInstance = new FirecrawlApp({ apiKey: 'test' });
    Object.assign(mockInstance, mockClient);

    // Create request handler
    requestHandler = async (request: RequestParams) => {
      const { name, arguments: args } = request.params;
      if (!args) {
        throw new Error('No arguments provided');
      }
      return handleRequest(name, args, mockClient);
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // Test scrape functionality
  test('should handle scrape request', async () => {
    const url = 'https://example.com';
    const options = { formats: ['markdown'] };

    const mockResponse: ScrapeResponse = {
      success: true,
      markdown: '# Test Content',
      html: undefined,
      rawHtml: undefined,
      url: 'https://example.com',
      actions: undefined as never,
    };

    mockClient.scrapeUrl.mockResolvedValueOnce(mockResponse);

    const response = await requestHandler({
      method: 'call_tool',
      params: {
        name: 'firecrawl_scrape',
        arguments: { url, ...options },
      },
    });

    expect(response).toEqual({
      content: [{ type: 'text', text: '# Test Content' }],
      isError: false,
    });
    expect(mockClient.scrapeUrl).toHaveBeenCalledWith(url, {
      formats: ['markdown'],
      url,
    });
  });

  // Test scrape with maxAge parameter
  test('should handle scrape request with maxAge parameter', async () => {
    const url = 'https://example.com';
    const options = { formats: ['markdown'], maxAge: 3600000 };

    const mockResponse: ScrapeResponse = {
      success: true,
      markdown: '# Test Content',
      html: undefined,
      rawHtml: undefined,
      url: 'https://example.com',
      actions: undefined as never,
    };

    mockClient.scrapeUrl.mockResolvedValueOnce(mockResponse);

    const response = await requestHandler({
      method: 'call_tool',
      params: {
        name: 'firecrawl_scrape',
        arguments: { url, ...options },
      },
    });

    expect(response).toEqual({
      content: [{ type: 'text', text: '# Test Content' }],
      isError: false,
    });
    expect(mockClient.scrapeUrl).toHaveBeenCalledWith(url, {
      formats: ['markdown'],
      maxAge: 3600000,
      url,
    });
  });

  // Test batch scrape functionality
  test('should handle batch scrape request', async () => {
    const urls = ['https://example.com'];
    const options = { formats: ['markdown'] };

    mockClient.asyncBatchScrapeUrls.mockResolvedValueOnce({
      success: true,
      id: 'test-batch-id',
    });

    const response = await requestHandler({
      method: 'call_tool',
      params: {
        name: 'firecrawl_batch_scrape',
        arguments: { urls, options },
      },
    });

    expect(response.content[0].text).toContain(
      'Batch operation queued with ID: batch_'
    );
    expect(mockClient.asyncBatchScrapeUrls).toHaveBeenCalledWith(urls, options);
  });

  // Test search functionality
  test('should handle search request', async () => {
    const query = 'test query';
    const scrapeOptions = { formats: ['markdown'] };

    const mockSearchResponse: SearchResponse = {
      success: true,
      data: [
        {
          url: 'https://example.com',
          title: 'Test Page',
          description: 'Test Description',
          markdown: '# Test Content',
          actions: undefined as never,
        },
      ],
    };

    mockClient.search.mockResolvedValueOnce(mockSearchResponse);

    const response = await requestHandler({
      method: 'call_tool',
      params: {
        name: 'firecrawl_search',
        arguments: { query, scrapeOptions },
      },
    });

    expect(response.isError).toBe(false);
    expect(response.content[0].text).toContain('Test Page');
    expect(mockClient.search).toHaveBeenCalledWith(query, scrapeOptions);
  });

  // Test crawl functionality
  test('should handle crawl request', async () => {
    const url = 'https://example.com';
    const options = { maxDepth: 2 };

    mockClient.asyncCrawlUrl.mockResolvedValueOnce({
      success: true,
      id: 'test-crawl-id',
    });

    const response = await requestHandler({
      method: 'call_tool',
      params: {
        name: 'firecrawl_crawl',
        arguments: { url, ...options },
      },
    });

    expect(response.isError).toBe(false);
    expect(response.content[0].text).toContain('test-crawl-id');
    expect(mockClient.asyncCrawlUrl).toHaveBeenCalledWith(url, {
      maxDepth: 2,
      url,
    });
  });

  // Test cancel crawl functionality
  test('should handle cancel crawl request', async () => {
    const crawlId = 'test-crawl-id';

    mockClient.cancelCrawl.mockResolvedValueOnce({
      success: true,
    });

    const response = await requestHandler({
      method: 'call_tool',
      params: {
        name: 'firecrawl_cancel_crawl',
        arguments: { id: crawlId },
      },
    });

    expect(response.isError).toBe(false);
    expect(response.content[0].text).toContain('cancelled successfully');
    expect(mockClient.cancelCrawl).toHaveBeenCalledWith(crawlId);
  });

  // Test error handling
  test('should handle API errors', async () => {
    const url = 'https://example.com';

    mockClient.scrapeUrl.mockRejectedValueOnce(new Error('API Error'));

    const response = await requestHandler({
      method: 'call_tool',
      params: {
        name: 'firecrawl_scrape',
        arguments: { url },
      },
    });

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('API Error');
  });

  // Test rate limiting
  test('should handle rate limits', async () => {
    const url = 'https://example.com';

    // Mock rate limit error
    mockClient.scrapeUrl.mockRejectedValueOnce(
      new Error('rate limit exceeded')
    );

    const response = await requestHandler({
      method: 'call_tool',
      params: {
        name: 'firecrawl_scrape',
        arguments: { url },
      },
    });

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('rate limit exceeded');
  });
});

// Helper function to simulate request handling
async function handleRequest(
  name: string,
  args: any,
  client: MockFirecrawlClient
) {
  try {
    switch (name) {
      case 'firecrawl_scrape': {
        const response = await client.scrapeUrl(args.url, args);
        if (!response.success) {
          throw new Error(response.error || 'Scraping failed');
        }
        return {
          content: [
            { type: 'text', text: response.markdown || 'No content available' },
          ],
          isError: false,
        };
      }

      case 'firecrawl_batch_scrape': {
        const response = await client.asyncBatchScrapeUrls(
          args.urls,
          args.options
        );
        return {
          content: [
            {
              type: 'text',
              text: `Batch operation queued with ID: batch_1. Use firecrawl_check_batch_status to check progress.`,
            },
          ],
          isError: false,
        };
      }

      case 'firecrawl_search': {
        const response = await client.search(args.query, args.scrapeOptions);
        if (!response.success) {
          throw new Error(response.error || 'Search failed');
        }
        const results = response.data
          .map(
            (result) =>
              `URL: ${result.url}\nTitle: ${
                result.title || 'No title'
              }\nDescription: ${result.description || 'No description'}\n${
                result.markdown ? `\nContent:\n${result.markdown}` : ''
              }`
          )
          .join('\n\n');
        return {
          content: [{ type: 'text', text: results }],
          isError: false,
        };
      }

      case 'firecrawl_crawl': {
        const response = await client.asyncCrawlUrl(args.url, args);
        if (!response.success) {
          throw new Error(response.error);
        }
        return {
          content: [
            {
              type: 'text',
              text: `Started crawl for ${args.url} with job ID: ${response.id}`,
            },
          ],
          isError: false,
        };
      }

      case 'firecrawl_cancel_crawl': {
        const response = await client.cancelCrawl(args.id);
        if (!response.success) {
          throw new Error(response.error || 'Failed to cancel crawl');
        }
        return {
          content: [
            {
              type: 'text',
              text: `Crawl job ${args.id} has been cancelled successfully.`,
            },
          ],
          isError: false,
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: error instanceof Error ? error.message : String(error),
        },
      ],
      isError: true,
    };
  }
}
