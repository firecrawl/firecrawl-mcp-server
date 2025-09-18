# Firecrawl MCP Server Troubleshooting Guide

This guide covers common issues and solutions when installing and using Firecrawl MCP Server across different environments.

## 🔍 Quick Diagnosis

### Common Symptoms

| Symptom | Likely Cause | Quick Fix |
|---------|--------------|-----------|
| Server not starting | Missing API key | Verify `FIRECRAWL_API_KEY` |
| Tools not appearing | Incorrect MCP config | Check JSON configuration |
| API errors | Invalid/expired key | Get new API key |
| Network timeouts | Firewall/proxy | Check network settings |
| Permission errors | Node.js/npm issues | Run with appropriate permissions |

## 🚨 Critical Issues

### 1. API Key Problems

**Error**: `Invalid API key` or `Unauthorized`

**Solutions:**
```bash
# Verify API key format
echo $FIRECRAWL_API_KEY
# Should start with "fc-"

# Get new API key
# Visit: https://www.firecrawl.dev/app/api-keys

# Test API key directly
curl -H "Authorization: Bearer fc-your-key" https://api.firecrawl.dev/v1/test
```

**Configuration Check:**
```json
{
  "env": {
    "FIRECRAWL_API_KEY": "fc-your-actual-key-here"
  }
}
```

### 2. MCP Server Not Connecting

**Error**: `MCP server not found` or `Connection refused`

**Solutions:**
```bash
# Check if npx can access the package
npx -y firecrawl-mcp --help

# Verify Node.js version
node --version  # Should be 18+
npm --version   # Should be latest

# Clear npm cache if needed
npm cache clean --force
```

### 3. Permission Errors

**Error**: `EACCES: permission denied`

**Solutions:**
```bash
# Linux/macOS: Fix npm permissions
sudo chown -R $(whoami) ~/.npm
sudo chown -R $(whoami) /usr/local/lib/node_modules

# Or use npx (recommended)
npx -y firecrawl-mcp

# Windows: Run as administrator or use npx
```

## 🔧 Environment-Specific Issues

### Claude Desktop

**Issue**: Configuration not loading

**Solutions:**
1. **Check config location**:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`

2. **Validate JSON syntax**:
```bash
# Validate JSON
cat claude_desktop_config.json | python -m json.tool
```

3. **Restart Claude Desktop** after config changes

### Cursor

**Issue**: MCP servers not appearing

**Solutions:**
1. **Check Cursor version**: Requires v0.45.6+
2. **Use correct configuration section**: Features > MCP Servers
3. **Restart Cursor** after adding servers
4. **Check Windows command format**:
```json
{
  "command": "cmd",
  "args": ["/c", "set FIRECRAWL_API_KEY=your-key && npx -y firecrawl-mcp"]
}
```

### VS Code

**Issue**: One-click install not working

**Solutions:**
1. **Manual configuration**:
```json
// In settings.json
{
  "mcp": {
    "inputs": [
      {
        "type": "promptString",
        "id": "apiKey",
        "description": "Firecrawl API Key",
        "password": true
      }
    ],
    "servers": {
      "firecrawl": {
        "command": "npx",
        "args": ["-y", "firecrawl-mcp"],
        "env": {
          "FIRECRAWL_API_KEY": "${input:apiKey}"
        }
      }
    }
  }
}
```

### Windsurf

**Issue**: Configuration file not found

**Solutions:**
1. **Create config directory**:
```bash
mkdir -p ./codeium/windsurf
```

2. **Create config file**:
```json
// ./codeium/windsurf/model_config.json
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

## 🌐 Network Issues

### Firewall/Proxy Issues

**Symptoms**: Timeouts, connection refused

**Solutions:**
```bash
# Test network connectivity
curl -I https://api.firecrawl.dev

# Test with proxy (if needed)
export HTTP_PROXY=http://proxy.company.com:8080
export HTTPS_PROXY=http://proxy.company.com:8080
env FIRECRAWL_API_KEY=your-key npx -y firecrawl-mcp
```

### Corporate Networks

**Solutions:**
1. **Whitelist domains**:
   - `api.firecrawl.dev`
   - `firecrawl.dev`
   - `npmjs.com`

