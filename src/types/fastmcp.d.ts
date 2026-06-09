declare module 'firecrawl-fastmcp' {
  import type { IncomingHttpHeaders } from 'http';

  export interface Logger {
    debug(...args: unknown[]): void;
    error(...args: unknown[]): void;
    info(...args: unknown[]): void;
    log(...args: unknown[]): void;
    warn(...args: unknown[]): void;
  }

  export type TransportArgs =
    | { transportType: 'stdio' }
    | {
        transportType: 'httpStream';
        httpStream: { port: number; host?: string; stateless?: boolean };
      };

  export interface ToolContext<Session = unknown> {
    session?: Session;
    log: Logger;
  }

  export type ToolExecute<Session = unknown> = (
    args: unknown,
    context: ToolContext<Session>
  ) => unknown | Promise<unknown>;

  export class FastMCP<Session = unknown> {
    constructor(options: {
      name: string;
      version?: string;
      logger?: Logger;
      roots?: { enabled?: boolean };
      authenticate?: (request?: {
        headers: IncomingHttpHeaders;
        /** Request target (path + query string) for HTTP transports. */
        url?: string;
      }) => Promise<Session> | Session;
      oauth?: {
        enabled: boolean;
        protectedResource?: {
          authorizationServers: string[];
          bearerMethodsSupported?: string[];
          resource: string;
          resourceName?: string;
          scopesSupported?: string[];
          [key: string]: unknown;
        };
        protectedResourceMetadataUrl?: string;
      };
      health?: {
        enabled?: boolean;
        message?: string;
        path?: string;
        status?: number;
      };
    });

    addTool(tool: {
      name: string;
      description?: string;
      parameters?: unknown;
      /**
       * Gate tool visibility per session. Returning false hides the tool from
       * `tools/list` and rejects calls for that session.
       */
      canAccess?: (session?: Session) => boolean;
      /** MCP tool annotations (title, readOnlyHint, etc.) */
      annotations?: {
        /** A human-readable title for the tool. */
        title?: string;
        /**
         * If true, the tool does not modify its environment.
         */
        readOnlyHint?: boolean;
        /**
         * If true, the tool may perform destructive updates to its environment. If false, the tool performs only additive updates.
         *
         * (This property is meaningful only when `readOnlyHint == false`)
         */
        destructiveHint?: boolean;
        /**
         * If true, calling the tool repeatedly with the same arguments will have no additional effect on its environment.
         *
         * (This property is meaningful only when `readOnlyHint == false`)
         */
        idempotentHint?: boolean;
        /**
         * If true, this tool may interact with an "open world" of external entities. If false, the tool's domain of interaction is closed. For example, the world of a web search tool is open, whereas that of a memory tool is not.
         */
        openWorldHint?: boolean;
        /**
         * When true, the tool leverages incremental content streaming.
         * Return void for tools that handle all their output via streaming.
         */
        streamingHint?: boolean;
      };
      execute: ToolExecute<Session>;
    }): void;

    start(args?: TransportArgs): Promise<void>;
  }
}
