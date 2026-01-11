import { spawn } from 'node:child_process';
import http from 'node:http';
import { once } from 'node:events';
import path from 'node:path';

function spawnCli(args: string[], env?: Record<string, string>) {
  const cliPath = path.resolve('apps/firecrawl-cli/dist/cli.js');
  const child = spawn(process.execPath, [cliPath, ...args], {
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (d) => (stdout += d));
  child.stderr.on('data', (d) => (stderr += d));

  return { child, getStdout: () => stdout, getStderr: () => stderr };
}

describe('firecrawl CLI subprocess', () => {
  it('scrape hits /v2/scrape on configured apiUrl', async () => {
    const server = http.createServer((req, res) => {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.end();
        return;
      }
      if (req.url !== '/v2/scrape') {
        res.statusCode = 404;
        res.end();
        return;
      }
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ success: true, data: { markdown: '# ok' } }));
    });

    server.listen(0);
    await once(server, 'listening');
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('unexpected address');
    const apiUrl = `http://127.0.0.1:${addr.port}`;

    const { child, getStdout, getStderr } = spawnCli(
      ['scrape', 'https://example.com', '--raw'],
      {
        FIRECRAWL_API_URL: apiUrl,
      }
    );

    const [code] = (await once(child, 'exit')) as [number];
    server.close();
    expect(code).toBe(0);
    expect(getStderr()).toBe('');
    expect(getStdout()).toContain('"markdown":"# ok"');
  });
});
