<div align="center">
  <a name="readme-top"></a>
  <img
    src="https://raw.githubusercontent.com/firecrawl/firecrawl-mcp-server/main/img/fire.png"
    height="140"
  >
</div>

# Firecrawl MCP Server

A Model Context Protocol (MCP) server implementation that integrates with [Firecrawl](https://github.com/firecrawl/firecrawl) for web scraping capabilities across 30+ development environments.

> Big thanks to [@vrknetha](https://github.com/vrknetha), [@knacklabs](https://www.knacklabs.ai) for the initial implementation!

[![Install with NPX in VS Code](https://img.shields.io/badge/VS_Code-NPM-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=firecrawl&inputs=%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22apiKey%22%2C%22description%22%3A%22Firecrawl%20API%20Key%22%2C%22password%22%3Atrue%7D%5D&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22firecrawl-mcp%22%5D%2C%22env%22%3A%7B%22FIRECRAWL_API_KEY%22%3A%22%24%7Binput%3AapiKey%7D%22%7D%7D) [![Install with NPX in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-NPM-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=firecrawl&inputs=%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22apiKey%22%2C%22description%22%3A%22Firecrawl%20API%20Key%22%2C%22password%22%3Atrue%7D%5D&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22firecrawl-mcp%22%5D%2C%22env%22%3A%7B%22FIRECRAWL_API_KEY%22%3A%22%24%7Binput%3AapiKey%7D%22%7D%7D&quality=insiders)

## Features

- 🔥 **Web scraping, crawling, and discovery** - Extract content from any website
- 🔍 **Search and content extraction** - Intelligent web search with content retrieval
- 🏃‍♂️ **Deep research and batch scraping** - Process multiple URLs efficiently
- 🔄 **Automatic retries and rate limiting** - Built-in resilience and throttling
- ☁️ **Cloud and self-hosted support** - Works with Firecrawl cloud or your own instance
- 📡 **SSE support** - Server-Sent Events for real-time communication
- 🛠️ **30+ Environment Support** - Works across IDEs, desktop apps, and CLI tools

> Play around with [our MCP Server on MCP.so's playground](https://mcp.so/playground?server=firecrawl-mcp-server) or on [Klavis AI](https://www.klavis.ai/mcp-servers).

## Quick Start

### Prerequisites

- **Node.js**: Version ≥18.0.0 (recommended ≥20)
- **Firecrawl API Key**: Get one from [firecrawl.dev](https://www.firecrawl.dev/)
- **API Key Format**: Must start with `fc-` prefix

### Running with npx (Recommended)

```bash
# Quick start with npx
env FIRECRAWL_API_KEY=fc-YOUR_API_KEY npx -y firecrawl-mcp

# Custom port
env FIRECRAWL_API_KEY=fc-YOUR_API_KEY npx -y firecrawl-mcp --port 8081
```

### Remote-Hosted Option (No Local Server Required)

```bash
# Use this URL in your MCP client configuration:
https://mcp.firecrawl.dev/fc-YOUR_API_KEY/v2/sse
```

### Manual Installation

```bash
# Install globally
npm install -g firecrawl-mcp

# Run with environment variable
env FIRECRAWL_API_KEY=fc-YOUR_API_KEY firecrawl-mcp
```

### Version Requirements

- **Minimum Server Version**: v1.2.1+
- **MCP Protocol**: Compatible with MCP specification 2024-11-05
- **Package Names**: 
  - Primary: `firecrawl-mcp`
  - Alternative: `@firecrawl/mcp-server`

## Installation & Configuration

This server supports **30+ development environments**. For detailed installation instructions for your specific environment, see our comprehensive [**INSTALLATION.md**](./INSTALLATION.md) guide.

### Supported Environments

#### IDEs and Editors
- [VS Code](./INSTALLATION.md#vs-code) - Microsoft's popular code editor
- [Cursor](./INSTALLATION.md#cursor) - AI-first code editor
- [JetBrains AI Assistant](./INSTALLATION.md#jetbrains-ai-assistant) - IntelliJ, PyCharm, etc.
- [Zed](./INSTALLATION.md#zed) - High-performance multiplayer editor
- [Visual Studio](./INSTALLATION.md#visual-studio) - Microsoft's IDE

#### Desktop Applications
- [Claude Desktop](./INSTALLATION.md#claude-desktop) - Anthropic's desktop app
- [Smithery](./INSTALLATION.md#smithery) - AI agent building platform
- [LM Studio](./INSTALLATION.md#lm-studio) - Local LLM serving
- [Perplexity Desktop](./INSTALLATION.md#perplexity-desktop) - AI search interface

#### Runtime Environments
- [Docker](./INSTALLATION.md#docker) - Containerized deployment
- [Node.js](./INSTALLATION.md#nodejs) - Native Node.js runtime
- [Bun](./INSTALLATION.md#bun) - Fast JavaScript runtime
- [Deno](./INSTALLATION.md#deno) - Modern TypeScript runtime
- [Windows](./INSTALLATION.md#windows) - Windows-specific setup

#### CLI Tools
- [cLine](./INSTALLATION.md#cline) - Command-line interface
- [Amazon Q Developer CLI](./INSTALLATION.md#amazon-q-developer-cli) - AWS AI assistant
- [Gemini CLI](./INSTALLATION.md#gemini-cli) - Google's AI CLI
- [RovoDev CLI](./INSTALLATION.md#rovodev-cli) - Developer productivity

#### Additional Environments
- [Augment Code](./INSTALLATION.md#augment-code) - AI code assistant
- [BoltAI](./INSTALLATION.md#boltai) - AI development tool
- [Claude Code](./INSTALLATION.md#claude-code) - Claude CLI app
- [Copilot Coding Agent](./INSTALLATION.md#copilot-coding-agent) - GitHub Copilot integration
- [Crush](./INSTALLATION.md#crush) - Development environment
- [Kiro](./INSTALLATION.md#kiro) - AI-powered IDE
- [Open Code](./INSTALLATION.md#open-code) - Open-source editor
- [OpenAI Codex](./INSTALLATION.md#openai-codex) - OpenAI integration
- [Qodo Gen](./INSTALLATION.md#qodo-gen) - Code generation tool
- [Roo Code](./INSTALLATION.md#roo-code) - AI coding assistant
- [Trae](./INSTALLATION.md#trae) - AI agent framework
- [Warp](./INSTALLATION.md#warp) - Modern terminal
- [Windsurf](./INSTALLATION.md#windsurf) - AI-powered IDE
- [Zencoder](./INSTALLATION.md#zencoder) - Development platform

## Quick Configuration Examples

### Cursor

For Cursor **v0.48.6+**:

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "fc-YOUR_API_KEY"
      }
    }
  }
}
```

### VS Code

Add to your User Settings (JSON):

```json
{
  "mcp": {
    "servers": {
      "firecrawl": {
        "command": "npx",
        "args": ["-y", "firecrawl-mcp"],
        "env": {
          "FIRECRAWL_API_KEY": "fc-YOUR_API_KEY"
        }
      }
    }
  }
}
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "fc-YOUR_API_KEY"
      }
    }
  }
}
```

### Windsurf

Add to your `./codeium/windsurf/model_config.json`:

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "fc-YOUR_API_KEY"
      }
    }
  }
}
```

### Docker

```bash
# Build and run with Docker
docker build --build-arg "FIRECRAWL_API_KEY=fc-your_api_key" -t firecrawl-mcp .
docker run -d -p 8080:8080 --name firecrawl-mcp firecrawl-mcp

# Test health
curl http://localhost:8080/health
```

## Advanced Configuration

### Environment Variables

#### Required for Cloud API

- `FIRECRAWL_API_KEY`: Your Firecrawl API key (must start with `fc-`)
- `FIRECRAWL_API_URL` (Optional): Custom API endpoint for self-hosted instances

#### Optional Configuration

##### Server Settings
- `PORT`: Server port (default: 8080)
- `SSE_LOCAL`: Enable local SSE mode (default: false)
- `SSE_PORT`: SSE port when in local mode (default: 3000)

##### Retry Configuration
- `FIRECRAWL_RETRY_MAX_ATTEMPTS`: Maximum retry attempts (default: 3)
- `FIRECRAWL_RETRY_INITIAL_DELAY`: Initial delay in ms (default: 1000)
- `FIRECRAWL_RETRY_MAX_DELAY`: Maximum delay in ms (default: 10000)
- `FIRECRAWL_RETRY_BACKOFF_FACTOR`: Exponential backoff multiplier (default: 2)

##### Credit Usage Monitoring
- `FIRECRAWL_CREDIT_WARNING_THRESHOLD`: Warning threshold (default: 1000)
- `FIRECRAWL_CREDIT_CRITICAL_THRESHOLD`: Critical threshold (default: 100)

### Server-Sent Events (SSE) Mode

Run with SSE for real-time communication:

```bash
# Local SSE mode
env SSE_LOCAL=true FIRECRAWL_API_KEY=fc-YOUR_API_KEY npx -y firecrawl-mcp

# Use the SSE endpoint
http://localhost:3000/sse
```

### Self-Hosted Firecrawl Instance

```bash
# Configure for self-hosted instance
export FIRECRAWL_API_URL=https://firecrawl.your-domain.com
export FIRECRAWL_API_KEY=fc-your_api_key  # If auth required

# Run with custom settings
npx -y firecrawl-mcp
```

## Available Tools

### How to Choose a Tool

Use this guide to select the right tool for your task:

- **If you know the exact URL(s) you want:**
  - For one: use **scrape**
  - For many: use **batch_scrape**
- **If you need to discover URLs on a site:** use **map**
- **If you want to search the web for info:** use **search**
- **If you want to extract structured data:** use **extract**
- **If you want to analyze a whole site or section:** use **crawl** (with limits!)

### Quick Reference Table

| Tool                | Best for                                 | Returns         |
|---------------------|------------------------------------------|-----------------|
| scrape              | Single page content                      | markdown/html   |
| batch_scrape        | Multiple known URLs                      | markdown/html[] |
| map                 | Discovering URLs on a site               | URL[]           |
| crawl               | Multi-page extraction (with limits)      | markdown/html[] |
| search              | Web search for info                      | results[]       |
| extract             | Structured data from pages               | JSON            |

### 1. Scrape Tool (`firecrawl_scrape`)

Scrape content from a single URL with advanced options.

**Best for:** Single page content extraction when you know exactly which page contains the information.

**Usage Example:**
```json
{
  "name": "firecrawl_scrape",
  "arguments": {
    "url": "https://example.com",
    "formats": ["markdown"],
    "onlyMainContent": true,
    "waitFor": 1000,
    "timeout": 30000
  }
}
```

### 2. Batch Scrape Tool (`firecrawl_batch_scrape`)

Scrape multiple URLs efficiently with built-in rate limiting.

**Best for:** Retrieving content from multiple pages when you know exactly which pages to scrape.

**Usage Example:**
```json
{
  "name": "firecrawl_batch_scrape",
  "arguments": {
    "urls": ["https://example1.com", "https://example2.com"],
    "options": {
      "formats": ["markdown"],
      "onlyMainContent": true
    }
  }
}
```

### 3. Map Tool (`firecrawl_map`)

Discover all indexed URLs on a website.

**Best for:** Discovering URLs on a website before deciding what to scrape.

**Usage Example:**
```json
{
  "name": "firecrawl_map",
  "arguments": {
    "url": "https://example.com"
  }
}
```

### 4. Search Tool (`firecrawl_search`)

Search the web and optionally extract content from results.

**Best for:** Finding specific information across multiple websites when you don't know which website has the information.

**Usage Example:**
```json
{
  "name": "firecrawl_search",
  "arguments": {
    "query": "latest AI research papers 2023",
    "limit": 5,
    "scrapeOptions": {
      "formats": ["markdown"],
      "onlyMainContent": true
    }
  }
}
```

### 5. Crawl Tool (`firecrawl_crawl`)

Start an asynchronous crawl job to extract content from multiple pages.

**Best for:** Extracting content from multiple related pages when you need comprehensive coverage.

**Warning:** Use carefully with limits to avoid token overflow.

**Usage Example:**
```json
{
  "name": "firecrawl_crawl",
  "arguments": {
    "url": "https://example.com/blog/*",
    "maxDepth": 2,
    "limit": 100,
    "allowExternalLinks": false
  }
}
```

### 6. Extract Tool (`firecrawl_extract`)

Extract structured information using LLM capabilities.

**Best for:** Extracting specific structured data like prices, names, details.

**Usage Example:**
```json
{
  "name": "firecrawl_extract",
  "arguments": {
    "urls": ["https://example.com/product"],
    "prompt": "Extract product information",
    "schema": {
      "type": "object",
      "properties": {
        "name": {"type": "string"},
        "price": {"type": "number"}
      }
    }
  }
}
```

### 7. Status Check Tools

Check the status of batch operations and crawl jobs:

- `firecrawl_check_batch_status` - Check batch scrape progress
- `firecrawl_check_crawl_status` - Check crawl job progress

## Verification & Health Checks

### Health Check Endpoint

```bash
# Test server health
curl http://localhost:8080/health
# Expected: {"status":"ok"}
```

### Testing Installation

```bash
# Check version
npx firecrawl-mcp --version

# Test with environment
env FIRECRAWL_API_KEY=fc-YOUR_API_KEY npx -y firecrawl-mcp

# Verify in another terminal
curl http://localhost:8080/health
```

## Troubleshooting

For comprehensive troubleshooting guidance, see our [**INSTALLATION.md - Troubleshooting & Tips**](./INSTALLATION.md#troubleshooting--tips) section.

### Common Issues

**Port Already in Use:**
```bash
# Find process using port 8080
lsof -i :8080  # Linux/macOS
netstat -ano | findstr :8080  # Windows

# Use alternative port
env PORT=8081 FIRECRAWL_API_KEY=fc-YOUR_API_KEY npx -y firecrawl-mcp
```

**Invalid API Key:**
```bash
# Check format (must start with fc-)
echo $FIRECRAWL_API_KEY

# Test API key directly
curl -H "Authorization: Bearer fc-your_api_key" https://api.firecrawl.dev/v0/crawl
```

**Server Won't Start:**
```bash
# Check Node.js version
node --version  # Must be ≥18.0.0

# Run with debug output
DEBUG=* npx -y firecrawl-mcp
```

### Getting Help

**Useful Resources:**
- **Full Installation Guide**: [INSTALLATION.md](./INSTALLATION.md)
- **Official Documentation**: [firecrawl.dev](https://www.firecrawl.dev/)
- **MCP Specification**: [modelcontextprotocol.io](https://modelcontextprotocol.io/)
- **GitHub Issues**: [github.com/firecrawl/firecrawl-mcp-server](https://github.com/firecrawl/firecrawl-mcp-server/issues)

## Development

### Building from Source

```bash
# Clone repository
git clone https://github.com/firecrawl/firecrawl-mcp-server.git
cd firecrawl-mcp-server

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Start development server
npm start
```

### Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Run tests: `npm test`
4. Commit your changes (`git commit -m 'Add amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Submit a pull request

### Project Structure

```
├── src/
│   ├── index.ts          # Main server entry point
│   ├── tools/            # MCP tool implementations
│   └── utils/            # Utility functions
├── INSTALLATION.md       # Comprehensive installation guide
├── package.json
└── README.md
```

## Features & Capabilities

### Rate Limiting and Batch Processing

- Automatic rate limit handling with exponential backoff
- Efficient parallel processing for batch operations
- Smart request queuing and throttling
- Automatic retries for transient errors

### Logging System

Comprehensive logging includes:
- Operation status and progress
- Performance metrics
- Credit usage monitoring
- Rate limit tracking
- Error conditions

### Error Handling

Robust error handling with:
- Automatic retries for transient errors
- Rate limit handling with backoff
- Detailed error messages
- Credit usage warnings
- Network resilience

## License

MIT License - see [LICENSE](./LICENSE) file for details.

## Thanks to Contributors

Thanks to [@vrknetha](https://github.com/vrknetha), [@cawstudios](https://caw.tech) for the initial implementation!

Thanks to MCP.so and Klavis AI for hosting and [@gstarwd](https://github.com/gstarwd), [@xiangkaiz](https://github.com/xiangkaiz) and [@zihaolin96](https://github.com/zihaolin96) for integrating our server.

---

<div align="center">
  <p>
    <a href="#readme-top">Back to top</a>
  </p>
</div>