# Copilot Coding Agent

## Overview

GitHub Copilot Coding Agent is an AI-powered coding assistant that supports MCP (Model Context Protocol) servers, enabling Firecrawl's web scraping capabilities to enhance your coding workflow within GitHub's ecosystem.

## Prerequisites

- GitHub Copilot Coding Agent access
- Firecrawl API Key
- GitHub Enterprise Cloud account (for MCP support)

## Installation

### Quick Install

1. **Get Firecrawl API Key**
   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Configure in Copilot**
   - Navigate to Repository->Settings->Copilot->Coding agent->MCP configuration
   - Add Firecrawl MCP configuration (see below)

### Step-by-Step

1. **Get Firecrawl API Key**
   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Access Copilot Settings**
   - Navigate to your GitHub repository
   - Go to `Settings` > `Copilot` > `Coding agent` > `MCP configuration`

3. **Add MCP Server**
   - Locate the `mcp` section in your configuration
   - Add the Firecrawl MCP server configuration (see below)

4. **Save Configuration**
   - Save the changes to apply the MCP server configuration

## Configuration

Add the following configuration to the `mcp` section of your Copilot Coding Agent configuration file Repository->Settings->Copilot->Coding agent->MCP configuration:

### Copilot Coding Agent Remote Server Configuration (Recommended)

```json
{
  "mcpServers": {
    "firecrawl": {
      "type": "http",
      "url": "https://api.firecrawl.dev/mcp",
      "headers": {
        "FIRECRAWL_API_KEY": "fc-your-api-key-here"
      },
      "tools": [
        "firecrawl_scrape",
        "firecrawl_search",
        "firecrawl_map",
        "firecrawl_crawl",
        "firecrawl_extract",
        "firecrawl_batch_scrape"
      ]
    }
  }
}
```

### Copilot Coding Agent Configuration with Additional Headers

```json
{
  "mcpServers": {
    "firecrawl": {
      "type": "http",
      "url": "https://api.firecrawl.dev/mcp",
      "headers": {
        "FIRECRAWL_API_KEY": "fc-your-api-key-here",
        "X-Retry-Max-Attempts": "5",
        "X-Credit-Warning-Threshold": "2000",
        "X-Client-ID": "copilot-coding-agent"
      },
      "tools": [
        "firecrawl_scrape",
        "firecrawl_search",
        "firecrawl_map",
        "firecrawl_crawl",
        "firecrawl_extract",
        "firecrawl_batch_scrape"
      ]
    }
  }
}
```

### Copilot Coding Agent Configuration for Self-Hosted Instance

```json
{
  "mcpServers": {
    "firecrawl": {
      "type": "http",
      "url": "https://your-firecrawl-instance.com/mcp",
      "headers": {
        "FIRECRAWL_API_KEY": "your-self-hosted-key"
      },
      "tools": [
        "firecrawl_scrape",
        "firecrawl_search",
        "firecrawl_map",
        "firecrawl_crawl",
        "firecrawl_extract",
        "firecrawl_batch_scrape"
      ]
    }
  }
}
```

### Copilot Coding Agent Configuration with Limited Tools

```json
{
  "mcpServers": {
    "firecrawl": {
      "type": "http",
      "url": "https://api.firecrawl.dev/mcp",
      "headers": {
        "FIRECRAWL_API_KEY": "fc-your-api-key-here"
      },
      "tools": [
        "firecrawl_scrape",
        "firecrawl_search",
        "firecrawl_extract"
      ]
    }
  }
}
```

## Configuration UI Location

**Copilot Coding Agent Settings**:
- Navigate to your GitHub repository
- Go to `Settings` > `Copilot` > `Coding agent` > `MCP configuration`
- Configuration is managed through GitHub's web interface
- The `mcp` section should contain your MCP server configurations
- Save changes to apply the configuration

## Available Tools

You can specify which Firecrawl tools to make available to Copilot Coding Agent:

- `firecrawl_scrape` - Single page scraping
- `firecrawl_search` - Web search
- `firecrawl_map` - URL discovery
- `firecrawl_crawl` - Multi-page crawling
- `firecrawl_extract` - Structured data extraction
- `firecrawl_batch_scrape` - Multiple URL scraping

## Verification

### Test Installation

1. **Access Copilot Coding Agent**
   - Navigate to your GitHub repository with Copilot Coding Agent enabled
   - Ensure you have the necessary permissions to configure MCP servers

2. **Check Configuration**
   - Go to `Settings` > `Copilot` > `Coding agent` > `MCP configuration`
   - Verify Firecrawl MCP appears in the configured servers list
   - Ensure the `mcp` section is properly formatted

3. **Test with Copilot**
   - Use Copilot Coding Agent in your development environment
   - Try a web scraping request:
     ```
     Can you scrape https://httpbin.org/json and show me the content?
     ```

4. **Check Available Tools**
   Copilot Coding Agent should have access to the Firecrawl tools you specified:
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
| **Configuration not saving** | Check GitHub permissions and repository settings |
| **API key rejected** | Verify FIRECRAWL_API_KEY header format |
| **Server not connecting** | Check URL and API key format |
| **Tools not available** | Verify tools array includes desired Firecrawl tools |
| **Copilot access issues** | Ensure GitHub Copilot Coding Agent is enabled |

### Configuration Issues

