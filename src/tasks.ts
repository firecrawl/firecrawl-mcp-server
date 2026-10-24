import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  MissingRequiredClientCapabilityError,
  ProtocolError,
  type ServerContext,
} from '@modelcontextprotocol/server';
import type FirecrawlApp from 'firecrawl';
import { z } from 'zod';
import type { ContentResult, McpExtension } from './mcp/runtime.js';
import { originHeaders, requestOrigin, type OriginSession } from './origin.js';
import { agentStatusOutputSchema, crawlOutputSchema } from './tool-output.js';

/**
 * The MCP Tasks extension (`io.modelcontextprotocol/tasks`, protocol revision
 * 2026-07-28). When a client declares it on a `tools/call`,
 * `firecrawl_agent` and `firecrawl_crawl` answer with a task as soon as the
 * Firecrawl API accepts the job, and the client follows it with `tasks/get`
 * and `tasks/cancel`.
 *
 * A task is a Firecrawl job: the task id carries the job kind, the job id and
 * the creation time, so any server instance can answer for it and nothing is
 * stored. Every lookup goes to the Firecrawl API with the caller's own
 * credential, which scopes the job to its team.
 */
export const TASKS_EXTENSION = 'io.modelcontextprotocol/tasks';

type Kind = 'agent' | 'crawl';

type TaskStatus = 'working' | 'completed' | 'cancelled';

/** A task as `tasks/get` returns it, before the SDK adds `resultType`. */
type FirecrawlTask = {
  taskId: string;
  status: TaskStatus;
  statusMessage: string;
  createdAt: string;
  lastUpdatedAt: string;
  ttlMs: number | null;
  pollIntervalMs: number;
  /** The tool result, once the task is `completed`. */
  result?: ContentResult;
};

const TASK_TOOLS: Record<string, Kind> = {
  firecrawl_agent: 'agent',
  firecrawl_crawl: 'crawl',
};
const POLL_INTERVAL_MS: Record<Kind, number> = { agent: 5000, crawl: 3000 };
const JOB_PATH: Record<Kind, string> = {
  agent: '/v2/agent/',
  crawl: '/v2/crawl/',
};
/**
 * The schema a task's result follows. A crawl task ends with what a blocking
 * `firecrawl_crawl` returns; an agent task ends with the research result
 * `firecrawl_agent_status` returns, which names every key the submission does.
 */
const RESULT_SCHEMA = {
  agent: agentStatusOutputSchema,
  crawl: crawlOutputSchema,
};
const TASK_ID = /^fc-(agent|crawl)-([0-9a-z]{1,12})-([A-Za-z0-9-]{1,100})$/;

/** What the tasks need from the server that registers the tools. */
export interface TaskJobs<Session> {
  getClient(session: Session | undefined): FirecrawlApp;
  /** The tool result for a finished agent run, as `firecrawl_agent_status` returns it. */
  agentResult(data: unknown): ContentResult;
  /** The tool result for a finished crawl, as `firecrawl_crawl` returns it. */
  crawlResult(
    client: FirecrawlApp,
    jobId: string,
    origin: string,
    body: unknown
  ): Promise<ContentResult>;
}

class TaskNotFound extends ProtocolError {
  constructor(taskId: string) {
    super(-32602, `Failed to retrieve task: Task not found: ${taskId}`);
  }
}

function declaresTasks(context: ServerContext): boolean {
  const envelope = context.mcpReq.envelope as
    Record<string, unknown> | undefined;
  const capabilities = envelope?.[CLIENT_CAPABILITIES_META_KEY] as
    { extensions?: Record<string, unknown> } | undefined;
  return Boolean(
    capabilities?.extensions &&
    Object.hasOwn(capabilities.extensions, TASKS_EXTENSION)
  );
}

function clientOf(context: ServerContext) {
  const envelope = context.mcpReq.envelope as
    Record<string, unknown> | undefined;
  return {
    version: envelope?.[CLIENT_INFO_META_KEY] as
      { name: string; version: string } | undefined,
  };
}

function decodeTaskId(taskId: string): {
  kind: Kind;
  jobId: string;
  createdAtMs: number;
} {
  const match = TASK_ID.exec(taskId);
  const createdAtMs = match ? parseInt(match[2], 36) : NaN;
  if (!match || Number.isNaN(new Date(createdAtMs).getTime()))
    throw new TaskNotFound(taskId);
  return { kind: match[1] as Kind, jobId: match[3], createdAtMs };
}

function httpStatus(error: unknown): number | undefined {
  const e = error as
    { status?: unknown; response?: { status?: unknown } } | undefined;
  const status = e?.response?.status ?? e?.status;
  return typeof status === 'number' ? status : undefined;
}

async function conform(
  kind: Kind,
  result: ContentResult
): Promise<ContentResult> {
  if (result.structuredContent === undefined) return result;
  const parsed = await RESULT_SCHEMA[kind]['~standard'].validate(
    result.structuredContent
  );
  return parsed.issues
    ? result
    : { ...result, structuredContent: parsed.value };
}

