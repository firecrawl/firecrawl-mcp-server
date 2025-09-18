# VS Code

## Overview

Visual Studio Code supports MCP (Model Context Protocol) servers through built-in MCP functionality, enabling Firecrawl's web scraping capabilities directly within the editor.

## Prerequisites

- VS Code or VS Code Insiders
- Firecrawl API Key
- Node.js 18+ (for npx)
- npm

## Installation

### Quick Install - One-Click

[<img alt="Install in VS Code (npx)" src="https://img.shields.io/badge/VS_Code-VS_Code?style=flat-square&label=Install%20Firecrawl%20MCP&color=0098FF">](https://insiders.vscode.dev/redirect?url=vscode%3Amcp%2Finstall%3F%7B%22name%22%3A%22firecrawl%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22firecrawl-mcp%40latest%22%5D%7D)

[<img alt="Install in VS Code Insiders (npx)" src="https://img.shields.io/badge/VS_Code_Insiders-VS_Code_Insiders?style=flat-square&label=Install%20Firecrawl%20MCP&color=24bfa5">](https://insiders.vscode.dev/redirect?url=vscode-insiders%3Amcp%2Finstall%3F%7B%22name%22%3A%22firecrawl%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22firecrawl-mcp%40latest%22%5D%7D)

### Step-by-Step

1. **Get Firecrawl API Key**
   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Choose Installation Method**

   **One-Click Installation (Recommended)**:
   - Click one of the install badges above
   - VS Code will prompt you for your Firecrawl API key
   - Installation completes automatically

   **Manual Configuration**:
   - Add configuration to your VS Code MCP config file (see below)

## Configuration

Add this to your VS Code MCP config file. See [VS Code MCP docs](https://code.visualstudio.com/docs/copilot/chat/mcp-servers) for more info.

### VS Code Remote Server Connection

```json
{
  "mcp": {
    "servers": {
      "firecrawl": {
        "type": "http",
        "url": "https://your-firecrawl-endpoint.com/mcp",
        "headers": {
          "FIRECRAWL_API_KEY": "fc-your-api-key-here"
        }
      }
    }
  }
}
```

### VS Code Local Server Connection

```json
{
  "mcp": {
    "servers": {
      "firecrawl": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "firecrawl-mcp@latest", "--api-key", "fc-your-api-key-here"]
      }
    }
  }
}
```

### Configuration File Location

**User Settings (Global)**:
- Press `Ctrl + Shift + P` (or `Cmd + Shift + P` on Mac)
- Type `Preferences: Open User Settings (JSON)`
- Add the configuration to the JSON object

**Workspace Settings (Project-specific)**:
- Create `.vscode/settings.json` in your project
- Add the configuration to the JSON object

### Advanced Configuration

#### Remote Server with Advanced Options

```json
{
  "mcp": {
    "servers": {
      "firecrawl": {
        "type": "http",
        "url": "https://your-firecrawl-endpoint.com/mcp",
        "headers": {
          "FIRECRAWL_API_KEY": "fc-your-api-key-here",
          "X-Retry-Max-Attempts": "5",
          "X-Credit-Warning-Threshold": "2000",
          "X-Client-ID": "vscode"
        }
      }
    }
  }
}
```

#### Local Server with Environment Variables

```json
{
  "mcp": {
    "servers": {
      "firecrawl": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "firecrawl-mcp@latest"],
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
}
```

#### Self-Hosted Configuration

```json
{
  "mcp": {
    "servers": {
      "firecrawl": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "firecrawl-mcp@latest", "--api-key", "your-self-hosted-key"],
        "env": {
          "FIRECRAWL_API_URL": "https://your-firecrawl-instance.com"
        }
      }
    }
  }
}
```

## Verification

### Test Installation

1. **Restart VS Code**
   - Close and reopen VS Code to load the new configuration

2. **Check MCP Status**
   - Open the Command Palette (`Ctrl + Shift + P`)
   - Type "MCP" to see available MCP commands
   - Look for Firecrawl-related options

3. **Test with Chat Interface**
   - Open the chat interface (Ctrl+Alt+I or Cmd+Alt+I)
   - Try a web scraping request:
     ```
     Can you scrape https://httpbin.org/json and show me the content?
     ```

### Expected Output

VS Code should prompt you for your Firecrawl API key (if using one-click install) and then provide access to Firecrawl tools through the chat interface.

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
| **One-click install fails** | Use manual configuration method |
| **Server not connecting** | Check JSON syntax and restart VS Code |
| **API key errors** | Verify API key format and validity |
| **Tools not available** | Check MCP configuration and restart VS Code |
| **Permission errors** | Ensure proper Node.js/npm permissions |

### Configuration Validation

1. **Check JSON syntax**:
   - Use VS Code's built-in JSON validation
   - Ensure proper quotes, commas, and brackets

2. **Verify MCP extension**:
   - Ensure VS Code has MCP support built-in
   - Check VS Code version (latest recommended)

3. **Test npx access**:
```bash
npx -y firecrawl-mcp@latest --help
```

### Debug Mode

Enable debug logging:

1. **Set environment variable** before launching VS Code:
```bash
# macOS/Linux
export DEBUG=firecrawl-mcp:*
code .

# Windows
set DEBUG=firecrawl-mcp:*
code.exe
```

2. **Check VS Code logs**:
   - Help > Toggle Developer Tools
   - Look at console for MCP-related messages

## Integration Examples

### Chat Interface Usage

```
Can you scrape the latest blog posts from https://example.com/blog and summarize them for me?
```

### Code Generation

```
Generate a Python script that uses Firecrawl to scrape product information from an e-commerce page.
```

### Data Analysis

```
Scrape the latest blog posts from https://example.com, extract the titles and dates, and create a summary of trending topics.
```

## Performance Tips

1. **Workspace vs User Settings**: Use workspace settings for project-specific configurations
2. **Remote vs Local**: Use remote servers for team environments, local for individual use
3. **Latest Package**: Always use `firecrawl-mcp@latest` for the latest features
4. **Environment Variables**: Use environment variables for sensitive configuration
5. **Server Type**: Choose `stdio` for local development, `http` for remote deployments

## Support

- **Documentation**: [Firecrawl Docs](https://docs.firecrawl.dev)
- **VS Code MCP Documentation**: [VS Code MCP Servers](https://code.visualstudio.com/docs/copilot/chat/mcp-servers)
- **API Key Issues**: [Firecrawl API Dashboard](https://www.firecrawl.dev/app/api-keys)
- **VS Code Issues**: [VS Code GitHub Issues](https://github.com/microsoft/vscode/issues)

## Environment-Specific Notes

- VS Code has built-in MCP support (no extension required)
- One-click installation uses VS Code's deeplink system
- Modern MCP configuration uses `"mcp"` root with `"servers"` object
- Server types: `"stdio"` for local, `"http"` for remote connections
- Remote server support enables enterprise deployments
- Self-hosted instances work with both connection types
- Configuration can be global (user settings) or project-specific (workspace settings)

---

**Environment Compatibility**: ✅ Verified
**Last Tested**: September 2024
**Firecrawl MCP Version**: Latest
**VS Code Version**: Latest (with built-in MCP support)