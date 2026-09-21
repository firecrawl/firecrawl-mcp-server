import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/www-authenticate.ts',
    'src/origin.ts',
    'src/thread.ts',
    'src/session-credential.ts',
  ],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  clean: true,
  splitting: false,
  sourcemap: false,
  dts: false,
});
