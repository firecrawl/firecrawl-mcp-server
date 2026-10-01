/**
 * Firecrawl team credit usage tools.
 *
 * Requests use the SDK's HTTP client so authentication and retries stay owned
 * by the SDK while this MCP server can attach request-origin attribution.
 */

import { z } from 'zod';
import type { ContentResult, FastMCP } from 'fastmcp';
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
  periods?: unknown[];
  window?: {
    timeRange: string;
    binSize: string;
    startDate: string;
    endDate: string;
  };
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

interface CurrentCreditUsage {
  remainingCredits: number;
  planCredits?: number;
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
}

export async function readCurrentUsage(
  client: UsageClient,
  headers: Record<string, string>
): Promise<CurrentCreditUsage> {
  const response = await client.http.get<CreditUsageResponse>(
    '/v2/team/credit-usage',
    headers
  );
  assertSuccessful(response.status, response.data, 'get credit usage');
  const data = response.data.data ?? response.data;
  return {
    remainingCredits: data.remainingCredits ?? data.remaining_credits ?? 0,
    planCredits: data.planCredits ?? data.plan_credits,
    billingPeriodStart:
      data.billingPeriodStart ?? data.billing_period_start ?? null,
    billingPeriodEnd: data.billingPeriodEnd ?? data.billing_period_end ?? null,
  };
}

export function registerUsageTools(
  server: Pick<FastMCP<SessionData>, 'addTool'>,
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
Get the authenticated Firecrawl team's current credit balance or historical credit consumption. Use the current view to answer how many credits remain or to check billing-period boundaries. Use the historical view for usage reporting and trend analysis. Set \`timeRange\` to day, week, or month for the last 24 hours, 7 days, or 30 days, respectively, with hourly bins for day and daily bins otherwise. Omit it for calendar-month history.

The current view returns \`remainingCredits\`, \`planCredits\`, \`billingPeriodStart\`, and \`billingPeriodEnd\`. Extra purchased or granted credits can make \`remainingCredits\` greater than \`planCredits\`. Billing-period dates may be null when the upstream billing provider has no period metadata.

The historical view returns periods sorted by start date with \`startDate\`, \`endDate\`, and \`creditsUsed\`. Set \`byApiKey\` to include separate periods per API key, identified by the optional \`apiKey\` field. The newest calendar-month period's \`endDate\` can be null. Rolling ranges include a \`window\` with the exact UTC bounds and bin size, with partial bins at the edges. \`timeRange\` cannot be combined with \`byApiKey\`.
`,
    outputSchema: creditUsageOutputSchema,
    parameters: z.object({
      view: z
        .enum(['current', 'historical'])
        .optional()
        .describe(
          'Select current balance or historical monthly usage. Defaults to current.'
        ),
      timeRange: z
        .enum(['day', 'week', 'month'])
        .optional()
        .describe(
          'Rolling historical range: last 24 hours (day), 7 days (week), or 30 days (month). Selects historical when view is omitted; cannot be combined with current or byApiKey.'
        ),
      byApiKey: z
        .boolean()
        .optional()
        .describe(
          'Break historical usage down by API key. When view is omitted, true selects the historical view; it cannot be combined with view "current".'
        ),
    }),
    execute: async (
      args: unknown,
      { session, client: mcpClient }
    ): Promise<ContentResult> => {
      const { view, byApiKey, timeRange } = args as {
        view?: 'current' | 'historical';
        timeRange?: 'day' | 'week' | 'month';
        byApiKey?: boolean;
      };
      if (view === 'current' && byApiKey) {
        throw new Error(
          'byApiKey can only be used with view "historical" or with view omitted.'
        );
      }

      if (timeRange && (view === 'current' || byApiKey)) {
        throw new Error(
          'timeRange requires historical usage without byApiKey.'
        );
      }
      const client = getClient(session) as UsageClient;
      const headers = originHeaders(
        requestOrigin(mcpClient as McpClient, session)
      );
      const historical =
        view === 'historical' || byApiKey === true || !!timeRange;

      if (historical) {
        const query = timeRange
          ? `?timeRange=${timeRange}`
          : byApiKey
            ? '?byApiKey=true'
            : '';
        const response = await client.http.get<HistoricalCreditUsageResponse>(
          `/v2/team/credit-usage/historical${query}`,
          headers
        );
        assertSuccessful(
          response.status,
          response.data,
          'get historical credit usage'
        );
        if (timeRange && response.data.window?.timeRange !== timeRange) {
          throw new Error(
            'Rolling usage is not available on this API deployment yet.'
          );
        }
        return structuredText(response.data);
      }

      return structuredText(await readCurrentUsage(client, headers));
    },
  });
}
