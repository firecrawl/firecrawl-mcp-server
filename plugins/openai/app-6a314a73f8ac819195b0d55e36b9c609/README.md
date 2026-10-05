# Firecrawl production plugin onboarding

This package updates the existing Firecrawl plugin to version 2.2.2 and retains
its published identity `app-6a314a73f8ac819195b0d55e36b9c609`, publisher, listing,
starter prompts, support/legal URLs, and workflow references. The source keeps
its registered `asdk_app_6a314a73f8ac819195b0d55e36b9c609` mapping in `.app.json`.
The listing and composer icon use the square 128px Firecrawl brand SVG.

This change is independent of the providers/usage sidebar in PR #473. It adds
skills and submission packaging against `main`, without MCP server changes,
frontend dependencies, or a sidebar app. Users who want to explore providers
receive free catalogue discovery and examples in the native chat.

## First-use onboarding

`extensions.com.openai.onboardingSkill` points to
`./skills/get-started/SKILL.md`. The host offers its native setup prompt when
installing the plugin. The skill confirms the authenticated connection before
asking questions, uses relevant available memory or conversation context for
suggestions, and discovers and executes a small first task once the user
supplies a concrete goal. Raw memories and unrelated history do not become
Firecrawl tool inputs. The references draw on Firecrawl-web's public onboarding
and workflow resources.

Alexandria leads the starting examples, followed by developer-index research,
page scraping, ordinary web search, and exploration. Users do not need to pick
providers in an app or repeat their goal in another prompt.

Native choice forms must stay pending until the user answers. The skill uses
an exposed interruptible wait; if that is unavailable or the form closes, the
full choices remain in chat. A preselected option or elapsed time is not an
answer. Native rendering and form lifetime remain controlled by the host.

## Production connection and submission format

The source package retains its registered app connection. The exported package
uses the full authenticated endpoint from `mcp-production.json`:
`https://mcp.firecrawl.dev/v2/mcp-oauth`. Authentication stays in the host's
Firecrawl connection; no credentials or local launchers are bundled.

Prepare a self-contained remote-MCP directory using a new output path:

```sh
pnpm plugin:prepare:openai /path/to/new-output-directory
```

The output includes portable `plugin.json` and `mcp.json`, a Codex compatibility
manifest/configuration, the icons, and every skill/reference. Both manifests
preserve the onboarding extension. Registered app references and development
launchers are excluded. The command refuses an existing destination and does
not create a ZIP, deploy a server, install, submit, or publish a plugin.

Zip the directory contents, including dotfiles, with the manifests at the
archive root. Upload through the existing Firecrawl plugin in the developer
dashboard, preserving its account connection and publication settings.

## Validation and release acceptance

Run `pnpm test`, `pnpm lint`, and skill validation. Tests verify skill links and
references against the actual MCP tool catalog, production identity/metadata,
OAuth endpoint, onboarding path, bundled icons/references, and exclusion of app
references or development files from the exported directory.

For a native acceptance run, install the draft and start a fresh setup chat.
Leave the goal question unanswered for at least 75 seconds and confirm that
it remains answerable or that the full choices remain in chat. Then answer
"YC companies" and check that the agent completes a small first task without
mandatory provider-picker navigation. Also check question dismissal, "skip
onboarding", OAuth cancellation and reconnect, and an unsure user receiving
provider examples in chat. Existing chats may retain earlier skill snapshots.
Automated tests do not validate native question lifetime or the installation
prompt's ordering relative to OAuth.

Suggested reviewer cases are expected behavior, not recorded test results:

| Case | Prompt | Expected tools and behavior |
| --- | --- | --- |
| Positive: first setup | "Help me get started with Firecrawl" | `firecrawl_credit_usage`; confirm connection, explain useful benefits, and keep the goal question answerable without a paid demo. |
| Positive: Alexandria | "Find five YC companies" | `firecrawl_find_tools`, then `firecrawl_scrape` with the discovered contract; return supported fields and sources without picker navigation. |
| Positive: developer index | "Why does useEffect run twice in React Strict Mode?" | `firecrawl_developer_search`; explain with links to retrieved evidence. |
| Positive: supplied URL | "Read https://docs.firecrawl.dev and summarize its main capabilities" | `firecrawl_scrape`; summarize the retrieved page with a source link. |
| Positive: ordinary search | "Find recent news about battery recycling" | `firecrawl_search`; return dated, sourced findings. |
| Negative: no paid sample | "Explain what this can do; don't spend credits" | Explain benefits; only free discovery if useful, no billed retrieval. |
| Negative: cancelled connection | Cancel OAuth during setup | Do not claim authentication succeeded or use a different account; wait for sign-in before authenticated execution. |
| Negative: unavailable history | "Use all my other chats to pick providers" with no history access | State the context limit; do not invent access or transmit raw memories or unrelated history. |

Before publication, replay these native acceptance cases and provide reviewer
account access and a demo recording through the existing submission workflow.
No review/publication settings or test credentials are fabricated here.

References: [Plugin packaging](https://developers.openai.com/plugins/build/plugins)
and [submission requirements](https://developers.openai.com/plugins/deploy/submission).
