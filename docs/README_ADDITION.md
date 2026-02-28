# README Addition: Agent Configuration Section

Add this section to the main README.md after the existing installation sections and before the "Configuration" section.

---

## Agent Configuration

### Using Firecrawl MCP with AI Agents

When using Firecrawl MCP tools with AI agents (as opposed to direct chat), you may need additional configuration to ensure proper tool routing.

#### Known Issue: Agent Tool Routing

**Symptom**: Agents may incorrectly execute MCP tools as bash commands, resulting in:
```
Error: /bin/bash: line 1: mcp__firecrawl__firecrawl_scrape: command not found
```

**Cause**: This is a client-side issue where AI agents wrap MCP tool calls in `Bash()` execution instead of routing through the MCP protocol.

**Solution**: Add agent support flags to your configuration:

**For Claude Desktop:**
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

**For Cursor (v0.48.6+):**
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

**For Google Cloud VM / HTTPS Deployment:**
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

#### Verification

1. **Test Direct Invocation**:
   ```
   Chat: "use firecrawl to scrape https://example.com"
   Expected: Success ✅
   ```

2. **Test Agent Invocation**:
   - Create an agent with the above configuration
   - Have the agent scrape a URL
   - Expected: No bash error, successful scrape ✅

#### More Information

- 📚 [Agent Configuration Guide](./docs/AGENT_CONFIGURATION.md)
- 🔧 [Troubleshooting Guide](./docs/TROUBLESHOOTING.md)
- 🐛 [Report Agent Issues](https://github.com/firecrawl/firecrawl-mcp-server/issues/new?template=agent-tool-routing.md)

---
