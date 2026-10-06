/**
 * HTTP compatibility bridge for 2026-07-28/MRTR clients. The pinned SDK predates
 * that protocol. Use its existing authenticated FastMCP handlers over a local
 * transport, never its legacy HTTP transport or an invented initialize call.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastMCPSession } from 'fastmcp';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

const version = '2026-07-28';
const metaPrefix = 'io.modelcontextprotocol/';
const legacyVersions = [
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
  '2024-10-07',
];
const requestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number().int()]),
  method: z.string(),
  params: z
    .object({
      _meta: z
        .object({
          [`${metaPrefix}protocolVersion`]: z.string(),
          [`${metaPrefix}clientCapabilities`]: z.record(
            z.string(),
            z.unknown()
          ),
          [`${metaPrefix}clientInfo`]: z
            .object({ name: z.string(), version: z.string() })
            .passthrough()
            .optional(),
        })
        .passthrough(),
    })
    .passthrough(),
});

function decodeHeader(
  value: string | string[] | undefined
): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (!value.startsWith('=?base64?') || !value.endsWith('?=')) return value;
  const encoded = value.slice(9, -2);
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      encoded
    )
  )
    return undefined;
  return Buffer.from(encoded, 'base64').toString('utf8');
}

export function modernHttpHandler<
  T extends { [key: string]: unknown },
>(options: {
  endpoint: string;
  authenticate: (request: IncomingMessage) => Promise<T>;
  serverVersion: string;
  instructions: string;
}) {
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    createSession: (auth: T) => FastMCPSession<T>,
    readBody: (maxBytes?: number) => Promise<unknown>
  ): Promise<boolean> => {
    const headerVersion = req.headers['mcp-protocol-version'];
    if (
      req.method !== 'POST' ||
      new URL(req.url ?? '/', 'http://localhost').pathname !== options.endpoint
    )
      return false;
    const reply = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    let id: string | number | null = null;
    const error = (
      status: number,
      code: number,
      message: string,
      data?: unknown
    ) =>
      reply(status, {
        jsonrpc: '2.0',
        id,
        error: { code, message, ...(data === undefined ? {} : { data }) },
      });
    let raw: unknown;
    try {
      raw = await readBody(
        typeof headerVersion === 'string' &&
          !legacyVersions.includes(headerVersion)
          ? 1024 * 1024
          : undefined
      );
    } catch (cause) {
      error(
        cause instanceof RangeError ? 413 : 400,
        -32600,
        'Unable to read MCP request'
      );
      return true;
    }
    const bodyMeta = z
      .object({
        params: z
          .object({ _meta: z.record(z.string(), z.unknown()).optional() })
          .passthrough()
          .optional(),
      })
      .safeParse(raw);
    const bodyVersion = bodyMeta.success
      ? bodyMeta.data.params?._meta?.[`${metaPrefix}protocolVersion`]
      : undefined;
    // Cached parsing lets legacy traffic fall through without rereading a
    // consumed stream. A modern body cannot bypass validation by omitting or
    // downgrading its HTTP version header.
    if (
      (headerVersion === undefined ||
        (typeof headerVersion === 'string' &&
          legacyVersions.includes(headerVersion))) &&
      (bodyVersion === undefined ||
        (typeof bodyVersion === 'string' &&
          legacyVersions.includes(bodyVersion)))
    )
      return false;
    if (
      raw &&
      typeof raw === 'object' &&
      'id' in raw &&
      (typeof raw.id === 'string' || typeof raw.id === 'number')
    )
      id = raw.id;
    const parsed = requestSchema.safeParse(raw);
    if (!parsed.success) {
      error(
        400,
        -32602,
        'Invalid request or missing per-request protocol metadata'
      );
      return true;
    }
    if (headerVersion !== bodyVersion) {
      error(
        400,
        -32020,
        'Protocol version header does not match request metadata'
      );
      return true;
    }
    if (headerVersion !== version) {
      error(400, -32022, 'Unsupported protocol version', {
        requested: headerVersion,
        supported: [version, ...legacyVersions],
      });
      return true;
    }
    if (!req.headers['content-type']?.startsWith('application/json')) {
      error(415, -32600, 'Content-Type must be application/json');
      return true;
    }
    if (!req.headers.accept?.includes('application/json')) {
      error(406, -32600, 'Accept must include application/json');
      return true;
    }
    const request = parsed.data;
    const name =
      request.method === 'resources/read'
        ? request.params.uri
        : request.params.name;
    if (
      request.params._meta[`${metaPrefix}protocolVersion`] !== version ||
      req.headers['mcp-method'] !== request.method ||
      (['tools/call', 'resources/read', 'prompts/get'].includes(
        request.method
      ) &&
        decodeHeader(req.headers['mcp-name']) !== name)
    ) {
      error(
        400,
        -32020,
        'Protocol, method, or name header does not match the request'
      );
      return true;
    }
    let auth: T;
    try {
      auth = await options.authenticate(req);
    } catch (cause) {
      // Reuse the existing OAuth challenges, validation outage, and retry headers.
      if (cause instanceof Response) {
        res.writeHead(cause.status, Object.fromEntries(cause.headers));
        res.end(await cause.text());
      } else error(500, -32603, 'Authentication failed');
      return true;
    }
    if (request.method === 'server/discover') {
      reply(200, {
        jsonrpc: '2.0',
        id,
        result: {
          resultType: 'complete',
          supportedVersions: [version, ...legacyVersions],
          capabilities: { tools: {} },
          _meta: {
            [`${metaPrefix}serverInfo`]: {
              name: 'firecrawl-fastmcp',
              version: options.serverVersion,
            },
          },
          instructions: options.instructions,
        },
      });
      return true;
    }
    // The current server publishes tools only. Do not advertise unsupported
    // modern subscriptions or legacy logging/initialization RPCs.
    if (!['tools/list', 'tools/call', 'ping'].includes(request.method)) {
      error(404, -32601, 'Method not found');
      return true;
    }
    let session: FastMCPSession<T>;
    try {
      session = createSession(auth);
    } catch {
      error(500, -32603, 'Unable to create authenticated tool session');
      return true;
    }
    const transport: Transport = {
      start: async () => {},
      close: async () => {},
      send: async (message: JSONRPCMessage) => {
        if (!('id' in message) || message.id !== id) return;
        if ('result' in message)
          reply(200, {
            ...message,
            result: { resultType: 'complete', ...message.result },
          });
        else if ('error' in message)
          reply(message.error.code === -32601 ? 404 : 400, message);
      },
    };
    const abort = () => void session.server.close();
    res.once('close', abort);
    try {
      await session.server.connect(transport);
      await new Promise<void>((resolve, reject) => {
        res.once('finish', resolve);
        res.once('close', resolve);
        transport.onerror = reject;
        transport.onmessage?.(request as JSONRPCMessage);
      });
    } catch {
      if (!res.writableEnded) error(500, -32603, 'Internal server error');
    } finally {
      res.off('close', abort);
      await session.server.close();
    }
    return true;
  };
}
