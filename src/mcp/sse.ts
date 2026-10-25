import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { type JSONRPCMessage, type Transport, parseJSONRPCMessage } from '@modelcontextprotocol/server';

const MAXIMUM_MESSAGE_SIZE = 4 * 1024 * 1024;

/**
 * The HTTP+SSE transport of protocol revision 2024-11-05: the client opens an
 * event stream with GET, learns the URL to POST its messages to from the
 * first `endpoint` event, and reads every response from the stream.
 */
export class LegacySseTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: Transport['onmessage'];

  readonly sessionId = randomUUID();
  #stream: ServerResponse | undefined;

  constructor(
    private readonly endpoint: string,
    private readonly response: ServerResponse
  ) {}

  async start(): Promise<void> {
    if (this.#stream) throw new Error('LegacySseTransport already started');
    this.response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    const url = new URL(this.endpoint, 'http://localhost');
    url.searchParams.set('sessionId', this.sessionId);
    this.response.write(`event: endpoint\ndata: ${url.pathname}${url.search}${url.hash}\n\n`);
    this.#stream = this.response;
    this.response.on('close', () => {
      this.#stream = undefined;
      this.onclose?.();
    });
  }

  async handlePostMessage(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (!this.#stream) {
      response.writeHead(500).end('SSE connection not established');
      return;
    }
    let body: string;
    try {
      const contentType = (request.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
      if (contentType !== 'application/json') {
        throw new Error(`Unsupported content-type: ${contentType}`);
      }
      body = await readText(request);
    } catch (error) {
      response.writeHead(400).end(String(error));
      this.onerror?.(error as Error);
      return;
    }
    let message: JSONRPCMessage;
    try {
      const parsed: unknown = JSON.parse(body);
      try {
        message = parseJSONRPCMessage(parsed);
      } catch (error) {
        this.onerror?.(error as Error);
        throw error;
      }
    } catch {
      response.writeHead(400).end(`Invalid message: ${body}`);
      return;
    }
    this.onmessage?.(message);
    response.writeHead(202).end('Accepted');
  }

  async close(): Promise<void> {
    this.#stream?.end();
    this.#stream = undefined;
    this.onclose?.();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.#stream) throw new Error('Not connected');
    this.#stream.write(`event: message\ndata: ${JSON.stringify(message)}\n\n`);
  }
}

function readText(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request
      .on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAXIMUM_MESSAGE_SIZE) {
          reject(new Error('request entity too large'));
          request.removeAllListeners('data');
          request.pause();
          return;
        }
        chunks.push(chunk);
      })
      .on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      .on('error', reject);
  });
}
