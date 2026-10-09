import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const fastmcpPackage = JSON.parse(
  readFileSync(new URL('./node_modules/fastmcp/package.json', import.meta.url), 'utf8')
) as { dependencies?: Record<string, string> };

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    server: 'src/server.ts',
    'www-authenticate': 'src/service/www-authenticate.ts',
    'agent-hints': 'src/agent-hints.ts',
    origin: 'src/origin.ts',
    'introspection-cache': 'src/service/introspection-cache.ts',
    'keyless-signup-link': 'src/keyless-signup-link.ts',
    'mcp-apps': 'src/mcp-apps.ts',
  },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  clean: true,
  splitting: false,
  sourcemap: false,
  // Declarations only for the library entry, whose public types do not
  // reference fastmcp.
  dts: { entry: { server: 'src/server.ts' } },
  // Bundle fastmcp so npm and npx installs run the pnpm-patched copy
  // (patches/fastmcp@4.3.2.patch). npm does not apply pnpm patches, so an
  // external fastmcp would load unpatched from the registry. Its own
  // dependencies stay external and install through its package.json entry.
  noExternal: ['fastmcp'],
  external: Object.keys(fastmcpPackage.dependencies ?? {}),
});
