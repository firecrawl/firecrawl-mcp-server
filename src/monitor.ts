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
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
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
    const includeDomains = Array.isArray(args.includeDomains)
      ? (args.includeDomains as unknown[]).filter(
          (d): d is string => typeof d === 'string'
        )
      : undefined;
    const excludeDomains = Array.isArray(args.excludeDomains)
      ? (args.excludeDomains as unknown[]).filter(
          (d): d is string => typeof d === 'string'
        )
      : undefined;
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
Create a recurring monitor that retrieves pages, crawls a site, or runs searches and compares each result with the previous retained snapshot. Use this tool only when the user asks to create recurring monitoring.
Simple path: \`page\`/\`pages\` or \`queries\` plus \`goal\`, which schedules every 30 minutes unless \`scheduleText\` is supplied; \`email\` sends summaries and \`webhookUrl\` sends monitor events.
Use \`body\` for custom schedules, crawl targets, change tracking, and retention. Returns the JSON monitor record from the API.
`,
    parameters: z.object({
      body: z
        .record(z.string(), z.any())
        .optional()
        .describe('Advanced monitor request body. Do not combine with simple fields.'),
      page: z.url().optional().describe('Single page URL to monitor.'),
      pages: z.array(z.url()).optional().describe('Page URLs to monitor.'),
      queries: z
        .array(z.string())
        .min(1)
        .max(12)
        .optional()
        .describe('Search queries to run on each check. Mutually exclusive with page and pages.'),
      searchWindow: z
        .enum(['5m', '15m', '1h', '6h', '24h', '7d'])
        .optional()
        .describe('Recency window for search-monitor results. Defaults to 24h.'),
      maxResults: z.number().int().min(1).max(50).optional(),
      includeDomains: z.array(z.string()).optional().describe('Domains included in search checks.'),
      excludeDomains: z.array(z.string()).optional().describe('Domains excluded from search checks.'),
      goal: z
        .string()
        .optional()
        .describe('User-defined description of which changes should be treated as meaningful.'),
      name: z.string().optional().describe('Display name for the monitor.'),
      scheduleText: z
        .string()
        .optional()
        .describe('Natural-language schedule. Defaults to every 30 minutes.'),
      timezone: z.string().optional().describe('Timezone used to interpret the schedule.'),
      email: z
        .email()
        .optional()
        .describe('Email address that receives monitor summaries.'),
      includeDiffs: z
        .boolean()
        .optional()
        .describe('Include content diffs in configured notifications.'),
      webhookUrl: z
        .url()
        .optional()
        .describe('External URL that receives monitor events.'),
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
List all Firecrawl monitors for the authenticated account. Optional \`limit\` and \`offset\`. Returns a JSON list of monitors.
`,
    parameters: z.object({
      limit: z.number().int().positive().optional().describe('Maximum monitors to return.'),
      offset: z.number().int().nonnegative().optional().describe('Number of monitors to skip.'),
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
Retrieve the saved configuration and current status of one monitor by its \`id\`. Returns the JSON monitor record from the API.
`,
    parameters: z.object({ id: z.string().describe('Monitor ID to retrieve.') }),
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
Update a monitor. Pass \`id\` and nest any subset of patch fields inside \`body\`: \`name\`, \`status\` ("active" | "paused"), \`schedule\`, \`targets\`, \`goal\`, \`judgeEnabled\`, \`webhook\`, \`notification\`, \`retentionDays\`.
Returns the JSON monitor record from the API.
`,
    parameters: z.object({
      id: z.string().describe('Monitor ID to update.'),
      body: z
        .record(z.string(), z.any())
        .describe('Fields to replace or update on the saved monitor.'),
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
Permanently delete a monitor and stop its schedule. This cannot be undone.
`,
    parameters: z.object({ id: z.string().describe('Monitor ID to permanently delete.') }),
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
Trigger a monitor check immediately, outside its normal schedule. Returns the JSON check record from the API.
`,
    parameters: z.object({ id: z.string().describe('Monitor ID to run now.') }),
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
List historical check runs for a monitor, with optional \`limit\`/\`offset\` and \`status\` filtering. Returns a JSON list of checks.
`,
    parameters: z.object({
      id: z.string().describe('Monitor ID whose check history will be listed.'),
      limit: z.number().int().positive().optional().describe('Maximum checks to return.'),
      offset: z.number().int().nonnegative().optional().describe('Number of checks to skip.'),
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
Get a single check with page-level diff results. Filter \`pageStatus\` (\`same\` | \`new\` | \`changed\` | \`removed\` | \`error\`).
Changed pages may include a markdown diff, structured JSON field changes, a current snapshot, and an optional goal-based judgment, depending on monitor configuration.
Returns JSON check detail; may include a top-level \`next\` URL for page pagination.
`,
    parameters: z.object({
      id: z.string().describe('Monitor ID that owns the check.'),
      checkId: z.string().describe('Check ID to retrieve.'),
      limit: z.number().int().positive().optional().describe('Maximum page results to return.'),
      skip: z.number().int().nonnegative().optional().describe('Number of page results to skip.'),
      pageStatus: pageStatusSchema.optional().describe('Filter pages by change status.'),
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
