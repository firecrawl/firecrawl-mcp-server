<div align="center">
  <a name="readme-top"></a>
  <img
    src="https://raw.githubusercontent.com/firecrawl/firecrawl-mcp-server/main/img/fire.png"
    height="140"
  >
</div>

# Firecrawl MCP Server

A Model Context Protocol (MCP) server implementation that integrates with [Firecrawl](https://github.com/firecrawl/firecrawl) for web scraping capabilities.

> Big thanks to [@vrknetha](https://github.com/vrknetha), [@knacklabs](https://www.knacklabs.ai) for the initial implementation!


## Features

- Web scraping, crawling, and discovery
- Search and content extraction
- Deep research and batch scraping
- Automatic retries and rate limiting
- Cloud and self-hosted support
- SSE support

> Play around with [our MCP Server on MCP.so's playground](https://mcp.so/playground?server=firecrawl-mcp-server) or on [Klavis AI](https://www.klavis.ai/mcp-servers).

## Installation

### 📚 Quick Start

Choose your preferred environment from the comprehensive installation guides below:

| Environment                                         | Quick Install  | Status |
| --------------------------------------------------- | -------------- | ------ |
| [Claude Desktop](#claude-desktop)                  | Manual Config  | ✅     |
| [Claude Code](#claude-code)                        | CLI Command    | ✅     |
| [Cursor](#cursor)                                  | One-Click     | ✅     |
| [VS Code](#vs-code)                                | One-Click     | ✅     |
| [Zed](#zed)                                        | Extensions    | ✅     |
| [Windsurf](#windsurf)                              | Manual Config | ✅     |
| [Cline](#cline)                                    | Marketplace   | ✅     |
| [NPX](#npx)                                        | One-line      | ✅     |
| [Docker](#docker)                                  | Container     | ✅     |
| [Windows](#windows)                                | Windows Config| ✅     |
| [Smithery](#smithery)                              | Universal     | ✅     |
| [Augment Code](#augment-code)                      | Marketplace   | ✅     |
| [Roo Code](#roo-code)                              | Manual Config | ✅     |
| [Gemini CLI](#gemini-cli)                          | Manual Config | ✅     |
| [Opencode](#opencode)                              | Manual Config | ✅     |
| [OpenAI Codex](#openai-codex)                      | Manual Config | ✅     |
| [JetBrains AI Assistant](#jetbrains-ai-assistant)  | GUI Config    | ✅     |
| [Kiro](#kiro)                                      | GUI Config    | ✅     |
| [Trae](#trae)                                      | Manual Config | ✅     |
| [Amazon Q Developer CLI](#amazon-q-cli)            | Manual Config | ✅     |
| [Warp](#warp)                                      | GUI Config    | ✅     |
| [Copilot Coding Agent](#copilot-coding-agent)      | Enterprise    | ✅     |
| [Crush](#crush)                                    | Manual Config | ✅     |
| [BoltAI](#boltai)                                  | Manual Config | ✅     |
| [Perplexity Desktop](#perplexity-desktop)          | Manual Config | ✅     |

### Prerequisites

Before installing Firecrawl MCP, ensure you have:

- **Firecrawl API Key**: Get your free API key from [firecrawl.dev](https://www.firecrawl.dev/app/api-keys)
- **Node.js**: Version 18 or higher
- **npm**: Latest version recommended

---

## Environment-Specific Installation Guides

### Claude Desktop

**Overview**: Anthropic's official desktop application with MCP support

**Prerequisites**:
- Claude Desktop (latest version)
- Firecrawl API Key
- macOS or Windows

**Installation**:

1. **Get Firecrawl API Key**
   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Locate Configuration File**
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

3. **Create/Edit Configuration**
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

4. **Restart Claude Desktop**

**Verification**: Test with `Can you scrape https://httpbin.org/json and show me the content?`

---

### Claude Code

**Overview**: Anthropic Claude's command-line interface

**Prerequisites**:
- Claude Code (latest version)
- Firecrawl API Key
- Node.js 18+ (for npx)

**Installation**:
```bash
claude mcp add firecrawl npx -y firecrawl-mcp
```

**Configuration**: Set your API key when prompted or via environment variable:
```bash
export FIRECRAWL_API_KEY=fc-your-api-key-here
```

**Verification**:
1. Open Claude Code and start a new session
2. Check if Firecrawl MCP tools are available
3. Test with: `Can you scrape https://httpbin.org/json and show me the content?`

---

### Cursor

**Overview**: AI-powered code editor with one-click MCP installation

**Quick Install**:
[![Install Firecrawl MCP in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=firecrawl&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImZpcmVjcmF3bC1tY3AiXSwiZW52Ijp7IkZJUkVDUkFMTF9BUElfS0VZIjoiJHtpbnB1dDphcGlLZXl9In19)

**Manual Configuration**:

1. **Global Installation** (`~/.cursor/mcp.json`):
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

2. **Project-Specific** (`.cursor/mcp.json`):
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

**Windows Configuration**:
```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "cmd",
      "args": ["/c", "set FIRECRAWL_API_KEY=fc-your-api-key-here && npx -y firecrawl-mcp"]
    }
  }
}
```

---

### VS Code

**Overview**: Microsoft's popular code editor with built-in MCP support

**Quick Install**:
[![Install with VS Code](https://img.shields.io/badge/VS_Code-One_Click-007ACC?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=firecrawl&inputs=%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22apiKey%22%2C%22description%22%3A%22Firecrawl%20API%20Key%22%2C%22password%22%3Atrue%7D%5D&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22firecrawl-mcp%22%5D%2C%22env%22%3A%7B%22FIRECRAWL_API_KEY%22%3A%22%24%7Binput%3AapiKey%7D%22%7D%7D)

**Manual Configuration**:

1. **Open Settings**: Press `Ctrl + Shift + P` → "Preferences: Open User Settings (JSON)"
2. **Add Configuration**:
   ```json
   {
     "mcp": {
       "servers": {
         "firecrawl": {
           "type": "stdio",
           "command": "npx",
           "args": ["-y", "firecrawl-mcp@latest"],
           "env": {
             "FIRECRAWL_API_KEY": "fc-your-api-key-here"
           }
         }
       }
     }
   }
   ```

---

### Zed

**Overview**: Modern high-performance code editor

**Prerequisites**:
- Zed (latest version)
- Firecrawl API Key
- Node.js 18+ (for npx)

**Installation**:

1. **Install via Extension Manager**:
   - Open Zed
   - Go to `Extensions` → `Marketplace`
   - Search for "Firecrawl MCP"
   - Click `Install`

2. **Manual Configuration** (`.zed/settings.json`):
   ```json
   {
     "mcp_servers": {
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

**Verification**:
1. Restart Zed after installation
2. Check that Firecrawl MCP tools appear in the command palette
3. Test with a scraping request

---

### Windsurf

**Overview**: Codeium's AI development environment

**Prerequisites**:
- Windsurf (latest version)
- Firecrawl API Key
- Node.js 18+ (for npx)

**Installation**:

1. **Global Configuration** (`~/.windsurf/mcp.json`):
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

2. **Project Configuration** (`.windsurf/mcp.json`):
   - Create file in project root
   - Use same configuration as global

**Verification**:
1. Restart Windsurf after configuration
2. Check that Firecrawl MCP tools appear in the available tools
3. Test with: `Scrape https://httpbin.org/json`

---

### Cline

**Overview**: AI assistant with MCP marketplace

**Prerequisites**:
- Cline (latest version)
- Firecrawl API Key
- Node.js 18+ (for npx)

**Installation**:

1. **Via Marketplace**:
   - Open Cline
   - Go to `Extensions` → `Marketplace`
   - Search for "Firecrawl MCP"
   - Click `Install`

2. **Manual Configuration**:
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

**Verification**:
1. Restart Cline after installation
2. Check that Firecrawl MCP tools appear in the tools panel
3. Test with: `Scrape https://httpbin.org/json`

---

### NPX

**Overview**: Run directly without installation

**Prerequisites**:
- Node.js 18+
- npm (latest version recommended)
- Firecrawl API Key

**Installation**:
```bash
env FIRECRAWL_API_KEY=fc-your-api-key-here npx -y firecrawl-mcp
```

**For SSE Local Mode**:
```bash
env SSE_LOCAL=true FIRECRAWL_API_KEY=fc-your-api-key-here npx -y firecrawl-mcp
```
Use URL: `http://localhost:3000/sse`

**Verification**:
1. Run the command above and look for "Firecrawl MCP Server initialized successfully" message
2. The server should start and be ready to accept MCP connections

---

### Docker

**Overview**: Containerized deployment

**Prerequisites**:
- Docker (latest version)
- Docker Compose (optional)
- Firecrawl API Key

**Installation**:

1. **Create Dockerfile**:
   ```dockerfile
   FROM node:18-alpine

   WORKDIR /app
   RUN npm install -g firecrawl-mcp

   CMD ["firecrawl-mcp"]
   ```

2. **Build and Run**:
   ```bash
   docker build -t firecrawl-mcp .
   docker run -e FIRECRAWL_API_KEY=your-api-key firecrawl-mcp
   ```

3. **Docker Compose**:
   ```yaml
   version: '3.8'
   services:
     firecrawl-mcp:
       image: firecrawl-mcp
       environment:
         - FIRECRAWL_API_KEY=your-api-key
   ```

**Verification**:
1. Check that the container starts successfully: `docker ps | grep firecrawl-mcp`
2. View container logs: `docker logs firecrawl-mcp`
3. Look for "Firecrawl MCP Server initialized successfully" message

---

### Windows

**Overview**: Windows-specific configuration

**Prerequisites**:
- Windows 10/11
- Node.js 18+ (for npx)
- Firecrawl API Key
- PowerShell or Command Prompt

**Installation**:

1. **PowerShell**:
   ```powershell
   $env:FIRECRAWL_API_KEY="fc-your-api-key-here"
   npx -y firecrawl-mcp
   ```

2. **Command Prompt**:
   ```cmd
   set FIRECRAWL_API_KEY=fc-your-api-key-here
   npx -y firecrawl-mcp
   ```

3. **Windows Services**:
   ```json
   {
     "mcpServers": {
       "firecrawl": {
         "command": "cmd",
         "args": ["/c", "set FIRECRAWL_API_KEY=fc-your-api-key-here && npx -y firecrawl-mcp"]
       }
     }
   }
   ```

**Verification**:
1. Run one of the installation commands above
2. Look for "Firecrawl MCP Server initialized successfully" message
3. Test with a simple URL scrape in your MCP client

---

### Smithery

**Overview**: Universal installation across all MCP clients

**Prerequisites**:
- Node.js 18+
- npm (latest version recommended)
- Firecrawl API Key
- Smithery CLI access

**Installation**:
```bash
npx -y @smithery/cli install @mendableai/mcp-server-firecrawl --client claude
```

**Configuration**: Smithery handles the configuration automatically for your chosen client.

**Verification**:
1. After installation, restart your chosen MCP client
2. Check that Firecrawl MCP tools appear in the available tools list
3. Test with a basic scraping request in your client

---

### Augment Code

**Overview**: AI-powered coding assistant

**Prerequisites**:
- Augment Code (latest version)
- Firecrawl API Key
- Node.js 18+ (for npx)

**Installation**:

1. **Via Marketplace**:
   - Open Augment Code
   - Go to `Extensions` → `Marketplace`
   - Search for "Firecrawl MCP"
   - Click `Install`

2. **Manual Configuration**:
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

**Verification**:
1. Restart Augment Code after installation
2. Check that Firecrawl MCP tools appear in the tools panel
3. Test with: `Scrape https://httpbin.org/json`

---

### Roo Code

**Overview**: AI-powered coding assistant

**Installation**:

1. **Configuration File** (`.roo/mcp.json`):
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

2. **Restart Roo Code**

---

### Gemini CLI

**Overview**: Google Gemini's command-line interface

**Installation**:

1. **Configuration File** (`~/.gemini/mcp.json`):
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

2. **Set Environment Variable**:
   ```bash
   export FIRECRAWL_API_KEY=fc-your-api-key-here
   ```

---

### Opencode

**Overview**: AI-powered development environment

**Installation**:

1. **Configuration File** (`.opencode/mcp.json`):
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

2. **Restart Opencode**

---

### OpenAI Codex

**Overview**: AI-powered code completion tool

**Installation**:

1. **Configuration File** (`.codex/mcp.json`):
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

---

### JetBrains AI Assistant

**Overview**: JetBrains IDE AI assistant

**Installation**:

1. **Open Settings** → `Plugins` → `Marketplace`
2. **Search for "Firecrawl MCP"**
3. **Install and restart IDE**

**Manual Configuration** (`.idea/mcp.xml`):
```xml
<mcp>
  <servers>
    <server name="firecrawl">
      <command>npx</command>
      <args>-y firecrawl-mcp</args>
      <env>
        <FIRECRAWL_API_KEY>fc-your-api-key-here</FIRECRAWL_API_KEY>
      </env>
    </server>
  </servers>
</mcp>
```

---

### Kiro

**Overview**: AI-powered development environment

**Installation**:

1. **Configuration File** (`.kiro/mcp.json`):
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

2. **Restart Kiro**

---

### Trae

**Overview**: AI-powered development environment

**Installation**:

1. **Configuration File** (`.trae/mcp.json`):
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

2. **Restart Trae**

---

### Amazon Q Developer CLI

**Overview**: AWS AI-powered CLI

**Installation**:

1. **Configuration File** (`~/.amazonq/mcp.json`):
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

2. **Set AWS Credentials** (if needed):
   ```bash
   aws configure
   ```

---

### Warp

**Overview**: AI-powered terminal

**Installation**:

1. **Open Warp Settings**
2. **Go to `Features` → `MCP Servers`**
3. **Add Configuration**:
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

---

### Copilot Coding Agent

**Overview**: GitHub's enterprise AI assistant

**Installation**:

1. **Enterprise Configuration**:
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

2. **Deploy via Enterprise Management Console**

---

### Crush

**Overview**: Modern AI-powered development environment

**Installation**:

1. **Configuration File** (`.crush/mcp.json`):
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

2. **Restart Crush**

---

### BoltAI

**Overview**: AI assistant with plugin-based MCP support

**Prerequisites**:
- BoltAI (latest version)
- Firecrawl API Key
- Node.js 18+ (for npx)

**Installation**:

1. **Configuration File** (`.boltai/mcp.json`):
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

2. **Restart BoltAI**

**Verification**:
1. Open BoltAI and check for Firecrawl MCP tools in the available tools list
2. Test with a simple scraping request like `Scrape https://httpbin.org/json`

---

### Perplexity Desktop

**Overview**: Research-focused AI assistant with connector support

**Prerequisites**:
- Perplexity Desktop (latest version)
- Firecrawl API Key
- Node.js 18+ (for npx)

**Installation**:

1. **Configuration File** (`.perplexity/mcp.json`):
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

2. **Restart Perplexity Desktop**

**Verification**:
1. Open Perplexity Desktop and start a new conversation
2. Check if Firecrawl tools are available (firecrawl_scrape, firecrawl_search, etc.)
3. Test with: `Can you scrape https://httpbin.org/json?`

---

### Alternative Installation Methods

#### Manual Installation

```bash
npm install -g firecrawl-mcp
```

#### Running with SSE Local Mode

```bash
env SSE_LOCAL=true FIRECRAWL_API_KEY=fc-your-api-key-here npx -y firecrawl-mcp
```
Use the url: `http://localhost:3000/sse`

#### Installing via Smithery (Legacy)

```bash
npx -y @smithery/cli install @mendableai/mcp-server-firecrawl --client claude
```

---

### Configuration

#### Environment Variables

**Required for Cloud API**:

- `FIRECRAWL_API_KEY`: Your Firecrawl API key
  - Required when using cloud API (default)
  - Optional when using self-hosted instance with `FIRECRAWL_API_URL`
- `FIRECRAWL_API_URL` (Optional): Custom API endpoint for self-hosted instances
  - Example: `https://firecrawl.your-domain.com`
  - If not provided, the cloud API will be used (requires API key)

**Optional Configuration**:

- `FIRECRAWL_RETRY_MAX_ATTEMPTS`: Maximum number of retry attempts (default: 3)
- `FIRECRAWL_RETRY_INITIAL_DELAY`: Initial delay in milliseconds before first retry (default: 1000)
- `FIRECRAWL_RETRY_MAX_DELAY`: Maximum delay in milliseconds between retries (default: 10000)
- `FIRECRAWL_RETRY_BACKOFF_FACTOR`: Exponential backoff multiplier (default: 2)
- `FIRECRAWL_CREDIT_WARNING_THRESHOLD`: Credit usage warning threshold (default: 1000)
- `FIRECRAWL_CREDIT_CRITICAL_THRESHOLD`: Credit usage critical threshold (default: 100)

**Configuration Examples**:

For cloud API usage with custom retry and credit monitoring:

```bash
# Required for cloud API
export FIRECRAWL_API_KEY=your-api-key

# Optional retry configuration
export FIRECRAWL_RETRY_MAX_ATTEMPTS=5        # Increase max retry attempts
export FIRECRAWL_RETRY_INITIAL_DELAY=2000    # Start with 2s delay
export FIRECRAWL_RETRY_MAX_DELAY=30000       # Maximum 30s delay
export FIRECRAWL_RETRY_BACKOFF_FACTOR=3      # More aggressive backoff

# Optional credit monitoring
export FIRECRAWL_CREDIT_WARNING_THRESHOLD=2000    # Warning at 2000 credits
export FIRECRAWL_CREDIT_CRITICAL_THRESHOLD=500    # Critical at 500 credits
```

For self-hosted instance:

```bash
# Required for self-hosted
export FIRECRAWL_API_URL=https://firecrawl.your-domain.com

# Optional authentication for self-hosted
export FIRECRAWL_API_KEY=your-api-key  # If your instance requires auth

# Custom retry configuration
export FIRECRAWL_RETRY_MAX_ATTEMPTS=10
export FIRECRAWL_RETRY_INITIAL_DELAY=500     # Start with faster retries
```

#### Common Configuration Pattern

Most environments use a variation of this JSON configuration:

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

**Note**: The exact format varies by environment. Some use:
- `"mcp"` instead of `"mcpServers"`
- `"servers"` instead of nested objects
- HTTP connections for remote servers
- TOML configuration instead of JSON

#### Verification

After installation, verify that Firecrawl MCP is working:

1. **Check Server Status**: Look for "Firecrawl MCP Server initialized successfully" in logs
2. **Test Tools**: Try using `firecrawl_scrape` with a test URL like `https://httpbin.org/json`
3. **Verify API Connection**: Ensure your API key is valid

---

### Troubleshooting

#### Common Issues

- **API Key Issues**: Verify your key is valid and not expired
- **Network Problems**: Check firewall and proxy settings
- **Permission Errors**: Ensure proper Node.js/npm permissions
- **Version Conflicts**: Update Node.js to v18+
- **Windows Command Issues**: Use `cmd /c` format for Windows configurations
- **JSON Syntax Errors**: Validate JSON syntax before saving configuration files

#### Debug Mode

Enable debug logging to troubleshoot issues:

```bash
export DEBUG=firecrawl-mcp:*
```

Then restart your MCP client.

### Advanced Configuration

The server includes several configurable parameters that can be set via environment variables:

**Retry Configuration**:
- `FIRECRAWL_RETRY_MAX_ATTEMPTS`: Number of retry attempts for rate-limited requests (default: 3)
- `FIRECRAWL_RETRY_INITIAL_DELAY`: Initial delay before first retry in milliseconds (default: 1000)
- `FIRECRAWL_RETRY_MAX_DELAY`: Maximum delay between retries in milliseconds (default: 10000)
- `FIRECRAWL_RETRY_BACKOFF_FACTOR`: Multiplier for exponential backoff (default: 2)

**Credit Usage Monitoring**:
- `FIRECRAWL_CREDIT_WARNING_THRESHOLD`: Warn when credit usage reaches this level (default: 1000)
- `FIRECRAWL_CREDIT_CRITICAL_THRESHOLD`: Critical alert when credit usage reaches this level (default: 100)

**Retry Behavior**:
- Automatically retries failed requests due to rate limits
- Uses exponential backoff to avoid overwhelming the API
- Example: With default settings, retries will be attempted at:
  - 1st retry: 1 second delay
  - 2nd retry: 2 seconds delay
  - 3rd retry: 4 seconds delay (capped at maxDelay)

**Credit Usage Monitoring**:
- Tracks API credit consumption for cloud API usage
- Provides warnings at specified thresholds
- Helps prevent unexpected service interruption
- Example: With default settings:
  - Warning at 1000 credits remaining
  - Critical alert at 100 credits remaining

### Rate Limiting and Batch Processing

The server utilizes Firecrawl's built-in rate limiting and batch processing capabilities:

- Automatic rate limit handling with exponential backoff
- Efficient parallel processing for batch operations
- Smart request queuing and throttling
- Automatic retries for transient errors

## How to Choose a Tool

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

## Available Tools

### 1. Scrape Tool (`firecrawl_scrape`)

Scrape content from a single URL with advanced options.

**Best for:**
- Single page content extraction, when you know exactly which page contains the information.

**Not recommended for:**
- Extracting content from multiple pages (use batch_scrape for known URLs, or map + batch_scrape to discover URLs first, or crawl for full page content)
- When you're unsure which page contains the information (use search)
- When you need structured data (use extract)

**Common mistakes:**
- Using scrape for a list of URLs (use batch_scrape instead).

**Prompt Example:**
> "Get the content of the page at https://example.com."

**Usage Example:**
```json
{
  "name": "firecrawl_scrape",
  "arguments": {
    "url": "https://example.com",
    "formats": ["markdown"],
    "onlyMainContent": true,
    "waitFor": 1000,
    "timeout": 30000,
    "mobile": false,
    "includeTags": ["article", "main"],
    "excludeTags": ["nav", "footer"],
    "skipTlsVerification": false
  }
}
```

**Returns:**
- Markdown, HTML, or other formats as specified.

### 2. Batch Scrape Tool (`firecrawl_batch_scrape`)

Scrape multiple URLs efficiently with built-in rate limiting and parallel processing.

**Best for:**
- Retrieving content from multiple pages, when you know exactly which pages to scrape.

**Not recommended for:**
- Discovering URLs (use map first if you don't know the URLs)
- Scraping a single page (use scrape)

**Common mistakes:**
- Using batch_scrape with too many URLs at once (may hit rate limits or token overflow)

**Prompt Example:**
> "Get the content of these three blog posts: [url1, url2, url3]."

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

**Returns:**
- Response includes operation ID for status checking:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Batch operation queued with ID: batch_1. Use firecrawl_check_batch_status to check progress."
    }
  ],
  "isError": false
}
```

### 3. Check Batch Status (`firecrawl_check_batch_status`)

Check the status of a batch operation.

```json
{
  "name": "firecrawl_check_batch_status",
  "arguments": {
    "id": "batch_1"
  }
}
```

### 4. Map Tool (`firecrawl_map`)

Map a website to discover all indexed URLs on the site.

**Best for:**
- Discovering URLs on a website before deciding what to scrape
- Finding specific sections of a website

**Not recommended for:**
- When you already know which specific URL you need (use scrape or batch_scrape)
- When you need the content of the pages (use scrape after mapping)

**Common mistakes:**
- Using crawl to discover URLs instead of map

**Prompt Example:**
> "List all URLs on example.com."

**Usage Example:**
```json
{
  "name": "firecrawl_map",
  "arguments": {
    "url": "https://example.com"
  }
}
```

**Returns:**
- Array of URLs found on the site

### 5. Search Tool (`firecrawl_search`)

Search the web and optionally extract content from search results.

**Best for:**
- Finding specific information across multiple websites, when you don't know which website has the information.
- When you need the most relevant content for a query

**Not recommended for:**
- When you already know which website to scrape (use scrape)
- When you need comprehensive coverage of a single website (use map or crawl)

**Common mistakes:**
- Using crawl or map for open-ended questions (use search instead)

**Usage Example:**
```json
{
  "name": "firecrawl_search",
  "arguments": {
    "query": "latest AI research papers 2023",
    "limit": 5,
    "lang": "en",
    "country": "us",
    "scrapeOptions": {
      "formats": ["markdown"],
      "onlyMainContent": true
    }
  }
}
```

**Returns:**
- Array of search results (with optional scraped content)

**Prompt Example:**
> "Find the latest research papers on AI published in 2023."

### 6. Crawl Tool (`firecrawl_crawl`)

Starts an asynchronous crawl job on a website and extract content from all pages.

**Best for:**
- Extracting content from multiple related pages, when you need comprehensive coverage.

**Not recommended for:**
- Extracting content from a single page (use scrape)
- When token limits are a concern (use map + batch_scrape)
- When you need fast results (crawling can be slow)

**Warning:** Crawl responses can be very large and may exceed token limits. Limit the crawl depth and number of pages, or use map + batch_scrape for better control.

**Common mistakes:**
- Setting limit or maxDepth too high (causes token overflow)
- Using crawl for a single page (use scrape instead)

**Prompt Example:**
> "Get all blog posts from the first two levels of example.com/blog."

**Usage Example:**
```json
{
  "name": "firecrawl_crawl",
  "arguments": {
    "url": "https://example.com/blog/*",
    "maxDepth": 2,
    "limit": 100,
    "allowExternalLinks": false,
    "deduplicateSimilarURLs": true
  }
}
```

**Returns:**
- Response includes operation ID for status checking:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Started crawl for: https://example.com/* with job ID: 550e8400-e29b-41d4-a716-446655440000. Use firecrawl_check_crawl_status to check progress."
    }
  ],
  "isError": false
}
```

### 7. Check Crawl Status (`firecrawl_check_crawl_status`)

Check the status of a crawl job.

```json
{
  "name": "firecrawl_check_crawl_status",
  "arguments": {
    "id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**Returns:**
- Response includes the status of the crawl job:
  
### 8. Extract Tool (`firecrawl_extract`)

Extract structured information from web pages using LLM capabilities. Supports both cloud AI and self-hosted LLM extraction.

**Best for:**
- Extracting specific structured data like prices, names, details.

**Not recommended for:**
- When you need the full content of a page (use scrape)
- When you're not looking for specific structured data

**Arguments:**
- `urls`: Array of URLs to extract information from
- `prompt`: Custom prompt for the LLM extraction
- `systemPrompt`: System prompt to guide the LLM
- `schema`: JSON schema for structured data extraction
- `allowExternalLinks`: Allow extraction from external links
- `enableWebSearch`: Enable web search for additional context
- `includeSubdomains`: Include subdomains in extraction

When using a self-hosted instance, the extraction will use your configured LLM. For cloud API, it uses Firecrawl's managed LLM service.
**Prompt Example:**
> "Extract the product name, price, and description from these product pages."

**Usage Example:**
```json
{
  "name": "firecrawl_extract",
  "arguments": {
    "urls": ["https://example.com/page1", "https://example.com/page2"],
    "prompt": "Extract product information including name, price, and description",
    "systemPrompt": "You are a helpful assistant that extracts product information",
    "schema": {
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "price": { "type": "number" },
        "description": { "type": "string" }
      },
      "required": ["name", "price"]
    },
    "allowExternalLinks": false,
    "enableWebSearch": false,
    "includeSubdomains": false
  }
}
```

**Returns:**
- Extracted structured data as defined by your schema

```json
{
  "content": [
    {
      "type": "text",
      "text": {
        "name": "Example Product",
        "price": 99.99,
        "description": "This is an example product description"
      }
    }
  ],
  "isError": false
}
```

## Logging System

The server includes comprehensive logging:

- Operation status and progress
- Performance metrics
- Credit usage monitoring
- Rate limit tracking
- Error conditions

Example log messages:

```
[INFO] Firecrawl MCP Server initialized successfully
[INFO] Starting scrape for URL: https://example.com
[INFO] Batch operation queued with ID: batch_1
[WARNING] Credit usage has reached warning threshold
[ERROR] Rate limit exceeded, retrying in 2s...
```

## Error Handling

The server provides robust error handling:

- Automatic retries for transient errors
- Rate limit handling with backoff
- Detailed error messages
- Credit usage warnings
- Network resilience

Example error response:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Error: Rate limit exceeded. Retrying in 2 seconds..."
    }
  ],
  "isError": true
}
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test
```

### Contributing

1. Fork the repository
2. Create your feature branch
3. Run tests: `npm test`
4. Submit a pull request

### Thanks to contributors

Thanks to [@vrknetha](https://github.com/vrknetha), [@cawstudios](https://caw.tech) for the initial implementation!

Thanks to MCP.so and Klavis AI for hosting and [@gstarwd](https://github.com/gstarwd), [@xiangkaiz](https://github.com/xiangkaiz) and [@zihaolin96](https://github.com/zihaolin96) for integrating our server.

## License

MIT License - see LICENSE file for details
