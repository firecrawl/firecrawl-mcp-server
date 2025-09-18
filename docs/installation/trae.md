# Trae

## Overview

Trae is an AI-powered development environment that supports MCP (Model Context Protocol) servers, enabling Firecrawl's web scraping capabilities directly within your coding workflow.

## Prerequisites

- Trae installed
- Firecrawl API Key
- Node.js 18+ (for local server option)

## Installation

### Quick Install

1. **Get Firecrawl API Key**
   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Configure in Trae**
   - Use Trae's "Add manually" feature
   - Fill in the JSON configuration (see below)

### Step-by-Step

1. **Get Firecrawl API Key**
   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Open Trae MCP Settings**
   - Launch Trae
   - Navigate to MCP servers configuration
   - Look for "Add manually" feature

3. **Add MCP Server**
   - Use the "Add manually" option
   - A JSON configuration dialog will appear

4. **Configure Firecrawl**
   - Paste the Firecrawl MCP configuration (see below)
   - Choose between remote or local server connection
   - Save the configuration

## Configuration

Use the Add manually feature and fill in the JSON configuration information for that MCP server.
For more details, visit the [Trae documentation](https://docs.trae.ai/ide/model-context-protocol?_lang=en).

### Trae Remote Server Connection (Recommended)

```json
{
  "mcpServers": {
    "firecrawl": {
      "url": "https://api.firecrawl.dev/mcp",
      "headers": {
        "Authorization": "Bearer fc-your-api-key-here"
      }
    }
  }
}
```

### Trae Local Server Connection

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"]
    }
  }
}
```

### Trae Self-Hosted Configuration

```json
{
  "mcpServers": {
    "firecrawl": {
      "url": "https://your-firecrawl-instance.com/mcp",
      "headers": {
        "Authorization": "Bearer your-self-hosted-key"
      }
    }
  }
}
```

### Trae Remote Server with Additional Headers

```json
{
  "mcpServers": {
    "firecrawl": {
      "url": "https://api.firecrawl.dev/mcp",
      "headers": {
        "Authorization": "Bearer fc-your-api-key-here",
        "X-Retry-Max-Attempts": "5",
        "X-Credit-Warning-Threshold": "2000",
        "X-Client-ID": "trae"
      }
    }
  }
}
```

### Trae Local Server with Environment Variables

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
        "FIRECRAWL_CREDIT_WARNING_THRESHOLD": "2000",
        "FIRECRAWL_CREDIT_CRITICAL_THRESHOLD": "500"
      }
    }
  }
}
```

## Configuration UI Location

**MCP Servers Settings**:
- Use Trae's "Add manually" feature for MCP servers
- Configuration is managed through JSON input
- Both remote and local server connections supported
- Save configuration after entering JSON

## Verification

### Test Installation

1. **Open Trae**
   - Launch Trae development environment

2. **Check Configuration**
   - Navigate to MCP servers settings
   - Verify Firecrawl MCP appears in the configured servers list
   - Status should show as "Connected" or "Active"

3. **Test with Trae AI**
   - Open the AI chat interface
   - Try a web scraping request:
     ```
     Can you scrape https://httpbin.org/json and show me the content?
     ```

4. **Check Available Tools**
   Trae should have access to:
   - `firecrawl_scrape`
   - `firecrawl_search`
   - `firecrawl_map`
   - `firecrawl_crawl`
   - `firecrawl_extract`
   - `firecrawl_batch_scrape`

### Expected Output

```
I'll scrape that website for you using Firecrawl.

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
      }
    ]
  }
}
```

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| **Configuration not saving** | Check JSON syntax and Trae permissions |
| **API key rejected** | Use Bearer token format for remote connections |
| **Server not connecting** | Check URL and API key format |
| **Tools not available** | Restart Trae and check MCP servers settings |
| **Local server fails** | Ensure Node.js 18+ is installed |

### Configuration Issues

1. **JSON Configuration**:
   - Ensure valid JSON syntax with proper commas and quotes
   - Remote servers use `"url"` and optional `"headers"`
   - Local servers use `"command"` and `"args"`

2. **API Key Format**:
   - Remote servers: Use `Authorization: Bearer fc-your-api-key-here`
   - Local servers: Use `--api-key fc-your-api-key-here` or environment variables

3. **Server Types**:
   - Remote: Use `"url"` for HTTP connections
   - Local: Use `"command"` and `"args"` for npx execution

4. **Manual Addition**:
   - Use the "Add manually" feature in Trae
   - Paste the complete JSON configuration

### Debug Mode

Enable debug logging:

```bash
# Set debug environment variable
export DEBUG=firecrawl-mcp:*

# Test local server manually
npx -y firecrawl-mcp --api-key fc-your-api-key-here

# Test remote connection
curl -H "Authorization: Bearer fc-your-api-key-here" https://api.firecrawl.dev/mcp
```

## Advanced Configuration

### Custom Retry Settings

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"],
      "env": {
        "FIRECRAWL_RETRY_MAX_ATTEMPTS": "10",
        "FIRECRAWL_RETRY_INITIAL_DELAY": "500",
        "FIRECRAWL_RETRY_MAX_DELAY": "60000",
        "FIRECRAWL_RETRY_BACKOFF_FACTOR": "2"
      }
    }
  }
}
```

### Proxy Configuration

```json
{
  "mcpServers": {
    "firecrawl": {
      "url": "https://api.firecrawl.dev/mcp",
      "headers": {
        "Authorization": "Bearer fc-your-api-key-here",
        "X-Proxy-URL": "http://proxy.company.com:8080"
      }
    }
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

### Research and Analysis

```
Search for recent AI research papers, extract the titles and publication dates, and identify the main trends.
```

### Data Extraction

```
Go to https://example.com/products and extract all product information into a structured format.
```

### Code Generation

```
Generate a function that uses Firecrawl to scrape and process data from a news website.
```

## Performance Tips

1. **Remote vs Local**: Remote is easier, local gives more control and debugging
2. **API Key Format**: Use Bearer token for remote, command-line args for local
3. **Manual Addition**: Use "Add manually" feature for complete control
4. **Latest Version**: Always use latest Firecrawl MCP version for best features
5. **Trae Restart**: Some configuration changes may require Trae restart

## Support

- **Trae Documentation**: [Trae MCP Documentation](https://docs.trae.ai/ide/model-context-protocol?_lang=en)
- **Firecrawl Documentation**: [Firecrawl Docs](https://docs.firecrawl.dev)
- **API Key Issues**: [Firecrawl API Dashboard](https://www.firecrawl.dev/app/api-keys)
- **Trae Support**: Check Trae's official documentation

## Environment-Specific Notes

- Trae uses a "Add manually" feature for MCP server configuration
- Configuration is managed through JSON input dialog
- Supports both remote (HTTP) and local (stdio) server connections
- Remote connections use `"url"` property with optional `"headers"`
- Local connections use `"command"` and `"args"` properties
- Bearer token authentication for remote connections
- Environment variables supported for local server configuration
- Self-hosted instances work with both connection types
- JSON configuration requires proper syntax validation
- Manual addition provides complete control over server settings
- Both HTTP and stdio transport protocols supported

---

**Environment Compatibility**: ✅ Verified
**Last Tested**: September 2024
**Firecrawl MCP Version**: Latest
**Trae Version**: Latest (with MCP support)