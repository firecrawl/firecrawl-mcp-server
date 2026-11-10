// A stdio server whose tool filter leaves the dedicated Alexandria tools out,
// as a surface with a fixed tool list does. Such a surface keeps
// firecrawl_find_tools and firecrawl_scrape with an alexandria body.
import { createFirecrawlMcpServer } from '../../dist/server.js';

const { start } = createFirecrawlMcpServer({
  apiUrl: process.env.FIRECRAWL_API_URL,
  apiKey: process.env.FIRECRAWL_API_KEY,
  transport: 'stdio',
  unstable_hooks: { toolFilter: (name) => !name.startsWith('alexandria_') },
});
await start({ transportType: 'stdio' });
