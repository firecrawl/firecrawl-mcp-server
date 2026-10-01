import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const worktree = fileURLToPath(new URL('../', import.meta.url));
const source = join(worktree, 'plugins/openai/firecrawl-usage-dev');
const root = join(homedir(), '.codex/local-marketplaces/firecrawl-sidebar');
const plugin = join(root, 'plugins/firecrawl-usage-dev');
await readFile(join(worktree, 'dist/usage.html'));
await mkdir(join(root, '.agents/plugins'), { recursive: true });
await cp(source, plugin, { recursive: true });
const mcp = JSON.parse(await readFile(join(plugin, 'mcp.json'), 'utf8'));
mcp.mcpServers['firecrawl-usage'].env = { FIRECRAWL_MCP_WORKTREE: worktree };
if (process.env.FIRECRAWL_KEYCHAIN_ACCOUNT) {
  mcp.mcpServers['firecrawl-usage'].env.FIRECRAWL_KEYCHAIN_ACCOUNT = process.env.FIRECRAWL_KEYCHAIN_ACCOUNT;
}
await writeFile(join(plugin, 'mcp.json'), JSON.stringify(mcp, null, 2) + '\n');
const legacyMcp = { mcpServers: Object.fromEntries(Object.entries(mcp.mcpServers).map(([name, server]) => {
  const { type, ...config } = server;
  return [name, config];
})) };
await writeFile(join(plugin, '.mcp.json'), JSON.stringify(legacyMcp, null, 2) + '\n');
await writeFile(join(root, '.agents/plugins/marketplace.json'), JSON.stringify({
  name: 'firecrawl-local',
  interface: { displayName: 'Firecrawl Local Development' },
  plugins: [{
    name: 'firecrawl-usage-dev',
    source: { source: 'local', path: './plugins/firecrawl-usage-dev' },
    policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
    category: 'Productivity',
  }],
}, null, 2) + '\n');
execFileSync('codex', ['plugin', 'marketplace', 'add', root], { stdio: 'inherit' });
execFileSync('codex', ['plugin', 'add', 'firecrawl-usage-dev@firecrawl-local'], { stdio: 'inherit' });
console.log('Installed Firecrawl Usage Dev. Restart the desktop app, open Plugins, then pin its app to the sidebar.');
