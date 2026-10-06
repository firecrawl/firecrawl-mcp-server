import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build, transform } from 'esbuild';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const result = await build({
  entryPoints: [fileURLToPath(new URL('web/usage.tsx', root))],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  write: false,
  legalComments: 'inline',
  define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.css': 'empty', '.svg': 'text' },
});
const fonts = await Promise.all(
  [400, 450, 500].map(async (weight) => {
    const data = await readFile(new URL(`web/fonts/${weight}.woff2`, root));
    return `@font-face{font-family:SuisseIntl;font-style:normal;font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${data.toString('base64')}) format('woff2')}`;
  })
);
const require = createRequire(import.meta.url);
async function loadTs(path) {
  const { code } = await transform(await read(path), {
    loader: 'ts',
    format: 'cjs',
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    require,
    module,
    module.exports
  );
  return module.exports.default;
}
const config = await loadTs('web/ui/tailwind.config.ts');
const baseCss = await postcss([tailwindcss(config)]).process(
  '@tailwind base;',
  { from: undefined }
);
const css = await postcss([tailwindcss(config)]).process(
  '@tailwind components; @tailwind utilities;',
  { from: undefined }
);
const colors = await loadTs('web/ui/colors.ts');
const tokens = (theme) =>
  Object.entries(colors)
    .map(([name, values]) => `--${name}: #${values[theme].hex};`)
    .join('\n');
const tokenCss = `:root {${tokens('light')}} :root[data-theme="dark"] {${tokens('dark')}}`;
const server = await build({
  entryPoints: [fileURLToPath(new URL('web/usage.tsx', root))],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'es2022',
  external: ['react', 'react-dom/client', 'react/jsx-runtime'],
  write: false,
  loader: { '.css': 'empty', '.svg': 'text' },
  define: { 'process.env.NODE_ENV': '"production"' },
});
const serverModule = { exports: {} };
new Function('require', 'module', 'exports', server.outputFiles[0].text)(
  require,
  serverModule,
  serverModule.exports
);
const appHtml = renderToStaticMarkup(
  createElement(serverModule.exports.Dashboard)
);
const styles = `<style>${fonts.join('\n')}\n${baseCss.css}\n${tokenCss}\n${await read('web/usage.css')}\n${await read('web/ui/button.css')}\n${await read('web/providers.css')}\n${css.css}</style>`;
const script = `<script>${result.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script>`;
// Function replacements preserve literal dollar sequences in bundled code.
const html = (await read('web/usage.html'))
  .replace('<!--APP-->', () => appHtml)
  .replace('<!--STYLES-->', () => styles)
  .replace('<!--SCRIPT-->', () => script);
await writeFile(new URL('dist/usage.html', root), html);
// MCP launcher icons must travel in tools/list, independently of package logos.
await writeFile(
  new URL('dist/firecrawl-sidebar.svg', root),
  await read(
    'plugins/openai/app-6a314a73f8ac819195b0d55e36b9c609/assets/firecrawl.svg'
  )
);
