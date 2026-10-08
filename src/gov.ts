/**
 * Firecrawl Government Index search tool.
 *
 * Thin MCP wrapper over the `/v2/search/gov` endpoint, called
 * through the SDK's HTTP layer (auth + retries) via `client.http.get(...)`.
 */

import { z } from 'zod';
import type { ContentResult, FastMCP } from 'fastmcp';
import { withAgentHints } from './agent-hints';
import { originHeaders, requestOrigin } from './origin';
import { govSearchOutputSchema, withStructured } from './tool-output';

interface SessionData {
  firecrawlApiKey?: string;
  /** The User-Agent the session was authenticated with (see src/origin.ts). */
  clientUserAgent?: string;
  [key: string]: unknown;
}

type ClientLike = {
  http: {
    get: <T = unknown>(
      endpoint: string,
      headers?: Record<string, string>
    ) => Promise<{ data: T; status: number }>;
  };
};

type GetClient = (session?: SessionData) => unknown;

const BASE = '/v2/search/gov';

interface GovHit {
  url?: string;
  title?: string;
  description?: string;
  position?: number;
}

/** Render hits as `## <position>. <title>` / url / description blocks. */
function fmtGov(results?: GovHit[]): string {
  if (!results || results.length === 0) return '(no results)';
  return results
    .map((r, i) => {
      const lines = [`## ${r.position ?? i + 1}. ${r.title ?? '(untitled)'}`];
      if (r.url) lines.push(r.url);
      if (r.description) lines.push(r.description);
      return lines.join('\n');
    })
    .join('\n\n');
}

export function registerGovTools(
  server: Pick<FastMCP<SessionData>, 'addTool'>,
  getClient: GetClient
): void {
  server.addTool({
    name: 'firecrawl_gov_search',
    annotations: {
      title: 'Firecrawl Government Index search',
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
    description: `
Search US federal, state, and local statutes, regulations, codes, court opinions, and other government publications for legal or regulatory questions that need primary text.

Returns ranked results with a position, title, URL, and matched snippet. Results may include historical versions, bill text, agency guidance, and third-party reproductions. Verify the issuer, jurisdiction, enacted/effective status, and version before citing current governing law. Read a known URL or additional page context with firecrawl_scrape. Use general search for non-US questions or missing coverage; no hits does not establish that no applicable law exists.
`,
    outputSchema: govSearchOutputSchema,
    parameters: z.object({
      query: z
        .string()
        .min(1)
        .describe(
          'Natural-language legal or regulatory question or search phrase, including the jurisdiction, agency, or citation when relevant.'
        ),
      k: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Number of ranked results to return (default 10).'),
    }),
    execute: async (
      args: unknown,
      { session, client: mcpClient }
    ): Promise<ContentResult> => {
      const { query, k } = args as { query: string; k?: number };
      const params = new URLSearchParams();
      params.append('query', query);
      if (k != null) params.append('k', String(k));
      const client = getClient(session) as ClientLike;
      const res = await client.http.get<{
        data?: { web?: GovHit[] };
      }>(
        `${BASE}?${params.toString()}`,
        originHeaders(requestOrigin(mcpClient, session))
      );
      const results = res.data?.data?.web ?? [];
      return withAgentHints(
        withStructured(fmtGov(results), { results }),
        res.data,
        true
      );
    },
  });
}
