import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  MissingRequiredClientCapabilityError,
  ProtocolError,
  type ServerContext,
  type StandardSchemaV1,
} from '@modelcontextprotocol/server';
import type FirecrawlApp from 'firecrawl';
import { z } from 'zod';
import {
  formatIssues,
  isDeferred,
  TASKS_EXTENSION,
  type ContentResult,
  type McpExtension,
} from './mcp/runtime.js';
import {
  originHeaders,
  requestOrigin,
  type McpClient,
  type OriginSession,
} from './origin.js';

/**
 * The MCP Tasks extension (`io.modelcontextprotocol/tasks`, protocol revision
 * 2026-07-28). When a client declares it on a `tools/call`,
 * `firecrawl_agent` and `firecrawl_crawl` answer with a task as soon as the
 * Firecrawl API accepts the job, and the client follows it with `tasks/get`
 * and `tasks/cancel`. Tools an embedder adds can answer with their own tasks
 * and serve them through a {@link TaskHandler}.
 *
 * A built-in task is a Firecrawl job: the task id carries the job kind, the
 * job id and the creation time, so any server instance can answer for it and
 * nothing is stored. Every lookup goes to the Firecrawl API with the caller's
 * own credential, which scopes the job to its team.
 */
export { TASKS_EXTENSION };

type Kind = 'agent' | 'crawl';

/** A task's state as `tasks/get` reports it. */
export type TaskState = {
  status: 'working' | 'input_required' | 'completed' | 'failed' | 'cancelled';
  statusMessage?: string;
  /** ISO 8601. */
  createdAt: string;
  /** ISO 8601; defaults to now. */
  lastUpdatedAt?: string;
  /** Time to live from creation, or null for unlimited. */
  ttlMs: number | null;
  pollIntervalMs?: number;
  /** Outstanding input requests, when `input_required`. Keys are unique over the task's lifetime. */
  inputRequests?: Record<string, unknown>;
  /** The tool result, when `completed` (a tool error included). */
  result?: ContentResult;
  /** The JSON-RPC error, when `failed`. */
  error?: { code: number; message: string; data?: unknown };
};

/** The caller of a task method. */
export type TaskCaller<Session> = {
  session: Session | undefined;
  client: McpClient;
};

/**
 * Serves the tasks a tool returned with `resultType: "task"`. Each method
 * runs with the caller's session, so a handler must check the task belongs to
 * it. A task id a handler does not know is answered as invalid params.
 */
export interface TaskHandler<Session> {
  /** Whether the task id is one of this handler's, for example by prefix. */
  owns(taskId: string): boolean;
  /** The task's state, or undefined for an unknown or expired task. */
  get(taskId: string, caller: TaskCaller<Session>): Promise<TaskState | undefined>;
  /** Receives responses to the task's input requests; false for an unknown task. */
  update?(
    taskId: string,
    inputResponses: Record<string, unknown>,
    caller: TaskCaller<Session>
  ): Promise<boolean>;
  /** Asks the task to stop; false for an unknown task. */
  cancel?(taskId: string, caller: TaskCaller<Session>): Promise<boolean>;
}

/** A task as `tasks/get` returns it, before the SDK adds `resultType`. */
type FirecrawlTask = TaskState & {
  taskId: string;
  lastUpdatedAt: string;
};

const TASK_TOOLS: Record<string, Kind> = {
  firecrawl_agent: 'agent',
  firecrawl_crawl: 'crawl',
};
const TOOL_OF: Record<Kind, string> = {
  agent: 'firecrawl_agent',
  crawl: 'firecrawl_crawl',
};
const POLL_INTERVAL_MS: Record<Kind, number> = { agent: 5000, crawl: 3000 };
const JOB_PATH: Record<Kind, string> = {
  agent: '/v2/agent/',
  crawl: '/v2/crawl/',
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
  /**
   * The schema a completed task's result follows: what a blocking
   * `firecrawl_crawl` returns for a crawl, and the research result
   * `firecrawl_agent_status` returns for an agent run, which names every key
   * the submission does.
   */
  resultSchema(kind: Kind): StandardSchemaV1;
  /**
   * Runs a task method the way a tool call runs, on a per-call copy of the
   * session, and reports it to the embedder as `tool` (`<method>:<tool>`).
   */
  report<T>(
    tool: string,
    session: Session | undefined,
    run: (session: Session | undefined) => Promise<T>
  ): Promise<T>;
  /** The result a completed task returns, as the embedder decorates it. */
  completed(
    call: {
      tool: string;
      jobId: string;
      session: Session | undefined;
      client: McpClient;
    },
    result: ContentResult
  ): Promise<ContentResult>;
}

class TaskNotFound extends ProtocolError {
  constructor(taskId: string) {
    super(-32602, `Failed to retrieve task: Task not found: ${taskId}`);
  }
}

export function declaresTasks(context: ServerContext): boolean {
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
    perRequest: Boolean(envelope?.[CLIENT_INFO_META_KEY]),
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
  tool: string,
  schema: StandardSchemaV1,
  result: ContentResult
): Promise<ContentResult> {
  if (result.structuredContent === undefined) return result;
  const parsed = await schema['~standard'].validate(result.structuredContent);
  if (!parsed.issues) {
    return { ...result, structuredContent: parsed.value as Record<string, unknown> };
  }
  return {
    content: [
      {
        type: 'text',
        text: `Tool '${tool}' structured output validation failed: ${formatIssues(parsed.issues)}. Please check the result matches the tool's outputSchema.`,
      },
    ],
    isError: true,
  };
}

