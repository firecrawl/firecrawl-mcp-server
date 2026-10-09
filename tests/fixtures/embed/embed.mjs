// Embeds the server through the published library entry point.
import { createFirecrawlMcpServer } from 'firecrawl-mcp/server';
import { z } from 'zod';

export async function startEmbedded(port) {
  const server = createFirecrawlMcpServer({
    transport: 'httpStream',
    apiUrl: 'http://127.0.0.1:9',
    unstable_hooks: {
      authenticate: async (request) => {
        if (request?.headers.authorization !== 'Bearer embed-token') {
          throw new Response('unauthorized', { status: 401 });
        }
        return {
          authType: 'api-key',
          firecrawlApiKey: 'fc-embedded',
          tenant: 'acme',
        };
      },
      registerExtraTools: (registrar) => {
        registrar.addTool({
          name: 'embed_echo',
          description: 'Echo text with the caller tenant.',
          parameters: z.object({ text: z.string() }),
          execute: async ({ text }, { session }) =>
            `${session?.tenant}: ${text}`,
        });
      },
    },
  });
  await server.start({
    transportType: 'httpStream',
    httpStream: { port, host: '127.0.0.1', endpoint: '/mcp', stateless: true },
  });
  return server;
}
