# Firecrawl onboarding development plugin

A separate installable plugin for the first-open onboarding experiment. It uses
Providers and Usage from `codex/mcp-providers-usage` and adds Welcome, Your sources,
and Start exploring. It does not include Results.

```sh
pnpm build
FIRECRAWL_KEYCHAIN_ACCOUNT=your-account node scripts/install-onboarding-plugin.mjs
```

The installer creates a dedicated `firecrawl-onboarding-local` marketplace and
installs **Firecrawl Onboarding Dev**, keeping Firecrawl Usage Dev and Results Dev
installations intact. It stores the worktree path and optional Keychain account
selector, never the API key. Open its app from Plugins and pin it to the sidebar.

The `onboardingSkill` manifest field points to `skills/get-started/SKILL.md`.
The visual flow appears on first app open; automatic launch during installation
has not been verified. Choose **Manage sources** to revisit setup.

Onboarding selection is a draft. **Add sources to chat** prepares the exact
provider/tool context and waits for the host's acknowledgment before completion.
It sends no chat messages and runs no paid provider capabilities. Failures retain
the draft with retry and skip options. Hosts without model-context support can
save preferences and browse the directory.

Completion and provider IDs/tool IDs are saved in local storage when available.
This is local-device preference storage, not Firecrawl account configuration or
cross-device sync. The app reports blocked storage and uses an in-memory draft.
Saved sources are resolved against the live catalog before attachment; missing
providers and unavailable tools require review. Returning visits do not attach
anything automatically.

Run `pnpm preview:usage` for the returning-user fixture, or open
`http://127.0.0.1:4173/?onboarding=1` for a fresh setup fixture. The fixtures use
sample usage and providers, never credentials or paid calls.
