import {
  type FirecrawlMcpServerHooks,
  KEYLESS_TOOL_NAMES,
  recoveryPayload,
  type ToolDefinition,
  UserError,
} from '../server.js';
import type { ServiceSession } from './session.js';

/**
 * Hosted session gate for every tool: a session admitted with an unusable
 * credential sees only the keyless tool surface, and calling any tool returns
 * the CREDENTIAL_INVALID recovery payload.
 */
export function createToolGuard(): NonNullable<
  FirecrawlMcpServerHooks['wrapTool']
> {
  return (tool: ToolDefinition): ToolDefinition => {
    const keylessTool = KEYLESS_TOOL_NAMES.has(tool.name);
    const execute = tool.execute;
    const canList = tool.canList;
    const beforeValidate = tool.beforeValidate;
    return {
      ...tool,
      canList: (session: ServiceSession) =>
        // A credentialError session lists the keyless tool surface (not the
        // full authenticated schema) so the client proceeds past tools/list and
        // calling any listed tool returns the CREDENTIAL_INVALID recovery
        // payload (below). An empty list would leave MCP clients that stop after
        // tools/list unable to ever surface the recovery guidance; the full
        // schema would over-disclose to a request carrying an unrecognized or
        // invalid credential.
        (session?.credentialError ? keylessTool : true) &&
        (canList?.(session) ?? true),
      beforeValidate: async (args: unknown, session: ServiceSession) => {
        if (session?.credentialError) {
          const payload = recoveryPayload('CREDENTIAL_INVALID');
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
        if (session.credentialError) {
          const payload = recoveryPayload(
            'CREDENTIAL_INVALID',
            session.requestId as string
          );
          throw new UserError(String(payload.message), payload);
        }
        return execute(args, context);
      },
    };
  };
}
