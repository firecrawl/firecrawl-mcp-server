# Kiro

## Overview

Kiro is an AI-powered development environment that supports MCP (Model Context Protocol) servers, enabling Firecrawl's web scraping capabilities directly within your coding workflow.

## Prerequisites

- Kiro installed
- Firecrawl API Key
- Node.js 18+ (for npx)

## Installation

### Quick Install

1. **Get Firecrawl API Key**
   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Configure in Kiro**
   - Navigate to `Kiro` > `MCP Servers`
   - Click `+ Add` button and paste configuration (see below)

### Step-by-Step

1. **Get Firecrawl API Key**
   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Open Kiro MCP Settings**
   - Launch Kiro
   - Navigate to `Kiro` > `MCP Servers`

3. **Add MCP Server**
   - Click the `+ Add` button
   - A new server configuration dialog will appear

4. **Configure Firecrawl**
   - Paste the Firecrawl MCP configuration (see below)
   - Click `Save` to apply the changes

## Configuration

See [Kiro Model Context Protocol Documentation](https://kiro.dev/docs/mcp/configuration/) for details.

### Kiro Local Server Configuration

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"],
      "env": {},
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

### Kiro Configuration with Environment Variables

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
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

### Kiro Configuration for Self-Hosted Instance

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp", "--api-key", "your-self-hosted-key"],
      "env": {
        "FIRECRAWL_API_URL": "https://your-firecrawl-instance.com"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

### Kiro Configuration with Auto-Approval

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"],
      "env": {},
      "disabled": false,
      "autoApprove": ["firecrawl_scrape", "firecrawl_search", "firecrawl_map"]
    }
  }
}
```

## Configuration UI Location

**MCP Servers Settings**:
- Navigate to `Kiro` > `MCP Servers`
- Use the `+ Add` button to add new servers
- Configuration is managed through a JSON editor
- Click `Save` to apply changes

## Verification

### Test Installation

1. **Open Kiro**
   - Launch Kiro development environment

2. **Check Configuration**
   - Navigate to `Kiro` > `MCP Servers`
   - Verify Firecrawl MCP appears in the configured servers list
   - Status should show as "Connected" or "Active"

3. **Test with Kiro AI**
   - Open the AI chat interface
   - Try a web scraping request:
     ```
     Can you scrape https://httpbin.org/json and show me the content?
     ```

4. **Check Available Tools**
   Kiro should have access to:
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
| **Configuration not saving** | Check JSON syntax and Kiro permissions |
| **API key rejected** | Verify API key format and validity |
| **Server not connecting** | Check npx and Node.js installation |
| **Tools not available** | Restart Kiro and check MCP servers settings |
| **Command execution fails** | Ensure Node.js 18+ is installed and accessible |

### Configuration Issues

1. **JSON Configuration**:
   - Ensure valid JSON syntax with proper commas and quotes
   - The configuration must include `disabled: false`
   - The `autoApprove` array should contain tool names for auto-approval

2. **API Key Format**:
   - Use `--api-key fc-your-api-key-here` in args array
   - Or use environment variables for better security

3. **Command Structure**:
   - Must specify both `command` and `args`
   - `command` should be "npx"
   - `args` should be an array of command-line arguments

4. **Required Fields**:
   - `disabled`: false (to enable the server)
   - `autoApprove`: [] (empty array or list of tools to auto-approve)
   - `env`: {} (object for environment variables)

### Debug Mode

Enable debug logging:

```bash
# Set debug environment variable
export DEBUG=firecrawl-mcp:*

# Test local server manually
npx -y firecrawl-mcp --api-key fc-your-api-key-here

# Test with environment variables
env FIRECRAWL_API_KEY=fc-your-api-key-here npx -y firecrawl-mcp
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
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

### Proxy Configuration

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"],
      "env": {
        "HTTP_PROXY": "http://proxy.company.com:8080",
        "HTTPS_PROXY": "http://proxy.company.com:8080"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

### Credit Monitoring

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"],
      "env": {
        "FIRECRAWL_CREDIT_WARNING_THRESHOLD": "5000",
        "FIRECRAWL_CREDIT_CRITICAL_THRESHOLD": "1000"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

### Auto-Approval Configuration

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"],
      "env": {},
      "disabled": false,
      "autoApprove": [
        "firecrawl_scrape",
        "firecrawl_search",
        "firecrawl_map",
        "firecrawl_extract"
      ]
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
Go to https://example.com/products and extract all product information into a structured format.
```

### Code Generation

```
Generate a function that uses Firecrawl to scrape and process data from a news website.
```

## Performance Tips

1. **Auto-Approval**: Use `autoApprove` array to streamline common operations
2. **Environment Variables**: Use `env` object for sensitive configuration
3. **Required Fields**: Always include `disabled: false` and `autoApprove: []`
4. **Latest Version**: Always use latest Firecrawl MCP version for best features
5. **Kiro Restart**: Some configuration changes may require Kiro restart

## Support

- **Kiro Documentation**: [Kiro MCP Configuration](https://kiro.dev/docs/mcp/configuration/)
- **Firecrawl Documentation**: [Firecrawl Docs](https://docs.firecrawl.dev)
- **API Key Issues**: [Firecrawl API Dashboard](https://www.firecrawl.dev/app/api-keys)
- **Kiro Support**: Check Kiro's official documentation

## Environment-Specific Notes

- Kiro uses a GUI-based configuration approach
- Configuration is managed through `Kiro` > `MCP Servers` menu
- JSON configuration with specific required fields: `disabled` and `autoApprove`
- Local server connections only (npx-based execution)
- Environment variables specified through JSON object format
- Auto-approval feature for streamlined tool usage
- Configuration requires Kiro restart for some changes
- Self-hosted instances supported through environment variables
- No remote server connection support in the current implementation
- The `disabled: false` field is required to enable the server
- The `autoApprove` array can contain tool names for automatic approval

---

**Environment Compatibility**: ✅ Verified
**Last Tested**: September 2024
**Firecrawl MCP Version**: Latest
**Kiro Version**: Latest (with MCP support)