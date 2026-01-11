import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

type ListedTool = {
  name: string;
  description?: string;
  inputSchema?: unknown;
};

function getToolText(res: any): string {
  const text = res?.content?.find((c: any) => c?.type === 'text')?.text;
  if (typeof text !== 'string') throw new Error('Expected text tool output');
  return text;
}

describe('mcp contract (no API key)', () => {
  const mcpPath = path.resolve('apps/firecrawl-mcp/dist/mcp.js');
  let transport: StdioClientTransport;
  let client: Client;

  beforeAll(async () => {
    transport = new StdioClientTransport({
      command: process.execPath,
      args: [mcpPath],
      env: {
        ...process.env,
        // Make auth pass without needing a real API key, and force all network calls to fail fast locally.
        FIRECRAWL_API_URL: 'http://127.0.0.1:1',
        FIRECRAWL_MCP_DOCS: 'short',
        FORCE_COLOR: '0',
        NO_COLOR: '1',
      },
      stderr: 'pipe',
    });
    client = new Client({ name: 'contract-test', version: '0.0.0' }, { capabilities: {} });
    await client.connect(transport);
  }, 30_000);

  afterAll(async () => {
    await client.close().catch(() => {});
  });

  it('lists expected tools with JSON-schema input shapes', async () => {
    const expected = [
      'firecrawl_capabilities',
      'firecrawl_scrape',
      'firecrawl_map',
      'firecrawl_search',
      'firecrawl_crawl',
      'firecrawl_check_crawl_status',
      'firecrawl_extract',
      'firecrawl_agent',
      'firecrawl_agent_status',
    ];

    const listed = await client.listTools();
    const tools = (listed.tools ?? []) as ListedTool[];
    const byName = new Map(tools.map((t) => [t.name, t]));

    for (const name of expected) {
      expect(byName.has(name)).toBe(true);
    }

    for (const name of expected) {
      const tool = byName.get(name)!;
      expect(typeof tool.description).toBe('string');
      expect(tool.description!.length).toBeGreaterThan(0);

      if (name === 'firecrawl_capabilities') continue;

      const inputSchema = tool.inputSchema as any;
      expect(inputSchema && typeof inputSchema === 'object').toBe(true);
      expect(inputSchema.type).toBe('object');
      expect(inputSchema.properties && typeof inputSchema.properties === 'object').toBe(true);
    }

    // Spot-check required fields for a few tools so accidental schema drift is caught early.
    expect((byName.get('firecrawl_scrape')!.inputSchema as any).properties.url).toBeTruthy();
    expect((byName.get('firecrawl_search')!.inputSchema as any).properties.query).toBeTruthy();
    expect((byName.get('firecrawl_check_crawl_status')!.inputSchema as any).properties.id).toBeTruthy();
    expect((byName.get('firecrawl_agent_status')!.inputSchema as any).properties.id).toBeTruthy();
  });

  it('capabilities returns JSON; other tools return structured MCP errors without credentials', async () => {
    const capabilities = await client.callTool({ name: 'firecrawl_capabilities', arguments: {} });
    const capText = getToolText(capabilities);
    const capJson = JSON.parse(capText);
    expect(capJson).toHaveProperty('docsMode');

    // Other tools should fail (no real API) but still return MCP-compliant errors.
    const calls: Array<{ name: string; arguments: any }> = [
      { name: 'firecrawl_scrape', arguments: { url: 'https://example.com' } },
      { name: 'firecrawl_map', arguments: { url: 'https://example.com', limit: 1 } },
      { name: 'firecrawl_search', arguments: { query: 'example', limit: 1, sources: ['web'] } },
      { name: 'firecrawl_crawl', arguments: { url: 'https://example.com', limit: 1, maxDiscoveryDepth: 1 } },
      { name: 'firecrawl_check_crawl_status', arguments: { id: 'nonexistent' } },
      {
        name: 'firecrawl_extract',
        arguments: {
          urls: ['https://example.com'],
          prompt: 'Return { "ok": true }.',
          schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] },
        },
      },
      { name: 'firecrawl_agent', arguments: { prompt: 'Visit https://example.com.' } },
      { name: 'firecrawl_agent_status', arguments: { id: 'nonexistent' } },
    ];

    for (const c of calls) {
      const res = await client.callTool(c, undefined, { timeout: 2_000 }).catch((e) => {
        throw new Error(`callTool threw (should return MCP error) for ${c.name}: ${String(e)}`);
      });
      expect(res?.isError).toBe(true);
      const text = getToolText(res);
      expect(text.length).toBeGreaterThan(0);
    }
  }, 30_000);
});

