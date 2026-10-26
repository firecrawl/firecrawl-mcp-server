import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    server: 'src/server.ts',
    'www-authenticate': 'src/service/www-authenticate.ts',
    origin: 'src/origin.ts',
    integration: 'src/integration.ts',
    'introspection-cache': 'src/service/introspection-cache.ts',
    'keyless-signup-link': 'src/keyless-signup-link.ts',
  },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  clean: true,
  splitting: false,
  sourcemap: false,
  dts: { entry: { server: 'src/server.ts' } },
});
