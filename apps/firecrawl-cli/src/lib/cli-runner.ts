import dotenv from 'dotenv';
import { readFile as defaultReadFile } from 'node:fs/promises';
import { createWriteStream as defaultCreateWriteStream } from 'node:fs';
import { mkdir as defaultMkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createFirecrawlClient,
  createFirecrawlSchemas,
  removeEmptyTopLevel,
} from '../../../../libs/firecrawl-core/src/index.js';
import {
  loadFirecrawlConfig,
  resolveConfig,
  type ResolvedFirecrawlConfig,
} from './config.js';

dotenv.config({ debug: false, quiet: true });

export type CommandName =
  | 'tool'
  | 'scrape'
  | 'map'
  | 'search'
  | 'crawl'
  | 'crawl-status'
  | 'extract'
  | 'agent'
  | 'agent-status';

export interface CliIO {
  stdinIsTTY: boolean;
  stdoutIsTTY: boolean;
  readStdin(): Promise<string>;
  writeStdout(text: string): void;
  writeStderr(text: string): void;
}

export interface RunCliDeps {
  readFile?(path: string, encoding: 'utf8'): Promise<string>;
  mkdir?(path: string, options: { recursive: true }): Promise<unknown>;
  createWriteStream?(path: string): ReturnType<typeof defaultCreateWriteStream>;
  createClient?(
    options: Parameters<typeof createFirecrawlClient>[0]
  ): ReturnType<typeof createFirecrawlClient>;
  createSchemas?(
    options?: Parameters<typeof createFirecrawlSchemas>[0]
  ): ReturnType<typeof createFirecrawlSchemas>;
}

export interface RunCliArgs {
  argv: string[];
  env: Record<string, string | undefined>;
  io: CliIO;
  deps?: RunCliDeps;
}

function printHelp(io: CliIO): void {
  const text = `
firecrawl - Firecrawl CLI

Usage:
  firecrawl <command> [positional...] [--json <json>|--input <file>|(stdin)]

Commands:
  tool <toolName?>                # MCP-style {name,arguments} wrapper
  scrape <url?>
  map <url?>
  search <query?>
  crawl <url?>
  crawl-status <id?>
  extract
  agent <prompt?>
  agent-status <id?>

Input:
  - If --json is provided, it is parsed as the command arguments.
  - Else if --input is provided, reads JSON from that file ("-" reads stdin).
  - Else if stdin is piped, reads JSON from stdin.
  - Positional args (like <url>) override JSON fields when applicable.

Auth/config:
  - FIRECRAWL_API_KEY and/or FIRECRAWL_API_URL env vars (same as MCP server)
  - --api-key, --api-url flags override env vars
  - --config, --profile allow per-user profiles

Output:
  - JSON to stdout (pretty when stdout is a TTY; use --raw to disable)
  - --jsonl streams results line-by-line when possible
  - --output writes to a file (stdout stays clean for agents)

Logging:
  - Logs go to stderr. Use --log-level (error|warn|info|debug) and --log-format (text|json).
`;
  io.writeStdout(text.trimStart());
  io.writeStdout('\n');
}

function writeError(io: CliIO, message: string): void {
  io.writeStderr(message.endsWith('\n') ? message : `${message}\n`);
}

