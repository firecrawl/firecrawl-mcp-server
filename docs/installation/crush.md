# Crush

## Overview

Crush is a modern, AI-powered development environment that supports MCP (Model Context Protocol) servers, enabling Firecrawl's web scraping capabilities directly within your development workflow. Crush provides both remote HTTP and local stdio server connections for flexible integration.

## Prerequisites

- Crush installed
- Firecrawl API Key
- Node.js 18+ (for npx)

## Installation

### Quick Install

1. **Get Firecrawl API Key**
   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Configure Crush**
   - Locate your Crush configuration file
   - Add Firecrawl MCP configuration (see below)

### Step-by-Step

1. **Get Firecrawl API Key**
   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Locate Configuration File**
   - Find your Crush configuration file (typically `crush.json` or similar)
   - See [Crush MCP docs](https://github.com/charmbracelet/crush#mcps) for exact location

3. **Add MCP Server**
   - Add the Firecrawl MCP configuration to your Crush config
   - Use either remote HTTP or local stdio connection (see below)

## Configuration

Add this to your Crush configuration file. See [Crush MCP docs](https://github.com/charmbracelet/crush#mcps) for more info.

### Crush Remote Server Connection (HTTP)

```json
{
  "$schema": "https://charm.land/crush.json",
  "mcp": {
    "firecrawl": {
      "type": "http",
      "url": "https://api.firecrawl.dev/mcp",
      "headers": {
        "FIRECRAWL_API_KEY": "fc-your-api-key-here"
      }
    }
  }
}
```

### Crush Local Server Connection

```json
{
  "$schema": "https://charm.land/crush.json",
  "mcp": {
    "firecrawl": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"]
    }
  }
}
```

### Crush Configuration with Environment Variables

```json
{
  "$schema": "https://charm.land/crush.json",
  "mcp": {
    "firecrawl": {
      "type": "stdio",
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

### Crush Configuration for Self-Hosted Instance

```json
{
  "$schema": "https://charm.land/crush.json",
  "mcp": {
    "firecrawl": {
      "type": "http",
      "url": "https://your-firecrawl-instance.com/mcp",
      "headers": {
        "FIRECRAWL_API_KEY": "your-self-hosted-key"
      }
    }
  }
}
```

### Crush Remote Configuration with Additional Headers

```json
{
  "$schema": "https://charm.land/crush.json",
  "mcp": {
    "firecrawl": {
      "type": "http",
      "url": "https://api.firecrawl.dev/mcp",
      "headers": {
        "FIRECRAWL_API_KEY": "fc-your-api-key-here",
        "X-Retry-Max-Attempts": "5",
        "X-Credit-Warning-Threshold": "2000",
        "X-Client-ID": "crush"
      }
    }
  }
}
```

## Configuration File Location

**Crush Configuration**:
- Check Crush documentation for exact file location
- Typically named `crush.json` or similar
- Must include the `$schema` reference for validation
- Configuration is managed through the `mcp` object

**Complete Configuration Example**:

```json
{
  "$schema": "https://charm.land/crush.json",
  "mcp": {
    "firecrawl": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"]
    }
  }
}
```

## Verification

### Test Installation

1. **Verify Crush Setup**
   ```bash
   crush --version
   # Check Crush documentation for available commands
   ```

2. **Test Node.js and npx**
   ```bash
   node --version
   npx --version
   ```

3. **Test Firecrawl MCP Manually**
   ```bash
   npx -y firecrawl-mcp --help
   npx -y firecrawl-mcp --api-key fc-your-api-key-here
   ```

4. **Check Crush Configuration**
   - Verify configuration file is properly formatted JSON
   - Check that Firecrawl MCP appears in configured servers
   - Ensure schema reference is correct

5. **Test with Crush**
   - Use Crush with a web scraping request:
     ```
     Can you scrape https://httpbin.org/json and show me the content?
     ```

6. **Check Available Tools**
   Crush should have access to:
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
| **Schema validation errors** | Verify `$schema` reference is correct |
| **API key rejected** | Verify API key format and validity |
| **Server not connecting** | Check npx and Node.js installation |
| **Tools not available** | Restart Crush and check configuration |

### Configuration Issues

1. **JSON Configuration**:
   - Ensure valid JSON syntax with proper commas and quotes
   - Configuration must include `$schema` reference
   - Must have `mcp` object with Firecrawl configuration

2. **Schema Reference**:
   - Use exact schema URL: `https://charm.land/crush.json`
   - Schema validation helps ensure proper configuration format
   - Remove schema if it causes validation issues

3. **API Key Format**:
   - Use `--api-key fc-your-api-key-here` in args array for local connections
   - Use `FIRECRAWL_API_KEY` in headers for HTTP connections
   - Ensure API key is valid and not expired

4. **Connection Types**:
   - HTTP type: `{"type": "http", "url": "...", "headers": {...}}`
   - stdio type: `{"type": "stdio", "command": "...", "args": [...]}`
   - Choose based on your preference and requirements

### Crush-Specific Issues

1. **Configuration File Location**:
   - Check Crush documentation for exact file location
   - Common locations: project root, user home directory, Crush config directory
   - File is typically named `crush.json` or similar

2. **Version Compatibility**:
   - Ensure Crush version supports MCP servers
   - Check Crush documentation for MCP feature availability
   - Update to latest Crush version if needed

### Debug Commands

```bash
# Set debug environment variable
export DEBUG=firecrawl-mcp:*

# Test local server manually
npx -y firecrawl-mcp --api-key fc-your-api-key-here

# Test with environment variables
env FIRECRAWL_API_KEY=fc-your-api-key-here npx -y firecrawl-mcp

# Test remote connection manually
curl -H "FIRECRAWL_API_KEY: fc-your-api-key-here" https://api.firecrawl.dev/mcp

# Check Node.js and npm installation
node --version
npm --version
npx --version
```

## Advanced Configuration

### Custom Retry Settings

```json
{
  "$schema": "https://charm.land/crush.json",
  "mcp": {
    "firecrawl": {
      "type": "stdio",
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
  "$schema": "https://charm.land/crush.json",
  "mcp": {
    "firecrawl": {
      "type": "stdio",
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
  "$schema": "https://charm.land/crush.json",
  "mcp": {
    "firecrawl": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "fc-your-api-key-here",
        "FIRECRAWL_CREDIT_WARNING_THRESHOLD": "5000",
        "FIRECRAWL_CREDIT_CRITICAL_THRESHOLD": "1000"
      }
    }
  }
}
```

### Remote Connection with Custom Headers

```json
{
  "$schema": "https://charm.land/crush.json",
  "mcp": {
    "firecrawl": {
      "type": "http",
      "url": "https://api.firecrawl.dev/mcp",
      "headers": {
        "FIRECRAWL_API_KEY": "fc-your-api-key-here",
        "X-Retry-Max-Attempts": "10",
        "X-Retry-Initial-Delay": "500",
        "X-Credit-Warning-Threshold": "5000",
        "X-Client-ID": "crush"
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

1. **Connection Type**: Choose HTTP for remote servers (no local Node.js required) or stdio for local execution
2. **Environment Variables**: Use `env` object for sensitive configuration and advanced settings
3. **Schema Validation**: Include `$schema` reference for better configuration validation
4. **Latest Version**: Always use latest Firecrawl MCP version for best features
5. **Crush Restart**: Some configuration changes may require Crush restart

## Crush-Specific Features

### Modern Development Environment
- Built-in AI capabilities with natural language processing
- Seamless integration with development workflows
- Modern terminal experience with enhanced features

### Flexible Connection Options
- Support for both HTTP (remote) and stdio (local) connections
- Custom headers and environment variable support
- Schema-based configuration validation

### Development Workflow Integration
- Designed to enhance development workflows
- Natural language commands for web scraping
- Intelligent tool suggestions and completions

## Support

- **Crush Documentation**: [Crush MCP Documentation](https://github.com/charmbracelet/crush#mcps)
- **Firecrawl Documentation**: [Firecrawl Docs](https://docs.firecrawl.dev)
- **API Key Issues**: [Firecrawl API Dashboard](https://www.firecrawl.dev/app/api-keys)
- **Crush Support**: [Crush GitHub Repository](https://github.com/charmbracelet/crush)

## Environment-Specific Notes

- Crush uses JSON configuration with schema validation
- Supports both HTTP (remote) and stdio (local) connection types
- Configuration file typically named `crush.json` with `$schema` reference
- Environment variables supported through JSON object format
- Self-hosted instances supported through custom URLs
- Flexible authentication methods (headers for HTTP, args/env for stdio)
- Modern development environment with AI capabilities
- Schema validation helps ensure proper configuration format
- Designed for enhanced development workflows
- Custom headers support for advanced HTTP configuration
- Enterprise-ready with remote server options

---

**Environment Compatibility**: ✅ Verified
**Last Tested**: September 2024
**Firecrawl MCP Version**: Latest
**Crush Version**: Latest (with MCP support)