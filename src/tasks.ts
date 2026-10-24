import type FirecrawlApp from 'firecrawl';
import { originHeaders, requestOrigin, type McpClient } from './origin.js';
import type { ToolResult } from './server.js';

/**
 * Long-running tools served as MCP tasks (the io.modelcontextprotocol/tasks
 * extension of protocol revision 2026-07-28). A task is a Firecrawl job: the
 * task id carries the job kind, the job id and the creation time, so any
 * instance can answer for it and nothing is stored here. Every lookup goes to
 * the Firecrawl API with the caller's own credential, which scopes the job to
 * its team.
 */

export type TaskStatus = 'working' | 'completed' | 'cancelled' | 'failed';

/** A task as the tasks extension describes it, before `resultType` is added. */
export interface FirecrawlTask {
  taskId: string;
  status: TaskStatus;
  statusMessage?: string;
  createdAt: string;
  lastUpdatedAt: string;
  ttlMs: number | null;
  pollIntervalMs: number;
  /** The tool result, once the task is `completed`. */
  result?: ToolResult;
}

/** The task id is not one of ours, or its job no longer exists for this caller. */
export class TaskNotFoundError extends Error {
  constructor(taskId: string) {
    super(`Failed to retrieve task: Task not found: ${taskId}`);
    this.name = 'TaskNotFoundError';
  }
}

type Kind = 'agent' | 'crawl';

const TASK_TOOLS: Record<string, Kind> = {
  firecrawl_agent: 'agent',
  firecrawl_crawl: 'crawl',
};

const POLL_INTERVAL_MS: Record<Kind, number> = { agent: 5000, crawl: 3000 };
const STATUS_PATH: Record<Kind, string> = { agent: '/v2/agent/', crawl: '/v2/crawl/' };
const TASK_ID = /^fc-(agent|crawl)-([0-9a-z]{1,12})-([A-Za-z0-9-]{1,100})$/;

export function taskKind(toolName: string): Kind | undefined {
  return Object.hasOwn(TASK_TOOLS, toolName) ? TASK_TOOLS[toolName] : undefined;
}

/** The task for a job the API just accepted, or undefined for a job id a task id cannot carry. */
export function startedTask(kind: Kind, jobId: string, createdAtMs: number): FirecrawlTask | undefined {
  const taskId = `fc-${kind}-${createdAtMs.toString(36)}-${jobId}`;
  if (!TASK_ID.test(taskId)) return undefined;
  const at = new Date(createdAtMs).toISOString();
  return {
    taskId,
    status: 'working',
    statusMessage: `Started ${kind} job ${jobId}.`,
    createdAt: at,
    lastUpdatedAt: at,
    ttlMs: null,
    pollIntervalMs: POLL_INTERVAL_MS[kind],
  };
}

function decodeTaskId(taskId: string): { kind: Kind; jobId: string; createdAtMs: number } {
  const match = TASK_ID.exec(typeof taskId === 'string' ? taskId : '');
  if (!match) throw new TaskNotFoundError(String(taskId));
  return { kind: match[1] as Kind, jobId: match[3], createdAtMs: parseInt(match[2], 36) };
}

function httpStatus(error: unknown): number | undefined {
  const e = error as { status?: unknown; response?: { status?: unknown } } | undefined;
  const status = e?.response?.status ?? e?.status;
  return typeof status === 'number' ? status : undefined;
}

function ttlFrom(expiresAt: unknown, createdAtMs: number): number | null {
  const expires = typeof expiresAt === 'string' ? Date.parse(expiresAt) : NaN;
  return Number.isFinite(expires) ? Math.max(0, expires - createdAtMs) : null;
}

export interface TaskJobs {
  getClient(session: unknown): FirecrawlApp;
  /** The tool result for a finished agent run, as firecrawl_agent_status returns it. */
  agentResult(data: unknown): ToolResult;
  /** The tool result for a finished crawl, as firecrawl_crawl returns it. */
  crawlResult(client: FirecrawlApp, jobId: string, origin: string, body: unknown): Promise<ToolResult>;
}

/** Reads a task's job from the Firecrawl API and maps it onto the task lifecycle. */
export async function readTask(
  jobs: TaskJobs,
  taskId: string,
  session: unknown,
  mcpClient: McpClient
): Promise<FirecrawlTask> {
  const { kind, jobId, createdAtMs } = decodeTaskId(taskId);
  const client = jobs.getClient(session);
  const origin = requestOrigin(mcpClient, session as never);
  const base = {
    taskId,
    createdAt: new Date(createdAtMs).toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    pollIntervalMs: POLL_INTERVAL_MS[kind],
  };
  let body: Record<string, unknown>;
  try {
    const res = await (client as any).http.get(
      `${STATUS_PATH[kind]}${encodeURIComponent(jobId)}`,
      originHeaders(origin)
    );
    body = (res?.data ?? {}) as Record<string, unknown>;
  } catch (error) {
    const status = httpStatus(error);
    if (status === 404) throw new TaskNotFoundError(taskId);
    if (status === undefined || status === 429 || status >= 500) {
      // A failed status read says nothing about the job: report it as still
      // running and let the client ask again.
      return {
        ...base,
        status: 'working',
        statusMessage: `Could not read the ${kind} status${status ? ` (HTTP ${status})` : ''}; checking again.`,
        ttlMs: null,
        pollIntervalMs: Math.max(base.pollIntervalMs, 10_000),
      };
    }
    throw error;
  }
  const ttlMs = ttlFrom(body.expiresAt, createdAtMs);
  const status = String(body.status ?? '');
  if (status === 'cancelled') {
    return { ...base, ttlMs, status: 'cancelled', statusMessage: `The ${kind} job was cancelled.` };
  }
  if (status === 'completed' || status === 'failed') {
    const result = kind === 'agent'
      ? jobs.agentResult(body)
      : await jobs.crawlResult(client, jobId, origin, body);
    return {
      ...base,
      ttlMs,
      status: 'completed',
      statusMessage: status === 'failed' ? `The ${kind} job failed.` : `The ${kind} job completed.`,
      result: status === 'failed' ? { ...result, isError: true } : result,
    };
  }
  return { ...base, ttlMs, status: 'working', statusMessage: progressMessage(kind, body) };
}

function progressMessage(kind: Kind, body: Record<string, unknown>): string {
  if (kind === 'crawl' && typeof body.total === 'number' && body.total > 0) {
    return `Crawling: ${body.completed ?? 0} of ${body.total} pages done.`;
  }
  const credits = typeof body.creditsUsed === 'number' ? `, ${body.creditsUsed} credits used so far` : '';
  return kind === 'agent' ? `Research in progress${credits}.` : `Crawl in progress${credits}.`;
}

/** Asks the Firecrawl API to stop a task's job. Cancellation is best effort. */
export async function cancelTask(
  jobs: TaskJobs,
  taskId: string,
  session: unknown,
  mcpClient: McpClient
): Promise<void> {
  const { kind, jobId } = decodeTaskId(taskId);
  const client = jobs.getClient(session);
  try {
    await (client as any).http.delete(
      `${STATUS_PATH[kind]}${encodeURIComponent(jobId)}`,
      originHeaders(requestOrigin(mcpClient, session as never))
    );
  } catch (error) {
    const status = httpStatus(error);
    if (status === 404) throw new TaskNotFoundError(taskId);
    // 409: the job already finished or was already cancelled.
    if (status !== 409) throw error;
  }
}
