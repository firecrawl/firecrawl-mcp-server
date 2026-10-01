# Firecrawl production plugin

This source package retains the published Firecrawl identity
`app-6a314a73f8ac819195b0d55e36b9c609` and its registered
`asdk_app_6a314a73f8ac819195b0d55e36b9c609` mapping in `.app.json`.
Version 2.2.1 carries forward the published 2.2.0 listing text, publisher,
starter prompts, support/legal URLs, and all workflow references. The skill adds
the sidebar launcher to the existing account-usage guidance. The listing and
composer icon are the square 128px Firecrawl brand SVG; the MCP sidebar launcher
embeds that same artwork.

## Production connection and submission format

`mcp-production.json` selects the full authenticated account endpoint:
`https://mcp.firecrawl.dev/v2/mcp-oauth`. Its public protected-resource metadata
identifies that resource and `https://www.firecrawl.dev` as the authorization
server. Authentication stays in the host's Firecrawl account connection.
There are no bundled credentials, local process launchers, or Keychain settings.

The source package continues to work through its registered app mapping. Current
OpenAI ZIP uploads cannot contain `apps`/`.app.json` references. Prepare a
separate, self-contained directory for a future upload with:

```sh
pnpm plugin:prepare:openai /path/to/new-output-directory
```

The output retains the same plugin name, publisher, listing metadata, skills and
references. It includes a portable `plugin.json`, `mcp.json`, square icon, and a
Codex compatibility manifest/configuration. It excludes registered app-reference
files and development launchers. Preparation refuses an existing destination;
it does not create a ZIP, install a plugin, submit a draft, or deploy a server.
Use the existing Firecrawl plugin in the developer dashboard when later uploading
an update. Preserve its account connection and publication settings there.

The UI resource declares `https://mcp.firecrawl.dev` as this plugin's dedicated
component origin, fullscreen display, an empty network/asset CSP, a human-readable
description, and the Firecrawl dashboard origin as an external-link destination.
The app bundles its fonts and provider logos and makes authenticated calls only
through the MCP bridge. Native selections carry exact provider/tool context and
never send a message or execute provider capabilities while browsing.

## Validation and remaining release work

Run `pnpm test`, `pnpm lint`, and the browser regressions documented in
`web/README.md`. The automated submission checks verify endpoint selection,
identity, preserved metadata and skill files, icon paths/dimensions, and the
absence of app references or development files in the generated directory.

Preparing this directory does not enable the UI at the production endpoint.
The server build still needs staging deployment and a real sidebar/composer
check in ChatGPT Developer Mode. Final ZIP assembly, reviewer cases, credentials,
and video preparation are separate release steps. No review/publication settings
or test credentials are fabricated in this package.

References: [Plugin packaging](https://developers.openai.com/plugins/build/plugins),
[submission requirements](https://developers.openai.com/plugins/deploy/submission),
and [UI resource metadata](https://developers.openai.com/plugins/reference).
