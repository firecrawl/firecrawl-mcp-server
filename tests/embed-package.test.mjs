// Installs the packed package into a scratch project and embeds the server
// through `firecrawl-mcp/server`, the way a consumer would.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getFreePort, parseSseJson } from './helpers/exchange-mcp.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FIXTURE = fileURLToPath(new URL('./fixtures/embed/', import.meta.url));

function link(project, name, target) {
  const destination = path.join(project, 'node_modules', name);
  mkdirSync(path.dirname(destination), { recursive: true });
  symlinkSync(realpathSync(target), destination, 'dir');
}

/** A project with the packed tarball installed and its dependencies linked. */
function installPackedPackage(t) {
  const scratch = mkdtempSync(path.join(tmpdir(), 'firecrawl-mcp-embed-'));
  t.after(() => rmSync(scratch, { force: true, recursive: true }));

  // dist/ is already built by `pnpm test`; skip the prepare script.
  execFileSync(
    'npm',
    ['pack', '--ignore-scripts', '--pack-destination', scratch],
    {
      cwd: ROOT,
      stdio: 'ignore',
    }
  );
  const tarball = readdirSync(scratch).find((name) => name.endsWith('.tgz'));
  assert.ok(tarball, 'npm pack produced no tarball');
  execFileSync('tar', ['-xzf', path.join(scratch, tarball), '-C', scratch]);

  const project = path.join(scratch, 'project');
  mkdirSync(path.join(project, 'node_modules'), { recursive: true });
  renameSync(
    path.join(scratch, 'package'),
    path.join(project, 'node_modules', 'firecrawl-mcp')
  );

  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  for (const name of [...Object.keys(pkg.dependencies), '@types/node']) {
    link(project, name, path.join(ROOT, 'node_modules', name));
  }
  cpSync(FIXTURE, project, { recursive: true });
  return project;
}

async function rpc(port, method, params, headers = {}) {
  return fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({ id: 1, jsonrpc: '2.0', method, params }),
  });
}

test('the packed package embeds through firecrawl-mcp/server', async (t) => {
  const project = installPackedPackage(t);

  const { startEmbedded } = await import(
    pathToFileURL(path.join(project, 'embed.mjs')).href
  );
  const port = await getFreePort();
  const server = await startEmbedded(port);
  t.after(() => server.stop());

  const rejected = await rpc(port, 'tools/list', {});
  assert.equal(rejected.status, 401);

  const auth = { authorization: 'Bearer embed-token' };
  const listed = await rpc(port, 'tools/list', {}, auth);
  assert.equal(listed.status, 200);
  const names = parseSseJson(await listed.text()).result.tools.map(
    (tool) => tool.name
  );
  assert.ok(names.includes('firecrawl_scrape'));
  assert.ok(names.includes('embed_echo'));

  const called = await rpc(
    port,
    'tools/call',
    { name: 'embed_echo', arguments: { text: 'hi' } },
    auth
  );
  const result = parseSseJson(await called.text()).result;
  assert.deepEqual(result.content, [{ type: 'text', text: 'acme: hi' }]);
});

test('the packed type declarations type-check a consumer', (t) => {
  const project = installPackedPackage(t);
  const tsc = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
  try {
    execFileSync(
      process.execPath,
      [tsc, '-p', path.join(project, 'tsconfig.json')],
      {
        cwd: project,
        encoding: 'utf8',
        stdio: 'pipe',
      }
    );
  } catch (error) {
    assert.fail(`tsc failed:\n${error.stdout}${error.stderr}`);
  }
});
