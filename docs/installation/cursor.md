# Cursor

## Overview

Cursor is a powerful AI-powered code editor that supports MCP (Model Context Protocol) servers. Firecrawl MCP integrates with Cursor to provide web scraping capabilities directly within your coding environment.

## Prerequisites

- Cursor v0.45.6 or higher (v1.0+ recommended for one-click install)
- Firecrawl API Key
- Node.js 18+ (for npx)
- npm

## Installation

### Quick Install

[![Install Firecrawl MCP in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=firecrawl&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImZpcmVjcmF3bC1tY3AiXSwiZW52Ijp7IkZJUkVDUkFMTF9BUElfS0VZIjoiJHtpbnB1dDphcGlLZXl9In19)

**Or get your API key first:**
- Visit: https://www.firecrawl.dev/app/api-keys

### Step-by-Step

#### Method 1: One-Click Installation (Cursor v1.0+)

1. **Click the install button above** - This will automatically configure Firecrawl MCP in Cursor
2. **Enter your API key** when prompted
3. **Start using Firecrawl tools** immediately

#### Method 2: Manual Configuration

1. **Get Firecrawl API Key**
   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Choose Configuration Location**

   **Global Installation** (recommended):
   - Edit `~/.cursor/mcp.json`
   - Or go to `Settings` → `Cursor Settings` → `MCP` → `Add new global MCP server`

   **Project-Specific Installation**:
   - Create `.cursor/mcp.json` in your project folder
   - This configuration will only apply to this project

3. **Add Configuration**

   **For Cursor v1.0+**:
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

   **Alternative format with API key as argument**:
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

   **For Cursor v0.48.6+**:
   ```json
   {
     "mcpServers": {
       "firecrawl-mcp": {
         "command": "npx",
         "args": ["-y", "firecrawl-mcp"],
         "env": {
           "FIRECRAWL_API_KEY": "fc-your-api-key-here"
         }
       }
     }
   }
   ```

   **For Cursor v0.45.6**:
   - Name: "firecrawl-mcp" (or your preferred name)
   - Type: "command"
   - Command: `env FIRECRAWL_API_KEY=fc-your-api-key-here npx -y firecrawl-mcp`

4. **Restart Cursor**
   - Close and reopen Cursor to load the new configuration
   - Firecrawl tools should now be available in the MCP server list

## Configuration

### Basic Configuration (v0.48.6+)

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "fc-your-api-key-here"
      }
    }
  }
}
```

### Advanced Configuration (v0.48.6+)

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "fc-your-api-key-here",

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

### Windows Configuration

**For Windows users encountering issues**:
```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "cmd",
      "args": ["/c", "set FIRECRAWL_API_KEY=fc-your-api-key-here && npx -y firecrawl-mcp"]
    }
  }
}
```

### Self-Hosted Configuration

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_URL": "https://your-firecrawl-instance.com",
        "FIRECRAWL_API_KEY": "your-self-hosted-key"
      }
    }
  }
}
```

## Verification

### Test Installation

1. **Open Cursor**
2. **Check MCP Servers**
   - Go to `Features` > `MCP Servers`
   - Verify "firecrawl-mcp" appears in the server list
   - Status should show as "Connected"

3. **Test with Composer**
   - Open Composer (Command+L on Mac)
   - Select "Agent" next to the submit button
   - Try a web scraping request:
     ```
     Scrape https://httpbin.org/json and show me the content
     ```

### Expected Output

The Composer Agent should automatically use Firecrawl MCP tools and return scraped content. You should see Firecrawl tools listed in the MCP server configuration.

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
| **Server not connecting** | Check Cursor version (v0.45.6+) |
| **API key errors** | Verify API key format and validity |
| **Windows command issues** | Use cmd format with `/c` flag |
| **Tools not appearing** | Refresh MCP server list or restart Cursor |

### Windows-Specific Issues

**Issue**: Command not recognized or permission errors

**Solution**:
```json
{
  "command": "cmd",
  "args": ["/c", "set FIRECRAWL_API_KEY=fc-your-api-key-here && npx -y firecrawl-mcp"]
}
```

### Debug Mode

Enable debug logging:

```bash
# Set debug environment variable before starting Cursor
export DEBUG=firecrawl-mcp:*
```

### Configuration Validation

1. **Check Cursor version**:
   - Go to `Cursor` > `About Cursor`
   - Ensure version is v0.45.6 or higher

2. **Validate JSON syntax**:
   - Use a JSON validator to check your configuration
   - Ensure proper quotes and comma placement

3. **Test npx access**:
```bash
npx -y firecrawl-mcp --help
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

### In-Chat Usage

```
Can you scrape the latest blog posts from https://example.com/blog and summarize them for me?
```

### Code Integration

```typescript
// Ask Cursor to generate code that uses Firecrawl
"Create a TypeScript function that uses Firecrawl to extract product information from an e-commerce page"
```

### Data Analysis

```
Search for recent AI research papers, extract the titles and publication dates, and create a summary of the trends.
```

## Performance Tips

1. **Optimize Requests**: Use appropriate tools for specific tasks
2. **Batch Operations**: Use `batch_scrape` for multiple known URLs
3. **Rate Limiting**: Built-in rate limiting prevents API abuse
4. **Caching**: Cursor may cache results for similar requests

## Support

- **Documentation**: [Firecrawl Docs](https://docs.firecrawl.dev)
- **Cursor Documentation**: [Cursor MCP Guide](https://docs.cursor.com/context/model-context-protocol)
- **API Key Issues**: [Firecrawl API Dashboard](https://www.firecrawl.dev/app/api-keys)
- **Cursor Support**: [Cursor Help Center](https://help.cursor.sh)

## Environment-Specific Notes

- Cursor v1.0+ supports one-click installation via deeplink
- Cursor v0.45.6+ supports MCP with manual configuration
- Global configuration: `~/.cursor/mcp.json`
- Project-specific configuration: `.cursor/mcp.json`
- MCP servers run in the background and are managed by Cursor
- The Composer Agent automatically selects appropriate tools based on context
- Windows may require special command formatting
- One-click installation uses Cursor's deeplink system with encoded configuration

---

**Environment Compatibility**: ✅ Verified
**Last Tested**: September 2024
**Firecrawl MCP Version**: Latest
**Cursor Version**: v0.48.6+ (recommended), v0.45.6+ (minimum)