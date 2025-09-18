# Windsurf

## Overview

Windsurf by Codeium is an AI-powered development environment that supports MCP (Model Context Protocol) servers. Firecrawl MCP integrates with Windsurf to provide web scraping capabilities.

## Prerequisites

- Windsurf IDE
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

1. **Get Firecrawl API Key**
   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Create Configuration Directory**
   ```bash
   mkdir -p ./codeium/windsurf
   ```

3. **Create Configuration File**
   Create or edit `./codeium/windsurf/model_config.json`:

   **For Local Server Connection (Recommended)**:
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

   **For Remote Server Connection**:
   ```json
   {
     "mcpServers": {
       "firecrawl": {
         "serverUrl": "https://your-firecrawl-endpoint.com/mcp",
         "headers": {
           "FIRECRAWL_API_KEY": "fc-your-api-key-here"
         }
       }
     }
   }
   ```

   **Alternative Local Configuration (Environment Variables)**:
   ```json
   {
     "mcpServers": {
       "firecrawl": {
         "command": "npx",
         "args": ["-y", "firecrawl-mcp"],
         "env": {
           "FIRECRAWL_API_KEY": "fc-your-api-key-here"
         }
       }
     }
   }
   ```

4. **Restart Windsurf**
   - Close and reopen Windsurf to load the new configuration

## Configuration

### Local Server Configuration (Recommended)

#### Method 1: API Key as Argument (Recommended)
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

#### Method 2: Environment Variables
```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "fc-your-api-key-here"
      }
    }
  }
}
```

### Remote Server Configuration

#### Method 1: Remote URL with Headers
```json
{
  "mcpServers": {
    "firecrawl": {
      "serverUrl": "https://your-firecrawl-endpoint.com/mcp",
      "headers": {
        "FIRECRAWL_API_KEY": "fc-your-api-key-here"
      }
    }
  }
}
```

#### Method 2: Remote URL with Additional Configuration
```json
{
  "mcpServers": {
    "firecrawl": {
      "serverUrl": "https://your-firecrawl-endpoint.com/mcp",
      "headers": {
        "FIRECRAWL_API_KEY": "fc-your-api-key-here",
        "X-Client-ID": "windsurf"
      }
    }
  }
}
```

### Advanced Configuration

#### Local Server with Advanced Options
```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"],
      "env": {
        "FIRECRAWL_RETRY_MAX_ATTEMPTS": "5",
        "FIRECRAWL_RETRY_INITIAL_DELAY": "2000",
        "FIRECRAWL_RETRY_MAX_DELAY": "30000",
        "FIRECRAWL_RETRY_BACKOFF_FACTOR": "3",
        "FIRECRAWL_CREDIT_WARNING_THRESHOLD": "2000",
        "FIRECRAWL_CREDIT_CRITICAL_THRESHOLD": "500"
      }
    }
  }
}
```

#### Remote Server with Advanced Options
```json
{
  "mcpServers": {
    "firecrawl": {
      "serverUrl": "https://your-firecrawl-endpoint.com/mcp",
      "headers": {
        "FIRECRAWL_API_KEY": "fc-your-api-key-here",
        "X-Retry-Max-Attempts": "5",
        "X-Credit-Warning-Threshold": "2000"
      }
    }
  }
}
```

### Self-Hosted Configuration

#### Local Self-Hosted Instance
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

#### Remote Self-Hosted Instance
```json
{
  "mcpServers": {
    "firecrawl": {
      "serverUrl": "https://your-firecrawl-instance.com/mcp",
      "headers": {
        "FIRECRAWL_API_KEY": "your-self-hosted-key"
      }
    }
  }
}
```

## Verification

### Test Installation

1. **Open Windsurf**
2. **Check Configuration**
   - Navigate to the project with the `./codeium/windsurf/model_config.json` file
   - Windsurf should automatically detect and load the MCP server

3. **Test with AI Chat**
   - Open Windsurf's AI chat interface
   - Try a web scraping request:
     ```
     Can you scrape https://httpbin.org/json and show me the content?
     ```

### Expected Output

Windsurf should automatically use Firecrawl MCP tools when you make web scraping requests. The AI should have access to all Firecrawl tools.

### Available Tools

- `firecrawl_scrape` - Single page scraping
- `firecrawl_search` - Web search
- `firecrawl_map` - URL discovery
- `firecrawl_crawl` - Multi-page crawling
- `firecrawl_extract` - Structured data extraction
- `firecrawl_batch_scrape` - Multiple URL scraping

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| **Configuration not loading** | Check file path and JSON syntax |
| **API key errors** | Verify API key format and validity |
| **Tools not available** | Restart Windsurf and check configuration path |
| **Permission errors** | Ensure proper Node.js/npm permissions |

### Configuration File Issues

1. **Check file location**:
   - Configuration must be at `./codeium/windsurf/model_config.json`
   - This is relative to your project root

2. **Validate JSON syntax**:
```bash
cat ./codeium/windsurf/model_config.json | python -m json.tool
```

3. **Check file permissions**:
```bash
ls -la ./codeium/windsurf/model_config.json
```

### Debug Mode

Enable debug logging:

```bash
# Set debug environment variable before starting Windsurf
export DEBUG=firecrawl-mcp:*
```

### Test MCP Server Directly

```bash
# Test if the server can start manually
env FIRECRAWL_API_KEY=fc-your-api-key-here npx -y firecrawl-mcp
```

## Advanced Configuration

### Custom Retry Settings

```json
{
  "env": {
    "FIRECRAWL_RETRY_MAX_ATTEMPTS": "10",
    "FIRECRAWL_RETRY_INITIAL_DELAY": "500",
    "FIRECRAWL_RETRY_MAX_DELAY": "60000",
    "FIRECRAWL_RETRY_BACKOFF_FACTOR": "2"
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

### Proxy Configuration

```json
{
  "env": {
    "FIRECRAWL_API_KEY": "fc-your-api-key-here",
    "HTTP_PROXY": "http://proxy.company.com:8080",
    "HTTPS_PROXY": "http://proxy.company.com:8080"
  }
}
```

## Integration Examples

### Web Scraping in Chat

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

1. **Configuration Location**: Keep the config file in your project root for easy access
2. **API Key Security**: Consider using environment variables for API keys in production
3. **Rate Limiting**: Built-in rate limiting prevents API abuse
4. **Batch Operations**: Use `batch_scrape` for multiple URLs to improve efficiency

## Support

- **Documentation**: [Firecrawl Docs](https://docs.firecrawl.dev)
- **Windsurf Documentation**: [Codeium Docs](https://docs.codeium.com)
- **API Key Issues**: [Firecrawl API Dashboard](https://www.firecrawl.dev/app/api-keys)
- **Windsurf Support**: [Codeium Help Center](https://help.codeium.com)

## Environment-Specific Notes

- Configuration is project-specific (placed in project directory)
- Windsurf automatically detects and loads MCP servers from the config file
- Multiple MCP servers can be configured in the same file
- Works with Windsurf's AI chat and code completion features
- Configuration changes require Windsurf restart
- **Local Server**: Runs Firecrawl MCP via npx on your local machine
- **Remote Server**: Connects to a hosted Firecrawl MCP server via URL
- **API Key Options**: Can be passed as arguments, environment variables, or headers
- **Self-Hosted Support**: Works with both local and remote self-hosted instances
- **Enterprise Ready**: Remote server configuration suitable for corporate environments

---

**Environment Compatibility**: ✅ Verified
**Last Tested**: September 2024
**Firecrawl MCP Version**: Latest
**Windsurf Version**: Latest