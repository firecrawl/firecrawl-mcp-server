import { access, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export interface FirecrawlProfileConfig {
  apiKey?: string;
  apiUrl?: string;
  safeMode?: boolean;
  origin?: string;
}

export interface FirecrawlConfigFile {
  defaults?: {
    profile?: string;
    origin?: string;
  };
  profiles?: Record<string, FirecrawlProfileConfig>;
}

export interface ResolvedFirecrawlConfig {
  apiKey?: string;
  apiUrl?: string;
  safeMode?: boolean;
  origin?: string;
  profile?: string;
  configPath?: string;
}

export interface LoadConfigOptions {
  env: Record<string, string | undefined>;
  configPath?: string;
  profile?: string;
  readFileFn?: (p: string, enc: 'utf8') => Promise<string>;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export function defaultConfigSearchPaths(
  env: Record<string, string | undefined>
): string[] {
  const paths: string[] = [];
  if (env.FIRECRAWL_CONFIG) paths.push(env.FIRECRAWL_CONFIG);

  const xdg = env.XDG_CONFIG_HOME;
  const home = env.HOME ?? env.USERPROFILE ?? os.homedir();

  if (xdg) paths.push(path.join(xdg, 'firecrawl', 'config.json'));
  if (home) {
    paths.push(path.join(home, '.config', 'firecrawl', 'config.json'));
    paths.push(path.join(home, '.firecrawl', 'config.json'));
  }

  return Array.from(new Set(paths));
}

export async function loadFirecrawlConfig(
  options: LoadConfigOptions
): Promise<{ file?: FirecrawlConfigFile; path?: string }> {
  const readFileFn = options.readFileFn ?? readFile;

  const candidates = options.configPath
    ? [options.configPath]
    : defaultConfigSearchPaths(options.env);

  for (const candidate of candidates) {
    if (!candidate) continue;
    // Avoid throwing for missing optional config files
    if (!(await fileExists(candidate))) continue;
    const raw = await readFileFn(candidate, 'utf8');
    try {
      const parsed = JSON.parse(raw) as FirecrawlConfigFile;
      return { file: parsed, path: candidate };
    } catch {
      throw new Error(`Invalid config JSON: ${candidate}`);
    }
  }

  return {};
}

export function resolveConfig(
  env: Record<string, string | undefined>,
  flags: {
    configPath?: string;
    profile?: string;
    apiKey?: string;
    apiUrl?: string;
    safeMode?: boolean;
    origin?: string;
  },
  file?: FirecrawlConfigFile,
  configPath?: string
): ResolvedFirecrawlConfig {
  const profile =
    flags.profile ??
    env.FIRECRAWL_PROFILE ??
    file?.defaults?.profile ??
    'default';

  const profileCfg = file?.profiles?.[profile] ?? {};

  return {
    configPath,
    profile,
    apiKey: flags.apiKey ?? profileCfg.apiKey ?? env.FIRECRAWL_API_KEY,
    apiUrl: flags.apiUrl ?? profileCfg.apiUrl ?? env.FIRECRAWL_API_URL,
    safeMode:
      flags.safeMode ??
      profileCfg.safeMode ??
      (env.CLOUD_SERVICE === 'true' || env.FIRECRAWL_SAFE_MODE === 'true'),
    origin: flags.origin ?? profileCfg.origin ?? file?.defaults?.origin ?? 'cli',
  };
}
