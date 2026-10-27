// A stdio server with protocol revision 2026-07-28 on, for tests/mcp-tasks.test.mjs.
import { createFirecrawlMcpServer } from '../../dist/server.js';

const instance = createFirecrawlMcpServer({
  apiUrl: process.env.FIRECRAWL_API_URL,
  apiKey: 'fc-task-test',
  modernProtocol: true,
});
await instance.start({ transportType: 'stdio' });
