# Opencode

## Overview

Opencode is an AI-powered development environment that supports MCP (Model Context Protocol) servers, enabling Firecrawl's web scraping capabilities directly within your coding workflow.

## Prerequisites

- Opencode installed
- Firecrawl API Key
- Node.js 18+ (for local server option)

## Installation

### Quick Install

1. **Get Firecrawl API Key**

   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Edit Configuration**
   - Open Opencode configuration file
   - Add Firecrawl MCP configuration (see below)

### Step-by-Step

1. **Get Firecrawl API Key**

   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Locate Configuration File**

   - Find Opencode's MCP configuration file
   - See Opencode documentation for exact location

3. **Add Configuration**
   - Add Firecrawl MCP to your `mcp` configuration
   - Choose between remote or local server connection

## Configuration

Add this to your Opencode configuration file. See [Opencode MCP docs](https://opencode.ai/docs/mcp-servers) for more info.

### Opencode Remote Server Connection (Recommended)

```json
{
  "mcp": {
    "firecrawl": {
      "type": "remote",
      "url": "https://api.firecrawl.dev/mcp",
      "headers": {
        "FIRECRAWL_API_KEY": "fc-your-api-key-here"
      },
      "enabled": true
    }
  }
}
```

### Opencode Local Server Connection

```json
{
  "mcp": {
    "firecrawl": {
      "type": "local",
      "command": [
        "npx",
        "-y",
        "firecrawl-mcp",
        "--api-key",
        "fc-your-api-key-here"
      ],
      "enabled": true
    }
  }
}
```

### Self-Hosted Configuration

```json
{
  "mcp": {
    "firecrawl": {
      "type": "remote",
      "url": "https://your-firecrawl-instance.com/mcp",
      "headers": {
        "FIRECRAWL_API_KEY": "your-self-hosted-key"
      },
      "enabled": true
    }
  }
}
```

### Advanced Configuration

#### Remote Server with Additional Headers

```json
{
  "mcp": {
    "firecrawl": {
      "type": "remote",
      "url": "https://api.firecrawl.dev/mcp",
      "headers": {
        "FIRECRAWL_API_KEY": "fc-your-api-key-here",
        "X-Retry-Max-Attempts": "5",
        "X-Credit-Warning-Threshold": "2000",
        "X-Client-ID": "opencode"
      },
      "enabled": true
    }
  }
}
```

#### Local Server with Environment Variables

```json
{
  "mcp": {
    "firecrawl": {
      "type": "local",
      "command": ["npx", "-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "fc-your-api-key-here",
        "FIRECRAWL_RETRY_MAX_ATTEMPTS": "5",
        "FIRECRAWL_RETRY_INITIAL_DELAY": "2000",
        "FIRECRAWL_RETRY_MAX_DELAY": "30000",
        "FIRECRAWL_CREDIT_WARNING_THRESHOLD": "2000",
        "FIRECRAWL_CREDIT_CRITICAL_THRESHOLD": "500"
      },
      "enabled": true
    }
  }
}
```

## Configuration File Location

**Global Settings**:

- Check Opencode documentation for your operating system
- Typically located in user settings directory or application support folder

**Project-Specific Settings**:

- Create configuration file in your project root

**Complete Configuration Example**:

```json
{
  "mcp": {
    "firecrawl": {
      "type": "remote",
      "url": "https://api.firecrawl.dev/mcp",
      "headers": {
        "FIRECRAWL_API_KEY": "fc-your-api-key-here"
      },
      "enabled": true
    }
  }
}
```

## Verification

### Test Installation

1. **Open Opencode**

   - Launch Opencode development environment

2. **Check Configuration**

   - Navigate to Settings/MCP configuration
   - Verify Firecrawl MCP appears as configured and enabled
   - Status should show as "Connected" or "Active"

3. **Test with Opencode AI**

   - Open the AI chat interface
   - Try a web scraping request:
     ```
     Can you scrape https://httpbin.org/json and show me the content?
     ```

4. **Check Available Tools**
   Opencode should have access to:
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

| Issue                         | Solution                                 |
| ----------------------------- | ---------------------------------------- |
| **Configuration not loading** | Check file path and JSON syntax          |
| **API key rejected**          | Verify FIRECRAWL_API_KEY header format   |
| **Server not connecting**     | Check URL and API key format             |
| **Tools not available**       | Restart Opencode and check configuration |
| **Local server fails**        | Ensure Node.js 18+ is installed          |

### Configuration Issues

1. **Configuration Structure**:

   - Must have `"mcp"` root object
   - Server configuration must include `"enabled": true`
   - Remote servers use `"type": "remote"`
   - Local servers use `"type": "local"`

2. **API Key Format**:

   - Remote servers: Use `FIRECRAWL_API_KEY` in headers
   - Local servers: Use `--api-key fc-your-api-key-here` or environment variables

3. **Command Format**:

   - Local commands must be an array: `["npx", "-y", "firecrawl-mcp", "..."]`
   - Ensure proper escaping of quotes and spaces

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
curl -H "FIRECRAWL_API_KEY: fc-your-api-key-here" https://api.firecrawl.dev/mcp
```

## Advanced Configuration

### Custom Retry Settings

```json
{
  "mcp": {
    "firecrawl": {
      "type": "local",
      "command": [
        "npx",
        "-y",
        "firecrawl-mcp",
        "--api-key",
        "fc-your-api-key-here"
      ],
      "env": {
        "FIRECRAWL_RETRY_MAX_ATTEMPTS": "10",
        "FIRECRAWL_RETRY_INITIAL_DELAY": "500",
        "FIRECRAWL_RETRY_MAX_DELAY": "60000",
        "FIRECRAWL_RETRY_BACKOFF_FACTOR": "2"
      },
      "enabled": true
    }
  }
}
```

### Proxy Configuration

```json
{
  "mcp": {
    "firecrawl": {
      "type": "remote",
      "url": "https://api.firecrawl.dev/mcp",
      "headers": {
        "FIRECRAWL_API_KEY": "fc-your-api-key-here",
        "X-Proxy-URL": "http://proxy.company.com:8080"
      },
      "enabled": true
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
2. **API Key Format**: Use `FIRECRAWL_API_KEY` header for remote, command-line args for local
3. **Enabled Flag**: Always include `"enabled": true` in your configuration
4. **Command Array**: Local commands must be specified as an array
5. **Latest Version**: Always use latest Firecrawl MCP version for best features

## Support

- **Opencode Documentation**: [Opencode MCP Servers](https://opencode.ai/docs/mcp-servers)
- **Firecrawl Documentation**: [Firecrawl Docs](https://docs.firecrawl.dev)
- **API Key Issues**: [Firecrawl API Dashboard](https://www.firecrawl.dev/app/api-keys)
- **Opencode Support**: Check Opencode's help documentation

## Environment-Specific Notes

- Opencode uses a specific configuration format with `"mcp"` root object
- Remote connections use `"type": "remote"` with custom headers
- Local connections use `"type": "local"` with command array
- The `"enabled": true` flag is required for activation
- Configuration supports both global and project-specific settings
- Remote connections require accessible Firecrawl MCP endpoint
- Local connections require Node.js 18+ on the user's machine
- Self-hosted instances work with remote server configuration
- Environment variables supported for local server configuration
- Command must be specified as an array for local connections

---

**Environment Compatibility**: ✅ Verified
**Last Tested**: September 2024
**Firecrawl MCP Version**: Latest
**Opencode Version**: Latest (with MCP support)
