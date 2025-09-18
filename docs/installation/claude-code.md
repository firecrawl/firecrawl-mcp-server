# Claude Code

## Overview

Claude Code is Anthropic's official command-line interface for Claude that supports MCP (Model Context Protocol) servers. Firecrawl MCP integrates with Claude Code to provide web scraping capabilities directly in your terminal.

## Prerequisites

- Claude Code installed
- Firecrawl API Key
- Node.js 18+ (for npx)
- npm

## Installation

### Quick Install

```bash
# Get your API key first
# Visit: https://www.firecrawl.dev/app/api-keys
```

### Step-by-Step

#### Method 1: Local Server Connection (Recommended)

1. **Get Firecrawl API Key**
   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Add MCP Server**
   ```bash
   claude mcp add firecrawl -- npx -y firecrawl-mcp --api-key fc-your-api-key-here
   ```

#### Method 2: Remote Server Connection

1. **Get Firecrawl API Key**
   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Add MCP Server**
   ```bash
   claude mcp add --transport http firecrawl https://your-firecrawl-endpoint.com/mcp --header "FIRECRAWL_API_KEY: fc-your-api-key-here"
   ```

   *Note: For remote connections, you'll need to host Firecrawl MCP server separately.*

## Configuration

### Local Server Configuration

```bash
# Add the server
claude mcp add firecrawl -- npx -y firecrawl-mcp --api-key fc-your-api-key-here

# Verify the server was added
claude mcp list
```

### Remote Server Configuration

```bash
# Add remote server
claude mcp add --transport http firecrawl https://your-firecrawl-endpoint.com/mcp --header "FIRECRAWL_API_KEY: fc-your-api-key-here"

# Verify the server was added
claude mcp list
```

### Advanced Configuration

For advanced configuration options, you can pass additional environment variables:

```bash
claude mcp add firecrawl -- npx -y firecrawl-mcp --api-key fc-your-api-key-here --env FIRECRAWL_RETRY_MAX_ATTEMPTS=5 --env FIRECRAWL_CREDIT_WARNING_THRESHOLD=2000
```

### Self-Hosted Configuration

If you're using a self-hosted Firecrawl instance:

```bash
claude mcp add firecrawl -- npx -y firecrawl-mcp --api-key your-self-hosted-key --env FIRECRAWL_API_URL=https://your-firecrawl-instance.com
```

## Verification

### Test Installation

1. **List MCP Servers**
   ```bash
   claude mcp list
   ```

2. **Check Server Status**
   ```bash
   claude mcp status firecrawl
   ```

3. **Test with Claude Code**
   ```bash
   claude "Can you scrape https://httpbin.org/json and show me the content?"
   ```

### Expected Output

```
$ claude mcp list
Available MCP servers:
- firecrawl (local)

$ claude mcp status firecrawl
Server firecrawl is running and healthy.

$ claude "Scrape https://httpbin.org/json"
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
| **Server not added** | Check Claude Code installation and permissions |
| **API key errors** | Verify API key format and validity |
| **Connection issues** | Check internet connection and firewall settings |
| **npx not found** | Ensure Node.js and npm are properly installed |

### Claude Code Issues

1. **Check Claude Code installation**:
```bash
claude --version
```

2. **Verify MCP functionality**:
```bash
claude mcp --help
```

3. **Check server status**:
```bash
claude mcp status firecrawl
```

### Server Management

```bash
# Remove server
claude mcp remove firecrawl

# Re-add server
claude mcp add firecrawl -- npx -y firecrawl-mcp --api-key fc-your-api-key-here

# Restart server
claude mcp restart firecrawl
```

### Debug Mode

Enable debug logging:

```bash
# Set debug environment variable
export DEBUG=firecrawl-mcp:*

# Then add the server
claude mcp add firecrawl -- npx -y firecrawl-mcp --api-key fc-your-api-key-here
```

## Advanced Configuration

### Custom Retry Settings

```bash
claude mcp add firecrawl -- npx -y firecrawl-mcp --api-key fc-your-api-key-here --env FIRECRAWL_RETRY_MAX_ATTEMPTS=10 --env FIRECRAWL_RETRY_INITIAL_DELAY=500 --env FIRECRAWL_RETRY_MAX_DELAY=60000 --env FIRECRAWL_RETRY_BACKOFF_FACTOR=2
```

### Credit Monitoring

```bash
claude mcp add firecrawl -- npx -y firecrawl-mcp --api-key fc-your-api-key-here --env FIRECRAWL_CREDIT_WARNING_THRESHOLD=5000 --env FIRECRAWL_CREDIT_CRITICAL_THRESHOLD=1000
```

### Proxy Configuration

```bash
claude mcp add firecrawl -- npx -y firecrawl-mcp --api-key fc-your-api-key-here --env HTTP_PROXY=http://proxy.company.com:8080 --env HTTPS_PROXY=http://proxy.company.com:8080
```

## Integration Examples

### Basic Web Scraping

```bash
claude "Can you scrape the main content from https://example.com and give me a summary?"
```

### Search and Extract

```bash
claude "Search for recent AI research papers and extract the titles and authors."
```

### Data Extraction

```bash
claude "Go to https://example.com/products and extract all product names and prices into a structured format."
```

### Code Generation

```bash
claude "Generate a Python script that uses Firecrawl to scrape and process data from a news website."
```

## Server Management Commands

### List All Commands

```bash
# Show all MCP commands
claude mcp --help

# List servers
claude mcp list

# Show server status
claude mcp status firecrawl

# Remove server
claude mcp remove firecrawl

# Restart server
claude mcp restart firecrawl
```

### Configuration File

Claude Code stores MCP server configuration in:
- **macOS**: `~/Library/Application Support/Claude/claude-code-config.json`
- **Linux**: `~/.config/claude/claude-code-config.json`
- **Windows**: `%APPDATA%\Claude\claude-code-config.json`

## Performance Tips

1. **Local vs Remote**: Use local server for better performance and simplicity
2. **Environment Variables**: Pass configuration via `--env` flags for better management
3. **Server Management**: Use `claude mcp status` to monitor server health
4. **Resource Usage**: Monitor memory and CPU usage with local server

## Support

- **Documentation**: [Firecrawl Docs](https://docs.firecrawl.dev)
- **Claude Code Documentation**: [Claude Code MCP Docs](https://docs.anthropic.com/en/docs/claude-code/mcp)
- **API Key Issues**: [Firecrawl API Dashboard](https://www.firecrawl.dev/app/api-keys)
- **Claude Code Issues**: [Anthropic Help Center](https://support.anthropic.com)

## Environment-Specific Notes

- Claude Code supports both local and remote MCP server connections
- Local servers run via npx without requiring additional setup
- Remote servers require separate hosting and HTTP transport
- Configuration is managed through the `claude mcp` command
- Server state persists across Claude Code sessions
- Environment variables can be passed using `--env` flags

---

**Environment Compatibility**: ✅ Verified
**Last Tested**: September 2024
**Firecrawl MCP Version**: Latest
**Claude Code Version**: Latest