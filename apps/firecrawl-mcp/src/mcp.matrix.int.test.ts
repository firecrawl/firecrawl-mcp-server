import dotenv from 'dotenv';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

dotenv.config({ quiet: true });

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

describe('mcp integration (real API) - stdio', () => {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    it.skip('requires FIRECRAWL_API_KEY', () => {});
    return;
  }

  const mcpPath = path.resolve('apps/firecrawl-mcp/dist/mcp.js');
  let transport: StdioClientTransport;
  let client: Client;

  beforeAll(async () => {
    transport = new StdioClientTransport({
      command: process.execPath,
      args: [mcpPath],
      env: {
        ...process.env,
        FIRECRAWL_API_KEY: apiKey,
        FIRECRAWL_MCP_DOCS: 'short',
        FORCE_COLOR: '0',
        NO_COLOR: '1',
      },
      stderr: 'pipe',
    });
    client = new Client({ name: 'integration-test', version: '0.0.0' }, { capabilities: {} });
    await client.connect(transport);
  }, 30_000);

  afterAll(async () => {
    await client.close().catch(() => {});
  });

  it('capabilities', async () => {
    const res = await client.callTool({ name: 'firecrawl_capabilities', arguments: {} });
    const json = parseToolJson(res);
    expect(json.docsMode).toBeDefined();
  }, 30_000);

  it('scrape', async () => {
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
  }, 60_000);

  it('map', async () => {
    const res = await client.callTool({
      name: 'firecrawl_map',
      arguments: { url: 'https://example.com', limit: 10 },
    });
    const json = parseToolJson(res);
    const links = (json?.links ?? json?.urls ?? json?.data) as unknown;
    expect(Array.isArray(links)).toBe(true);
  }, 60_000);

  it('search', async () => {
    const res = await client.callTool({
      name: 'firecrawl_search',
      arguments: { query: 'Example Domain', limit: 1, sources: ['web'] },
    });
    const json = parseToolJson(res);
    expect(json).toBeTruthy();
  }, 90_000);

  it('crawl + check_crawl_status', async () => {
    const started = await client.callTool({
      name: 'firecrawl_crawl',
      arguments: { url: 'https://example.com', limit: 1, maxDiscoveryDepth: 1 },
    });
    const startJson = parseToolJson(started);
    const id = String(startJson?.id ?? startJson?.jobId ?? startJson?.data?.id ?? '');
    expect(id.length).toBeGreaterThan(0);

    const status = await client.callTool({
      name: 'firecrawl_check_crawl_status',
      arguments: { id },
    });
    const statusJson = parseToolJson(status);
    expect(statusJson).toBeTruthy();
  }, 120_000);

  it('extract', async () => {
    const res = await client.callTool(
      {
        name: 'firecrawl_extract',
        arguments: {
          urls: ['https://example.com'],
          prompt: 'Extract the page title as { "title": string }.',
          schema: {
            type: 'object',
            properties: { title: { type: 'string' } },
            required: ['title'],
          },
        },
      },
      undefined,
      { timeout: 180_000 }
    );
    const json = parseToolJson(res);
    expect(json).toBeTruthy();
  }, 180_000);

  it('agent + agent_status', async () => {
    const started = await client.callTool({
      name: 'firecrawl_agent',
      arguments: { prompt: 'Visit https://example.com and return the page title.' },
    });
    const startJson = parseToolJson(started);
    const id = String(startJson?.id ?? startJson?.jobId ?? startJson?.data?.id ?? '');
    expect(id.length).toBeGreaterThan(0);

    const status = await client.callTool({
      name: 'firecrawl_agent_status',
      arguments: { id },
    });
    const statusJson = parseToolJson(status);
    expect(statusJson).toBeTruthy();
  }, 240_000);
});
