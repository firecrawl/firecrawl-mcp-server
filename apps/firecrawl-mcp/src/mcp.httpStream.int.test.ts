import dotenv from 'dotenv';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

dotenv.config({ quiet: true });

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      server.close(() => {
        if (addr && typeof addr === 'object') resolve(addr.port);
        else reject(new Error('Failed to get free port'));
      });
    });
  });
}

async function waitForHealth(url: URL, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) return;
    } catch {
      // ignore and retry
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Server not healthy within ${timeoutMs}ms`);
}

function unwrapToolText(res: any): string {
  const text = res?.content?.find((c: any) => c?.type === 'text')?.text;
  if (typeof text !== 'string') throw new Error('Expected text content');
  if (res?.isError === true) throw new Error(text);
  return text;
}

function parseToolJson(res: any): any {
  const text = unwrapToolText(res);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON tool output, got: ${text.slice(0, 200)}`);
  }
}

describe('mcp integration (real API) - httpStream', () => {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    it.skip('requires FIRECRAWL_API_KEY', () => {});
    return;
  }

  const mcpPath = path.resolve('apps/firecrawl-mcp/dist/mcp.js');
  let proc: ChildProcessWithoutNullStreams | undefined;
  let client: Client | undefined;

  async function startServer(env: Record<string, string | undefined>, port: number) {
    proc = spawn(process.execPath, [mcpPath], {
      env: {
        ...process.env,
        ...env,
        FASTMCP_TRANSPORT: 'httpStream',
        FASTMCP_HOST: '127.0.0.1',
        FASTMCP_PORT: String(port),
        FASTMCP_ENDPOINT: '/mcp',
        FORCE_COLOR: '0',
        NO_COLOR: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }

  async function stopServer() {
    if (client) {
      await client.close().catch(() => {});
      client = undefined;
    }
    if (proc) {
      proc.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 200));
      proc.kill('SIGKILL');
      proc = undefined;
    }
  }

  afterEach(async () => {
    await stopServer();
  });

  it('scrape (env auth)', async () => {
    const port = await getFreePort();
    await startServer({ FIRECRAWL_API_KEY: apiKey, FIRECRAWL_MCP_DOCS: 'short' }, port);

    await waitForHealth(new URL(`http://127.0.0.1:${port}/health`), 10_000);

    client = new Client({ name: 'integration-test', version: '0.0.0' }, { capabilities: {} });
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`));
    await client.connect(transport);

    const res = await client.callTool({
      name: 'firecrawl_scrape',
      arguments: { url: 'https://example.com', formats: ['markdown'], onlyMainContent: true },
    });
    const json = parseToolJson(res);
    const markdown =
      typeof json?.markdown === 'string'
        ? json.markdown
        : typeof json?.data?.markdown === 'string'
          ? json.data.markdown
          : undefined;
    expect(markdown).toContain('Example Domain');
  }, 90_000);

  it('scrape (cloud header auth)', async () => {
    const port = await getFreePort();
    await startServer({ CLOUD_SERVICE: 'true', FIRECRAWL_MCP_DOCS: 'short' }, port);

    await waitForHealth(new URL(`http://127.0.0.1:${port}/health`), 10_000);

    client = new Client({ name: 'integration-test', version: '0.0.0' }, { capabilities: {} });
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
      requestInit: {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      },
    });
    await client.connect(transport);

    const res = await client.callTool({
      name: 'firecrawl_scrape',
      arguments: { url: 'https://example.com', formats: ['markdown'], onlyMainContent: true },
    });
    const json = parseToolJson(res);
    const markdown =
      typeof json?.markdown === 'string'
        ? json.markdown
        : typeof json?.data?.markdown === 'string'
          ? json.data.markdown
          : undefined;
    expect(markdown).toContain('Example Domain');
  }, 90_000);
});

