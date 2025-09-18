# [Environment Name]

## Overview

[Brief description of the environment and why someone would use Firecrawl MCP with it]

## Prerequisites

- [Environment-specific requirements]
- Node.js 18+
- npm
- Firecrawl API Key

## Installation

### Quick Install

```bash
# One-liner installation command
```

### Step-by-Step

1. **Step 1**: [Description]
   ```bash
   # Command for step 1
   ```

2. **Step 2**: [Description]
   ```bash
   # Command for step 2
   ```

3. **Step 3**: [Description]
   ```bash
   # Command for step 3
   ```

## Configuration

### Method 1: Configuration File

Create/edit the configuration file at `[file path]`:

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

### Method 2: Environment Variables

```bash
export FIRECRAWL_API_KEY="your-api-key"
# Additional environment variables if needed
```

### Method 3: Command Line

```bash
# Direct command line usage
env FIRECRAWL_API_KEY=your-api-key npx -y firecrawl-mcp
```

## Verification

### Test Installation

1. **Check Server Status**:
   ```bash
   # Command to check if server is running
   ```

2. **Test MCP Connection**:
   ```bash
   # Command to test MCP connection
   ```

3. **Verify Tools Available**:
   Look for these tools in your environment:
   - `firecrawl_scrape`
   - `firecrawl_search`
   - `firecrawl_map`
   - `firecrawl_crawl`
   - `firecrawl_extract`

### Expected Output

```
[INFO] Firecrawl MCP Server initialized successfully
[INFO] Starting server with stdio transport
[INFO] Available tools: scrape, search, map, crawl, extract, batch_scrape
```

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| **API Key Invalid** | Verify your API key at [firecrawl.dev](https://www.firecrawl.dev/app/api-keys) |
| **Permission Denied** | Check file permissions and user access |
| **Network Issues** | Verify internet connection and firewall settings |
| **Version Conflicts** | Ensure Node.js 18+ and latest npm |

### Debug Mode

Enable debug logging:

```bash
export DEBUG=firecrawl-mcp:*
env FIRECRAWL_API_KEY=your-api-key npx -y firecrawl-mcp
```

### Log Files

Check logs at:
- `[Log file location]`
- `[Alternative log location]`

## Advanced Configuration

### Custom API Endpoint

```json
{
  "env": {
    "FIRECRAWL_API_KEY": "your-api-key",
    "FIRECRAWL_API_URL": "https://your-firecrawl-instance.com"
  }
}
```

### Retry Configuration

```json
{
  "env": {
    "FIRECRAWL_API_KEY": "your-api-key",
    "FIRECRAWL_RETRY_MAX_ATTEMPTS": "5",
    "FIRECRAWL_RETRY_INITIAL_DELAY": "2000",
    "FIRECRAWL_RETRY_MAX_DELAY": "30000"
  }
}
```

## Integration Examples

### Basic Usage

```json
{
  "name": "firecrawl_scrape",
  "arguments": {
    "url": "https://example.com",
    "formats": ["markdown"]
  }
}
```

### Advanced Usage

```json
{
  "name": "firecrawl_extract",
  "arguments": {
    "urls": ["https://example.com"],
    "prompt": "Extract product information",
    "schema": {
      "type": "object",
      "properties": {
        "name": {"type": "string"},
        "price": {"type": "number"}
      }
    }
  }
}
```

## Support

- **Documentation**: [Firecrawl Docs](https://docs.firecrawl.dev)
- **Issues**: [GitHub Issues](https://github.com/firecrawl/firecrawl-mcp-server/issues)
- **Community**: [Discussions](https://github.com/firecrawl/firecrawl-mcp-server/discussions)

## Environment-Specific Notes

[Add any environment-specific tips, limitations, or special considerations]

---

**Environment Compatibility**: ✅ Verified | 🚧 In Progress | ❌ Not Supported
**Last Tested**: [Date]
**Firecrawl MCP Version**: [Version]