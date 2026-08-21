/**
 * Firecrawl Monitor tools.
 *
 * Monitors run recurring scrapes/crawls and diff each result against the last
 * retained snapshot. The SDK exposes monitor methods, but its HttpClient
 * injects a top-level `origin` field into every POST/PATCH body and
 * /v2/monitor rejects that with "Unrecognized key in body". Until the SDK
 * strips `origin` for monitor requests, we hit /v2/monitor directly via fetch
 * — same pattern the CLI uses.
 */

import { z } from 'zod';
import type { FastMCP } from 'fastmcp';
import {
  credentialForOutboundRequest,
  type CredentialSession,
} from './session-credential';

interface SessionData extends CredentialSession {
  [key: string]: unknown;
}

const DEFAULT_API_URL = 'https://api.firecrawl.dev';

interface MonitorRequestInit {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
}

function resolveAuth(session?: SessionData): {
  apiKey?: string;
  baseUrl: string;
} {
  // A request-scoped session is authoritative. In particular, managed OAuth
  // credentials must become short-lived delegated assertions and must never
  // fall through to a process-wide API key.
  const apiKey =
    session === undefined
      ? process.env.FIRECRAWL_API_KEY
      : credentialForOutboundRequest(session);
  const baseUrl = (process.env.FIRECRAWL_API_URL ?? DEFAULT_API_URL).replace(
    /\/$/,
    ''
  );
  return { apiKey, baseUrl };
}

