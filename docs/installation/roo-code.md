# Roo Code

## Overview

Roo Code is an AI-powered coding assistant that supports MCP (Model Context Protocol) servers, enabling Firecrawl's web scraping capabilities directly within your coding environment.

## Prerequisites

- Roo Code installed
- Firecrawl API Key
- Node.js 18+ (for local server option)

## Installation

### Quick Install

1. **Get Firecrawl API Key**
   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Add Configuration**
   - Open Roo Code MCP configuration file
   - Add Firecrawl MCP server configuration (see below)

### Step-by-Step

1. **Get Firecrawl API Key**
   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Locate Configuration File**
   - Find Roo Code's MCP configuration file
   - See Roo Code documentation for exact location

3. **Add Configuration**
   - Add Firecrawl MCP to your `mcpServers` configuration
   - Choose between remote or local server connection

## Configuration

Add this to your Roo Code MCP configuration file. See [Roo Code MCP docs](https://docs.roocode.com/features/mcp/using-mcp-in-roo) for more info.

### Roo Code Remote Server Connection (Recommended)

```json
{
  "mcpServers": {
    "firecrawl": {
      "type": "streamable-http",
      "url": "https://api.firecrawl.dev/mcp",
      "headers": {
        "Authorization": "Bearer fc-your-api-key-here"
      }
    }
  }
}
```

### Roo Code Local Server Connection

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

### Self-Hosted Configuration

```json
{
  "mcpServers": {
    "firecrawl": {
      "type": "streamable-http",
      "url": "https://your-firecrawl-instance.com/mcp",
      "headers": {
        "Authorization": "Bearer your-self-hosted-key"
      }
    }
  }
}
```

### Advanced Configuration

#### Remote Server with Additional Headers

```json
{
  "mcpServers": {
    "firecrawl": {
      "type": "streamable-http",
      "url": "https://api.firecrawl.dev/mcp",
      "headers": {
        "Authorization": "Bearer fc-your-api-key-here",
        "X-Retry-Max-Attempts": "5",
        "X-Credit-Warning-Threshold": "2000",
        "X-Client-ID": "roo-code"
      }
    }
  }
}
```

#### Local Server with Environment Variables

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

## Configuration File Location

**Global Settings**:
- Check Roo Code documentation for your operating system
- Typically located in user settings directory

**Project-Specific Settings**:
- Create configuration file in your project root

## Verification

### Test Installation

1. **Open Roo Code**
   - Launch Roo Code

2. **Check MCP Status**
   - Navigate to Settings/MCP configuration
   - Verify Firecrawl MCP appears as configured
   - Status should show as "Connected" or "Active"

3. **Test with Roo Code AI**
   - Open the AI chat interface
   - Try a web scraping request:
     ```
     Can you scrape https://httpbin.org/json and show me the content?
     ```

4. **Check Available Tools**
   Roo Code should have access to:
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
| **Configuration not loading** | Check file path and JSON syntax |
| **API key rejected** | Use Bearer token format for remote connections |
| **Server not connecting** | Check URL and API key format |
| **Tools not available** | Restart Roo Code and check configuration |
| **Local server fails** | Ensure Node.js 18+ is installed |

### Configuration Issues

1. **API Key Format**:
   - Remote servers: Use `Authorization: Bearer fc-your-api-key-here`
   - Local servers: Use `--api-key fc-your-api-key-here` or environment variables

2. **Server Type**:
   - Remote: `"type": "streamable-http"`
   - Local: Default `"stdio"` type (no type specification needed)

3. **URL Validation**:
   - Remote: Ensure URL is correct and accessible
   - Test URL: `curl -I https://api.firecrawl.dev/mcp`

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
      "type": "streamable-http",
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
3. **Server Type**: Use `"streamable-http"` for remote connections
4. **Latest Version**: Always use latest Firecrawl MCP version for best features
5. **Configuration Validation**: Use JSON linter to validate configuration syntax

## Support

- **Roo Code Documentation**: [Roo Code MCP Docs](https://docs.roocode.com/features/mcp/using-mcp-in-roo)
- **Firecrawl Documentation**: [Firecrawl Docs](https://docs.firecrawl.dev)
- **API Key Issues**: [Firecrawl API Dashboard](https://www.firecrawl.dev/app/api-keys)
- **Roo Code Support**: Check Roo Code's help documentation

## Environment-Specific Notes

- Roo Code uses standard MCP server configuration format
- Supports `"streamable-http"` type for remote connections
- Uses Bearer token authentication for remote connections
- Configuration is managed through Roo Code's MCP configuration file
- Remote connections require accessible Firecrawl MCP endpoint
- Local connections require Node.js 18+ on the user's machine
- Self-hosted instances work with remote server configuration
- Environment variables supported for local server configuration
- Additional headers can be configured for remote connections

---

**Environment Compatibility**: ✅ Verified
**Last Tested**: September 2024
**Firecrawl MCP Version**: Latest
**Roo Code Version**: Latest (with MCP support)