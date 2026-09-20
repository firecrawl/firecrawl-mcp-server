/**
 * Firecrawl team credit usage tools.
 *
 * These are thin MCP wrappers over the public v2 SDK methods so API response
 * normalization and error handling stay owned by the Firecrawl SDK.
 */

import { z } from 'zod';
import type { FastMCP } from 'fastmcp';

interface SessionData {
  firecrawlApiKey?: string;
  [key: string]: unknown;
}

type UsageClient = {
  getCreditUsage: () => Promise<unknown>;
  getCreditUsageHistorical: (byApiKey?: boolean) => Promise<unknown>;
};

type GetClient = (session?: SessionData) => unknown;

function asText(data: unknown): string {
  return JSON.stringify(data, null, 2);
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
Get the authenticated Firecrawl team's current credit balance or historical credit consumption. Use the current view to answer how many credits remain or to check billing-period boundaries. Use the historical view for monthly usage reporting and trend analysis.

The current view returns \`remainingCredits\`, \`planCredits\`, \`billingPeriodStart\`, and \`billingPeriodEnd\`. Extra purchased or granted credits can make \`remainingCredits\` greater than \`planCredits\`. Billing-period dates may be null when the upstream billing provider has no period metadata.

The historical view returns periods sorted by start date with \`startDate\`, \`endDate\`, and \`creditsUsed\`. Set \`byApiKey\` to include separate periods per API key, identified by the optional \`apiKey\` field. The newest period's \`endDate\` can be null.
`,
    parameters: z.object({
      view: z
        .enum(['current', 'historical'])
        .optional()
        .describe(
          'Select current balance or historical monthly usage. Defaults to current.'
        ),
      byApiKey: z
        .boolean()
        .optional()
        .describe(
          'For the historical view, break usage down by API key. Defaults to false for team-wide monthly totals.'
        ),
    }),
    execute: async (args: unknown, { session }): Promise<string> => {
      const { view, byApiKey } = args as {
        view?: 'current' | 'historical';
        byApiKey?: boolean;
      };
      const client = getClient(session) as UsageClient;
      return asText(
        view === 'historical'
          ? await client.getCreditUsageHistorical(byApiKey)
          : await client.getCreditUsage()
      );
    },
  });
}
