import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { EventStore } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { CreateMessageRequest } from '@modelcontextprotocol/sdk/types.js';
import {
  CallToolRequestSchema,
  ClientCapabilities,
  CompleteRequestSchema,
  ErrorCode,
  GetPromptRequestSchema,
  GetPromptResult,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListResourcesResult,
  ListResourceTemplatesRequestSchema,
  ListResourceTemplatesResult,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
  ResourceLink,
  Root,
  RootsListChangedNotificationSchema,
  ServerCapabilities,
  SetLevelRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { StandardSchemaV1 } from '@standard-schema/spec';
import { EventEmitter } from 'events';
import { readFile } from 'fs/promises';
import Fuse from 'fuse.js';
import http from 'http';
import { startHTTPServer } from 'mcp-proxy';
import { StrictEventEmitter } from 'strict-event-emitter-types';
import { setTimeout as delay } from 'timers/promises';
import parseURITemplate from 'uri-templates';
import { toJsonSchema } from 'xsschema';
import { z } from 'zod';

export interface Logger {
  debug(...args: unknown[]): void;
  error(...args: unknown[]): void;
  info(...args: unknown[]): void;
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
}

export type SSEServer = {
  close: () => Promise<void>;
};

type FastMCPEvents<T extends FastMCPSessionAuth> = {
  connect: (event: { session: FastMCPSession<T> }) => void;
  disconnect: (event: { session: FastMCPSession<T> }) => void;
};

type FastMCPSessionEvents = {
  error: (event: { error: Error }) => void;
  ready: () => void;
  rootsChanged: (event: { roots: Root[] }) => void;
};

export const imageContent = async (
  input: { buffer: Buffer } | { path: string } | { url: string }
): Promise<ImageContent> => {
  let rawData: Buffer;

  try {
    if ('url' in input) {
      try {
        const response = await fetch(input.url);

        if (!response.ok) {
          throw new Error(
            `Server responded with status: ${response.status} - ${response.statusText}`
          );
        }

        rawData = Buffer.from(await response.arrayBuffer());
      } catch (error) {
        throw new Error(
          `Failed to fetch image from URL (${input.url}): ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    } else if ('path' in input) {
      try {
        rawData = await readFile(input.path);
      } catch (error) {
        throw new Error(
          `Failed to read image from path (${input.path}): ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    } else if ('buffer' in input) {
      rawData = input.buffer;
    } else {
      throw new Error(
        "Invalid input: Provide a valid 'url', 'path', or 'buffer'"
      );
    }

    const { fileTypeFromBuffer } = await import('file-type');
    const mimeType = await fileTypeFromBuffer(rawData);

    if (!mimeType || !mimeType.mime.startsWith('image/')) {
      console.warn(
        `Warning: Content may not be a valid image. Detected MIME: ${
          mimeType?.mime || 'unknown'
        }`
      );
    }

    const base64Data = rawData.toString('base64');

    return {
      data: base64Data,
      mimeType: mimeType?.mime ?? 'image/png',
      type: 'image',
    } as const;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    } else {
      throw new Error(`Unexpected error processing image: ${String(error)}`);
    }
  }
};

export const audioContent = async (
  input: { buffer: Buffer } | { path: string } | { url: string }
): Promise<AudioContent> => {
  let rawData: Buffer;

  try {
    if ('url' in input) {
      try {
        const response = await fetch(input.url);

        if (!response.ok) {
          throw new Error(
            `Server responded with status: ${response.status} - ${response.statusText}`
          );
        }

        rawData = Buffer.from(await response.arrayBuffer());
      } catch (error) {
        throw new Error(
          `Failed to fetch audio from URL (${input.url}): ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    } else if ('path' in input) {
      try {
        rawData = await readFile(input.path);
      } catch (error) {
        throw new Error(
          `Failed to read audio from path (${input.path}): ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    } else if ('buffer' in input) {
      rawData = input.buffer;
    } else {
      throw new Error(
        "Invalid input: Provide a valid 'url', 'path', or 'buffer'"
      );
    }

    const { fileTypeFromBuffer } = await import('file-type');
    const mimeType = await fileTypeFromBuffer(rawData);

    if (!mimeType || !mimeType.mime.startsWith('audio/')) {
      console.warn(
        `Warning: Content may not be a valid audio file. Detected MIME: ${
          mimeType?.mime || 'unknown'
        }`
      );
    }

    const base64Data = rawData.toString('base64');

    return {
      data: base64Data,
      mimeType: mimeType?.mime ?? 'audio/mpeg',
      type: 'audio',
    } as const;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    } else {
      throw new Error(`Unexpected error processing audio: ${String(error)}`);
    }
  }
};

type Context<T extends FastMCPSessionAuth> = {
  client: {
    version: ReturnType<Server['getClientVersion']>;
  };
  log: {
    debug: (message: string, data?: SerializableValue) => void;
    error: (message: string, data?: SerializableValue) => void;
    info: (message: string, data?: SerializableValue) => void;
    warn: (message: string, data?: SerializableValue) => void;
  };
  reportProgress: (progress: Progress) => Promise<void>;
  session: T | undefined;
  streamContent: (content: Content | Content[]) => Promise<void>;
};

type Extra = unknown;

type Extras = Record<string, Extra>;

type Literal = boolean | null | number | string | undefined;

type Progress = {
  /**
   * The progress thus far. This should increase every time progress is made, even if the total is unknown.
   */
  progress: number;
  /**
   * Total number of items to process (or total progress required), if known.
   */
  total?: number;
};

type SerializableValue =
  | { [key: string]: SerializableValue }
  | Literal
  | SerializableValue[];

type TextContent = {
  text: string;
  type: 'text';
};

type ToolParameters = StandardSchemaV1;

abstract class FastMCPError extends Error {
  public constructor(message?: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnexpectedStateError extends FastMCPError {
  public extras?: Extras;

  public constructor(message: string, extras?: Extras) {
    super(message);
    this.name = new.target.name;
    this.extras = extras;
  }
}

/**
 * An error that is meant to be surfaced to the user.
 */
export class UserError extends UnexpectedStateError {}

const TextContentZodSchema = z
  .object({
    /**
     * The text content of the message.
     */
    text: z.string(),
    type: z.literal('text'),
  })
  .strict() satisfies z.ZodType<TextContent>;

type ImageContent = {
  data: string;
  mimeType: string;
  type: 'image';
};

const ImageContentZodSchema = z
  .object({
    /**
     * The base64-encoded image data.
     */
    data: z.string().base64(),
    /**
     * The MIME type of the image. Different providers may support different image types.
     */
    mimeType: z.string(),
    type: z.literal('image'),
  })
  .strict() satisfies z.ZodType<ImageContent>;

type AudioContent = {
  data: string;
  mimeType: string;
  type: 'audio';
};

const AudioContentZodSchema = z
  .object({
    /**
     * The base64-encoded audio data.
     */
    data: z.string().base64(),
    mimeType: z.string(),
    type: z.literal('audio'),
  })
  .strict() satisfies z.ZodType<AudioContent>;

type ResourceContent = {
  resource: {
    blob?: string;
    mimeType?: string;
    text?: string;
    uri: string;
  };
  type: 'resource';
};

const ResourceContentZodSchema = z
  .object({
    resource: z.object({
      blob: z.string().optional(),
      mimeType: z.string().optional(),
      text: z.string().optional(),
      uri: z.string(),
    }),
    type: z.literal('resource'),
  })
  .strict() satisfies z.ZodType<ResourceContent>;

const ResourceLinkZodSchema = z.object({
  description: z.string().optional(),
  mimeType: z.string().optional(),
  name: z.string(),
  title: z.string().optional(),
  type: z.literal('resource_link'),
  uri: z.string(),
}) satisfies z.ZodType<ResourceLink>;

type Content =
  | AudioContent
  | ImageContent
  | ResourceContent
  | ResourceLink
  | TextContent;

const ContentZodSchema = z.discriminatedUnion('type', [
  TextContentZodSchema,
  ImageContentZodSchema,
  AudioContentZodSchema,
  ResourceContentZodSchema,
  ResourceLinkZodSchema,
]) satisfies z.ZodType<Content>;

type ContentResult = {
  content: Content[];
  isError?: boolean;
};

const ContentResultZodSchema = z
  .object({
    content: ContentZodSchema.array(),
    isError: z.boolean().optional(),
  })
  .strict() satisfies z.ZodType<ContentResult>;

type Completion = {
  hasMore?: boolean;
  total?: number;
  values: string[];
};

/**
 * https://github.com/modelcontextprotocol/typescript-sdk/blob/3164da64d085ec4e022ae881329eee7b72f208d4/src/types.ts#L983-L1003
 */
const CompletionZodSchema = z.object({
  /**
   * Indicates whether there are additional completion options beyond those provided in the current response, even if the exact total is unknown.
   */
  hasMore: z.optional(z.boolean()),
  /**
   * The total number of completion options available. This can exceed the number of values actually sent in the response.
   */
  total: z.optional(z.number().int()),
  /**
   * An array of completion values. Must not exceed 100 items.
   */
  values: z.array(z.string()).max(100),
}) satisfies z.ZodType<Completion>;

type ArgumentValueCompleter<T extends FastMCPSessionAuth = FastMCPSessionAuth> =
  (value: string, auth?: T) => Promise<Completion>;

type InputPrompt<
  T extends FastMCPSessionAuth = FastMCPSessionAuth,
  Arguments extends InputPromptArgument<T>[] = InputPromptArgument<T>[],
  Args = PromptArgumentsToObject<Arguments>,
> = {
  arguments?: InputPromptArgument<T>[];
  description?: string;
  load: (args: Args, auth?: T) => Promise<PromptResult>;
  name: string;
};

type InputPromptArgument<T extends FastMCPSessionAuth = FastMCPSessionAuth> =
  Readonly<{
    complete?: ArgumentValueCompleter<T>;
    description?: string;
    enum?: string[];
    name: string;
    required?: boolean;
  }>;

type InputResourceTemplate<
  T extends FastMCPSessionAuth,
  Arguments extends InputResourceTemplateArgument<T>[] =
    InputResourceTemplateArgument<T>[],
> = {
  arguments: Arguments;
  description?: string;
  load: (
    args: ResourceTemplateArgumentsToObject<Arguments>,
    auth?: T
  ) => Promise<ResourceResult | ResourceResult[]>;
  mimeType?: string;
  name: string;
  uriTemplate: string;
};

type InputResourceTemplateArgument<
  T extends FastMCPSessionAuth = FastMCPSessionAuth,
> = Readonly<{
  complete?: ArgumentValueCompleter<T>;
  description?: string;
  name: string;
  required?: boolean;
}>;

type LoggingLevel =
  | 'alert'
  | 'critical'
  | 'debug'
  | 'emergency'
  | 'error'
  | 'info'
  | 'notice'
  | 'warning';

type Prompt<
  T extends FastMCPSessionAuth = FastMCPSessionAuth,
  Arguments extends PromptArgument<T>[] = PromptArgument<T>[],
  Args = PromptArgumentsToObject<Arguments>,
> = {
  arguments?: PromptArgument<T>[];
  complete?: (name: string, value: string, auth?: T) => Promise<Completion>;
  description?: string;
  load: (args: Args, auth?: T) => Promise<PromptResult>;
  name: string;
};

type PromptArgument<T extends FastMCPSessionAuth = FastMCPSessionAuth> =
  Readonly<{
    complete?: ArgumentValueCompleter<T>;
    description?: string;
    enum?: string[];
    name: string;
    required?: boolean;
  }>;

type PromptArgumentsToObject<T extends { name: string; required?: boolean }[]> =
  {
    [K in T[number]['name']]: Extract<
      T[number],
      { name: K }
    >['required'] extends true
      ? string
      : string | undefined;
  };

type PromptResult = Pick<GetPromptResult, 'messages'> | string;

type Resource<T extends FastMCPSessionAuth> = {
  complete?: (name: string, value: string, auth?: T) => Promise<Completion>;
  description?: string;
  load: (auth?: T) => Promise<ResourceResult | ResourceResult[]>;
  mimeType?: string;
  name: string;
  uri: string;
};

type ResourceResult =
  | {
      blob: string;
      mimeType?: string;
      uri?: string;
    }
  | {
      mimeType?: string;
      text: string;
      uri?: string;
    };

type ResourceTemplate<
  T extends FastMCPSessionAuth,
  Arguments extends ResourceTemplateArgument<T>[] =
    ResourceTemplateArgument<T>[],
> = {
  arguments: Arguments;
  complete?: (name: string, value: string, auth?: T) => Promise<Completion>;
  description?: string;
  load: (
    args: ResourceTemplateArgumentsToObject<Arguments>,
    auth?: T
  ) => Promise<ResourceResult | ResourceResult[]>;
  mimeType?: string;
  name: string;
  uriTemplate: string;
};

type ResourceTemplateArgument<
  T extends FastMCPSessionAuth = FastMCPSessionAuth,
> = Readonly<{
  complete?: ArgumentValueCompleter<T>;
  description?: string;
  name: string;
  required?: boolean;
}>;

type ResourceTemplateArgumentsToObject<T extends { name: string }[]> = {
  [K in T[number]['name']]: string;
};

type SamplingResponse = {
  content: AudioContent | ImageContent | TextContent;
  model: string;
  role: 'assistant' | 'user';
  stopReason?: 'endTurn' | 'maxTokens' | 'stopSequence' | string;
};

type ServerOptions<T extends FastMCPSessionAuth> = {
  authenticate?: Authenticate<T>;
  /**
   * Configuration for the health-check endpoint that can be exposed when the
   * server is running using the HTTP Stream transport. When enabled, the
   * server will respond to an HTTP GET request with the configured path (by
   * default "/health") rendering a plain-text response (by default "ok") and
   * the configured status code (by default 200).
   *
   * The endpoint is only added when the server is started with
   * `transportType: "httpStream"` – it is ignored for the stdio transport.
   */
  health?: {
    /**
     * When set to `false` the health-check endpoint is disabled.
     * @default true
     */
    enabled?: boolean;

    /**
     * Plain-text body returned by the endpoint.
     * @default "ok"
     */
    message?: string;

    /**
     * HTTP path that should be handled.
     * @default "/health"
     */
    path?: string;

    /**
     * HTTP response status that will be returned.
     * @default 200
     */
    status?: number;
  };
  instructions?: string;
  /**
   * Custom logger instance. If not provided, defaults to console.
   * Use this to integrate with your own logging system.
   */
  logger?: Logger;
  name: string;

  /**
   * Configuration for OAuth well-known discovery endpoints that can be exposed
   * when the server is running using HTTP-based transports (SSE or HTTP Stream).
   * When enabled, the server will respond to requests for OAuth discovery endpoints
   * with the configured metadata.
   *
   * The endpoints are only added when the server is started with
   * `transportType: "httpStream"` – they are ignored for the stdio transport.
   * Both SSE and HTTP Stream transports support OAuth endpoints.
   */
  oauth?: {
    /**
     * OAuth Authorization Server metadata for /.well-known/oauth-authorization-server
     *
     * This endpoint follows RFC 8414 (OAuth 2.0 Authorization Server Metadata)
     * and provides metadata about the OAuth 2.0 authorization server.
     *
     * Required by MCP Specification 2025-03-26
     */
    authorizationServer?: {
      authorizationEndpoint: string;
      codeChallengeMethodsSupported?: string[];
      // DPoP support
      dpopSigningAlgValuesSupported?: string[];
      grantTypesSupported?: string[];

      introspectionEndpoint?: string;
      // Required
      issuer: string;
      // Common optional
      jwksUri?: string;
      opPolicyUri?: string;
      opTosUri?: string;
      registrationEndpoint?: string;
      responseModesSupported?: string[];
      responseTypesSupported: string[];
      revocationEndpoint?: string;
      scopesSupported?: string[];
      serviceDocumentation?: string;
      tokenEndpoint: string;
      tokenEndpointAuthMethodsSupported?: string[];
      tokenEndpointAuthSigningAlgValuesSupported?: string[];

      uiLocalesSupported?: string[];
    };

    /**
     * Whether OAuth discovery endpoints should be enabled.
     */
    enabled: boolean;

    /**
     * OAuth Protected Resource metadata for `/.well-known/oauth-protected-resource`
     *
     * This endpoint follows {@link https://www.rfc-editor.org/rfc/rfc9728.html | RFC 9728}
     * and provides metadata describing how an OAuth 2.0 protected resource (in this case,
     * an MCP server) expects to be accessed.
     *
     * When configured, FastMCP will automatically serve this metadata at the
     * `/.well-known/oauth-protected-resource` endpoint. The `authorizationServers` and `resource`
     * fields are required. All others are optional and will be omitted from the published
     * metadata if not specified.
     *
     * This satisfies the requirements of the MCP Authorization specification's
     * {@link https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization#authorization-server-location | Authorization Server Location section}.
     *
     * Clients consuming this metadata MUST validate that any presented values comply with
     * RFC 9728, including strict validation of the `resource` identifier and intended audience
     * when access tokens are issued and presented (per RFC 8707 §2).
     *
     * @remarks Required by MCP Specification version 2025-06-18
     */
    protectedResource?: {
      /**
       * Allows for additional metadata fields beyond those defined in RFC 9728.
       *
       * @remarks This supports vendor-specific or experimental extensions.
       * @see {@link https://www.rfc-editor.org/rfc/rfc9728.html#section-2.3 | RFC 9728 §2.3}
       */
      [key: string]: unknown;

      /**
       * Supported values for the `authorization_details` parameter (RFC 9396).
       *
       * @remarks Used when fine-grained access control is in play.
       * @see {@link https://www.rfc-editor.org/rfc/rfc9728.html#section-2-2.23 | RFC 9728 §2.2.23}
       */
      authorizationDetailsTypesSupported?: string[];

      /**
       * List of OAuth 2.0 authorization server issuer identifiers.
       *
       * These correspond to ASes that can issue access tokens for this protected resource.
       * MCP clients use these values to locate the relevant `/.well-known/oauth-authorization-server`
       * metadata for initiating the OAuth flow.
       *
       * @remarks Required by the MCP spec. MCP servers MUST provide at least one issuer.
       * Clients are responsible for choosing among them (see RFC 9728 §7.6).
       * @see {@link https://www.rfc-editor.org/rfc/rfc9728.html#section-2-2.3 | RFC 9728 §2.2.3}
       */
      authorizationServers: string[];

      /**
       * List of supported methods for presenting OAuth 2.0 bearer tokens.
       *
       * @remarks Valid values are `header`, `body`, and `query`.
       * If omitted, clients MAY assume only `header` is supported, per RFC 6750.
       * This is a client-side interpretation and not a serialization default.
       * @see {@link https://www.rfc-editor.org/rfc/rfc9728.html#section-2-2.9 | RFC 9728 §2.2.9}
       */
      bearerMethodsSupported?: string[];

      /**
       * Whether this resource requires all access tokens to be DPoP-bound.
       *
       * @remarks If omitted, clients SHOULD assume this is `false`.
       * @see {@link https://www.rfc-editor.org/rfc/rfc9728.html#section-2-2.27 | RFC 9728 §2.2.27}
       */
      dpopBoundAccessTokensRequired?: boolean;

      /**
       * Supported algorithms for verifying DPoP proofs (RFC 9449).
       *
       * @see {@link https://www.rfc-editor.org/rfc/rfc9728.html#section-2-2.25 | RFC 9728 §2.2.25}
       */
      dpopSigningAlgValuesSupported?: string[];

      /**
       * JWKS URI of this resource. Used to validate access tokens or sign responses.
       *
       * @remarks When present, this MUST be an `https:` URI pointing to a valid JWK Set (RFC 7517).
       * @see {@link https://www.rfc-editor.org/rfc/rfc9728.html#section-2-2.5 | RFC 9728 §2.2.5}
       */
      jwksUri?: string;

      /**
       * Canonical OAuth resource identifier for this protected resource (the MCP server).
       *
       * @remarks Typically the base URL of the MCP server. Clients MUST use this as the
       * `resource` parameter in authorization and token requests (per RFC 8707).
       * @see {@link https://www.rfc-editor.org/rfc/rfc9728.html#section-2-2.1 | RFC 9728 §2.2.1}
       */
      resource: string;

      /**
       * URL to developer-accessible documentation for this resource.
       *
       * @remarks This field MAY be localized.
       * @see {@link https://www.rfc-editor.org/rfc/rfc9728.html#section-2-2.15 | RFC 9728 §2.2.15}
       */
      resourceDocumentation?: string;

      /**
       * Human-readable name for display purposes (e.g., in UIs).
       *
       * @remarks This field MAY be localized using language tags (`resource_name#en`, etc.).
       * @see {@link https://www.rfc-editor.org/rfc/rfc9728.html#section-2-2.13 | RFC 9728 §2.2.13}
       */
      resourceName?: string;

      /**
       * URL to a human-readable policy page describing acceptable use.
       *
       * @remarks This field MAY be localized.
       * @see {@link https://www.rfc-editor.org/rfc/rfc9728.html#section-2-2.17 | RFC 9728 §2.2.17}
       */
      resourcePolicyUri?: string;

      /**
       * Supported JWS algorithms for signed responses from this resource (e.g., response signing).
       *
       * @remarks MUST NOT include `none`.
       * @see {@link https://www.rfc-editor.org/rfc/rfc9728.html#section-2-2.11 | RFC 9728 §2.2.11}
       */
      resourceSigningAlgValuesSupported?: string[];

      /**
       * URL to the protected resource’s Terms of Service.
       *
       * @remarks This field MAY be localized.
       * @see {@link https://www.rfc-editor.org/rfc/rfc9728.html#section-2-2.19 | RFC 9728 §2.2.19}
       */
      resourceTosUri?: string;

      /**
       * Supported OAuth scopes for requesting access to this resource.
       *
       * @remarks Useful for discovery, but clients SHOULD still request the minimal scope required.
       * @see {@link https://www.rfc-editor.org/rfc/rfc9728.html#section-2-2.7 | RFC 9728 §2.2.7}
       */
      scopesSupported?: string[];

      /**
       * Developer-accessible documentation for how to use the service (not end-user docs).
       *
       * @remarks Semantically equivalent to `resourceDocumentation`, but included under its
       * alternate name for compatibility with tools or schemas expecting either.
       * @see {@link https://www.rfc-editor.org/rfc/rfc9728.html#section-2-2.15 | RFC 9728 §2.2.15}
       */
      serviceDocumentation?: string;

      /**
       * Whether mutual-TLS-bound access tokens are required.
       *
       * @remarks If omitted, clients SHOULD assume this is `false` (client-side behavior).
       * @see {@link https://www.rfc-editor.org/rfc/rfc9728.html#section-2-2.21 | RFC 9728 §2.2.21}
       */
      tlsClientCertificateBoundAccessTokens?: boolean;
    };

    /**
     * Explicit Protected Resource Metadata URL to advertise in
     * `WWW-Authenticate` challenges.
     *
     * By default, `mcp-proxy` derives this from `protectedResource.resource`
     * by appending `/.well-known/oauth-protected-resource`. Set this when the
     * metadata is hosted on a different origin than the MCP endpoint.
     *
     * @example "https://auth.example.com/.well-known/oauth-protected-resource"
     */
    protectedResourceMetadataUrl?: string;
  };

  /**
   * Configuration for the OpenAI Apps domain verification challenge endpoint.
   * When enabled with a token, GET `/.well-known/openai-apps-challenge` returns
   * the token as plain text (required for ChatGPT app submission).
   */
  openaiAppsChallenge?: {
    /**
     * When set to `false` the challenge endpoint is disabled.
     * @default true when token is set
     */
    enabled?: boolean;

    /**
     * HTTP path that should be handled.
     * @default "/.well-known/openai-apps-challenge"
     */
    path?: string;

    /**
     * Plain-text challenge token returned by the endpoint.
     */
    token?: string;
  };

  ping?: {
    /**
     * Whether ping should be enabled by default.
     * - true for SSE or HTTP Stream
     * - false for stdio
     */
    enabled?: boolean;
    /**
     * Interval
     * @default 5000 (5s)
     */
    intervalMs?: number;
    /**
     * Logging level for ping-related messages.
     * @default 'debug'
     */
    logLevel?: LoggingLevel;
  };
  /**
   * Configuration for roots capability
   */
  roots?: {
    /**
     * Whether roots capability should be enabled
     * Set to false to completely disable roots support
     * @default true
     */
    enabled?: boolean;
  };
  /**
   * General utilities
   */
  utils?: {
    formatInvalidParamsErrorMessage?: (
      issues: readonly StandardSchemaV1.Issue[]
    ) => string;
  };
  version: `${number}.${number}.${number}`;
};

type Tool<
  T extends FastMCPSessionAuth,
  Params extends ToolParameters = ToolParameters,
> = {
  annotations?: {
    /**
     * When true, the tool leverages incremental content streaming
     * Return void for tools that handle all their output via streaming
     */
    streamingHint?: boolean;
  } & ToolAnnotations;
  canAccess?: (auth: T) => boolean;
  description?: string;

  execute: (
    args: StandardSchemaV1.InferOutput<Params>,
    context: Context<T>
  ) => Promise<
    | AudioContent
    | ContentResult
    | ImageContent
    | ResourceContent
    | ResourceLink
    | string
    | TextContent
    | void
  >;
  name: string;
  parameters?: Params;
  timeoutMs?: number;
};

/**
 * Tool annotations as defined in MCP Specification (2025-03-26)
 * These provide hints about a tool's behavior.
 */
type ToolAnnotations = {
  /**
   * If true, the tool may perform destructive updates
   * Only meaningful when readOnlyHint is false
   * @default true
   */
  destructiveHint?: boolean;

  /**
   * If true, calling the tool repeatedly with the same arguments has no additional effect
   * Only meaningful when readOnlyHint is false
   * @default false
   */
  idempotentHint?: boolean;

  /**
   * If true, the tool may interact with an "open world" of external entities
   * @default true
   */
  openWorldHint?: boolean;

  /**
   * If true, indicates the tool does not modify its environment
   * @default false
   */
  readOnlyHint?: boolean;

  /**
   * A human-readable title for the tool, useful for UI display
   */
  title?: string;
};

const FastMCPSessionEventEmitterBase: {
  new (): StrictEventEmitter<EventEmitter, FastMCPSessionEvents>;
} = EventEmitter;

type Authenticate<T> = (request: http.IncomingMessage) => Promise<T>;

type FastMCPSessionAuth = Record<string, unknown> | undefined;

const escapeWWWAuthenticateValue = (value: string) => {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
};

class FastMCPSessionEventEmitter extends FastMCPSessionEventEmitterBase {}

export class FastMCPSession<
  T extends FastMCPSessionAuth = FastMCPSessionAuth,
> extends FastMCPSessionEventEmitter {
  public get clientCapabilities(): ClientCapabilities | null {
    return this.#clientCapabilities ?? null;
  }
  public get isReady(): boolean {
    return this.#connectionState === 'ready';
  }
  public get loggingLevel(): LoggingLevel {
    return this.#loggingLevel;
  }
  public get roots(): Root[] {
    return this.#roots;
  }
  public get server(): Server {
    return this.#server;
  }
  #auth: T | undefined;
  #capabilities: ServerCapabilities = {};
  #clientCapabilities?: ClientCapabilities;
  #connectionState: 'closed' | 'connecting' | 'error' | 'ready' = 'connecting';
  #logger: Logger;
  #loggingLevel: LoggingLevel = 'info';
  #needsEventLoopFlush: boolean = false;
  #pingConfig?: ServerOptions<T>['ping'];

  #pingInterval: null | ReturnType<typeof setInterval> = null;

  #prompts: Prompt<T>[] = [];

  #resources: Resource<T>[] = [];

  #resourceTemplates: ResourceTemplate<T>[] = [];

  #roots: Root[] = [];

  #rootsConfig?: ServerOptions<T>['roots'];

  #server: Server;

  #utils?: ServerOptions<T>['utils'];

  constructor({
    auth,
    instructions,
    logger,
    name,
    ping,
    prompts,
    resources,
    resourcesTemplates,
    roots,
    tools,
    transportType,
    utils,
    version,
  }: {
    auth?: T;
    instructions?: string;
    logger: Logger;
    name: string;
    ping?: ServerOptions<T>['ping'];
    prompts: Prompt<T>[];
    resources: Resource<T>[];
    resourcesTemplates: InputResourceTemplate<T>[];
    roots?: ServerOptions<T>['roots'];
    tools: Tool<T>[];
    transportType?: 'httpStream' | 'stdio';
    utils?: ServerOptions<T>['utils'];
    version: string;
  }) {
    super();

    this.#auth = auth;
    this.#logger = logger;
    this.#pingConfig = ping;
    this.#rootsConfig = roots;
    this.#needsEventLoopFlush = transportType === 'httpStream';

    if (tools.length) {
      this.#capabilities.tools = {};
    }

    if (resources.length || resourcesTemplates.length) {
      this.#capabilities.resources = {};
    }

    if (prompts.length) {
      for (const prompt of prompts) {
        this.addPrompt(prompt);
      }

      this.#capabilities.prompts = {};
    }

    this.#capabilities.logging = {};

    this.#server = new Server(
      { name: name, version: version },
      { capabilities: this.#capabilities, instructions: instructions }
    );

    this.#utils = utils;

    this.setupErrorHandling();
    this.setupLoggingHandlers();
    this.setupRootsHandlers();
    this.setupCompleteHandlers();

    if (tools.length) {
      this.setupToolHandlers(tools);
    }

    if (resources.length || resourcesTemplates.length) {
      for (const resource of resources) {
        this.addResource(resource);
      }

      this.setupResourceHandlers(resources);

      if (resourcesTemplates.length) {
        for (const resourceTemplate of resourcesTemplates) {
          this.addResourceTemplate(resourceTemplate);
        }

        this.setupResourceTemplateHandlers(resourcesTemplates);
      }
    }

    if (prompts.length) {
      this.setupPromptHandlers(prompts);
    }
  }

  public async close() {
    this.#connectionState = 'closed';

    if (this.#pingInterval) {
      clearInterval(this.#pingInterval);
    }

    try {
      await this.#server.close();
    } catch (error) {
      this.#logger.error('[FastMCP error]', 'could not close server', error);
    }
  }

  public async connect(transport: Transport) {
    if (this.#server.transport) {
      throw new UnexpectedStateError('Server is already connected');
    }

    this.#connectionState = 'connecting';

    try {
      await this.#server.connect(transport);

      let attempt = 0;
      const maxAttempts = 10;
      const retryDelay = 100;

      while (attempt++ < maxAttempts) {
        const capabilities = this.#server.getClientCapabilities();

        if (capabilities) {
          this.#clientCapabilities = capabilities;
          break;
        }

        await delay(retryDelay);
      }

      if (!this.#clientCapabilities) {
        this.#logger.warn(
          `[FastMCP warning] could not infer client capabilities after ${maxAttempts} attempts. Connection may be unstable.`
        );
      }

      if (
        this.#clientCapabilities?.roots?.listChanged &&
        typeof this.#server.listRoots === 'function'
      ) {
        try {
          const roots = await this.#server.listRoots();
          this.#roots = roots?.roots || [];
        } catch (e) {
          if (e instanceof McpError && e.code === ErrorCode.MethodNotFound) {
            this.#logger.debug(
              '[FastMCP debug] listRoots method not supported by client'
            );
          } else {
            this.#logger.error(
              `[FastMCP error] received error listing roots.\n\n${
                e instanceof Error ? e.stack : JSON.stringify(e)
              }`
            );
          }
        }
      }

      if (this.#clientCapabilities) {
        const pingConfig = this.#getPingConfig(transport);

        if (pingConfig.enabled) {
          this.#pingInterval = setInterval(async () => {
            try {
              await this.#server.ping();
            } catch {
              // The reason we are not emitting an error here is because some clients
              // seem to not respond to the ping request, and we don't want to crash the server,
              // e.g., https://github.com/punkpeye/fastmcp/issues/38.
              const logLevel = pingConfig.logLevel;

              if (logLevel === 'debug') {
                this.#logger.debug('[FastMCP debug] server ping failed');
              } else if (logLevel === 'warning') {
                this.#logger.warn(
                  '[FastMCP warning] server is not responding to ping'
                );
              } else if (logLevel === 'error') {
                this.#logger.error(
                  '[FastMCP error] server is not responding to ping'
                );
              } else {
                this.#logger.info('[FastMCP info] server ping failed');
              }
            }
          }, pingConfig.intervalMs);
        }
      }

      // Mark connection as ready and emit event
      this.#connectionState = 'ready';
      this.emit('ready');
    } catch (error) {
      this.#connectionState = 'error';
      const errorEvent = {
        error: error instanceof Error ? error : new Error(String(error)),
      };
      this.emit('error', errorEvent);
      throw error;
    }
  }

  public async requestSampling(
    message: CreateMessageRequest['params'],
    options?: RequestOptions
  ): Promise<SamplingResponse> {
    return this.#server.createMessage(message, options);
  }

  public waitForReady(): Promise<void> {
    if (this.isReady) {
      return Promise.resolve();
    }

    if (
      this.#connectionState === 'error' ||
      this.#connectionState === 'closed'
    ) {
      return Promise.reject(
        new Error(`Connection is in ${this.#connectionState} state`)
      );
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new Error(
            'Connection timeout: Session failed to become ready within 5 seconds'
          )
        );
      }, 5000);

      this.once('ready', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.once('error', (event) => {
        clearTimeout(timeout);
        reject(event.error);
      });
    });
  }

  #getPingConfig(transport: Transport): {
    enabled: boolean;
    intervalMs: number;
    logLevel: LoggingLevel;
  } {
    const pingConfig = this.#pingConfig || {};

    let defaultEnabled = false;

    if ('type' in transport) {
      // Enable by default for SSE and HTTP streaming
      if (transport.type === 'httpStream') {
        defaultEnabled = true;
      }
    }

    return {
      enabled:
        pingConfig.enabled !== undefined ? pingConfig.enabled : defaultEnabled,
      intervalMs: pingConfig.intervalMs || 5000,
      logLevel: pingConfig.logLevel || 'debug',
    };
  }

  private addPrompt(inputPrompt: InputPrompt<T>) {
    const completers: Record<string, ArgumentValueCompleter<T>> = {};
    const enums: Record<string, string[]> = {};
    const fuseInstances: Record<string, Fuse<string>> = {};

    for (const argument of inputPrompt.arguments ?? []) {
      if (argument.complete) {
        completers[argument.name] = argument.complete;
      }

      if (argument.enum) {
        enums[argument.name] = argument.enum;
        fuseInstances[argument.name] = new Fuse(argument.enum, {
          includeScore: true,
          threshold: 0.3, // More flexible matching!
        });
      }
    }

    const prompt = {
      ...inputPrompt,
      complete: async (name: string, value: string, auth?: T) => {
        if (completers[name]) {
          return await completers[name](value, auth);
        }

        if (fuseInstances[name]) {
          const result = fuseInstances[name].search(value);

          return {
            total: result.length,
            values: result.map((item) => item.item),
          };
        }

        return {
          values: [],
        };
      },
    };

    this.#prompts.push(prompt);
  }

  private addResource(inputResource: Resource<T>) {
    this.#resources.push(inputResource);
  }

  private addResourceTemplate(inputResourceTemplate: InputResourceTemplate<T>) {
    const completers: Record<string, ArgumentValueCompleter<T>> = {};

    for (const argument of inputResourceTemplate.arguments ?? []) {
      if (argument.complete) {
        completers[argument.name] = argument.complete;
      }
    }

    const resourceTemplate = {
      ...inputResourceTemplate,
      complete: async (name: string, value: string, auth?: T) => {
        if (completers[name]) {
          return await completers[name](value, auth);
        }

        return {
          values: [],
        };
      },
    };

    this.#resourceTemplates.push(resourceTemplate);
  }

  private setupCompleteHandlers() {
    this.#server.setRequestHandler(CompleteRequestSchema, async (request) => {
      if (request.params.ref.type === 'ref/prompt') {
        const prompt = this.#prompts.find(
          (prompt) => prompt.name === request.params.ref.name
        );

        if (!prompt) {
          throw new UnexpectedStateError('Unknown prompt', {
            request,
          });
        }

        if (!prompt.complete) {
          throw new UnexpectedStateError('Prompt does not support completion', {
            request,
          });
        }

        const completion = CompletionZodSchema.parse(
          await prompt.complete(
            request.params.argument.name,
            request.params.argument.value,
            this.#auth
          )
        );

        return {
          completion,
        };
      }

      if (request.params.ref.type === 'ref/resource') {
        const resource = this.#resourceTemplates.find(
          (resource) => resource.uriTemplate === request.params.ref.uri
        );

        if (!resource) {
          throw new UnexpectedStateError('Unknown resource', {
            request,
          });
        }

        if (!('uriTemplate' in resource)) {
          throw new UnexpectedStateError('Unexpected resource');
        }

        if (!resource.complete) {
          throw new UnexpectedStateError(
            'Resource does not support completion',
            {
              request,
            }
          );
        }

        const completion = CompletionZodSchema.parse(
          await resource.complete(
            request.params.argument.name,
            request.params.argument.value,
            this.#auth
          )
        );

        return {
          completion,
        };
      }

      throw new UnexpectedStateError('Unexpected completion request', {
        request,
      });
    });
  }

  private setupErrorHandling() {
    this.#server.onerror = (error) => {
      this.#logger.error('[FastMCP error]', error);
    };
  }

  private setupLoggingHandlers() {
    this.#server.setRequestHandler(SetLevelRequestSchema, (request) => {
      this.#loggingLevel = request.params.level;

      return {};
    });
  }

  private setupPromptHandlers(prompts: Prompt<T>[]) {
    this.#server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: prompts.map((prompt) => {
          return {
            arguments: prompt.arguments,
            complete: prompt.complete,
            description: prompt.description,
            name: prompt.name,
          };
        }),
      };
    });

    this.#server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const prompt = prompts.find(
        (prompt) => prompt.name === request.params.name
      );

      if (!prompt) {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown prompt: ${request.params.name}`
        );
      }

      const args = request.params.arguments;

      for (const arg of prompt.arguments ?? []) {
        if (arg.required && !(args && arg.name in args)) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Prompt '${request.params.name}' requires argument '${arg.name}': ${
              arg.description || 'No description provided'
            }`
          );
        }
      }

      let result: Awaited<ReturnType<Prompt<T>['load']>>;

      try {
        result = await prompt.load(
          args as Record<string, string | undefined>,
          this.#auth
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to load prompt '${request.params.name}': ${errorMessage}`
        );
      }

      if (typeof result === 'string') {
        return {
          description: prompt.description,
          messages: [
            {
              content: { text: result, type: 'text' },
              role: 'user',
            },
          ],
        };
      } else {
        return {
          description: prompt.description,
          messages: result.messages,
        };
      }
    });
  }

  private setupResourceHandlers(resources: Resource<T>[]) {
    this.#server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: resources.map((resource) => ({
          description: resource.description,
          mimeType: resource.mimeType,
          name: resource.name,
          uri: resource.uri,
        })),
      } satisfies ListResourcesResult;
    });

    this.#server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request) => {
        if ('uri' in request.params) {
          const resource = resources.find(
            (resource) =>
              'uri' in resource && resource.uri === request.params.uri
          );

          if (!resource) {
            for (const resourceTemplate of this.#resourceTemplates) {
              const uriTemplate = parseURITemplate(
                resourceTemplate.uriTemplate
              );

              const match = uriTemplate.fromUri(request.params.uri);

              if (!match) {
                continue;
              }

              const uri = uriTemplate.fill(match);

              const result = await resourceTemplate.load(match, this.#auth);

              const resources = Array.isArray(result) ? result : [result];
              return {
                contents: resources.map((resource) => ({
                  ...resource,
                  description: resourceTemplate.description,
                  mimeType: resource.mimeType ?? resourceTemplate.mimeType,
                  name: resourceTemplate.name,
                  uri: resource.uri ?? uri,
                })),
              };
            }

            throw new McpError(
              ErrorCode.MethodNotFound,
              `Resource not found: '${request.params.uri}'. Available resources: ${
                resources.map((r) => r.uri).join(', ') || 'none'
              }`
            );
          }

          if (!('uri' in resource)) {
            throw new UnexpectedStateError('Resource does not support reading');
          }

          let maybeArrayResult: Awaited<ReturnType<Resource<T>['load']>>;

          try {
            maybeArrayResult = await resource.load(this.#auth);
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            throw new McpError(
              ErrorCode.InternalError,
              `Failed to load resource '${resource.name}' (${resource.uri}): ${errorMessage}`,
              {
                uri: resource.uri,
              }
            );
          }

          const resourceResults = Array.isArray(maybeArrayResult)
            ? maybeArrayResult
            : [maybeArrayResult];

          return {
            contents: resourceResults.map((result) => ({
              ...result,
              mimeType: result.mimeType ?? resource.mimeType,
              name: resource.name,
              uri: result.uri ?? resource.uri,
            })),
          };
        }

        throw new UnexpectedStateError('Unknown resource request', {
          request,
        });
      }
    );
  }

  private setupResourceTemplateHandlers(
    resourceTemplates: ResourceTemplate<T>[]
  ) {
    this.#server.setRequestHandler(
      ListResourceTemplatesRequestSchema,
      async () => {
        return {
          resourceTemplates: resourceTemplates.map((resourceTemplate) => ({
            description: resourceTemplate.description,
            mimeType: resourceTemplate.mimeType,
            name: resourceTemplate.name,
            uriTemplate: resourceTemplate.uriTemplate,
          })),
        } satisfies ListResourceTemplatesResult;
      }
    );
  }

  private setupRootsHandlers() {
    if (this.#rootsConfig?.enabled === false) {
      this.#logger.debug(
        '[FastMCP debug] roots capability explicitly disabled via config'
      );
      return;
    }

    // Only set up roots notification handling if the server supports it
    if (typeof this.#server.listRoots === 'function') {
      this.#server.setNotificationHandler(
        RootsListChangedNotificationSchema,
        () => {
          this.#server
            .listRoots()
            .then((roots) => {
              this.#roots = roots.roots;

              this.emit('rootsChanged', {
                roots: roots.roots,
              });
            })
            .catch((error) => {
              if (
                error instanceof McpError &&
                error.code === ErrorCode.MethodNotFound
              ) {
                this.#logger.debug(
                  '[FastMCP debug] listRoots method not supported by client'
                );
              } else {
                this.#logger.error(
                  `[FastMCP error] received error listing roots.\n\n${
                    error instanceof Error ? error.stack : JSON.stringify(error)
                  }`
                );
              }
            });
        }
      );
    } else {
      this.#logger.debug(
        '[FastMCP debug] roots capability not available, not setting up notification handler'
      );
    }
  }

  private setupToolHandlers(tools: Tool<T>[]) {
    this.#server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: await Promise.all(
          tools.map(async (tool) => {
            return {
              annotations: tool.annotations,
              description: tool.description,
              inputSchema: tool.parameters
                ? await toJsonSchema(tool.parameters)
                : {
                    additionalProperties: false,
                    properties: {},
                    type: 'object',
                  }, // More complete schema for Cursor compatibility
              name: tool.name,
            };
          })
        ),
      };
    });

    this.#server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const tool = tools.find((tool) => tool.name === request.params.name);

      if (!tool) {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${request.params.name}`
        );
      }

      let args: unknown = undefined;

      if (tool.parameters) {
        const parsed = await tool.parameters['~standard'].validate(
          request.params.arguments
        );

        if (parsed.issues) {
          const friendlyErrors = this.#utils?.formatInvalidParamsErrorMessage
            ? this.#utils.formatInvalidParamsErrorMessage(parsed.issues)
            : parsed.issues
                .map((issue) => {
                  const path = issue.path?.join('.') || 'root';
                  return `${path}: ${issue.message}`;
                })
                .join(', ');

          throw new McpError(
            ErrorCode.InvalidParams,
            `Tool '${request.params.name}' parameter validation failed: ${friendlyErrors}. Please check the parameter types and values according to the tool's schema.`
          );
        }

        args = parsed.value;
      }

      const progressToken = request.params?._meta?.progressToken;

      let result: ContentResult;

      try {
        const reportProgress = async (progress: Progress) => {
          try {
            await this.#server.notification({
              method: 'notifications/progress',
              params: {
                ...progress,
                progressToken,
              },
            });

            if (this.#needsEventLoopFlush) {
              await new Promise((resolve) => setImmediate(resolve));
            }
          } catch (progressError) {
            this.#logger.warn(
              `[FastMCP warning] Failed to report progress for tool '${request.params.name}':`,
              progressError instanceof Error
                ? progressError.message
                : String(progressError)
            );
          }
        };

        const log = {
          debug: (message: string, context?: SerializableValue) => {
            this.#server.sendLoggingMessage({
              data: {
                context,
                message,
              },
              level: 'debug',
            });
          },
          error: (message: string, context?: SerializableValue) => {
            this.#server.sendLoggingMessage({
              data: {
                context,
                message,
              },
              level: 'error',
            });
          },
          info: (message: string, context?: SerializableValue) => {
            this.#server.sendLoggingMessage({
              data: {
                context,
                message,
              },
              level: 'info',
            });
          },
          warn: (message: string, context?: SerializableValue) => {
            this.#server.sendLoggingMessage({
              data: {
                context,
                message,
              },
              level: 'warning',
            });
          },
        };

        // Create a promise for tool execution
        // Streams partial results while a tool is still executing
        // Enables progressive rendering and real-time feedback
        const streamContent = async (content: Content | Content[]) => {
          const contentArray = Array.isArray(content) ? content : [content];

          try {
            await this.#server.notification({
              method: 'notifications/tool/streamContent',
              params: {
                content: contentArray,
                toolName: request.params.name,
              },
            });

            if (this.#needsEventLoopFlush) {
              await new Promise((resolve) => setImmediate(resolve));
            }
          } catch (streamError) {
            this.#logger.warn(
              `[FastMCP warning] Failed to stream content for tool '${request.params.name}':`,
              streamError instanceof Error
                ? streamError.message
                : String(streamError)
            );
          }
        };

        const executeToolPromise = tool.execute(args, {
          client: {
            version: this.#server.getClientVersion(),
          },
          log,
          reportProgress,
          session: this.#auth,
          streamContent,
        });

        // Handle timeout if specified
        const maybeStringResult = (await (tool.timeoutMs
          ? Promise.race([
              executeToolPromise,
              new Promise<never>((_, reject) => {
                const timeoutId = setTimeout(() => {
                  reject(
                    new UserError(
                      `Tool '${request.params.name}' timed out after ${tool.timeoutMs}ms. Consider increasing timeoutMs or optimizing the tool implementation.`
                    )
                  );
                }, tool.timeoutMs);

                // If promise resolves first
                executeToolPromise.finally(() => clearTimeout(timeoutId));
              }),
            ])
          : executeToolPromise)) as
          | AudioContent
          | ContentResult
          | ImageContent
          | null
          | ResourceContent
          | ResourceLink
          | string
          | TextContent
          | undefined;

        // Without this test, we are running into situations where the last progress update is not reported.
        // See the 'reports multiple progress updates without buffering' test in FastMCP.test.ts before refactoring.
        await delay(1);

        if (maybeStringResult === undefined || maybeStringResult === null) {
          result = ContentResultZodSchema.parse({
            content: [],
          });
        } else if (typeof maybeStringResult === 'string') {
          result = ContentResultZodSchema.parse({
            content: [{ text: maybeStringResult, type: 'text' }],
          });
        } else if ('type' in maybeStringResult) {
          result = ContentResultZodSchema.parse({
            content: [maybeStringResult],
          });
        } else {
          result = ContentResultZodSchema.parse(maybeStringResult);
        }
      } catch (error) {
        if (error instanceof UserError) {
          return {
            content: [{ text: error.message, type: 'text' }],
            isError: true,
          };
        }

        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              text: `Tool '${request.params.name}' execution failed: ${errorMessage}`,
              type: 'text',
            },
          ],
          isError: true,
        };
      }

      return result;
    });
  }
}

