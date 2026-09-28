# MCP plugin packages

Plugin packages for web search, content retrieval, developer research, and
scientific literature with Firecrawl.

| Package | Connection | Skills |
| --- | --- | --- |
| [OpenAI](openai/app-6a314a73f8ac819195b0d55e36b9c609) | Existing registered Firecrawl app in ChatGPT and Codex | `firecrawl`, with workflow references |
| [Claude](claude/firecrawl-search) | `https://mcp.firecrawl.dev/v2/mcp-search` | `firecrawl`, `firecrawl-developer-index`, `firecrawl-research-index` |

The OpenAI package covers the full authenticated tool set. Its `.app.json`
preserves the registered app connection and authentication. The Claude package
uses the [search endpoint's eight-tool contract](../docs/search-profile.md) and
its account-connection flow.

## Maintain the packages

Edit the files here when an MCP workflow changes. Keep the accepted parameters,
job lifecycles, and tool names consistent with the corresponding server profile.
`pnpm test` checks packaged tool references against both profiles' `tools/list`
responses and verifies that skill links resolve inside their own package.

Use the umbrella for common routing. Put detailed procedures in the relevant
reference or focused skill. Supporting files belong inside the skill that uses
them so that each skill can be packaged independently.

## Test and distribute

For a local Claude Code check, run from the repository root:

```sh
claude plugin validate ./plugins/claude/firecrawl-search
claude --plugin-dir ./plugins/claude/firecrawl-search
```

Complete the Firecrawl account connection in the client before using tools.
Check a web lookup, a supplied URL, a programming question, and a paper question.
Inspect the requested source and scope as well as whether the tool call succeeds.

For the OpenAI package, load the package directory through a supported local
plugin installation flow in Codex. For distribution, use the existing Firecrawl
plugin submission and registered app mapping. Replace the previous skill set
with the package's `skills/` contents, preserving the reference directories.
Test the draft in ChatGPT and Codex before submitting it for publication.

For a plugin archive, include the manifest, connection file, and `skills/`
directory at the archive root. Include dotfiles such as `.app.json`, `.mcp.json`,
`.codex-plugin/`, and `.claude-plugin/` as applicable. A skill-only upload contains
that skill's folder, including its `SKILL.md` and references.

Maintain these packages in this repository. Update the packaged version and
publish through the relevant plugin distribution flow.

See the [OpenAI packaging guide](https://developers.openai.com/plugins/build/plugins)
and [Claude plugin reference](https://code.claude.com/docs/en/plugins-reference)
for the supported manifest and distribution formats.
