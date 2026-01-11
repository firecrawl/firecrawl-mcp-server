import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

describe('mcp smoke', () => {
  it('lists tools and can call firecrawl_capabilities', async () => {
    const mcpPath = path.resolve('apps/firecrawl-mcp/dist/mcp.js');
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [mcpPath],
      env: { ...process.env, FIRECRAWL_API_URL: 'http://127.0.0.1:1', FORCE_COLOR: '0', NO_COLOR: '1' },
      stderr: 'pipe',
    });
    const client = new Client({ name: 'test', version: '0.0.0' }, { capabilities: {} });
    await client.connect(transport);

    const listed = await client.listTools();
    expect(listed.tools.some((t) => t.name === 'firecrawl_capabilities')).toBe(true);

    const res = await client.callTool({ name: 'firecrawl_capabilities', arguments: {} });
    expect(JSON.stringify(res)).toContain('docsMode');

    await client.close();
  });
});
