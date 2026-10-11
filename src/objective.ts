import { z } from 'zod';

/** Whether the tools in {@link OBJECTIVE_TOOLS} require `objective`. */
export type ObjectiveMode = 'optional' | 'required';

type ObjectivePolicy = {
  /** Longest accepted objective, in characters. */
  maxLength: number;
  /** Send `objective` to the Firecrawl API; otherwise it stops at the MCP layer. */
  forwarded: boolean;
};

// Tools that take an `objective`. Adding a tool here gives it the field, the
// OBJECTIVE_REQUIRED check in required mode, and reporting on tool-call events.
export const OBJECTIVE_TOOLS: ReadonlyMap<string, ObjectivePolicy> = new Map([
  ['firecrawl_search', { maxLength: 5000, forwarded: true }],
  ['firecrawl_scrape', { maxLength: 1000, forwarded: false }],
  ['firecrawl_find_tools', { maxLength: 1000, forwarded: false }],
]);

const OBJECTIVE_DESCRIPTION =
  "The user's underlying goal for this call, in one sentence: what they are ultimately trying to accomplish, not a restatement of the URL or query. Reuse it across related calls. Avoid sensitive information.";

function objectiveField(maxLength: number) {
  return z.string().trim().min(1).max(maxLength).describe(OBJECTIVE_DESCRIPTION);
}

type ExtensibleSchema = {
  shape: Record<string, unknown>;
  safeExtend(shape: Record<string, z.ZodType>): unknown;
};

/**
 * The tool's parameters with its `objective` field: required in required
 * mode, otherwise optional. An optional field the schema already declares is
 * kept as is.
 */
export function withObjectiveParameter(
  name: string,
  parameters: unknown,
  mode: ObjectiveMode
): unknown {
  const policy = OBJECTIVE_TOOLS.get(name);
  if (!policy) return parameters;
  const schema = parameters as ExtensibleSchema;
  if (typeof schema?.safeExtend !== 'function') {
    throw new Error(`${name} parameters must be a zod object to take objective`);
  }
  if (mode === 'optional' && 'objective' in schema.shape) return parameters;
  const field = objectiveField(policy.maxLength);
  return schema.safeExtend({
    objective: mode === 'required' ? field : field.optional(),
  });
}

/** The guided result for a call that omits `objective` in required mode. */
export function objectiveRequiredResult(tool: string) {
  const message = `${tool} requires objective: the user's underlying goal for this call in one sentence (what they are ultimately trying to accomplish, not a restatement of the URL or query). Retry the same call with objective set, and reuse it for related calls.`;
  return {
    content: [{ type: 'text' as const, text: message }],
    isError: true,
    structuredContent: { code: 'OBJECTIVE_REQUIRED', message },
  };
}

/** Whether a call's arguments leave `objective` out or blank. */
export function objectiveMissing(args: unknown): boolean {
  const objective =
    args && typeof args === 'object'
      ? (args as { objective?: unknown }).objective
      : undefined;
  return (
    objective === undefined ||
    objective === null ||
    (typeof objective === 'string' && objective.trim() === '')
  );
}

/** Whether a call asks for zero data retention, so its objective is not reported. */
export function requestsZeroDataRetention(args: Record<string, unknown>): boolean {
  const scrapeOptions = args.scrapeOptions as
    | { zeroDataRetention?: unknown }
    | undefined;
  return (
    args.zeroDataRetention === true ||
    scrapeOptions?.zeroDataRetention === true ||
    (Array.isArray(args.enterprise) &&
      args.enterprise.some((mode) => mode === 'zdr' || mode === 'anon'))
  );
}

const CALL_RECORD = Symbol('firecrawlMcpToolCall');

type CallRecord = { apiJobId?: string };

/** Starts the record a tool fills in while it runs, on the call's own session copy. */
export function startCallRecord(session: object): CallRecord {
  const record: CallRecord = {};
  Object.defineProperty(session, CALL_RECORD, { value: record, configurable: true });
  return record;
}

/**
 * Records the Firecrawl API job behind the current tool call (a search ID,
 * scrape ID, or Alexandria request ID), reported as `apiJobId` on the call's
 * events. Ignored outside a tool call.
 */
export function noteApiJobId(session: unknown, id: unknown): void {
  const record =
    session && typeof session === 'object'
      ? (session as { [CALL_RECORD]?: CallRecord })[CALL_RECORD]
      : undefined;
  if (record && typeof id === 'string' && id !== '') record.apiJobId = id;
}
