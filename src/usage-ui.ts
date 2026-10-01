import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import type { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { originHeaders, requestOrigin, type McpClient } from './origin';
import { readCurrentUsage } from './usage';
import { creditUsageOutputSchema, structuredText } from './tool-output';

interface SessionData {
  firecrawlApiKey?: string;
  clientUserAgent?: string;
  [key: string]: unknown;
}

const resourceUri = 'ui://firecrawl/usage.html';

export function registerUsageDashboard(
  server: Pick<FastMCP<SessionData>, 'addTool' | 'addResource'>,
  getClient: (session?: SessionData) => unknown
): void {
  server.addResource({
    uri: resourceUri,
    name: 'Firecrawl usage dashboard',
    description:
      'Alexandria provider browser, account credit balance, and monthly usage in the Firecrawl design system.',
    mimeType: 'text/html;profile=mcp-app',
    load: async () => ({
      text: await readFile(new URL('./usage.html', import.meta.url), 'utf8'),
      _meta: {
        ui: { csp: { connectDomains: [], resourceDomains: [] } },
        'openai/ui': {
          preferredDisplayMode: 'fullscreen',
          availableDisplayModes: ['fullscreen'],
        },
      },
    }),
  });

  server.addTool({
    name: 'firecrawl_usage_dashboard',
    icons: [
      {
        src: `data:image/svg+xml;base64,${Buffer.from(readFileSync(new URL('./firecrawl-sidebar.svg', import.meta.url))).toString('base64')}`,
        mimeType: 'image/svg+xml',
        sizes: ['any'],
      },
    ],
    description:
      'Open the Firecrawl sidebar app to browse Alexandria providers, select tools for a chat, and see credits remaining, plan credits, billing dates, and monthly credit usage. Requires a connected Firecrawl account. Use firecrawl_credit_usage for data-only reporting.',
    annotations: {
      title: 'Firecrawl usage',
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    _meta: {
      ui: { resourceUri, visibility: ['app'] },
      'openai/ui': { entrypoints: [{ type: 'global' }] },
    },
    parameters: z.object({}),
    outputSchema: creditUsageOutputSchema,
    execute: async (_args, { session, client }) => {
      const headers = originHeaders(
        requestOrigin(client as McpClient, session)
      );
      const usage = await readCurrentUsage(
        getClient(session) as Parameters<typeof readCurrentUsage>[0],
        headers
      );
      return structuredText(usage);
    },
  });
}
