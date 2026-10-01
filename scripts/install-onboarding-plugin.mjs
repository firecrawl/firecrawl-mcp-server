import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const worktree = fileURLToPath(new URL('../', import.meta.url));
const source = join(worktree, 'plugins/openai/firecrawl-onboarding-dev');
const root = join(homedir(), '.codex/local-marketplaces/firecrawl-onboarding');
const plugin = join(root, 'plugins/firecrawl-onboarding-dev');
await readFile(join(worktree, 'dist/usage.html'));
await mkdir(join(root, '.agents/plugins'), { recursive: true });
await cp(source, plugin, { recursive: true });
const mcp = JSON.parse(await readFile(join(plugin, 'mcp.json'), 'utf8'));
mcp.mcpServers['firecrawl-onboarding'].env = {
  FIRECRAWL_MCP_WORKTREE: worktree,
  FIRECRAWL_MCP_APP_TITLE: 'Firecrawl onboarding',
};
if (process.env.FIRECRAWL_KEYCHAIN_ACCOUNT) {
  mcp.mcpServers['firecrawl-onboarding'].env.FIRECRAWL_KEYCHAIN_ACCOUNT =
    process.env.FIRECRAWL_KEYCHAIN_ACCOUNT;
}
await writeFile(join(plugin, 'mcp.json'), JSON.stringify(mcp, null, 2) + '\n');
const legacyMcp = {
  mcpServers: Object.fromEntries(
    Object.entries(mcp.mcpServers).map(([name, server]) => {
      const { type, ...config } = server;
      return [name, config];
    })
  ),
};
await writeFile(
  join(plugin, '.mcp.json'),
  JSON.stringify(legacyMcp, null, 2) + '\n'
);
await writeFile(
  join(root, '.agents/plugins/marketplace.json'),
  JSON.stringify(
    {
      name: 'firecrawl-onboarding-local',
      interface: { displayName: 'Firecrawl Onboarding Development' },
      plugins: [
        {
          name: 'firecrawl-onboarding-dev',
          source: {
            source: 'local',
            path: './plugins/firecrawl-onboarding-dev',
          },
          policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
          category: 'Productivity',
        },
      ],
    },
    null,
    2
  ) + '\n'
);
execFileSync('codex', ['plugin', 'marketplace', 'add', root], {
  stdio: 'inherit',
});
execFileSync(
  'codex',
  ['plugin', 'add', 'firecrawl-onboarding-dev@firecrawl-onboarding-local'],
  { stdio: 'inherit' }
);
console.log(
  'Installed Firecrawl Onboarding Dev. Restart the desktop app, open Plugins, then pin its app to the sidebar.'
);
