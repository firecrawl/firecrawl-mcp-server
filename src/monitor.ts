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

import type { FastMCP, Logger } from 'firecrawl-fastmcp';
import { z } from 'zod';

interface SessionData {
  firecrawlApiKey?: string;
  [key: string]: unknown;
}

const DEFAULT_API_URL = 'https://api.firecrawl.dev';

interface MonitorRequestInit {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
}

function resolveAuth(session?: SessionData): { apiKey?: string; baseUrl: string } {
  const apiKey = session?.firecrawlApiKey ?? process.env.FIRECRAWL_API_KEY;
  const baseUrl = (process.env.FIRECRAWL_API_URL ?? DEFAULT_API_URL).replace(/\/$/, '');
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

  const headers: Record<string, string> = { 'X-Origin': 'mcp' };
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

export function registerMonitorTools(server: FastMCP<SessionData>): void {
  server.addTool({
    name: 'firecrawl_monitor_create',
    annotations: {
      title: 'Create monitor',
      readOnlyHint: false,
      openWorldHint: true,
    },
    description: `
Create a Firecrawl monitor — a recurring scrape or crawl that diffs each result against the last retained snapshot.

Pass the full request body. Required fields: \`name\`, \`schedule\` (with \`cron\` or \`text\`), and \`targets\` (one or more \`{ type: 'scrape', urls: [...] }\` or \`{ type: 'crawl', url: '...' }\`). Optional: \`webhook\`, \`notification\`, \`retentionDays\`.

**Usage Example:**
\`\`\`json
{
  "name": "firecrawl_monitor_create",
  "arguments": {
    "body": {
      "name": "Blog watch",
      "schedule": { "text": "every 30 minutes", "timezone": "UTC" },
      "targets": [{ "type": "scrape", "urls": ["https://example.com/blog"] }],
      "notification": { "email": { "enabled": true, "recipients": ["a@b.com"] } }
    }
  }
}
\`\`\`
`,
    parameters: z.object({
      body: z.record(z.string(), z.any()),
    }),
    execute: async (
      args: unknown,
      { session, log }: { session?: SessionData; log: Logger }
    ): Promise<string> => {
      const { body } = args as { body: Record<string, unknown> };
      log.info('Creating monitor', { name: body.name });
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
      readOnlyHint: true,
      openWorldHint: false,
    },
    description: `
List all Firecrawl monitors for the authenticated account.

**Usage Example:**
\`\`\`json
{ "name": "firecrawl_monitor_list", "arguments": { "limit": 20 } }
\`\`\`
`,
    parameters: z.object({
      limit: z.number().int().positive().optional(),
      offset: z.number().int().nonnegative().optional(),
    }),
    execute: async (
      args: unknown,
      { session }: { session?: SessionData }
    ): Promise<string> => {
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
      readOnlyHint: true,
      openWorldHint: false,
    },
    description: `
Get a single monitor by ID.

**Usage Example:**
\`\`\`json
{ "name": "firecrawl_monitor_get", "arguments": { "id": "mon_abc123" } }
\`\`\`
`,
    parameters: z.object({ id: z.string() }),
    execute: async (
      args: unknown,
      { session }: { session?: SessionData }
    ): Promise<string> => {
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
      readOnlyHint: false,
      openWorldHint: true,
    },
    description: `
Update a monitor. Pass any subset of fields to patch: \`name\`, \`status\` ("active" | "paused"), \`schedule\`, \`targets\`, \`webhook\`, \`notification\`, \`retentionDays\`.

**Usage Example:**
\`\`\`json
{
  "name": "firecrawl_monitor_update",
  "arguments": {
    "id": "mon_abc123",
    "body": { "status": "paused" }
  }
}
\`\`\`
`,
    parameters: z.object({
      id: z.string(),
      body: z.record(z.string(), z.any()),
    }),
    execute: async (
      args: unknown,
      { session }: { session?: SessionData }
    ): Promise<string> => {
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
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    },
    description: `
Permanently delete a monitor and stop its schedule. This cannot be undone.

**Usage Example:**
\`\`\`json
{ "name": "firecrawl_monitor_delete", "arguments": { "id": "mon_abc123" } }
\`\`\`
`,
    parameters: z.object({ id: z.string() }),
    execute: async (
      args: unknown,
      { session, log }: { session?: SessionData; log: Logger }
    ): Promise<string> => {
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
      readOnlyHint: false,
      openWorldHint: true,
    },
    description: `
Trigger a monitor check immediately, outside its normal schedule. Returns the queued check.

**Usage Example:**
\`\`\`json
{ "name": "firecrawl_monitor_run", "arguments": { "id": "mon_abc123" } }
\`\`\`
`,
    parameters: z.object({ id: z.string() }),
    execute: async (
      args: unknown,
      { session }: { session?: SessionData }
    ): Promise<string> => {
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
      readOnlyHint: true,
      openWorldHint: false,
    },
    description: `
List historical checks for a monitor.

**Usage Example:**
\`\`\`json
{ "name": "firecrawl_monitor_checks", "arguments": { "id": "mon_abc123", "limit": 10 } }
\`\`\`
`,
    parameters: z.object({
      id: z.string(),
      limit: z.number().int().positive().optional(),
      offset: z.number().int().nonnegative().optional(),
    }),
    execute: async (
      args: unknown,
      { session }: { session?: SessionData }
    ): Promise<string> => {
      const { id, limit, offset } = args as {
        id: string;
        limit?: number;
        offset?: number;
      };
      const res = await monitorRequest(
        session,
        `/monitor/${encodeURIComponent(id)}/checks`,
        { query: { limit, offset } }
      );
      return asText(res);
    },
  });

  server.addTool({
    name: 'firecrawl_monitor_check',
    annotations: {
      title: 'Get monitor check',
      readOnlyHint: true,
      openWorldHint: false,
    },
    description: `
Get a single check with page-level diff results. Filter \`pageStatus\` to surface only the pages that changed (or were new, removed, etc.).

**Usage Example:**
\`\`\`json
{
  "name": "firecrawl_monitor_check",
  "arguments": {
    "id": "mon_abc123",
    "checkId": "chk_xyz",
    "pageStatus": "changed"
  }
}
\`\`\`
`,
    parameters: z.object({
      id: z.string(),
      checkId: z.string(),
      limit: z.number().int().positive().optional(),
      skip: z.number().int().nonnegative().optional(),
      pageStatus: pageStatusSchema.optional(),
    }),
    execute: async (
      args: unknown,
      { session }: { session?: SessionData }
    ): Promise<string> => {
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
