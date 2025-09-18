# Smithery

## Overview

Smithery is a platform that provides universal MCP server installation across all compatible clients. Firecrawl MCP can be installed via Smithery for easy setup with any MCP-compatible environment.

## Prerequisites

- Smithery CLI
- Firecrawl API Key
- Smithery Key (from Smithery.ai)
- Node.js 18+ (for npx)

## Installation

### Quick Install - Universal Client Support

```bash
npx -y @smithery/cli@latest install @mendableai/mcp-server-firecrawl --client <CLIENT_NAME> --key <YOUR_SMITHERY_KEY>
```

### Step-by-Step

1. **Get Your Smithery Key**
   - Visit [Smithery.ai](https://smithery.ai/server/@mendableai/mcp-server-firecrawl)
   - Find your Smithery key for the Firecrawl MCP server

2. **Get Firecrawl API Key**
   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

3. **Install via Smithery**
   ```bash
   npx -y @smithery/cli@latest install @mendableai/mcp-server-firecrawl --client <CLIENT_NAME> --key <YOUR_SMITHERY_KEY>
   ```

   Replace `<CLIENT_NAME>` with your preferred MCP client.

4. **Configure API Key**
   - Smithery will configure the MCP server, but you'll need to add your Firecrawl API key
   - Edit your client's configuration file to include the API key

## Supported Clients

Smithery supports installation for various MCP clients:

```bash
# Common client examples
npx -y @smithery/cli@latest install @mendableai/mcp-server-firecrawl --client claude --key <YOUR_SMITHERY_KEY>
npx -y @smithery/cli@latest install @mendableai/mcp-server-firecrawl --client cursor --key <YOUR_SMITHERY_KEY>
npx -y @smithery/cli@latest install @mendableai/mcp-server-firecrawl --client vscode --key <YOUR_SMITHERY_KEY>
```

## Configuration

### Post-Installation Setup

After Smithery installation, you'll need to add your Firecrawl API key to the configuration:

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):
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

**Cursor** (`~/.cursor/mcp.json`):
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

### Advanced Configuration

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

## Verification

### Test Installation

1. **Restart Your MCP Client**
   - Close and reopen your MCP client completely

2. **Check MCP Server**
   - Verify the Firecrawl server appears in your client's MCP server list
   - Try a web scraping request:
     ```
     Can you scrape https://httpbin.org/json and show me the content?
     ```

3. **Verify Tools Available**
   Your client should have access to:
   - `firecrawl_scrape`
   - `firecrawl_search`
   - `firecrawl_map`
   - `firecrawl_crawl`
   - `firecrawl_extract`

### Expected Output

```
I'll scrape that website for you.

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
| **Smithery key not found** | Check Smithery.ai for the correct server page |
| **Installation fails** | Ensure you're using the latest Smithery CLI |
| **API key missing** | Add Firecrawl API key post-installation |
| **Client not supported** | Check if your client is supported by Smithery |

### Smithery CLI Issues

1. **Check Smithery CLI installation**:
```bash
npx @smithery/cli@latest --version
```

2. **Install/update Smithery CLI**:
```bash
npx @smithery/cli@latest --help
```

3. **Find supported clients**:
```bash
npx @smithery/cli@latest install --help
```

### Configuration Issues

1. **Verify Smithery configuration**:
   - Check that the MCP server was added to your client
   - Ensure the server name is correct (usually "firecrawl")

2. **Add Firecrawl API key**:
   - Smithery sets up the server structure but doesn't handle Firecrawl API keys
   - You'll need to manually add your Firecrawl API key to the configuration

### Alternative Installation Methods

If Smithery installation fails, consider:

1. **Direct client installation** (see specific client guides)
2. **Manual npx installation** (see [NPX guide](npx.md))
3. **Client-specific configuration** (see individual environment guides)

## Smithery CLI Commands

### Common Commands

```bash
# Install a server for any client
npx -y @smithery/cli@latest install [package-name] --client [client-name] --key [smithery-key]

# List installed servers
npx -y @smithery/cli@latest list

# Remove a server
npx -y @smithery/cli@latest remove [server-name]

# Update a server
npx -y @smithery/cli@latest update [server-name]

# Get help
npx -y @smithery/cli@latest --help
```

### Firecrawl-Specific Commands

```bash
# Install for Claude Desktop
npx -y @smithery/cli@latest install @mendableai/mcp-server-firecrawl --client claude --key <YOUR_SMITHERY_KEY>

# Install for Cursor
npx -y @smithery/cli@latest install @mendableai/mcp-server-firecrawl --client cursor --key <YOUR_SMITHERY_KEY>

# Install for VS Code
npx -y @smithery/cli@latest install @mendableai/mcp-server-firecrawl --client vscode --key <YOUR_SMITHERY_KEY>

# List Smithery-managed servers
npx -y @smithery/cli@latest list

# Remove Firecrawl MCP server
npx -y @smithery/cli@latest remove @mendableai/mcp-server-firecrawl
```

## Integration Examples

### Basic Usage in Any MCP Client

```
Can you scrape the latest blog posts from https://example.com/blog and summarize them for me?
```

### Advanced Web Scraping

```
Search for recent AI research papers, extract the titles and publication dates, and create a summary of the trends.
```

### Data Extraction

```
Go to https://example.com/products and extract all product names and prices into a structured format.
```

## Support

- **Smithery Documentation**: [Smithery.ai](https://smithery.ai)
- **Smithery CLI**: [npm package](https://www.npmjs.com/package/@smithery/cli)
- **Firecrawl Documentation**: [Firecrawl Docs](https://docs.firecrawl.dev)
- **API Key Issues**: [Firecrawl API Dashboard](https://www.firecrawl.dev/app/api-keys)
- **MCP Client Support**: Check individual client documentation

## Environment-Specific Notes

- Smithery provides universal MCP server installation across all compatible clients
- Requires both Smithery key and Firecrawl API key
- Smithery handles the server setup, but you'll need to add your Firecrawl API key manually
- Supports the latest MCP clients and platforms
- Consider using direct installation methods for better control over configuration
- Smithery is ideal for users who manage multiple MCP servers across different clients

---

**Environment Compatibility**: ✅ Verified
**Last Tested**: September 2024
**Firecrawl MCP Version**: Latest
**Smithery CLI Version**: Latest
**Note**: Smithery provides universal installation across all MCP clients. You'll need both a Smithery key and Firecrawl API key.