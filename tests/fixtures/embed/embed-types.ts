// Type-checks the library's declarations from a consumer's point of view.
import {
  createFirecrawlMcpServer,
  normalizeHeader,
  recoveryPayload,
  searchToolBaseFields,
  structuredCompact,
  UserError,
  type FirecrawlMcpServerHooks,
  type Session,
  type ResourceContent,
  type ResourceDefinition,
  type ResourceRegistrar,
  type ToolDefinition,
  type ToolIcon,
  type ToolResult,
} from 'firecrawl-mcp/server';

const icon: ToolIcon = {
  src: 'https://example.com/icon.svg',
  mimeType: 'image/svg+xml',
  sizes: ['any'],
  theme: 'light',
};

const resource: ResourceDefinition = {
  uri: 'ui://example/app.html',
  name: 'Example app',
  mimeType: 'text/html;profile=mcp-app',
  load: async (session): Promise<ResourceContent[]> => [
    {
      text: String(session?.tenant),
      _meta: { ui: { csp: { connectDomains: [] } } },
    },
    {
      blob: 'aGVsbG8=',
      uri: 'example://binary',
      mimeType: 'application/octet-stream',
    },
  ],
};

const tool: ToolDefinition = {
  name: 'embed_tenant',
  icons: [icon],
  description: 'Return the caller tenant.',
  execute: async (_args, { session }) => {
    if (!session?.tenant)
      throw new UserError('No tenant', { code: 'NO_TENANT' });
    return { content: [{ type: 'text', text: String(session.tenant) }] };
  },
};

const searchLike: ToolDefinition = {
  name: 'embed_search',
  description: 'Search with the built-in search fields.',
  execute: async (args) => structuredCompact(args),
};
export const queryField: typeof searchToolBaseFields.query =
  searchToolBaseFields.query;
export const tenantHeader: string | undefined = normalizeHeader(['acme']);
export const recovery: Record<string, unknown> =
  recoveryPayload('CREDENTIAL_INVALID');

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
    registrar.addTool(searchLike);
    const scrape = builtInTool('firecrawl_scrape');
    if (scrape) registrar.addTool({ ...scrape, name: 'embed_scrape' });
  },
  registerResources: (registrar: ResourceRegistrar) => {
    registrar.addResource(resource);
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

// @ts-expect-error a resource needs text or blob
export const missingResourceContent: ResourceContent = { _meta: {} };

// @ts-expect-error icon themes must match the MCP light/dark variants
export const invalidIcon: ToolIcon = { src: 'https://example.com/icon.svg', theme: 'other' };
