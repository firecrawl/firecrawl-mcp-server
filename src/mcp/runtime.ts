import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Hono } from 'hono';
import { strictJsonSchema, toJsonSchema } from 'xsschema';
import { z } from 'zod';
import {
  ProtocolError,
  Server,
  type StandardSchemaV1,
  WebStandardStreamableHTTPServerTransport,
} from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { LegacySseTransport } from './sse.js';
import { escapeWWWAuthenticateValue } from './www-authenticate.js';

/**
 * The MCP serving layer of the core, built on the official TypeScript SDK
 * (`@modelcontextprotocol/server`).
 *
 * One server definition backs every transport: stdio, stateless Streamable
 * HTTP and the HTTP+SSE transport of the 2024-11-05 revision. They serve the
 * `initialize` handshake of protocol revisions 2024-11-05 through 2025-11-25.
 * Streamable HTTP is stateless: every request is answered by a fresh server
 * instance and no `Mcp-Session-Id` is issued. Each legacy SSE connection
 * keeps its own server for as long as the stream is open.
 */

type JsonSchemaNode = {
  type?: unknown;
  properties?: Record<string, unknown>;
  propertyNames?: unknown;
  additionalProperties?: unknown;
};

/**
 * Closes every object of an input schema to unlisted keys, as
 * `strictJsonSchema` does, except a free-form object such as a JSON Schema
 * or a header map (a `z.record`, listed with `propertyNames`): that one keeps
 * its `additionalProperties`, so clients see an open object, not one that
 * must be empty.
 */
function strictInputSchema(schema: JsonSchemaNode): JsonSchemaNode {
  if (schema.propertyNames !== undefined) return schema;
  return {
    ...schema,
    additionalProperties: false,
    properties:
      schema.properties &&
      Object.fromEntries(
        Object.entries(schema.properties).map(([key, value]) => [
          key,
          value !== null && typeof value === 'object' && (value as JsonSchemaNode).type === 'object'
            ? strictInputSchema(value as JsonSchemaNode)
            : value,
        ])
      ),
  };
}

export class UserError extends Error {
  extras?: Record<string, unknown>;

  constructor(message: string, extras?: Record<string, unknown>) {
    super(message);
    this.name = new.target.name;
    this.extras = extras;
  }
}

const TextContentSchema = z.object({ text: z.string(), type: z.literal('text') }).strict();
const ImageContentSchema = z
  .object({ data: z.string().base64(), mimeType: z.string(), type: z.literal('image') })
  .strict();
const AudioContentSchema = z
  .object({ data: z.string().base64(), mimeType: z.string(), type: z.literal('audio') })
  .strict();
const ResourceContentSchema = z
  .object({
    resource: z.object({
      blob: z.string().optional(),
      mimeType: z.string().optional(),
      text: z.string().optional(),
      uri: z.string(),
    }),
    type: z.literal('resource'),
  })
  .strict();