/** A status or result read that failed for a reason that says nothing about the job, or undefined. */
function unreadable(
  error: unknown,
  kind: Kind,
  base: { pollIntervalMs: number }
): { status: 'working'; statusMessage: string; ttlMs: null; pollIntervalMs: number } | undefined {
  const status = httpStatus(error);
  if (status !== undefined && status !== 429 && status < 500) return undefined;
  return {
    status: 'working',
    statusMessage: `Could not read the ${kind} status${status ? ` (HTTP ${status})` : ''}; checking again.`,
    ttlMs: null,
    pollIntervalMs: Math.max(base.pollIntervalMs, 10_000),
  };
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

const failedJobs = new WeakSet<object>();

/** Whether `tasks/get` returned this task for a Firecrawl job that failed. */
export function jobFailed(task: unknown): boolean {
  return typeof task === 'object' && task !== null && failedJobs.has(task);
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
    if (httpStatus(error) === 404) throw new TaskNotFound(taskId);
    // A failed status read says nothing about the job: report it as still
    // running and let the client ask again.
    const working = unreadable(error, kind, base);
    if (working) return { ...base, ...working };
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
  let raw: ContentResult;
  try {
    raw =
      kind === 'agent'
        ? jobs.agentResult(body)
        : await jobs.crawlResult(client, jobId, origin, body);
  } catch (error) {
    const working = unreadable(error, kind, base);
    if (working) return { ...base, ...working };
    throw error;
  }
  const result = await conform(TOOL_OF[kind], jobs.resultSchema(kind), raw);
  const task: FirecrawlTask = {
    ...base,
    ttlMs,
    status: 'completed',
    statusMessage: `The ${kind} job ${status}.`,
    result: await jobs.completed(
      { tool: TOOL_OF[kind], jobId, session, client: clientOf(context) },
      status === 'failed' ? { ...result, isError: true } : result
    ),
  };
  if (status === 'failed') failedJobs.add(task);
  return task;
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
const updateParams = z.looseObject({
  taskId: z.string(),
  inputResponses: z.record(z.string(), z.unknown()).default({}),
});
const anyResult = z.record(z.string(), z.unknown());

export function tasksExtension<Session extends OriginSession>(
  jobs: TaskJobs<Session>,
  handlers: readonly TaskHandler<Session>[]
): McpExtension<Session> {
  const handlerFor = (taskId: string) => handlers.find((handler) => handler.owns(taskId));
  const caller = (session: Session | undefined, context: ServerContext) => ({
    session,
    client: clientOf(context),
  });
  const requireDeclared = (context: ServerContext) => {
    if (!declaresTasks(context)) {
      throw new MissingRequiredClientCapabilityError({
        requiredCapabilities: { extensions: { [TASKS_EXTENSION]: {} } },
      } as never);
    }
  };
  return {
    id: TASKS_EXTENSION,
    outputSchemas: () => ({ firecrawl_agent: jobs.resultSchema('agent') }),
    async callTool({ name, run }, context) {
      const kind = Object.hasOwn(TASK_TOOLS, name)
        ? TASK_TOOLS[name]
        : undefined;
      if (!kind || !declaresTasks(context)) return undefined;
      const result = await run({ task: true });
      if (isDeferred(result)) return result;
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
          const handler = handlerFor(params.taskId);
          if (handler) {
            const state = await handler.get(params.taskId, caller(session, context));
            if (!state) throw new TaskNotFound(params.taskId);
            return {
              ...state,
              taskId: params.taskId,
              lastUpdatedAt: state.lastUpdatedAt ?? new Date().toISOString(),
            };
          }
          const { kind } = decodeTaskId(params.taskId);
          return jobs.report(
            `tasks/get:${TOOL_OF[kind]}`,
            session,
            (callSession) => readTask(jobs, params.taskId, callSession, context)
          );
        }
      );
      // A built-in task never needs input, so an update only has to name it.
      server.setRequestHandler(
        'tasks/update',
        { params: updateParams, result: anyResult },
        async (params, context) => {
          requireDeclared(context);
          const handler = handlerFor(params.taskId);
          if (!handler) {
            decodeTaskId(params.taskId);
            return {};
          }
          const inputResponses = context.mcpReq.inputResponses ?? params.inputResponses;
          const known = handler.update
            ? await handler.update(params.taskId, inputResponses, caller(session, context))
            : Boolean(await handler.get(params.taskId, caller(session, context)));
          if (!known) throw new TaskNotFound(params.taskId);
          return {};
        }
      );
      server.setRequestHandler(
        'tasks/cancel',
        { params: taskParams, result: anyResult },
        async (params, context) => {
          requireDeclared(context);
          const handler = handlerFor(params.taskId);
          if (handler) {
            const known = handler.cancel
              ? await handler.cancel(params.taskId, caller(session, context))
              : Boolean(await handler.get(params.taskId, caller(session, context)));
            if (!known) throw new TaskNotFound(params.taskId);
            return {};
          }
          const { kind } = decodeTaskId(params.taskId);
          await jobs.report(
            `tasks/cancel:${TOOL_OF[kind]}`,
            session,
            (callSession) =>
              cancelTask(jobs, params.taskId, callSession, context)
          );
          return {};
        }
      );
    },
  };
}
