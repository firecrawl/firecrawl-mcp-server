# Augment Code

## Overview

Augment Code is an AI-powered coding assistant that supports MCP (Model Context Protocol) servers, enabling Firecrawl's web scraping capabilities directly within your coding environment.

## Prerequisites

- Augment Code installed
- Firecrawl API Key
- Node.js 18+ (for local server option)

## Installation

### Quick Install - Marketplace

1. **Get Firecrawl API Key**
   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Install via Augment's Marketplace**
   - Open Augment Code
   - Navigate to Extensions/Marketplace
   - Search for "Firecrawl" or "firecrawl-mcp"
   - Click **Install** and enter your API key when prompted

### Step-by-Step

#### Method 1: Marketplace Installation (Recommended)

1. **Get Firecrawl API Key**
   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Install via Augment's Marketplace**
   - Open Augment Code
   - Access the Extensions/Marketplace section
   - Search for "Firecrawl MCP"
   - Click **Install**
   - Enter your API key when prompted

3. **Verify Installation**
   - Firecrawl MCP should appear in your installed extensions
   - Try a web scraping request to test functionality

#### Method 2: Manual Configuration

1. **Get Firecrawl API Key**
   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Manual Setup**
   - Open Augment Code
   - Navigate to Settings/Configuration
   - Add Firecrawl MCP configuration (see below)

## Configuration

### Remote Server Configuration (Recommended)

```json
{
  "mcpServers": {
    "firecrawl": {
      "url": "https://api.firecrawl.dev/mcp",
      "type": "http",
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
      "type": "http",
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
      "type": "http",
      "headers": {
        "Authorization": "Bearer fc-your-api-key-here",
        "X-Retry-Max-Attempts": "5",
        "X-Credit-Warning-Threshold": "2000",
        "X-Client-ID": "augment-code"
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

## Configuration File Location

**Global Settings**:
- Check Augment Code documentation for your operating system
- Typically located in user home directory or application support folder

**Project-Specific Settings**:
- Create configuration file in your project root (e.g., `.augment/config.json`)

## Verification

### Test Installation

1. **Open Augment Code**
   - Launch Augment Code

2. **Check MCP Status**
   - Navigate to Settings/Extensions
   - Verify Firecrawl MCP appears as installed/active
   - Status should show as "Connected" or "Active"

3. **Test with Augment AI**
   - Open the AI chat interface
   - Try a web scraping request:
     ```
     Can you scrape https://httpbin.org/json and show me the content?
     ```

4. **Check Available Tools**
   Augment Code should have access to:
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
| **Not found in marketplace** | Use manual configuration method |
| **API key rejected** | Use Bearer token format for remote connections |
| **Server not connecting** | Check URL and API key format |
| **Tools not available** | Restart Augment Code and check extension status |
| **Local server fails** | Ensure Node.js 18+ is installed |

### Marketplace Issues

1. **Search not working**:
   - Try searching for "firecrawl-mcp" or "firecrawl"
   - Check your internet connection
   - Restart Augment Code and try again

2. **Installation fails**:
   - Use manual configuration method
   - Check Augment Code version (latest recommended)
   - Verify your account has marketplace access

### Configuration Issues

1. **API Key Format**:
   - Remote servers: Use `Authorization: Bearer fc-your-api-key-here`
   - Local servers: Use `--api-key fc-your-api-key-here` or environment variables

2. **Server Type**:
   - Remote: `"type": "http"`
   - Local: `"type": "stdio"`

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
      "type": "http",
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

1. **Marketplace vs Manual**: Use marketplace for easier setup, manual for more control
2. **Remote vs Local**: Remote is easier, local gives more control and debugging
3. **API Key Format**: Use Bearer token for remote, command-line args for local
4. **Server Type**: Use `"http"` for remote, `"stdio"` for local
5. **Latest Version**: Always use latest Firecrawl MCP version for best features

## Support

- **Augment Code Documentation**: Check Augment Code's official documentation
- **Augment Code Marketplace**: Built-in marketplace for extensions
- **Firecrawl Documentation**: [Firecrawl Docs](https://docs.firecrawl.dev)
- **API Key Issues**: [Firecrawl API Dashboard](https://www.firecrawl.dev/app/api-keys)
- **Augment Code Support**: Check Augment Code's help documentation

## Environment-Specific Notes

- Augment Code uses standard MCP server configuration format
- Supports both `"http"` (remote) and `"stdio"` (local) server types
- Uses Bearer token authentication for remote connections
- Marketplace installation is recommended for most users
- Manual configuration provides more control over settings
- Remote connections require accessible Firecrawl MCP endpoint
- Local connections require Node.js 18+ on the user's machine
- Configuration is managed through Augment Code's settings interface
- Self-hosted instances work with both connection types
- Enterprise deployments can use remote server configuration

---

**Environment Compatibility**: ✅ Verified
**Last Tested**: September 2024
**Firecrawl MCP Version**: Latest
**Augment Code Version**: Latest (with MCP support)