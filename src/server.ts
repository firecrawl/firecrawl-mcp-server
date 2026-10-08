import {
  ALEXANDRIA_FEEDBACK_HINT,
  alexandriaCallsWarrantFeedback,
  alexandriaFeedbackFields,
  alexandriaSessionFeedbackSchema,
  withAlexandriaFeedbackHint,
} from './alexandria-feedback.js';
import FirecrawlApp from 'firecrawl';
import {
  type ContentResult,
  FastMCP,
  type Logger,
  UserError as FastMcpUserError,
} from 'fastmcp';
import type { Hono } from 'hono';
import type { IncomingHttpHeaders } from 'http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import {
  AGENT_HINTS_HEADERS,
  preserveAgentHints,
  readAgentHints,
  readErrorAgentHints,
} from './agent-hints';
import {
  agentOutputSchema,
  agentStatusOutputSchema,
  crawlOutputSchema,
  deprecatedToolOutputSchema,
  feedbackOutputSchema,
  findToolsOutputSchema,
  interactOutputSchema,
  interactStopOutputSchema,
  mapOutputSchema,
  parseOutputSchema,
  scrapeOutputSchema,
  searchOutputSchema,
  structuredCompact,
  structuredJsonText,
  structuredText,
  withStructured,
} from './tool-output';
import {
  findToolsSchema,
  findToolsOptions,
  withFindToolsNavigation,
  hasAlexandria,
  defaultDomainTools,
  normalizeSearchSources,
  searchQueryIsValid,
  ALEXANDRIA_SEARCH_LEAD,
  ALEXANDRIA_CONTRACT_GUIDANCE,
  ALEXANDRIA_CATALOGUE_SENTENCE,
  ALEXANDRIA_CATALOGUE_VERTICALS,
  ALEXANDRIA_SOURCES_OPT_OUT,
} from './alexandria';
import { alexandriaOutput } from './alexandria-output';
import { registerDeveloperTools } from './developer';
import { registerGovTools } from './gov';
import { registerMonitorTools } from './monitor';
import { registerResearchTools } from './research';
import { registerUsageTools } from './usage';
import { originHeaders, requestOrigin, type McpClient } from './origin';
import { CoreHttpError } from './core-http-error.js';
import { normalizeHeader } from './headers.js';
import {
  FIRECRAWL_CREDENTIAL_REJECTED,
  keylessQuotaReason,
  keylessSignupUrlFrom,
  recoveryPayload,
  runWithCredentialRecovery,
} from './recovery.js';
import {
  assertExchangeCredential as assertExchangeCredentialPresent,
  DATA_SOURCES_SETTINGS_URL,
  exchangeCallSchema,
  exchangeCallsSchema,
  isTermsWrite,
  postSearchWithFallback,
  relayExchangeError,
  relayTermsRequired,
  removeEmptyTopLevel,
  SEARCH_DOMAINS_CONFLICT_MESSAGE,
  searchDomainsAreExclusive,
  searchToolBaseFields,
  termsWriteError,
} from './tool-helpers.js';

/**
 * Library entry point: `import { createFirecrawlMcpServer } from 'firecrawl-mcp/server'`.
 *
 * Unstable: this API, its options and the types below may change in any
 * release, including minor and patch releases. FastMCP is bundled (with local
 * patches), so embedders use the types exported here rather than importing
 * `fastmcp` themselves.
 * @packageDocumentation
 */

/**
 * An error whose message is shown to the agent as the tool result. `extras`
 * becomes the result's structured content.
 */
export const UserError: new (
  message: string,
  extras?: Record<string, unknown>
) => Error & { extras?: Record<string, unknown> } = FastMcpUserError;

/** What a tool's `execute` or `beforeValidate` may return. */
export type ToolResult = {
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'image' | 'audio'; data: string; mimeType: string }
    | {
        type: 'resource';
        resource: { uri: string; mimeType?: string; text?: string; blob?: string };
      }
    | {
        type: 'resource_link';
        uri: string;
        name: string;
        title?: string;
        description?: string;
        mimeType?: string;
        size?: number;
      }
  >;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

const require = createRequire(import.meta.url);
const { version: packageVersion } = require('../package.json') as {
  version: string;
};

/**
 * Per-connection state produced by `authenticate` and handed to every tool
 * call. Embedders may add their own fields.
 */
export interface SessionData {
  /**
   * FC API key (`fc-...`) or OAuth access token (`fco_...`) sent as
   * `Authorization: Bearer ...` to the Firecrawl API.
   */
  firecrawlApiKey?: string;
  /**
   * The User-Agent of the HTTP request that opened the session, the only
   * client signal a stateless HTTP tool call carries (see src/origin.ts).
   */
  clientUserAgent?: string;
  authType?: 'api-key' | 'oauth' | 'env' | 'keyless' | 'none';
  /** Admitted, but the supplied credential cannot be used. */
  credentialError?: 'CREDENTIAL_INVALID';
  /** Set per tool call. */
  requestId?: string;
  [key: string]: unknown;
}

/** Per-connection session state; alias of {@link SessionData}. */
export type Session = SessionData;

/** Logs to the connected client. */
export type ToolLogger = {
  debug(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
};

/** What a tool's `execute` receives besides its arguments. */
export type ToolContext = {
  session?: Session;
  log: ToolLogger;
  /** The connected client; `version` is the clientInfo sent at initialize. */
  client?: { version?: { name?: string; version?: string } };
  [key: string]: unknown;
};

/** A tool as registered on the server. */
export interface ToolDefinition {
  name: string;
  description?: string;
  /** A Standard Schema (for example a zod object) for the arguments. */
  parameters?: unknown;
  /** JSON Schema of the structured result. */
  outputSchema?: unknown;
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
    [key: string]: unknown;
  };
  _meta?: Record<string, unknown>;
  /** Hide the tool from a session's tools/list. */
  canList?(session: Session): boolean;
  /** Answer the call before argument validation by returning a result. */
  beforeValidate?(
    args: unknown,
    session: Session
  ): ToolResult | undefined | Promise<ToolResult | undefined>;
  execute(
    args: any,
    context: ToolContext
  ): Promise<ToolResult | string | void>;
}

/** The FastMCP shape of a tool, used inside the core. */
type RegisteredTool = Parameters<FastMCP<SessionData>['addTool']>[0];

/** Registers a tool onto an instance. */
export type ToolRegistrar = { addTool(tool: ToolDefinition): void };

/** The HTTP request `authenticate` receives; absent for stdio. */
export type AuthenticationRequest = {
  headers: IncomingHttpHeaders;
  url?: string;
};

/** The HTTP application routes can be added to (Hono). */
export type HttpApp = Hono;

/** Reported around each tool call; `started` precedes the outcome. */
export type ToolCallEvent = {
  tool: string;
  session: SessionData;
  requestId: string;
} & (
  | { status: 'started' }
  | { status: 'success'; result: unknown; agentHints?: string[] }
  | { status: 'error'; error: unknown; agentHints?: string[] }
);

/** Per-request credential and extra headers for calls to the Firecrawl API. */
export type OutboundRequest = {
  /** Replaces the session's API key as the bearer credential. */
  credential?: string;
  headers?: Record<string, string>;
};

/** OAuth 2.0 protected-resource metadata (RFC 9728) served by the instance. */
export type ProtectedResourceMetadata = {
  authorizationServers: string[];
  bearerMethodsSupported?: string[];
  resource: string;
  resourceName?: string;
  scopesSupported?: string[];
};

export type ExtraToolsContext = {
  /** Firecrawl client for a session, honouring `outboundRequest`. */
  getClient(session?: SessionData): FirecrawlApp;
  /** Whether a session will send a credential to the Firecrawl API. */
  hasCredential(session?: SessionData): boolean;
  /** A built-in tool definition, including one `toolFilter` excluded. */
  builtInTool(name: string): ToolDefinition | undefined;
};

export type InstructionDefaults = {
  /** Instructions for sessions with a credential. */
  authenticated: string;
  /** Instructions for the keyless tool surface. */
  keyless: string;
};

/**
 * Extension points for embedding the server. Unstable: names and signatures
 * may change in any release.
 */
export interface FirecrawlMcpServerHooks {
  /** Replaces credential resolution. Throw a `Response` to reject the request. */
  authenticate?: (
    request: AuthenticationRequest | undefined
  ) => Promise<SessionData>;
  /** Decorates every registered tool, including tools from `registerExtraTools`. */
  wrapTool?: (tool: ToolDefinition) => ToolDefinition;
  /** Observes each tool call. Must not throw. */
  onToolResult?: (event: ToolCallEvent) => void;
  /** Server instructions, or a function choosing them from the defaults. */
  instructions?: string | ((defaults: InstructionDefaults) => string);
  /** Adds tools after the built-in ones. They bypass `toolFilter`. */
  registerExtraTools?: (
    registrar: ToolRegistrar,
    context: ExtraToolsContext
  ) => void;
  /** Credential and headers for each Firecrawl API request of a session. */
  outboundRequest?: (
    session: SessionData | undefined
  ) => OutboundRequest | undefined;
  /** Runs before a keyless request; throw to refuse it. */
  beforeKeylessRequest?: (
    session: SessionData | undefined,
    origin: string
  ) => Promise<void>;
  /** Built-in tools whose name fails the filter are not registered. */
  toolFilter?: (name: string) => boolean;
  /** Adds HTTP routes. Runs before the built-in routes, so its routes win. */
  configureHttp?: (app: HttpApp) => void;
  /** Serve OAuth protected-resource metadata for this instance. */
  oauth?: { protectedResource: ProtectedResourceMetadata };
}

export interface FirecrawlMcpServerOptions {
  /** Firecrawl API base URL. Unset targets the Firecrawl cloud. */
  apiUrl?: string;
  /** Credential used when a request does not carry one. */
  apiKey?: string;
  /** Transport the instance is started with. Defaults to `stdio`. */
  transport?: 'stdio' | 'httpStream';
  /** Write server logs to the console. Defaults to true for HTTP. */
  logging?: boolean;
  /** Restrict browser actions and webhooks, and mark scrape read-only. */
  safeMode?: boolean;
  /** `local` (default) reads files from this machine; `upload` uses a two-phase upload flow. */
  fileAccess?: 'local' | 'upload';
  /** Refuse Firecrawl API calls from sessions without a credential. */
  requireCredential?: boolean;
  /** Register firecrawl_search_feedback. Defaults to true. */
  searchFeedback?: boolean;
  /** Register firecrawl_feedback. Defaults to true. */
  endpointFeedback?: boolean;
  /** Extension hooks. Unstable: may change in any release. */
  unstable_hooks?: FirecrawlMcpServerHooks;
}

export type FirecrawlMcpServerStartArgs =
  | { transportType: 'stdio' }
  | {
      transportType: 'httpStream';
      httpStream: {
        port: number;
        host?: string;
        /** Defaults to FastMCP's endpoint (`FASTMCP_ENDPOINT` or `/mcp`). */
        endpoint?: `/${string}`;
        stateless?: boolean;
      };
    };

export interface FirecrawlMcpServer {
  start(args: FirecrawlMcpServerStartArgs): Promise<void>;
  stop(): Promise<void>;
}

const authResultByRequest = Symbol('firecrawlMcpAuthResult');

type CachedAuthRequest = AuthenticationRequest & {
  [authResultByRequest]?: Promise<SessionData>;
};

/** Placeholder SDK key for sessions whose credential is supplied per request. */
const REQUEST_SCOPED_CREDENTIAL = 'request-scoped-credential';

function headerApiKey(headers: IncomingHttpHeaders): string | undefined {
  const explicit = normalizeHeader(
    headers['x-firecrawl-api-key'] ?? headers['x-api-key']
  );
  if (explicit) return explicit;
  const authorization = normalizeHeader(headers['authorization']);
  if (!authorization?.toLowerCase().startsWith('bearer ')) return undefined;
  return authorization.slice(7).trim() || undefined;
}

/**
 * The session copy a tool call runs with. Property descriptors are copied so
 * non-enumerable state an `authenticate` hook attached survives the copy.
 */
function copySession(session: SessionData | undefined): SessionData {
  return Object.defineProperties(
    {},
    Object.getOwnPropertyDescriptors(session ?? {})
  ) as SessionData;
}

function resultAgentHints(result: unknown): string[] | undefined {
  return result && typeof result === 'object'
    ? readAgentHints((result as { structuredContent?: unknown }).structuredContent)
    : undefined;
}

let warnedMissingAgentHintsInterceptor = false;

class ConsoleLogger implements Logger {
  constructor(private readonly shouldLog: boolean) {}

  debug(...args: unknown[]): void {
    if (this.shouldLog) {
      console.debug('[DEBUG]', new Date().toISOString(), ...args);
    }
  }
  error(...args: unknown[]): void {
    if (this.shouldLog) {
      console.error('[ERROR]', new Date().toISOString(), ...args);
    }
  }
  info(...args: unknown[]): void {
    if (this.shouldLog) {
      console.log('[INFO]', new Date().toISOString(), ...args);
    }
  }
  log(...args: unknown[]): void {
    if (this.shouldLog) {
      console.log('[LOG]', new Date().toISOString(), ...args);
    }
  }
  warn(...args: unknown[]): void {
    if (this.shouldLog) {
      console.warn('[WARN]', new Date().toISOString(), ...args);
    }
  }
}


