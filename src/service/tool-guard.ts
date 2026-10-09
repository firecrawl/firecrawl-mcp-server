import { randomUUID } from 'node:crypto';
import {
  type FirecrawlMcpServerHooks,
  KEYLESS_TOOL_NAMES,
  normalizeHeader,
  recoveryPayload,
  type ToolDefinition,
  UserError,
  withoutTrailingSlash,
} from '../server.js';
import { hostedKeylessSignupUrl } from './keyless.js';
import type { ServerProfile } from './profiles.js';
import { isHostedKeylessSession, type ServiceSession } from './session.js';

type ActionStatus = 'started' | 'success' | 'error';

function emitActionLog(
  profile: ServerProfile,
  apiUrl: string | undefined,
  toolName: string,
  status: ActionStatus,
  session?: ServiceSession,
  error?: unknown,
  requestId: string = randomUUID(),
  code?: string
): void {
  const payload = {
    team_id: session?.teamId,
    user_id: session?.userId,
    api_key_id: session?.apiKeyId,
    oauth_client_id: session?.oauthClientId,
    auth_type: session?.authType ?? 'none',
    tool_name: toolName,
    status,
    request_id: requestId,
    resource: profile.resourceUrl,
    ...(error
      ? { error_class: error instanceof Error ? error.name : typeof error }
      : {}),
    ...(code ? { code } : {}),
  };
  console.error('[MCP_ACTION]', JSON.stringify(payload));

  const secret = normalizeHeader(process.env.FIRECRAWL_MCP_ACTION_LOG_SECRET);
  const configuredApiUrl = normalizeHeader(apiUrl);
  const endpoint =
    normalizeHeader(process.env.FIRECRAWL_MCP_ACTION_LOG_URL) ??
    (configuredApiUrl ? `${withoutTrailingSlash(configuredApiUrl)}/v2/mcp/action-logs` : undefined);
  if (!secret || !endpoint || !payload.team_id || status === 'started') return;
  // `code` is an MCP console-log discriminator, not part of the account-scoped
  // action-log API contract.
  const actionLogPayload = { ...payload };
  delete actionLogPayload.code;
  void fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(actionLogPayload),
    signal: AbortSignal.timeout(1500),
  }).catch(() => undefined);
}

const AGENT_HINT_LOG_MAX_CHARS = 1000;

/**
 * One `[MCP_AGENT_HINTS]` line per tool call that surfaced API agent hints.
 * The strings come from the Firecrawl API, never from page content, so they
 * are logged verbatim (capped) to count each hint; `request_id` joins the line
 * to the call's `[MCP_ACTION]` records for account-level breakdowns.
 */
function emitAgentHintsLog(
  profile: ServerProfile,
  toolName: string,
  status: Exclude<ActionStatus, 'started'>,
  hints: string[] | undefined,
  session: ServiceSession,
  requestId: string
): void {
  // An empty array is still an API hints response, logged as hint_count 0.
  if (!hints) return;
  console.error(
    '[MCP_AGENT_HINTS]',
    JSON.stringify({
      tool_name: toolName,
      status,
      request_id: requestId,
      auth_type: session.authType ?? 'none',
      // The companion search server shares this process and wrapper.
      profile: session.profile ?? profile.id,
      hint_count: hints.length,
      hints: hints.map((hint) => hint.slice(0, AGENT_HINT_LOG_MAX_CHARS)),
    })
  );
}

export type ToolGuardOptions = {
  profile: ServerProfile;
  apiUrl: string | undefined;
  apiBaseUrl: string;
  /** Emit `[MCP_ACTION]` records and action-log posts. */
  logActions: boolean;
};

/**
 * Hosted session gates for every tool: sessions admitted with an unusable
 * credential and keyless sessions see only the keyless tools, and calling
 * anything else returns the recovery payload.
 */
