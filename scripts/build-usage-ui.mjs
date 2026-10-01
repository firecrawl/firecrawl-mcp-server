import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const result = await build({
  entryPoints: [fileURLToPath(new URL('web/usage.ts', root))],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  write: false,
  legalComments: 'inline',
});
const fonts = await Promise.all(
  [400, 450, 500].map(async (weight) => {
    const data = await readFile(new URL(`web/fonts/${weight}.woff2`, root));
    return `@font-face{font-family:SuisseIntl;font-style:normal;font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${data.toString('base64')}) format('woff2')}`;
  })
);
const icon = await read('web/firecrawl-icon.svg');
const styles = `<style>${fonts.join('\n')}\n${await read('web/firecrawl.css')}\n${await read('web/usage.css')}\n${await read('web/button.css')}\n${await read('web/providers.css')}</style>`;
const script = `<script>${result.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script>`;
// Function replacements preserve literal dollar sequences in bundled code.
const html = (await read('web/usage.html'))
  .replace('<!--ICON-->', () => icon)
  .replace('<!--STYLES-->', () => styles)
  .replace('<!--SCRIPT-->', () => script);
await writeFile(new URL('dist/usage.html', root), html);
// MCP launcher icons must travel in tools/list, independently of package logos.
await writeFile(
  new URL('dist/firecrawl-sidebar.svg', root),
  await read('plugins/openai/app-6a314a73f8ac819195b0d55e36b9c609/assets/firecrawl.svg')
);
