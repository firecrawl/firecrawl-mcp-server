# CODE-DOC-TEMPLATE.md — firecrawl #2176

## Project Overview
- **Bounty:** mendableai/firecrawl #2176 — Add Installation Instructions for All MCP-Compatible Environments ($50)
- **Status:** Complete — ready for review

## What Was Done
Added installation instructions for 25 new MCP-compatible environments to README.md (+517 lines):

| Environment | Config Format |
|------------|--------------|
| Claude Code (CLI) | Shell command |
| Cline | VS Code JSON |
| Continue | YAML |
| Roo Code | JSON |
| Zed | JSON (context_servers) |
| JetBrains IDEs | JSON (AI Assistant) |
| Neovim (mcp-hub + avante) | JSON + Lua |
| Emacs (mcp.el) | Elisp |
| Amazon Q Developer | JSON |
| Copilot (VS Code) | JSON |
| Warp Terminal | JSON |
| Opencode | JSON |
| Firebase Genkit | TypeScript |
| Goose (Block) | YAML |
| Msty | UI steps |
| Enconvo | UI steps |
| ZBrain | JSON |
| add-mcp | One-liner |
| OpenAI Codex CLI | TOML |
| Gemini CLI | JSON |
| LM Studio | JSON |
| Augment Code | Settings |
| Kiro | JSON |
| Trae | JSON |

## Quality Checklist
- [x] All 20+ environments documented
- [x] Each has prerequisites, config, and verification steps
- [x] Consistent formatting matching existing README style
- [x] Links verified (broken links removed/fixed)
- [x] `npx -y firecrawl-mcp` used consistently
- [x] FIRECRAWL_API_KEY env var in all configs