export function createToolGuard({
  profile,
  apiUrl,
  apiBaseUrl,
  logActions,
}: ToolGuardOptions): NonNullable<FirecrawlMcpServerHooks['wrapTool']> {
  const logRejection = (
    toolName: string,
    session: ServiceSession,
    error: unknown,
    requestId: string,
    code: string
  ) => {
    if (logActions) {
      emitActionLog(profile, apiUrl, toolName, 'error', session, error, requestId, code);
    }
  };

  return (tool: ToolDefinition): ToolDefinition => {
    const keylessTool = KEYLESS_TOOL_NAMES.has(tool.name);
    const execute = tool.execute;
    const canList = tool.canList;
    const beforeValidate = tool.beforeValidate;
    return {
      ...tool,
      canList: (session: ServiceSession) =>
        // A credentialError session lists the keyless tool surface (same as a
        // real keyless session, not the full authenticated schema) so the
        // client proceeds past tools/list and calling any listed tool returns
        // the CREDENTIAL_INVALID recovery payload (below). An empty list would
        // leave MCP clients that stop after tools/list unable to ever surface
        // the recovery guidance; the full non-keyless schema would over-disclose
        // to a request carrying an unrecognized or invalid credential.
        (session?.credentialError || isHostedKeylessSession(session)
          ? keylessTool
          : true) &&
        (canList?.(session) ?? true),
      beforeValidate: async (args: unknown, session: ServiceSession) => {
        const code = session?.credentialError
          ? 'CREDENTIAL_INVALID'
          : isHostedKeylessSession(session) && !keylessTool
            ? 'KEYLESS_TOOL_NOT_AVAILABLE'
            : undefined;
        if (code) {
          const requestId = randomUUID();
          const payload = recoveryPayload(code, requestId, {
            signupUrl:
              code === 'KEYLESS_TOOL_NOT_AVAILABLE'
                ? await hostedKeylessSignupUrl(apiBaseUrl, session)
                : undefined,
          });
          logRejection(tool.name, session, new UserError(String(payload.message), payload), requestId, code);
          return {
            content: [{ type: 'text' as const, text: String(payload.message) }],
            isError: true,
            structuredContent: payload,
          };
        }
        const earlyResult = await beforeValidate?.(args, session);
        const payload = earlyResult?.structuredContent;
        const recoveryCode =
          payload &&
          typeof payload === 'object' &&
          'code' in payload &&
          typeof payload.code === 'string'
            ? payload.code
            : undefined;
        if (earlyResult?.isError && recoveryCode) {
          logRejection(
            tool.name,
            session,
            new UserError(`Tool validation failed: ${recoveryCode}`, payload),
            randomUUID(),
            recoveryCode
          );
        }
        return earlyResult;
      },
      execute: async (args, context) => {
        const session = context.session as ServiceSession;
        const requestId = session.requestId as string;
        if (session.credentialError) {
          const code = 'CREDENTIAL_INVALID';
          const payload = recoveryPayload(code, requestId);
          logRejection(tool.name, session, new UserError(String(payload.message), payload), requestId, code);
          throw new UserError(String(payload.message), payload);
        }
        if (isHostedKeylessSession(session) && !keylessTool) {
          const code = 'KEYLESS_TOOL_NOT_AVAILABLE';
          const payload = recoveryPayload(code, requestId, {
            signupUrl: await hostedKeylessSignupUrl(apiBaseUrl, session),
          });
          logRejection(tool.name, session, new UserError(String(payload.message), payload), requestId, code);
          throw new UserError(String(payload.message), payload);
        }
        return execute(args, context);
      },
    };
  };
}

/** `[MCP_ACTION]` and `[MCP_AGENT_HINTS]` records for each tool call. */
export function createToolCallLogger({
  profile,
  apiUrl,
  logActions,
}: Pick<ToolGuardOptions, 'profile' | 'apiUrl' | 'logActions'>): NonNullable<
  FirecrawlMcpServerHooks['onToolResult']
> {
  return (event) => {
    const session = event.session as ServiceSession;
    if (event.status === 'started') {
      if (logActions) {
        emitActionLog(profile, apiUrl, event.tool, 'started', session, undefined, event.requestId);
      }
      return;
    }
    emitAgentHintsLog(
      profile,
      event.tool,
      event.status === 'success' &&
        !(event.result as { isError?: boolean } | undefined)?.isError
        ? 'success'
        : 'error',
      event.agentHints,
      session,
      event.requestId
    );
    if (logActions) {
      emitActionLog(
        profile,
        apiUrl,
        event.tool,
        event.status,
        session,
        event.status === 'error' ? event.error : undefined,
        event.requestId
      );
    }
  };
}