1. **GitHub Enterprise Requirements**:
   - MCP servers require GitHub Enterprise Cloud
   - Ensure your organization has the necessary Copilot features enabled
   - Verify you have administrative permissions for repository settings

2. **JSON Configuration**:
   - Ensure valid JSON syntax with proper commas and quotes
   - Configuration must be in the `mcp` section
   - Required fields: `type`, `url`, `headers`, `tools`

3. **API Key Format**:
   - Use `FIRECRAWL_API_KEY` in headers object
   - Ensure API key is valid and not expired
   - Check for proper header formatting

4. **Tools Array**:
   - Specify which Firecrawl tools to make available
   - Use exact tool names as listed above
   - Empty array or missing tools field may enable all tools

### GitHub-Specific Issues

1. **Repository Permissions**:
   - Ensure you have admin access to the repository
   - Verify Copilot Coding Agent is enabled for the repository
   - Check organization-level Copilot settings

2. **Enterprise Cloud Features**:
   - MCP servers require GitHub Enterprise Cloud
   - Verify your organization is on Enterprise Cloud plan
   - Check if MCP servers are enabled in organization settings

### Debug Mode

Enable debug logging:

```bash
# Test remote connection manually
curl -H "FIRECRAWL_API_KEY: fc-your-api-key-here" https://api.firecrawl.dev/mcp

# Test with additional headers
curl -H "FIRECRAWL_API_KEY: fc-your-api-key-here" -H "X-Client-ID: copilot-coding-agent" https://api.firecrawl.dev/mcp
```

## Advanced Configuration

### Custom Retry Settings

```json
{
  "mcpServers": {
    "firecrawl": {
      "type": "http",
      "url": "https://api.firecrawl.dev/mcp",
      "headers": {
        "FIRECRAWL_API_KEY": "fc-your-api-key-here",
        "X-Retry-Max-Attempts": "10",
        "X-Retry-Initial-Delay": "500",
        "X-Retry-Max-Delay": "60000"
      },
      "tools": [
        "firecrawl_scrape",
        "firecrawl_search",
        "firecrawl_map",
        "firecrawl_crawl",
        "firecrawl_extract",
        "firecrawl_batch_scrape"
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
      "type": "http",
      "url": "https://api.firecrawl.dev/mcp",
      "headers": {
        "FIRECRAWL_API_KEY": "fc-your-api-key-here",
        "X-Proxy-URL": "http://proxy.company.com:8080"
      },
      "tools": [
        "firecrawl_scrape",
        "firecrawl_search",
        "firecrawl_map",
        "firecrawl_crawl",
        "firecrawl_extract",
        "firecrawl_batch_scrape"
      ]
    }
  }
}
```

### Credit Monitoring

```json
{
  "headers": {
    "FIRECRAWL_API_KEY": "fc-your-api-key-here",
    "X-Credit-Warning-Threshold": "5000",
    "X-Credit-Critical-Threshold": "1000"
  }
}
```

### Selective Tool Access

```json
{
  "mcpServers": {
    "firecrawl": {
      "type": "http",
      "url": "https://api.firecrawl.dev/mcp",
      "headers": {
        "FIRECRAWL_API_KEY": "fc-your-api-key-here"
      },
      "tools": [
        "firecrawl_scrape",
        "firecrawl_extract"
      ]
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

1. **Tool Selection**: Only include necessary tools in the `tools` array
2. **Remote Connection**: Use HTTP type for optimal performance with Copilot
3. **Header Management**: Use custom headers for additional configuration
4. **GitHub Enterprise**: Ensure you're on GitHub Enterprise Cloud for MCP support
5. **Repository Settings**: Verify repository-level Copilot settings are properly configured

## GitHub Integration Benefits

- **Enterprise Ready**: Designed for GitHub Enterprise Cloud environments
- **Repository-Level Configuration**: Configure MCP servers per repository
- **Collaborative Development**: Share MCP configurations across team members
- **GitHub Ecosystem**: Seamless integration with GitHub's development tools
- **Security**: Enterprise-grade security and access controls
- **Scalability**: Built for enterprise-scale development teams

## Support

- **GitHub Documentation**: [Extending Copilot Coding Agent with MCP](https://docs.github.com/en/enterprise-cloud@latest/copilot/how-tos/agents/copilot-coding-agent/extending-copilot-coding-agent-with-mcp)
- **Firecrawl Documentation**: [Firecrawl Docs](https://docs.firecrawl.dev)
- **API Key Issues**: [Firecrawl API Dashboard](https://www.firecrawl.dev/app/api-keys)
- **GitHub Support**: [GitHub Enterprise Support](https://support.github.com/)

## Environment-Specific Notes

- Copilot Coding Agent requires GitHub Enterprise Cloud
- Configuration is managed through GitHub's web interface
- Repository-level MCP server configuration
- HTTP-only connections (no local server support)
- Selective tool availability through `tools` array
- Enterprise-grade security and access controls
- Integration with GitHub's development ecosystem
- Designed for collaborative development teams
- Requires administrative repository permissions
- Custom headers support for advanced configuration
- Self-hosted instances supported through custom URLs
- Organization-level Copilot settings may affect availability

---

**Environment Compatibility**: ✅ Verified
**Last Tested**: September 2024
**Firecrawl MCP Version**: Latest
**GitHub Copilot Coding Agent Version**: Latest (with MCP support)
**Requirements**: GitHub Enterprise Cloud