/**
 * Firecrawl Developer search tool.
 *
 * Thin MCP wrapper over the `/v2/search/developer` endpoint (GitHub issues,
 * merged pull requests, repository READMEs, and curated documentation sites).
 *
 * The installed `@mendable/firecrawl-js` predates a `developer` client, so we
 * call the endpoint directly through the SDK's HTTP layer (auth + retries) via
 * `client.http.get(...)`, mirroring how the research tools reach
 * `/v2/search/research/*`.
 */

import { z } from 'zod';
import type { FastMCP } from 'fastmcp';

interface SessionData {
  firecrawlApiKey?: string;
  [key: string]: unknown;
}

/** Whatever `getClient` returns — we only touch its `http.get`. */
type ClientLike = {
  http: {
    get: <T = unknown>(
      endpoint: string,
      headers?: Record<string, string>
    ) => Promise<{ data: T; status: number }>;
  };
};

// `getClient` returns a FirecrawlApp whose `http` member is private, so we type
// the callback loosely and narrow to `ClientLike` at each call site.
type GetClient = (session?: SessionData) => unknown;

// The other mount, /v2/developer/search, may be withdrawn.
const BASE = '/v2/search/developer';
const ORIGIN_HEADERS = { 'X-Origin': 'mcp-fastmcp' };

// Cap the matched passages per result so a page of hits stays within the MCP
// output-token limit. Sized like the research GitHub content cap: passages
// carry the signal (repro steps, stack traces, API contracts) the agent needs.
const MAX_PASSAGE_CHARS = 1200;

interface DeveloperHit {
  /** Stable result id, e.g. `issue:owner/repo#123` or `doc:<hash>`. */
  id?: string;
  /** Result kind: `issue`, `pull_request`, `readme`, or `doc`. */
  type?: string;
  url?: string;
  title?: string;
  /** Matched passages in markdown. */
  passages?: { text?: string }[];
}

/**
 * Render developer hits as `## [id] (type) title` / url / passages blocks —
 * the same shape as the research formatters. Markdown passages keep their
 * newlines so tables and code survive.
 */
function fmtDeveloper(results?: DeveloperHit[]): string {
  if (!results || results.length === 0) return '(no results)';
  return results
    .map((r) => {
      const kind = r.type ? ` (${r.type})` : '';
      const lines = [`## [${r.id ?? '?'}]${kind} ${r.title ?? '(untitled)'}`];
      if (r.url) lines.push(r.url);
      const body = (r.passages ?? [])
        .map((p) => p.text ?? '')
        .join('\n---\n')
        .trim();
      lines.push(body ? body.slice(0, MAX_PASSAGE_CHARS) : '(no content)');
      return lines.join('\n');
    })
    .join('\n\n');
}

export function registerDeveloperTools(
  server: Pick<FastMCP<SessionData>, 'addTool'>,
  getClient: GetClient
): void {
  // --- developer search ---
  server.addTool({
    name: 'firecrawl_developer_search',
    annotations: {
      title: 'Search developer sources',
      readOnlyHint: true, // Semantic search over an indexed developer corpus; returns ranked results only.
      openWorldHint: true, // Searches the Firecrawl developer index of public GitHub and documentation content.
      destructiveHint: false, // Query-only; no writes to external sources or the developer index.
    },
    description: `
For a developer question — code behaviour, a library or framework, an API contract, an error message, or a known bug — search an index built for coding agents. The index covers GitHub issues, merged pull requests, repository READMEs, and curated documentation sites. Set skills to "only" to limit the search to agent-skill files.

Returns ranked results with an ID, source type, URL, title, and the matched passages in markdown.
`,
    parameters: z.object({
      query: z
        .string()
        .min(1)
        .describe(
          'Natural-language developer question or search phrase, including the library, error message, or API involved when relevant.'
        ),
      k: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Number of ranked results to return (default 10).'),
      skills: z
        .enum(['only'])
        .optional()
        .describe('Set to "only" to search only agent-skill files.'),
    }),
    execute: async (args: unknown, { session }): Promise<string> => {
      const { query, k, skills } = args as {
        query: string;
        k?: number;
        skills?: 'only';
      };
      const params = new URLSearchParams();
      params.append('query', query);
      if (k != null) params.append('k', String(k));
      if (skills != null) params.append('skills', skills);
      const client = getClient(session) as ClientLike;
      const res = await client.http.get<{ results?: DeveloperHit[] }>(
        `${BASE}?${params.toString()}`,
        ORIGIN_HEADERS
      );
      return fmtDeveloper(res.data?.results);
    },
  });
}