/**
 * Converts camelCase to snake_case for OAuth endpoint responses
 */
function camelToSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Converts an object with camelCase keys to snake_case keys
 */
function convertObjectToSnakeCase(
  obj: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = camelToSnakeCase(key);
    result[snakeKey] = value;
  }

  return result;
}

const FastMCPEventEmitterBase: {
  new (): StrictEventEmitter<EventEmitter, FastMCPEvents<FastMCPSessionAuth>>;
} = EventEmitter;

class FastMCPEventEmitter extends FastMCPEventEmitterBase {}

export class FastMCP<
  T extends FastMCPSessionAuth = FastMCPSessionAuth,
> extends FastMCPEventEmitter {
  public get sessions(): FastMCPSession<T>[] {
    return this.#sessions;
  }
  #authenticate: Authenticate<T> | undefined;
  #httpStreamServer: null | SSEServer = null;
  #logger: Logger;
  #options: ServerOptions<T>;
  #prompts: InputPrompt<T>[] = [];
  #resources: Resource<T>[] = [];
  #resourcesTemplates: InputResourceTemplate<T>[] = [];
  #sessions: FastMCPSession<T>[] = [];

  #tools: Tool<T>[] = [];

  constructor(public options: ServerOptions<T>) {
    super();

    this.#options = options;
    this.#authenticate = options.authenticate;
    this.#logger = options.logger || console;
  }

  /**
   * Adds a prompt to the server.
   */
  public addPrompt<const Args extends InputPromptArgument<T>[]>(
    prompt: InputPrompt<T, Args>
  ) {
    this.#prompts.push(prompt);
  }

  /**
   * Adds a resource to the server.
   */
  public addResource(resource: Resource<T>) {
    this.#resources.push(resource);
  }

  /**
   * Adds a resource template to the server.
   */
  public addResourceTemplate<
    const Args extends InputResourceTemplateArgument[],
  >(resource: InputResourceTemplate<T, Args>) {
    this.#resourcesTemplates.push(resource);
  }

  /**
   * Adds a tool to the server.
   */
  public addTool<Params extends ToolParameters>(tool: Tool<T, Params>) {
    this.#tools.push(tool as unknown as Tool<T>);
  }

  /**
   * Embeds a resource by URI, making it easy to include resources in tool responses.
   *
   * @param uri - The URI of the resource to embed
   * @returns Promise<ResourceContent> - The embedded resource content
   */
  public async embedded(uri: string): Promise<ResourceContent['resource']> {
    // First, try to find a direct resource match
    const directResource = this.#resources.find(
      (resource) => resource.uri === uri
    );

    if (directResource) {
      const result = await directResource.load();
      const results = Array.isArray(result) ? result : [result];
      const firstResult = results[0];

      const resourceData: ResourceContent['resource'] = {
        mimeType: directResource.mimeType,
        uri,
      };

      if ('text' in firstResult) {
        resourceData.text = firstResult.text;
      }

      if ('blob' in firstResult) {
        resourceData.blob = firstResult.blob;
      }

      return resourceData;
    }

    // Try to match against resource templates
    for (const template of this.#resourcesTemplates) {
      // Check if the URI starts with the template base
      const templateBase = template.uriTemplate.split('{')[0];

      if (uri.startsWith(templateBase)) {
        const params: Record<string, string> = {};
        const templateParts = template.uriTemplate.split('/');
        const uriParts = uri.split('/');

        for (let i = 0; i < templateParts.length; i++) {
          const templatePart = templateParts[i];

          if (templatePart?.startsWith('{') && templatePart.endsWith('}')) {
            const paramName = templatePart.slice(1, -1);
            const paramValue = uriParts[i];

            if (paramValue) {
              params[paramName] = paramValue;
            }
          }
        }

        const result = await template.load(
          params as ResourceTemplateArgumentsToObject<typeof template.arguments>
        );

        const resourceData: ResourceContent['resource'] = {
          mimeType: template.mimeType,
          uri,
        };

        if ('text' in result) {
          resourceData.text = result.text;
        }

        if ('blob' in result) {
          resourceData.blob = result.blob;
        }

        return resourceData; // The resource we're looking for
      }
    }

    throw new UnexpectedStateError(`Resource not found: ${uri}`, { uri });
  }

  /**
   * Starts the server.
   */
  public async start(
    options?: Partial<{
      httpStream: {
        enableJsonResponse?: boolean;
        endpoint?: `/${string}`;
        eventStore?: EventStore;
        host?: string;
        port: number;
        stateless?: boolean;
      };
      transportType: 'httpStream' | 'stdio';
    }>
  ) {
    const config = this.#parseRuntimeConfig(options);

    if (config.transportType === 'stdio') {
      const transport = new StdioServerTransport();

      // For stdio transport, if authenticate function is provided, call it
      // with undefined request (since stdio doesn't have HTTP request context)
      let auth: T | undefined;

      if (this.#authenticate) {
        try {
          auth = await this.#authenticate(
            undefined as unknown as http.IncomingMessage
          );
        } catch (error) {
          this.#logger.error(
            '[FastMCP error] Authentication failed for stdio transport:',
            error instanceof Error ? error.message : String(error)
          );
          // Continue without auth if authentication fails
        }
      }

      const session = new FastMCPSession<T>({
        auth,
        instructions: this.#options.instructions,
        logger: this.#logger,
        name: this.#options.name,
        ping: this.#options.ping,
        prompts: this.#prompts,
        resources: this.#resources,
        resourcesTemplates: this.#resourcesTemplates,
        roots: this.#options.roots,
        tools: this.#tools,
        transportType: 'stdio',
        utils: this.#options.utils,
        version: this.#options.version,
      });

      await session.connect(transport);

      this.#sessions.push(session);

      session.once('error', () => {
        this.#removeSession(session);
      });

      // Monitor the underlying transport for close events
      if (transport.onclose) {
        const originalOnClose = transport.onclose;

        transport.onclose = () => {
          this.#removeSession(session);

          if (originalOnClose) {
            originalOnClose();
          }
        };
      } else {
        transport.onclose = () => {
          this.#removeSession(session);
        };
      }

      this.emit('connect', {
        session: session as FastMCPSession<FastMCPSessionAuth>,
      });
    } else if (config.transportType === 'httpStream') {
      const httpConfig = config.httpStream;

      if (httpConfig.stateless) {
        // Stateless mode - create new server instance for each request
        this.#logger.info(
          `[FastMCP info] Starting server in stateless mode on HTTP Stream at http://${httpConfig.host}:${httpConfig.port}${httpConfig.endpoint}`
        );

        this.#httpStreamServer = await startHTTPServer<FastMCPSession<T>>({
          createServer: async (request) => {
            const auth = await this.#authenticateRequest(request);

            // In stateless mode, create a new session for each request
            // without persisting it in the sessions array
            return this.#createSession(auth);
          },
          enableJsonResponse: httpConfig.enableJsonResponse,
          eventStore: httpConfig.eventStore,
          host: httpConfig.host,
          oauth: this.#options.oauth,
          // In stateless mode, we don't track sessions
          onClose: async () => {
            // No session tracking in stateless mode
          },
          onConnect: async () => {
            // No persistent session tracking in stateless mode
            this.#logger.debug(
              `[FastMCP debug] Stateless HTTP Stream request handled`
            );
          },
          onUnhandledRequest: async (req, res) => {
            await this.#handleUnhandledRequest(req, res, true, httpConfig.host);
          },
          port: httpConfig.port,
          sseEndpoint: '/sse', // Server-Sent Events endpoint for streaming events
          stateless: true,
          streamEndpoint: httpConfig.endpoint,
        });
      } else {
        // Regular mode with session management
        this.#httpStreamServer = await startHTTPServer<FastMCPSession<T>>({
          createServer: async (request) => {
            const auth = await this.#authenticateRequest(request);

            return this.#createSession(auth);
          },
          enableJsonResponse: httpConfig.enableJsonResponse,
          eventStore: httpConfig.eventStore,
          host: httpConfig.host,
          oauth: this.#options.oauth,
          onClose: async (session) => {
            const sessionIndex = this.#sessions.indexOf(session);

            if (sessionIndex !== -1) this.#sessions.splice(sessionIndex, 1);

            this.emit('disconnect', {
              session: session as FastMCPSession<FastMCPSessionAuth>,
            });
          },
          onConnect: async (session) => {
            this.#sessions.push(session);

            this.#logger.info(`[FastMCP info] HTTP Stream session established`);

            this.emit('connect', {
              session: session as FastMCPSession<FastMCPSessionAuth>,
            });
          },

          onUnhandledRequest: async (req, res) => {
            await this.#handleUnhandledRequest(
              req,
              res,
              false,
              httpConfig.host
            );
          },
          port: httpConfig.port,
          sseEndpoint: '/sse',
          streamEndpoint: httpConfig.endpoint,
        });

        this.#logger.info(
          `[FastMCP info] server is running on HTTP Stream at http://${httpConfig.host}:${httpConfig.port}${httpConfig.endpoint}`
        );
        this.#logger.info(
          `[FastMCP info] Transport type: httpStream (Streamable HTTP, not SSE)`
        );
      }
    } else {
      throw new Error('Invalid transport type');
    }
  }

  /**
   * Stops the server.
   */
  public async stop() {
    if (this.#httpStreamServer) {
      await this.#httpStreamServer.close();
    }
  }

  async #authenticateRequest(
    request: http.IncomingMessage
  ): Promise<T | undefined> {
    if (!this.#authenticate) {
      return undefined;
    }

    try {
      return await this.#authenticate(request);
    } catch (error) {
      const response = this.#createOAuthChallengeResponse(error);

      if (response) {
        throw response;
      }

      throw error;
    }
  }

  #createOAuthChallengeResponse(error: unknown): Response | undefined {
    // Preserve caller-provided HTTP responses, such as custom API-key auth
    // failures. Only synthesize an OAuth challenge for ordinary thrown errors.
    if (error instanceof Response) {
      return undefined;
    }

    const resourceMetadataUrl =
      this.#options.oauth?.protectedResourceMetadataUrl;

    if (!this.#options.oauth?.enabled || !resourceMetadataUrl) {
      return undefined;
    }

    const errorMessage =
      error instanceof Error ? error.message : String(error || 'Unauthorized');
    const wwwAuthenticate = [
      `resource_metadata="${escapeWWWAuthenticateValue(resourceMetadataUrl)}"`,
      `error="invalid_token"`,
      `error_description="${escapeWWWAuthenticateValue(errorMessage)}"`,
    ].join(', ');

    return new Response(
      JSON.stringify({
        error: 'invalid_token',
        error_description: errorMessage,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'WWW-Authenticate': `Bearer ${wwwAuthenticate}`,
        },
        status: 401,
      }
    );
  }

  /**
   * Creates a new FastMCPSession instance with the current configuration.
   * Used both for regular sessions and stateless requests.
   */
  #createSession(auth?: T): FastMCPSession<T> {
    const allowedTools = auth
      ? this.#tools.filter((tool) =>
          tool.canAccess ? tool.canAccess(auth) : true
        )
      : this.#tools;
    return new FastMCPSession<T>({
      auth,
      instructions: this.#options.instructions,
      logger: this.#logger,
      name: this.#options.name,
      ping: this.#options.ping,
      prompts: this.#prompts,
      resources: this.#resources,
      resourcesTemplates: this.#resourcesTemplates,
      roots: this.#options.roots,
      tools: allowedTools,
      transportType: 'httpStream',
      utils: this.#options.utils,
      version: this.#options.version,
    });
  }

  /**
   * Handles unhandled HTTP requests with health, readiness, and OAuth endpoints
   */
  #handleUnhandledRequest = async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    isStateless = false,
    host: string
  ) => {
    const url = new URL(req.url || '', `http://${host}`);

    // mcp-proxy's legacy SSE transport still advertises /messages as the
    // client POST endpoint. Leave it for the proxy handler instead of
    // treating it as an app-level 404.
    if (url.pathname === '/messages') {
      return;
    }

    const healthConfig = this.#options.health ?? {};

    const enabled =
      healthConfig.enabled === undefined ? true : healthConfig.enabled;

    if (enabled) {
      const path = healthConfig.path ?? '/health';
      try {
        if (req.method === 'GET' && url.pathname === path) {
          res
            .writeHead(healthConfig.status ?? 200, {
              'Content-Type': 'text/plain',
            })
            .end(healthConfig.message ?? '✓ Ok');

          return;
        }

        // Enhanced readiness check endpoint
        if (req.method === 'GET' && url.pathname === '/ready') {
          if (isStateless) {
            // In stateless mode, we're always ready if the server is running
            const response = {
              mode: 'stateless',
              ready: 1,
              status: 'ready',
              total: 1,
            };

            res
              .writeHead(200, {
                'Content-Type': 'application/json',
              })
              .end(JSON.stringify(response));
          } else {
            const readySessions = this.#sessions.filter(
              (s) => s.isReady
            ).length;
            const totalSessions = this.#sessions.length;
            const allReady =
              readySessions === totalSessions && totalSessions > 0;

            const response = {
              ready: readySessions,
              status: allReady
                ? 'ready'
                : totalSessions === 0
                  ? 'no_sessions'
                  : 'initializing',
              total: totalSessions,
            };

            res
              .writeHead(allReady ? 200 : 503, {
                'Content-Type': 'application/json',
              })
              .end(JSON.stringify(response));
          }

          return;
        }
      } catch (error) {
        this.#logger.error('[FastMCP error] health endpoint error', error);
      }
    }

    const openaiAppsChallengeConfig = this.#options.openaiAppsChallenge;
    const openaiAppsChallengeToken = openaiAppsChallengeConfig?.token?.trim();
    const openaiAppsChallengeEnabled =
      openaiAppsChallengeConfig?.enabled !== false &&
      !!openaiAppsChallengeToken;

    if (openaiAppsChallengeEnabled && req.method === 'GET') {
      const path =
        openaiAppsChallengeConfig?.path ?? '/.well-known/openai-apps-challenge';
      if (url.pathname === path) {
        res
          .writeHead(200, {
            'Content-Type': 'text/plain',
          })
          .end(openaiAppsChallengeToken);
        return;
      }
    }

    // Handle OAuth well-known endpoints
    const oauthConfig = this.#options.oauth;
    if (oauthConfig?.enabled && req.method === 'GET') {
      if (
        url.pathname === '/.well-known/oauth-authorization-server' &&
        oauthConfig.authorizationServer
      ) {
        const metadata = convertObjectToSnakeCase(
          oauthConfig.authorizationServer
        );
        res
          .writeHead(200, {
            'Content-Type': 'application/json',
          })
          .end(JSON.stringify(metadata));
        return;
      }

      if (
        url.pathname === '/.well-known/oauth-protected-resource' &&
        oauthConfig.protectedResource
      ) {
        const metadata = convertObjectToSnakeCase(
          oauthConfig.protectedResource
        );
        res
          .writeHead(200, {
            'Content-Type': 'application/json',
          })
          .end(JSON.stringify(metadata));
        return;
      }
    }

    // If the request was not handled above, return 404
    res.writeHead(404).end();
  };

  #parseRuntimeConfig(
    overrides?: Partial<{
      httpStream: {
        enableJsonResponse?: boolean;
        endpoint?: `/${string}`;
        host?: string;
        port: number;
        stateless?: boolean;
      };
      transportType: 'httpStream' | 'stdio';
    }>
  ):
    | {
        httpStream: {
          enableJsonResponse?: boolean;
          endpoint: `/${string}`;
          eventStore?: EventStore;
          host: string;
          port: number;
          stateless?: boolean;
        };
        transportType: 'httpStream';
      }
    | { transportType: 'stdio' } {
    const args = process.argv.slice(2);
    const getArg = (name: string) => {
      const index = args.findIndex((arg) => arg === `--${name}`);

      return index !== -1 && index + 1 < args.length
        ? args[index + 1]
        : undefined;
    };

    const transportArg = getArg('transport');
    const portArg = getArg('port');
    const endpointArg = getArg('endpoint');
    const statelessArg = getArg('stateless');
    const hostArg = getArg('host');

    const envTransport = process.env.FASTMCP_TRANSPORT;
    const envPort = process.env.FASTMCP_PORT;
    const envEndpoint = process.env.FASTMCP_ENDPOINT;
    const envStateless = process.env.FASTMCP_STATELESS;
    const envHost = process.env.FASTMCP_HOST;
    // Overrides > CLI > env > defaults
    const transportType =
      overrides?.transportType ||
      (transportArg === 'http-stream' ? 'httpStream' : transportArg) ||
      envTransport ||
      'stdio';

    if (transportType === 'httpStream') {
      const port = parseInt(
        overrides?.httpStream?.port?.toString() || portArg || envPort || '8080'
      );
      const host =
        overrides?.httpStream?.host || hostArg || envHost || 'localhost';
      const endpoint =
        overrides?.httpStream?.endpoint || endpointArg || envEndpoint || '/mcp';
      const enableJsonResponse =
        overrides?.httpStream?.enableJsonResponse || false;
      const stateless =
        overrides?.httpStream?.stateless ||
        statelessArg === 'true' ||
        envStateless === 'true' ||
        false;

      return {
        httpStream: {
          enableJsonResponse,
          endpoint: endpoint as `/${string}`,
          host,
          port,
          stateless,
        },
        transportType: 'httpStream' as const,
      };
    }

    return { transportType: 'stdio' as const };
  }

  #removeSession(session: FastMCPSession<T>): void {
    const sessionIndex = this.#sessions.indexOf(session);

    if (sessionIndex !== -1) {
      this.#sessions.splice(sessionIndex, 1);
      this.emit('disconnect', {
        session: session as FastMCPSession<FastMCPSessionAuth>,
      });
    }
  }
}

export type {
  AudioContent,
  Content,
  ContentResult,
  Context,
  FastMCPEvents,
  FastMCPSessionEvents,
  ImageContent,
  InputPrompt,
  InputPromptArgument,
  LoggingLevel,
  Progress,
  Prompt,
  PromptArgument,
  Resource,
  ResourceContent,
  ResourceLink,
  ResourceResult,
  ResourceTemplate,
  ResourceTemplateArgument,
  SerializableValue,
  ServerOptions,
  TextContent,
  Tool,
  ToolParameters,
};
