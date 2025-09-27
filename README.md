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

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
  - [Prerequisites](#prerequisites)  
  - [Running with npx (Recommended)](#running-with-npx-recommended)
  - [Remote-Hosted Option](#remote-hosted-option-no-local-server-required)
- [Available Tools](#available-tools)
  - [How to Choose a Tool](#how-to-choose-a-tool)
  - [Tool Reference](#tool-reference)
- [Configuration](#configuration)
  - [Environment Variables](#environment-variables)
  - [Server-Sent Events (SSE) Mode](#server-sent-events-sse-mode)
  - [Self-Hosted Firecrawl Instance](#self-hosted-firecrawl-instance)
- [Installation Guide](#installation-guide)
  - [Runtime Environments](#runtime-environments)
  - [IDEs and Editors](#ides-and-editors)
  - [Desktop Applications](#desktop-applications)
  - [CLI Tools](#cli-tools)
  - [Additional Environments](#additional-environments)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [License](#license)

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

- **Node.js**: Version ≥18.0.0 (recommended ≥20) - [Download](https://nodejs.org/)
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

### Tool Reference

| Tool                | Best for                                 | Returns         |
|---------------------|------------------------------------------|--------------------|
| scrape              | Single page content                      | markdown/html   |
| batch_scrape        | Multiple known URLs                      | markdown/html[] |
| map                 | Discovering URLs on a site               | URL[]           |
| crawl               | Multi-page extraction (with limits)      | markdown/html[] |
| search              | Web search for info                      | results[]       |
| extract             | Structured data from pages               | JSON            |

<details>
<summary>📖 Detailed Tool Documentation</summary>

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

</details>

## Configuration

### Environment Variables

<details>
<summary>⚙️ Required Configuration</summary>

#### For Cloud API
- `FIRECRAWL_API_KEY`: Your Firecrawl API key (must start with `fc-`)

#### For Self-Hosted Instance
- `FIRECRAWL_API_URL`: Custom API endpoint for self-hosted instances (e.g., `https://firecrawl.your-domain.com`)
- `FIRECRAWL_API_KEY`: Optional - only if your self-hosted instance requires authentication

</details>

<details>
<summary>⚙️ Optional Configuration</summary>

#### Server Settings
- `PORT`: Server port (default: 8080)
- `SSE_LOCAL`: Enable local SSE mode (default: false)
- `SSE_PORT`: SSE port when in local mode (default: 3000)

#### Retry Configuration
- `FIRECRAWL_RETRY_MAX_ATTEMPTS`: Maximum retry attempts (default: 3)
- `FIRECRAWL_RETRY_INITIAL_DELAY`: Initial delay in ms (default: 1000)
- `FIRECRAWL_RETRY_MAX_DELAY`: Maximum delay in ms (default: 10000)
- `FIRECRAWL_RETRY_BACKOFF_FACTOR`: Exponential backoff multiplier (default: 2)

#### Credit Usage Monitoring
- `FIRECRAWL_CREDIT_WARNING_THRESHOLD`: Warning threshold (default: 1000)
- `FIRECRAWL_CREDIT_CRITICAL_THRESHOLD`: Critical threshold (default: 100)

</details>

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

## Installation Guide

Complete installation instructions for **30+ development environments** with collapsible sections:

### Runtime Environments

<details>
<summary>🐳 <strong>Docker</strong></summary>

#### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) installed and running
- **Platform Requirements**: Docker Desktop (Windows/macOS) or Docker Engine (Linux)

#### Installation
1. **Create Dockerfile** in project root:

```dockerfile
FROM node:18-alpine
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 8080
ARG FIRECRAWL_API_KEY
ENV FIRECRAWL_API_KEY=${FIRECRAWL_API_KEY}
ENV PORT=8080
CMD ["npm", "start"]
```

2. **Build and run**:

```bash
# Build image
docker build --build-arg "FIRECRAWL_API_KEY=fc-your_api_key" -t firecrawl-mcp .

# Run container (default port 8080)
docker run -d -p 8080:8080 --name firecrawl-mcp firecrawl-mcp

# Run with custom port
docker run -d -p 8081:8080 --name firecrawl-mcp firecrawl-mcp

# Alternative with environment file
docker run -d -p 8080:8080 --env-file .env --name firecrawl-mcp firecrawl-mcp
```

#### Verification

```bash
# Check container status
docker ps | grep firecrawl-mcp

# Test health endpoint
curl http://localhost:8080/health
# Expected: {"status":"ok"}

# Check logs
docker logs firecrawl-mcp
```

#### Troubleshooting
- **Docker daemon not running**: Start Docker Desktop (Windows/macOS) or `sudo systemctl start docker` (Linux)
- **Port already allocated**: Change port mapping `-p 8081:8080`
- **Build context too large**: Add `.dockerignore` file
- **Permission denied**: Add user to docker group: `sudo usermod -aG docker $USER` (Linux)

</details>

<details>
<summary>📦 <strong>Node.js</strong></summary>

#### Prerequisites
- Node.js v18+ and npm installed (minimum Node.js ≥18.0.0, recommended ≥20)

#### Installation
```bash
# Method 1: Global installation
npm install -g firecrawl-mcp
env FIRECRAWL_API_KEY=fc-your_api_key firecrawl-mcp

# Method 2: NPX (recommended)
env FIRECRAWL_API_KEY=fc-your_api_key npx -y firecrawl-mcp

# Method 3: Local development
git clone https://github.com/firecrawl/firecrawl-mcp-server.git
cd firecrawl-mcp-server
npm install
npm start
```

#### Configuration
```env
FIRECRAWL_API_KEY="fc-your_api_key_here"
PORT=8080
```

#### Verification
```bash
# Check Node.js version first
node --version

# Test installation
npx firecrawl-mcp --version

# Start and test server
npm start
# In another terminal:
curl http://localhost:8080/health
```

#### Troubleshooting
- **Command not found**: Node.js not in PATH - reinstall Node.js
- **Missing API key**: Check `.env` file exists and contains valid key with `fc-` prefix
- **Permission denied**: Use `sudo npm install -g` or configure npm properly
- **Version incompatibility**: Ensure Node.js ≥18.0.0 with `node --version`

</details>

<details>
<summary>⚡ <strong>Bun</strong></summary>

Fast JavaScript runtime alternative to Node.js. [Official Docs](https://bun.sh/docs)

#### Prerequisites
- [Bun](https://bun.sh/docs/installation) installed

#### Installation
```bash
# Clone and setup (same as Node.js)
git clone https://github.com/firecrawl/firecrawl-mcp-server.git
cd firecrawl-mcp-server
bun install
cp .env.example .env
# Edit .env with your API key (fc- prefix)
bun start

# Alternative: Direct NPX usage
env FIRECRAWL_API_KEY=fc-your_api_key bunx firecrawl-mcp
```

#### Configuration
Same `.env` configuration as Node.js with `fc-` prefix:
```env
FIRECRAWL_API_KEY="fc-your_api_key_here"
PORT=8080
```

#### Verification
```bash
curl http://localhost:8080/health
```

#### Troubleshooting
- **Command not found**: Reinstall Bun following official guide
- **Package compatibility**: Some packages may not work with Bun - use `npm install` as fallback

</details>

<details>
<summary>🦕 <strong>Deno</strong></summary>

Modern runtime for JavaScript and TypeScript. [Official Docs](https://deno.land/manual)

#### Prerequisites
- [Deno](https://deno.land/manual/getting_started/installation) installed

#### Installation
```bash
# Clone and setup
git clone https://github.com/firecrawl/firecrawl-mcp-server.git
cd firecrawl-mcp-server
cp .env.example .env
# Edit .env with your API key (fc- prefix)

# Run with Deno
deno run --allow-env --allow-net npm:start

# Alternative: Direct NPX usage
env FIRECRAWL_API_KEY=fc-your_api_key deno run --allow-env --allow-net npm:firecrawl-mcp
```

#### Configuration
Same `.env` configuration as Node.js with `fc-` prefix:
```env
FIRECRAWL_API_KEY="fc-your_api_key_here"
PORT=8080
```

#### Verification
```bash
curl http://localhost:8080/health
```

#### Troubleshooting
- **Permission denied**: Deno requires explicit permissions - use `--allow-env --allow-net`
- **NPM compatibility**: Some packages may not work - check Deno's Node.js compatibility docs

</details>

<details>
<summary>🪟 <strong>Windows</strong></summary>

#### Prerequisites
- [Node.js for Windows](https://nodejs.org/en/download/) (LTS version recommended)
- [Git for Windows](https://git-scm.com/download/win) (includes Git Bash)
- **Terminal Options**: PowerShell, Command Prompt, or Git Bash

#### Installation

**Step 1: Clone Repository**
```powershell
# Using PowerShell or Command Prompt
git clone https://github.com/firecrawl/firecrawl-mcp-server.git
cd firecrawl-mcp-server

# Using Git Bash
git clone https://github.com/firecrawl/firecrawl-mcp-server.git
cd firecrawl-mcp-server
```

**Step 2: Install Dependencies**
```powershell
npm install
```

**Step 3: Environment Setup**
```powershell
# Copy environment template
copy .env.example .env

# Edit .env file (use your preferred editor)
notepad .env
# Add: FIRECRAWL_API_KEY="fc-your_api_key_here"
```

**Step 4: Start Server**
```powershell
npm start
```

#### Configuration
**Environment Variable Methods**:

**Method 1: .env File (Recommended)**
```env
FIRECRAWL_API_KEY=fc-your_api_key_here
PORT=8080
NODE_ENV=production
```

**Method 2: PowerShell Session**
```powershell
$env:FIRECRAWL_API_KEY="fc-your_api_key_here"
$env:PORT="8080"
npm start
```

**Method 3: Command Prompt Session**
```cmd
set FIRECRAWL_API_KEY=fc-your_api_key_here
set PORT=8080
npm start
```

#### Verification

```powershell
# Test server health
Invoke-RestMethod -Uri http://localhost:8080/health -Method Get

# Alternative using curl (if available)
curl http://localhost:8080/health

# Check process
Get-Process -Name node | Where-Object {$_.ProcessName -eq "node"}

# Check listening ports
netstat -an | findstr 8080
```

#### Troubleshooting

**Common Windows Issues**:

**Git/Node.js Not Found**:
- Add to PATH environment variable
- **PowerShell**: `$env:PATH += ";C:\Program Files\nodejs;C:\Program Files\Git\bin"`
- **Persistent**: System Properties → Advanced → Environment Variables → PATH

**Port Already in Use**:
```powershell
# Find process using port 8080
netstat -ano | findstr :8080
# Kill process (replace PID with actual process ID)
taskkill /PID <PID> /F
```

**Firewall Blocking**:
- **Windows Defender**: Allow Node.js through firewall
- **PowerShell (Admin)**: `New-NetFirewallRule -DisplayName "Node.js" -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow`

</details>

### IDEs and Editors

<details>
<summary>🆚 <strong>VS Code</strong></summary>

#### Prerequisites
- [VS Code](https://code.visualstudio.com/) installed
- Running Firecrawl MCP server
- **Optional**: MCP extension from marketplace

#### Installation
1. **Access VS Code Settings**:
   - **GUI**: `Ctrl+Shift+P` → "Preferences: Open User Settings (JSON)"
   - **Menu**: File → Preferences → Settings → Open Settings (JSON)
   - **Shortcut**: `Ctrl+,` then click JSON icon

2. **Add MCP Configuration**

#### Configuration
**Configuration Locations**:
- **User Settings**: `%APPDATA%\Code\User\settings.json` (Windows) / `~/.config/Code/User/settings.json` (Linux) / `~/Library/Application Support/Code/User/settings.json` (macOS)
- **Workspace Settings**: `.vscode/settings.json` in project root

**Latest MCP Format (Recommended)**:
```json
{
  "mcp": {
    "servers": {
      "firecrawl": {
        "command": "npx",
        "args": ["-y", "firecrawl-mcp"],
        "env": {
          "FIRECRAWL_API_KEY": "fc-your_api_key_here"
        }
      }
    }
  }
}
```

#### Verification

**Visual Indicators**:
- **Status Bar**: Look for MCP/Firecrawl status indicator
- **Command Palette**: `Ctrl+Shift+P` → search for "MCP" commands
- **Output Panel**: View → Output → select "MCP" from dropdown

**Testing Steps**:
```bash
# 1. Open a code file (any language)
# 2. Check for MCP suggestions in autocomplete
# 3. Hover over code elements for MCP-enhanced information
# 4. Right-click for MCP code actions
```

#### Troubleshooting
- **JSON syntax error**: Use VS Code's JSON validation (red squiggles)
- **Path issues**: Use absolute paths, escape backslashes on Windows
- **Settings not applied**: Restart VS Code after configuration changes

</details>

<details>
<summary>🖱️ <strong>Cursor</strong></summary>

AI-first code editor with native MCP support. [Official MCP Docs](https://cursor.sh/docs/mcp)

#### Prerequisites
- [Cursor](https://cursor.sh/download) installed
- Running Firecrawl MCP server

#### Installation
1. Open Command Palette (`Cmd+K` or `Ctrl+K`)
2. Type "Configure MCP" and press Enter
3. Opens `mcp_config.json` file

#### Configuration
**Configuration Locations:**
- **macOS**: `~/.cursor/mcp.json`
- **Windows**: `%APPDATA%\Cursor\mcp.json`
- **Linux**: `~/.cursor/mcp.json`

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

#### Verification
- **Settings Check**: Cursor Settings → Features → MCP Servers
- **UI Confirmation**: Added servers appear in MCP Servers list with status indicators
- **Feature Test**: Use Cursor's AI features (Chat, Code generation)

#### Troubleshooting
- **Connection refused**: Verify server is running at `http://localhost:8080`
- **Invalid JSON**: Validate `mcp_config.json` syntax
- **No AI responses**: Check Cursor's output logs for connection errors

</details>

<details>
<summary>🧠 <strong>JetBrains AI Assistant</strong></summary>

#### Prerequisites
- JetBrains IDE (IntelliJ, PyCharm, etc.) with [AI Assistant](https://www.jetbrains.com/ai/) plugin
- Running Firecrawl MCP server

#### Installation
1. Open IDE Settings (`Ctrl+Alt+S`)
2. Navigate to Tools → AI Assistant → Model Context Protocol (MCP)
3. Look for custom/local AI provider settings

#### Configuration
Add custom server endpoint in AI Assistant settings:
```yaml
providers:
  - name: firecrawl_mcp
    url: http://localhost:8080
    api_key: placeholder
```

#### Verification
- **Settings Check**: Verify server status in Settings → Tools → AI Assistant → Model Context Protocol (MCP)
- **Chat Commands**: Use `/` commands in AI chat to access MCP tools
- **Feature Test**: Use AI Assistant features (code completion, explanation)

#### Troubleshooting
- **Feature unavailable**: Custom endpoints may require specific subscription tier
- **Connection failed**: Verify server URL and check firewall settings
- **Authentication issues**: May need to modify server for JetBrains-specific headers

</details>

<details>
<summary>⚡ <strong>Zed</strong></summary>

High-performance multiplayer code editor. [Official Docs](https://zed.dev/docs)

#### Prerequisites
- [Zed](https://zed.dev/download) installed
- Running Firecrawl MCP server

#### Installation
1. Open Zed settings (`File` → `Settings` → `Open Settings`)
2. Configure as Language Server Protocol (LSP) provider

#### Configuration
Add to `settings.json`:
```json
{
  "context_servers": {
    "firecrawl": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/index.js"]
    }
  }
}
```

#### Verification
- **Settings Check**: Verify MCP server appears under "context_servers" in settings.json
- **Status Indicators**: Red/green dots for connection status
- **Feature Test**: Use Zed's AI features

#### Troubleshooting
- **Server not starting**: Verify absolute path in configuration
- **No LSP features**: Zed may need specific LSP capabilities from server
- **Connection timeout**: Check server startup time and logs

</details>

<details>
<summary>🏢 <strong>Visual Studio</strong></summary>

Microsoft's IDE for .NET development.

#### Prerequisites
- [Visual Studio](https://visualstudio.microsoft.com/) installed
- Running Firecrawl MCP server

#### Installation
Configure as External Tool:
1. Go to `Tools` → `External Tools...`
2. Click `Add` and configure:
   - **Title**: `Start Firecrawl MCP Server`
   - **Command**: `C:\Program Files\nodejs\node.exe`
   - **Arguments**: `index.js`
   - **Initial directory**: `C:\path\to\mcp-server`

#### Configuration
This setup starts the server. Full integration requires custom VSIX extension.

#### Verification
Run external tool from Tools menu - terminal should open and start server.

#### Troubleshooting
- **Command not found**: Verify Node.js installation path
- **Server fails**: Check initial directory path and `.env` file
- **Permission denied**: Run Visual Studio as Administrator

</details>

### Desktop Applications

<details>
<summary>🤖 <strong>Claude Desktop</strong></summary>

Desktop application for Claude AI. [Official MCP Docs](https://docs.anthropic.com/claude/docs/model-context-protocol)

#### Prerequisites
- Claude Desktop application installed
- Running Firecrawl MCP server

#### Configuration
**Configuration Locations:**
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.claude.json`

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

#### Verification
- **UI Indicator**: Hammer icon (🔨) appears in bottom-right corner of conversation input
- **Tool Verification**: Click hammer icon to view available tools from connected MCP servers
- **Status Check**: Green dots indicate successful connections, red dots indicate issues

#### Troubleshooting
- **No hammer icon**: Check configuration file location and JSON syntax
- **Connection timeout**: Check network/firewall settings
- **Authentication errors**: Server may need to handle Claude-specific auth headers

</details>

<details>
<summary>🔨 <strong>Smithery</strong></summary>

AI agent building platform. [Official Docs](https://smithery.ai/)

#### Prerequisites
- Smithery account and CLI installed
- Running Firecrawl MCP server

#### Installation
```bash
# Install Firecrawl MCP server
smithery install \
  --server=github.com/firecrawl/mcp-server \
  --token=$FIRECRAWL_API_KEY
```

#### Configuration
Create `agent.yaml` with Firecrawl tool:

```yaml
id: firecrawl_tool
name: Firecrawl Web Search
description: "Uses Firecrawl to search and scrape web pages"
action:
  type: http
  endpoint: http://localhost:8080/crawl
  method: POST
  headers:
    Content-Type: "application/json"
  body: '{"url": "{{input.url}}"}'
```

#### Verification
```bash
smithery run my_agent --input '{"url": "https://example.com"}'
```

#### Troubleshooting
- **404 Not Found**: Verify endpoint URL and server status
- **Invalid input**: Check request body format matches server expectations
- **Token issues**: Use environment variables for sensitive tokens

</details>

<details>
<summary>🏠 <strong>LM Studio</strong></summary>

Local LLM serving platform. [Official Docs](https://lmstudio.ai/)

#### Prerequisites
- [LM Studio](https://lmstudio.ai/) installed with model downloaded and served
- Running Firecrawl MCP server

#### Installation
Advanced setup - modify Firecrawl server to use LM Studio as backend:
1. Start LM Studio local server (note address, e.g., `http://localhost:1234/v1`)
2. Modify Firecrawl server code to forward requests to LM Studio

#### Configuration
In server code, change model endpoint:
```javascript
const LLM_ENDPOINT = process.env.LM_STUDIO_ENDPOINT || 'http://localhost:1234/v1/chat/completions';
```

#### Verification
Connect MCP client to Firecrawl server. Check logs for LM Studio forwarding.

#### Troubleshooting
- **API mismatch**: Ensure LM Studio's OpenAI-compatible API matches server expectations
- **Model not loaded**: Verify model is fully loaded in LM Studio
- **Connection failed**: Check LM Studio server address and port

</details>

<details>
<summary>🌀 <strong>Windsurf</strong></summary>

#### Prerequisites
- Windsurf IDE installed
- Running Firecrawl MCP server

#### Configuration
**Configuration Locations:**
- **User-level**: `~/.codeium/windsurf/mcp_config.json` (applies to all projects)
- **Workspace-level**: `.windsurf/mcp_config.json` in project root (project-specific)

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "your_api_key_here"
      },
      "timeout": 30000,
      "autoRestart": true
    }
  }
}
```

#### Verification
- **IDE Restart**: Restart Windsurf after configuration
- **Command Palette**: Open command palette (Ctrl/Cmd+Shift+P)
- **MCP Commands**: Search for "MCP" or "Firecrawl" commands
- **Hammer icon**: Configure → panel shows firecrawl status

#### Troubleshooting
- **Extension not found**: Update Windsurf to latest version
- **Configuration errors**: Validate JSON syntax with JSON linter
- **Status**: 🔶 **Beta support** - Under active development

</details>

<details>
<summary>🔍 <strong>Perplexity Desktop</strong></summary>

#### Prerequisites  
- Perplexity Desktop app installed
- Running Firecrawl MCP server

#### Configuration
**Configuration Locations:**
- **GUI Settings**: Perplexity → Settings → Tools & Extensions → Custom Tools
- **Config File**: `~/.perplexity/connectors.json` (if file-based config available)

**UI Configuration Steps:**
1. Open Perplexity Desktop → **Settings** → **Connectors**
2. Click **Add Connector** → choose **Custom MCP**
3. Enter name "firecrawl" and CLI command: `npx -y firecrawl-mcp`
4. Add `FIRECRAWL_API_KEY` in the environment variables field

#### Verification
- **Settings Access**: Perplexity → Settings → Tools & Extensions
- **Connector Status**: Connectors list shows **firecrawl – Running**
- **Tool Visibility**: Check for Firecrawl in available tools list
- **Test Integration**: Try using custom tool in a conversation

#### Troubleshooting
- **No custom tools**: Verify Perplexity Desktop version supports extensions
- **Connection failed**: Check local server status and firewall settings
- **Authentication issues**: Verify API key configuration and format
- **Status**: 🔶 **Experimental** - Limited official documentation

</details>

### CLI Tools

<details>
<summary>⌨️ <strong>cLine</strong></summary>

Command-line interface for direct server interaction.

#### Prerequisites
- `curl` or similar HTTP client installed
- Running Firecrawl MCP server

#### Installation
Use terminal commands to interact with server directly.

#### Configuration
No additional configuration needed - use server endpoints directly.

#### Verification
**Crawl a URL**:
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"url": "https://firecrawl.dev/blog"}' \
  http://localhost:8080/crawl
```

**Search**:
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"query": "latest AI agents"}' \
  http://localhost:8080/search
```

#### Troubleshooting
- **Connection refused**: Verify server is running on port 8080
- **Invalid JSON**: Check JSON syntax in request body
- **Empty response**: Check server logs for errors

</details>

<details>
<summary>🟠 <strong>Amazon Q Developer CLI</strong></summary>

AWS AI-powered developer assistant. [Official Docs](https://aws.amazon.com/q/developer/)

#### Prerequisites
- AWS CLI and Amazon Q Developer CLI installed and configured
- Running Firecrawl MCP server

#### Installation
**Method 1: Native MCP Commands**
```bash
# Add MCP server
qchat mcp add --name firecrawl --url http://localhost:8080

# List configured servers
qchat mcp list

# Check status
qchat mcp status
```

**Method 2: Wrapper Script**
Create wrapper script to integrate Firecrawl with Amazon Q:

```bash
#!/bin/bash
# q-firecrawl.sh
echo "Enter URL to crawl:"
read user_url

crawled_content=$(curl -s -X POST -H "Content-Type: application/json" \
  -d "{\"url\":\"$user_url\"}" http://localhost:8080/crawl)

aws q chat --text "Summarize this content: $crawled_content"
```

#### Configuration
Ensure AWS credentials are configured for Amazon Q CLI.

#### Verification
```bash
# Test native commands
qchat mcp list
qchat mcp status

# Test wrapper script
chmod +x q-firecrawl.sh
./q-firecrawl.sh
```

#### Troubleshooting
- **Script errors**: Ensure `curl` and `aws` in PATH, use `bash -x` to debug
- **Authentication**: Verify AWS credentials with `aws configure list`
- **API limits**: Check AWS Q usage quotas

</details>

<details>
<summary>💎 <strong>Gemini CLI</strong></summary>

Google's Gemini AI command-line interface.

#### Prerequisites
- Google Cloud SDK (`gcloud`) installed and configured with Gemini access
- Running Firecrawl MCP server
- `jq` installed for JSON parsing

#### Installation
Create wrapper script `gemini-firecrawl.sh`:

```bash
#!/bin/bash
echo "Enter URL to analyze:"
read user_url

crawled_content=$(curl -s -X POST -H "Content-Type: application/json" \
  -d "{\"url\":\"$user_url\"}" http://localhost:8080/crawl | jq -r .data.content)

gcloud ai models predict gemini-pro --text "Analyze this text: $crawled_content"
```

#### Configuration
Ensure Google Cloud authentication: `gcloud auth login`

#### Verification
```bash
chmod +x gemini-firecrawl.sh
./gemini-firecrawl.sh
```

#### Troubleshooting
- **jq not found**: Install with `sudo apt install jq` (Ubuntu) or `brew install jq` (Mac)
- **GCloud authentication**: Run `gcloud auth login` and select correct project
- **API access**: Verify Gemini API is enabled in Google Cloud Console

</details>

<details>
<summary>🚀 <strong>RovoDev CLI</strong></summary>

Developer productivity platform. [Official Docs](https://rovodev.com/)

#### Prerequisites
- RovoDev CLI installed
- Running Firecrawl MCP server

#### Installation
1. Create tool definition file `firecrawl-tool.json`:

```json
{
  "name": "firecrawl",
  "description": "Crawls a webpage and returns its content",
  "endpoint": "http://localhost:8080/crawl",
  "method": "POST",
  "parameters": {
    "url": {
      "type": "string",
      "description": "The URL to crawl"
    }
  }
}
```

2. Register tool:
```bash
rovodev tools:add --file firecrawl-tool.json
```

#### Configuration
Tool configuration handled via JSON definition file.

#### Verification
```bash
rovodev use firecrawl --params '{"url": "https://example.com"}'
```

#### Troubleshooting
- **Tool not found**: Check tool registration with `rovodev tools:list`
- **Endpoint unreachable**: Verify server URL and status
- **Invalid parameters**: Check JSON syntax in tool definition

</details>

### Additional Environments

<details>
<summary>🔍 <strong>Augment Code</strong></summary>

AI-powered code assistant with LSP support. [Official Docs](https://augmentcode.ai/)

#### Prerequisites
- Augment Code IDE/extension installed
- Running Firecrawl MCP server
- LSP client capabilities enabled

#### Configuration
```json
{
  "languageServers": {
    "firecrawl-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/index.js"],
      "rootPatterns": ["package.json", ".git"],
      "filetypes": ["*"],
      "initializationOptions": {
        "env": {
          "FIRECRAWL_API_KEY": "your_api_key_here"
        }
      }
    }
  }
}
```

#### Verification
- Check LSP status indicators in IDE
- Look for MCP-related autocomplete/suggestions
- Check Output/Logs panel for LSP messages

#### Troubleshooting
- **LSP server not starting**: Check absolute path and Node.js availability
- **No LSP features**: Verify Augment Code supports custom LSP servers
- **Connection timeout**: Increase timeout values in LSP configuration

</details>

<details>
<summary>⚡ <strong>BoltAI</strong></summary>

#### Prerequisites
- BoltAI installed
- Running Firecrawl MCP server

#### Configuration
```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "fc-your_api_key_here"
      },
      "timeout": 30000,
      "autoRestart": true
    }
  }
}
```

#### Verification
- **Settings Check**: Open BoltAI → Settings → Plugins → see MCP servers list
- **Tools Appearance**: Tools appear in chat toolbar
- **Tool Usage**: Use `/mcp__servername__toolname` or Tools panel

#### Troubleshooting
- **Service not found**: Check BoltAI documentation for custom service support
- **Connection failed**: Verify server URL and firewall settings
- **Status**: ⚠️ **Well-documented** - Official documentation available

</details>

<details>
<summary>💻 <strong>Claude Code</strong></summary>

#### Prerequisites
- Claude Code application installed (CLI app, not VS Code extension)
- Running Firecrawl MCP server

#### Configuration
```json
{
  "projects": {
    "/path/to/project": {
      "mcpServers": {
        "firecrawl": {
          "command": "npx",
          "args": ["-y", "firecrawl-mcp"],
          "env": {
            "FIRECRAWL_API_KEY": "${FIRECRAWL_API_KEY}"
          }
        }
      }
    }
  }
}
```

#### Verification
- **List servers**: `claude mcp list`
- **Check server**: `claude mcp get firecrawl`
- **In-app check**: Type `/mcp` in Claude Code
- **Use tools**: `/mcp__firecrawl__scrape_url` format

#### Troubleshooting
- **No custom endpoint option**: Check if version supports custom APIs
- **Authentication errors**: May need to modify server for Claude-specific headers
- **Timeout**: Set `MCP_TIMEOUT=10000`

</details>

<details>
<summary>🤖 <strong>Copilot Coding Agent</strong></summary>

GitHub Copilot-powered coding assistant. [Official Docs](https://github.com/features/copilot)

#### Prerequisites
- GitHub Copilot subscription or Copilot Coding Agent installed
- Running Firecrawl MCP server

#### Configuration
```yaml
# ~/.copilot/agent-config.yaml
providers:
  - name: firecrawl_mcp
    type: mcp
    url: http://localhost:8080
    description: "Firecrawl web scraping and content extraction"
    capabilities:
      - code_completion
      - code_explanation
      - web_search
      - content_extraction
```

#### Verification
```bash
# Check agent configuration
copilot config list
copilot providers list

# Test custom provider
copilot test-provider firecrawl_mcp
```

#### Troubleshooting
- **Provider not found**: Check YAML/JSON syntax in configuration
- **Connection refused**: Ensure Firecrawl MCP server is running on port 8080
- **Feature not available**: Custom providers may require specific Copilot version

</details>

<details>
<summary>💥 <strong>Crush</strong></summary>

#### Prerequisites
- Crush installed
- Running Firecrawl MCP server

#### Configuration
```json
{
  "mcp": {
    "servers": [
      {
        "name": "firecrawl",
        "type": "http",
        "url": "http://localhost:8080"
      }
    ]
  }
}
```

#### Verification
Configure Crush to use MCP configuration or test transport types.

#### Troubleshooting
- **Transport issues**: Try both HTTP and STDIO transport types
- **Status**: ⚠️ **Community documented** - Configuration examples available

</details>

<details>
<summary>🎯 <strong>Kiro</strong></summary>

#### Prerequisites
- Kiro installed
- Running Firecrawl MCP server

#### Configuration
```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/index.js"],
      "env": {
        "FIRECRAWL_API_KEY": "your_api_key_here"
      },
      "disabled": false,
      "autoApprove": ["crawl", "search"]
    }
  }
}
```

#### Verification
- **Status Check**: MCP Servers tab shows green (connected) or red (error) indicators
- **Tool Test**: Click tool name to insert placeholder into chat
- **Execution Test**: Ask Kiro to run tool (e.g., "Search docs with #MCP")

#### Troubleshooting
- **No custom endpoint**: Check documentation for plugin/extension support
- **Server not appearing**: Refresh panel or restart Kiro
- **Workspace override**: Workspace settings override user settings

</details>

<details>
<summary>🌐 <strong>Open Code</strong></summary>

Open-source code editor with extensible LSP support. [Official Docs](https://opencode.dev/)

#### Prerequisites
- Open Code editor installed
- Running Firecrawl MCP server
- LSP extension/plugin enabled

#### Configuration
```json
{
  "lsp": {
    "servers": {
      "firecrawl-mcp": {
        "command": "node",
        "args": ["/absolute/path/to/mcp-server/index.js"],
        "env": {
          "FIRECRAWL_API_KEY": "your_api_key_here",
          "PORT": "8080"
        },
        "capabilities": {
          "textDocumentSync": 1,
          "completionProvider": true,
          "hoverProvider": true,
          "codeActionProvider": true
        }
      }
    }
  }
}
```

#### Verification
- Check LSP server status in editor status bar
- Test LSP functionality: autocomplete, hover, code actions
- Verify server logs for connections

#### Troubleshooting
- **LSP server not starting**: Verify absolute path to server script
- **No LSP features available**: Confirm Open Code LSP extension is installed
- **Connection refused**: Check if server port is correct (8080)

</details>

<details>
<summary>🔮 <strong>OpenAI Codex</strong></summary>

OpenAI's code generation model integration. [Official Docs](https://platform.openai.com/docs/)

#### Prerequisites
- OpenAI API access with Codex model availability
- Running Firecrawl MCP server
- Server-side integration capabilities

#### Configuration
```env
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=code-davinci-002
OPENAI_ENDPOINT=https://api.openai.com/v1/completions
FIRECRAWL_API_KEY=your_firecrawl_api_key
```

#### Installation
1. **Install OpenAI SDK**:
```bash
cd mcp-server
npm install openai
```

2. **Configure Server Integration** - modify server to use Codex as LLM backend

#### Verification
```bash
# Test OpenAI API connection
curl -X POST https://api.openai.com/v1/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "code-davinci-002", "prompt": "def add_numbers(", "max_tokens": 50}'

# Test MCP server with Codex integration
curl -X POST -H "Content-Type: application/json" \
  -d '{"action": "generateCode", "prompt": "Create a Python function to sort a list"}' \
  http://localhost:8080/codex
```

#### Troubleshooting
- **API key invalid**: Verify OpenAI API key format (starts with `sk-`)
- **Model not available**: Check Codex model availability in your OpenAI account
- **Rate limiting**: Implement exponential backoff in server code

</details>

<details>
<summary>🎨 <strong>Qodo Gen</strong></summary>

#### Prerequisites
- Qodo Gen installed
- Running Firecrawl MCP server

#### Configuration
Search for "API Endpoint", "Custom Server", or "LLM Provider" settings:
```json
{
  "provider_url": "http://localhost:8080"
}
```

#### Installation
**Method 1: Agentic Mode**
1. Navigate to Agentic Mode → "Connect more tools" → "Add new MCP"
2. Configure server details

**Method 2: CLI Support**
```bash
qodo <agent-name> --mcp
```

#### Verification
Use Qodo Gen features and check server connections.

#### Troubleshooting
- **Settings not found**: Check Qodo Gen documentation
- **Provider not working**: Verify server compatibility
- **Status**: ⚠️ **Officially supported** - Comprehensive documentation available

</details>

<details>
<summary>🦘 <strong>Roo Code</strong></summary>

#### Prerequisites
- Roo Code installed
- Running Firecrawl MCP server

#### Configuration
```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "your_api_key_here"
      },
      "autoStart": true,
      "timeout": 30000
    }
  }
}
```

#### Verification
- **MCP Icon Check**: MCP icon shows list of configured servers
- **Tool Test**: Insert tool placeholder from MCP panel into chat prompt
- **Execution Test**: Run tool and verify output confirms connectivity

#### Troubleshooting
- **Extension not loading**: Check server startup and logs
- **Missing MCP icon**: Ensure latest version of Roo Code
- **Config not found**: Use MCP icon to open correct settings file

</details>

<details>
<summary>🌊 <strong>Trae</strong></summary>

#### Prerequisites
- Trae installed and configured
- Running Firecrawl MCP server
- YAML configuration access

#### Configuration
```yaml
tools:
  - name: firecrawl
    type: http
    endpoint: http://localhost:8080/crawl
    method: POST
    headers:
      Content-Type: "application/json"
    body_template: |
      {
        "url": "{{.url}}"
      }
    timeout: 30s
```

#### Verification
- **Tool Registration**: Check `trae tools list` shows firecrawl
- **Agent Test**: Run `trae agent test web_crawler`
- **Direct Usage**: Use Trae with Firecrawl tool in workflow

#### Troubleshooting
- **Tool not recognized**: Check Trae's tool definition format and YAML syntax
- **HTTP errors**: Verify endpoint URL and request format
- **Status**: 🔶 **Community supported** - Check Trae documentation

</details>

<details>
<summary>⚡ <strong>Warp</strong></summary>

#### Prerequisites
- [Warp terminal](https://www.warp.dev/) installed
- Running Firecrawl MCP server

#### Installation
**Method 1: MCP Server Configuration (Recommended)**
- Navigate to MCP servers page via Warp Drive → Personal → MCP Servers
- Configure server through GUI

**Method 2: Terminal Aliases**
Add to `.bashrc` or `.zshrc`:
```bash
alias firecrawl-crawl='curl -X POST -H "Content-Type: application/json" -d'
alias firecrawl-search='curl -X POST -H "Content-Type: application/json" -d'
```

#### Verification
**Method 1: MCP Servers Page**
- Running servers show green status
- Each server displays available tools and resources

**Method 2: Alias Test**
```bash
firecrawl-crawl '{"url": "https://example.com"}' http://localhost:8080/crawl
```

#### Troubleshooting
- **Alias not working**: Reload shell configuration with `source ~/.bashrc`
- **MCP server not listed**: Verify server is running and configuration is correct

</details>

<details>
<summary>🔧 <strong>Zencoder</strong></summary>

#### Prerequisites
- Zencoder IDE installed
- Running Firecrawl MCP server

#### Configuration
```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "your_api_key_here"
      },
      "timeout": 30000,
      "autoStart": true,
      "description": "Firecrawl web scraping and content extraction"
    }
  }
}
```

#### Verification
- **Preferences Check**: Zencoder → Preferences → Services → MCP Servers
- **Command Palette**: Search for MCP commands
- **Agent Tools panel**: Lists firecrawl and its tools
- **Tool execution**: Trigger a tool via panel or in-chat command

#### Troubleshooting
- **No MCP support**: Verify Zencoder version supports MCP protocol
- **Configuration errors**: Check JSON format and file permissions
- **Status**: 🔶 **Limited documentation** - Community-driven support

</details>

## Troubleshooting

<details>
<summary>🔧 <strong>Common Server Issues</strong></summary>

**Port Already in Use**
```bash
# Find process using port 8080
lsof -i :8080  # Linux/macOS
netstat -ano | findstr :8080  # Windows

# Kill process
kill -9 <PID>  # Linux/macOS
taskkill /PID <PID> /F  # Windows

# Use alternative port
env PORT=8081 npx -y firecrawl-mcp
```

**Invalid API Key Errors**
```bash
# Check API key format (must start with fc-)
echo $FIRECRAWL_API_KEY

# Test API key directly
curl -H "Authorization: Bearer fc-your_api_key" https://api.firecrawl.dev/v0/crawl

# Common format issues:
# ❌ Wrong: "your_api_key_here"
# ❌ Wrong: "firecrawl_api_key"
# ✅ Correct: "fc-your_api_key_here"
```

**Server Won't Start**
```bash
# Check Node.js version
node --version  # Must be ≥18.0.0

# Check for missing dependencies
npm install

# Run with debug output
DEBUG=* npx -y firecrawl-mcp
```

**Connection Refused**
```bash
# Test server health
curl http://localhost:8080/health

# Check if server is running
ps aux | grep node  # Linux/macOS
Get-Process -Name node  # Windows PowerShell

# Check firewall
sudo ufw allow 8080  # Linux
# Windows: Allow through Windows Defender Firewall
```

</details>

<details>
<summary>🔧 <strong>Configuration Issues</strong></summary>

**JSON Parse Errors**
```bash
# Validate JSON configuration
cat config.json | jq .  # Linux/macOS with jq
python -m json.tool config.json  # Cross-platform

# Common JSON mistakes:
# ❌ Trailing commas
# ❌ Missing quotes around strings
# ❌ Incorrect escaping in paths
```

**Environment Variables Not Loading**
```bash
# Check if .env file exists
ls -la .env

# Test environment loading
node -e "require('dotenv').config(); console.log(process.env.FIRECRAWL_API_KEY)"

# Source environment manually
source .env  # Linux/macOS
```

</details>

<details>
<summary>🔧 <strong>Network & Security</strong></summary>

**Firewall Configuration**
```bash
# Linux (ufw)
sudo ufw allow 8080/tcp

# macOS
# System Preferences → Security & Privacy → Firewall → Allow Node.js

# Windows PowerShell (Admin)
New-NetFirewallRule -DisplayName "Firecrawl MCP" -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow
```

**Proxy Configuration**
```bash
# Set proxy for npm
npm config set proxy http://proxy.company.com:8080
npm config set https-proxy http://proxy.company.com:8080

# Set proxy for curl
export http_proxy=http://proxy.company.com:8080
export https_proxy=http://proxy.company.com:8080
```

</details>

<details>
<summary>🆘 <strong>Getting Help</strong></summary>

**Debug Information to Collect:**
```bash
# System information
node --version
npm --version
curl --version

# Server logs
tail -f logs/server.log

# Environment details
env | grep -E "(FIRECRAWL|NODE|PORT)"

# Network connectivity
curl -v http://localhost:8080/health
```

**Useful Resources:**
- **Official Documentation**: [firecrawl.dev](https://www.firecrawl.dev/)
- **MCP Specification**: [modelcontextprotocol.io](https://modelcontextprotocol.io/)
- **GitHub Issues**: [github.com/firecrawl/firecrawl-mcp-server](https://github.com/firecrawl/firecrawl-mcp-server/issues)

</details>

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