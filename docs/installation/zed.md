# Zed

## Overview

Zed is a modern, high-performance code editor that supports AI assistants through context servers. Firecrawl MCP integrates with Zed to provide web scraping capabilities directly within the editor's AI assistant.

## Prerequisites

- Zed editor (latest version recommended)
- Firecrawl API Key
- Node.js 18+ (for local server option)

## Installation

### Quick Install - Extensions Marketplace (Recommended)

It can be installed via [Zed Extensions](https://zed.dev/extensions?query=firecrawl) or you can add this to your Zed `settings.json`. See [Zed Context Server docs](https://zed.dev/docs/assistant/context-servers) for more info.

### Step-by-Step

#### Method 1: Extensions Marketplace (Recommended)

1. **Get Firecrawl API Key**
   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Install via Zed Extensions**
   - Open Zed
   - Open the extensions panel (`Ctrl+Shift+X` or `Cmd+Shift+X`)
   - Search for "Firecrawl" or "firecrawl-mcp"
   - Click **Install** on the Firecrawl MCP extension
   - Enter your API key when prompted

3. **Verify Installation**
   - Open Zed's AI assistant (`Ctrl+Enter` or `Cmd+Enter`)
   - Check that Firecrawl tools are available

#### Method 2: Manual Configuration

1. **Get Firecrawl API Key**
   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Edit Zed Settings**
   - Open Zed
   - Open settings file (`Ctrl+,` or `Cmd+,`)
   - Add the configuration to your `settings.json`

## Configuration

### Local Server Configuration (Recommended)

```json
{
  "context_servers": {
    "Firecrawl": {
      "command": {
        "path": "npx",
        "args": ["-y", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"]
      },
      "settings": {}
    }
  }
}
```

### Remote Server Configuration

```json
{
  "context_servers": {
    "Firecrawl": {
      "command": {
        "path": "curl",
        "args": [
          "-H", "Authorization: Bearer fc-your-api-key-here",
          "-H", "Content-Type: application/json",
          "-d", '{"jsonrpc":"2.0","method":"initialize","params":{}}',
          "https://api.firecrawl.dev/mcp"
        ]
      },
      "settings": {
        "url": "https://api.firecrawl.dev/mcp",
        "headers": {
          "Authorization": "Bearer fc-your-api-key-here"
        }
      }
    }
  }
}
```

### Advanced Local Configuration

```json
{
  "context_servers": {
    "Firecrawl": {
      "command": {
        "path": "npx",
        "args": [
          "-y",
          "firecrawl-mcp",
          "--api-key", "fc-your-api-key-here",
          "--env", "FIRECRAWL_RETRY_MAX_ATTEMPTS=5",
          "--env", "FIRECRAWL_CREDIT_WARNING_THRESHOLD=2000"
        ]
      },
      "settings": {
        "retry_attempts": 5,
        "credit_warning_threshold": 2000,
        "timeout": 30000
      }
    }
  }
}
```

### Self-Hosted Configuration

```json
{
  "context_servers": {
    "Firecrawl": {
      "command": {
        "path": "npx",
        "args": ["-y", "firecrawl-mcp", "--api-key", "your-self-hosted-key"]
      },
      "settings": {
        "api_url": "https://your-firecrawl-instance.com"
      }
    }
  }
}
```

## Configuration File Location

**Global Settings**:
- macOS: `~/Library/Application Support/Zed/settings.json`
- Linux: `~/.config/zed/settings.json`
- Windows: `%APPDATA%\Zed\settings.json`

**Project-Specific Settings**:
- Create `.zed/settings.json` in your project root

## Verification

### Test Installation

1. **Open Zed**
   - Launch Zed editor

2. **Check Context Servers**
   - Open Zed's AI assistant (`Ctrl+Enter` or `Cmd+Enter`)
   - Look for Firecrawl tools in the available tools list
   - Server should appear as connected/active

3. **Test with AI Assistant**
   - Open the AI assistant panel
   - Try a web scraping request:
     ```
     Can you scrape https://httpbin.org/json and show me the content?
     ```

4. **Check Available Tools**
   Zed should have access to:
   - `firecrawl_scrape`
   - `firecrawl_search`
   - `firecrawl_map`
   - `firecrawl_crawl`
   - `firecrawl_extract`
   - `firecrawl_batch_scrape`

### Expected Output

```
I'll help you scrape that website using Firecrawl.

[Tool Use: firecrawl_scrape]
{"url": "https://httpbin.org/json", "formats": ["markdown"]}

Successfully scraped the content from https://httpbin.org/json:

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
| **Extension not found** | Use manual configuration method |
| **Server not connecting** | Check API key and Node.js installation |
| **Tools not available** | Restart Zed and check context server status |
| **Permission errors** | Check Node.js and npm permissions |
| **Remote connection fails** | Verify URL and API key format |

### Extension Issues

1. **Extension not in marketplace**:
   - Use manual configuration method
   - Check Zed version (latest recommended)
   - Try searching for "firecrawl-mcp" or "mcp"

2. **Extension installation fails**:
   - Restart Zed and try again
   - Check internet connection
   - Use manual configuration as fallback

### Configuration Issues

1. **Settings file location**:
   - Ensure you're editing the correct `settings.json` file
   - Check Zed's documentation for your operating system

2. **JSON syntax errors**:
   - Use Zed's built-in JSON validation
   - Ensure proper commas, quotes, and brackets

3. **API key format**:
   - Local: Use `--api-key fc-your-api-key-here`
   - Remote: Use `Authorization: Bearer fc-your-api-key-here`

### Debug Mode

Enable debug logging:

```bash
# Set debug environment variable
export DEBUG=firecrawl-mcp:*

# Test local server manually
npx -y firecrawl-mcp --api-key fc-your-api-key-here

# Test remote connection
curl -H "Authorization: Bearer fc-your-api-key-here" https://api.firecrawl.dev/mcp
```

## Advanced Configuration

### Custom Retry Settings

```json
{
  "context_servers": {
    "Firecrawl": {
      "command": {
        "path": "npx",
        "args": [
          "-y", "firecrawl-mcp",
          "--api-key", "fc-your-api-key-here",
          "--env", "FIRECRAWL_RETRY_MAX_ATTEMPTS=10",
          "--env", "FIRECRAWL_RETRY_INITIAL_DELAY=500",
          "--env", "FIRECRAWL_RETRY_MAX_DELAY=60000"
        ]
      },
      "settings": {
        "retry_attempts": 10,
        "initial_delay": 500,
        "max_delay": 60000
      }
    }
  }
}
```

### Environment Variable Configuration

```json
{
  "context_servers": {
    "Firecrawl": {
      "command": {
        "path": "npx",
        "args": ["-y", "firecrawl-mcp"],
        "env": {
          "FIRECRAWL_API_KEY": "fc-your-api-key-here",
          "FIRECRAWL_RETRY_MAX_ATTEMPTS": "5",
          "FIRECRAWL_CREDIT_WARNING_THRESHOLD": "2000",
          "FIRECRAWL_CREDIT_CRITICAL_THRESHOLD": "500"
        }
      },
      "settings": {
        "retry_attempts": 5,
        "credit_warning_threshold": 2000
      }
    }
  }
}
```

### Proxy Configuration

```json
{
  "context_servers": {
    "Firecrawl": {
      "command": {
        "path": "npx",
        "args": ["-y", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"],
        "env": {
          "HTTP_PROXY": "http://proxy.company.com:8080",
          "HTTPS_PROXY": "http://proxy.company.com:8080"
        }
      },
      "settings": {
        "proxy_url": "http://proxy.company.com:8080"
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

### Code Analysis with Web Data

```
Scrape the API documentation from https://example.com/docs and help me understand how to use it in my current project.
```

### Research and Analysis

```
Search for recent AI research papers, extract the key findings, and suggest how they might apply to our codebase.
```

### Data Extraction

```
Extract all product names and prices from https://example.com/products and organize them in a table.
```

## Performance Tips

1. **Extensions vs Manual**: Use extensions for easier setup, manual for more control
2. **Local vs Remote**: Local is simpler, remote offers better performance for teams
3. **Settings Object**: Use the `settings` object for additional configuration
4. **Environment Variables**: Pass complex configuration via environment variables
5. **Project-Specific**: Use `.zed/settings.json` for project-specific configurations

## Support

- **Zed Documentation**: [Zed Editor](https://zed.dev)
- **Zed Extensions**: [Extensions Marketplace](https://zed.dev/extensions)
- **Context Servers**: [Context Server Docs](https://zed.dev/docs/assistant/context-servers)
- **Firecrawl Documentation**: [Firecrawl Docs](https://docs.firecrawl.dev)
- **API Key Issues**: [Firecrawl API Dashboard](https://www.firecrawl.dev/app/api-keys)

## Environment-Specific Notes

- Zed uses "context servers" terminology for MCP integration
- Configuration goes in `settings.json` under `context_servers` object
- Command structure uses `"path"` and `"args"` format
- `settings` object provides additional configuration options
- Both global and project-specific configuration files are supported
- Extensions marketplace provides one-click installation
- Remote server support enables team deployments
- Local server requires Node.js 18+ on user's machine
- Integration works with Zed's built-in AI assistant

---

**Environment Compatibility**: ✅ Verified
**Last Tested**: September 2024
**Firecrawl MCP Version**: Latest
**Zed Version**: Latest (with context server support)