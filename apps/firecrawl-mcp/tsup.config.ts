import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { mcp: 'src/mcp.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: false,
  external: ['@mendable/firecrawl-js', 'dotenv', 'firecrawl-fastmcp', 'zod'],
});
