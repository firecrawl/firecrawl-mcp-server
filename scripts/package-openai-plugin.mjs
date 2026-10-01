import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const pluginRoot = resolve(
  'plugins/openai/app-6a314a73f8ac819195b0d55e36b9c609'
);
const manifest = JSON.parse(
  readFileSync(resolve(pluginRoot, '.codex-plugin/plugin.json'), 'utf8')
);
const output = resolve(`artifacts/${manifest.name}-${manifest.version}.zip`);

mkdirSync(dirname(output), { recursive: true });
rmSync(output, { force: true });

const zipped = spawnSync(
  'zip',
  [
    '-X',
    '-r',
    output,
    '.codex-plugin',
    'skills',
    '-x',
    '*.DS_Store',
    '__MACOSX/*',
  ],
  { cwd: pluginRoot, encoding: 'utf8' }
);

if (zipped.status !== 0) {
  process.stderr.write(zipped.stderr || zipped.stdout || 'Unable to create plugin ZIP.\n');
  process.exit(zipped.status ?? 1);
}

process.stdout.write(`${output}\n`);
