# LM Studio

## Overview

LM Studio is a desktop application for running local LLMs that supports MCP (Model Context Protocol) servers, enabling Firecrawl's web scraping capabilities to enhance your local AI workflows.

## Prerequisites

- LM Studio installed (v0.3.17 or later)
- Firecrawl API Key
- Node.js 18+ (for npx)

## Installation

### Quick Install - One-click (Recommended)

[![Add MCP Server Firecrawl to LM Studio](https://files.lmstudio.ai/deeplink/mcp-install-light.svg)](https://lmstudio.ai/install-mcp?name=firecrawl&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImZpcmVjcmF3bC1tY3AiXX0%3D)

### Step-by-Step

1. **Get Firecrawl API Key**
   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **One-click Installation**
   - Click the installation badge above
   - LM Studio will open and prompt for configuration
   - Enter your API key when prompted

3. **Manual Setup (Alternative)**
   - Navigate to `Program` (right side) > `Install` > `Edit mcp.json`
   - Paste the configuration (see below)
   - Click `Save` to apply changes

## Configuration

See [LM Studio MCP Support](https://lmstudio.ai/blog/lmstudio-v0.3.17) for more information.

### LM Studio Local Server Configuration

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

### LM Studio Configuration with Environment Variables

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

### LM Studio Configuration for Self-Hosted Instance

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

### LM Studio Advanced Configuration

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
        "FIRECRAWL_RETRY_BACKOFF_FACTOR": "2",
        "FIRECRAWL_CREDIT_WARNING_THRESHOLD": "5000",
        "FIRECRAWL_CREDIT_CRITICAL_THRESHOLD": "1000"
      }
    }
  }
}
```

## Configuration UI Location

**MCP Configuration File**:
- Navigate to `Program` (right side) > `Install` > `Edit mcp.json`
- Configuration is managed through a JSON editor
- Click `Save` to apply changes

**Server Management**:
- Toggle MCP servers on/off from the right-hand side under `Program`
- Or click the plug icon at the bottom of the chat box
- Real-time server status monitoring

## One-click Installation

LM Studio supports one-click MCP server installation using deeplinks:

### Installation Badge
```markdown
[![Add MCP Server Firecrawl to LM Studio](https://files.lmstudio.ai/deeplink/mcp-install-light.svg)](https://lmstudio.ai/install-mcp?name=firecrawl&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImZpcmVjcmF3bC1tY3AiXX0%3D)
```

### Deeplink Structure
The deeplink uses base64-encoded JSON configuration:
- `name`: Server name (firecrawl)
- `config`: Base64-encoded configuration object

## Verification

### Test Installation

1. **Open LM Studio**
   - Launch LM Studio desktop application
   - Ensure you're using v0.3.17 or later

2. **Check Configuration**
   - Navigate to `Program` > `Install` > `Edit mcp.json`
   - Verify Firecrawl MCP appears in the configured servers list
   - Check that the server is toggled on

3. **Test with LM Studio Chat**
   - Open a chat with your preferred local LLM
   - Try a web scraping request:
     ```
     Can you scrape https://httpbin.org/json and show me the content?
     ```

4. **Check Available Tools**
   LM Studio should have access to:
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
| **Configuration not saving** | Check file permissions and JSON syntax |
| **API key rejected** | Verify API key format and validity |
| **Server not connecting** | Check npx and Node.js installation |
| **Tools not available** | Restart LM Studio and check server toggle |
| **Version compatibility** | Ensure LM Studio v0.3.17 or later |

### Configuration Issues

1. **JSON Configuration**:
   - Ensure valid JSON syntax with proper commas and quotes
   - Configuration must include `mcpServers` object
   - Server configuration must have `command` and `args`

2. **LM Studio Version**:
   - MCP support requires LM Studio v0.3.17 or later
   - Check for updates: `Help` > `Check for Updates`
   - Verify MCP features are available in your version

3. **API Key Format**:
   - Use `--api-key fc-your-api-key-here` in args array
   - Or use environment variables for better security

4. **Server Toggle**:
   - Ensure the MCP server is toggled on
   - Check server status in the `Program` panel
   - Look for the plug icon at the bottom of the chat box

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

1. **One-click Install**: Use the installation badge for easiest setup
2. **Server Toggle**: Ensure MCP server is toggled on in the interface
3. **Environment Variables**: Use `env` object for sensitive configuration
4. **Latest Version**: Always use latest Firecrawl MCP version for best features
5. **LM Studio Updates**: Keep LM Studio updated for latest MCP features

## LM Studio-Specific Features

### One-click Installation
- Deeplink-based installation with automatic configuration
- Base64-encoded configuration for secure parameter passing
- Automatic server activation after installation

### Local LLM Integration
- Seamless integration with local language models
- Enhanced AI capabilities with web scraping tools
- Privacy-focused local processing

### User-Friendly Interface
- Visual server management with toggle controls
- Real-time server status monitoring
- Intuitive configuration editing

## Support

- **LM Studio Documentation**: [LM Studio MCP Support](https://lmstudio.ai/blog/lmstudio-v0.3.17)
- **Firecrawl Documentation**: [Firecrawl Docs](https://docs.firecrawl.dev)
- **API Key Issues**: [Firecrawl API Dashboard](https://www.firecrawl.dev/app/api-keys)
- **LM Studio Support**: [LM Studio Help Center](https://lmstudio.ai/help)

## Environment-Specific Notes

- LM Studio requires v0.3.17 or later for MCP support
- One-click installation using deeplinks and base64 encoding
- Configuration managed through `mcp.json` file
- Visual server toggles and status monitoring
- Integration with local LLMs for privacy-focused AI
- Desktop application with user-friendly interface
- Real-time server management capabilities
- Local server connections only (npx-based execution)
- Environment variables supported through JSON object format
- Self-hosted instances supported through environment variables
- Enhanced privacy with local LLM processing

---

**Environment Compatibility**: ✅ Verified
**Last Tested**: September 2024
**Firecrawl MCP Version**: Latest
**LM Studio Version**: v0.3.17 or later (with MCP support)