# OpenAI Codex

## Overview

OpenAI Codex is an AI-powered code completion and generation tool that supports MCP (Model Context Protocol) servers, enabling Firecrawl's web scraping capabilities to enhance your coding workflow.

## Prerequisites

- OpenAI Codex installed
- Firecrawl API Key
- Node.js 18+ (for npx)

## Installation

### Quick Install

1. **Get Firecrawl API Key**

   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Edit Configuration**
   - Open OpenAI Codex MCP server settings file
   - Add Firecrawl MCP configuration (see below)

### Step-by-Step

1. **Get Firecrawl API Key**

   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Locate Configuration File**

   - Find OpenAI Codex's MCP server settings file
   - See OpenAI Codex documentation for exact location

3. **Add Configuration**
   - Add Firecrawl MCP configuration using TOML format
   - Configure as local server connection

## Configuration

See [OpenAI Codex](https://github.com/openai/codex) for more information.

Add the following configuration to your OpenAI Codex MCP server settings:

### OpenAI Codex Local Server Configuration

```toml
[mcp_servers.firecrawl]
args = ["-y", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"]
command = "npx"
```

### OpenAI Codex Configuration with Environment Variables

```toml
[mcp_servers.firecrawl]
args = ["-y", "firecrawl-mcp"]
command = "npx"
env = { FIRECRAWL_API_KEY = "fc-your-api-key-here" }
```

### OpenAI Codex Configuration with Advanced Options

```toml
[mcp_servers.firecrawl]
args = ["-y", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"]
command = "npx"
env = {
  FIRECRAWL_RETRY_MAX_ATTEMPTS = "5",
  FIRECRAWL_RETRY_INITIAL_DELAY = "2000",
  FIRECRAWL_RETRY_MAX_DELAY = "30000",
  FIRECRAWL_CREDIT_WARNING_THRESHOLD = "2000",
  FIRECRAWL_CREDIT_CRITICAL_THRESHOLD = "500"
}
```

### OpenAI Codex Configuration for Self-Hosted Instance

```toml
[mcp_servers.firecrawl]
args = ["-y", "firecrawl-mcp", "--api-key", "your-self-hosted-key"]
command = "npx"
env = { FIRECRAWL_API_URL = "https://your-firecrawl-instance.com" }
```

## Configuration File Location

**Settings File**: OpenAI Codex MCP server settings

- Check OpenAI Codex documentation for exact file location
- Typically uses TOML format with `.toml` extension
- May be located in user home directory or application support folder

**Complete Configuration Example**:

```toml
[mcp_servers.firecrawl]
args = ["-y", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"]
command = "npx"
```

## Verification

### Test Installation

1. **Open OpenAI Codex**

   - Launch OpenAI Codex or your IDE with Codex integration

2. **Check Configuration**

   - Verify your MCP server settings are correctly configured
   - Ensure TOML syntax is valid

3. **Test with Codex**

   - Try a web scraping request in your development environment:
     ```
     Can you scrape https://httpbin.org/json and show me the content?
     ```

4. **Check Available Tools**
   OpenAI Codex should have access to:
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

| Issue                         | Solution                                     |
| ----------------------------- | -------------------------------------------- |
| **Configuration not loading** | Check file path and TOML syntax              |
| **API key rejected**          | Verify API key format and validity           |
| **Server not connecting**     | Check npx and Node.js installation           |
| **Tools not available**       | Restart OpenAI Codex and check configuration |
| **Command execution fails**   | Ensure Node.js 18+ is installed              |

### Configuration Issues

1. **TOML Syntax**:

   - Use proper TOML syntax with dots for nested objects
   - Strings must be quoted with double quotes
   - Arrays use square brackets
   - Ensure proper indentation and spacing

2. **API Key Format**:

   - Use `--api-key fc-your-api-key-here` in args array
   - Or use environment variables with `env` table

3. **Command Structure**:

   - Must specify both `command` and `args`
   - `command` should be "npx"
   - `args` should be an array of command-line arguments

4. **Environment Variables**:
   - Use TOML table format: `env = { KEY = "value" }`
   - Multiple variables can be specified in the same table

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

```toml
[mcp_servers.firecrawl]
args = ["-y", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"]
command = "npx"
env = {
  FIRECRAWL_RETRY_MAX_ATTEMPTS = "10",
  FIRECRAWL_RETRY_INITIAL_DELAY = "500",
  FIRECRAWL_RETRY_MAX_DELAY = "60000",
  FIRECRAWL_RETRY_BACKOFF_FACTOR = "2"
}
```

### Proxy Configuration

```toml
[mcp_servers.firecrawl]
args = ["-y", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"]
command = "npx"
env = {
  HTTP_PROXY = "http://proxy.company.com:8080",
  HTTPS_PROXY = "http://proxy.company.com:8080"
}
```

### Credit Monitoring

```toml
[mcp_servers.firecrawl]
args = ["-y", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"]
command = "npx"
env = {
  FIRECRAWL_CREDIT_WARNING_THRESHOLD = "5000",
  FIRECRAWL_CREDIT_CRITICAL_THRESHOLD = "1000"
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

1. **TOML Format**: Use proper TOML syntax with correct quoting and structure
2. **Environment Variables**: Use `env` table for sensitive configuration
3. **Command Structure**: Always include both `command` and `args` properties
4. **Latest Version**: Always use latest Firecrawl MCP version for best features
5. **Node.js Version**: Ensure Node.js 18+ is installed for npx support

## Support

- **OpenAI Codex Documentation**: [OpenAI Codex GitHub](https://github.com/openai/codex)
- **Firecrawl Documentation**: [Firecrawl Docs](https://docs.firecrawl.dev)
- **API Key Issues**: [Firecrawl API Dashboard](https://www.firecrawl.dev/app/api-keys)
- **OpenAI Support**: Check OpenAI's official documentation

## Environment-Specific Notes

- OpenAI Codex uses TOML format for configuration instead of JSON
- Configuration structure uses `mcp_servers` table with server name as key
- Local server connections only (npx-based execution)
- Environment variables specified using TOML table format
- Command and arguments specified separately
- No remote server connection support (local only)
- Self-hosted instances supported through environment variables
- TOML syntax requires proper quoting and escaping
- Configuration file location depends on OpenAI Codex installation

---

**Environment Compatibility**: ✅ Verified
**Last Tested**: September 2024
**Firecrawl MCP Version**: Latest
**OpenAI Codex Version**: Latest (with MCP support)
