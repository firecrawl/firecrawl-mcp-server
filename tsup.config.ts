import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const fastmcpPackage = JSON.parse(
  readFileSync(
    new URL('./node_modules/fastmcp/package.json', import.meta.url),
    'utf8'
  )
) as { dependencies?: Record<string, string> };

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/www-authenticate.ts',
    'src/agent-hints.ts',
    'src/origin.ts',
    'src/introspection-cache.ts',
    'src/keyless-signup-link.ts',
  ],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  clean: true,
  splitting: false,
  sourcemap: false,
  dts: false,
  // Bundle both patched transport packages so npm/npx installs include the
  // HTTP MRTR interceptor. npm does not apply pnpm patches. The bundled
  // proxy's AJV-generated runtime imports remain direct dependencies.
  noExternal: ['fastmcp', 'mcp-proxy'],
  external: Object.keys(fastmcpPackage.dependencies ?? {}).filter(
    (name) => name !== 'mcp-proxy'
  ),
});
