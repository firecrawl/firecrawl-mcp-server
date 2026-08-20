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

type DeveloperSearchType = 'doc' | 'issue' | 'pull_request' | 'readme';

interface DeveloperSearchRequest {
  query: string;
  k?: number;
  passages?: number;
  types?: DeveloperSearchType[];
  repos?: string[];
  sources?: string[];
  language?: string;
  topic?: string[];
  license?: string;
  min_stars?: number;
  max_stars?: number;
  archived?: boolean;
  fork?: boolean;
  skills?: 'only';
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

Use repos to scope GitHub-backed result types and sources to scope documentation. If both are supplied, the two origins are OR-combined. Use types to select doc, issue, pull_request, and/or readme evidence. Repository metadata filters apply to repository-backed results. Set skills to "only" for packaged agent-skill evidence only (which requires the doc type).

Returns the complete JSON response. Each result has an ID whose prefix identifies its kind, URL, title when available, and all requested passages. Passages may include citation_url. Repository results may include a license disclosure. When repos or sources are requested, their top-level indexed-status echoes distinguish no matches from content that is not indexed.
`,
    parameters: z
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
          .describe(
            'Natural-language developer question or search phrase. Must be nonblank and at most 4096 bytes.'
          ),
        k: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe(
            'Total ranked results to return, from 1 to 100 (default 10).'
          ),
        passages: z
          .number()
          .int()
          .min(1)
          .max(5)
          .optional()
          .describe(
            'Passages to return per result, from 1 to 5 (default 1). Use more when the task needs multiple pieces of evidence from each result.'
          ),
        types: z
          .array(z.enum(['doc', 'issue', 'pull_request', 'readme']))
          .min(1)
          .max(4)
          .optional()
          .describe(
            'Result kinds to search. doc covers curated documentation; issue, pull_request, and readme cover GitHub repositories. Omit to search all kinds.'
          ),
        repos: z
          .array(z.string().min(1))
          .min(1)
          .max(20)
          .optional()
          .describe(
            'GitHub repositories as owner/name slugs, at most 20. Alone, scopes to GitHub-backed kinds. With sources, OR-combines matching GitHub and documentation results.'
          ),
        sources: z
          .array(z.string().min(1))
          .min(1)
          .max(20)
          .optional()
          .describe(
            'Developer documentation source IDs, at most 20 (not web/news/image source types). Alone, scopes to doc results. With repos, OR-combines both origins.'
          ),
        language: z
          .string()
          .min(1)
          .optional()
          .describe(
            'One repository primary language using a GitHub Linguist name, matched case-insensitively (for example Rust or TypeScript).'
          ),
        topic: z
          .array(z.string().min(1))
          .min(1)
          .max(8)
          .optional()
          .describe(
            'Repository topics, at most 8. All listed topics must match; values are normalized to lowercase by the API.'
          ),
        license: z
          .string()
          .min(1)
          .optional()
          .describe(
            'One SPDX repository license identifier, matched case-insensitively (for example MIT or Apache-2.0). Excludes results without a verified repository license.'
          ),
        min_stars: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe(
            'Minimum repository stars. Unscoped searches use documented star bands and accept at most 100000; repo-scoped searches use exact repository profile values.'
          ),
        max_stars: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe(
            'Maximum repository stars. Unscoped searches use documented star bands and accept at most 99999; repo-scoped searches use exact values.'
          ),
        archived: z
          .boolean()
          .optional()
          .describe(
            'Filter repository-backed results by archived status. Set true for archived repositories or false for active repositories.'
          ),
        fork: z
          .boolean()
          .optional()
          .describe(
            'Filter repository-backed results by fork status. Set true for forks or false for non-forks.'
          ),
        skills: z
          .enum(['only'])
          .optional()
          .describe(
            'Set to "only" to return packaged agent-skill evidence and nothing else. Skills are doc-only, so omit types or include doc.'
          ),
      })
      .superRefine((args, context) => {
        if (
          !args.repos?.length &&
          args.min_stars != null &&
          args.min_stars > 100000
        ) {
          context.addIssue({
            code: 'custom',
            message:
              'Unscoped min_stars cannot exceed 100000; name repos for exact higher values.',
            path: ['min_stars'],
          });
        }
        if (
          !args.repos?.length &&
          args.max_stars != null &&
          args.max_stars >= 100000
        ) {
          context.addIssue({
            code: 'custom',
            message:
              'Unscoped max_stars cannot exceed 99999; name repos for exact higher values.',
            path: ['max_stars'],
          });
        }
        if (
          args.min_stars != null &&
          args.max_stars != null &&
          args.min_stars > args.max_stars
        ) {
          context.addIssue({
            code: 'custom',
            message: 'min_stars must not exceed max_stars.',
            path: ['max_stars'],
          });
        }
      }),
    execute: async (args: unknown, { session }): Promise<string> => {
      const request = withoutUndefined(args as DeveloperSearchRequest);
      const response = await searchDeveloper(request, session);
      return JSON.stringify(response, null, 2);
    },
  });
}