const ResourceLinkSchema = z.object({
  description: z.string().optional(),
  mimeType: z.string().optional(),
  name: z.string(),
  title: z.string().optional(),
  type: z.literal('resource_link'),
  uri: z.string(),
});
const ContentSchema = z.discriminatedUnion('type', [
  TextContentSchema,
  ImageContentSchema,
  AudioContentSchema,
  ResourceContentSchema,
  ResourceLinkSchema,
]);
const ContentResultSchema = z
  .object({
    content: ContentSchema.array(),
    isError: z.boolean().optional(),
    structuredContent: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type Content = z.infer<typeof ContentSchema>;
export type ContentResult = z.infer<typeof ContentResultSchema>;

export interface Logger {
  debug(...args: unknown[]): void;
  error(...args: unknown[]): void;
  info(...args: unknown[]): void;
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
}

type ToolLog = Record<
  'debug' | 'error' | 'info' | 'warn',
  (message: string, context?: unknown) => void
>;

export type ToolExecuteContext<Auth> = {
  client: { version?: { name?: string; version?: string } };
  log: ToolLog;
  reportProgress: (progress: { progress: number; total?: number; message?: string }) => Promise<void>;
  requestId?: string;
  session: Auth | undefined;
  sessionId?: string;
  streamContent: (content: Content | Content[]) => Promise<void>;
};

export type ToolIcon = {
  src: string;
  mimeType?: string;
  sizes?: string[];
  theme?: 'light' | 'dark';
};

export interface Tool<Auth> {
  name: string;
  description?: string;
  icons?: ToolIcon[];
  parameters?: StandardSchemaV1;
  outputSchema?: StandardSchemaV1;
  annotations?: { title?: string; [key: string]: unknown };
  _meta?: Record<string, unknown>;
  canAccess?: (auth: Auth) => boolean;
  canList?: (auth: Auth) => boolean;
  beforeValidate?: (
    args: unknown,
    auth: Auth
  ) => ContentResult | undefined | Promise<ContentResult | undefined>;
  execute: (args: any, context: ToolExecuteContext<Auth>) => Promise<unknown>;
}

export type ResourceResult = ({ text: string } | { blob: string }) & {
  uri?: string;
  mimeType?: string;
  _meta?: Record<string, unknown>;
};

export interface Resource<Auth> {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  load(auth?: Auth): Promise<ResourceResult | ResourceResult[]>;
}

export type ProtectedResource = {
  authorizationServers: string[];
  bearerMethodsSupported?: string[];
  resource: string;
  resourceName?: string;
  scopesSupported?: string[];
  [key: string]: unknown;
};

export type AuthenticateRequest = IncomingMessage | undefined;

export interface RuntimeOptions<Auth> {
  name: string;
  version: string;
  instructions?: string;
  logger: Logger;
  authenticate?: (request: AuthenticateRequest) => Promise<Auth>;
  oauth?: { protectedResource: ProtectedResource };
  health?: { message?: string; path?: string; status?: number };
}

export type StartOptions =
  | { transportType: 'stdio' }
  | {
      transportType: 'httpStream';
      httpStream: {
        port?: number;
        host?: string;
        endpoint?: `/${string}`;
        stateless?: boolean;
        maxBodySize?: number;
      };
    };

const DEFAULT_KEEP_ALIVE_TIMEOUT = 300_000;
const CORS_HEADERS = {
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-Id',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
};

function snakeCaseKeys(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
      entry,
    ])
  );
}

function isRejected(auth: unknown): boolean {
  return typeof auth === 'object' && auth !== null && 'authenticated' in auth && !auth.authenticated;
}

function rejectionMessage(auth: unknown): string | undefined {
  return typeof auth === 'object' && auth !== null && 'error' in auth && typeof auth.error === 'string'
    ? auth.error
    : undefined;
}

const HOST_HEADER = /^(?:\[[0-9a-f:.]+\]|[a-z0-9\-._~!$&'()*+,;=%]+)(?::\d*)?$/i;

function requestUrl(req: IncomingMessage): URL | undefined {
  const target = req.url || '';
  const host = req.headers.host;
  if (host !== undefined && !HOST_HEADER.test(host)) return undefined;
  if (target.startsWith('http://') || target.startsWith('https://')) {
    try {
      return new URL(target);
    } catch {
      return undefined;
    }
  }
  if (!host) return undefined;
  const scheme = (req.socket as { encrypted?: boolean }).encrypted ? 'https' : 'http';
  try {
    const authority = new URL(`${scheme}://${host}`).host;
    const url = new URL(`${scheme}://${host}${target}`);
    return url.host === authority ? url : undefined;
  } catch {
    return undefined;
  }
}

function urlHost(host: string): string {
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

function jsonRpcError(code: number, message: string, id: unknown = null): string {
  return JSON.stringify({ error: { code, message }, id, jsonrpc: '2.0' });
}

function formatIssues(issues: ReadonlyArray<StandardSchemaV1.Issue>): string {
  return issues
    .map((issue) => {
      const path =
        issue.path
          ?.map((segment) => (typeof segment === 'object' ? segment.key : segment))
          .join('.') || 'root';
      return `${path}: ${issue.message}`;
    })
    .join(', ');
}

function readBody(
  request: IncomingMessage,
  limit: number
): Promise<{ text: string } | { tooLarge: true } | { failed: true }> {
  return new Promise((resolve) => {
    const declared = Number(request.headers['content-length']);
    if (Number.isFinite(declared) && declared > limit) {
      resolve({ tooLarge: true });
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    request
      .on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > limit) {
          resolve({ tooLarge: true });
          return;
        }
        chunks.push(chunk);
      })
      .on('end', () => resolve({ text: Buffer.concat(chunks).toString() }))
      .on('error', () => resolve({ failed: true }))
      .on('close', () => resolve({ failed: true }));
  });
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function webHeaders(request: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (!value) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, value);
    }
  }
  return headers;
}