export function parseArgv(argv: string[]): {
  command?: string;
  positionals: string[];
  flags: Record<string, string | boolean>;
} {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg) continue;

    if (arg === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }

    if (!arg.startsWith('-')) {
      positionals.push(arg);
      continue;
    }

    if (arg === '-h' || arg === '--help') {
      flags.help = true;
      continue;
    }
    if (arg === '-v' || arg === '--version') {
      flags.version = true;
      continue;
    }
    if (arg === '--jsonl') {
      flags.jsonl = true;
      continue;
    }
    if (arg === '--quiet') {
      flags.quiet = true;
      continue;
    }
    if (arg === '--verbose') {
      flags.verbose = true;
      continue;
    }
    if (arg === '--debug') {
      flags.debug = true;
      continue;
    }
    if (arg === '--safe-mode') {
      flags['safe-mode'] = true;
      continue;
    }
    if (arg === '--unsafe') {
      flags['safe-mode'] = false;
      continue;
    }

    if (arg === '--pretty') {
      flags.pretty = true;
      continue;
    }
    if (arg === '--raw') {
      flags.raw = true;
      continue;
    }

    const key =
      arg.startsWith('--') && arg.includes('=')
        ? arg.slice(2).split('=')[0]
        : arg.startsWith('--')
          ? arg.slice(2)
          : arg.slice(1);

    const valueFromEquals =
      arg.startsWith('--') && arg.includes('=')
        ? arg.slice(2).split('=').slice(1).join('=')
        : undefined;

    const next = argv[i + 1];
    const value =
      valueFromEquals ??
      (next && !next.startsWith('-') ? (i++, next) : undefined);

    flags[key] = value ?? true;
  }

  const [command, ...rest] = positionals;
  return { command, positionals: rest, flags };
}

function resolveBooleanFlag(
  flags: Record<string, string | boolean>,
  key: string
): boolean | undefined {
  const value = flags[key];
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  const lowered = value.toLowerCase();
  return lowered === 'true' || value === '1' || lowered === 'yes';
}

function resolveStringFlag(
  flags: Record<string, string | boolean>,
  key: string
): string | undefined {
  const value = flags[key];
  if (typeof value === 'string') return value;
  return undefined;
}

async function readJsonInput(
  io: CliIO,
  deps: Required<RunCliDeps>,
  flags: { json?: string; input?: string }
): Promise<unknown | undefined> {
  let raw: string | undefined;

  if (typeof flags.json === 'string') {
    raw = flags.json;
  } else if (typeof flags.input === 'string') {
    raw =
      flags.input === '-' ? await io.readStdin() : await deps.readFile(flags.input, 'utf8');
  } else if (!io.stdinIsTTY) {
    raw = await io.readStdin();
  }

  if (raw == null) return undefined;
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;

  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error('Invalid JSON input');
  }
}

export function mergeArgsWithPositional(
  cmd: CommandName,
  pos: string[],
  base: Record<string, unknown> | undefined
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(base ?? {}) };
  if (cmd === 'tool') return merged;
  if (cmd === 'scrape' && pos[0]) merged.url = pos[0];
  if (cmd === 'map' && pos[0]) merged.url = pos[0];
  if (cmd === 'crawl' && pos[0]) merged.url = pos[0];
  if (cmd === 'crawl-status' && pos[0]) merged.id = pos[0];
  if (cmd === 'agent-status' && pos[0]) merged.id = pos[0];
  if (cmd === 'search' && pos[0]) merged.query = pos.join(' ');
  if (cmd === 'agent' && pos[0]) merged.prompt = pos.join(' ');
  return merged;
}

function formatOutput(data: unknown, pretty: boolean): string {
  return pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
}

type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'silent';
type LogFormat = 'text' | 'json';

function normalizeSitemap(value: unknown): unknown {
  // Firecrawl v2 uses "skip" where earlier docs used "ignore"
  if (value === 'ignore') return 'skip';
  return value;
}

function compareLogLevels(a: LogLevel, b: LogLevel): number {
  const order: LogLevel[] = ['silent', 'error', 'warn', 'info', 'debug'];
  return order.indexOf(a) - order.indexOf(b);
}

