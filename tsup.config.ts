import { defineConfig } from 'tsup';

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
});
