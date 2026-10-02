import assert from 'node:assert/strict';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const pluginSource = fileURLToPath(
  new URL(
    '../plugins/openai/app-6a314a73f8ac819195b0d55e36b9c609/',
    import.meta.url
  )
);
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const writeJson = (path, value) =>
  writeFile(path, JSON.stringify(value, null, 2) + '\n');

// Keep registered app mapping in the source package. Public ZIP uploads accept
// remote MCP configurations, not apps/.app.json references. Never create a new
// Firecrawl identity or include the Keychain development launcher in this output.
export async function prepareOpenAIPlugin(output) {
  const manifest = await json(join(pluginSource, '.codex-plugin/plugin.json'));
  const mapping = await json(join(pluginSource, '.app.json'));
  const connection = await json(join(pluginSource, 'mcp-production.json'));
  assert.equal(manifest.name, 'app-6a314a73f8ac819195b0d55e36b9c609');
  assert.equal(
    mapping.apps[manifest.name].id,
    'asdk_app_6a314a73f8ac819195b0d55e36b9c609'
  );
  assert.deepEqual(connection.mcpServers, {
    firecrawl: {
      type: 'streamable-http',
      url: 'https://mcp.firecrawl.dev/v2/mcp-oauth',
    },
  });
  const destination = resolve(output);
  // Refuse existing destinations instead of erasing user files or stale builds.
  await mkdir(dirname(destination), { recursive: true });
  await mkdir(destination);
  await cp(join(pluginSource, 'skills'), join(destination, 'skills'), {
    recursive: true,
  });
  await cp(join(pluginSource, 'assets'), join(destination, 'assets'), {
    recursive: true,
  });
  const { apps, skills, ...compatibility } = manifest;
  await writeJson(join(destination, 'plugin.json'), {
    $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    author: manifest.author,
    extensions: { 'com.openai': { interface: manifest.interface } },
  });
  await writeJson(join(destination, 'mcp.json'), connection);
  await writeJson(join(destination, '.mcp.json'), {
    mcpServers: { firecrawl: { url: connection.mcpServers.firecrawl.url } },
  });
  await mkdir(join(destination, '.codex-plugin'));
  await writeJson(join(destination, '.codex-plugin/plugin.json'), {
    ...compatibility,
    skills,
    mcpServers: './.mcp.json',
  });
  return destination;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  if (!process.argv[2])
    throw new Error(
      'Pass a new output directory: pnpm plugin:prepare:openai /path/to/output'
    );
  console.log(await prepareOpenAIPlugin(process.argv[2]));
}
