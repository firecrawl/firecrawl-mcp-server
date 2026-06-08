import { readFile } from 'node:fs/promises';

export type CliInfoResult = {
  exitCode: number;
  output: string;
  stream: 'stdout' | 'stderr';
};

const HELP_TEXT = `Usage: firecrawl-mcp [options]

Starts the Firecrawl MCP server.

Options:
  -h, --help      Print this help message
  -v, --version   Print the installed package version

Configuration:
  FIRECRAWL_API_KEY      Firecrawl cloud API key
  FIRECRAWL_API_URL      Self-hosted Firecrawl API URL
`;

async function readPackageVersion(packageJsonUrl: URL): Promise<string> {
  const packageJson = JSON.parse(await readFile(packageJsonUrl, 'utf8')) as {
    version?: unknown;
  };

  return typeof packageJson.version === 'string' ? packageJson.version : 'unknown';
}

export async function getCliInfoResult(
  argv: string[],
  packageJsonUrl = new URL('../package.json', import.meta.url)
): Promise<CliInfoResult | undefined> {
  if (argv.includes('--help') || argv.includes('-h')) {
    return {
      exitCode: 0,
      output: HELP_TEXT,
      stream: 'stdout',
    };
  }

  if (argv.includes('--version') || argv.includes('-v')) {
    return {
      exitCode: 0,
      output: `${await readPackageVersion(packageJsonUrl)}\n`,
      stream: 'stdout',
    };
  }

  const unknownFlag = argv.find((arg) => arg.startsWith('-'));
  if (unknownFlag) {
    return {
      exitCode: 1,
      output: `error: unknown option '${unknownFlag}'\nRun firecrawl-mcp --help for usage.\n`,
      stream: 'stderr',
    };
  }

  return undefined;
}

export async function handleCliInfoFlags(argv = process.argv.slice(2)): Promise<void> {
  const result = await getCliInfoResult(argv);

  if (!result) return;

  const target = result.stream === 'stdout' ? process.stdout : process.stderr;
  target.write(result.output);
  process.exit(result.exitCode);
}