function createLogger(io: CliIO, level: LogLevel, format: LogFormat) {
  const should = (target: LogLevel) => compareLogLevels(level, target) >= 0;
  const write = (lvl: Exclude<LogLevel, 'silent'>, message: string, data?: any) => {
    if (!should(lvl)) return;
    const ts = new Date().toISOString();
    if (format === 'json') {
      io.writeStderr(JSON.stringify({ ts, level: lvl, message, data }) + '\n');
    } else {
      const suffix = data === undefined ? '' : ` ${formatOutput(data, false)}`;
      io.writeStderr(`[${lvl.toUpperCase()}] ${ts} ${message}${suffix}\n`);
    }
  };
  return {
    debug: (m: string, d?: any) => write('debug', m, d),
    info: (m: string, d?: any) => write('info', m, d),
    warn: (m: string, d?: any) => write('warn', m, d),
    error: (m: string, d?: any) => write('error', m, d),
  };
}

function toolNameToCommand(name: string): CommandName | undefined {
  const n = name.trim();
  switch (n) {
    case 'firecrawl_scrape':
    case 'scrape':
      return 'scrape';
    case 'firecrawl_map':
    case 'map':
      return 'map';
    case 'firecrawl_search':
    case 'search':
      return 'search';
    case 'firecrawl_crawl':
    case 'crawl':
      return 'crawl';
    case 'firecrawl_check_crawl_status':
    case 'crawl-status':
    case 'crawl_status':
      return 'crawl-status';
    case 'firecrawl_extract':
    case 'extract':
      return 'extract';
    case 'firecrawl_agent':
    case 'agent':
      return 'agent';
    case 'firecrawl_agent_status':
    case 'agent-status':
    case 'agent_status':
      return 'agent-status';
    default:
      return undefined;
  }
}

function normalizeToolInput(
  toolName: string | undefined,
  input: unknown,
  remainingPositionals: string[]
): { command: CommandName; positionals: string[]; args: Record<string, unknown> } {
  const obj = (input ?? undefined) as any;

  const nameFromInput = obj && typeof obj === 'object' ? obj.name : undefined;
  const argsFromInput =
    obj && typeof obj === 'object'
      ? obj.arguments ?? (nameFromInput ? undefined : obj)
      : obj;

  const resolvedToolName =
    (toolName && toolName.trim() !== '' ? toolName : undefined) ??
    (typeof nameFromInput === 'string' ? nameFromInput : undefined);
  if (!resolvedToolName) {
    throw new Error('tool requires a tool name (positional) or JSON { "name": "..." }');
  }

  const mapped = toolNameToCommand(resolvedToolName);
  if (!mapped || mapped === 'tool') {
    throw new Error(`Unknown tool: ${resolvedToolName}`);
  }

  const argsObj =
    argsFromInput && typeof argsFromInput === 'object' && !Array.isArray(argsFromInput)
      ? (argsFromInput as Record<string, unknown>)
      : {};

  return { command: mapped, positionals: remainingPositionals, args: argsObj };
}

function toJsonLines(result: unknown): string[] {
  if (Array.isArray(result)) {
    return result.map((v) => formatOutput(v, false));
  }

  if (result && typeof result === 'object') {
    const any = result as Record<string, unknown>;
    const dataKey = Array.isArray(any.data) ? 'data' : undefined;
    const linksKey = Array.isArray(any.links) ? 'links' : undefined;
    const key = dataKey ?? linksKey;

    if (key) {
      const { [key]: arr, ...rest } = any as any;
      const lines: string[] = [];
      if (Object.keys(rest).length > 0) {
        lines.push(formatOutput({ type: 'meta', ...rest }, false));
      }
      for (const item of arr as any[]) {
        lines.push(formatOutput({ type: key, value: item }, false));
      }
      return lines;
    }
  }

  return [formatOutput(result, false)];
}

