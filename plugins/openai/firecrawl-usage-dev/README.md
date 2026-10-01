# Firecrawl usage sidebar app: local plugin

This package tests the new Plugin Extensions global entrypoint. It installs a
named plugin with a bundled MCP server, so the desktop plugin manager can offer
the app-opening and sidebar-pinning controls. The dashboard opens fullscreen;
its launcher is app-only and does not render an inline card in chat.

The portable root manifest also includes a `.codex-plugin/plugin.json` OpenAI
compatibility overlay and `.mcp.json` for installed desktop runtimes that do not
yet discover the portable `mcp.json` automatically.

From the MCP repository, run:

```sh
pnpm build
node scripts/install-usage-plugin.mjs
```

The installer stages this package in a dedicated personal marketplace and
installs it using the Codex plugin CLI. It writes only the development worktree
path (and an optional Keychain account selector), never the API key. The server
reads the `FIRECRAWL_API_KEY` generic-password item from macOS Keychain at launch.
Set `FIRECRAWL_KEYCHAIN_ACCOUNT` when installing if multiple accounts use that
service name.

Restart the desktop app, open Plugins, select **Firecrawl Usage Dev**, open its
app, and choose **Pin to sidebar**. Select that sidebar item to return to the
fullscreen dashboard without sending a chat message. Its **Providers** tab lets
you browse/search the live Alexandria catalog, inspect contracts, and select
providers or individual tools. Selecting attaches the exact tool context and
execution guidance to the native chat composer. Type your request there when
ready. Deselecting updates the context; **Clear** removes the app's attachment.
This requires the host's MCP Apps model-context support. Selection never sends a
message or starts a new chat. Browsing only calls free discovery.

After updating this existing installation, rebuild and reopen the sidebar app
(or restart MCP servers if the app cached the previous HTML). The plugin/server
identity and resource URI stay the same so the existing sidebar pin can remain.

The local plugin loads the built server from the worktree. Rebuild the server
after code changes and restart MCP servers. Reinstall after changing package
metadata or its launcher. This does not update the public Firecrawl plugin;
that requires shipping the MCP server with these UI resources and extensions.

References: [Plugin Extensions](https://developers.openai.com/plugins/build/extensions)
and [plugin packaging](https://developers.openai.com/plugins/build/plugins).

The orange Firecrawl logo is bundled in `assets/firecrawl.svg` and advertised
in the launcher's MCP `icons` descriptor as a self-contained SVG data URI. The
sidebar uses launcher icons independently of the package listing logo. After
changing this metadata, restart MCP servers or the desktop app to refresh the
cached descriptor. The existing sidebar pin identity stays the same.

Provider logos are bundled for offline rendering, with initials for missing or
broken artwork. The Providers directory includes collection tabs, category
shelves and search using the Firecrawl web design system. This build contains
Providers and Usage only. See `web/README.md` for logo refresh instructions.
