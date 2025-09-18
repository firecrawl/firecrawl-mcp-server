# BoltAI

## Overview

BoltAI is a modern AI assistant application that supports MCP (Model Context Protocol) servers, enabling Firecrawl's web scraping capabilities directly within your AI workflow. BoltAI provides a user-friendly interface for configuring and managing MCP servers through its plugins system.

## Prerequisites

- BoltAI installed (desktop or iOS version)
- Firecrawl API Key
- Node.js 18+ (for npx)

## Installation

### Quick Install

1. **Get Firecrawl API Key**
   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Configure in BoltAI**
   - Open BoltAI and navigate to "Settings" > "Plugins"
   - Add the Firecrawl MCP configuration (see below)

### Step-by-Step

1. **Get Firecrawl API Key**
   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Open BoltAI Settings**
   - Launch BoltAI application
   - Navigate to "Settings" page
   - Click on "Plugins" section

3. **Add MCP Server**
   - Enter the Firecrawl MCP configuration JSON (see below)
   - Save the configuration to apply changes

4. **Test Installation**
   - Use `get-library-docs` command to test the connection
   - Try a web scraping request to verify functionality

## Configuration

Open the "Settings" page of the app, navigate to "Plugins," and enter the following JSON:

### BoltAI Standard Configuration

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

### BoltAI Configuration with Environment Variables

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

### BoltAI Configuration for Self-Hosted Instance

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

### BoltAI Configuration with Custom Arguments

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": [
        "-y",
        "firecrawl-mcp",
        "--api-key",
        "fc-your-api-key-here",
        "--retry-max-attempts",
        "10",
        "--retry-initial-delay",
        "500"
      ]
    }
  }
}
```

### BoltAI Configuration with Full Path

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "/usr/local/bin/npx",
      "args": ["-y", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"]
    }
  }
}
```

## Configuration UI Location

**BoltAI Settings**:
- Navigate to "Settings" > "Plugins"
- Configuration is managed through a JSON editor
- Click "Save" to apply changes
- Configuration is applied immediately after saving

