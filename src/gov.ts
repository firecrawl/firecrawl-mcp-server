/**
 * Firecrawl Government Index search tool.
 *
 * Thin MCP wrapper over the `/v2/search/gov` endpoint, called
 * through the SDK's HTTP layer (auth + retries) via `client.http.get(...)`.
 */

import { z } from 'zod';
import { type ContentResult, type FastMCP, UserError } from 'fastmcp';
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

const COURT_TYPES = [
  'federal-supreme',
  'federal-appellate',
  'federal-district',
  'federal-bankruptcy',
  'federal-special',
  'military',
  'state-supreme',
  'state-appellate',
  'state-trial',
  'state-special',
  'state-attorney-general',
] as const;

const govSearchParameters = z.strictObject({
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
  jurisdiction: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^us(-[a-z]{2})?$/,
      'jurisdiction must be "us" for federal, or "us-" plus a two-letter state or territory code, such as "us-ca" or "us-dc"'
    )
    .optional()
    .describe(
      'Keep only pages of one jurisdiction: "us" for federal, or "us-" plus a two-letter state or territory code, such as "us-ca" or "us-dc".'
    ),
  court: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      'Keep only pages labeled for one court, by CourtListener court id, such as "scotus", "ca9" or "nysd".'
    ),
  courtType: z
    .enum(COURT_TYPES)
    .optional()
    .describe(
      `Keep only pages from one type of court: ${COURT_TYPES.join(', ')}.`
    ),
  cites: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      'Keep only pages that cite one law or case, as a printed citation such as "42 U.S.C. § 1983" or "5 U.S. 137", or a citation id such as "us:usc:42:1983".'
    ),
  domain: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe('Keep only pages from one site, such as "irs.gov".'),
});

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
Search US federal, state, and local statutes, regulations, codes, court opinions, and other government publications for legal or regulatory questions that need primary text. Clarify a missing jurisdiction or ambiguous as-of date before identifying the governing rule.

Optional filters narrow results by jurisdiction, court, court type, cited law or case, and site. Filters keep only pages the index has labeled, so a filtered search can leave out relevant pages, and no results does not mean none exist. Court labels are most complete for federal courts and case-law collections.

Returns ranked results with a position, title, URL, and matched snippet. Results may include historical versions, bill text, agency guidance, and third-party reproductions. Verify the issuer, jurisdiction, enacted/effective status, and version before citing current governing law. Read a known URL or additional page context with firecrawl_scrape. Use general search for non-US questions or missing coverage; no hits does not establish that no applicable law exists.
`,
    outputSchema: govSearchOutputSchema,
    parameters: govSearchParameters,
    execute: async (
      args: unknown,
      { session, client: mcpClient }
    ): Promise<ContentResult> => {
      const { query, ...options } = args as z.infer<typeof govSearchParameters>;
      const params = new URLSearchParams({ query });
      for (const [key, value] of Object.entries(options)) {
        if (value != null) params.append(key, String(value));
      }
      const client = getClient(session) as ClientLike;
      const res = await client.http
        .get<{
          data?: { web?: GovHit[] };
        }>(
          `${BASE}?${params.toString()}`,
          originHeaders(requestOrigin(mcpClient, session))
        )
        .catch((error: unknown) => {
          const response = (
            error as
              | { response?: { status?: number; data?: { error?: unknown } } }
              | undefined
          )?.response;
          const message = response?.data?.error;
          if (response?.status !== 400 || typeof message !== 'string') {
            throw error;
          }
          throw new UserError(message, { status: 400, error: message });
        });
      const results = res.data?.data?.web ?? [];
      return withStructured(fmtGov(results), { results });
    },
  });
}