export async function runCli({ argv, env, io, deps }: RunCliArgs): Promise<number> {
  const resolvedDeps: Required<RunCliDeps> = {
    readFile: deps?.readFile ?? defaultReadFile,
    mkdir: deps?.mkdir ?? defaultMkdir,
    createWriteStream: deps?.createWriteStream ?? defaultCreateWriteStream,
    createClient: deps?.createClient ?? createFirecrawlClient,
    createSchemas: deps?.createSchemas ?? createFirecrawlSchemas,
  };

  const { command, positionals, flags } = parseArgv(argv);

  if (flags.version === true) {
    try {
      // dist/cli.js -> ../package.json
      const pkgPath = fileURLToPath(new URL('../package.json', import.meta.url));
      const raw = await resolvedDeps.readFile(pkgPath, 'utf8');
      const pkg = JSON.parse(raw) as { name?: string; version?: string };
      io.writeStdout(`${pkg.name ?? 'firecrawl'}@${pkg.version ?? 'unknown'}\n`);
    } catch {
      const name = env.npm_package_name ?? 'firecrawl';
      const version = env.npm_package_version ?? 'unknown';
      io.writeStdout(`${name}@${version}\n`);
    }
    return 0;
  }

  if (!command || flags.help === true) {
    printHelp(io);
    return 0;
  }

  const logFormat = (resolveStringFlag(flags, 'log-format') as LogFormat) ?? 'text';
  const requestedLevel = resolveStringFlag(flags, 'log-level') as LogLevel | undefined;
  const logLevel: LogLevel =
    flags.quiet === true
      ? 'silent'
      : flags.debug === true
        ? 'debug'
        : flags.verbose === true
          ? 'info'
          : requestedLevel ?? 'error';
  const log = createLogger(io, logLevel, logFormat);

  const configPath = resolveStringFlag(flags, 'config');
  const profile = resolveStringFlag(flags, 'profile');
  const safeModeFlag = resolveBooleanFlag(flags, 'safe-mode');

  let cfgFile: ResolvedFirecrawlConfig | undefined;
  try {
    const loaded = await loadFirecrawlConfig({
      env,
      configPath,
      profile,
      readFileFn: resolvedDeps.readFile,
    });
    cfgFile = resolveConfig(
      env,
      {
        configPath,
        profile,
        apiKey: resolveStringFlag(flags, 'api-key'),
        apiUrl: resolveStringFlag(flags, 'api-url'),
        safeMode: safeModeFlag,
        origin: resolveStringFlag(flags, 'origin'),
      },
      loaded.file,
      loaded.path
    );
  } catch (e: any) {
    writeError(io, e?.message ? String(e.message) : String(e));
    return 1;
  }

  if (!cfgFile.apiKey && !cfgFile.apiUrl) {
    writeError(io, 'Either FIRECRAWL_API_KEY or FIRECRAWL_API_URL must be provided');
    return 1;
  }

  const schemas = resolvedDeps.createSchemas({ safeMode: cfgFile.safeMode });
  const client = resolvedDeps.createClient({ apiKey: cfgFile.apiKey, apiUrl: cfgFile.apiUrl });
  const origin = cfgFile.origin ?? 'cli';

  const input = (await readJsonInput(io, resolvedDeps, {
    json: resolveStringFlag(flags, 'json'),
    input: resolveStringFlag(flags, 'input'),
  })) as Record<string, unknown> | undefined;

  const outputPath = resolveStringFlag(flags, 'output');
  const useJsonl = flags.jsonl === true;
  const pretty =
    flags.pretty === true ? true : flags.raw === true ? false : io.stdoutIsTTY;

  const writeOut = async (text: string) => {
    if (!outputPath) {
      io.writeStdout(text);
      return;
    }
    await resolvedDeps.mkdir(path.dirname(outputPath), { recursive: true });
    const stream = resolvedDeps.createWriteStream(outputPath);
    await new Promise<void>((resolve, reject) => {
      stream.on('error', reject);
      stream.end(text, () => resolve());
    });
  };

  let cmd = command as CommandName;
  let args: Record<string, unknown> = mergeArgsWithPositional(cmd, positionals, input);
  let positionalForCommand = positionals;

  if (cmd === 'tool') {
    const toolName = positionals[0];
    const remaining = positionals.slice(1);
    try {
      const normalized = normalizeToolInput(toolName, input, remaining);
      cmd = normalized.command;
      positionalForCommand = normalized.positionals;
      args = mergeArgsWithPositional(cmd, positionalForCommand, normalized.args);
    } catch (e: any) {
      writeError(io, e?.message ? String(e.message) : String(e));
      return 1;
    }
  }

  log.debug('Resolved config', {
    profile: cfgFile.profile,
    configPath: cfgFile.configPath,
    apiUrl: cfgFile.apiUrl ? true : false,
    apiKey: cfgFile.apiKey ? true : false,
    safeMode: cfgFile.safeMode,
    origin,
  });

  try {
    let result: unknown;

    switch (cmd) {
      case 'tool':
        throw new Error('Internal error: tool should be normalized before execution');
      case 'scrape': {
        const parsed = (schemas.scrapeParamsSchema as any).parse(args) as Record<
          string,
          unknown
        >;
        const { url, ...options } = parsed as { url: string } & Record<
          string,
          unknown
        >;
        log.info('Scrape', { url });
        result = await (client as any).scrape(String(url), {
          ...removeEmptyTopLevel(options),
          origin,
        });
        break;
      }
      case 'map': {
        const parsed = (schemas.mapParamsSchema as any).parse(args) as Record<
          string,
          unknown
        >;
        const { url, ...options } = parsed as { url: string } & Record<
          string,
          unknown
        >;
        if ('sitemap' in options) options.sitemap = normalizeSitemap(options.sitemap);
        log.info('Map', { url });
        result = await (client as any).map(String(url), {
          ...removeEmptyTopLevel(options),
          origin,
        });
        break;
      }
      case 'search': {
        const parsed = (schemas.searchParamsSchema as any).parse(args) as Record<
          string,
          unknown
        >;
        const { query, ...options } = parsed as { query: string } & Record<
          string,
          unknown
        >;
        log.info('Search', { query });
        result = await (client as any).search(String(query), {
          ...removeEmptyTopLevel(options),
          origin,
        });
        break;
      }
      case 'crawl': {
        const parsed = (schemas.crawlParamsSchema as any).parse(args) as Record<
          string,
          unknown
        >;
        const { url, ...options } = parsed as { url: string } & Record<
          string,
          unknown
        >;
        if ('sitemap' in options) options.sitemap = normalizeSitemap(options.sitemap);
        log.info('Crawl', { url });
        result = await (client as any).startCrawl(String(url), {
          ...removeEmptyTopLevel(options),
          origin,
        });
        break;
      }
      case 'crawl-status': {
        const parsed = (schemas.checkCrawlStatusParamsSchema as any).parse(args) as Record<
          string,
          unknown
        >;
        const id = String((parsed as any).id);
        log.info('CrawlStatus', { id });
        result = await (client as any).getCrawlStatus(id);
        break;
      }
      case 'extract': {
        const parsed = (schemas.extractParamsSchema as any).parse(args) as Record<
          string,
          unknown
        >;
        log.info('Extract');
        result = await (client as any).extract({
          ...removeEmptyTopLevel(parsed),
          origin,
        });
        break;
      }
      case 'agent': {
        const parsed = (schemas.agentParamsSchema as any).parse(args) as Record<
          string,
          unknown
        >;
        log.info('Agent');
        // Start an async agent job; use agent-status to poll.
        result = await (client as any).startAgent(removeEmptyTopLevel(parsed));
        break;
      }
      case 'agent-status': {
        const parsed = (schemas.agentStatusParamsSchema as any).parse(args) as Record<
          string,
          unknown
        >;
        const id = String((parsed as any).id);
        log.info('AgentStatus', { id });
        result = await (client as any).getAgentStatus(id);
        break;
      }
      default:
        throw new Error(`Unknown command: ${cmd}`);
    }

    const outputText = useJsonl
      ? toJsonLines(result).join('\n') + '\n'
      : formatOutput(result, pretty) + '\n';

    await writeOut(outputText);
    return 0;
  } catch (e: any) {
    writeError(io, e?.message ? String(e.message) : String(e));
    return 1;
  }
}
