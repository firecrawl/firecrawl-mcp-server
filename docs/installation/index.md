# Firecrawl MCP Server Installation Guide

This guide provides comprehensive installation instructions for Firecrawl MCP Server across all MCP-compatible environments.

## 🚀 Quick Start

### Choose Your Environment

| Environment                                         | Quick Install  | Status |
| --------------------------------------------------- | -------------- | ------ |
| [Claude Desktop](claude-desktop.md)                 | Manual Config  | ✅     |
| [Claude Code](claude-code.md)                       | CLI Command    | ✅     |
| [Cursor](cursor.md)                                 | Manual Config  | ✅     |
| [VS Code](vscode.md)                                | One-click      | ✅     |
| [Windsurf](windsurf.md)                             | Manual Config  | ✅     |
| [Cline](cline.md)                                   | Marketplace    | ✅     |
| [NPX](npx.md)                                       | One-line       | ✅     |
| [Smithery](smithery.md)                             | Universal      | ✅     |
| [Zed](zed.md)                                       | Extensions     | ✅     |
| [Augment Code](augment-code.md)                     | Marketplace    | ✅     |
| [Roo Code](roo-code.md)                             | Manual Config  | ✅     |
| [Gemini CLI](gemini-cli.md)                         | Manual Config  | ✅     |
| [Opencode](opencode.md)                             | Manual Config  | ✅     |
| [OpenAI Codex](openai-codex.md)                     | Manual Config  | ✅     |
| [JetBrains AI Assistant](jetbrains-ai-assistant.md) | GUI Config     | ✅     |
| [Kiro](kiro.md)                                     | GUI Config     | ✅     |
| [Trae](trae.md)                                     | Manual Config  | ✅     |
| [Docker](docker.md)                                 | Container      | ✅     |
| [Windows](windows.md)                               | Windows Config | ✅     |
| [Amazon Q Developer CLI](amazon-q-cli.md)           | Manual Config  | ✅     |
| [Warp](warp.md)                                     | GUI Config     | ✅     |
| [Copilot Coding Agent](copilot-coding-agent.md)     | Enterprise     | ✅     |
| [Crush](crush.md)                                   | Manual Config  | ✅     |
| [BoltAI](boltai.md)                                 | Manual Config  | ✅     |
| [Perplexity Desktop](perplexity-desktop.md)         | Manual Config  | ✅     |

### All Installation Guides

- [Claude Desktop](claude-desktop.md) - Anthropic Claude's official desktop app
- [Claude Code](claude-code.md) - Anthropic Claude's command-line interface
- [Cursor](cursor.md) - AI-powered code editor
- [VS Code](vscode.md) - Microsoft's popular code editor
- [Windsurf](windsurf.md) - Codeium's AI development environment
- [Cline](cline.md) - AI assistant with MCP marketplace
- [Zed](zed.md) - Modern high-performance code editor
- [Augment Code](augment-code.md) - AI-powered coding assistant
- [Roo Code](roo-code.md) - AI-powered coding assistant
- [Gemini CLI](gemini-cli.md) - Google Gemini's command-line interface
- [Opencode](opencode.md) - AI-powered development environment
- [OpenAI Codex](openai-codex.md) - AI-powered code completion tool
- [JetBrains AI Assistant](jetbrains-ai-assistant.md) - JetBrains IDE AI assistant
- [Kiro](kiro.md) - AI-powered development environment
- [Trae](trae.md) - AI-powered development environment
- [Docker](docker.md) - Containerized deployment
- [Windows](windows.md) - Windows-specific configuration
- [Amazon Q Developer CLI](amazon-q-cli.md) - AWS AI-powered CLI
- [Warp](warp.md) - AI-powered terminal
- [Copilot Coding Agent](copilot-coding-agent.md) - GitHub's enterprise AI assistant
- [Crush](crush.md) - Modern AI-powered development environment
- [BoltAI](boltai.md) - AI assistant with plugin-based MCP support
- [Perplexity Desktop](perplexity-desktop.md) - Research-focused AI assistant with connector support
- [NPX](npx.md) - Run directly without installation
- [Smithery](smithery.md) - Universal installation across all MCP clients

### Prerequisites

Before installing Firecrawl MCP, ensure you have:

- **Firecrawl API Key**: Get your free API key from [firecrawl.dev](https://www.firecrawl.dev/app/api-keys)
- **Node.js**: Version 18 or higher
- **npm**: Latest version recommended

## 🔧 Configuration

### Environment Variables

```bash
# Required for Cloud API
export FIRECRAWL_API_KEY=your-api-key

# Optional: Self-hosted instance
export FIRECRAWL_API_URL=https://firecrawl.your-domain.com

# Optional: Retry configuration
export FIRECRAWL_RETRY_MAX_ATTEMPTS=5
export FIRECRAWL_RETRY_INITIAL_DELAY=2000
```

### Common Configuration Patterns

Most MCP clients use one of these configuration patterns:

**JSON Configuration:**

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "your-api-key"
      }
    }
  }
}
```

**Command Line:**

```bash
env FIRECRAWL_API_KEY=your-api-key npx -y firecrawl-mcp
```

## ✅ Verification

After installation, verify that Firecrawl MCP is working:

1. **Check Server Status**: Look for "Firecrawl MCP Server initialized successfully" in logs
2. **Test Tools**: Try using `firecrawl_scrape` with a test URL
3. **Verify API Connection**: Ensure your API key is valid

## 🛠️ Troubleshooting

Having issues? Check our [Troubleshooting Guide](TROUBLESHOOTING.md) for common solutions.

### Common Issues

- **API Key Issues**: Verify your key is valid and not expired
- **Network Problems**: Check firewall and proxy settings
- **Permission Errors**: Ensure proper Node.js/npm permissions
- **Version Conflicts**: Update Node.js to v18+

## 📚 Additional Resources

- [Firecrawl Documentation](https://docs.firecrawl.dev)
- [MCP Specification](https://modelcontextprotocol.io)
- [Community Forum](https://github.com/firecrawl/firecrawl-mcp-server/discussions)

## 🤝 Contributing

Found an issue or want to add a new environment? Please [open an issue](https://github.com/firecrawl/firecrawl-mcp-server/issues) or submit a PR!

---

**Last Updated**: September 2024
**Firecrawl MCP Version**: Latest