const FULL_PROFILE_INSTRUCTIONS =
  `Firecrawl provides web search, page retrieval, site URL discovery, multi-page collection, structured page data, monitoring, and multi-source research that returns structured data. Match the requested operation to the tool boundary: firecrawl_scrape retrieves one supplied page and can return JSON matching a supplied schema, firecrawl_map enumerates URLs under a site without retrieving their content, and firecrawl_agent runs multi-source research and returns structured data when the URLs are not known or the answer spans several sites (an entity plus its fields, a list, a dataset); its result is read with firecrawl_agent_status. Authenticated firecrawl_search returns web results together with matching Alexandria providers in data.tools. ${ALEXANDRIA_CATALOGUE_SENTENCE} A matching provider can return the same fields across several entities, provenance, exact figures or timestamps, or a large set of records through firecrawl_scrape with its published contract. If web results already answer the question, use them. For the same fields across multiple pages, firecrawl_find_tools offers free provider discovery. Use firecrawl_find_tools to read a contract that was not returned in full or to browse the catalogue by category. ${ALEXANDRIA_SOURCES_OPT_OUT} If no provider fits, continue with web search or firecrawl_agent. For biomedical, life-science, clinical, or arXiv literature, the firecrawl_research_* tools search a paper index of abstracts and full text; firecrawl_search with categories: ["research"] is a website filter over ordinary web results and reaches different sources. For a programming question (code behaviour, a library or framework, an API contract, an error message, or a known bug), firecrawl_developer_search (or firecrawl_search with categories: ["developer"]) searches an index of public repositories, GitHub issues, merged pull requests, READMEs, and code documentation. For a legal or regulatory question, firecrawl_gov_search searches primary law and regulatory material from US federal, state, and local government sources: statutes, regulations, codes, court opinions, and other government publications; firecrawl_search with categories: ["gov"] reaches the same sources and cannot be combined with other categories. firecrawl_search with sources: [{type: "alexandria"}] returns compact tool summaries in data.tools; toolDetail: "full" includes contracts, firecrawl_find_tools starts with categories, lists providers, then compact tools, and expands the selected full contract, and firecrawl_scrape with alexandria: [{provider, capability, options}] executes up to ten capabilities and returns their results. Alexandria access needs an API key on a team with it enabled. Provide only the required inputs and account for stated network or external side effects.`;
const KEYLESS_PROFILE_INSTRUCTIONS = `Hosted keyless sessions expose firecrawl_search, firecrawl_scrape, and firecrawl_parse with usage limits. firecrawl_search searches the web. For programming questions, firecrawl_search with categories: ["developer"] searches indexed public repositories, GitHub issues, merged pull requests, repository READMEs, and code documentation. For legal or regulatory questions, firecrawl_search with categories: ["gov"] searches US government legal and regulatory sources and cannot be combined with other categories. For biomedical, life-science, clinical, or arXiv literature, firecrawl_search with categories: ["research"] filters ordinary web results to research-affiliated websites. firecrawl_scrape retrieves one supplied page and can return JSON matching a supplied schema. firecrawl_parse processes supported local files through its two-phase upload flow. An Authorization bearer API key can provide higher usage limits and expose additional tools, subject to plan, deployment, and team policy, including firecrawl_map for site URL discovery, firecrawl_agent and firecrawl_agent_status for multi-source research that returns structured data when the URLs are not known, firecrawl_research_* for paper-index and repository research, and firecrawl_find_tools as the progressive Alexandria catalogue lookup alongside the Alexandria options of firecrawl_search and firecrawl_scrape for catalogued data providers.`;

function deprecatedExtractPayload() {
  return {
    code: 'DEPRECATED_TOOL',
    message:
      'firecrawl_extract is deprecated and unavailable through MCP. For structured data from a known page, call firecrawl_scrape once per URL with formats: ["json"] and jsonOptions containing the prompt and schema. When the URLs are not known or the data spans several sites, use firecrawl_agent for multi-source research.',
    replacement: {
      name: 'firecrawl_scrape',
      instructions:
        'Call once per known URL. Set formats to ["json"] and pass the extraction prompt and JSON schema in jsonOptions.',
      example_arguments: {
        url: 'https://example.com/page',
        formats: ['json'],
        jsonOptions: {
          prompt: 'Extract the requested fields from this page.',
          schema: {
            type: 'object',
            properties: {},
          },
        },
      },
    },
    docs_url: 'https://docs.firecrawl.dev/developer-guides/usage-guides/choosing-the-data-extractor',
  };
}

