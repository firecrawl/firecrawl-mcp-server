import Firecrawl from '@mendable/firecrawl-js';

export type FirecrawlClient = InstanceType<typeof Firecrawl>;

export interface FirecrawlClientOptions {
  apiKey?: string;
  apiUrl?: string;
}

export function createFirecrawlClient(options: FirecrawlClientOptions): FirecrawlClient {
  const config: Record<string, unknown> = {};

  if (options.apiUrl) config.apiUrl = options.apiUrl;
  if (options.apiKey) config.apiKey = options.apiKey;

  return new Firecrawl(config as any) as FirecrawlClient;
}

export function createFirecrawlClientFromEnv(
  overrides: Partial<FirecrawlClientOptions> = {}
): FirecrawlClient {
  return createFirecrawlClient({
    apiKey: overrides.apiKey ?? process.env.FIRECRAWL_API_KEY,
    apiUrl: overrides.apiUrl ?? process.env.FIRECRAWL_API_URL,
  });
}
