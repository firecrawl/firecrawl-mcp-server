# Claude Desktop

## Overview

Claude Desktop is Anthropic's official desktop application that supports MCP (Model Context Protocol) servers. Firecrawl MCP integrates seamlessly with Claude Desktop to provide web scraping capabilities.

## Prerequisites

- Claude Desktop (latest version)
- Firecrawl API Key
- macOS or Windows

## Installation

### Quick Install

```bash
# Get your API key first
# Visit: https://www.firecrawl.dev/app/api-keys
```

### Step-by-Step

1. **Get Firecrawl API Key**
   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Locate Configuration File**
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

3. **Create/Edit Configuration**
   ```json
   {
     "mcpServers": {
       "firecrawl": {
         "command": "npx",
         "args": ["-y", "firecrawl-mcp"],
         "env": {
           "FIRECRAWL_API_KEY": "fc-your-api-key-here"
         }
       }
     }
   }
   ```

4. **Restart Claude Desktop**
   - Completely quit and restart Claude Desktop
   - The MCP server will initialize automatically

## Configuration

### Basic Configuration

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "fc-your-api-key-here"
      }
    }
  }
}
```

### Advanced Configuration

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "fc-your-api-key-here",

        "FIRECRAWL_RETRY_MAX_ATTEMPTS": "5",
        "FIRECRAWL_RETRY_INITIAL_DELAY": "2000",
        "FIRECRAWL_RETRY_MAX_DELAY": "30000",
        "FIRECRAWL_RETRY_BACKOFF_FACTOR": "3",

        "FIRECRAWL_CREDIT_WARNING_THRESHOLD": "2000",
        "FIRECRAWL_CREDIT_CRITICAL_THRESHOLD": "500",

        "FIRECRAWL_API_URL": "https://api.firecrawl.dev"
      }
    }
  }
}
```

### Self-Hosted Configuration

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_URL": "https://your-firecrawl-instance.com",
        "FIRECRAWL_API_KEY": "your-self-hosted-key"
      }
    }
  }
}
```

## Verification

### Test Installation

1. **Open Claude Desktop**
2. **Start a new conversation**
3. **Test with a simple request**:
   ```
   Can you scrape https://httpbin.org/json and show me the content?
   ```

4. **Check for available tools**:
   Claude should have access to:
   - `firecrawl_scrape`
   - `firecrawl_search`
   - `firecrawl_map`
   - `firecrawl_crawl`
   - `firecrawl_extract`

### Expected Output

```
I'll scrape that website for you.

[Tool Use: firecrawl_scrape]
{"url": "https://httpbin.org/json", "formats": ["markdown"]}

Here's the content from https://httpbin.org/json:

{
  "slideshow": {
    "author": "Yours Truly",
    "date": "date of publication",
    "slides": [
      {
        "title": "Wake up to WonderWidgets!",
        "type": "all"
      },
      {
        "items": [
          "Why <em>WonderWidgets</em> are great",
          "Who <em>buys</em> WonderWidgets"
        ],
        "title": "Overview",
        "type": "all"
      }
    ],
    "title": "Sample Slide Show"
  }
}
```

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| **Tools not appearing** | Check JSON syntax and restart Claude Desktop |
| **API key errors** | Verify API key is valid and starts with `fc-` |
| **Connection issues** | Check internet connection and firewall settings |
| **Permission errors** | Ensure Claude Desktop has necessary permissions |

### Debug Mode

Enable debug logging to troubleshoot issues:

```bash
# Set debug environment variable
export DEBUG=firecrawl-mcp:*

# Then restart Claude Desktop
```

### Configuration File Issues

1. **Validate JSON syntax**:
```bash
# macOS/Linux
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json | python -m json.tool

# Windows
type %APPDATA%\Claude\claude_desktop_config.json | python -m json.tool
```

2. **Check file permissions**:
```bash
# macOS/Linux
ls -la ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Windows
icacls %APPDATA%\Claude\claude_desktop_config.json
```

### Log Files

Check Claude Desktop logs for MCP server status:
- **macOS**: `~/Library/Logs/Claude/`
- **Windows**: `%APPDATA%\Claude\logs\`

## Advanced Configuration

### Custom Retry Settings

```json
{
  "env": {
    "FIRECRAWL_RETRY_MAX_ATTEMPTS": "10",
    "FIRECRAWL_RETRY_INITIAL_DELAY": "500",
    "FIRECRAWL_RETRY_MAX_DELAY": "60000",
    "FIRECRAWL_RETRY_BACKOFF_FACTOR": "2"
  }
}
```

### Credit Monitoring

```json
{
  "env": {
    "FIRECRAWL_CREDIT_WARNING_THRESHOLD": "5000",
    "FIRECRAWL_CREDIT_CRITICAL_THRESHOLD": "1000"
  }
}
```

## Integration Examples

### Basic Web Scraping

```
Can you scrape the main content from https://example.com and give me a summary?
```

### Search and Extract

```
Search for recent AI research papers and extract the titles and authors.
```

### Data Extraction

```
Go to https://example.com/products and extract all product names and prices into a structured format.
```

## Support

- **Documentation**: [Firecrawl Docs](https://docs.firecrawl.dev)
- **API Key Issues**: [Firecrawl API Dashboard](https://www.firecrawl.dev/app/api-keys)
- **Claude Desktop Support**: [Anthropic Help Center](https://support.anthropic.com)

## Environment-Specific Notes

- Claude Desktop automatically manages MCP server lifecycle
- Configuration changes require complete restart of the application
- Multiple MCP servers can be configured simultaneously
- Works offline once initialized, but requires internet for web scraping

---

**Environment Compatibility**: ✅ Verified
**Last Tested**: September 2024
**Firecrawl MCP Version**: Latest
**Claude Desktop Version**: Latest