export function createFirecrawlMcpServer(
  options: FirecrawlMcpServerOptions = {}
): FirecrawlMcpServer {
  const hooks = options.unstable_hooks ?? {};
  const config = {
    apiUrl: options.apiUrl,
    apiKey: options.apiKey,
    transport: options.transport ?? 'stdio',
    safeMode: options.safeMode ?? false,
    fileAccess: options.fileAccess ?? 'local',
    requireCredential: options.requireCredential ?? false,
    searchFeedback: options.searchFeedback ?? true,
    endpointFeedback: options.endpointFeedback ?? true,
  };
  const logging = options.logging ?? config.transport === 'httpStream';

  const instructionDefaults: InstructionDefaults = {
    authenticated: FULL_PROFILE_INSTRUCTIONS,
    keyless: KEYLESS_PROFILE_INSTRUCTIONS,
  };
  const instructions =
    typeof hooks.instructions === 'function'
      ? hooks.instructions(instructionDefaults)
      : (hooks.instructions ??
        (config.apiKey
          ? instructionDefaults.authenticated
          : instructionDefaults.keyless));

  async function defaultAuthenticate(
    request: AuthenticationRequest | undefined
  ): Promise<SessionData> {
    // Header credentials apply only to Firecrawl API keys; anything else is
    // ignored in favour of the configured credential.
    const supplied = request?.headers ? headerApiKey(request.headers) : undefined;
    const headerCredential = supplied?.startsWith('fc-') ? supplied : undefined;
    const credential = headerCredential ?? config.apiKey;
    if (config.transport === 'httpStream' && !credential && !config.apiUrl) {
      throw new Error(
        'HTTP MCP transport requires an API URL or a Firecrawl API key'
      );
    }
    return {
      authType: headerCredential ? 'api-key' : credential ? 'env' : 'none',
      firecrawlApiKey: credential,
    };
  }

  const authenticateSession = hooks.authenticate ?? defaultAuthenticate;

  // FastMCP may authenticate one HTTP request more than once; resolve it once.
  function authenticate(request?: CachedAuthRequest): Promise<SessionData> {
    const cached = request?.[authResultByRequest];
    if (cached) return cached;
    const authResult = authenticateSession(request).then((session) => {
      const userAgent = request?.headers?.['user-agent'];
      if (typeof userAgent === 'string' && userAgent !== '') {
        session.clientUserAgent = userAgent;
      }
      return session;
    });
    if (request) request[authResultByRequest] = authResult;
    return authResult;
  }

  const server = new FastMCP<SessionData>({
    name: 'firecrawl-fastmcp',
    version: packageVersion as `${number}.${number}.${number}`,
    instructions,
    logger: new ConsoleLogger(logging),
    roots: { enabled: false },
    ...(hooks.oauth
      ? { oauth: { enabled: true, protectedResource: hooks.oauth.protectedResource } }
      : {}),
    authenticate,
    // Lightweight health endpoint for LB checks
    health: {
      enabled: true,
      message: 'ok',
      path: '/health',
      status: 200,
    },
  });

  hooks.configureHttp?.(server.getApp());

  function resolveOutbound(session?: SessionData): {
    credential?: string;
    headers: Record<string, string>;
  } {
    const outbound = hooks.outboundRequest?.(session);
    return {
      credential: outbound?.credential ?? session?.firecrawlApiKey,
      headers: outbound?.headers ?? {},
    };
  }

  function hasCredential(session?: SessionData): boolean {
    return Boolean(
      session?.firecrawlApiKey || hooks.outboundRequest?.(session)?.credential
    );
  }

  function assertExchangeCredential(session?: SessionData): void {
    assertExchangeCredentialPresent(hasCredential(session));
  }

  // A stdio client without a cloud credential can use only the keyless tools.
  // Do this at registration time so unsupported feedback tools are not
  // advertised. Credentials an authenticate or outboundRequest hook supplies
  // are only known per session, so those instances register the feedback
  // tools and hide them from keyless sessions instead.
  function isLocalKeylessStartup(): boolean {
    return (
      config.transport !== 'httpStream' &&
      !config.apiKey &&
      !normalizeHeader(config.apiUrl) &&
      !hooks.authenticate &&
      !hooks.outboundRequest
    );
  }

  /**
   * Every tool runs inside this pipeline: a per-call session copy carrying a
   * request ID, then `wrapTool`'s decoration, then call reporting and
   * credential recovery around the tool itself.
   */
  function prepareTool(tool: RegisteredTool): RegisteredTool {
    const execute = tool.execute;
    const instrumented: RegisteredTool = {
      ...tool,
      execute: async (args, context) => {
        const session = context.session as SessionData;
        const requestId = session.requestId as string;
        const call = { tool: tool.name, session, requestId };
        hooks.onToolResult?.({ ...call, status: 'started' });
        try {
          const result = await runWithCredentialRecovery(
            () => execute(args, context),
            requestId,
            session
          );
          hooks.onToolResult?.({
            ...call,
            status: 'success',
            result,
            agentHints: resultAgentHints(result),
          });
          return result;
        } catch (error) {
          hooks.onToolResult?.({
            ...call,
            status: 'error',
            error,
            agentHints: readErrorAgentHints(error),
          });
          throw error;
        }
      },
    };
    const wrapped = hooks.wrapTool
      ? (hooks.wrapTool(instrumented as unknown as ToolDefinition) as unknown as RegisteredTool)
      : instrumented;
    return {
      ...wrapped,
      execute: (args, context) => {
        const session = copySession(context.session);
        session.requestId = randomUUID();
        return wrapped.execute(args, { ...context, session });
      },
    };
  }

  const builtInTools = new Map<string, RegisteredTool>();
  const addTool = server.addTool.bind(server);
  server.addTool = ((tool: RegisteredTool) => {
    builtInTools.set(tool.name, tool);
    if (hooks.toolFilter && !hooks.toolFilter(tool.name)) return;
    addTool(prepareTool(tool));
  }) as typeof server.addTool;

  function createClient(apiKey?: string): FirecrawlApp {
    const clientConfig: any = {
      ...(config.apiUrl && {
        apiUrl: config.apiUrl,
      }),
    };

    // Only add apiKey if it's provided (required for cloud, optional for self-hosted)
    if (apiKey) {
      clientConfig.apiKey = apiKey;
    }

    const client = new FirecrawlApp(clientConfig);
    const axiosInstance = (client as any).http?.instance;
    if (axiosInstance?.interceptors?.request?.use) {
      axiosInstance.interceptors.request.use((request: any) => {
        if (typeof request.headers?.set === 'function') {
          request.headers.set('X-Firecrawl-Agent-Hints', 'true');
        } else {
          request.headers = { ...(request.headers ?? {}), ...AGENT_HINTS_HEADERS };
        }
        return request;
      });
    } else if (!warnedMissingAgentHintsInterceptor) {
      warnedMissingAgentHintsInterceptor = true;
      console.warn(
        '[firecrawl-mcp] SDK request interceptor unavailable; API agent hints may be absent.'
      );
    }
    return client;
  }

  /** Keep SDK validation, retries, and result shaping while retaining response metadata. */
  async function sdkResultWithAgentHints<T>(
    client: FirecrawlApp,
    execute: () => Promise<T>
  ): Promise<T> {
    const responseInterceptors = (client as any).http?.instance?.interceptors
      ?.response;
    if (!responseInterceptors?.use) return execute();
    let hints: string[] | undefined;
    const interceptor = responseInterceptors.use((response: any) => {
      hints = readAgentHints(response?.data) ?? hints;
      return response;
    });
    try {
      const result = await execute();
      return preserveAgentHints(result, { agent_hints: hints }) as T;
    } catch (error) {
      if (
        hints &&
        error &&
        typeof error === 'object' &&
        !readErrorAgentHints(error)
      ) {
        (error as { agent_hints?: string[] }).agent_hints = hints;
      }
      throw error;
    } finally {
      responseInterceptors.eject?.(interceptor);
    }
  }

  // Safe mode restricts browser actions and webhooks for deployments that
  // must not drive interactive page changes.
  const SAFE_MODE = config.safeMode;

  function getClient(session?: SessionData): FirecrawlApp {
    if (config.requireCredential && !hasCredential(session)) {
      throw new Error('Unauthorized');
    }
    if (!config.apiUrl && !hasCredential(session)) {
      throw new Error(
        'Unauthorized: API key is required when not using a self-hosted instance'
      );
    }
    const outboundRequest = hooks.outboundRequest;
    if (!outboundRequest) {
      return markCredentialRejections(
        createClient(session?.firecrawlApiKey),
        session
      );
    }

    // The hook may mint a short-lived credential, so it runs on every request
    // the client makes rather than once here.
    const perRequestCredential = Boolean(outboundRequest(session)?.credential);
    const client = createClient(
      session?.firecrawlApiKey ??
        (perRequestCredential ? REQUEST_SCOPED_CREDENTIAL : undefined)
    );
    const axiosInstance = (client as any).http?.instance;
    if (!axiosInstance?.interceptors?.request?.use) {
      if (perRequestCredential) {
        throw new Error(
          'Firecrawl client cannot apply a per-request credential'
        );
      }
      return client;
    }
    axiosInstance.interceptors.request.use((request: any) => {
      const outbound = outboundRequest(session);
      const headers: Record<string, string> = {
        ...(outbound?.headers ?? {}),
        ...(outbound?.credential
          ? { Authorization: `Bearer ${outbound.credential}` }
          : {}),
      };
      for (const [name, value] of Object.entries(headers)) {
        if (typeof request.headers?.set === 'function') {
          request.headers.set(name, value);
        } else {
          request.headers = { ...(request.headers ?? {}), [name]: value };
        }
      }
      return request;
    });
    return markCredentialRejections(client, session);
  }

  /** Records on the call's session that Core answered 401 to this client. */
  function markCredentialRejections(
    client: FirecrawlApp,
    session: SessionData | undefined
  ): FirecrawlApp {
    const responses = (client as any).http?.instance?.interceptors?.response;
    if (!session || !responses?.use) return client;
    responses.use(
      (response: unknown) => response,
      (error: { response?: { status?: unknown } } | undefined) => {
        if (error?.response?.status === 401) {
          (session as Record<symbol, unknown>)[FIRECRAWL_CREDENTIAL_REJECTED] =
            true;
        }
        return Promise.reject(error);
      }
    );
    return client;
  }

  function asText(data: unknown): string {
    return JSON.stringify(data, null, 2);
  }

  // scrape tool (v2 semantics, minimal args)
  // Centralized scrape params (used by scrape, and referenced in search/crawl scrapeOptions)

  // Define safe action types
  const safeActionTypes = ['wait', 'screenshot', 'scroll', 'scrape'] as const;
  const otherActions = [
    'click',
    'write',
    'press',
    'executeJavascript',
    'generatePDF',
  ] as const;
  const allActionTypes = [...safeActionTypes, ...otherActions] as const;

  // Use appropriate action types based on safe mode
  const allowedActionTypes = SAFE_MODE ? safeActionTypes : allActionTypes;

  function buildFormatsArray(
    args: Record<string, unknown>
  ): Record<string, unknown>[] | undefined {
    const formats = args.formats as string[] | undefined;
    if (!formats || formats.length === 0) return undefined;

    const result: Record<string, unknown>[] = [];
    for (const fmt of formats) {
      if (fmt === 'json') {
        const jsonOpts = args.jsonOptions as Record<string, unknown> | undefined;
        result.push({ type: 'json', ...jsonOpts });
      } else if (fmt === 'query') {
        const queryOpts = args.queryOptions as
          Record<string, unknown> | undefined;
        result.push({ type: 'query', ...queryOpts });
      } else if (fmt === 'screenshot' && args.screenshotOptions) {
        const ssOpts = args.screenshotOptions as Record<string, unknown>;
        result.push({ type: 'screenshot', ...ssOpts });
      } else {
        result.push(fmt as unknown as Record<string, unknown>);
      }
    }
    return result;
  }

  function buildParsersArray(
    args: Record<string, unknown>
  ): Record<string, unknown>[] | undefined {
    const parsers = args.parsers as string[] | undefined;
    if (!parsers || parsers.length === 0) return undefined;

    const result: Record<string, unknown>[] = [];
    for (const p of parsers) {
      if (p === 'pdf' && args.pdfOptions) {
        const pdfOpts = args.pdfOptions as Record<string, unknown>;
        result.push({ type: 'pdf', ...pdfOpts });
      } else {
        result.push(p as unknown as Record<string, unknown>);
      }
    }
    return result;
  }

  function buildWebhook(
    args: Record<string, unknown>
  ): string | Record<string, unknown> | undefined {
    const webhook = args.webhook as string | undefined;
    if (!webhook) return undefined;
    const headers = args.webhookHeaders as Record<string, string> | undefined;
    if (headers && Object.keys(headers).length > 0) {
      return { url: webhook, headers };
    }
    return webhook;
  }

  function transformScrapeParams(
    args: Record<string, unknown>
  ): Record<string, unknown> {
    const out = { ...args };

    const formats = buildFormatsArray(out);
    if (formats) out.formats = formats;

    const parsers = buildParsersArray(out);
    if (parsers) out.parsers = parsers;

    delete out.jsonOptions;
    delete out.queryOptions;
    delete out.screenshotOptions;
    delete out.pdfOptions;

    return out;
  }

  const scrapeParamsSchema = z.object({
    url: z.string().url(),
    formats: z
      .array(
        z.enum([
          'markdown',
          'html',
          'rawHtml',
          'screenshot',
          'links',
          'summary',
          'changeTracking',
          'branding',
          'json',
          'query',
          'audio',
        ])
      )
      .optional(),
    jsonOptions: z
      .object({
        prompt: z.string().optional(),
        schema: z.record(z.string(), z.any()).optional(),
      })
      .optional(),
    queryOptions: z
      .object({
        prompt: z.string().max(10000),
        mode: z.enum(['directQuote', 'freeform']).default('freeform'),
      })
      .optional(),
    screenshotOptions: z
      .object({
        fullPage: z.boolean().optional(),
        quality: z.number().optional(),
        viewport: z.object({ width: z.number(), height: z.number() }).optional(),
      })
      .optional(),
    parsers: z.array(z.enum(['pdf'])).optional(),
    pdfOptions: z
      .object({
        maxPages: z.number().int().min(1).max(10000).optional(),
      })
      .optional(),
    onlyMainContent: z.boolean().optional(),
    redactPII: z.boolean().optional(),
    includeTags: z.array(z.string()).optional(),
    excludeTags: z.array(z.string()).optional(),
    waitFor: z.number().optional(),
    ...(SAFE_MODE
      ? {}
      : {
          actions: z
            .array(
              z.object({
                type: z.enum(allowedActionTypes),
                selector: z.string().optional(),
                milliseconds: z.number().optional(),
                text: z.string().optional(),
                key: z.string().optional(),
                direction: z.enum(['up', 'down']).optional(),
                script: z.string().optional(),
                fullPage: z.boolean().optional(),
              })
            )
            .optional(),
        }),
    mobile: z.boolean().optional(),
    skipTlsVerification: z.boolean().optional(),
    removeBase64Images: z.boolean().optional(),
    location: z
      .object({
        country: z.string().optional(),
        languages: z.array(z.string()).optional(),
      })
      .optional(),
    storeInCache: z.boolean().optional(),
    zeroDataRetention: z.boolean().optional(),
    maxAge: z.number().optional(),
    lockdown: z.boolean().optional(),
    proxy: z.enum(['basic', 'stealth', 'enhanced', 'auto']).optional(),
    profile: z
      .object({
        name: z.string(),
        saveChanges: z.boolean().optional(),
      })
      .optional(),
  });

  // In safe mode firecrawl_scrape and firecrawl_search are read-only, so a named
  // profile they open loads saved browser state without writing it back. The API
  // saves profile changes unless told otherwise, so saveChanges: false is sent
  // explicitly. firecrawl_interact (url with scrapeOptions.profile) saves them.
  const readOnlyProfileSchema = z
    .object({ name: z.string() })
    .describe('Loads a saved browser profile without saving changes to it.');

  function withReadOnlyProfile(
    options: Record<string, unknown>
  ): Record<string, unknown> {
    const profile = options.profile as { name: string } | undefined;
    return SAFE_MODE && profile
      ? { ...options, profile: { name: profile.name, saveChanges: false } }
      : options;
  }

  // firecrawl_scrape accepts either a page URL or an Exchange batch. The base
  // schema stays url-required because search, crawl, and monitor reuse it for
  // nested scrapeOptions, where `alexandria` has no meaning.
  const ALEXANDRIA_IGNORED_SCRAPE_OPTIONS = new Set(['toolDetail', 'domainTools']);

  const scrapeToolParamsSchema = scrapeParamsSchema
    .extend({
      ...(SAFE_MODE ? { profile: readOnlyProfileSchema.optional() } : {}),
      url: z.string().url().optional(),
      timeout: z.number().int().positive().optional().describe("Execution timeout in milliseconds."),
      requestId: z
        .string()
        .regex(/^[A-Za-z0-9._:-]{1,128}$/)
        .optional()
        .describe(
          'Idempotency key bound to one Alexandria execution payload. Generated when omitted and returned with the result.'
        ),
      alexandria: z.union([exchangeCallSchema, exchangeCallsSchema])
        .optional()
        .describe(
          'Catalogued Alexandria capability invocation, mutually exclusive with url. One {provider, capability, options} object or an array of 1-10, with contracts available through firecrawl_search or firecrawl_find_tools. Each call may include version to pin a published workflow; omitting it uses latest. Only requestId and timeout are supported alongside alexandria. ' +
            ALEXANDRIA_CONTRACT_GUIDANCE +
            ' Returns per-capability results in data.alexandria with data, records, or an error with a code; individual capabilities can fail even when the outer response succeeds. Requires an API key on a team with Alexandria enabled. Some providers require accepted terms; blocked requests return the applicable requirements.'
        ),
      toolDetail: z.enum(['compact', 'summary', 'full']).optional().describe('URL mode only: domain discovery detail, summary by default; compact returns provider/capability/description, full includes contracts. Ignored with alexandria.'),
      domainTools: z
        .boolean()
        .optional()
        .describe(
          'URL mode only: include domain-matched Alexandria tools for the page in tools on the returned document. Ignored with alexandria.'
        ),
    })
    .refine(
      (args) => Boolean(args.url) !== Boolean(args.alexandria),
      'Provide exactly one of url or alexandria'
    )
    .refine(
      (args) =>
        !args.alexandria ||
        Object.entries(args).every(
          ([key, value]) =>
            key === 'alexandria' ||
            key === 'requestId' ||
            key === 'timeout' ||
            // URL-mode discovery options that mean nothing when executing a
            // provider. Agents carry toolDetail over from firecrawl_search (where
            // it selects contract detail), so accept and ignore them rather than
            // failing the call: Codex sent toolDetail on 18 of 315 Alexandria
            // executions across the AX EXP-058 runs, each one a wasted round trip.
            ALEXANDRIA_IGNORED_SCRAPE_OPTIONS.has(key) ||
            value === undefined
        ),
      'alexandria cannot be combined with url or other scrape options'
    )
    .refine(
      (args) => !args.requestId || !!args.alexandria,
      'requestId applies to Alexandria execution only'
    );

  const parseOptionParamsSchema = z.object({
    formats: z
      .array(
        z.enum([
          'markdown',
          'html',
          'rawHtml',
          'links',
          'summary',
          'json',
          'query',
        ])
      )
      .optional(),
    jsonOptions: z
      .object({
        prompt: z.string().optional(),
        schema: z.record(z.string(), z.any()).optional(),
      })
      .optional(),
    queryOptions: z
      .object({
        prompt: z.string().max(10000),
        mode: z.enum(['directQuote', 'freeform']).default('freeform'),
      })
      .optional(),
    parsers: z.array(z.enum(['pdf'])).optional(),
    pdfOptions: z
      .object({
        maxPages: z.number().int().min(1).max(10000).optional(),
      })
      .optional(),
    onlyMainContent: z.boolean().optional(),
    redactPII: z.boolean().optional(),
    includeTags: z.array(z.string()).optional(),
    excludeTags: z.array(z.string()).optional(),
    removeBase64Images: z.boolean().optional(),
    skipTlsVerification: z.boolean().optional(),
    storeInCache: z.boolean().optional(),
    zeroDataRetention: z.boolean().optional(),
    maxAge: z
      .number()
      .optional()
      .describe('Ignored: parse never reuses or stores indexed content.'),
    proxy: z.enum(['basic', 'auto']).optional(),
  });

  const localParseParamsSchema = parseOptionParamsSchema.extend({
    filePath: z
      .string()
      .min(1)
      .describe(
        'Absolute or relative path to a local file to parse. Supported: .html, .htm, .pdf, .docx, .doc, .odt, .rtf, .xlsx, .xls'
      ),
    contentType: z
      .string()
      .optional()
      .describe(
        'Optional MIME type override. If omitted, the server infers the file kind from the extension.'
      ),
  });

  const hostedParseParamsSchema = parseOptionParamsSchema
    .extend({
      filePath: z
        .string()
        .min(1)
        .optional()
        .describe(
          'Phase 1 only: path to the local file on the caller/harness machine. Hosted MCP will not read or stat this path; it is used only to produce upload instructions.'
        ),
      uploadRef: z
        .string()
        .min(1)
        .optional()
        .describe(
          'Phase 2 only: short-lived upload reference returned by phase 1 after the local PUT upload completes.'
        ),
      contentType: z
        .string()
        .optional()
        .describe(
          'Phase 1 MIME type override. If omitted, the server infers it from the file extension without reading the file.'
        ),
      declaredSizeBytes: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          'Optional phase 1 size declaration. Hosted MCP does not stat the file; provide this only if the caller already knows it.'
        ),
    })
    .superRefine((value, ctx) => {
      const hasFilePath =
        typeof value.filePath === 'string' && value.filePath.length > 0;
      const hasUploadRef =
        typeof value.uploadRef === 'string' && value.uploadRef.length > 0;
      if (hasFilePath === hasUploadRef) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Hosted firecrawl_parse requires exactly one of filePath (phase 1) or uploadRef (phase 2).',
          path: hasFilePath && hasUploadRef ? ['uploadRef'] : ['filePath'],
        });
      }
    });

  const parseParamsSchema =
    config.fileAccess === 'upload'
      ? hostedParseParamsSchema
      : localParseParamsSchema;

  const EXTENSION_CONTENT_TYPES: Record<string, string> = {
    '.html': 'text/html',
    '.htm': 'text/html',
    '.xhtml': 'application/xhtml+xml',
    '.pdf': 'application/pdf',
    '.docx':
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.odt': 'application/vnd.oasis.opendocument.text',
    '.rtf': 'application/rtf',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
  };

  function inferContentType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    return EXTENSION_CONTENT_TYPES[ext] ?? 'application/octet-stream';
  }

  type ParseToolArgs = {
    filePath?: string;
    uploadRef?: string;
    contentType?: string;
    declaredSizeBytes?: number;
  } & Record<string, unknown>;

  function extractParseOptions(args: ParseToolArgs): Record<string, unknown> {
    const options = { ...args };
    delete options.filePath;
    delete options.uploadRef;
    delete options.contentType;
    delete options.declaredSizeBytes;
    return options;
  }

  function buildParseOptionsPayload(
    options: Record<string, unknown>,
    origin: string
  ): Record<string, unknown> {
    const transformed = transformScrapeParams(options);
    const cleaned = removeEmptyTopLevel(transformed) as Record<string, unknown>;
    return { origin, ...cleaned };
  }

  function buildContinuationArguments(
    uploadRef: string,
    options: Record<string, unknown>
  ): Record<string, unknown> {
    return {
      uploadRef,
      ...(removeEmptyTopLevel(options) as Record<string, unknown>),
    };
  }

  function shellQuote(value: string): string {
    if (value.length === 0) return "''";
    return "'" + value.replace(/'/g, "'\\''") + "'";
  }

  type ParseUploadUrlData = {
    uploadUrl: string;
    uploadRef: string;
    method?: string;
    headers?: Record<string, string>;
    fields?: Record<string, string>;
    expiresAt?: string;
    maxSizeBytes?: number;
  };

  function parseApiData(json: any): any {
    return json && typeof json === 'object' && 'data' in json ? json.data : json;
  }

  async function apiPostJson(
    pathName: string,
    body: Record<string, unknown>,
    apiKey: string,
    origin?: string,
    extraHeaders: Record<string, string> = {}
  ): Promise<any> {
    const response = await fetch(`${resolveApiBaseUrl()}${pathName}`, {
      method: 'POST',
      headers: {
        ...AGENT_HINTS_HEADERS,
        'Content-Type': 'application/json',
        ...extraHeaders,
        Authorization: `Bearer ${apiKey}`,
        ...(origin ? originHeaders(origin) : {}),
      },
      body: JSON.stringify(body),
    });
    const responseText = await response.text();
    let parsed: any;
    try {
      parsed = responseText ? JSON.parse(responseText) : {};
    } catch {
      parsed = { raw: responseText };
    }
    if (!response.ok) {
      throw new CoreHttpError(
        parsed?.error ||
          parsed?.message ||
          `Firecrawl request failed (HTTP ${response.status})`,
        response.status,
        readAgentHints(parsed)
      );
    }
    return parsed;
  }

  async function apiPostJsonForSession(
    pathName: string,
    body: Record<string, unknown>,
    session: SessionData | undefined,
    origin: string
  ): Promise<any> {
    const { credential, headers } = resolveOutbound(session);
    if (credential) {
      return apiPostJson(pathName, body, credential, origin, headers);
    }

    if (isKeylessMode(session)) {
      return keylessPost(pathName, body, session, origin);
    }

    throw new Error(
      'Firecrawl credentials or keyless eligibility required for hosted parse.'
    );
  }

  function buildCurlUploadCommand(
    filePath: string,
    upload: ParseUploadUrlData
  ): string {
    const method = upload.method ?? 'PUT';
    const headerArgs = Object.entries(upload.headers ?? {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `-H ${shellQuote(`${key}: ${value}`)}`);

    if (method.toUpperCase() === 'POST' && upload.fields) {
      const fieldArgs = Object.entries(upload.fields)
        .sort(([a], [b]) => a.localeCompare(b))
        .flatMap(([key, value]) => ['-F', shellQuote(`${key}=${value}`)]);
      return [
        'curl',
        '-X',
        shellQuote('POST'),
        ...headerArgs,
        ...fieldArgs,
        '-F',
        shellQuote(`file=@${filePath}`),
        shellQuote(upload.uploadUrl),
      ].join(' ');
    }

    return [
      'curl',
      '-X',
      shellQuote(method),
      ...headerArgs,
      '--upload-file',
      shellQuote(filePath),
      shellQuote(upload.uploadUrl),
    ].join(' ');
  }

  async function executeHostedParse(
    args: ParseToolArgs,
    session: SessionData | undefined,
    log: ToolLogger,
    origin: string
  ): Promise<string> {
    const hasFilePath =
      typeof args.filePath === 'string' && args.filePath.length > 0;
    const hasUploadRef =
      typeof args.uploadRef === 'string' && args.uploadRef.length > 0;
    if (hasFilePath === hasUploadRef) {
      throw new Error(
        'Hosted firecrawl_parse requires exactly one of filePath or uploadRef.'
      );
    }

    if (!hasCredential(session) && !isKeylessMode(session)) {
      return asText({
        success: false,
        mode: 'hosted-upload-ref-auth-required',
        message:
          'Hosted firecrawl_parse requires an authenticated Firecrawl session or keyless eligibility before a local file upload URL can be minted. Connect a Firecrawl account, provide an API key, or use keyless hosted MCP while eligible, then call firecrawl_parse again.',
      });
    }

    if (
      session?.authType === 'keyless' &&
      !session.firecrawlApiKey &&
      args.zeroDataRetention === true
    ) {
      const payload = {
        ...recoveryPayload('KEYLESS_OPTION_NOT_AVAILABLE', session?.requestId),
        option: 'zeroDataRetention',
        message:
          'Zero Data Retention is not available in anonymous keyless mode. Omit zeroDataRetention to parse with keyless access, or configure an API key for a team where Zero Data Retention is enabled, then retry.',
      };
      throw new UserError(String(payload.message), payload);
    }

    const options = extractParseOptions(args);

    if (hasFilePath && args.filePath) {
      const filename = path.basename(args.filePath);
      const contentType =
        typeof args.contentType === 'string' && args.contentType.length > 0
          ? args.contentType
          : inferContentType(filename);
      const uploadRequest = removeEmptyTopLevel({
        filename,
        contentType,
        declaredSizeBytes: args.declaredSizeBytes,
      }) as Record<string, unknown>;

      log.info('Creating hosted parse upload URL', { filename, contentType });
      const uploadJson = await apiPostJsonForSession(
        '/v2/parse/upload-url',
        uploadRequest,
        session,
        origin
      );
      const uploadHints = readAgentHints(uploadJson);
      const upload = parseApiData(uploadJson) as ParseUploadUrlData;
      if (!upload?.uploadUrl || !upload?.uploadRef) {
        throw new Error(
          'Firecrawl upload-url response did not include uploadUrl and uploadRef'
        );
      }
      const uploadHeaders =
        upload.headers && Object.keys(upload.headers).length > 0
          ? upload.headers
          : (upload.method ?? 'PUT').toUpperCase() === 'POST'
            ? {}
            : { 'Content-Type': contentType };
      const uploadForCommand = { ...upload, headers: uploadHeaders };

      return asText({
        success: true,
        ...(uploadHints ? { agent_hints: uploadHints } : {}),
        mode: 'hosted-upload-ref-awaiting-upload',
        message:
          'Hosted MCP cannot read local files. Run the local upload command, then call firecrawl_parse again with uploadRef. No Firecrawl API key is included in this command.',
        upload: {
          command: buildCurlUploadCommand(args.filePath, uploadForCommand),
          method: upload.method ?? 'PUT',
          headers: uploadHeaders,
          fields: upload.fields,
          uploadUrl: upload.uploadUrl,
          uploadRef: upload.uploadRef,
          expiresAt: upload.expiresAt,
          maxSizeBytes: upload.maxSizeBytes,
        },
        nextToolCall: {
          name: 'firecrawl_parse',
          arguments: buildContinuationArguments(upload.uploadRef, options),
        },
        notes: [
          'Run the curl command on the machine that can read filePath.',
          'After the PUT succeeds, use nextToolCall as the second MCP tool call.',
          'Clients without a local upload mechanism cannot complete hosted parse for local files.',
        ],
      });
    }

    const parsePayload = {
      uploadRef: args.uploadRef as string,
      ...buildParseOptionsPayload(options, origin),
    };
    log.info('Parsing hosted upload reference');
    const parseJson = await apiPostJsonForSession(
      '/v2/parse',
      parsePayload,
      session,
      origin
    );
    return asText(parseJson);
  }

  const scrapeTool: RegisteredTool = {
    name: 'firecrawl_scrape',
    annotations: {
      title: 'Firecrawl scrape',
      // Hosted scrape omits browser actions, loads profiles without saving,
      // and refuses provider terms writes before execution.
      readOnlyHint: SAFE_MODE,
      openWorldHint: true, // Accepts any user-supplied URL on the public web.
      destructiveHint: false, // Does not modify, delete, or write to external websites.
    },
    description: `
Scrape one URL and return its content: markdown by default, or HTML, links, screenshots, branding data, a targeted answer, or JSON matching a supplied schema. Use it when the request identifies a page and needs its content or defined fields. Use \`firecrawl_search\` when additional web sources are needed; on an authenticated session, \`firecrawl_map\` lists a site's URLs and \`firecrawl_crawl\` collects a set of pages.

Firecrawl may serve recently indexed content; set \`maxAge: 0\` for a live fetch or a smaller \`maxAge\` to bound staleness. A successful response does not by itself confirm the page is still current. ${SAFE_MODE ? 'A named browser profile loads saved session data without saving changes to it.' : 'Browser actions can change the live page when interactive actions are enabled.'} Authenticated responses can include a \`metadata.scrapeId\` for optional scrape feedback.

On an authenticated session with Alexandria access, \`firecrawl_search\` with \`sources\` unset and \`firecrawl_find_tools\` can discover providers for the same fields across several pages; a matching provider returns typed records in one call. Keyless sessions have no provider matches.

Alexandria mode, on an authenticated session with Alexandria access: \`alexandria\` selects catalogued capability execution and is mutually exclusive with \`url\`.
`,
    outputSchema: scrapeOutputSchema,
    parameters: scrapeToolParamsSchema,
    execute: async (args: unknown, { session, log, client: mcpClient }): Promise<ContentResult> => {
      const origin = requestOrigin(mcpClient, session);
      const {
        url,
        alexandria,
        requestId: suppliedRequestId,
        ...options
      } = args as {
        requestId?: string;
        url?: string;
        alexandria?: z.infer<typeof exchangeCallSchema> | z.infer<typeof exchangeCallsSchema>;
      } & Record<string, unknown>;
      if (alexandria) {
        assertExchangeCredential(session);
        if ((Array.isArray(alexandria) ? alexandria : [alexandria]).some(isTermsWrite)) {
          throw termsWriteError();
        }
        log.info('Executing Alexandria capabilities', {
          count: Array.isArray(alexandria) ? alexandria.length : 1,
        });
        return structuredJsonText(
          await executeExchangeCalls(session, alexandria, suppliedRequestId, options.timeout as number | undefined, origin)
        );
      }
      const transformed = transformScrapeParams(
        options as Record<string, unknown>
      );
      const cleaned = withReadOnlyProfile(removeEmptyTopLevel(transformed));
      if (cleaned.lockdown) {
        log.info('Scraping URL (lockdown)');
      } else {
        log.info('Scraping URL', { url: String(url) });
      }
      if (isKeylessMode(session)) {
        const json = await keylessPost(
          '/v2/scrape',
          {
            url: String(url),
            ...cleaned,
            origin,
          },
          session
        );
        return structuredText(preserveAgentHints(json?.data ?? json, json));
      }
      const client = getClient(session);
      const res = await relayTermsRequired(
        () =>
          sdkResultWithAgentHints(client, () =>
            client.scrape(String(url), {
              ...cleaned,
              origin,
            } as any)
          ),
        { tool: 'firecrawl_scrape' }
      );
      return structuredText(res);
    },
  };
  server.addTool({
    ...scrapeTool,
    _meta: { 'anthropic/alwaysLoad': true },
  });

  server.addTool({
    name: 'firecrawl_map',
    annotations: {
      title: 'Firecrawl website map',
      readOnlyHint: true, // Discovers and returns indexed URLs; does not modify the target site.
      openWorldHint: true, // Operates against arbitrary user-supplied web domains.
      destructiveHint: false, // Read-only discovery; no deletion or destructive updates.
    },
    description: `
Enumerate URLs indexed under one website through Firecrawl without fetching each page's content. Use this when the request asks for a site's URL inventory, when several relevant pages must be located, or when the desired page URL is unknown. An optional \`search\` term narrows the URL list, while sitemap, subdomain, query-parameter, and result-limit options control coverage.

Returns matching URLs rather than page bodies. Retrieve one page with \`firecrawl_scrape\`; collect content across multiple pages with \`firecrawl_crawl\`. Authenticated responses can include an \`id\` for optional map feedback.
`,
    outputSchema: mapOutputSchema,
    parameters: z.object({
      url: z.string().url(),
      search: z.string().optional(),
      sitemap: z.enum(['include', 'skip', 'only']).optional(),
      includeSubdomains: z.boolean().optional(),
      limit: z.number().optional(),
      ignoreQueryParameters: z.boolean().optional(),
    }),
    execute: async (
      args: unknown,
      { session, log, client: mcpClient }
    ): Promise<ContentResult> => {
      const { url, ...options } = args as { url: string } & Record<
        string,
        unknown
      >;
      const client = getClient(session);
      const cleaned = removeEmptyTopLevel(options as Record<string, unknown>);
      log.info('Mapping URL', { url: String(url) });
      const res = await sdkResultWithAgentHints(client, () =>
        client.map(String(url), {
          ...cleaned,
          origin: requestOrigin(mcpClient, session),
        } as any)
      );
      return structuredText(res);
    },
  });

  server.addTool({
    name: 'firecrawl_search',
    _meta: { 'anthropic/alwaysLoad': true },
    annotations: {
      title: 'Firecrawl web search',
      readOnlyHint: true, // Runs a web search and returns results; does not modify external sites.
      openWorldHint: true, // Searches the open web across arbitrary domains and sources.
      destructiveHint: false, // Query-only; no destructive side effects on external entities.
    },
    description: `
Search web, news, or image sources and return ranked results with query-relevant highlights. Each web result is a title, URL, and description; use \`firecrawl_scrape\` on a result URL when the excerpt is not enough.

${ALEXANDRIA_SEARCH_LEAD}

On an authenticated session, tool matches describe available capabilities; \`firecrawl_find_tools\` returns their contracts and \`firecrawl_scrape\` with an \`alexandria\` body executes a selected capability. Keyless sessions get no Alexandria matches in data.tools.

For a programming question, add \`categories: ["developer"]\`; its hits return in \`data.web\` with \`category: "developer"\`. For a legal or regulatory question, \`categories: ["gov"]\` returns hits in \`data.web\` with \`category: "gov"\` and cannot be combined with other categories; authenticated sessions also have \`firecrawl_gov_search\` as the dedicated tool. Verify gov results' issuer, jurisdiction, status, and version before citing current law. \`categories: ["research"]\` restricts web results to research-affiliated websites; the \`firecrawl_research_*\` tools are a separate surface over paper abstracts and full text (PubMed, bioRxiv, medRxiv, arXiv). Query operators, domain filters, \`categories\`, \`toolDetail\` and \`scrapeOptions\` are described on their parameters. Returns source-type result groups and usage metadata. Authenticated responses can include an \`id\` for optional search feedback.
`,
    outputSchema: searchOutputSchema,
    parameters: z
      .object({
        ...searchToolBaseFields,
        scrapeOptions: scrapeParamsSchema
          .omit({ url: true })
          .extend(SAFE_MODE ? { profile: readOnlyProfileSchema } : {})
          .partial()
          .optional()
          .describe('Attach page content for web results in the same call. These fetches ignore maxAge, so use firecrawl_scrape when you need a live fetch. scrapeOptions fetches web pages, never Alexandria provider tools.'),
      })
      .refine(searchDomainsAreExclusive, SEARCH_DOMAINS_CONFLICT_MESSAGE)
      .refine(
        searchQueryIsValid,
        'A query is required. Use Find Tools for catalogue lookup.'
      ),
    execute: async (args: unknown, { session, log, client: mcpClient }): Promise<ContentResult> => {
      const { query, ...opts } = args as Record<string, unknown>;

      const searchOpts = {
        ...opts,
        sources: normalizeSearchSources(
          opts.sources ?? (hasCredential(session) ? ['web', 'alexandria'] : ['web'])
        ),
      } as Record<string, unknown>;
      searchOpts.domainTools ??= defaultDomainTools(searchOpts.sources);
      searchOpts.toolDetail ??= 'compact';

      if (searchOpts.scrapeOptions) {
        searchOpts.scrapeOptions = withReadOnlyProfile(
          transformScrapeParams(searchOpts.scrapeOptions as Record<string, unknown>)
        );
      }

      const cleaned = removeEmptyTopLevel(searchOpts);
      const searchQuery = (query as string | undefined) ?? '';
      log.info('Searching', { query: searchQuery });
      const searchBody = {
        query: searchQuery,
        ...(cleaned as any),
        origin: requestOrigin(mcpClient, session),
      };
      const exchangeSource = hasAlexandria(searchBody.sources);
      if (exchangeSource || searchBody.domainTools)
        assertExchangeCredential(session);
      if (isKeylessMode(session)) {
        const json = await keylessPost('/v2/search', searchBody, session);
        // Search feedback requires an authenticated account. Do not expose its
        // identifier to keyless clients, where it would invite an unusable call.
        const keylessResponse = { ...(json ?? {}) };
        delete keylessResponse.id;
        return structuredCompact(keylessResponse);
      }
      // Call /v2/search through the SDK's HTTP layer (auth + retries) instead
      // of `client.search()` so we preserve the full response envelope. The
      // high-level `search()` helper strips `id` and `creditsUsed`, which
      // supports the optional authenticated `firecrawl_search_feedback` workflow.
      const client = getClient(session);
      const postSearch = () =>
        postSearchWithFallback(
          client,
          searchBody,
          opts.sources === undefined && opts.domainTools !== true
        );
      const context = { tool: 'firecrawl_search' };
      const httpRes = exchangeSource
        ? await relayExchangeError(postSearch, context)
        : await relayTermsRequired(postSearch, context);
      return structuredCompact(httpRes?.data ?? {});
    },
  });

  async function executeExchangeCalls(
    session: SessionData | undefined,
    alexandria:
      | z.infer<typeof exchangeCallSchema>
      | z.infer<typeof exchangeCallsSchema>,
    suppliedRequestId?: string,
    timeout?: number,
    origin = requestOrigin(undefined, session)
  ): Promise<string> {
    assertExchangeCredential(session);
    const client = getClient(session);
    const requestId = suppliedRequestId ?? randomUUID();
    try {
      const response = await relayExchangeError(() =>
        (client as any).http.post(
          '/v2/scrape',
          {
            alexandria,
            origin,
            ...(timeout !== undefined ? { timeout } : {}),
          },
          {
            headers: { 'x-request-id': requestId },
            ...(timeout !== undefined ? { timeoutMs: timeout + 5000 } : {}),
          }
        ),
        { tool: 'firecrawl_scrape', requestId, providers: (Array.isArray(alexandria) ? alexandria : [alexandria]).map(call => call.provider) }
      );
      const calls = Array.isArray(alexandria) ? alexandria : [alexandria];
      return alexandriaOutput(
        { ...(response?.data ?? {}), requestId },
        calls,
        async (body, id) => {
          const result = await (client as any).http.post(
            '/v2/scrape',
            { ...(body as object), origin },
            { headers: { 'x-request-id': id }, timeoutMs: 15_000 }
          );
          return result?.data;
        },
        randomUUID(),
        alexandriaFeedbackAvailable() && alexandriaCallsWarrantFeedback(calls)
          ? { feedbackTool: ALEXANDRIA_FEEDBACK_HINT }
          : {}
      );
    } catch (error) {
      if ((error as any)?.response?.status === 401) throw error;
      throw new UserError(
        `${error instanceof Error ? error.message : String(error)} Request ID: ${requestId}. Reuse this ID only with the identical payload.`,
        { ...(error instanceof UserError ? error.extras : {}), requestId }
      );
    }
  }

  const findToolsTool: RegisteredTool = {
    name: 'firecrawl_find_tools',
    annotations: {
      title: 'Find Tools',
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
      idempotentHint: true,
    },
    description:
      'Browse Alexandria data providers and workflows or read a selected contract. Alexandria covers ' + ALEXANDRIA_CATALOGUE_VERTICALS + ': typed, sourced records through published contracts. Prefer normal firecrawl_search for a data task; it already returns matching providers. Use this tool when the contract you need was not returned in full, to browse a category when search found nothing, or before scraping the same fields from several pages. Discovery is free. Use query for semantic discovery or urls to find providers for a website. With no arguments, browse categories, then providers and tools. Contracts describe the inputs and outputs for execution through firecrawl_scrape. nextTool identifies further discovery or pagination. Discovery does not execute providers. Use firecrawl_search when you also need web results.',
    outputSchema: findToolsOutputSchema,
    parameters: findToolsSchema,
    execute: async (args, { session, client: mcpClient }) => {
      const origin = requestOrigin(mcpClient, session);
      let options;
      try { options = findToolsOptions(args as Parameters<typeof findToolsOptions>[0]); }
      catch (error) { throw new UserError(error instanceof Error ? error.message : String(error)); }
      if (options.level === 'categories') {
        assertExchangeCredential(session);
        const response = await relayExchangeError(
          () => (getClient(session) as any).http.get('/exchange/discover', originHeaders(origin)),
          { tool: 'firecrawl_find_tools', requestId: session?.requestId }
        );
        const rows = response?.data?.cohorts;
        if (!Array.isArray(rows) || rows.some((row: any) => typeof row?.cohort !== 'string' || typeof row?.about !== 'string')) {
          throw new UserError('Category discovery returned an invalid category index.');
        }
        const offset = options.offset ?? 0;
        const items = rows.slice(offset, offset + options.limit).map((row: any) => ({
          id: row.cohort, description: row.about,
          next: { provider: 'firecrawl', capability: 'find-tools', options: { categories: [row.cohort], level: 'providers', limit: options.limit } },
        }));
        const page: any = { level: 'categories', items, total: rows.length };
        if (offset + options.limit < rows.length) page.nextTool = { name: 'firecrawl_find_tools', arguments: { level: 'categories', limit: options.limit, offset: offset + options.limit } };
        return structuredCompact(withAlexandriaFeedbackHint(withFindToolsNavigation({ success: true, data: { creditsCost: 0, alexandria: [{ provider: 'firecrawl', capability: 'find-tools', creditsCost: 0, data: page }] } }), alexandriaFeedbackAvailable()));
      }
      const result = await executeExchangeCalls(session, { provider: 'firecrawl', capability: 'find-tools', options }, undefined, undefined, origin);
      return structuredCompact(withFindToolsNavigation(JSON.parse(result)));
    },
  };
  server.addTool(findToolsTool);
  const DEFAULT_CLOUD_API_URL = 'https://api.firecrawl.dev';

  function resolveApiBaseUrl(): string {
    return (config.apiUrl || DEFAULT_CLOUD_API_URL).replace(
      /\/$/,
      ''
    );
  }

  // Keyless free tier: when no credential is configured and we're targeting the
  // Firecrawl cloud (not a self-hosted API URL), scrape and search are free,
  // rate-limited per IP. The cloud only grants this when NO Authorization
  // header is sent, so we bypass the SDK — which always attaches a Bearer
  // header — and post directly. A deployment that requires credentials admits
  // keyless use only for sessions its `authenticate` marked as keyless.
  function isKeylessMode(session?: SessionData): boolean {
    if (hasCredential(session) || session?.credentialError) return false;
    if (session?.authType === 'keyless') return true;
    // Local/stdio against the cloud (not a self-hosted FIRECRAWL_API_URL).
    return !config.requireCredential && !config.apiUrl;
  }

  async function keylessPost(
    path: string,
    body: Record<string, unknown>,
    session?: SessionData,
    originOverride?: string
  ): Promise<any> {
    // The body already names the client's origin (every caller stamps it); the
    // headers of this request and the eligibility probe carry the same value.
    const origin =
      originOverride ??
      (typeof body.origin === 'string' && body.origin.length > 0
        ? body.origin
        : requestOrigin(undefined, session));
    await hooks.beforeKeylessRequest?.(session, origin);
    const headers: Record<string, string> = {
      ...AGENT_HINTS_HEADERS,
      ...originHeaders(origin),
      'Content-Type': 'application/json',
      ...resolveOutbound(session).headers,
    };
    const response = await fetch(`${resolveApiBaseUrl()}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const json: any = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (isKeylessMode(session) && response.status === 429) {
        // The API normally supplies requests|credits. Preserve a structured,
        // non-specific recovery payload during a skewed or legacy deployment.
        const code = keylessQuotaReason(json?.reason)
          ? 'KEYLESS_QUOTA_EXHAUSTED'
          : 'KEYLESS_LIMIT_REACHED';
        const payload = recoveryPayload(code, session?.requestId, {
          retryAfterSeconds:
            Number.isFinite(json?.retry_after_seconds) &&
            json.retry_after_seconds > 0
              ? json.retry_after_seconds
              : undefined,
          signupUrl: keylessSignupUrlFrom(json?.signup_url),
        });
        const hints = readAgentHints(json);
        if (hints) payload.agent_hints = hints;
        throw new UserError(String(payload.message), payload);
      }
      throw new CoreHttpError(
        json?.error || `Firecrawl request failed (HTTP ${response.status})`,
        response.status,
        readAgentHints(json)
      );
    }
    return json;
  }

  async function getCrawlStatusWithOrigin(
    client: FirecrawlApp,
    jobId: string,
    origin: string
  ): Promise<Record<string, unknown>> {
    const res = await (client as any).http.get(
      `/v2/crawl/${encodeURIComponent(jobId)}`,
      originHeaders(origin)
    );
    const body = (res?.data ?? {}) as any;
    const initialDocs = Array.isArray(body.data) ? body.data : [];

    if (!body.next) {
      return {
        id: jobId,
        status: body.status,
        completed: body.completed ?? 0,
        total: body.total ?? 0,
        creditsUsed: body.creditsUsed,
        expiresAt: body.expiresAt,
        next: body.next ?? null,
        data: initialDocs,
        ...(readAgentHints(body) ? { agent_hints: readAgentHints(body) } : {}),
      };
    }

    const docs = initialDocs.slice();
    let current = body.next as string | null;
    while (current) {
      const pageRes = await (client as any).http.get(
        current,
        originHeaders(origin)
      );
      const payload = (pageRes?.data ?? {}) as any;
      if (!payload.success) break;

      const pageData = Array.isArray(payload.data)
        ? payload.data
        : payload.data?.pages || [];
      docs.push(...pageData);
      current =
        payload.next ??
        (Array.isArray(payload.data) ? null : payload.data?.next) ??
        null;
    }

    return {
      id: jobId,
      status: body.status,
      completed: body.completed ?? 0,
      total: body.total ?? 0,
      creditsUsed: body.creditsUsed,
      expiresAt: body.expiresAt,
      next: null,
      data: docs,
      ...(readAgentHints(body) ? { agent_hints: readAgentHints(body) } : {}),
    };
  }

  async function waitForCrawlCompletionWithOrigin(
    client: FirecrawlApp,
    jobId: string,
    origin: string,
    pollInterval = 2,
    timeout?: number
  ): Promise<Record<string, unknown>> {
    const startedAt = Date.now();
    for (;;) {
      const status = await getCrawlStatusWithOrigin(client, jobId, origin);
      if (
        ['completed', 'failed', 'cancelled'].includes(String(status.status ?? ''))
      ) {
        return status;
      }
      if (timeout != null && Date.now() - startedAt > timeout * 1000) {
        throw new Error(`Crawl job ${jobId} did not complete within ${timeout}s`);
      }
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(1000, pollInterval * 1000))
      );
    }
  }

  const feedbackIssueSchema = z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(
      /^[a-z0-9][a-z0-9_-]*$/,
      'Issue codes must use lowercase letters, numbers, underscores, or hyphens'
    );

  const valuableSourceSchema = z.object({
    url: z.string().url(),
    reason: z.string().max(1000).optional(),
  });

  const missingContentSchema = z.object({
    topic: z
      .string()
      .min(1, 'topic must not be empty')
      .max(200, 'topic must be 200 characters or fewer'),
    description: z.string().max(2000).optional(),
  });

  const SEARCH_FEEDBACK_DISABLED = !config.searchFeedback;

  const ENDPOINT_FEEDBACK_DISABLED = !config.endpointFeedback;

  if (!SEARCH_FEEDBACK_DISABLED && !isLocalKeylessStartup()) {
    server.addTool({
      name: 'firecrawl_search_feedback',
      canList: (session: SessionData) => !isKeylessMode(session),
      annotations: {
        title: 'Firecrawl search feedback',
        readOnlyHint: false, // POSTs structured feedback to the API, creating a server-side record.
        openWorldHint: true, // Feedback references open-web search results and external URLs.
        destructiveHint: false, // Additive only; records feedback and may refund credits, does not delete data.
      },
      description: `
Records schema-validated quality feedback for a prior \`firecrawl_search\` UUID \`searchId\`. A \`good\` rating requires a valuable source, \`partial\` a valuable source or at least one \`missingContent\` entry, and \`bad\` at least one \`missingContent\` entry or a query suggestion; caps are 50 \`valuableSources\` and 20 \`missingContent\` entries.

Eligibility is limited to successful searches within the feedback age window. The record is idempotent per search ID. Eligible first feedback for a search can refund 1 credit; refunds are subject to the team's daily cap. The response reports whether a refund was applied, along with submission and daily-cap status.
`,
      outputSchema: feedbackOutputSchema,
      parameters: z.object({
        searchId: z
          .string()
          .uuid('searchId must be the UUID returned by firecrawl_search'),
        rating: z.enum(['good', 'bad', 'partial']),
        valuableSources: z
          .array(
            z.object({
              url: z.string().url(),
              reason: z.string().max(1000).optional(),
            })
          )
          .max(50)
          .optional(),
        missingContent: z
          .array(
            z.object({
              topic: z
                .string()
                .min(1, 'topic must not be empty')
                .max(200, 'topic must be 200 characters or fewer'),
              description: z.string().max(2000).optional(),
            })
          )
          .max(20)
          .optional()
          .describe(
            'Array of specific pieces of content the agent expected to find but did not. ' +
              'One entry per distinct topic. Each entry has a short `topic` and optional ' +
              'longer `description`.'
          ),
        querySuggestions: z.string().max(2000).optional(),
      }),
      execute: async (
        args: unknown,
        { session, log, client: mcpClient }
      ): Promise<ContentResult> => {
        const origin = requestOrigin(mcpClient, session);
        const {
          searchId,
          rating,
          valuableSources,
          missingContent,
          querySuggestions,
        } = args as {
          searchId: string;
          rating: 'good' | 'bad' | 'partial';
          valuableSources?: { url: string; reason?: string }[];
          missingContent?: { topic: string; description?: string }[];
          querySuggestions?: string;
        };

        const apiBase = resolveApiBaseUrl();
        const endpoint = `${apiBase}/v2/search/${encodeURIComponent(
          searchId
        )}/feedback`;

        const body: Record<string, unknown> = {
          rating,
          origin,
        };
        if (valuableSources && valuableSources.length > 0) {
          body.valuableSources = valuableSources;
        }
        if (missingContent && missingContent.length > 0) {
          body.missingContent = missingContent;
        }
        if (querySuggestions) body.querySuggestions = querySuggestions;

        const headers: Record<string, string> = {
          ...AGENT_HINTS_HEADERS,
          ...originHeaders(origin),
          'Content-Type': 'application/json',
        };
        const outbound = resolveOutbound(session);
        Object.assign(headers, outbound.headers);
        const credential = outbound.credential;
        if (credential) {
          headers['Authorization'] = `Bearer ${credential}`;
        } else if (config.requireCredential) {
          throw new Error('Unauthorized: missing API key for search feedback.');
        }

        log.info('Submitting search feedback', { searchId, rating });
        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });

        const responseText = await response.text();
        let parsed: any;
        try {
          parsed = JSON.parse(responseText);
        } catch {
          parsed = { raw: responseText };
        }

        // A 401 is Core's verdict on the forwarded API key, so let the shared
        // credential-recovery boundary turn it into CREDENTIAL_INVALID.
        if (session?.authType === 'api-key' && response.status === 401) {
          throw new CoreHttpError(
            parsed?.error ?? 'Unauthorized: invalid Firecrawl API key',
            response.status
          );
        }

        // Other 4xx responses are terminal; surface a structured payload (with
        // retryable=false) so agents do not retry-loop on substantive-feedback
        // rejections, expired windows, etc.
        if (!response.ok) {
          log.warn('Search feedback rejected', {
            status: response.status,
            feedbackErrorCode: parsed?.feedbackErrorCode,
          });
          return structuredText({
            success: false,
            status: response.status,
            feedbackErrorCode: parsed?.feedbackErrorCode,
            error: parsed?.error ?? `HTTP ${response.status}`,
            retryable: response.status >= 500,
            ...(readAgentHints(parsed)
              ? { agent_hints: readAgentHints(parsed) }
              : {}),
          });
        }

        return structuredText(parsed);
      },
    });
  }

  /** Whether firecrawl_feedback is registered on this instance, so Alexandria results only point at a tool that exists. */
  function alexandriaFeedbackAvailable(): boolean {
    // An instance whose tool filter excludes firecrawl_feedback must not
    // point callers at it.
    return (
      !ENDPOINT_FEEDBACK_DISABLED &&
      !isLocalKeylessStartup() &&
      (hooks.toolFilter?.('firecrawl_feedback') ?? true)
    );
  }

  if (alexandriaFeedbackAvailable()) {
    server.addTool({
      name: 'firecrawl_feedback',
      canList: (session: SessionData) => !isKeylessMode(session),
      annotations: {
        title: 'Firecrawl feedback',
        readOnlyHint: false, // POSTs structured feedback for a completed job to /v2/feedback.
        openWorldHint: true, // Feedback is tied to jobs that processed open-web URLs.
        destructiveHint: false, // Additive only; submits ratings and notes and may refund credits, does not delete jobs or external content.
      },
      description: `
Submit concise quality feedback for a completed search, scrape, parse, or map job. Provide the endpoint, job ID, rating, and relevant issue codes or small contextual fields; omit large page contents and raw outputs.

For an Alexandria session, set endpoint to \`alexandria\`, omit jobId, and provide requestedWebsite (url and requestedFunctionality), objective, rationale, and rating. objective is the underlying goal behind the session: what you or your user were ultimately trying to accomplish (for example, "shortlist federal IT contracts to bid on this quarter"), not only what was needed from this website. Optional providerFeedback and capabilityFeedback describe gaps or errors. Capability issues: new_capability_request (requires requestedFunctionality), missing_capability, insufficient_functionality, incorrect_result, execution_error, other. Alexandria feedback must arrive within 20 minutes of the team's latest Alexandria search, discovery, or execution; later feedback is rejected. Eligible feedback can refund 1 credit; refunds are subject to daily caps per website and per team.

Returns submission status, feedback ID, and accounting fields.
`,
      outputSchema: feedbackOutputSchema,
      parameters: z.object({
        endpoint: z.enum(['search', 'scrape', 'parse', 'map', 'alexandria']),
        jobId: z.string().uuid('jobId must be the UUID returned by Firecrawl').optional(),
        ...alexandriaFeedbackFields,
        rating: z.enum(['good', 'bad', 'partial']),
        issues: z.array(feedbackIssueSchema).max(20).optional(),
        tags: z.array(feedbackIssueSchema).max(20).optional(),
        note: z.string().max(4000).optional(),
        valuableSources: z.array(valuableSourceSchema).max(50).optional(),
        missingContent: z.array(missingContentSchema).max(50).optional(),
        querySuggestions: z.string().max(2000).optional(),
        url: z.string().url().optional(),
        pageNumbers: z.array(z.number().int().positive()).max(100).optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }).superRefine((value, ctx) => {
        if (value.endpoint === 'alexandria') {
          const parsed = alexandriaSessionFeedbackSchema.safeParse(value);
          if (!parsed.success) for (const issue of parsed.error.issues) ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message });
        } else {
          if (!value.jobId) {
            ctx.addIssue({ code: 'custom', path: ['jobId'], message: 'jobId is required for job feedback' });
          }
          for (const field of Object.keys(alexandriaFeedbackFields) as (keyof typeof alexandriaFeedbackFields)[]) {
            if (value[field] !== undefined) {
              ctx.addIssue({ code: 'custom', path: [field], message: `${field} is only supported for Alexandria feedback` });
            }
          }
        }
      }),
      execute: async (
        args: unknown,
        { session, log, client: mcpClient }
      ): Promise<ContentResult> => {
        const origin = requestOrigin(mcpClient, session);
        const {
          endpoint,
          jobId,
          rating,
          issues,
          tags,
          note,
          valuableSources,
          missingContent,
          querySuggestions,
          url,
          pageNumbers,
          metadata,
        } = args as {
          endpoint: 'search' | 'scrape' | 'parse' | 'map' | 'alexandria';
          jobId: string;
          rating: 'good' | 'bad' | 'partial';
          issues?: string[];
          tags?: string[];
          note?: string;
          valuableSources?: { url: string; reason?: string }[];
          missingContent?: { topic: string; description?: string }[];
          querySuggestions?: string;
          url?: string;
          pageNumbers?: number[];
          metadata?: Record<string, unknown>;
        };

        const apiBase = resolveApiBaseUrl();
        const headers: Record<string, string> = {
          ...AGENT_HINTS_HEADERS,
          ...originHeaders(origin),
          'Content-Type': 'application/json',
        };
        const outbound = resolveOutbound(session);
        Object.assign(headers, outbound.headers);
        const credential = outbound.credential;
        if (credential) {
          headers['Authorization'] = `Bearer ${credential}`;
        } else if (config.requireCredential) {
          throw new Error('Unauthorized: missing API key for feedback.');
        }

        const body = endpoint === 'alexandria'
          ? { ...alexandriaSessionFeedbackSchema.parse(args), origin }
          : removeEmptyTopLevel({
          endpoint,
          jobId,
          rating,
          issues,
          tags,
          note,
          valuableSources,
          missingContent,
          querySuggestions,
          url,
          pageNumbers,
          metadata,
          origin,
        });

        log.info('Submitting endpoint feedback', { endpoint, jobId, rating });
        const response = await fetch(`${apiBase}/v2/feedback`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });

        const responseText = await response.text();
        let parsed: any;
        try {
          parsed = JSON.parse(responseText);
        } catch {
          parsed = { raw: responseText };
        }

        // A 401 is Core's verdict on the forwarded API key, so let the shared
        // credential-recovery boundary turn it into CREDENTIAL_INVALID.
        if (session?.authType === 'api-key' && response.status === 401) {
          throw new CoreHttpError(
            parsed?.error ?? 'Unauthorized: invalid Firecrawl API key',
            response.status
          );
        }

        if (!response.ok) {
          log.warn('Endpoint feedback rejected', {
            status: response.status,
            feedbackErrorCode: parsed?.feedbackErrorCode,
          });
          return structuredText({
            success: false,
            status: response.status,
            feedbackErrorCode: parsed?.feedbackErrorCode,
            error: parsed?.error ?? `HTTP ${response.status}`,
            retryable: response.status >= 500,
            ...(readAgentHints(parsed)
              ? { agent_hints: readAgentHints(parsed) }
              : {}),
          });
        }

        return structuredText(parsed);
      },
    });
  }

  server.addTool({
    name: 'firecrawl_crawl',
    annotations: {
      title: 'Firecrawl site crawl',
      readOnlyHint: false, // Starts a server-side crawl job and polls until the job reaches a terminal state.
      openWorldHint: true, // Crawls user-specified URLs across the public web.
      destructiveHint: false, // Reads pages from target sites; does not delete or alter external websites.
    },
    description: `
Start a multi-page crawl at a website URL, poll it to a terminal state, and return the final status and collected data. Scope can be bounded with include/exclude paths, depth, page limit, subdomain/external-link controls, sitemap handling, delay, and scrape options.

Crawl results can be large; use conservative limits when full-site coverage is unnecessary. Webhooks and interactive scrape actions are unavailable in safe mode. Returns the crawl ID, status, and page data.
`,
    parameters: z.object({
      url: z.string(),
      prompt: z.string().optional(),
      excludePaths: z.array(z.string()).optional(),
      includePaths: z.array(z.string()).optional(),
      maxDiscoveryDepth: z.number().optional(),
      sitemap: z.enum(['skip', 'include', 'only']).optional(),
      limit: z.number().optional(),
      allowExternalLinks: z.boolean().optional(),
      allowSubdomains: z.boolean().optional(),
      crawlEntireDomain: z.boolean().optional(),
      delay: z.number().optional(),
      maxConcurrency: z.number().optional(),
      ...(SAFE_MODE
        ? {}
        : {
            webhook: z.string().optional(),
            webhookHeaders: z.record(z.string(), z.string()).optional(),
          }),
      deduplicateSimilarURLs: z.boolean().optional(),
      ignoreQueryParameters: z.boolean().optional(),
      scrapeOptions: scrapeParamsSchema.omit({ url: true }).partial().optional(),
    }),
    outputSchema: crawlOutputSchema,
    execute: async (args, { session, log, client: mcpClient }): Promise<ContentResult> => {
      const origin = requestOrigin(mcpClient, session);
      const { url, ...options } = args as Record<string, unknown>;
      const client = getClient(session);

      const opts = { ...options } as Record<string, unknown>;
      if (opts.scrapeOptions) {
        opts.scrapeOptions = transformScrapeParams(
          opts.scrapeOptions as Record<string, unknown>
        );
      }

      const webhook = buildWebhook(opts);
      if (webhook) opts.webhook = webhook;
      delete opts.webhookHeaders;

      const cleaned = removeEmptyTopLevel(opts);
      const pollInterval =
        typeof cleaned.pollInterval === 'number'
          ? (cleaned.pollInterval as number)
          : 2;
      const timeout =
        typeof cleaned.timeout === 'number'
          ? (cleaned.timeout as number)
          : undefined;
      delete (cleaned as Record<string, unknown>).pollInterval;
      delete (cleaned as Record<string, unknown>).timeout;

      log.info('Starting crawl', { url: String(url) });
      const started = await (client as any).http.post('/v2/crawl', {
        url: String(url),
        ...(cleaned as Record<string, unknown>),
        origin,
      });
      const crawlId = started?.data?.id;
      if (!crawlId) {
        return structuredText(started?.data ?? {});
      }
      const res = await waitForCrawlCompletionWithOrigin(
        client,
        crawlId,
        origin,
        pollInterval,
        timeout
      );
      return structuredText(res);
    },
  });

  server.addTool({
    name: 'firecrawl_check_crawl_status',
    annotations: {
      title: 'Firecrawl crawl status',
      readOnlyHint: true, // Retrieves status and results for an existing crawl job by ID; no mutations.
      openWorldHint: false, // Queries only Firecrawl job state within the authenticated account.
      destructiveHint: false, // Status lookup only; no deletes or updates.
    },
    description: `
Retrieve the current status, progress, and available results for an existing crawl ID. This only reads Firecrawl job state and does not start or modify the crawl.
`,
    outputSchema: crawlOutputSchema,
    parameters: z.object({ id: z.string() }),
    execute: async (
      args: unknown,
      {
        session,
        client: mcpClient,
      }: { session?: SessionData; client?: McpClient }
    ): Promise<ContentResult> => {
      const client = getClient(session);
      const id = (args as any).id as string;
      const res = await getCrawlStatusWithOrigin(
        client,
        id,
        requestOrigin(mcpClient, session)
      );
      return structuredText(res);
    },
  });

  server.addTool({
    name: 'firecrawl_extract',
    annotations: {
      title: 'Firecrawl extract (deprecated: use scrape JSON)',
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
    description: `
Deprecated compatibility entry point. Use firecrawl_scrape once per known URL with formats: ["json"] and jsonOptions containing the prompt and schema. Use firecrawl_agent for multi-source research when the URLs are not known or the data spans several sites.
`,
    outputSchema: deprecatedToolOutputSchema,
    parameters: z.object({
      urls: z.array(z.string()),
      prompt: z.string().optional(),
      schema: z.record(z.string(), z.any()).optional(),
      allowExternalLinks: z.boolean().optional(),
      enableWebSearch: z.boolean().optional(),
      includeSubdomains: z.boolean().optional(),
    }),
    canList: () => false,
    beforeValidate: () => {
      const payload = deprecatedExtractPayload();
      return {
        content: [{ type: 'text' as const, text: payload.message }],
        isError: true,
        structuredContent: payload,
      };
    },
    execute: async (): Promise<string> => {
      const payload = deprecatedExtractPayload();
      throw new UserError(payload.message, payload);
    },
  });

  // Mirrors agentExchangeSchema in firecrawl/firecrawl
  // apps/api/src/controllers/v2/types.ts: the gateway forwards it verbatim to
  // the agent service, which owns every default and the per-thread inheritance.
  const agentExchangeSchema = z
    .strictObject({
      enabled: z
        .boolean()
        .optional()
        .describe('Let the agent call Alexandria providers. On by default.'),
      toolkits: z
        .array(z.string())
        .max(5)
        .optional()
        .describe('Pin up to 5 providers the agent may use, by slug. Omitted means the whole catalog.'),
      maxCalls: z
        .number()
        .int()
        .min(1)
        .max(30)
        .optional()
        .describe('Most provider calls the agent may make in this turn.'),
      requireApproval: z
        .boolean()
        .optional()
        .describe(
          'End the turn with a paid-call pendingApproval before any paid provider call. Requires mode "chat" on the same request, even on a follow-up.'
        ),
      approve: z
        .strictObject({
          approvalId: z.string().uuid(),
          callIds: z.array(z.string()).optional(),
          always: z.boolean().optional(),
        })
        .optional()
        .describe(
          'Answer yes to the pendingApproval the previous turn of this thread ended on (its id, also exchange.requiresAction.approvalId). Needs threadId. For a terms offer, send it only after an organization admin confirms acceptance in the Firecrawl dashboard; this does not accept terms. callIds and always are ignored on terms offers. For paid calls, callIds picks a subset (default all) and always stops asking for the rest of the thread.'
        ),
      decline: z
        .strictObject({ approvalId: z.string().uuid() })
        .optional()
        .describe(
          'Answer no to that pendingApproval. Needs threadId. A declined terms offer keeps those providers out of the rest of the thread.'
        ),
      onTermsRequired: z
        .enum(['skip', 'ask'])
        .optional()
        .describe(
          'What to do when a provider the agent would use needs data terms the team has not accepted. Gated providers are never called. "skip" (default): answer with accepted providers and list the rest in exchange.skippedProviders. "ask": the same, plus a terms pendingApproval and exchange.requiresAction. Read terms with terms/show; an organization admin accepts them in the Firecrawl dashboard. There is no auto-accept. Omitted on a follow-up keeps the previous turn\'s value.'
        ),
    })
    .describe(
      'Alexandria provider settings for this turn, forwarded as the request\'s exchange object.'
    );

  server.addTool({
    name: 'firecrawl_agent',
    annotations: {
      title: 'Firecrawl agent',
      readOnlyHint: false, // Starts an autonomous research agent job on the Firecrawl API.
      openWorldHint: true, // The agent browses and searches the open web to fulfill the prompt.
      destructiveHint: false, // Gathers information only; does not delete external data or user resources.
    },
    description: `
Run web research that returns structured data when the URLs are not known or the answer spans several sites. Describe the fields you need in \`prompt\`, optionally pass a JSON \`schema\` and seed \`urls\`, and the research agent searches, navigates, reads pages, and returns JSON assembled across sources. Use it to research an entity plus its fields (founders, pricing, contact details), to build lists and datasets (companies, people, products, jobs, papers), and for pages that need navigation or interaction to reach the data. Optional \`effort\` sets the reasoning budget, \`maxCredits\` caps spend, and \`strictConstrainToURLs\` keeps the agent to the supplied \`urls\`.

This call returns only a job ID, not the research result. Read the job with \`firecrawl_agent_status\` until it reaches \`completed\` or \`failed\`; a typical research run takes one to three minutes. For one known URL use \`firecrawl_scrape\` (with formats: ["json"] for structured output); for a plain lookup that a results page answers, use \`firecrawl_search\`.

The job also returns a \`threadId\`. To continue that thread, pass it with a follow-up \`prompt\`; omitted \`mode\`, \`urls\`, \`schema\` and exchange settings carry over from the previous turn.

The agent only calls Alexandria providers whose terms the team has accepted. \`exchange.skippedProviders\` lists gated providers. With \`exchange.onTermsRequired\` "ask", a terms \`pendingApproval\` and \`exchange.requiresAction\` carry the \`approvalId\` and provider requirements. Read terms/show through \`firecrawl_scrape\`. An organization admin must accept terms in the Firecrawl dashboard at the provider URL or ${DATA_SOURCES_SETTINGS_URL}. Ignore any terms/accept call in the API response. Only after the admin confirms acceptance, resume with the same \`threadId\` and \`exchange.approve: {approvalId}\`; this does not accept terms. To decline, use \`exchange.decline: {approvalId}\`. Never infer acceptance from a data request.
`,
    outputSchema: agentOutputSchema,
    parameters: z.object({
      prompt: z.string().min(1).max(10000),
      urls: z.array(z.string().url()).optional(),
      schema: z.record(z.string(), z.any()).optional(),
      effort: z
        .enum(['low', 'medium', 'high'])
        .optional()
        .describe('Reasoning budget for the agent task.'),
      maxCredits: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          'Spending limit in credits for this run. Defaults to 2500 on the API.'
        ),
      strictConstrainToURLs: z
        .boolean()
        .optional()
        .describe(
          'If true, agent will only visit URLs provided in the urls array.'
        ),
      threadId: z
        .string()
        .uuid()
        .optional()
        .describe(
          'Continue this thread: the threadId from an earlier firecrawl_agent or firecrawl_agent_status result. Omit to start a new thread.'
        ),
      mode: z
        .enum(['extract', 'chat'])
        .optional()
        .describe(
          '"extract" (default) returns the complete structured result every turn. "chat" lets a follow-up that asks no new data get a short reply in message instead of a re-run; required for exchange.requireApproval. Omitted on a follow-up keeps the previous turn\'s mode.'
        ),
      exchange: agentExchangeSchema.optional(),
    })
    .refine(
      (data) => !(data.exchange?.approve && data.exchange?.decline),
      {
        message:
          'Send exchange.approve or exchange.decline, not both: each answers the pending approval one way.',
        path: ['exchange'],
      }
    )
    .refine(
      (data) =>
        !(data.exchange?.approve || data.exchange?.decline) ||
        Boolean(data.threadId),
      {
        message:
          'exchange.approve and exchange.decline answer a pending approval on an existing thread: pass that thread\'s threadId.',
        path: ['threadId'],
      }
    )
    .refine(
      (data) => !data.exchange?.requireApproval || data.mode === 'chat',
      {
        // The agent service checks the mode sent on this request, not the
        // thread's inherited one, and the gateway turns its 400 into a 500.
        message:
          'exchange.requireApproval needs mode: "chat" on the same request, including on a follow-up.',
        path: ['mode'],
      }
    ),
    execute: async (
      args: unknown,
      { session, log, client: mcpClient }
    ): Promise<ContentResult> => {
      const client = getClient(session);
      const a = args as Record<string, unknown>;
      log.info('Starting agent', {
        prompt: (a.prompt as string).substring(0, 100),
        urlCount: Array.isArray(a.urls) ? a.urls.length : 0,
        threadId: (a.threadId as string | undefined) ?? null,
      });
      const agentBody = removeEmptyTopLevel({
        prompt: a.prompt as string,
        urls: a.urls as string[] | undefined,
        schema: (a.schema as Record<string, unknown>) || undefined,
        effort: a.effort as 'low' | 'medium' | 'high' | undefined,
        maxCredits: a.maxCredits as number | undefined,
        strictConstrainToURLs: a.strictConstrainToURLs as boolean | undefined,
        threadId: a.threadId as string | undefined,
        mode: a.mode as 'extract' | 'chat' | undefined,
        // Forwarded verbatim: the agent service owns the defaults and the
        // per-thread inheritance.
        exchange: a.exchange as Record<string, unknown> | undefined,
      });
      const res = await (client as any).startAgent({
        ...agentBody,
        origin: requestOrigin(mcpClient, session),
      });
      return structuredText(res);
    },
  });

  server.addTool({
    name: 'firecrawl_agent_status',
    annotations: {
      title: 'Firecrawl agent status',
      readOnlyHint: true, // Polls an existing agent job by ID for progress and results; no mutations.
      openWorldHint: false, // Queries only Firecrawl job state by job ID within the user's account.
      destructiveHint: false, // Read-only status check.
    },
    description: `
Retrieve progress or final results for a \`firecrawl_agent\` job ID. A \`processing\` response is non-terminal and does not contain the final research result. Check again after 15–30 seconds until the status is \`completed\` or \`failed\`; a typical research run takes one to three minutes and complex jobs can take longer. If the job cannot finish within the task's available time, use \`firecrawl_search\` and \`firecrawl_scrape\` to complete the requested output.

Returns job status, progress information, and result data when completed.
`,
    outputSchema: agentStatusOutputSchema,
    parameters: z.object({ id: z.string() }),
    execute: async (
      args: unknown,
      { session, log, client: mcpClient }
    ): Promise<ContentResult> => {
      const client = getClient(session);
      const { id } = args as { id: string };
      log.info('Checking agent status', { id });
      const res = await (client as any).http.get(
        `/v2/agent/${encodeURIComponent(id)}`,
        originHeaders(requestOrigin(mcpClient, session))
      );
      return agentStatusResult(res?.data ?? {});
    },
  });

  /**
   * A run that hit its maxCredits ends `failed`, and the API may attach a
   * best-effort `partial`. Lead with a plain notice so the calling model does not
   * mistake the partial for a finished answer or miss how to continue. Any other
   * status passes through unchanged.
   */
  function agentStatusResult(data: unknown): ContentResult {
    const run = data as Record<string, unknown> | null;
    if (
      !run ||
      typeof run !== 'object' ||
      run.status !== 'failed' ||
      run.stopReason !== 'credit_limit_reached'
    ) {
      return structuredText(data);
    }
    const lines = [
      'This agent run stopped at its credit limit (maxCredits) before finishing.',
    ];
    const hasPartial = run.partial !== undefined && run.partial !== null;
    if (hasPartial) {
      const validity =
        run.partialSchemaValid === true
          ? ' It matches the schema this run was given.'
          : run.partialSchemaValid === false
            ? ' It does not match the schema this run was given.'
            : '';
      lines.push(
        `\`partial\` is an INCOMPLETE best-effort result, not a finished answer; tell the user it is incomplete.${validity}`
      );
    } else {
      lines.push('No partial result was recovered.');
    }
    if (typeof run.message === 'string' && run.message.trim()) {
      lines.push(`Agent message: ${run.message.trim()}`);
    }
    const threadId = typeof run.threadId === 'string' ? run.threadId : undefined;
    lines.push(
      threadId
        ? `To continue, call firecrawl_agent with threadId "${threadId}" and a prompt to finish the task (the follow-up ${hasPartial ? 'resumes from this partial' : 'keeps this thread'}), or start a new run with a higher maxCredits.`
        : 'To continue, start a new firecrawl_agent run with a higher maxCredits.'
    );
    const notice = lines.join(' ');
    return withStructured(
      `${notice}\n\n${JSON.stringify(data, null, 2)}`,
      { ...run, notice }
    );
  }

  // Interact tools (scrape-bound browser sessions)
  server.addTool({
    name: 'firecrawl_interact',
    annotations: {
      title: 'Firecrawl interact',
      readOnlyHint: false, // Executes browser interactions (clicks, form input, scripts) in a live session.
      openWorldHint: true, // Interacts with pages on the public web via the scraped session.
      destructiveHint: false, // Transient page interactions only; does not delete monitors, jobs, or external sites.
    },
    description: `
Open or reuse a live browser session to navigate a page, click controls, fill fields, or run browser code. Provide either \`url\` or \`scrapeId\`, and either a natural-language \`prompt\` or executable \`code\`; code can run as Bash, Python, or Node with a bounded timeout.

This acts on the live site, so actions such as form submission can create persistent external side effects. Returns execution output, stdout/stderr, exit status, and session viewing URLs.
`,
    outputSchema: interactOutputSchema,
    parameters: z
      .object({
        scrapeId: z.string().trim().min(1).optional(),
        url: z.string().trim().url().optional(),
        prompt: z.string().trim().min(1).optional(),
        code: z.string().trim().min(1).optional(),
        language: z.enum(['bash', 'python', 'node']).optional(),
        timeout: z.number().min(1).max(300).optional(),
        scrapeOptions: scrapeParamsSchema.omit({ url: true }).partial().optional(),
      })
      .refine((data) => Boolean(data.scrapeId) !== Boolean(data.url), {
        message:
          "Provide either 'url' (interact directly) or 'scrapeId' (reuse a previous scrape), not both.",
      })
      .refine((data) => !data.scrapeOptions || Boolean(data.url), {
        message: "scrapeOptions can only be used with 'url' mode.",
      })
      .refine((data) => data.code || data.prompt, {
        message: "Either 'code' or 'prompt' must be provided.",
      }),
    execute: async (
      args: unknown,
      { session, log, client: mcpClient }
    ): Promise<ContentResult> => {
      const origin = requestOrigin(mcpClient, session);
      const client = getClient(session);
      const {
        scrapeId: providedScrapeId,
        url,
        prompt,
        code,
        language,
        timeout,
        scrapeOptions,
      } = args as {
        scrapeId?: string;
        url?: string;
        prompt?: string;
        code?: string;
        language?: 'bash' | 'python' | 'node';
        timeout?: number;
        scrapeOptions?: Record<string, unknown>;
      };
      // No scrapeId means the caller passed a url: scrape it first to open the
      // session, then interact. One tool call instead of scrape + interact.
      let scrapeId = providedScrapeId;
      const openedFromUrl = !scrapeId;
      if (openedFromUrl) {
        log.info('Opening interact session from url', { url });
        const cleanedScrapeOptions = removeEmptyTopLevel(scrapeOptions ?? {});
        const scraped = await client.scrape(String(url), {
          ...cleanedScrapeOptions,
          origin,
        } as any);
        scrapeId = (scraped as any)?.metadata?.scrapeId;
        if (!scrapeId) {
          return structuredText({
            error:
              'Could not open an interact session: the scrape did not return a scrapeId. Try firecrawl_scrape first, then pass its scrapeId.',
            url,
          });
        }
      }
      if (!scrapeId) {
        return structuredText({
          error: 'Could not open an interact session: missing scrapeId.',
          url,
        });
      }
      const activeScrapeId = scrapeId;
      log.info('Interacting with page', { scrapeId: activeScrapeId });
      const interactArgs: Record<string, unknown> = { origin };
      if (prompt) interactArgs.prompt = prompt;
      if (code) interactArgs.code = code;
      if (language) interactArgs.language = language;
      if (timeout != null) interactArgs.timeout = timeout;
      const res = await client.interact(activeScrapeId, interactArgs as any);
      if (openedFromUrl && res && typeof res === 'object' && !Array.isArray(res)) {
        return structuredText({
          ...(res as unknown as Record<string, unknown>),
          scrapeId: activeScrapeId,
        });
      }
      if (openedFromUrl) {
        return structuredText({ scrapeId: activeScrapeId, result: res });
      }
      return structuredText(res);
    },
  });

  server.addTool({
    name: 'firecrawl_interact_stop',
    annotations: {
      title: 'Stop Firecrawl interact session',
      readOnlyHint: false, // Calls the API to stop and tear down an active interact session.
      openWorldHint: false, // Operates only on a known Firecrawl scrape/interact session ID.
      destructiveHint: true, // Terminates the live browser session; this end state cannot be resumed.
    },
    description: `
Stop the live interact session associated with a \`scrapeId\` and release its resources. Returns a success confirmation.
`,
    outputSchema: interactStopOutputSchema,
    parameters: z.object({
      scrapeId: z.string(),
    }),
    execute: async (
      args: unknown,
      { session, log, client: mcpClient }
    ): Promise<ContentResult> => {
      const client = getClient(session);
      const { scrapeId } = args as { scrapeId: string };
      log.info('Stopping interact session', { scrapeId });
      const res = await (client as any).http.delete(
        `/v2/scrape/${encodeURIComponent(scrapeId)}/interact`,
        originHeaders(requestOrigin(mcpClient, session))
      );
      return structuredText(res?.data ?? {});
    },
  });

  // Parse a local file directly with local file access, or orchestrate a
  // two-call uploadRef flow with upload file access without reading the
  // caller's filesystem.
  server.addTool({
    name: 'firecrawl_parse',
    annotations: {
      title: 'Firecrawl file parsing',
      readOnlyHint: true, // Local mode reads a file; hosted mode only returns upload instructions or parses an uploadRef.
      openWorldHint: false, // Operates on a local filesystem path/upload reference, not an arbitrary web URL.
      destructiveHint: false, // Read-only parsing; no deletion or writes to the source file.
    },
    description: `
Parse one supported document into markdown, HTML, links, summary, targeted answers, or JSON matching a schema. Supported inputs include common HTML, PDF, Word, RTF, OpenDocument, and spreadsheet files; PDF parsing can be bounded with \`pdfOptions.maxPages\`.

Local MCP reads \`filePath\` from the server filesystem. Hosted MCP uses two calls: first provide \`filePath\` to receive upload instructions, upload locally, then call again with the returned \`uploadRef\`; do not send both fields together. Remote web URLs belong in \`firecrawl_scrape\`.

Set \`redactPII\` to request redaction of personally identifiable information in the returned content. \`zeroDataRetention\` requires an eligible authenticated account; omit it for anonymous keyless use. Returns upload instructions for hosted phase one or parsed document content for the final call. Authenticated final responses can include a \`data.metadata.scrapeId\` for optional parse feedback.
`,
    outputSchema: parseOutputSchema,
    parameters: parseParamsSchema,
    execute: async (
      args: unknown,
      { session, log, client: mcpClient }
    ): Promise<ContentResult> => {
      const origin = requestOrigin(mcpClient, session);
      if (config.fileAccess === 'upload') {
        return structuredJsonText(
          await executeHostedParse(args as ParseToolArgs, session, log, origin)
        );
      }

      const apiUrl = config.apiUrl;
      if (!apiUrl) {
        throw new Error(
          'firecrawl_parse requires FIRECRAWL_API_URL to be set to a self-hosted Firecrawl API instance.'
        );
      }

      const {
        filePath,
        contentType: overrideContentType,
        ...options
      } = args as {
        filePath: string;
        contentType?: string;
      } & Record<string, unknown>;

      const absPath = path.resolve(filePath);
      const buffer = await readFile(absPath);
      const filename = path.basename(absPath);
      const fileContentType =
        overrideContentType && overrideContentType.length > 0
          ? overrideContentType
          : inferContentType(filename);

      const optionsPayload = buildParseOptionsPayload(
        options as Record<string, unknown>,
        origin
      );

      const form = new FormData();
      const blob = new Blob([new Uint8Array(buffer)], {
        type: fileContentType,
      });
      form.append('file', blob, filename);
      form.append('options', JSON.stringify(optionsPayload));

      const headers: Record<string, string> = {
        ...AGENT_HINTS_HEADERS,
        ...originHeaders(origin),
      };
      const outbound = resolveOutbound(session);
      Object.assign(headers, outbound.headers);
      const credential = outbound.credential;
      if (credential) {
        headers['Authorization'] = `Bearer ${credential}`;
      }

      const endpoint = `${apiUrl.replace(/\/$/, '')}/v2/parse`;
      log.info('Parsing local file', {
        endpoint,
        filename,
        size: buffer.length,
      });

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: form,
      });

      const responseText = await response.text();
      if (!response.ok) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(responseText);
        } catch {
          // Keep the original non-JSON error text.
        }
        throw new CoreHttpError(
          `Parse request failed with status ${response.status}: ${responseText}`,
          response.status,
          readAgentHints(parsed)
        );
      }

      try {
        return structuredText(JSON.parse(responseText));
      } catch {
        return withStructured(responseText, { raw: responseText });
      }
    },
  });

  registerMonitorTools(server, {
    apiUrl: config.apiUrl,
    resolveOutbound,
  });
  registerResearchTools(server, getClient);
  registerDeveloperTools(server, getClient);
  registerGovTools(server, getClient);
  registerUsageTools(server, getClient);

  hooks.registerExtraTools?.(
    {
      addTool: (tool) =>
        addTool(prepareTool(tool as unknown as RegisteredTool)),
    },
    {
      getClient,
      hasCredential,
      builtInTool: (name) =>
        builtInTools.get(name) as unknown as ToolDefinition | undefined,
    }
  );

  return {
    start: (args) =>
      server.start(args as Parameters<typeof server.start>[0]),
    stop: () => server.stop(),
  };
}
