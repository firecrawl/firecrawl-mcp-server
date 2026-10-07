// Type-checks the library's declarations from a consumer's point of view.
import {
  createFirecrawlMcpServer,
  UserError,
  type FirecrawlMcpServerHooks,
  type Session,
  type ToolDefinition,
  type ToolResult,
} from 'firecrawl-mcp/server';

const tool: ToolDefinition = {
  name: 'embed_tenant',
  description: 'Return the caller tenant.',
  execute: async (_args, { session }) => {
    if (!session?.tenant)
      throw new UserError('No tenant', { code: 'NO_TENANT' });
    return { content: [{ type: 'text', text: String(session.tenant) }] };
  },
};

const hooks: FirecrawlMcpServerHooks = {
  authenticate: async (): Promise<Session> => ({
    authType: 'none',
    tenant: 'acme',
  }),
  wrapTool: (wrapped) => ({ ...wrapped, canList: () => true }),
  onToolResult: (event) => {
    if (event.status === 'error') console.error(event.tool, event.error);
  },
  registerExtraTools: (registrar, { builtInTool }) => {
    registrar.addTool(tool);
    const scrape = builtInTool('firecrawl_scrape');
    if (scrape) registrar.addTool({ ...scrape, name: 'embed_scrape' });
  },
  outboundRequest: (session) => ({
    headers: { 'x-tenant': String(session?.tenant) },
  }),
  toolFilter: (name) => name !== 'firecrawl_map',
  configureHttp: (app) => {
    app.get('/healthz', (context) => context.text('ok'));
  },
};

const server = createFirecrawlMcpServer({ unstable_hooks: hooks });
export const stop: () => Promise<void> = server.stop;

// Content items must match one of the MCP content shapes.
// @ts-expect-error a text item needs its text
export const missingText: ToolResult = { content: [{ type: 'text' }] };
