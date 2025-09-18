# JetBrains AI Assistant

## Overview

JetBrains AI Assistant is an AI-powered coding assistant built into JetBrains IDEs that supports MCP (Model Context Protocol) servers, enabling Firecrawl's web scraping capabilities directly within your development environment.

## Prerequisites

- JetBrains IDE (IntelliJ IDEA, PyCharm, WebStorm, etc.) with AI Assistant
- Firecrawl API Key
- Node.js 18+ (for npx)

## Installation

### Quick Install

1. **Get Firecrawl API Key**
   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Configure in IDE**
   - Go to `Settings` → `Tools` → `AI Assistant` → `Model Context Protocol (MCP)`
   - Click `+ Add`
   - Select "As JSON" option and add configuration (see below)

### Step-by-Step

1. **Get Firecrawl API Key**
   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Open IDE Settings**
   - Launch your JetBrains IDE
   - Navigate to `Settings` → `Tools` → `AI Assistant` → `Model Context Protocol (MCP)`

3. **Add MCP Server**
   - Click the `+ Add` button
   - Click on `Command` in the top-left corner of the dialog
   - Select the "As JSON" option from the list

4. **Configure Firecrawl**
   - Add the Firecrawl MCP configuration (see below)
   - Click `OK` to save the configuration
   - Click `Apply` to save changes

## Configuration

See [JetBrains AI Assistant Documentation](https://www.jetbrains.com/help/ai-assistant/configure-an-mcp-server.html) for more details.

### JetBrains AI Assistant Local Server Configuration

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

### JetBrains AI Assistant Configuration with Environment Variables

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

### JetBrains AI Assistant Configuration for Self-Hosted Instance

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp", "--api-key", "your-self-hosted-key"],
      "env": {
        "FIRECRAWL_API_URL": "https://your-firecrawl-instance.com"
      }
    }
  }
}
```

## JetBrains Junie Configuration

JetBrains Junie also supports MCP servers with the same configuration:

1. Go to `Settings` → `Tools` → `Junie` → `MCP Settings`
2. Add the same JSON configuration as above

## Configuration UI Location

**AI Assistant Settings**:
- `Settings` → `Tools` → `AI Assistant` → `Model Context Protocol (MCP)`
- Use the JSON configuration option for maximum flexibility

**Junie Settings**:
- `Settings` → `Tools` → `Junie` → `MCP Settings`
- Same configuration format as AI Assistant

## Verification

### Test Installation

1. **Open JetBrains IDE**
   - Launch your JetBrains IDE with AI Assistant enabled

2. **Check Configuration**
   - Navigate to `Settings` → `Tools` → `AI Assistant` → `Model Context Protocol (MCP)`
   - Verify Firecrawl MCP appears in the configured servers list
   - Status should show as "Connected" or "Active"

3. **Test with AI Assistant**
   - Open the AI Assistant panel (typically on the right side)
   - Try a web scraping request:
     ```
     Can you scrape https://httpbin.org/json and show me the content?
     ```

4. **Check Available Tools**
   JetBrains AI Assistant should have access to:
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
| **Configuration not saving** | Check JSON syntax and IDE permissions |
| **API key rejected** | Verify API key format and validity |
| **Server not connecting** | Check npx and Node.js installation |
| **Tools not available** | Restart IDE and check AI Assistant settings |
| **Command execution fails** | Ensure Node.js 18+ is installed and accessible |

### Configuration Issues

1. **JSON Configuration**:
   - Use the "As JSON" option in the MCP settings
   - Ensure valid JSON syntax with proper commas and quotes
   - The configuration must be a complete JSON object

2. **API Key Format**:
   - Use `--api-key fc-your-api-key-here` in args array
   - Or use environment variables for better security

3. **Command Structure**:
   - Must specify both `command` and `args`
   - `command` should be "npx"
   - `args` should be an array of command-line arguments

4. **IDE Compatibility**:
   - Ensure your JetBrains IDE supports AI Assistant
   - Check that AI Assistant is properly licensed and activated

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
      "command": "npx",
      "args": ["-y", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"],
      "env": {
        "HTTP_PROXY": "http://proxy.company.com:8080",
        "HTTPS_PROXY": "http://proxy.company.com:8080"
      }
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
Go to https://example.com/products and extract all product information into a structured format.
```

### Code Generation

```
Generate a function that uses Firecrawl to scrape and process data from a news website.
```

## Performance Tips

1. **JSON Configuration**: Use the "As JSON" option for complete configuration control
2. **Environment Variables**: Use `env` object for sensitive configuration
3. **Command Structure**: Always include both `command` and `args` properties
4. **Latest Version**: Always use latest Firecrawl MCP version for best features
5. **IDE Restart**: Some configuration changes may require IDE restart

## Supported JetBrains IDEs

- IntelliJ IDEA
- PyCharm
- WebStorm
- PhpStorm
- GoLand
- RubyMine
- CLion
- DataGrip
- Rider
- AppCode

## Support

- **JetBrains AI Assistant Documentation**: [Configure MCP Server](https://www.jetbrains.com/help/ai-assistant/configure-an-mcp-server.html)
- **Firecrawl Documentation**: [Firecrawl Docs](https://docs.firecrawl.dev)
- **API Key Issues**: [Firecrawl API Dashboard](https://www.firecrawl.dev/app/api-keys)
- **JetBrains Support**: [JetBrains Help Center](https://www.jetbrains.com/help/)

## Environment-Specific Notes

- JetBrains IDEs use a GUI-based configuration approach
- Configuration is added through the IDE settings dialog
- JSON configuration option provides maximum flexibility
- Both AI Assistant and Junie support MCP servers
- Local server connections only (npx-based execution)
- Environment variables specified using JSON object format
- Configuration requires IDE restart for some changes
- Works across all JetBrains IDEs with AI Assistant support
- Self-hosted instances supported through environment variables
- No remote server connection support in the GUI configuration

---

**Environment Compatibility**: ✅ Verified
**Last Tested**: September 2024
**Firecrawl MCP Version**: Latest
**JetBrains AI Assistant Version**: Latest (with MCP support)