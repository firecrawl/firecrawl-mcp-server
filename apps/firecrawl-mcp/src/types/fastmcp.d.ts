declare module 'firecrawl-fastmcp' {
  import type { ZodSchema } from 'zod';

  export interface Logger {
    debug(...args: unknown[]): void;
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
    log(...args: unknown[]): void;
  }

  export interface ToolDefinition {
    name: string;
    description?: string;
    inputSchema?: ZodSchema;
    execute: (args: any, session?: any) => Promise<string>;
  }

  export interface FastMcpOptions<Session> {
    name: string;
    version: string;
    logger?: Logger;
    roots?: { enabled: boolean };
    authenticate?: (req: any) => Promise<Session>;
    health?: {
      enabled: boolean;
      message: string;
      path: string;
      status: number;
    };
  }

  export class FastMCP<Session = any> {
    constructor(opts: FastMcpOptions<Session>);
    addTool(tool: ToolDefinition): void;
    start(): void;
  }
}
