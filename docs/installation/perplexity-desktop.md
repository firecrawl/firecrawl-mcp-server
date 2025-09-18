# Perplexity Desktop

## Overview

Perplexity Desktop is a powerful AI research assistant that supports MCP (Model Context Protocol) servers, enabling Firecrawl's web scraping capabilities directly within your research workflow. Perplexity provides an easy-to-use connector system for adding MCP servers through its advanced configuration options.

## Prerequisites

- Perplexity Desktop installed
- Firecrawl API Key
- Node.js 18+ (for npx)

## Installation

### Quick Install

1. **Get Firecrawl API Key**
   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Configure in Perplexity**
   - Navigate `Perplexity` > `Settings` > `Connectors`
   - Click `Add Connector` > `Advanced`
   - Add Firecrawl MCP configuration (see below)

### Step-by-Step

1. **Get Firecrawl API Key**
   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Open Perplexity Settings**
   - Launch Perplexity Desktop
   - Navigate to `Perplexity` > `Settings`

3. **Access Connectors**
   - Select `Connectors` from the settings menu
   - Click `Add Connector` to add a new MCP server

4. **Configure Advanced Connector**
   - Select `Advanced` option
   - Enter Server Name: `Firecrawl`
   - Paste the configuration JSON (see below)
   - Click `Save` to apply changes

## Configuration

