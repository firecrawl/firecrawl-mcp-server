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
    .map(url => url.trim())
    .filter(Boolean);
}

function buildMonitorCreateBody(args: Record<string, unknown>): Record<string, unknown> {
  if (args.body && typeof args.body === 'object' && !Array.isArray(args.body)) {
    return args.body as Record<string, unknown>;
  }

  const urls = splitPages(args.page as string | undefined, args.pages as string[] | undefined);
  if (urls.length === 0) {
    throw new Error(
      'firecrawl_monitor_create requires either `body`, `page`, or `pages`.'
    );
  }

  const goal = typeof args.goal === 'string' ? args.goal.trim() : '';
  if (!goal) {
    throw new Error(
      'firecrawl_monitor_create shorthand requires `goal`. Use `body` for advanced requests without a goal.'
    );
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
    targets: [{ type: 'scrape', urls }],
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
Create a Firecrawl monitor — a recurring scrape or crawl that diffs each result against the last retained snapshot.

Prefer the simple path: pass \`page\` or \`pages\` plus \`goal\`. The tool will create a scrape monitor with a 30-minute schedule and meaningful-change judging enabled by the API. Use \`body\` only for advanced requests such as crawl targets, JSON change tracking, custom retention, or manual \`judgeEnabled\` control.

Meaningful-change judge: set \`goal\` to a plain-language description of what the user actually cares about. \`judgeEnabled\` defaults to true when \`goal\` is set, so providing \`goal\` is enough. Page webhooks expose \`isMeaningful\` and \`judgment\` on \`monitor.page\` events.

Simple fields:
- \`page\`: one page URL to monitor.
- \`pages\`: multiple page URLs to monitor.
- \`goal\`: plain-English instruction for what changes matter. Required for the simple path.
- \`scheduleText\`: optional natural-language schedule, default \`every 30 minutes\`.
- \`email\`: optional email recipient for summaries.
- \`webhookUrl\`: optional webhook URL. Configures \`monitor.page\` and \`monitor.check.completed\`.

Goal guidance:
- Expand the user's one-line monitoring intent into a concise 2-3 sentence monitor goal.
- State what should trigger an alert, restate any scope the user gave, and include intent-specific exclusions only when obvious from the user's request.
- Generic noise such as whitespace, formatting-only changes, request IDs, tracking params, generic metadata, and unrelated page chrome is already handled by the judge; do not repeat it in every goal.
- If the user is vague, keep the goal broad rather than guessing exclusions. If the user asks for broad monitoring or "any change", preserve that and do not add exclusions that hide changes.
- If the user says they do not care about something, include that explicitly. It is okay to ask whether they want to ignore specific noise when it is likely to matter.
- Do not invent page-specific sections, thresholds, entities, or business rules unless the user mentioned them.

Full \`body\` requests require: \`name\`, \`schedule\` (with \`cron\` or \`text\`), and \`targets\` (one or more \`{ type: 'scrape', urls: [...] }\` or \`{ type: 'crawl', url: '...' }\`). Optional: \`goal\`, \`judgeEnabled\`, \`webhook\`, \`notification\`, \`retentionDays\`.

**Markdown-mode (default):** Each check produces a unified text diff of the page's markdown. No extra configuration needed.

\`\`\`json
{
  "name": "firecrawl_monitor_create",
  "arguments": {
    "page": "https://example.com/blog",
    "goal": "Alert when a new blog post is published or an existing headline changes.",
    "email": "alerts@example.com"
  }
}
\`\`\`

**Multiple pages:**

\`\`\`json
{
  "name": "firecrawl_monitor_create",
  "arguments": {
    "pages": ["https://example.com/pricing", "https://example.com/changelog"],
    "goal": "Alert when pricing, packaging, or launch messaging changes.",
    "webhookUrl": "https://example.com/webhooks/firecrawl"
  }
}
\`\`\`

**JSON-mode change tracking:** To detect changes in **specific structured fields** (price, headline, in-stock flag, list items) instead of the whole page, add a \`changeTracking\` format with \`modes: ["json"]\` and a JSON schema to the target's \`scrapeOptions.formats\`. The check response will then carry a per-field diff (keyed by JSON path, e.g. \`plans[0].price\`) and a \`snapshot.json\` with the full current extraction. See \`firecrawl_monitor_check\` for the response shape.

\`\`\`json
{
  "name": "firecrawl_monitor_create",
  "arguments": {
    "body": {
      "name": "Pricing watch",
      "schedule": { "text": "hourly", "timezone": "UTC" },
      "goal": "Alert when a pricing tier, price, billing period, limit, or headline feature changes. Ignore unrelated marketing copy unless it changes the pricing offer.",
      "targets": [{
        "type": "scrape",
        "urls": ["https://example.com/pricing"],
        "scrapeOptions": {
          "formats": [{
            "type": "changeTracking",
            "modes": ["json"],
            "prompt": "Extract pricing tiers and headline features for each plan.",
            "schema": {
              "type": "object",
              "properties": {
                "plans": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "name":     { "type": "string" },
                      "price":    { "type": "string" },
                      "features": { "type": "array", "items": { "type": "string" } }
                    }
                  }
                }
              }
            }
          }]
        }
      }]
    }
  }
}
\`\`\`

**Mixed mode (JSON + git-diff):** Use \`modes: ["json", "git-diff"]\` to get both per-field diffs and a markdown sidecar. The page is marked \`changed\` whenever either surface changed.
`,
    parameters: z.object({
      body: z.record(z.string(), z.any()).optional(),
      page: z.string().optional(),
      pages: z.array(z.string()).optional(),
      goal: z.string().optional(),
      name: z.string().optional(),
      scheduleText: z.string().optional(),
      timezone: z.string().optional(),
      email: z.string().optional(),
      includeDiffs: z.boolean().optional(),
      webhookUrl: z.string().optional(),
    }),
    execute: async (
      args: unknown,
      { session, log }: { session?: SessionData; log: Logger }
    ): Promise<string> => {
      const body = buildMonitorCreateBody(args as Record<string, unknown>);
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
      readOnlyHint: true, // Lists monitors for the authenticated account; no mutations.
      openWorldHint: false, // Returns only the user's Firecrawl monitor records, not arbitrary web content.
      destructiveHint: false, // Read-only listing.
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
      readOnlyHint: true, // Fetches a single monitor by ID; no mutations.
      openWorldHint: false, // Reads a specific monitor resource in the user's Firecrawl account.
      destructiveHint: false, // Read-only retrieval.
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
      readOnlyHint: false, // PATCHes an existing monitor (status, schedule, targets, webhooks, etc.).
      openWorldHint: true, // Can change which external URLs are monitored and how recurring scrapes run.
      destructiveHint: true, // Can pause, replace, or remove monitor configuration; changes overwrite prior settings.
    },
    description: `
Update a monitor. Pass any subset of fields to patch: \`name\`, \`status\` ("active" | "paused"), \`schedule\`, \`targets\`, \`goal\`, \`judgeEnabled\`, \`webhook\`, \`notification\`, \`retentionDays\`.

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
      readOnlyHint: false, // Permanently deletes a monitor via DELETE on the API.
      openWorldHint: true, // Deletes a monitor that tracked open-web URLs.
      destructiveHint: true, // Irreversibly removes the monitor and stops its schedule.
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
      readOnlyHint: false, // Triggers an immediate monitor check, queueing a new scrape/diff run.
      openWorldHint: true, // The triggered check scrapes external URLs configured on the monitor.
      destructiveHint: false, // Starts a read-only check job; does not delete the monitor or external sites.
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
      readOnlyHint: true, // Lists historical check runs for a monitor; no mutations.
      openWorldHint: false, // Returns check history for a known monitor ID within the user's account.
      destructiveHint: false, // Read-only listing.
    },
    description: `
List historical checks for a monitor.

**Usage Example:**
\`\`\`json
{ "name": "firecrawl_monitor_checks", "arguments": { "id": "mon_abc123", "limit": 10, "status": "completed" } }
\`\`\`
`,
    parameters: z.object({
      id: z.string(),
      limit: z.number().int().positive().optional(),
      offset: z.number().int().nonnegative().optional(),
      status: checkStatusSchema.optional(),
    }),
    execute: async (
      args: unknown,
      { session }: { session?: SessionData }
    ): Promise<string> => {
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
Get a single check with page-level diff results. Filter \`pageStatus\` to surface only the pages that changed (or were new, removed, etc.).

Each entry in \`data.pages[]\` has \`url\`, \`status\` (\`same\` | \`new\` | \`changed\` | \`removed\` | \`error\`), optional \`judgment\` when goal-based judging ran, and — when changed — a \`diff\` and possibly a \`snapshot\`. The shape of \`diff\` depends on the monitor's \`formats\` configuration:

- **Markdown mode (default).** \`diff.text\` is the unified markdown diff; \`diff.json\` is a parse-diff AST (\`{ files: [...] }\`). No \`snapshot\`.
- **JSON mode** (\`changeTracking\` with \`modes: ["json"]\`). \`diff.json\` is a per-field map keyed by JSON path into the extraction, e.g. \`plans[0].price\`, with each value being \`{ previous, current }\`. \`snapshot.json\` is the full current extraction. No \`diff.text\`.
- **Mixed mode** (\`modes: ["json", "git-diff"]\`). Both \`diff.text\` (markdown sidecar) AND \`diff.json\` (per-field map) are present, plus \`snapshot.json\`.

**Example JSON-mode response \`pages[]\` entry:**

\`\`\`json
{
  "url": "https://example.com/pricing",
  "status": "changed",
  "diff": {
    "json": {
      "plans[0].price":       { "previous": "$19/mo",        "current": "$24/mo" },
      "plans[1].features[2]": { "previous": "10 GB storage", "current": "25 GB storage" }
    }
  },
  "snapshot": { "json": { "plans": [/* current full extraction matching the monitor's schema */] } },
  "judgment": {
    "meaningful": true,
    "confidence": "high",
    "reason": "The pricing changed, which matches the monitor goal.",
    "meaningfulChanges": [
      {
        "type": "changed",
        "before": "$19/mo",
        "after": "$24/mo",
        "reason": "The tracked plan price changed."
      }
    ]
  }
}
\`\`\`

When summarizing a check for the user, prefer \`diff.json\` paths (e.g. "plans[0].price changed from $19/mo to $24/mo") over re-printing the markdown diff — it's more concise and grounded in the schema fields they asked for.

When \`judgment\` is present, use it to decide what to surface. \`judgment.meaningful: false\` means the change was classified as noise for the monitor's goal. When \`judgment.meaningfulChanges\` is present, prefer those goal-relevant changes over raw diff hunks; each item includes \`type\`, \`before\`, \`after\`, and \`reason\`.

The endpoint paginates via a top-level \`next\` URL; this tool returns one page at a time. Increase \`limit\` (max 100) to fetch fewer pages.

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