async function writeWebResponse(response: Response, res: ServerResponse): Promise<void> {
  if (res.headersSent) return;
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  if (!response.body) {
    res.end();
    return;
  }
  res.flushHeaders();
  const reader = response.body.getReader();
  res.on('close', () => {
    reader.cancel().catch(() => {});
  });
  try {
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      res.write(chunk.value);
    }
  } catch {
    // The client went away mid-stream.
  } finally {
    res.end();
  }
}

function isResponse(value: unknown): value is Response {
  return (
    value instanceof Response ||
    (typeof value === 'object' &&
      value !== null &&
      'status' in value &&
      'headers' in value &&
      'statusText' in value)
  );
}

async function writeThrownResponse(thrown: Response, res: ServerResponse): Promise<void> {
  const headers: Record<string, string | string[]> = {};
  thrown.headers.forEach((value, key) => {
    const existing = headers[key];
    if (existing === undefined) headers[key] = value;
    else headers[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
  });
  const body = await thrown.text();
  res.writeHead(thrown.status, thrown.statusText, headers);
  res.end(body);
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A JSON-RPC error whose message keeps the `MCP error <code>: ` prefix the
 * server's errors have always carried on the wire.
 */
function mcpError(code: number, message: string, data?: unknown): ProtocolError {
  return new ProtocolError(code, `MCP error ${code}: ${message}`, data);
}

/** Tool, resource and HTTP route registry that serves MCP. */
export class McpRuntime<Auth extends Record<string, unknown> | undefined> {
  readonly #options: RuntimeOptions<Auth>;
  readonly #tools: Tool<Auth>[] = [];
  readonly #resources: Resource<Auth>[] = [];
  readonly #app = new Hono();
  #httpServer: http.Server | undefined;
  #stdio: { close(): Promise<void> } | undefined;

  constructor(options: RuntimeOptions<Auth>) {
    this.#options = options;
  }

  addTool(tool: Tool<Auth>): void {
    this.#tools.push(tool);
  }

  addResource(resource: Resource<Auth>): void {
    this.#resources.push(resource);
  }

  /** The HTTP application non-MCP routes are added to. */
  getApp(): Hono {
    return this.#app;
  }

  /** A server instance for one HTTP request or one connection. */
  createServer(session: Auth | undefined, sessionId?: string): Server {
    const options = this.#options;
    const resources = this.#resources;
    const server = new Server(
      { name: options.name, version: options.version },
      {
        capabilities: {
          ...(this.#tools.length ? { tools: {} } : {}),
          ...(resources.length ? { resources: {} } : {}),
          logging: {},
          completions: {},
        },
        instructions: options.instructions,
      }
    );
    server.onerror = (error) => {
      options.logger.error('[FastMCP error]', error);
    };
    server.setRequestHandler('logging/setLevel', async () => ({}));
    server.setRequestHandler('completion/complete', async (request) => {
      const kind = request.params.ref.type;
      throw new UserError(
        kind === 'ref/prompt'
          ? 'Unknown prompt'
          : kind === 'ref/resource'
            ? 'Unknown resource'
            : 'Unexpected completion request',
        { request }
      );
    });
    if (this.#tools.length) this.#setUpTools(server, session, sessionId);
    if (resources.length) this.#setUpResources(server, session);
    return server;
  }

  #setUpTools(
    server: Server,
    session: Auth | undefined,
    sessionId: string | undefined
  ): void {
    const logger = this.#options.logger;
    const tools = session
      ? this.#tools.filter((tool) => (tool.canAccess ? tool.canAccess(session) : true))
      : this.#tools;
    const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));
    const listed = tools.filter((tool) =>
      tool.canList ? tool.canList(session as Auth) : true
    );
    let toolList: Record<string, unknown>[] | undefined;

    server.setRequestHandler('tools/list', async () => {
      toolList ??= await Promise.all(
        listed.map(async (tool) => ({
          annotations: tool.annotations,
          ...(tool.annotations?.title && { title: tool.annotations.title }),
          ...(tool.icons && { icons: tool.icons }),
          description: tool.description,
          inputSchema: tool.parameters
            ? strictInputSchema(await toJsonSchema(tool.parameters as never))
            : { additionalProperties: false, properties: {}, type: 'object' },
          name: tool.name,
          ...(tool.outputSchema && {
            outputSchema: strictJsonSchema(await toJsonSchema(tool.outputSchema as never)),
          }),
          ...(tool._meta && { _meta: tool._meta }),
        }))
      );
      return { tools: toolList } as never;
    });

    const validateOutput = async (tool: Tool<Auth>, value: unknown) => {
      if (!tool.outputSchema) return value;
      const parsed = await tool.outputSchema['~standard'].validate(value);
      if (parsed.issues) {
        throw new UserError(
          `Tool '${tool.name}' structured output validation failed: ${formatIssues(parsed.issues)}. Please check the result matches the tool's outputSchema.`
        );
      }
      return parsed.value;
    };

    server.setRequestHandler('tools/call', async (request) => {
      const { name } = request.params;
      const tool = toolsByName.get(name);
      if (!tool) {
        throw mcpError(-32601, `Unknown tool: ${name}`);
      }
      if (tool.beforeValidate) {
        const early = await tool.beforeValidate(request.params.arguments, session as Auth);
        if (early !== undefined) return ContentResultSchema.parse(early) as never;
      }
      let args: unknown = undefined;
      if (tool.parameters) {
        const parsed = await tool.parameters['~standard'].validate(request.params.arguments);
        if (parsed.issues) {
          throw mcpError(
            -32602,
            `Tool '${name}' parameter validation failed: ${formatIssues(parsed.issues)}. Please check the parameter types and values according to the tool's schema.`
          );
        }
        args = parsed.value;
      }
      const meta = request.params._meta as { progressToken?: string | number; requestId?: unknown } | undefined;
      const notify = async (notification: { method: string; params: Record<string, unknown> }, what: string) => {
        try {
          await server.notification(notification as never);
        } catch (error) {
          logger.warn(
            `[FastMCP warning] Failed to ${what} for tool '${name}':`,
            error instanceof Error ? error.message : String(error)
          );
        }
      };
      const sendLog = (level: string) => (message: string, logContext?: unknown) => {
        server
          .sendLoggingMessage({ data: { context: logContext, message }, level } as never)
          .catch(() => {});
      };
      let result: ContentResult;
      try {
        const value = await tool.execute(args, {
          client: { version: server.getClientVersion() },
          log: {
            debug: sendLog('debug'),
            error: sendLog('error'),
            info: sendLog('info'),
            warn: sendLog('warning'),
          },
          reportProgress: async (progress) => {
            if (meta?.progressToken === undefined) return;
            await notify(
              {
                method: 'notifications/progress',
                params: { ...progress, progressToken: meta.progressToken },
              },
              'report progress'
            );
          },
          requestId: typeof meta?.requestId === 'string' ? meta.requestId : undefined,
          session,
          sessionId,
          streamContent: async (content) => {
            await notify(
              {
                method: 'notifications/tool/streamContent',
                params: { content: Array.isArray(content) ? content : [content], toolName: name },
              },
              'stream content'
            );
          },
        });
        await delay(1);
        if (value === undefined || value === null) {
          result = ContentResultSchema.parse({ content: [] });
        } else if (typeof value === 'string') {
          result = ContentResultSchema.parse({ content: [{ text: value, type: 'text' }] });
        } else if (typeof value === 'object' && 'type' in value) {
          result = ContentResultSchema.parse({ content: [value] });
        } else if (typeof value === 'object' && 'content' in value) {
          result = ContentResultSchema.parse(value);
          if (result.structuredContent !== undefined && tool.outputSchema) {
            result.structuredContent = (await validateOutput(
              tool,
              result.structuredContent
            )) as Record<string, unknown>;
          }
        } else if (tool.outputSchema) {
          const structuredContent = (await validateOutput(tool, value)) as Record<string, unknown>;
          result = ContentResultSchema.parse({
            content: [{ text: JSON.stringify(structuredContent), type: 'text' }],
            structuredContent,
          });
        } else {
          result = ContentResultSchema.parse(value);
        }
      } catch (error) {
        if (error instanceof UserError) {
          return {
            content: [{ text: error.message, type: 'text' }],
            isError: true,
            ...(error.extras ? { structuredContent: error.extras } : {}),
          } as never;
        }
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ text: `Tool '${name}' execution failed: ${message}`, type: 'text' }],
          isError: true,
        } as never;
      }
      return result as never;
    });
  }

  #setUpResources(server: Server, session: Auth | undefined): void {
    const resources = new Map(this.#resources.map((resource) => [resource.uri, resource]));
    server.setRequestHandler('resources/list', async () => ({
      resources: [...resources.values()].map((resource) => ({
        description: resource.description,
        mimeType: resource.mimeType,
        name: resource.name,
        uri: resource.uri,
      })),
    }));
    server.setRequestHandler('resources/read', async (request) => {
      const resource = resources.get(request.params.uri);
      if (!resource) {
        throw mcpError(
          -32601,
          `Resource not found: '${request.params.uri}'. Available resources: ${[...resources.keys()].join(', ') || 'none'}`
        );
      }
      let loaded: ResourceResult | ResourceResult[];
      try {
        loaded = await resource.load(session);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw mcpError(
          -32603,
          `Failed to load resource '${resource.name}' (${resource.uri}): ${message}`,
          { uri: resource.uri }
        );
      }
      return {
        contents: (Array.isArray(loaded) ? loaded : [loaded]).map((entry) => ({
          ...entry,
          mimeType: entry.mimeType ?? resource.mimeType,
          name: resource.name,
          uri: entry.uri ?? resource.uri,
        })),
      } as never;
    });
  }

  async start(options: StartOptions): Promise<void> {
    if (options.transportType === 'stdio') {
      await this.#startStdio();
      return;
    }
    await this.#startHttp(options.httpStream);
  }

  async stop(): Promise<void> {
    await this.#stdio?.close();
    const server = this.#httpServer;
    if (!server) return;
    const closed = new Promise<void>((resolve) => server.close(() => resolve()));
    server.closeAllConnections();
    await closed;
  }

  async #startStdio(): Promise<void> {
    let session: Auth | undefined;
    if (this.#options.authenticate) {
      let failure: string | undefined;
      try {
        session = await this.#options.authenticate(undefined);
        if (!session || isRejected(session)) {
          failure = rejectionMessage(session) ?? 'Authentication failed';
        }
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
      }
      if (failure !== undefined) {
        this.#options.logger.error('[FastMCP error] Authentication failed for stdio transport:', failure);
        throw new Error(`Authentication failed for stdio transport: ${failure}`);
      }
    }
    const server = this.createServer(session);
    await server.connect(new StdioServerTransport());
    this.#stdio = server;
  }

  async #startHttp(overrides: Extract<StartOptions, { transportType: 'httpStream' }>['httpStream']): Promise<void> {
    const args = process.argv.slice(2);
    const arg = (name: string) => {
      const index = args.findIndex((value) => value === `--${name}`);
      return index !== -1 && index + 1 < args.length ? args[index + 1] : undefined;
    };
    const port = parseInt(
      overrides.port?.toString() || arg('port') || process.env.FASTMCP_PORT || '8080'
    );
    const host = overrides.host || arg('host') || process.env.FASTMCP_HOST || 'localhost';
    const endpoint =
      overrides.endpoint || arg('endpoint') || process.env.FASTMCP_ENDPOINT || '/mcp';
    const stateless =
      overrides.stateless || arg('stateless') === 'true' || process.env.FASTMCP_STATELESS === 'true';
    if (!stateless) {
      this.#options.logger.warn(
        '[FastMCP warning] Session-based HTTP serving is no longer available; serving every request statelessly.'
      );
    }
    const maxBodySize = overrides.maxBodySize ?? 10 * 1024 * 1024;
    const logger = this.#options.logger;

    const sseSessions = new Map<string, LegacySseTransport>();

    const requestListener = async (req: IncomingMessage, res: ServerResponse) => {
      if (req.headers.origin) {
        try {
          new URL(req.headers.origin);
          res.setHeader('Access-Control-Allow-Origin', '*');
          for (const [key, value] of Object.entries(CORS_HEADERS)) res.setHeader(key, value);
        } catch (error) {
          console.error('[mcp-proxy] error parsing origin', error);
        }
      }
      if (req.method === 'OPTIONS') {
        res.writeHead(204).end();
        return;
      }
      if (req.method === 'GET' && req.url === '/ping') {
        res.writeHead(200).end('pong');
        return;
      }
      let url: URL;
      try {
        url = new URL(req.url || '', 'http://localhost');
      } catch {
        res.writeHead(400).end('Bad Request');
        return;
      }
      const isMcpEndpoint = url.pathname === '/sse' || url.pathname === endpoint;
      if (!isMcpEndpoint) {
        await this.#serveRoute(req, res, urlHost(host), endpoint);
        if (res.writableEnded) return;
      }
      if (req.method === 'GET' && url.pathname === '/sse') {
        await this.#openSse(req, res, sseSessions);
        return;
      }
      if (req.method === 'POST' && req.url?.startsWith('/messages')) {
        const sessionId = new URL(req.url, 'https://example.com').searchParams.get('sessionId');
        const transport = sessionId ? sseSessions.get(sessionId) : undefined;
        if (!sessionId) res.writeHead(400).end('No sessionId');
        else if (!transport) res.writeHead(400).end('No active transport');
        else await transport.handlePostMessage(req, res);
        return;
      }
      if (url.pathname !== endpoint) {
        res.writeHead(404).end();
        return;
      }
      if (req.method === 'POST') {
        await this.#serveStream(req, res, maxBodySize);
        return;
      }
      if (req.method === 'GET' || req.method === 'DELETE') {
        if (req.method === 'GET' && !req.headers['mcp-session-id']) {
          res.writeHead(405, { Allow: 'POST' }).end('Method Not Allowed');
          return;
        }
        if (this.#options.authenticate) {
          this.#sendSessionUnauthorized(res);
          return;
        }
        res
          .writeHead(400)
          .end(req.headers['mcp-session-id'] ? 'No active transport' : 'Invalid or missing sessionId');
        return;
      }
      res.writeHead(404).end();
    };

    const server = http.createServer((req, res) => {
      requestListener(req, res).catch((error) => {
        console.error('[mcp-proxy] error handling request', error);
        if (!res.headersSent) {
          res.setHeader('Content-Type', 'application/json');
          res.writeHead(500).end(jsonRpcError(-32603, 'Internal Server Error'));
        } else {
          res.destroy();
        }
      });
    });
    server.keepAliveTimeout = DEFAULT_KEEP_ALIVE_TIMEOUT;
    server.headersTimeout = Math.max(server.headersTimeout, DEFAULT_KEEP_ALIVE_TIMEOUT + 1000);
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        server.off('error', reject);
        resolve();
      });
    });
    this.#httpServer = server;
    logger.info(
      `[FastMCP info] Starting server in stateless mode on HTTP Stream at http://${urlHost(host)}:${port}${endpoint}`
    );
  }

  #wwwAuthenticate(error: string, description: string): string | undefined {
    const resource = this.#options.oauth?.protectedResource?.resource;
    if (!resource) return undefined;
    const metadata = escapeWWWAuthenticateValue(`${resource}/.well-known/oauth-protected-resource`);
    return `Bearer resource_metadata="${metadata}", error="${error}", error_description="${escapeWWWAuthenticateValue(description)}"`;
  }

  #sendUnauthorized(res: ServerResponse, message: string, id: unknown): void {
    res.setHeader('Content-Type', 'application/json');
    const challenge = this.#wwwAuthenticate('invalid_token', message);
    if (challenge) res.setHeader('WWW-Authenticate', challenge);
    res.writeHead(401).end(jsonRpcError(-32000, message, id));
  }

  #sendSessionUnauthorized(res: ServerResponse, body?: unknown): void {
    const id =
      typeof body === 'object' && body !== null && !Array.isArray(body) && 'id' in body
        ? (body as { id: unknown }).id
        : null;
    this.#sendUnauthorized(res, 'Unauthorized: No valid session ID provided', id);
  }

  async #serveStream(
    req: IncomingMessage,
    res: ServerResponse,
    maxBodySize: number
  ): Promise<void> {
    const url = requestUrl(req);
    if (!url) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=UTF-8' }).end();
      return;
    }
    const bodyResult = await readBody(req, maxBodySize);
    if ('tooLarge' in bodyResult) {
      console.error(`[mcp-proxy] request body too large (exceeds ${maxBodySize} bytes)`);
      req.pause();
      if (res.headersSent) {
        req.destroy();
        return;
      }
      res.setHeader('Connection', 'close');
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(413).end(
        jsonRpcError(-32600, `Payload Too Large: request body exceeds ${maxBodySize} bytes`),
        () => req.destroy()
      );
      return;
    }
    const text = 'text' in bodyResult ? bodyResult.text : '';
    const body = parseJson(text);
    const id =
      typeof body === 'object' && body !== null && 'id' in body ? (body as { id: unknown }).id : null;
    let session: Auth | undefined;
    if (this.#options.authenticate) {
      try {
        session = await this.#options.authenticate(req);
        if (!session || isRejected(session)) {
          this.#sendUnauthorized(res, rejectionMessage(session) ?? 'Unauthorized: Authentication failed', id ?? null);
          return;
        }
      } catch (thrown) {
        if (isResponse(thrown)) {
          await writeThrownResponse(thrown, res);
          return;
        }
        const message = thrown instanceof Error ? thrown.message : 'Unauthorized: Authentication error';
        this.#options.logger.error('[FastMCP error] Authentication error:', thrown);
        this.#sendUnauthorized(res, message, id ?? null);
        return;
      }
    }
    const controller = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) controller.abort();
    });
    const request = new Request(url, {
      method: 'POST',
      headers: webHeaders(req),
      body: text,
      signal: controller.signal,
    });
    const server = this.createServer(session, [req.headers['mcp-session-id']].flat()[0]);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      server.close().catch(() => {});
    });
    try {
      await server.connect(transport);
      const response = await transport.handleRequest(request);
      await writeWebResponse(response, res);
      this.#options.logger.debug('[FastMCP debug] Stateless HTTP Stream request handled');
    } catch (error) {
      console.error('[mcp-proxy] error handling request', error);
      if (!res.headersSent) {
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(500).end(jsonRpcError(-32603, 'Internal Server Error'));
      }
    }
  }

  async #openSse(
    req: IncomingMessage,
    res: ServerResponse,
    sessions: Map<string, LegacySseTransport>
  ): Promise<void> {
    if (!requestUrl(req)) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=UTF-8' }).end();
      return;
    }
    let session: Auth | undefined;
    if (this.#options.authenticate) {
      try {
        session = await this.#options.authenticate(req);
      } catch (thrown) {
        if (isResponse(thrown)) {
          await writeThrownResponse(thrown, res);
          return;
        }
        this.#options.logger.error('[FastMCP error] Authentication error:', thrown);
        this.#sendUnauthorized(
          res,
          thrown instanceof Error ? thrown.message : 'Unauthorized: Authentication error',
          null
        );
        return;
      }
      if (!session || isRejected(session)) {
        this.#sendUnauthorized(res, rejectionMessage(session) ?? 'Unauthorized: Authentication failed', null);
        return;
      }
    }
    const transport = new LegacySseTransport('/messages', res);
    const server = this.createServer(session, transport.sessionId);
    sessions.set(transport.sessionId, transport);
    let closed = false;
    res.on('close', async () => {
      closed = true;
      sessions.delete(transport.sessionId);
      try {
        await server.close();
      } catch (error) {
        console.error('[mcp-proxy] error closing server', error);
      }
    });
    try {
      await server.connect(transport);
      await transport.send({
        jsonrpc: '2.0',
        method: 'notifications/message',
        params: { data: 'SSE Connection established', level: 'info' },
      });
    } catch (error) {
      if (!closed) {
        console.error('[mcp-proxy] error connecting to server', error);
        if (!res.headersSent) res.writeHead(500).end('Error connecting to server');
      }
    }
  }

  async #serveRoute(req: IncomingMessage, res: ServerResponse, host: string, endpoint: string): Promise<void> {
    const url = new URL(req.url || '', `http://${host}`);
    try {
      const method = req.method || 'GET';
      const hasBody = method !== 'GET' && method !== 'HEAD';
      const request = new Request(url.toString(), {
        method,
        headers: webHeaders(req),
        ...(hasBody ? { body: req as never, duplex: 'half' } : {}),
      } as RequestInit);
      const response = await this.#app.fetch(request, { incoming: req, outgoing: res });
      if (response.status !== 404) {
        await writeWebResponse(response, res);
        return;
      }
    } catch (error) {
      this.#options.logger.debug('[FastMCP debug] Hono route not matched', error);
    }
    const isRead = req.method === 'GET' || req.method === 'HEAD';
    const health = this.#options.health ?? {};
    if (isRead && url.pathname === (health.path ?? '/health')) {
      res
        .writeHead(health.status ?? 200, { 'Content-Type': 'text/plain' })
        .end(req.method === 'HEAD' ? undefined : (health.message ?? '\u2713 Ok'));
      return;
    }
    if (isRead && url.pathname === '/ready') {
      res
        .writeHead(200, { 'Content-Type': 'application/json' })
        .end(
          req.method === 'HEAD'
            ? undefined
            : JSON.stringify({ mode: 'stateless', ready: 1, status: 'ready', total: 1 })
        );
      return;
    }
    const protectedResource = this.#options.oauth?.protectedResource;
    if (req.method === 'GET' && protectedResource) {
      const base = '/.well-known/oauth-protected-resource';
      if (url.pathname === base || url.pathname === `${base}${endpoint}`) {
        res
          .writeHead(200, { 'Content-Type': 'application/json' })
          .end(JSON.stringify(snakeCaseKeys(protectedResource)));
      }
    }
  }
}

