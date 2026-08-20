/**
 * Firecrawl Developer search tool.
 *
 * MCP wrapper over the canonical `/v2/search/developer` endpoint (GitHub
 * issues, merged pull requests, repository READMEs, and curated docs).
 */

import { z } from 'zod';
import type { FastMCP } from 'fastmcp';

interface SessionData {
  firecrawlApiKey?: string;
  [key: string]: unknown;
}

interface DeveloperSearchRequest {
  query: string;
  k?: number;
}

interface DeveloperLicense {
  state: 'licensed' | 'known_absent' | 'unknown';
  spdx_id: string | null;
}

interface DeveloperSearchResponse {
  success: boolean;
  results: Array<{
    id: string;
    url: string;
    title?: string;
    passages: Array<{ text: string; citation_url?: string }>;
    // Accept both shapes while the API flattens license objects to SPDX strings.
    license?: DeveloperLicense | string;
  }>;
  repos?: Array<{
    repo: string;
    indexed: boolean;
    types: { issue: boolean; pullRequest: boolean; readme: boolean };
  }>;
  sources?: Array<{ source: string; indexed: boolean }>;
}

type SearchDeveloper = (
  request: DeveloperSearchRequest,
  session?: SessionData
) => Promise<DeveloperSearchResponse>;

function withoutUndefined(
  request: DeveloperSearchRequest
): DeveloperSearchRequest {
  return Object.fromEntries(
    Object.entries(request).filter(([, value]) => value !== undefined)
  ) as unknown as DeveloperSearchRequest;
}

const QUERY_DESCRIPTION =
  'Natural-language developer question or search phrase. Express repository, source, result-kind, language, topic, license, skill, and other scoping intent here; semantic retrieval handles the scoping. Advanced filters are available on the REST API: https://docs.firecrawl.dev/features/developer';
const K_DESCRIPTION =
  'Total ranked results to return, from 1 to 100 (default 10). This is the only control besides the semantic query; use the REST API for advanced filters.';

const developerParameters = z
  .object({
    query: z
      .string()
      .min(1)
      .refine((value) => value.trim().length > 0, {
        message: 'Query must not be blank.',
      })
      .refine((value) => Buffer.byteLength(value, 'utf8') <= 4096, {
        message: 'Query must be at most 4096 bytes.',
      })
      .describe(QUERY_DESCRIPTION),
    k: z.number().int().min(1).max(100).optional().describe(K_DESCRIPTION),
  })
  .strict();

// FastMCP's schema converter resolves a separate Zod peer whose metadata
// registry cannot see descriptions attached by this package's Zod instance.
// Supply the Standard JSON Schema extension explicitly so agents receive them.
const standardSchema = developerParameters[
  '~standard'
] as (typeof developerParameters)['~standard'] & {
  jsonSchema: {
    input: () => Record<string, unknown>;
  };
};
standardSchema.jsonSchema = {
  input: () => ({
    type: 'object',
    properties: {
      query: { type: 'string', minLength: 1, description: QUERY_DESCRIPTION },
      k: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        description: K_DESCRIPTION,
      },
    },
    required: ['query'],
    additionalProperties: false,
  }),
};

export function registerDeveloperTools(
  server: Pick<FastMCP<SessionData>, 'addTool'>,
  searchDeveloper: SearchDeveloper
): void {
  server.addTool({
    name: 'firecrawl_developer_search',
    annotations: {
      title: 'Search developer sources',
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
    description: `
Search an index built for coding agents for code behaviour, library and framework usage, API contracts, error messages, and known bugs. The index covers GitHub issues, merged pull requests, repository READMEs, and curated documentation sites.

This MCP tool intentionally accepts only a query and result count. Express all repository, source, result-kind, language, topic, license, skill, and other scoping intent in the natural-language query; semantic retrieval handles the scoping. The full filter surface remains available on the REST API for advanced use: https://docs.firecrawl.dev/features/developer

Returns the complete JSON response unchanged. Each result has an ID whose prefix identifies its kind, URL, title when available, and server-selected passages. Passages may include citation_url, repository results may include a license disclosure, and the response may include repository or source indexing status.
`,
    parameters: developerParameters,
    execute: async (args: unknown, { session }): Promise<string> => {
      const request = withoutUndefined(args as DeveloperSearchRequest);
      const response = await searchDeveloper(request, session);
      return JSON.stringify(response, null, 2);
    },
  });
}
