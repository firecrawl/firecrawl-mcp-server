import { spawn } from 'node:child_process';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

function runCli(
  args: string[],
  env: Record<string, string | undefined>,
  stdin?: string
) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, args, {
      env: { ...process.env, ...env, FORCE_COLOR: '0', NO_COLOR: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => resolve({ code, stdout, stderr }));

    if (stdin !== undefined) {
      child.stdin.setEncoding('utf8');
      child.stdin.end(stdin);
    } else {
      child.stdin.end();
    }
  });
}

describe('cli integration (real API)', () => {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    it.skip('requires FIRECRAWL_API_KEY', () => {});
    return;
  }

  const cliPath = path.resolve('apps/firecrawl-cli/dist/cli.js');
  const baseEnv = { FIRECRAWL_API_KEY: apiKey };

  function expectOk(res: { code: number | null; stdout: string; stderr: string }) {
    if (res.code !== 0) {
      const err = res.stderr.trim() || '(no stderr)';
      const out = res.stdout.trim() || '(no stdout)';
      throw new Error(`CLI exited with ${res.code}\n\nstderr:\n${err}\n\nstdout:\n${out}`);
    }
  }

  function unwrapMarkdown(obj: any): string | undefined {
    return typeof obj?.markdown === 'string'
      ? obj.markdown
      : typeof obj?.data?.markdown === 'string'
        ? obj.data.markdown
        : undefined;
  }

  it('scrape', async () => {
    const json = JSON.stringify({ formats: ['markdown'], onlyMainContent: true });
    const res = await runCli([cliPath, 'scrape', 'https://example.com', '--json', json, '--raw'], baseEnv);
    expectOk(res);
    const parsed = JSON.parse(res.stdout);
    expect(unwrapMarkdown(parsed)).toContain('Example Domain');
  }, 60_000);

  it('map', async () => {
    const json = JSON.stringify({ url: 'https://example.com', limit: 10 });
    const res = await runCli([cliPath, 'map', '--json', json, '--raw'], baseEnv);
    expectOk(res);
    const parsed = JSON.parse(res.stdout) as any;
    const links = (parsed?.links ?? parsed?.urls ?? parsed?.data) as unknown;
    expect(Array.isArray(links)).toBe(true);
  }, 60_000);

  it('search', async () => {
    const json = JSON.stringify({ query: 'Example Domain', limit: 1, sources: ['web'] });
    const res = await runCli([cliPath, 'search', '--json', json, '--raw'], baseEnv);
    expectOk(res);
    const parsed = JSON.parse(res.stdout) as any;
    const results = (parsed?.data ?? parsed?.results ?? parsed) as any;
    expect(results).toBeTruthy();
  }, 90_000);

  it('crawl + crawl-status', async () => {
    const crawlJson = JSON.stringify({ url: 'https://example.com', limit: 1, maxDiscoveryDepth: 1 });
    const started = await runCli([cliPath, 'crawl', '--json', crawlJson, '--raw'], baseEnv);
    expectOk(started);
    const startParsed = JSON.parse(started.stdout) as any;
    const id = String(startParsed?.id ?? startParsed?.jobId ?? startParsed?.data?.id ?? '');
    expect(id.length).toBeGreaterThan(0);

    const statusJson = JSON.stringify({ id });
    const status = await runCli([cliPath, 'crawl-status', '--json', statusJson, '--raw'], baseEnv);
    expectOk(status);
    const statusParsed = JSON.parse(status.stdout) as any;
    expect(statusParsed).toBeTruthy();
  }, 120_000);

  it('extract', async () => {
    const json = JSON.stringify({
      urls: ['https://example.com'],
      prompt: 'Extract the page title as { "title": string }.',
      schema: {
        type: 'object',
        properties: { title: { type: 'string' } },
        required: ['title'],
      },
    });
    const res = await runCli([cliPath, 'extract', '--json', json, '--raw'], baseEnv);
    expectOk(res);
    const parsed = JSON.parse(res.stdout) as any;
    expect(parsed).toBeTruthy();
  }, 180_000);

  it('agent + agent-status', async () => {
    const agentJson = JSON.stringify({
      prompt: 'Visit https://example.com and return the page title.',
    });
    const started = await runCli([cliPath, 'agent', '--json', agentJson, '--raw'], baseEnv);
    expectOk(started);
    const startParsed = JSON.parse(started.stdout) as any;
    const id = String(startParsed?.id ?? startParsed?.jobId ?? startParsed?.data?.id ?? '');
    expect(id.length).toBeGreaterThan(0);

    const statusJson = JSON.stringify({ id });
    const status = await runCli([cliPath, 'agent-status', '--json', statusJson, '--raw'], baseEnv);
    expectOk(status);
    const statusParsed = JSON.parse(status.stdout) as any;
    expect(statusParsed).toBeTruthy();
  }, 240_000);

  it('tool wrapper (firecrawl_scrape via stdin)', async () => {
    const stdin = JSON.stringify({
      name: 'firecrawl_scrape',
      arguments: { url: 'https://example.com', formats: ['markdown'], onlyMainContent: true },
    });
    const res = await runCli([cliPath, 'tool', '--raw'], baseEnv, stdin);
    expectOk(res);
    const parsed = JSON.parse(res.stdout);
    expect(unwrapMarkdown(parsed)).toContain('Example Domain');
  }, 60_000);
});
