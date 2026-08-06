---
name: Agent Tool Routing Issue
about: Report issues with agents incorrectly executing MCP tools as bash commands
title: '[Agent Routing] '
labels: 'agent-issue, client-side'
assignees: ''
---

## ⚠️ Important Note

This issue appears to be related to how AI agent clients (Claude Desktop, Cursor, etc.) route MCP tool calls. This is typically a **client-side configuration issue**, not a bug in the Firecrawl MCP Server.

**Before filing this issue**, please:
1. Review our [Agent Configuration Guide](../../docs/AGENT_CONFIGURATION.md)
2. Try the solutions in [Troubleshooting Guide](../../docs/TROUBLESHOOTING.md  
3. Consider reporting to your AI client support if the issue persists

---

## Problem Description

**Symptom**: Agent attempts to execute Firecrawl MCP tool as a bash command

**Error Message**:
```
/bin/bash: line 1: mcp__firecrawl__firecrawl_scrape: command not found
```

## Environment

**AI Client** (check one):
- [ ] Claude Desktop
- [ ] Cursor
- [ ] VS Code with Cline/Continue
- [ ] Windsurf
- [ ] Other (please specify): ___________

**Client Version**: (e.g., Claude Desktop 1.2.3, Cursor 0.48.6)

**Operating System**:
- [ ] macOS
- [ ] Windows
- [ ] Linux (which distro): ___________
- [ ] Cloud VM (which provider): ___________

**Deployment Type**:
- [ ] Local (stdio)
- [ ] HTTP/HTTPS
- [ ] SSE (Server-Sent Events)

## MCP Server Configuration

**Firecrawl MCP Version**: (run `npx -y firecrawl-mcp --version`)

**Configuration** (sanitize your API key):
```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "<REDACTED>"
      }
    }
  }
}
```

## Steps to Reproduce

1. Configure Firecrawl MCP Server in your AI client
2. Verify direct tool calls work: "use firecrawl to scrape https://example.com"
3. Create an agent that attempts to use Firecrawl tools
4. Observe agent executing: `Bash(mcp__firecrawl__firecrawl_scrape '...')`

## Expected Behavior

Agent should invoke Firecrawl MCP tool through the MCP protocol, resulting in successful scraping.

## Actual Behavior

Agent wraps MCP tool call in `Bash()` execution, resulting in "command not found" error.

## Verification Checklist

- [ ] Direct MCP tool calls work (not through agent)
- [ ] MCP server shows as "connected" in client settings
- [ ] Tried latest version of Firecrawl MCP (`npm install -g firecrawl-mcp@latest`)
- [ ] Reviewed [Agent Configuration Guide](../../docs/AGENT_CONFIGURATION.md)
- [ ] Added `agentSupport: true` or `allowedForAgents: true` to configuration
- [ ] Restarted AI client after configuration changes

## Logs

**MCP Server Logs** (if available):
```
[Paste MCP server logs here]
```

**Agent Error Output**:
```
[Paste full error message here]
```

## Additional Context

Add any other context about the problem here. For example:
- Does the issue occur with all Firecrawl tools or specific ones?
- Does the issue occur with all agents or specific agent configurations?
- Any custom agent system prompts being used?

---

## Next Steps

Based on our investigation, this is likely a client-side issue. Please:

1. **Try the configuration fixes** in our [Agent Configuration Guide](../../docs/AGENT_CONFIGURATION.md)
2. **If issue persists**, report to your AI client's support:
   - Claude Desktop: https://support.anthropic.com
   - Cursor: https://forum.cursor.com
   - VS Code: Your MCP client extension's issue tracker

3. **Update this issue** with results from trying the recommended fixes

We'll help troubleshoot and update our documentation based on your findings!
