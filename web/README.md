# Firecrawl sidebar interface

This MCP Apps interface follows the existing Firecrawl web usage page. Design
sources were copied from `firecrawl-web` commit
`d9fe0aeddca5fc77a6d552c327b17d0627d276da`:

- `colors.ts`: semantic light/dark tokens (`firecrawl.css` contains only used tokens).
- `public/fonts/SuisseIntl/{400,450,500}.woff2`: the actual dashboard fonts.
- `components/shared/firecrawl-icon/firecrawl-icon-static.tsx`: the brand icon.
- `tailwind.config.ts`, `components/ui/shadcn/button.tsx`,
  `components/app/app/usage/credits-balance-card.tsx`, and
  `components/app/app/usage/historical-chart-card.tsx`: typography, controls,
  spacing, and section borders.

Keep token names and values aligned with these sources when updating this UI.
The MCP repository does not depend on a neighboring web checkout at build time.

Provider collection tabs, grouped horizontal rows and category grids follow
`components/app/app/exchange/exchange-directory.tsx` from the same web commit.
The All view groups providers when the catalog supplies category metadata;
search and individual categories show a flat grid. Missing grouping metadata
falls back to the complete provider grid. Category tabs scroll on narrow
screens and use the web directory's active text treatment and spacing.
Providers and Usage share the same 1120px app width.

`usage.ts` uses the standard MCP Apps SDK bridge for initialization, theme changes,
read-only tool calls, and external links. All balance and usage data comes from
`firecrawl_credit_usage`, using the host's authenticated server connection.
Calendar-month usage is not inferred from the current balance or plan allowance.
A failed refresh clears the affected values; another section can still succeed.
The earliest month can be partial because the API returns recent history.

`pnpm build` generates one self-contained `dist/usage.html`, including fonts,
styles, and the SDK. `pnpm typecheck:ui` checks the browser source.
`pnpm preview:usage` opens a local host at http://127.0.0.1:4173 with sample data;
the controls exercise theme, width, missing metadata, empty usage, and failures.
The preview host is not included in the published npm package.

The **Providers** tab loads the live Alexandria catalog through free
`firecrawl_find_tools` calls, following the returned pagination for providers,
categories, and tools. Search covers every loaded provider. Category changes
discard stale responses; selection persists across filters. Tool inspection
shows the provider's published credit cost and loads input/output contracts on
demand. It never executes provider capabilities while browsing.

The provider card layout follows
`components/app/app/exchange/provider-card.tsx`; navigation follows the Alexandria
sidebar, and `button.css` is copied from
`components/ui/shadcn/button.css`. The interface uses the same semantic colors
and Suisse fonts as the Usage tab. Initials act as self-contained provider marks.
The provider dialog backdrop follows `components/ui/shadcn/dialog.tsx`:
the theme's base background at 80% opacity with a 12px blur. It does not use
black-alpha tokens, which become white in dark mode.

Select whole providers or individual tools to attach their context directly to
ChatGPT's native composer with `ui/update-model-context`. Text content blocks use
`_meta["openai/title"]` for named provider chips in this desktop host. The user
writes their request in the native chat composer; selection never sends a message
or starts a chat. The page has no custom chatbox or sticky selection tray.

Each removable provider block holds its own exact provider/capability IDs,
pricing, and contract lookup instructions. There is no hidden structured copy
that would remain after removing a native chip. Specific-tool selections include their full published contracts.
Whole-provider selections include compact tool summaries, with instructions to
fetch contracts before execution. This is context guidance, not a server-side
allowlist. Updates replace the app's previous context; clearing publishes empty
content with no structured content so the host removes the attachment. Concurrent
selections discard stale preparation and serialize host writes. Failed updates
retain selection with a retry action. Unsupported hosts disable selection while
allowing catalog browsing. Large context requires fewer selections.

The local preview uses synthetic provider data and records context payloads in
`window.modelContexts`, without creating real chats. It supports discovery,
context-error, delayed updates, and host-capability scenarios. The production
resource has no fixtures, credentials, or network access outside the authenticated
MCP bridge.

With that preview running, execute `node scripts/verify-usage-preview.mjs`
(optionally pass its URL) for browser regression checks covering pagination,
filter races, mixed provider/tool selection, contracts, retries, context
replacement and clearing, and unsupported host capabilities. This uses
`agent-browser`.

Provider logos follow `components/shared/provider-logo.tsx` and the exchange
provider card: a 24px image in the existing 40px mark, with a white surface and
original brand colors in both themes. Images are embedded in
`web/provider-logos.json`, keyed by exact catalog provider IDs. No domain is
guessed from a provider ID. Published embedded artwork can override a snapshot
logo; unavailable or broken images retain initials. Cached images and re-rendered
cards use the same load/error behavior. New providers keep initials until the
snapshot is refreshed.

Normal builds and the app require no network for logos. To refresh the snapshot,
run `FIRECRAWL_KEYCHAIN_ACCOUNT=your-account node scripts/refresh-provider-logos.mjs`
on macOS, or supply `FIRECRAWL_API_KEY` in the environment. This explicit step reads
free discovery metadata from Firecrawl, then fetches public favicons without
credentials. It never executes provider capabilities. Non-success icon responses
are omitted, including Google's generic globe on a 404. Existing artwork survives
transient failures. Firecrawl and Data Legion use the same brand overrides as
firecrawl-web. No credentials enter the generated JSON or HTML.
