# Agent Configuration Guide

This guide explains how to configure Firecrawl MCP Server for AI agent usage.

##  Problem: Agent Tool Routing Issue

When AI agents (vs direct chat) attempt to invoke Firecrawl MCP tools, they may incorrectly wrap the tool calls in `Bash()` execution, resulting in:

```
Error: /bin/bash: line 1: mcp__firecrawl__firecrawl_scrape: command not found
```

**Root Cause**: This is a client-side issue where agents misroute MCP tools to bash instead of the MCP protocol.

## Solutions

### 1. Claude Desktop Configuration

Add `agentSupport` flag to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "YOUR_API_KEY"
      },
      "agentSupport": true
    }
  }
}
```

### 2. Cursor Configuration (v0.48.6+)

Add `allowedForAgents` to your MCP server configuration:

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "YOUR_API_KEY"
      },
      "allowedForAgents": true
    }
  }
}
```

### 3. Google Cloud VM / Claude Code (HTTPS Mode)

For Claude Code running on Google Cloud VM with HTTPS transport:

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "YOUR_API_KEY",
        "CLOUD_SERVICE": "true",
        "HTTP_STREAMABLE_SERVER": "true"
      },
      "agentSupport": true,
      "transportType": "httpStream"
    }
  }
}
```

### 4. Agent System Prompt

When creating custom agents, add explicit instructions:

```
SYSTEM PROMPT:
"When you need to scrape web pages, use the firecrawl_scrape MCP tool.
Do NOT execute it as a bash command.
Call it as an MCP protocol tool with proper JSON arguments."

Example correct invocation:
{
  "tool": "firecrawl_scrape",
  "arguments": {
    "url": "https://example.com",
    "formats": ["markdown"]
  }
}
```

## Verification Steps

1. **Check MCP Server Connection**
   - Open your AI client settings
   - Verify `firecrawl-mcp` shows as "connected" or "active"

2. **Test Direct Invocation First**
   ```
   Direct chat: "Use firecrawl to scrape https://example.com"
   Expected: Success ✅
   ```

3. **Test Agent Invocation**
   - Create an agent with the configuration above
   - Have the agent attempt to scrape a URL
   - Expected: No bash error, successful scrape ✅

## Troubleshooting

### Agent still wraps tool in Bash()

**Solution**: Update to latest MCP server version and client software:
```bash
npm install -g firecrawl-mcp@latest
```

### MCP server not showing in agent context

**Solution**: Restart your AI client after configuration changes.

### Permission denied errors

**Solution**: Ensure API key is valid and has proper permissions:
```bash
# Test API key
curl -X POST https://api.firecrawl.dev/v1/scrape \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

## Related Issues

- See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for more detailed debugging
- Report client-side agent issues to your AI client support (Claude/Cursor/etc)
- Report MCP server bugs to: https://github.com/firecrawl/firecrawl-mcp-server/issues

## Additional Resources

- [MCP Protocol Specification](https://modelcontextprotocol.io)
- [Claude Code Documentation](https://docs.anthropic.com/claude/docs/model-context-protocol)
- [Cursor MCP Guide](https://docs.cursor.com/context/model-context-protocol)
