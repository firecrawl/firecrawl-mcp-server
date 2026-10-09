import { randomUUID } from 'node:crypto';
import {
  type FirecrawlMcpServerHooks,
  KEYLESS_TOOL_NAMES,
  recoveryPayload,
  type ToolDefinition,
  UserError,
} from '../server.js';
import { hostedKeylessSignupUrl } from './keyless.js';
import { isHostedKeylessSession, type ServiceSession } from './session.js';

export type ToolGuardOptions = {
  apiBaseUrl: string;
};

/**
 * Hosted session gates for every tool: sessions admitted with an unusable
 * credential and keyless sessions see only the keyless tools, and calling
 * anything else returns the recovery payload.
 */
export function createToolGuard({
  apiBaseUrl,
}: ToolGuardOptions): NonNullable<FirecrawlMcpServerHooks['wrapTool']> {
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
          return {
            content: [{ type: 'text' as const, text: String(payload.message) }],
            isError: true,
            structuredContent: payload,
          };
        }
        return beforeValidate?.(args, session);
      },
      execute: async (args, context) => {
        const session = context.session as ServiceSession;
        const requestId = session.requestId as string;
        if (session.credentialError) {
          const code = 'CREDENTIAL_INVALID';
          const payload = recoveryPayload(code, requestId);
          throw new UserError(String(payload.message), payload);
        }
        if (isHostedKeylessSession(session) && !keylessTool) {
          const code = 'KEYLESS_TOOL_NOT_AVAILABLE';
          const payload = recoveryPayload(code, requestId, {
            signupUrl: await hostedKeylessSignupUrl(apiBaseUrl, session),
          });
          throw new UserError(String(payload.message), payload);
        }
        return execute(args, context);
      },
    };
  };
}