See [Local and Remote MCPs for Perplexity](https://www.perplexity.ai/help-center/en/articles/11502712-local-and-remote-mcps-for-perplexity) for more information.

### Perplexity Desktop Standard Configuration

```json
{
  "args": ["-y", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"],
  "command": "npx",
  "env": {}
}
```

### Perplexity Desktop Configuration with Environment Variables

```json
{
  "args": ["-y", "firecrawl-mcp"],
  "command": "npx",
  "env": {
    "FIRECRAWL_API_KEY": "fc-your-api-key-here",
    "FIRECRAWL_RETRY_MAX_ATTEMPTS": "5",
    "FIRECRAWL_RETRY_INITIAL_DELAY": "2000",
    "FIRECRAWL_RETRY_MAX_DELAY": "30000",
    "FIRECRAWL_CREDIT_WARNING_THRESHOLD": "2000",
    "FIRECRAWL_CREDIT_CRITICAL_THRESHOLD": "500"
  }
}
```

### Perplexity Desktop Configuration for Self-Hosted Instance

```json
{
  "args": ["-y", "firecrawl-mcp", "--api-key", "your-self-hosted-key"],
  "command": "npx",
  "env": {
    "FIRECRAWL_API_URL": "https://your-firecrawl-instance.com"
  }
}
```

### Perplexity Desktop Configuration with Custom Arguments

```json
{
  "args": [
    "-y",
    "firecrawl-mcp",
    "--api-key",
    "fc-your-api-key-here",
    "--retry-max-attempts",
    "10",
    "--retry-initial-delay",
    "500"
  ],
  "command": "npx",
  "env": {}
}
```

### Perplexity Desktop Configuration with Full Path

```json
{
  "args": ["-y", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"],
  "command": "/usr/local/bin/npx",
  "env": {}
}
```

### Perplexity Desktop Configuration with Development Settings

```json
{
  "args": ["./dist/index.js"],
  "command": "node",
  "env": {
    "FIRECRAWL_API_KEY": "fc-your-api-key-here",
    "NODE_ENV": "development"
  }
}
```

## Configuration UI Location

**Perplexity Settings**:
- Navigate to `Perplexity` > `Settings`
- Select `Connectors` from the menu
- Click `Add Connector` to create a new connection
- Select `Advanced` for MCP server configuration
- Enter Server Name (e.g., "Firecrawl")
- Paste JSON configuration in the text area
- Click `Save` to apply changes

**Advanced Configuration**:
- The Advanced option allows full JSON configuration
- Supports custom commands, arguments, and environment variables
- Configuration is applied immediately after saving
- Multiple connectors can be added simultaneously

## Verification

### Test Installation

1. **Open Perplexity Desktop**
   - Launch Perplexity Desktop application
   - Ensure you're using the latest version

2. **Check Configuration**
   - Navigate to `Perplexity` > `Settings` > `Connectors`
   - Verify Firecrawl MCP appears in the connectors list
   - Check that the connector is enabled

3. **Test with Perplexity Chat**
   - Use Perplexity with a web scraping request:
     ```
     Can you scrape https://httpbin.org/json and show me the content?
     ```

4. **Check Available Tools**
   Perplexity Desktop should have access to:
   - `firecrawl_scrape`
   - `firecrawl_search`
   - `firecrawl_map`
   - `firecrawl_crawl`
   - `firecrawl_extract`
   - `firecrawl_batch_scrape`

### Test Web Scraping Capabilities

Try various web scraping requests to verify functionality:

```
Scrape the main content from https://example.com and summarize it
```

```
Search for recent AI research papers and extract their titles and dates
```

```
Go to https://httpbin.org/json and extract all the data fields
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
| **Configuration not saving** | Check JSON syntax and Perplexity permissions |
| **API key rejected** | Verify API key format and validity |
| **Server not connecting** | Check npx and Node.js installation |
| **Tools not available** | Restart Perplexity and check connector settings |
| **Command execution fails** | Ensure Node.js 18+ is installed and accessible |

### Configuration Issues

1. **JSON Configuration**:
   - Ensure valid JSON syntax with proper commas and quotes
   - Configuration must include `args`, `command`, and `env` fields
   - `args` should be an array of command-line arguments
   - `env` should be an object (can be empty `{}`)

2. **API Key Format**:
   - Use `--api-key fc-your-api-key-here` in args array
   - Or use `FIRECRAWL_API_KEY` in env object
   - Ensure API key starts with `fc-` and is valid

3. **Command Structure**:
   - `command` should be "npx" (or full path to npx/node)
   - `args` should be an array with the package and arguments
   - Use `-y` flag for automatic yes to prompts

4. **Environment Variables**:
   - Use `env` object for environment variable configuration
   - Environment variables take precedence over command-line arguments
   - Self-hosted instances require `FIRECRAWL_API_URL`

### Perplexity-Specific Issues

1. **Connector Management**:
   - Ensure connector is properly saved and enabled
   - Check if multiple connectors are conflicting
   - Verify connector name is unique and descriptive

2. **Version Compatibility**:
   - Ensure Perplexity Desktop supports MCP servers
   - Check Perplexity documentation for MCP feature availability
   - Update to latest Perplexity version if needed

3. **Permission Issues**:
   - Ensure Perplexity has permission to execute commands
   - Check system security settings for external command execution
   - Verify Node.js/npx is accessible to Perplexity

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

# Test with custom arguments
npx -y firecrawl-mcp --api-key fc-your-api-key-here --retry-max-attempts 10
```

## Advanced Configuration

### Custom Retry Settings

```json
{
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
  ],
  "command": "npx",
  "env": {}
}
```

### Proxy Configuration

```json
{
  "args": ["-y", "firecrawl-mcp"],
  "command": "npx",
  "env": {
    "FIRECRAWL_API_KEY": "fc-your-api-key-here",
    "HTTP_PROXY": "http://proxy.company.com:8080",
    "HTTPS_PROXY": "http://proxy.company.com:8080"
  }
}
```

### Credit Monitoring

```json
{
  "args": ["-y", "firecrawl-mcp"],
  "command": "npx",
  "env": {
    "FIRECRAWL_API_KEY": "fc-your-api-key-here",
    "FIRECRAWL_CREDIT_WARNING_THRESHOLD": "5000",
    "FIRECRAWL_CREDIT_CRITICAL_THRESHOLD": "1000"
  }
}
```

### Development Configuration

```json
{
  "args": ["./dist/index.js"],
  "command": "node",
  "env": {
    "FIRECRAWL_API_KEY": "fc-your-api-key-here",
    "NODE_ENV": "development",
    "DEBUG": "firecrawl-mcp:*"
  },
  "cwd": "/path/to/firecrawl-mcp-server"
}
```

### Self-Hosted with Custom Settings

```json
{
  "args": ["-y", "firecrawl-mcp", "--api-key", "your-self-hosted-key"],
  "command": "npx",
  "env": {
    "FIRECRAWL_API_URL": "https://your-firecrawl-instance.com",
    "FIRECRAWL_TIMEOUT": "30000",
    "FIRECRAWL_MAX_CONTENT_LENGTH": "10000000"
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

### Competitive Analysis

```
Analyze the pricing and features of competing products on https://competitor.com
```

### Code Generation

```
Generate a function that uses Firecrawl to scrape and process data from a news website.
```

### Market Research

```
Research the latest trends in AI technology by scraping recent articles and reports
```

## Performance Tips

1. **Environment Variables**: Use `env` object for sensitive configuration and advanced settings
2. **Latest Version**: Always use latest Firecrawl MCP version for best features
3. **Node.js Update**: Ensure Node.js 18+ is installed and updated
4. **Perplexity Restart**: Some configuration changes may require Perplexity restart
5. **API Key Security**: Consider using environment variables instead of command-line arguments
6. **Retry Configuration**: Adjust retry settings based on your network conditions and usage patterns

## Perplexity-Specific Features

### Research-Focused AI Assistant
- Designed specifically for research and information gathering
- Enhanced capabilities for academic and professional research
- Integration with web search and knowledge base

### Advanced Connector System
- Easy-to-use connector management through settings
- Advanced configuration options for technical users
- Support for multiple simultaneous connectors
- Real-time connector status monitoring

### Intelligent Web Integration
- Seamless integration with web search capabilities
- Enhanced research workflows with web scraping tools
- Context-aware tool suggestions and usage
- Intelligent information synthesis

### Professional Research Workflows
- Academic research support with citation generation
- Market research and competitive analysis capabilities
- Technical documentation extraction and processing
- Automated research report generation

## Support

- **Perplexity Documentation**: [Local and Remote MCPs for Perplexity](https://www.perplexity.ai/help-center/en/articles/11502712-local-and-remote-mcps-for-perplexity)
- **Firecrawl Documentation**: [Firecrawl Docs](https://docs.firecrawl.dev)
- **API Key Issues**: [Firecrawl API Dashboard](https://www.firecrawl.dev/app/api-keys)
- **Perplexity Support**: [Perplexity Help Center](https://www.perplexity.ai/help-center)

## Environment-Specific Notes

- Perplexity uses a connector-based configuration system
- Configuration is managed through `Perplexity` > `Settings` > `Connectors`
- Advanced option allows full JSON configuration
- Local server connections only (npx-based execution)
- Environment variables supported through JSON object format
- Self-hosted instances supported through environment variables
- Research-focused AI assistant with enhanced web capabilities
- Professional research workflows and academic support
- Multiple simultaneous connector support
- Real-time status monitoring and management
- Advanced configuration options for technical users
- Intelligent information synthesis and context-aware tool usage
- Integration with web search and knowledge base capabilities
- Designed for academic and professional research applications

---

**Environment Compatibility**: ✅ Verified
**Last Tested**: September 2024
**Firecrawl MCP Version**: Latest
**Perplexity Desktop Version**: Latest (with MCP support)
**Requirements**: Desktop application with MCP connector support