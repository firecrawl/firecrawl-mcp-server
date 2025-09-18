# Warp

## Overview

Warp is a modern, AI-powered terminal that supports MCP (Model Context Protocol) servers, enabling Firecrawl's web scraping capabilities directly within your terminal workflow.

## Prerequisites

- Warp terminal installed
- Firecrawl API Key
- Node.js 18+ (for npx)

## Installation

### Quick Install

1. **Get Firecrawl API Key**
   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Configure in Warp**
   - Navigate `Settings` > `AI` > `Manage MCP servers`
   - Click `+ Add` button and paste configuration (see below)

### Step-by-Step

1. **Get Firecrawl API Key**
   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Open Warp Settings**
   - Launch Warp terminal
   - Navigate to `Settings` > `AI` > `Manage MCP servers`

3. **Add MCP Server**
   - Click the `+ Add` button
   - A new server configuration dialog will appear

4. **Configure Firecrawl**
   - Paste the Firecrawl MCP configuration (see below)
   - Click `Save` to apply the changes

## Configuration

See [Warp Model Context Protocol Documentation](https://docs.warp.dev/knowledge-and-collaboration/mcp#adding-an-mcp-server) for details.

### Warp Local Server Configuration

```json
{
  "firecrawl": {
    "command": "npx",
    "args": ["-y", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"],
    "env": {},
    "working_directory": null,
    "start_on_launch": true
  }
}
```

### Warp Configuration with Environment Variables

```json
{
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
    "working_directory": null,
    "start_on_launch": true
  }
}
```

### Warp Configuration for Self-Hosted Instance

```json
{
  "firecrawl": {
    "command": "npx",
    "args": ["-y", "firecrawl-mcp", "--api-key", "your-self-hosted-key"],
    "env": {
      "FIRECRAWL_API_URL": "https://your-firecrawl-instance.com"
    },
    "working_directory": null,
    "start_on_launch": true
  }
}
```

### Warp Configuration with Custom Working Directory

```json
{
  "firecrawl": {
    "command": "npx",
    "args": ["-y", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"],
    "env": {},
    "working_directory": "/path/to/your/project",
    "start_on_launch": false
  }
}
```

## Configuration UI Location

**MCP Servers Settings**:
- Navigate to `Settings` > `AI` > `Manage MCP servers`
- Use the `+ Add` button to add new servers
- Configuration is managed through a JSON editor
- Click `Save` to apply changes
- Toggle `start_on_launch` for automatic server startup

## Verification

### Test Installation

1. **Open Warp**
   - Launch Warp terminal

2. **Check Configuration**
   - Navigate to `Settings` > `AI` > `Manage MCP servers`
   - Verify Firecrawl MCP appears in the configured servers list
   - Status should show as "Connected" or "Active"

3. **Test with Warp AI**
   - Use Warp's AI features in the terminal
   - Try a web scraping request:
     ```
     Can you scrape https://httpbin.org/json and show me the content?
     ```

4. **Check Available Tools**
   Warp should have access to:
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
| **Configuration not saving** | Check JSON syntax and Warp permissions |
| **API key rejected** | Verify API key format and validity |
| **Server not connecting** | Check npx and Node.js installation |
| **Tools not available** | Restart Warp and check MCP servers settings |
| **Command execution fails** | Ensure Node.js 18+ is installed and accessible |

### Configuration Issues

1. **JSON Configuration**:
   - Ensure valid JSON syntax with proper commas and quotes
   - Configuration must include `command` and `args` properties
   - Required fields: `env`, `working_directory`, `start_on_launch`

2. **API Key Format**:
   - Use `--api-key fc-your-api-key-here` in args array
   - Or use environment variables for better security

3. **Command Structure**:
   - Must specify both `command` and `args`
   - `command` should be "npx"
   - `args` should be an array of command-line arguments

4. **Warp-Specific Fields**:
   - `env`: Object for environment variables (can be empty `{}`)
   - `working_directory`: Null or path string for server execution
   - `start_on_launch`: Boolean for automatic server startup

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
  "firecrawl": {
    "command": "npx",
    "args": ["-y", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"],
    "env": {
      "FIRECRAWL_RETRY_MAX_ATTEMPTS": "10",
      "FIRECRAWL_RETRY_INITIAL_DELAY": "500",
      "FIRECRAWL_RETRY_MAX_DELAY": "60000",
      "FIRECRAWL_RETRY_BACKOFF_FACTOR": "2"
    },
    "working_directory": null,
    "start_on_launch": true
  }
}
```

### Proxy Configuration

```json
{
  "firecrawl": {
    "command": "npx",
    "args": ["-y", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"],
    "env": {
      "HTTP_PROXY": "http://proxy.company.com:8080",
      "HTTPS_PROXY": "http://proxy.company.com:8080"
    },
    "working_directory": null,
    "start_on_launch": true
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

### Project-Specific Configuration

```json
{
  "firecrawl": {
    "command": "npx",
    "args": ["-y", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"],
    "env": {},
    "working_directory": "/Users/username/projects/my-project",
    "start_on_launch": false
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

1. **Start on Launch**: Set `start_on_launch: true` for immediate availability
2. **Environment Variables**: Use `env` object for sensitive configuration
3. **Working Directory**: Set specific working directory for project-specific contexts
4. **Latest Version**: Always use latest Firecrawl MCP version for best features
5. **Warp Restart**: Some configuration changes may require Warp restart

## Warp-Specific Features

### AI-Powered Terminal
- Leverage Warp's AI capabilities with Firecrawl tools
- Natural language commands for web scraping
- Intelligent command suggestions and completions

### Modern Terminal Experience
- Blazing fast terminal with GPU acceleration
- Built-in AI assistant and command prediction
- Seamless integration with development workflows

### Collaboration Features
- Share terminal sessions and AI interactions
- Collaborative web scraping and data extraction
- Team-based development workflows

## Support

- **Warp Documentation**: [Warp MCP Documentation](https://docs.warp.dev/knowledge-and-collaboration/mcp#adding-an-mcp-server)
- **Firecrawl Documentation**: [Firecrawl Docs](https://docs.firecrawl.dev)
- **API Key Issues**: [Firecrawl API Dashboard](https://www.firecrawl.dev/app/api-keys)
- **Warp Support**: [Warp Help Center](https://docs.warp.dev)

## Environment-Specific Notes

- Warp uses a modern, GPU-accelerated terminal interface
- Configuration managed through `Settings` > `AI` > `Manage MCP servers`
- JSON configuration with Warp-specific fields
- Required fields: `env`, `working_directory`, `start_on_launch`
- Local server connections only (npx-based execution)
- Environment variables supported through JSON object format
- Automatic server startup with `start_on_launch: true`
- Project-specific working directory configuration
- AI-powered terminal with natural language processing
- Built-in collaboration and sharing features
- Modern terminal experience with GPU acceleration
- Self-hosted instances supported through environment variables
- Integration with Warp's AI assistant capabilities

---

**Environment Compatibility**: ✅ Verified
**Last Tested**: September 2024
**Firecrawl MCP Version**: Latest
**Warp Version**: Latest (with MCP support)