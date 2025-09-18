# Gemini CLI

## Overview

Gemini CLI is Google's command-line interface for interacting with Gemini models, supporting MCP (Model Context Protocol) servers to enable Firecrawl's web scraping capabilities directly in your terminal.

## Prerequisites

- Gemini CLI installed
- Firecrawl API Key
- Node.js 18+ (for local server option)

## Installation

### Quick Install

1. **Get Firecrawl API Key**
   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Edit Settings File**
   - Open `~/.gemini/settings.json`
   - Add Firecrawl MCP configuration (see below)

### Step-by-Step

1. **Get Firecrawl API Key**
   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Locate Settings File**
   - Gemini CLI settings file is located at `~/.gemini/settings.json`
   - Create the file if it doesn't exist

3. **Add Configuration**
   - Add the `mcpServers` object to your settings.json
   - Choose between remote or local server connection

## Configuration

See [Gemini CLI Configuration](https://google-gemini.github.io/gemini-cli/docs/tools/mcp-server.html) for details.

### Gemini CLI Remote Server Connection (Recommended)

```json
{
  "mcpServers": {
    "firecrawl": {
      "httpUrl": "https://api.firecrawl.dev/mcp",
      "headers": {
        "FIRECRAWL_API_KEY": "fc-your-api-key-here",
        "Accept": "application/json, text/event-stream"
      }
    }
  }
}
```

### Gemini CLI Local Server Connection

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
      "httpUrl": "https://your-firecrawl-instance.com/mcp",
      "headers": {
        "FIRECRAWL_API_KEY": "your-self-hosted-key",
        "Accept": "application/json, text/event-stream"
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
      "httpUrl": "https://api.firecrawl.dev/mcp",
      "headers": {
        "FIRECRAWL_API_KEY": "fc-your-api-key-here",
        "Accept": "application/json, text/event-stream",
        "X-Retry-Max-Attempts": "5",
        "X-Credit-Warning-Threshold": "2000",
        "X-Client-ID": "gemini-cli"
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

**Settings File**: `~/.gemini/settings.json`
- Located in your home directory
- Create the file if it doesn't exist
- The `mcpServers` object should be at the root level

**Complete Settings File Example**:

```json
{
  "mcpServers": {
    "firecrawl": {
      "httpUrl": "https://api.firecrawl.dev/mcp",
      "headers": {
        "FIRECRAWL_API_KEY": "fc-your-api-key-here",
        "Accept": "application/json, text/event-stream"
      }
    }
  }
}
```

## Verification

### Test Installation

1. **Open Terminal**
   - Launch your terminal application

2. **Check Configuration**
   - Verify your `~/.gemini/settings.json` file is correctly configured
   - Ensure JSON syntax is valid

3. **Test with Gemini CLI**
   - Run Gemini CLI with a web scraping request:
     ```
     gemini "Can you scrape https://httpbin.org/json and show me the content?"
     ```

4. **Check Available Tools**
   Gemini CLI should have access to:
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
| **API key rejected** | Verify FIRECRAWL_API_KEY header format |
| **Server not connecting** | Check URL and API key format |
| **Tools not available** | Restart Gemini CLI and check configuration |
| **Local server fails** | Ensure Node.js 18+ is installed |

### Configuration Issues

1. **Settings File Location**:
   - Must be at `~/.gemini/settings.json`
   - Create the file and directory if it doesn't exist
   - Ensure proper file permissions

2. **API Key Format**:
   - Remote servers: Use `FIRECRAWL_API_KEY` in headers
   - Local servers: Use `--api-key fc-your-api-key-here` or environment variables

3. **Server Configuration**:
   - Remote: Use `"httpUrl"` and `"headers"`
   - Local: Use `"command"` and `"args"`

4. **JSON Syntax**:
   - Validate JSON syntax using a linter
   - Ensure proper commas, quotes, and brackets

### Debug Mode

Enable debug logging:

```bash
# Set debug environment variable
export DEBUG=firecrawl-mcp:*

# Test local server manually
npx -y firecrawl-mcp --api-key fc-your-api-key-here

# Test remote connection
curl -H "FIRECRAWL_API_KEY: fc-your-api-key-here" -H "Accept: application/json, text/event-stream" https://api.firecrawl.dev/mcp
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
      "httpUrl": "https://api.firecrawl.dev/mcp",
      "headers": {
        "FIRECRAWL_API_KEY": "fc-your-api-key-here",
        "Accept": "application/json, text/event-stream",
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
gemini "Can you scrape the main content from https://example.com and give me a summary?"
```

### Research and Analysis

```
gemini "Search for recent AI research papers, extract the titles and publication dates, and identify the main trends."
```

### Data Extraction

```
gemini "Go to https://example.com/products and extract all product information into a structured format."
```

### Code Generation

```
gemini "Generate a function that uses Firecrawl to scrape and process data from a news website."
```

## Performance Tips

1. **Remote vs Local**: Remote is easier, local gives more control and debugging
2. **API Key Format**: Use `FIRECRAWL_API_KEY` header for remote, command-line args for local
3. **Settings File**: Always keep `~/.gemini/settings.json` properly formatted
4. **Latest Version**: Always use latest Firecrawl MCP version for best features
5. **Accept Header**: Include `Accept: application/json, text/event-stream` for optimal streaming

## Support

- **Gemini CLI Documentation**: [Gemini CLI MCP Configuration](https://google-gemini.github.io/gemini-cli/docs/tools/mcp-server.html)
- **Firecrawl Documentation**: [Firecrawl Docs](https://docs.firecrawl.dev)
- **API Key Issues**: [Firecrawl API Dashboard](https://www.firecrawl.dev/app/api-keys)
- **Gemini CLI Support**: Check Gemini CLI's GitHub repository

## Environment-Specific Notes

- Gemini CLI uses a specific configuration format with `"httpUrl"` for remote connections
- Settings file must be located at `~/.gemini/settings.json`
- Remote connections use custom headers with `FIRECRAWL_API_KEY`
- Local connections use standard `"command"` and `"args"` format
- The `Accept` header is required for proper streaming support
- Configuration is managed through a simple JSON settings file
- Remote connections require accessible Firecrawl MCP endpoint
- Local connections require Node.js 18+ on the user's machine
- Self-hosted instances work with remote server configuration
- Environment variables supported for local server configuration

---

**Environment Compatibility**: ✅ Verified
**Last Tested**: September 2024
**Firecrawl MCP Version**: Latest
**Gemini CLI Version**: Latest (with MCP support)