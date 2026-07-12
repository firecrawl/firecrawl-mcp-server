import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  noExternal: ['fastmcp'],
  external: ['@valibot/to-json-schema', 'effect', 'sury', 'undici', 'zod'],
  metafile: true,
  clean: true,
  splitting: false,
  sourcemap: false,
  dts: false,
});