async function monitorRequest(
  session: SessionData | undefined,
  path: string,
  init: MonitorRequestInit = {}
): Promise<unknown> {
  const { apiKey, baseUrl } = resolveAuth(session);
  if (!apiKey && !process.env.FIRECRAWL_API_URL) {
    throw new Error('Unauthorized: API key is required for monitor requests');
  }

  let url = `${baseUrl}/v2${path}`;
  if (init.query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(init.query)) {
      if (v !== undefined && v !== '') qs.set(k, String(v));
    }
    const s = qs.toString();
    if (s) url += `?${s}`;
  }

  const headers: Record<string, string> = { 'X-Origin': 'mcp-fastmcp' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(url, {
    method: init.method ?? 'GET',
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  const payload = (await response.json().catch(() => ({}))) as any;

  if (!response.ok || payload?.success === false) {
    const message =
      payload?.error ||
      `HTTP ${response.status}: ${response.statusText || 'Request failed'}`;
    throw new Error(message);
  }

  return payload;
}

function asText(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

const pageStatusSchema = z.enum(['same', 'new', 'changed', 'removed', 'error']);
const checkStatusSchema = z.enum([
  'queued',
  'running',
  'completed',
  'failed',
  'partial',
  'skipped_overlap',
]);

function splitPages(page?: string, pages?: string[]): string[] {
  return [page, ...(pages ?? [])]
    .filter((url): url is string => typeof url === 'string')
    .map((url) => url.trim())
    .filter(Boolean);
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : undefined;
}

function buildMonitorCreateBody(
  args: Record<string, unknown>
): Record<string, unknown> {
  if (args.body && typeof args.body === 'object' && !Array.isArray(args.body)) {
    return args.body as Record<string, unknown>;
  }

  const urls = splitPages(
    args.page as string | undefined,
    args.pages as string[] | undefined
  );
  const queries = Array.isArray(args.queries)
    ? (args.queries as unknown[])
        .filter((q): q is string => typeof q === 'string')
        .map((q) => q.trim())
        .filter(Boolean)
    : [];
  const isSearch = queries.length > 0;

  if (urls.length === 0 && !isSearch) {
    throw new Error(
      'firecrawl_monitor_create requires either `body`, `page`/`pages`, or `queries`.'
    );
  }

  const goal = typeof args.goal === 'string' ? args.goal.trim() : '';
  if (!goal) {
    throw new Error(
      'firecrawl_monitor_create shorthand requires `goal`. Use `body` for advanced requests without a goal.'
    );
  }

  // Build the target: search when `queries` are given, otherwise a scrape.
  let target: Record<string, unknown>;
  if (isSearch) {
    const includeDomains = stringArray(args.includeDomains);
    const excludeDomains = stringArray(args.excludeDomains);
    target = {
      type: 'search',
      queries,
      ...(typeof args.searchWindow === 'string' && args.searchWindow.trim()
        ? { searchWindow: args.searchWindow.trim() }
        : {}),
      ...(typeof args.maxResults === 'number'
        ? { maxResults: args.maxResults }
        : {}),
      ...(includeDomains && includeDomains.length > 0 ? { includeDomains } : {}),
      ...(excludeDomains && excludeDomains.length > 0 ? { excludeDomains } : {}),
    };
  } else {
    target = { type: 'scrape', urls };
  }

  const webhookUrl =
    typeof args.webhookUrl === 'string' ? args.webhookUrl.trim() : '';
  const email =
    typeof args.email === 'string' && args.email.trim()
      ? {
          email: {
            enabled: true,
            recipients: [args.email.trim()],
            includeDiffs: Boolean(args.includeDiffs),
          },
        }
      : undefined;

  return {
    name:
      typeof args.name === 'string' && args.name.trim()
        ? args.name.trim()
        : isSearch
          ? `Monitor ${queries[0]}`
          : `Monitor ${urls[0]}`,
    schedule: {
      text:
        typeof args.scheduleText === 'string' && args.scheduleText.trim()
          ? args.scheduleText.trim()
          : 'every 30 minutes',
      timezone:
        typeof args.timezone === 'string' && args.timezone.trim()
          ? args.timezone.trim()
          : 'UTC',
    },
    goal,
    targets: [target],
    ...(email ? { notification: email } : {}),
    ...(webhookUrl
      ? {
          webhook: {
            url: webhookUrl,
            events: ['monitor.page', 'monitor.check.completed'],
          },
        }
      : {}),
  };
}

export function registerMonitorTools(server: FastMCP<SessionData>): void {
  server.addTool({
    name: 'firecrawl_monitor_create',
    annotations: {
      title: 'Create monitor',
      readOnlyHint: false, // Creates a new recurring monitor configuration on the Firecrawl API.
      openWorldHint: true, // Monitors user-specified URLs on the public web on a recurring schedule.
      destructiveHint: false, // Additive; creates a new monitor without deleting existing monitors or external content.
    },
    description: `
Create a recurring page, site, or search monitor that compares checks over time. In the simple form a \`goal\` is required; when \`queries\` and pages are both supplied, queries create the search target and page targets are ignored. Monitors schedule future network checks and may send configured notifications.
`,
    parameters: z.object({
      body: z
        .record(z.string(), z.any())
        .optional()
        .describe(
          'Advanced monitor request body. When provided, it replaces the simple-form fields.'
        ),
      page: z.string().optional().describe('Single page URL to monitor.'),
      pages: z.array(z.string()).optional().describe('Page URLs to monitor.'),
      queries: z
        .array(z.string())
        .optional()
        .describe('Search queries to monitor; these take precedence over pages.'),
      searchWindow: z
        .enum(['5m', '15m', '1h', '6h', '24h', '7d'])
        .optional()
        .describe('Lookback window for monitored search results.'),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe('Maximum search results per check; maximum 50.'),
      includeDomains: z
        .array(z.string())
        .optional()
        .describe('Only include search results from these domains.'),
      excludeDomains: z
        .array(z.string())
        .optional()
        .describe('Exclude search results from these domains.'),
      goal: z.string().optional().describe('Change-detection goal; required in simple form.'),
      name: z.string().optional().describe('Monitor display name.'),
      scheduleText: z
        .string()
        .optional()
        .describe('Plain-language schedule; defaults to every 30 minutes.'),
      timezone: z.string().optional().describe('IANA timezone; defaults to UTC.'),
      email: z.string().optional().describe('Notification email address.'),
      includeDiffs: z
        .boolean()
        .optional()
        .describe('Include content diffs in check results.'),
      webhookUrl: z.string().optional().describe('Webhook URL for monitor events.'),
    }),
    execute: async (args: unknown, { session, log }): Promise<string> => {
      const body = buildMonitorCreateBody(args as Record<string, unknown>);
      log.info('Creating monitor', { name: String(body.name) });
      const res = await monitorRequest(session, '/monitor', {
        method: 'POST',
        body,
      });
      return asText(res);
    },
  });

  server.addTool({
    name: 'firecrawl_monitor_list',
    annotations: {
      title: 'List monitors',
      readOnlyHint: true, // Lists monitors for the authenticated account; no mutations.
      openWorldHint: false, // Returns only the user's Firecrawl monitor records, not arbitrary web content.
      destructiveHint: false, // Read-only listing.
    },
    description: `
List monitors for the authenticated account. This reads configurations without running or modifying them.
`,
    parameters: z.object({
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum monitors returned.'),
      offset: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe('Zero-based pagination offset.'),
    }),
    execute: async (args: unknown, { session }): Promise<string> => {
      const { limit, offset } = args as { limit?: number; offset?: number };
      const res = await monitorRequest(session, '/monitor', {
        query: { limit, offset },
      });
      return asText(res);
    },
  });

  server.addTool({
    name: 'firecrawl_monitor_get',
    annotations: {
      title: 'Get monitor',
      readOnlyHint: true, // Fetches a single monitor by ID; no mutations.
      openWorldHint: false, // Reads a specific monitor resource in the user's Firecrawl account.
      destructiveHint: false, // Read-only retrieval.
    },
    description: `
Retrieve one monitor's configuration and state by ID without running or modifying it.
`,
    parameters: z.object({ id: z.string().describe('Monitor ID.') }),
    execute: async (args: unknown, { session }): Promise<string> => {
      const { id } = args as { id: string };
      const res = await monitorRequest(
        session,
        `/monitor/${encodeURIComponent(id)}`
      );
      return asText(res);
    },
  });

  server.addTool({
    name: 'firecrawl_monitor_update',
    annotations: {
      title: 'Update monitor',
      readOnlyHint: false, // PATCHes an existing monitor (status, schedule, targets, webhooks, etc.).
      openWorldHint: true, // Can change which external URLs are monitored and how recurring scrapes run.
      destructiveHint: true, // Can pause, replace, or remove monitor configuration; changes overwrite prior settings.
    },
    description: `
Patch an existing monitor's configuration by ID. Changes affect future scheduled checks but do not run a check immediately.
`,
    parameters: z.object({
      id: z.string().describe('Monitor ID.'),
      body: z
        .record(z.string(), z.any())
        .describe('Partial monitor fields to update.'),
    }),
    execute: async (args: unknown, { session }): Promise<string> => {
      const { id, body } = args as {
        id: string;
        body: Record<string, unknown>;
      };
      const res = await monitorRequest(
        session,
        `/monitor/${encodeURIComponent(id)}`,
        { method: 'PATCH', body }
      );
      return asText(res);
    },
  });

  server.addTool({
    name: 'firecrawl_monitor_delete',
    annotations: {
      title: 'Delete monitor',
      readOnlyHint: false, // Permanently deletes a monitor via DELETE on the API.
      openWorldHint: true, // Deletes a monitor that tracked open-web URLs.
      destructiveHint: true, // Irreversibly removes the monitor and stops its schedule.
    },
    description: `
Permanently delete a monitor and stop its future schedule. This operation cannot be undone.
`,
    parameters: z.object({ id: z.string().describe('Monitor ID.') }),
    execute: async (args: unknown, { session, log }): Promise<string> => {
      const { id } = args as { id: string };
      log.info('Deleting monitor', { id });
      const res = await monitorRequest(
        session,
        `/monitor/${encodeURIComponent(id)}`,
        { method: 'DELETE' }
      );
      return asText(res);
    },
  });

  server.addTool({
    name: 'firecrawl_monitor_run',
    annotations: {
      title: 'Run monitor now',
      readOnlyHint: false, // Triggers an immediate monitor check, queueing a new scrape/diff run.
      openWorldHint: true, // The triggered check scrapes external URLs configured on the monitor.
      destructiveHint: false, // Starts a read-only check job; does not delete the monitor or external sites.
    },
    description: `
Queue an immediate check for a monitor outside its schedule. This starts network work without changing the schedule.
`,
    parameters: z.object({ id: z.string().describe('Monitor ID.') }),
    execute: async (args: unknown, { session }): Promise<string> => {
      const { id } = args as { id: string };
      const res = await monitorRequest(
        session,
        `/monitor/${encodeURIComponent(id)}/run`,
        { method: 'POST' }
      );
      return asText(res);
    },
  });

  server.addTool({
    name: 'firecrawl_monitor_checks',
    annotations: {
      title: 'List monitor checks',
      readOnlyHint: true, // Lists historical check runs for a monitor; no mutations.
      openWorldHint: false, // Returns check history for a known monitor ID within the user's account.
      destructiveHint: false, // Read-only listing.
    },
    description: `
List historical checks for a monitor. This reads check summaries without running a new check.
`,
    parameters: z.object({
      id: z.string().describe('Monitor ID.'),
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum checks returned.'),
      offset: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe('Zero-based pagination offset.'),
      status: checkStatusSchema.optional().describe('Filter checks by status.'),
    }),
    execute: async (args: unknown, { session }): Promise<string> => {
      const { id, limit, offset, status } = args as {
        id: string;
        limit?: number;
        offset?: number;
        status?: z.infer<typeof checkStatusSchema>;
      };
      const res = await monitorRequest(
        session,
        `/monitor/${encodeURIComponent(id)}/checks`,
        { query: { limit, offset, status } }
      );
      return asText(res);
    },
  });

  server.addTool({
    name: 'firecrawl_monitor_check',
    annotations: {
      title: 'Get monitor check',
      readOnlyHint: true, // Retrieves a single check run with page-level diff results; no mutations.
      openWorldHint: false, // Reads stored check results for a known monitor/check ID in the user's account.
      destructiveHint: false, // Read-only retrieval of diff snapshots and judgments.
    },
    description: `
Retrieve one monitor check and its page-level change results. Use this for stored diffs and judgments; it does not run or modify the monitor.
`,
    parameters: z.object({
      id: z.string().describe('Monitor ID.'),
      checkId: z.string().describe('Monitor check ID.'),
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum page results returned.'),
      skip: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe('Number of page results to skip.'),
      pageStatus: pageStatusSchema.optional().describe('Filter pages by status.'),
    }),
    execute: async (args: unknown, { session }): Promise<string> => {
      const { id, checkId, limit, skip, pageStatus } = args as {
        id: string;
        checkId: string;
        limit?: number;
        skip?: number;
        pageStatus?: z.infer<typeof pageStatusSchema>;
      };
      const res = await monitorRequest(
        session,
        `/monitor/${encodeURIComponent(id)}/checks/${encodeURIComponent(checkId)}`,
        { query: { limit, skip, status: pageStatus } }
      );
      return asText(res);
    },
  });
}
