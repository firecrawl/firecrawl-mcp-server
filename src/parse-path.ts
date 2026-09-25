import { realpath } from 'node:fs/promises';
import path from 'node:path';

export function parseRootFromEnv(
  env: NodeJS.ProcessEnv,
  cwd: string
): string {
  const configured = env.FIRECRAWL_PARSE_ROOT?.trim();
  if (configured) return configured;
  return cwd;
}

export async function resolveParseFile(
  filePath: string,
  root: string
): Promise<string> {
  let rootReal: string;
  try {
    rootReal = await realpath(root);
  } catch {
    throw new Error(`Parse root does not exist: ${root}`);
  }

  const abs = path.resolve(rootReal, filePath);
  let fileReal: string;
  try {
    fileReal = await realpath(abs);
  } catch {
    throw new Error(`Cannot read file: ${filePath}`);
  }

  const rel = path.relative(rootReal, fileReal);
  if (
    rel === '' ||
    rel === '..' ||
    rel.startsWith(`..${path.sep}`) ||
    path.isAbsolute(rel)
  ) {
    throw new Error('filePath is outside the parse root');
  }
  return fileReal;
}
