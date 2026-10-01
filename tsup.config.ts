import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const fastmcpPackage = JSON.parse(
  readFileSync(new URL('./node_modules/fastmcp/package.json', import.meta.url), 'utf8')
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
  // Bundle fastmcp so npm and npx installs run the pnpm-patched copy
  // (patches/fastmcp@4.3.2.patch). npm does not apply pnpm patches, so an
  // external fastmcp would load unpatched from the registry. Its own
  // dependencies stay external and install through its package.json entry.
  noExternal: ['fastmcp'],
  external: Object.keys(fastmcpPackage.dependencies ?? {}),
});
