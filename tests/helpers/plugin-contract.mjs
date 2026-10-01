import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const openaiPlugin = fileURLToPath(
  new URL(
    '../../plugins/openai/app-6a314a73f8ac819195b0d55e36b9c609/',
    import.meta.url
  )
);
export const claudePlugin = fileURLToPath(
  new URL('../../plugins/claude/firecrawl-search/', import.meta.url)
);

export function instructionFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return instructionFiles(path);
    return entry.isFile() && entry.name.endsWith('.md') ? [path] : [];
  });
}

export function assertPluginToolCoverage(plugin, tools) {
  const mentioned = new Set(
    instructionFiles(join(plugin, 'skills')).flatMap((path) =>
      [...readFileSync(path, 'utf8').matchAll(/`(firecrawl_[a-z0-9_]+)`/g)].map(
        (match) => match[1]
      )
    )
  );
  const available = new Set(tools.map((tool) => tool.name));
  for (const name of mentioned) {
    assert.ok(available.has(name), `${plugin} references unavailable tool ${name}`);
  }
  for (const name of available) {
    assert.ok(mentioned.has(name), `${plugin} has no tool reference for ${name}`);
  }
}
