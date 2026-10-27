/**
 * Firecrawl team credit usage tools.
 *
 * Requests use the SDK's HTTP client so authentication and retries stay owned
 * by the SDK while this MCP server can attach request-origin attribution.
 */

import { z } from 'zod';
import type { ContentResult, McpRuntime } from './mcp/runtime.js';
import { originHeaders, requestOrigin, type McpClient } from './origin';
import { creditUsageOutputSchema, structuredText } from './tool-output';

interface SessionData {
  firecrawlApiKey?: string;
  clientUserAgent?: string;
  [key: string]: unknown;
}

type UsageClient = {
  http: {
    get: <T = unknown>(
      endpoint: string,
      headers?: Record<string, string>
    ) => Promise<{ data: T; status: number }>;
  };
};

type GetClient = (session?: SessionData) => unknown;

interface CreditUsageData {
  remainingCredits?: number;
  remaining_credits?: number;
  planCredits?: number;
  plan_credits?: number;
  billingPeriodStart?: string | null;
  billing_period_start?: string | null;
  billingPeriodEnd?: string | null;
  billing_period_end?: string | null;
}

interface CreditUsageResponse extends CreditUsageData {
  success: boolean;
  data?: CreditUsageData;
  error?: string;
}

interface HistoricalCreditUsageResponse {
  success: boolean;
  bin?: string;
  periods?: unknown[];
  error?: string;
}

function assertSuccessful(
  status: number,
  response: { success?: boolean; error?: string },
  operation: string
): void {
  if (status === 200 && response.success) return;
  throw new Error(response.error || `Failed to ${operation}`);
}

export function registerUsageTools(
  server: Pick<McpRuntime<SessionData>, 'addTool'>,
  getClient: GetClient
): void {
  server.addTool({
    name: 'firecrawl_credit_usage',
    annotations: {
      title: 'Firecrawl credit usage',
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
    description: `
Get the authenticated Firecrawl team's current credit balance or its credit usage over the last 90 days. Use the current view to answer how many credits remain or to check billing-period boundaries. Use the historical view to answer what credits were spent on and when.

The current view returns \`remainingCredits\`, \`planCredits\`, \`billingPeriodStart\`, and \`billingPeriodEnd\`. Extra purchased or granted credits can make \`remainingCredits\` greater than \`planCredits\`. Billing-period dates may be null when the upstream billing provider has no period metadata.

The historical view returns periods sorted by start date with \`startDate\`, \`endDate\`, and \`creditsUsed\`, one per calendar month, or one per UTC day with \`bin: "day"\`. Set \`byEndpoint\` to split each period by the endpoint that used the credits (\`endpoint\`: scrape, search, crawl, map, agent, ...), or \`byApiKey\` to split it by API key (\`apiKey\`). The endpoint split also counts search usage, which the unsplit and per-key figures leave out, so its rows can add up to more. The newest period's \`endDate\` can be null. A \`notice\` means the requested split or daily periods are not available yet and the periods are monthly figures.

This tool cannot attribute credits to individual jobs, URLs, or MCP clients. Each tool's own result reports what that call used (\`creditsUsed\`, or \`metadata.creditsUsed\` on scrapes), and the Usage and Logs pages of the Firecrawl dashboard list usage per job.
`,
    outputSchema: creditUsageOutputSchema,
    parameters: z.object({
      view: z
        .enum(['current', 'historical'])
        .optional()
        .describe(
          'Select current balance or historical usage. Defaults to current.'
        ),
      byApiKey: z
        .boolean()
        .optional()
        .describe(
          'Break historical usage down by API key. When view is omitted, true selects the historical view; it cannot be combined with view "current".'
        ),
      byEndpoint: z
        .boolean()
        .optional()
        .describe(
          'Break historical usage down by endpoint (scrape, search, crawl, map, agent, ...). When view is omitted, true selects the historical view; it cannot be combined with view "current" or byApiKey.'
        ),
      bin: z
        .enum(['month', 'day'])
        .optional()
        .describe(
          'Length of each historical period: calendar month (default) or UTC day. When view is omitted, it selects the historical view; it cannot be combined with view "current".'
        ),
    }),
    execute: async (
      args: unknown,
      { session, client: mcpClient }
    ): Promise<ContentResult> => {
      const { view, byApiKey, byEndpoint, bin } = args as {
        view?: 'current' | 'historical';
        byApiKey?: boolean;
        byEndpoint?: boolean;
        bin?: 'month' | 'day';
      };
      const historicalOption = byApiKey
        ? 'byApiKey'
        : byEndpoint
          ? 'byEndpoint'
          : bin
            ? 'bin'
            : undefined;
      if (view === 'current' && historicalOption) {
        throw new Error(
          `${historicalOption} can only be used with view "historical" or with view omitted.`
        );
      }
      if (byApiKey && byEndpoint) {
        throw new Error('byApiKey and byEndpoint cannot be combined.');
      }

      const client = getClient(session) as UsageClient;
      const headers = originHeaders(requestOrigin(mcpClient as McpClient, session));
      const historical = view === 'historical' || historicalOption !== undefined;

      if (historical) {
        // `bin` is sent whenever a breakdown the API added later is asked
        // for: an API that honours it echoes it, and one that predates it
        // ignores the new parameters and answers with monthly figures.
        const requestedBin =
          bin === 'day' ? 'day' : byEndpoint ? 'month' : undefined;
        const params = new URLSearchParams();
        if (byApiKey) params.set('byApiKey', 'true');
        if (byEndpoint) params.set('byEndpoint', 'true');
        if (requestedBin) params.set('bin', requestedBin);
        const query = params.toString();
        const response = await client.http.get<HistoricalCreditUsageResponse>(
          `/v2/team/credit-usage/historical${query ? `?${query}` : ''}`,
          headers
        );
        assertSuccessful(
          response.status,
          response.data,
          'get historical credit usage'
        );
        if (!requestedBin || response.data.bin === requestedBin) {
          return structuredText(response.data);
        }
        const unavailable = [
          byEndpoint && 'the endpoint split',
          requestedBin === 'day' && 'daily periods',
        ]
          .filter(Boolean)
          .join(' and ');
        return structuredText({
          success: response.data.success,
          periods: response.data.periods,
          notice: `Firecrawl does not offer ${unavailable} yet, so these periods are calendar-month totals${byApiKey ? ' per API key' : ''}.`,
        });
      }

      const response = await client.http.get<CreditUsageResponse>(
        '/v2/team/credit-usage',
        headers
      );
      assertSuccessful(response.status, response.data, 'get credit usage');
      const data = response.data.data ?? response.data;
      return structuredText({
        remainingCredits:
          data.remainingCredits ?? data.remaining_credits ?? 0,
        planCredits: data.planCredits ?? data.plan_credits,
        billingPeriodStart:
          data.billingPeriodStart ?? data.billing_period_start ?? null,
        billingPeriodEnd:
          data.billingPeriodEnd ?? data.billing_period_end ?? null,
      });
    },
  });
}