function progressMessage(kind: Kind, body: Record<string, unknown>): string {
  if (kind === 'crawl' && typeof body.total === 'number' && body.total > 0) {
    return `Crawling: ${body.completed ?? 0} of ${body.total} pages done.`;
  }
  const credits =
    typeof body.creditsUsed === 'number'
      ? `, ${body.creditsUsed} credits used so far`
      : '';
  return kind === 'agent'
    ? `Research in progress${credits}.`
    : `Crawl in progress${credits}.`;
}

async function readTask<Session extends OriginSession>(
  jobs: TaskJobs<Session>,
  taskId: string,
  session: Session | undefined,
  context: ServerContext
): Promise<FirecrawlTask> {
  const { kind, jobId, createdAtMs } = decodeTaskId(taskId);
  const client = jobs.getClient(session);
  const origin = requestOrigin(clientOf(context), session);
  const base = {
    taskId,
    createdAt: new Date(createdAtMs).toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    pollIntervalMs: POLL_INTERVAL_MS[kind],
  };
  let body: Record<string, unknown>;
  try {
    const res = await (client as any).http.get(
      `${JOB_PATH[kind]}${encodeURIComponent(jobId)}`,
      originHeaders(origin)
    );
    body = (res?.data ?? {}) as Record<string, unknown>;
  } catch (error) {
    const status = httpStatus(error);
    if (status === 404) throw new TaskNotFound(taskId);
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
  const expiresAt =
    typeof body.expiresAt === 'string' ? Date.parse(body.expiresAt) : NaN;
  const ttlMs = Number.isFinite(expiresAt)
    ? Math.max(0, expiresAt - createdAtMs)
    : null;
  const status = String(body.status ?? '');
  if (status === 'cancelled') {
    return {
      ...base,
      ttlMs,
      status: 'cancelled',
      statusMessage: `The ${kind} job was cancelled.`,
    };
  }
  if (status !== 'completed' && status !== 'failed') {
    return {
      ...base,
      ttlMs,
      status: 'working',
      statusMessage: progressMessage(kind, body),
    };
  }
  // A failed job is a tool error, not a protocol error: the task completes
  // with an `isError` result.
  const result = await conform(
    kind,
    kind === 'agent'
      ? jobs.agentResult(body)
      : await jobs.crawlResult(client, jobId, origin, body)
  );
  return {
    ...base,
    ttlMs,
    status: 'completed',
    statusMessage: `The ${kind} job ${status}.`,
    result: status === 'failed' ? { ...result, isError: true } : result,
  };
}

async function cancelTask<Session extends OriginSession>(
  jobs: TaskJobs<Session>,
  taskId: string,
  session: Session | undefined,
  context: ServerContext
): Promise<void> {
  const { kind, jobId } = decodeTaskId(taskId);
  try {
    await (jobs.getClient(session) as any).http.delete(
      `${JOB_PATH[kind]}${encodeURIComponent(jobId)}`,
      originHeaders(requestOrigin(clientOf(context), session))
    );
  } catch (error) {
    const status = httpStatus(error);
    if (status === 404) throw new TaskNotFound(taskId);
    // 409: the job already finished or was already cancelled.
    if (status !== 409) throw error;
  }
}

const taskParams = z.looseObject({ taskId: z.string() });
const anyResult = z.record(z.string(), z.unknown());

export function tasksExtension<Session extends OriginSession>(
  jobs: TaskJobs<Session>
): McpExtension<Session> {
  const requireDeclared = (context: ServerContext) => {
    if (!declaresTasks(context)) {
      throw new MissingRequiredClientCapabilityError({
        requiredCapabilities: { extensions: { [TASKS_EXTENSION]: {} } },
      } as never);
    }
  };
  return {
    id: TASKS_EXTENSION,
    outputSchemas: { firecrawl_agent: agentStatusOutputSchema },
    async callTool({ name, run }, context) {
      const kind = Object.hasOwn(TASK_TOOLS, name)
        ? TASK_TOOLS[name]
        : undefined;
      if (!kind || !declaresTasks(context)) return undefined;
      const result = await run({ task: true });
      const jobId = result.structuredContent?.id;
      const createdAtMs = Date.now();
      const taskId = `fc-${kind}-${createdAtMs.toString(36)}-${jobId}`;
      if (result.isError || typeof jobId !== 'string' || !TASK_ID.test(taskId))
        return result;
      const at = new Date(createdAtMs).toISOString();
      return {
        resultType: 'task',
        taskId,
        status: 'working',
        statusMessage: `Started ${kind} job ${jobId}.`,
        createdAt: at,
        lastUpdatedAt: at,
        ttlMs: null,
        pollIntervalMs: POLL_INTERVAL_MS[kind],
      };
    },
    register(server, session) {
      server.setRequestHandler(
        'tasks/get',
        { params: taskParams, result: anyResult },
        async (params, context) => {
          requireDeclared(context);
          return readTask(jobs, params.taskId, session, context);
        }
      );
      // No task ever needs input, so an update only has to name a task.
      server.setRequestHandler(
        'tasks/update',
        { params: taskParams, result: anyResult },
        async (params, context) => {
          requireDeclared(context);
          decodeTaskId(params.taskId);
          return {};
        }
      );
      server.setRequestHandler(
        'tasks/cancel',
        { params: taskParams, result: anyResult },
        async (params, context) => {
          requireDeclared(context);
          await cancelTask(jobs, params.taskId, session, context);
          return {};
        }
      );
    },
  };
}
