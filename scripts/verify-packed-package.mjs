import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import net from 'node:net';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';

function exec(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.equal(typeof address, 'object');
  const port = address.port;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  return port;
}

async function waitForHealth(port, child, getStderr) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(
        `packed server exited with code ${child.exitCode}: ${getStderr()}`
      );
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('packed server did not become healthy');
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function startCredentialServer() {
  const server = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    if (request.method === 'POST' && request.url === '/api/oauth/introspect') {
      const token = new URLSearchParams(raw).get('token') ?? '';
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify(
          token === 'fc-packed-consumer-test'
            ? {
                active: true,
                api_key: token,
                api_key_id: '123',
                scope: 'firecrawl:global',
                team_id: '00000000-0000-4000-8000-000000000001',
              }
            : { active: false }
        )
      );
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.equal(typeof address, 'object');
  return {
    close: () => new Promise((resolve) => server.close(resolve)),
    url: `http://127.0.0.1:${address.port}`,
  };
}

function parseMcpBody(body) {
  const data = body.split(/\r?\n/).find((line) => line.startsWith('data: '));
  assert.ok(data, `missing MCP SSE data: ${body}`);
  return JSON.parse(data.slice('data: '.length));
}

async function mcpRequest(port, id, method, params, headers = {}) {
  const response = await fetch(`http://127.0.0.1:${port}/v2/mcp`, {
    body: JSON.stringify({ id, jsonrpc: '2.0', method, params }),
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      ...headers,
    },
    method: 'POST',
  });
  assert.equal(response.status, 200);
  return parseMcpBody(await response.text());
}

async function verifyInstalledConsumer(consumer, label) {
  assert.equal(
    await exists(path.join(consumer, 'node_modules/fastmcp')),
    false,
    `${label} consumer installed the build-only FastMCP dependency`
  );

  const bundledEntry = path.join(
    consumer,
    'node_modules/firecrawl-mcp/dist/index.js'
  );
  const bundledCode = await readFile(bundledEntry, 'utf8');
  assert.doesNotMatch(bundledCode, /from\s+['"]fastmcp['"]/);
  assert.doesNotMatch(bundledCode, /require\(['"]fastmcp['"]\)/);

  const port = await freePort();
  const credentialServer = await startCredentialServer();
  let stderr = '';
  const child = spawn(process.execPath, [bundledEntry], {
    cwd: consumer,
    env: {
      ...process.env,
      CLOUD_SERVICE: 'true',
      FASTMCP_ENDPOINT: '/v2/mcp',
      FIRECRAWL_API_URL: credentialServer.url,
      FIRECRAWL_MCP_ACTION_LOG_SECRET: 'packed-action-log-secret',
      FIRECRAWL_OAUTH_INTROSPECT_SECRET: 'packed-introspection-secret',
      FIRECRAWL_OAUTH_ISSUER: credentialServer.url,
      HTTP_STREAMABLE_SERVER: 'true',
      KEYLESS_PROXY_SECRET: 'packed-keyless-secret',
      PORT: String(port),
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  try {
    await waitForHealth(port, child, () => stderr);

    const list = await mcpRequest(port, 1, 'tools/list', {});
    assert.deepEqual(list.result.tools.map((tool) => tool.name).sort(), [
      'firecrawl_parse',
      'firecrawl_scrape',
      'firecrawl_search',
    ]);

    for (const [index, argumentsValue] of [
      { url: 'https://example.com' },
      {},
      { url: 123 },
    ].entries()) {
      const message = await mcpRequest(port, 10 + index, 'tools/call', {
        arguments: argumentsValue,
        name: 'firecrawl_map',
      });
      assert.equal(message.result?.isError, true);
      assert.equal(
        message.result?.structuredContent?.code,
        'KEYLESS_TOOL_NOT_AVAILABLE'
      );
    }

    const unknown = await mcpRequest(port, 20, 'tools/call', {
      arguments: {},
      name: 'firecrawl_not_registered',
    });
    assert.match(
      unknown.error?.message ?? '',
      /Unknown tool: firecrawl_not_registered/
    );

    const invalidAuthenticated = await mcpRequest(
      port,
      21,
      'tools/call',
      { arguments: {}, name: 'firecrawl_map' },
      { 'x-firecrawl-api-key': 'fc-packed-consumer-test' }
    );
    assert.match(
      invalidAuthenticated.error?.message ?? '',
      /parameter validation failed/
    );
    assert.equal(invalidAuthenticated.result, undefined);

    assert.doesNotMatch(stderr, /Cannot find package/);
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await Promise.race([
        new Promise((resolve) => child.once('exit', resolve)),
        new Promise((resolve) => setTimeout(resolve, 1_000)),
      ]);
      if (child.exitCode === null) child.kill('SIGKILL');
    }
    await credentialServer.close();
  }
}

const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'firecrawl-mcp-pack-'));
try {
  const packOutput = exec('npm', [
    'pack',
    '--ignore-scripts',
    '--json',
    '--pack-destination',
    tempRoot,
  ]);
  const [pack] = JSON.parse(packOutput);
  assert.ok(pack.files.some((file) => file.path === 'dist/index.js'));
  assert.ok(pack.files.some((file) => file.path === 'THIRD_PARTY_NOTICES.md'));
  assert.ok(pack.unpackedSize < 5_000_000, `package is ${pack.unpackedSize} B`);

  const tarball = path.join(tempRoot, pack.filename);

  for (const packageManager of ['npm', 'pnpm']) {
    const consumer = path.join(tempRoot, `${packageManager}-consumer`);
    await mkdir(consumer);
    await writeFile(
      path.join(consumer, 'package.json'),
      JSON.stringify({
        name: `${packageManager}-packed-consumer`,
        private: true,
        version: '1.0.0',
      })
    );
    if (packageManager === 'npm') {
      exec(
        'npm',
        ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball],
        { cwd: consumer }
      );
    } else {
      exec(
        'npx',
        ['--yes', 'pnpm@10.17.1', 'add', '--ignore-scripts', `file:${tarball}`],
        { cwd: consumer }
      );
    }
    await verifyInstalledConsumer(consumer, packageManager);
  }

  process.stdout.write(
    `Packed npm and strict-pnpm consumers verified (${pack.filename}, ${pack.unpackedSize} bytes unpacked).\n`
  );
} finally {
  await rm(tempRoot, { force: true, recursive: true });
}