**iOS Version Support**:
- BoltAI on iOS also supports MCP servers
- Configuration is similar to desktop version
- See [BoltAI iOS MCP Guide](https://docs.boltai.com/docs/boltai-mobile/mcp-servers) for details

## Verification

### Test Installation

1. **Open BoltAI**
   - Launch BoltAI application
   - Ensure you're using the latest version

2. **Check Configuration**
   - Navigate to "Settings" > "Plugins"
   - Verify Firecrawl MCP appears in the configuration
   - Check that the JSON is valid and saved

3. **Test with BoltAI Chat**
   - Try a web scraping request:
     ```
     Can you scrape https://httpbin.org/json and show me the content?
     ```

4. **Check Available Tools**
   BoltAI should have access to:
   - `firecrawl_scrape`
   - `firecrawl_search`
   - `firecrawl_map`
   - `firecrawl_crawl`
   - `firecrawl_extract`
   - `firecrawl_batch_scrape`

### Test Library Documentation (Context7 Feature)

Once saved, enter in the chat `get-library-docs` followed by your documentation ID. For Firecrawl, you can test web scraping capabilities:

```
get-library-docs https://docs.firecrawl.dev
```

Or try a direct web scraping request:

```
Scrape the content from https://httpbin.org/json and extract the data
```

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
| **Configuration not saving** | Check JSON syntax and BoltAI permissions |
| **API key rejected** | Verify API key format and validity |
| **Server not connecting** | Check npx and Node.js installation |
| **Tools not available** | Restart BoltAI and check plugin configuration |
| **Command execution fails** | Ensure Node.js 18+ is installed and accessible |

### Configuration Issues

1. **JSON Configuration**:
   - Ensure valid JSON syntax with proper commas and quotes
   - Configuration must include `mcpServers` object
   - Server configuration must have `command` and `args`

2. **API Key Format**:
   - Use `--api-key fc-your-api-key-here` in args array
   - Or use environment variables for better security
   - Ensure API key starts with `fc-` and is valid

3. **Command Structure**:
   - Must specify both `command` and `args`
   - `command` should be "npx" (or full path to npx)
   - `args` should be an array of command-line arguments

4. **Node.js Issues**:
   - Ensure Node.js 18+ is installed
   - Verify npx is available in PATH
   - Use full path to npx if necessary

### Platform-Specific Issues

**Desktop Version**:
- Ensure sufficient permissions for plugin installation
- Check if BoltAI is up to date
- Verify system has required Node.js version

**iOS Version**:
- iOS support may have limitations
- Check iOS-specific documentation
- Some features may be different from desktop version

### Debug Mode

Enable debug logging:

```bash
# Set debug environment variable
export DEBUG=firecrawl-mcp:*

# Test local server manually
npx -y firecrawl-mcp --api-key fc-your-api-key-here

# Test with environment variables
env FIRECRAWL_API_KEY=fc-your-api-key-here npx -y firecrawl-mcp

# Test Node.js and npx
node --version
npx --version
```

## Advanced Configuration

### Custom Retry Settings

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": [
        "-y",
        "firecrawl-mcp",
        "--api-key",
        "fc-your-api-key-here",
        "--retry-max-attempts",
        "10",
        "--retry-initial-delay",
        "500",
        "--retry-max-delay",
        "60000",
        "--retry-backoff-factor",
        "2"
      ]
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
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "fc-your-api-key-here",
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
  "mcpServers": {
    "firecrawl": {
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

### Development Configuration

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "node",
      "args": ["./dist/index.js"],
      "env": {
        "FIRECRAWL_API_KEY": "fc-your-api-key-here",
        "NODE_ENV": "development"
      },
      "cwd": "/path/to/firecrawl-mcp-server"
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

### Library Documentation Access

```
get-library-docs https://docs.firecrawl.dev
```

## Performance Tips

1. **Environment Variables**: Use `env` object for sensitive configuration
2. **Latest Version**: Always use latest Firecrawl MCP version for best features
3. **Node.js Update**: Ensure Node.js 18+ is installed and updated
4. **BoltAI Restart**: Some configuration changes may require BoltAI restart
5. **API Key Security**: Consider using environment variables instead of command-line arguments

## BoltAI-Specific Features

### Plugin-Based Configuration
- Easy configuration through JSON in plugins section
- Immediate application of configuration changes
- Support for multiple MCP servers simultaneously
- User-friendly interface for managing AI tools

### Cross-Platform Support
- Desktop version with full MCP server support
- iOS version with mobile-optimized MCP integration
- Consistent configuration across platforms
- Synchronized settings when available

### AI Assistant Integration
- Natural language commands for web scraping
- Seamless integration with BoltAI's AI capabilities
- Context-aware tool suggestions and usage
- Enhanced AI workflows with web data access

### Documentation Access
- Built-in `get-library-docs` command for accessing documentation
- Easy integration with external documentation sources
- Automated documentation processing and analysis
- Enhanced research capabilities

## Support

- **BoltAI Documentation**: [BoltAI MCP Servers](https://docs.boltai.com/docs/plugins/mcp-servers)
- **BoltAI iOS Documentation**: [BoltAI Mobile MCP Servers](https://docs.boltai.com/docs/boltai-mobile/mcp-servers)
- **Firecrawl Documentation**: [Firecrawl Docs](https://docs.firecrawl.dev)
- **API Key Issues**: [Firecrawl API Dashboard](https://www.firecrawl.dev/app/api-keys)
- **BoltAI Support**: [BoltAI Support Center](https://docs.boltai.com)

## Environment-Specific Notes

- BoltAI uses a plugin-based configuration system
- Configuration is managed through JSON in the Plugins section
- Both desktop and iOS versions support MCP servers
- Local server connections only (npx-based execution)
- Environment variables supported through JSON object format
- Self-hosted instances supported through environment variables
- Cross-platform support with consistent configuration
- AI assistant integration with natural language processing
- Built-in documentation access with `get-library-docs` command
- Plugin architecture for easy tool management
- User-friendly interface for non-technical users
- Immediate configuration application without restart requirements
- Mobile-optimized iOS version with full MCP support
- Enhanced AI workflows with web data integration capabilities

---

**Environment Compatibility**: ✅ Verified
**Last Tested**: September 2024
**Firecrawl MCP Version**: Latest
**BoltAI Version**: Latest (with MCP support)
**Requirements**: Desktop or iOS version