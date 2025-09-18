# Cline

## Overview

Cline is an AI assistant that supports MCP (Model Context Protocol) servers through a built-in marketplace, making it easy to discover and install Firecrawl MCP for web scraping capabilities.

## Prerequisites

- Cline installed
- Firecrawl API Key
- Node.js 18+ (for local server option)

## Installation

### Quick Install - Marketplace (Recommended)

You can easily install Firecrawl MCP through the [Cline MCP Server Marketplace](https://cline.bot/mcp-marketplace) by following these instructions:

1. Open **Cline**.
2. Click the hamburger menu icon (☰) to enter the **MCP Servers** section.
3. Use the search bar within the **Marketplace** tab to find _Firecrawl_.
4. Click the **Install** button.
5. Enter your Firecrawl API Key when prompted.

### Step-by-Step

#### Method 1: Marketplace Installation (Recommended)

1. **Get Firecrawl API Key**

   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Install via Marketplace**

   - Open Cline
   - Navigate to **MCP Servers** section (☰ menu)
   - Go to **Marketplace** tab
   - Search for "Firecrawl"
   - Click **Install**
   - Enter your API Key when prompted

3. **Verify Installation**
   - Firecrawl MCP should appear in your installed servers list
   - Try a web scraping request to test functionality

#### Method 2: Manual Configuration

1. **Get Firecrawl API Key**

   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Manual Setup**
   - Open **Cline**
   - Click the hamburger menu icon (☰) to enter the **MCP Servers** section
   - Choose **Remote Servers** tab
   - Click the **Edit Configuration** button
   - Add firecrawl to `mcpServers` (see configuration below)

## Configuration

### Remote Server Configuration (Recommended)

```json
{
  "mcpServers": {
    "firecrawl": {
      "url": "https://api.firecrawl.dev/mcp",
      "type": "streamableHttp",
      "headers": {
        "Authorization": "Bearer fc-your-api-key-here"
      }
    }
  }
}
```

### Local Server Configuration

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"],
      "type": "stdio"
    }
  }
}
```

### Self-Hosted Configuration

```json
{
  "mcpServers": {
    "firecrawl": {
      "url": "https://your-firecrawl-instance.com/mcp",
      "type": "streamableHttp",
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
      "url": "https://api.firecrawl.dev/mcp",
      "type": "streamableHttp",
      "headers": {
        "Authorization": "Bearer fc-your-api-key-here",
        "X-Retry-Max-Attempts": "5",
        "X-Credit-Warning-Threshold": "2000",
        "X-Client-ID": "cline"
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
      "type": "stdio",
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

## Verification

### Test Installation

1. **Check Cline Interface**

   - Open Cline
   - Navigate to **MCP Servers** section
   - Verify Firecrawl appears in your servers list
   - Status should show as "Connected" or "Active"

2. **Test with Cline Chat**

   - Start a conversation in Cline
   - Try a web scraping request:
     ```
     Can you scrape https://httpbin.org/json and show me the content?
     ```

3. **Check Available Tools**
   - Cline should have access to Firecrawl tools:
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

| Issue                        | Solution                                       |
| ---------------------------- | ---------------------------------------------- |
| **Not found in marketplace** | Use manual configuration method                |
| **API key rejected**         | Use Bearer token format for remote connections |
| **Server not connecting**    | Check URL and API key format                   |
| **Tools not available**      | Restart Cline and check server status          |
| **Local server fails**       | Ensure Node.js 18+ is installed                |

### Marketplace Issues

1. **Search not working**:

   - Try searching for "firecrawl-mcp" or "firecrawl"
   - Check your internet connection
   - Restart Cline and try again

2. **Installation fails**:
   - Use manual configuration method
   - Check Cline version (latest recommended)
   - Verify your Cline account has marketplace access

### Configuration Issues

1. **API Key Format**:

   - Remote servers: Use `Authorization: Bearer fc-your-api-key-here`
   - Local servers: Use `--api-key fc-your-api-key-here` or environment variables

2. **Server Type**:

   - Remote: `"type": "streamableHttp"`
   - Local: `"type": "stdio"`

3. **URL Validation**:
   - Remote: Ensure URL is correct and accessible
   - Test URL: `curl -I https://api.firecrawl.dev/mcp`

### Debug Mode

Enable debug logging:

```bash
# Set debug environment variable
export DEBUG=firecrawl-mcp:*

# Then start Cline or test local server
npx -y firecrawl-mcp --api-key fc-your-api-key-here
```

## Advanced Configuration

### Custom Retry Settings

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"],
      "type": "stdio",
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
      "type": "streamableHttp",
      "headers": {
        "Authorization": "Bearer fc-your-api-key-here",
        "X-Proxy-URL": "http://proxy.company.com:8080"
      }
    }
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
Go to https://example.com/products and extract all product names and prices into a structured format.
```

### Code Generation

```
Generate a Python script that uses Firecrawl to scrape and process data from a news website.
```

## Performance Tips

1. **Marketplace vs Manual**: Use marketplace for easier setup, manual for more control
2. **Remote vs Local**: Remote is easier, local gives more control and debugging
3. **API Key Format**: Use Bearer token for remote, command-line args for local
4. **Server Type**: Use `"streamableHttp"` for remote, `"stdio"` for local
5. **Latest Version**: Always use latest Firecrawl MCP version for best features

## Support

- **Cline Documentation**: [Cline Bot](https://cline.bot)
- **Cline MCP Marketplace**: [MCP Marketplace](https://cline.bot/mcp-marketplace)
- **Firecrawl Documentation**: [Firecrawl Docs](https://docs.firecrawl.dev)
- **API Key Issues**: [Firecrawl API Dashboard](https://www.firecrawl.dev/app/api-keys)
- **Cline Support**: Check Cline's help documentation

## Environment-Specific Notes

- Cline has a built-in MCP marketplace for easy installation
- Supports both `"streamableHttp"` (remote) and `"stdio"` (local) server types
- Uses Bearer token authentication for remote connections
- Marketplace installation is recommended for most users
- Manual configuration provides more control over settings
- Remote connections require accessible Firecrawl MCP endpoint
- Local connections require Node.js 18+ on the user's machine
- Configuration is managed through Cline's MCP Servers interface

---

**Environment Compatibility**: ✅ Verified
**Last Tested**: September 2024
**Firecrawl MCP Version**: Latest
**Cline Version**: Latest (with MCP marketplace support)
