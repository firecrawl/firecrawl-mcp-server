# Troubleshooting Guide

Comprehensive guide for diagnosing and fixing common issues with Firecrawl MCP Server.

## Table of Contents

1. [Agent Tool Routing Issues](#agent-tool-routing-issues)
2. [Connection Issues](#connection-issues)
3. [Authentication Errors](#authentication-errors)
4. [Tool Invocation Failures](#tool-invocation-failures)
5. [Performance Issues](#performance-issues)

---

## Agent Tool Routing Issues

### Problem: Agent executes MCP tool as bash command

**Symptoms**:
```
Error: /bin/bash: line 1: mcp__firecrawl__firecrawl_scrape: command not found
```

**Root Cause**: This is a client-side issue where AI agents incorrectly wrap MCP tool calls in `Bash()` execution instead of routing through the MCP protocol.

**Solutions**:

#### 1. Add Agent Support Configuration

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
      "agentSupport": true  // ← ADD THIS
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
      "allowedForAgents": true  // ← ADD THIS
    }
  }
}
```

#### 2. Update Agent System Prompt

Add explicit instructions to your agent:
```
"When scraping websites, use the firecrawl_scrape MCP tool.
Do NOT execute it as a bash command.
Invoke it as an MCP protocol tool with JSON arguments."
```

#### 3. Verify MCP Server Connection

```bash
# Check if server is running
ps aux | grep firecrawl-mcp

# Test direct invocation (not agent)
# In your AI client: "use firecrawl to scrape https://example.com"
```

#### 4. Update to Latest Version

```bash
npm install -g firecrawl-mcp@latest
```

#### 5. Restart Your AI Client

After configuration changes, fully restart your AI client (Claude Desktop, Cursor, etc.)

---

## Connection Issues

### Problem: MCP server not connecting

**Symptoms**:
- Server shows as "disconnected" in client settings
- Tools not appearing in tool list
- Timeout errors

**Diagnostic Steps**:

```bash
# 1. Check if server can start standalone
env FIRECRAWL_API_KEY=your-key npx -y firecrawl-mcp

# 2. Check for port conflicts (if using HTTP mode)
lsof -i :3000

# 3. Check environment variables
echo $FIRECRAWL_API_KEY
```

**Solutions**:

#### stdio Transport (default)
```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

#### HTTP Transport
```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "YOUR_API_KEY",
        "HTTP_STREAMABLE_SERVER": "true",
        "PORT": "3000"
      }
    }
  }
}
```

---

## Authentication Errors

### Problem: API key rejected

**Symptoms**:
```
Error: Firecrawl API key is required
Error: Invalid API key
Error: Unauthorized
```

**Solutions**:

#### 1. Verify API Key Format

Firecrawl API keys start with `fc-`:
```bash
# Correct format
fc-1234567890abcdef...

# Incorrect (missing prefix)
1234567890abcdef...
```

#### 2. Test API Key

```bash
curl -X POST https://api.firecrawl.dev/v1/scrape \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "formats": ["markdown"]}'
```

#### 3. Check API Key Expiration

- Log in to https://www.firecrawl.dev/app/api-keys
- Verify key is active
- Generate new key if needed

#### 4. Environment Variable Issues

```bash
# Check if variable is set
env | grep FIRECRAWL

# Set directly in shell (for testing)
export FIRECRAWL_API_KEY="fc-your-key-here"

# Test
npx -y firecrawl-mcp
```

---

## Tool Invocation Failures

### Problem: Tool calls fail with validation errors

**Symptoms**:
```
Error: Invalid parameters
Error: Missing required field 'url'
Error: formats must be an array
```

**Solutions**:

#### 1. Check Parameter Format

**firecrawl_scrape** requires:
```json
{
  "url": "https://example.com",  // ✅ Required
  "formats": ["markdown"]         // ✅ Required (array)
}
```

Common mistakes:
```json
{
  "url": "example.com",           // ❌ Missing https://
  "formats": "markdown"           // ❌ Should be array
}
```

#### 2. Validate JSON Syntax

```bash
# Use jq to validate JSON
echo '{"url": "https://example.com", "formats": ["markdown"]}' | jq .
```

#### 3. Check Tool-Specific Requirements

| Tool | Required Parameters | Optional |
|------|-------------------|----------|
| `firecrawl_scrape` | `url`, `formats` | `maxAge`, `actions`, `waitFor` |
| `firecrawl_search` | `query` | `limit`, `sources`, `scrapeOptions` |
| `firecrawl_crawl` | `url` | `limit`, `maxDiscoveryDepth`, `scrapeOptions` |
| `firecrawl_extract` | `urls` | `prompt`, `schema` |

---

## Performance Issues

### Problem: Slow scraping or timeouts

**Symptoms**:
- Scrape requests taking > 30 seconds
- Timeout errors
- Rate limit warnings

**Solutions**:

#### 1. Use maxAge for Caching

```json
{
  "url": "https://example.com",
  "formats": ["markdown"],
  "maxAge": 172800000  // Cache for 48 hours (500% faster!)
}
```

#### 2. Adjust Retry Configuration

```bash
export FIRECRAWL_RETRY_MAX_ATTEMPTS=5
export FIRECRAWL_RETRY_INITIAL_DELAY=2000
export FIRECRAWL_RETRY_MAX_DELAY=30000
```

#### 3. Use Batch Scraping for Multiple URLs

Instead of:
```javascript
// Don't do this (sequential)
for (const url of urls) {
  await scrape(url);
}
```

Do this:
```json
{
  "tool": "firecrawl_batch_scrape",
  "arguments": {
    "urls": ["url1", "url2", "url3"],
    "formats": ["markdown"]
  }
}
```

#### 4. Monitor Credit Usage

```bash
# Set warning thresholds
export FIRECRAWL_CREDIT_WARNING_THRESHOLD=1000
export FIRECRAWL_CREDIT_CRITICAL_THRESHOLD=100
```

---

## Getting More Help

### 1. Check Server Logs

```bash
# Enable logging
export CLOUD_SERVICE=true  # or HTTP_STREAMABLE_SERVER=true

# Run server in foreground
npx -y firecrawl-mcp

# Watch for errors in output
```

### 2. Report Issues

**MCP Server Bugs:**
- Repository: https://github.com/firecrawl/firecrawl-mcp-server/issues
- Include: version, configuration, logs, error messages

**Client-Side Agent Issues:**
- Claude Desktop: https://support.anthropic.com
- Cursor: https://forum.cursor.com
- Use our [issue template](../.github/ISSUE_TEMPLATE/agent-tool-routing.md)

### 3. Community Support

- Discord: https://discord.com/invite/gSmWdAkdwd
- Firecrawl Docs: https://docs.firecrawl.dev
- MCP Protocol: https://modelcontextprotocol.io

---

## Quick Reference: Common Error Codes

| Error | Meaning | Solution |
|-------|---------|----------|
| `command not found` | Agent bash routing issue | See [Agent Tool Routing](#agent-tool-routing-issues) |
| `Unauthorized` | Invalid API key | Check API key format and validity |
| `Rate limit exceeded` | Too many requests | Use `maxAge` caching, reduce frequency |
| `Invalid parameters` | Malformed request | Validate JSON syntax and required fields |
| `Connection refused` | Server not running | Check MCP server status and configuration |
| `Timeout` | Request took too long | Increase retry delays, use caching |

---

**Last Updated**: 2025-12-12  
**Version**: 3.6.2
