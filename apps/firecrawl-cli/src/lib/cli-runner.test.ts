import { jest } from '@jest/globals';
import { runCli } from './cli-runner.js';
import { Writable } from 'node:stream';

function createCaptureIO(options?: {
  stdinIsTTY?: boolean;
  stdoutIsTTY?: boolean;
  stdinText?: string;
}) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const stdinText = options?.stdinText ?? '';

  return {
    io: {
      stdinIsTTY: options?.stdinIsTTY ?? true,
      stdoutIsTTY: options?.stdoutIsTTY ?? true,
      readStdin: async () => stdinText,
      writeStdout: (t: string) => stdout.push(t),
      writeStderr: (t: string) => stderr.push(t),
    },
    getStdout: () => stdout.join(''),
    getStderr: () => stderr.join(''),
  };
}

describe('runCli', () => {
  it('prints help with --help', async () => {
    const cap = createCaptureIO();
    const code = await runCli({
      argv: ['--help'],
      env: { HOME: '/tmp/firecrawl-test-home' },
      io: cap.io,
    });
    expect(code).toBe(0);
    expect(cap.getStdout()).toContain('firecrawl - Firecrawl CLI');
  });

  it('prints version with --version (no command)', async () => {
    const cap = createCaptureIO();
    const code = await runCli({
      argv: ['--version'],
      env: {
        HOME: '/tmp/firecrawl-test-home',
        npm_package_name: 'firecrawl',
        npm_package_version: '0.0.0-test',
      },
      io: cap.io,
      deps: {
        readFile: async () => {
          throw new Error('no file access in test');
        },
      },
    });
    expect(code).toBe(0);
    expect(cap.getStdout()).toContain('firecrawl@0.0.0-test');
  });

  it('fails when no api key/url is provided', async () => {
    const cap = createCaptureIO();
    const code = await runCli({
      argv: ['scrape', 'https://example.com'],
      env: { HOME: '/tmp/firecrawl-test-home' },
      io: cap.io,
    });
    expect(code).toBe(1);
    expect(cap.getStderr()).toContain(
      'Either FIRECRAWL_API_KEY or FIRECRAWL_API_URL must be provided'
    );
  });

  it('uses positional url and stdin JSON options for scrape', async () => {
    const cap = createCaptureIO({
      stdinIsTTY: false,
      stdinText: '{"formats":["markdown"]}',
      stdoutIsTTY: false,
    });

    const scrape = jest.fn(async () => ({ ok: true }));

    const code = await runCli({
      argv: ['scrape', 'https://example.com'],
      env: { FIRECRAWL_API_KEY: 'fc-test', HOME: '/tmp/firecrawl-test-home' },
      io: cap.io,
      deps: {
        createClient: () =>
          ({
            scrape,
          }) as any,
      },
    });

    expect(code).toBe(0);
    expect(scrape).toHaveBeenCalledWith('https://example.com', {
      formats: ['markdown'],
      origin: 'cli',
    });
  });

  it('merges positional query for search', async () => {
    const cap = createCaptureIO({ stdoutIsTTY: false });
    const search = jest.fn(async () => ({ ok: true }));
    const code = await runCli({
      argv: ['search', 'top', 'ai', 'companies', '--json', '{"limit":5,"sources":["web"]}'],
      env: { FIRECRAWL_API_KEY: 'fc-test', HOME: '/tmp/firecrawl-test-home' },
      io: cap.io,
      deps: {
        createClient: () =>
          ({
            search,
          }) as any,
      },
    });

    expect(code).toBe(0);
    expect(search).toHaveBeenCalledWith('top ai companies', {
      limit: 5,
      sources: ['web'],
      origin: 'cli',
    });
  });

  it('supports MCP-style tool wrapper via stdin {name,arguments}', async () => {
    const cap = createCaptureIO({
      stdinIsTTY: false,
      stdinText: '{"name":"firecrawl_scrape","arguments":{"url":"https://example.com"}}',
      stdoutIsTTY: false,
    });

    const scrape = jest.fn(async () => ({ ok: true }));
    const code = await runCli({
      argv: ['tool'],
      env: { FIRECRAWL_API_KEY: 'fc-test', HOME: '/tmp/firecrawl-test-home' },
      io: cap.io,
      deps: { createClient: () => ({ scrape }) as any },
    });

    expect(code).toBe(0);
    expect(scrape).toHaveBeenCalledWith('https://example.com', {
      origin: 'cli',
    });
  });

  it('emits jsonl when --jsonl is set', async () => {
    const cap = createCaptureIO({ stdoutIsTTY: false });
    const map = jest.fn(async () => ({ links: [{ url: 'https://a' }, { url: 'https://b' }] }));
    const code = await runCli({
      argv: ['map', 'https://example.com', '--jsonl'],
      env: { FIRECRAWL_API_KEY: 'fc-test', HOME: '/tmp/firecrawl-test-home' },
      io: cap.io,
      deps: { createClient: () => ({ map }) as any },
    });

    expect(code).toBe(0);
    expect(cap.getStdout().split('\n').filter(Boolean).length).toBe(2);
  });

  it('writes to --output and keeps stdout empty', async () => {
    const cap = createCaptureIO({ stdoutIsTTY: false });
    const scrape = jest.fn(async () => ({ ok: true }));

    let fileContent = '';
    const stream = new Writable({
      write(chunk, _enc, cb) {
        fileContent += chunk.toString();
        cb();
      },
    });

    const code = await runCli({
      argv: ['scrape', 'https://example.com', '--output', '/tmp/out.json'],
      env: { FIRECRAWL_API_KEY: 'fc-test', HOME: '/tmp/firecrawl-test-home' },
      io: cap.io,
      deps: {
        createClient: () => ({ scrape }) as any,
        mkdir: async () => undefined as any,
        createWriteStream: () => stream as any,
      },
    });

    expect(code).toBe(0);
    expect(cap.getStdout()).toBe('');
    expect(fileContent).toContain('"ok":true');
  });
});