2. **Use corporate npm registry**:
```bash
npm config set registry https://registry.npmjs.org/
```

## 📊 Performance Issues

### Slow Response Times

**Solutions:**
```bash
# Enable debug logging
export DEBUG=firecrawl-mcp:*
env FIRECRAWL_API_KEY=your-key npx -y firecrawl-mcp

# Configure retry settings
export FIRECRAWL_RETRY_MAX_ATTEMPTS=3
export FIRECRAWL_RETRY_INITIAL_DELAY=1000
export FIRECRAWL_RETRY_MAX_DELAY=10000
```

### Memory Usage

**Solutions:**
```bash
# Monitor memory usage
node -e "console.log(`Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`)"

# Use Docker for isolation
docker run --rm -e FIRECRAWL_API_KEY=your-key firecrawl-mcp
```

## 🐛 Debug Mode

### Enable Debug Logging

```bash
# Enable all debug logs
export DEBUG=firecrawl-mcp:*

# Enable specific modules
export DEBUG=firecrawl-mcp:server,firecrawl-mcp:tools

# Run with debug
env FIRECRAWL_API_KEY=your-key npx -y firecrawl-mcp
```

### Log Analysis

**Common log patterns:**
```
[INFO] Firecrawl MCP Server initialized successfully  # ✅ Working
[ERROR] Invalid API key                              # ❌ API key issue
[WARN] Rate limit exceeded, retrying...              # ⚠️ Rate limiting
[ERROR] Connection refused                           # ❌ Network issue
```

### Test Commands

```bash
# Test server startup
env FIRECRAWL_API_KEY=your-key npx -y firecrawl-mcp --test

# Test specific tool
echo '{"name": "firecrawl_scrape", "arguments": {"url": "https://httpbin.org/json"}}' | \
env FIRECRAWL_API_KEY=your-key npx -y firecrawl-mcp
```

## 🔄 Self-Hosted Firecrawl

### Configuration Issues

**Solutions:**
```bash
# Test self-hosted endpoint
curl -H "Authorization: Bearer your-key" https://your-firecrawl.com/v1/test

# Configure custom endpoint
export FIRECRAWL_API_URL=https://your-firecrawl.com
export FIRECRAWL_API_KEY=your-key
npx -y firecrawl-mcp
```

### SSL/TLS Issues

**Solutions:**
```bash
# Skip TLS verification (not recommended for production)
export NODE_TLS_REJECT_UNAUTHORIZED=0

# Or use valid certificates
# Ensure your Firecrawl instance has valid SSL certs
```

## 📝 Configuration Validation

### JSON Configuration Validator

```bash
# Validate MCP configuration
cat config.json | python -m json.tool

# Check for required fields
cat config.json | jq '.mcpServers.firecrawl.command'
cat config.json | jq '.mcpServers.firecrawl.env.FIRECRAWL_API_KEY'
```

### Environment Variable Check

```bash
# Check all Firecrawl environment variables
env | grep FIRECRAWL

# Test API key format
echo $FIRECRAWL_API_KEY | grep -E "^fc-"
```

## 🚀 Getting Help

### Before Seeking Help

1. **Check this guide** - Most common issues are covered
2. **Search existing issues** - [GitHub Issues](https://github.com/firecrawl/firecrawl-mcp-server/issues)
3. **Run diagnostic tests**:
```bash
# System info
node --version && npm --version

# Network test
curl -I https://api.firecrawl.dev

# Package test
npx -y firecrawl-mcp --help
```

### Creating a Good Issue Report

Include:
1. **Environment**: OS, Node.js version, MCP client
2. **Configuration**: Relevant config (remove API keys)
3. **Error messages**: Full error logs with debug mode
4. **Steps to reproduce**: What you did before the issue
5. **Expected vs actual behavior**: What you expected vs what happened

### Community Resources

- **Documentation**: [Firecrawl Docs](https://docs.firecrawl.dev)
- **GitHub Discussions**: [Community Forum](https://github.com/firecrawl/firecrawl-mcp-server/discussions)
- **Discord**: [Firecrawl Community](https://discord.gg/firecrawl)

---

**Last Updated**: September 2024
**Firecrawl MCP Version**: Latest