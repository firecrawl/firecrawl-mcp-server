# Firecrawl MCP Server Installation Guide

Complete instructions for installing and configuring the Firecrawl Model Context Protocol (MCP) Server across 30+ development environments.

## Table of Contents

- [General Prerequisites](#general-prerequisites)
  - [Quick Server Setup](#quick-server-setup)
- [Runtime Environments](#runtime-environments)
  - [Docker](#docker)
  - [Node.js](#nodejs)
  - [Bun](#bun)
  - [Deno](#deno)
  - [Windows](#windows)
- [IDEs and Editors](#ides-and-editors)
  - [VS Code](#vs-code)
  - [Cursor](#cursor)
  - [JetBrains AI Assistant](#jetbrains-ai-assistant)
  - [Zed](#zed)
  - [Visual Studio](#visual-studio)
- [Desktop Applications](#desktop-applications)
  - [Claude Desktop](#claude-desktop)
  - [Smithery](#smithery)
  - [LM Studio](#lm-studio)
  - [Perplexity Desktop](#perplexity-desktop)
- [CLI Tools](#cli-tools)
  - [cLine](#cline)
  - [Amazon Q Developer CLI](#amazon-q-developer-cli)
  - [Gemini CLI](#gemini-cli)
  - [RovoDev CLI](#rovodev-cli)
- [Additional Environments](#additional-environments)
  - [Augment Code](#augment-code)
  - [BoltAI](#boltai)
  - [Claude Code](#claude-code)
  - [Copilot Coding Agent](#copilot-coding-agent)
  - [Crush](#crush)
  - [Kiro](#kiro)
  - [Open Code](#open-code)
  - [OpenAI Codex](#openai-codex)
  - [Qodo Gen](#qodo-gen)
  - [Roo Code](#roo-code)
  - [Trae](#trae)
  - [Warp](#warp)
  - [Windsurf](#windsurf)
  - [Zencoder](#zencoder)
- [Troubleshooting & Tips](#troubleshooting--tips)

---

## General Prerequisites

- **Node.js**: Version ≥18.0.0 (recommended ≥20) ([Download](https://nodejs.org/))
- **Package Manager**: npm, yarn, or pnpm
- **Firecrawl API Key**: Get one from [firecrawl.dev](https://www.firecrawl.dev/)

### Version Compatibility

**Current Version**: v1.2.1+ (latest stable)
- **MCP Protocol**: Compatible with MCP specification 2024-11-05
- **Node.js**: Requires ≥18.0.0, recommended ≥20
- **Package Names**: 
  - Primary: `firecrawl-mcp`
  - Alternative: `@firecrawl/mcp-server`

### Server-Sent Events (SSE) Support

**SSE Capabilities**:
- **Local SSE**: Available on port 3000 with `SSE_LOCAL=true`
- **Remote SSE**: Hosted endpoint at `https://mcp.firecrawl.dev/{API_KEY}/v2/sse`
- **Compatible Clients**: Claude Desktop, VS Code, Cursor, and other MCP clients supporting SSE transport

**SSE Configuration**:
```env
# Enable local SSE mode
SSE_LOCAL=true
SSE_PORT=3000

# Use remote SSE (no local server required)
REMOTE_SSE_URL=https://mcp.firecrawl.dev/fc-your_api_key/v2/sse
```

### Quick Server Setup

```bash
# Clone repository (CORRECTED)
git clone https://github.com/firecrawl/firecrawl-mcp-server.git
cd firecrawl-mcp-server

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env and add: FIRECRAWL_API_KEY="fc-your_api_key_here"

# Method 1: Start local server
npm start

# Method 2: Install and run globally
npm install -g firecrawl-mcp

# Method 3: Run directly with npx (recommended)
env FIRECRAWL_API_KEY=fc-YOUR_API_KEY npx -y firecrawl-mcp

# Method 4: Custom port
env FIRECRAWL_API_KEY=fc-YOUR_API_KEY npx -y firecrawl-mcp --port 8081
```

**Remote-Hosted Option (No Local Server Required):**
```bash
# Connect directly to hosted endpoint
# Use this URL in your MCP client configuration:
https://mcp.firecrawl.dev/fc-YOUR_API_KEY/v2/sse
```

**Alternative Package Names:**
- **Primary**: `firecrawl-mcp`
- **Alternative**: `@firecrawl/mcp-server`

**Default Ports:**
- Standard operation: `http://localhost:8080`
- SSE mode: `http://localhost:3000` (with `SSE_LOCAL=true`)
- Custom port: Use `--port` flag or `PORT` environment variable

**Remote Server Option:**
- Hosted URL: `https://mcp.firecrawl.dev/{FIRECRAWL_API_KEY}/v2/sse`

**Version Requirements:**
- **Minimum Server Version**: v1.2.1+
- **API Key Format**: Must start with `fc-` prefix
- **Node.js**: ≥18.0.0 (recommended ≥20)

**Version Check:**
```bash
node --version  # Should show ≥18.0.0
npx firecrawl-mcp --version  # Check latest version (v1.2.1+)
```

---

## Runtime Environments

## Docker

#### ✅ Prerequisites
- [Docker](https://docs.docker.com/get-docker/) installed and running
- **Platform Requirements**: Docker Desktop (Windows/macOS) or Docker Engine (Linux)

#### ⚙️ Installation
1. **Create Dockerfile** in project root:

<details>
<summary>Click to expand Dockerfile</summary>

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
</details>

2. **Build and run**:

<details>
<summary>Click to expand build commands</summary>

```bash
# Build image
docker build --build-arg "FIRECRAWL_API_KEY=fc-your_api_key" -t firecrawl-mcp .

# Run container (default port 8080)
docker run -d -p 8080:8080 --name firecrawl-mcp firecrawl-mcp

# Run with custom port
docker run -d -p 8081:8080 --name firecrawl-mcp firecrawl-mcp

# Alternative with environment file
docker run -d -p 8080:8080 --env-file .env --name firecrawl-mcp firecrawl-mcp

# Using official Docker Hub image (if available)
docker run -d -p 8080:8080 \
  -e FIRECRAWL_API_KEY=fc-your_api_key \
  --name firecrawl-mcp \
  mcp/firecrawl:latest

# Custom internal port
docker run -d -p 8080:8081 \
  -e FIRECRAWL_API_KEY=fc-your_api_key \
  -e PORT=8081 \
  --name firecrawl-mcp \
  mcp/firecrawl:latest
```
</details>

#### 🔑 Configuration
**Environment Variables**:
- Set API key via build argument: `--build-arg "FIRECRAWL_API_KEY=fc-your_key"`
- Or via runtime environment: `--env FIRECRAWL_API_KEY=fc-your_key`
- Use `.env` file: `--env-file .env`

**API Key Format**: Keys should start with `fc-` prefix

**Port Configuration**:
- **Default**: Internal port 8080, external port 8080
- **Custom external**: `-p 8081:8080` (external:internal)
- **Custom internal**: `-e PORT=8081` + `-p 8080:8081`

#### 🧪 Verification

<details>
<summary>Click to expand verification commands</summary>

```bash
# Check container status
docker ps | grep firecrawl-mcp

# Test health endpoint
curl http://localhost:8080/health
# Expected: {"status":"ok"}

# Test with custom port
curl http://localhost:8081/health

# Check logs
docker logs firecrawl-mcp

# Test MCP functionality (if MCP CLI available)
docker exec firecrawl-mcp mcp --help
docker exec firecrawl-mcp mcp client ls
```
</details>

#### 🛠 Troubleshooting

<details>
<summary>Click to expand troubleshooting guide</summary>

**Common Issues**:
- **Docker daemon not running**: 
  - **Windows/macOS**: Start Docker Desktop
  - **Linux**: `sudo systemctl start docker`
- **Port already allocated**: Change port mapping `-p 8081:8080`
- **Build context too large**: Add `.dockerignore` file:
  ```
  node_modules
  .git
  *.log
  ```
- **Permission denied**: 
  - **Linux**: Add user to docker group: `sudo usermod -aG docker $USER`
  - **Windows**: Run as Administrator
- **Out of disk space**: Clean up: `docker system prune`
- **API key not working**: Check environment variable format and escaping
- **Container exits immediately**: Check logs with `docker logs firecrawl-mcp`
</details>

## Node.js

#### ✅ Prerequisites
- Node.js v18+ and npm installed (minimum Node.js ≥18.0.0, recommended ≥20)

#### ⚙️ Installation
Follow the [Quick Server Setup](#quick-server-setup) instructions above, or use direct installation:

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

#### 🔑 Configuration
**API Key Format**: Keys should start with `fc-` prefix
```env
FIRECRAWL_API_KEY="fc-your_api_key_here"
PORT=8080
```

#### 🧪 Verification
```bash
# Check Node.js version first
node --version

# Test installation
npx firecrawl-mcp --version

# Start and test server
npm start
# In another terminal:
curl http://localhost:8080/health

# Test with custom port
PORT=8081 npm start
# Then: curl http://localhost:8081/health
```

#### 🛠 Troubleshooting
- **Command not found**: Node.js not in PATH - reinstall Node.js
- **Missing API key**: Check `.env` file exists and contains valid key with `fc-` prefix
- **Permission denied**: Use `sudo npm install -g` or configure npm properly
- **Version incompatibility**: Ensure Node.js ≥18.0.0 with `node --version`

## Bun

Fast JavaScript runtime alternative to Node.js. [Official Docs](https://bun.sh/docs)

#### ✅ Prerequisites
- [Bun](https://bun.sh/docs/installation) installed

#### ⚙️ Installation
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

#### 🔑 Configuration
Same `.env` configuration as Node.js with `fc-` prefix:
```env
FIRECRAWL_API_KEY="fc-your_api_key_here"
PORT=8080
```

#### 🧪 Verification
```bash
curl http://localhost:8080/health
```

#### 🛠 Troubleshooting
- **Command not found**: Reinstall Bun following official guide
- **Package compatibility**: Some packages may not work with Bun - use `npm install` as fallback

## Deno

Modern runtime for JavaScript and TypeScript. [Official Docs](https://deno.land/manual)

#### ✅ Prerequisites
- [Deno](https://deno.land/manual/getting_started/installation) installed

#### ⚙️ Installation
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

#### 🔑 Configuration
Same `.env` configuration as Node.js with `fc-` prefix:
```env
FIRECRAWL_API_KEY="fc-your_api_key_here"
PORT=8080
```

#### 🧪 Verification
```bash
curl http://localhost:8080/health
```

#### 🛠 Troubleshooting
- **Permission denied**: Deno requires explicit permissions - use `--allow-env --allow-net`
- **NPM compatibility**: Some packages may not work - check Deno's Node.js compatibility docs

## Windows

#### ✅ Prerequisites
- [Node.js for Windows](https://nodejs.org/en/download/) (LTS version recommended)
- [Git for Windows](https://git-scm.com/download/win) (includes Git Bash)
- **Terminal Options**: PowerShell, Command Prompt, or Git Bash

#### ⚙️ Installation

<details>
<summary>Click to expand Windows installation steps</summary>

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
</details>

#### 🔑 Configuration
**Environment Variable Methods**:

<details>
<summary>Click to expand Windows environment configuration</summary>

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

**Method 4: Persistent System Variables (Requires Admin)**
```powershell
# Run as Administrator
setx FIRECRAWL_API_KEY "fc-your_api_key_here" /M
setx PORT "8080" /M
# Restart terminal for changes to take effect
```

**Method 5: User Variables (Current User Only)**
```powershell
setx FIRECRAWL_API_KEY "fc-your_api_key_here"
setx PORT "8080"
# Restart terminal for changes to take effect
```
</details>

**Configuration Verification**:

<details>
<summary>Click to expand verification commands</summary>

```powershell
# PowerShell
echo $env:FIRECRAWL_API_KEY
echo $env:PORT

# Command Prompt
echo %FIRECRAWL_API_KEY%
echo %PORT%

# Check if variables are set
if ($env:FIRECRAWL_API_KEY) { "API key is set" } else { "API key not found" }
```
</details>

#### 🧪 Verification

<details>
<summary>Click to expand Windows verification steps</summary>

```powershell
# Test server health
Invoke-RestMethod -Uri http://localhost:8080/health -Method Get

# Alternative using curl (if available)
curl http://localhost:8080/health

# Test with Windows built-in tools
powershell -command "(Invoke-WebRequest -Uri 'http://localhost:8080/health').Content"

# Check process
Get-Process -Name node | Where-Object {$_.ProcessName -eq "node"}

# Check listening ports
netstat -an | findstr 8080
```
</details>

#### 🛠 Troubleshooting

<details>
<summary>Click to expand Windows troubleshooting guide</summary>

**Common Windows Issues**:

**Git/Node.js Not Found**:
- **Solution**: Add to PATH environment variable
- **PowerShell**: `$env:PATH += ";C:\Program Files\nodejs;C:\Program Files\Git\bin"`
- **Persistent**: System Properties → Advanced → Environment Variables → PATH

**Firewall Blocking**:
- **Windows Defender**: Allow Node.js through firewall
- **PowerShell (Admin)**: `New-NetFirewallRule -DisplayName "Node.js" -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow`

**Permission Issues**:
- **PowerShell Execution Policy**: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`
- **Admin Rights**: Right-click terminal → "Run as Administrator"

**Port Already in Use**:
```powershell
# Find process using port 8080
netstat -ano | findstr :8080
# Kill process (replace PID with actual process ID)
taskkill /PID <PID> /F
```

**setx Limitations**:
- **Character limit**: 1024 characters maximum
- **Session scope**: New variables only available in new terminal windows
- **Syntax**: Don't use quotes with setx unless they're part of the value

**Environment Variable Issues**:
- **PowerShell vs CMD**: Use `$env:VARIABLE` in PowerShell, `%VARIABLE%` in CMD
- **Spaces in values**: Quote the entire value: `"value with spaces"`
- **Not persisting**: Use setx for permanent variables, restart terminal

**Node.js Path Issues**:
```powershell
# Check Node.js installation
node --version
npm --version

# Fix PATH if needed
$env:PATH += ";C:\Program Files\nodejs"

# Refresh environment variables
refreshenv  # If using Chocolatey
# Or restart terminal
```

**Git Bash Specific**:
- **Path format**: Use Unix-style paths `/c/path/to/file` instead of `C:\path\to\file`
- **Environment variables**: Use `$VARIABLE` syntax instead of `%VARIABLE%`

**Network Issues**:
- **Localhost blocked**: Try `127.0.0.1:8080` instead of `localhost:8080`
- **Antivirus blocking**: Temporarily disable or add exception for Node.js
</details>

---

## IDEs and Editors

## VS Code

#### ✅ Prerequisites
- [VS Code](https://code.visualstudio.com/) installed
- Running Firecrawl MCP server
- **Optional**: MCP extension from marketplace

#### ⚙️ Installation
1. **Access VS Code Settings**:
   - **GUI**: `Ctrl+Shift+P` → "Preferences: Open User Settings (JSON)"
   - **Menu**: File → Preferences → Settings → Open Settings (JSON)
   - **Shortcut**: `Ctrl+,` then click JSON icon

2. **Add MCP Configuration**

#### 🔑 Configuration
**Configuration Locations**:
- **User Settings**: `%APPDATA%\Code\User\settings.json` (Windows) / `~/.config/Code/User/settings.json` (Linux) / `~/Library/Application Support/Code/User/settings.json` (macOS)
- **Workspace Settings**: `.vscode/settings.json` in project root
- **MCP Config**: `.vscode/mcp.json` (if using MCP extension)

<details>
<summary>Click to expand VS Code settings.json configuration</summary>

**Method 1: Latest MCP Format (Recommended)**
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

**Method 2: Language Server Configuration**
```json
{
  "mcp.languageServers": {
    "*": {
      "server": {
        "command": "node",
        "args": ["/absolute/path/to/firecrawl-mcp-server/index.js"],
        "options": {
          "env": {
            "FIRECRAWL_API_KEY": "fc-your_api_key_here",
            "PORT": "8080"
          }
        }
      },
      "enabled": true,
      "timeout": 30000
    }
  },
  "mcp.autocomplete.enabled": true,
  "mcp.codeactions.enabled": true,
  "mcp.diagnostics.enabled": true
}
```

**Method 3: Alternative Package Configuration**
```json
{
  "mcp": {
    "servers": {
      "firecrawl": {
        "command": "npx",
        "args": ["-y", "@firecrawl/mcp-server"],
        "env": {
          "FIRECRAWL_API_KEY": "fc-your_api_key_here"
        },
        "timeout": 30000
      }
    }
  }
}
```

**Method 4: Remote Server Configuration**
```json
{
  "mcp": {
    "servers": {
      "firecrawl-remote": {
        "serverAddress": "https://mcp.firecrawl.dev/fc-your_api_key/v2/sse",
        "enabled": true,
        "protocol": "sse",
        "features": {
          "completion": true,
          "hover": true,
          "codeAction": true,
          "diagnostics": true
        }
      }
    }
  }
}
```

**Platform-Specific Paths**:
```json
{
  "mcp": {
    "servers": {
      "firecrawl": {
        "command": "${env:NODE_HOME}/node",
        "args": ["${workspaceFolder}/path/to/firecrawl-mcp-server/index.js"],
        "env": {
          "FIRECRAWL_API_KEY": "${env:FIRECRAWL_API_KEY}",
          "PATH": "${env:PATH}"
        }
      }
    }
  }
}
```
</details>

#### 🧪 Verification

<details>
<summary>Click to expand verification steps</summary>

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

# Command Palette Tests:
# - "MCP: Restart Server"
# - "MCP: Show Server Status"
# - "MCP: Show Logs"
```

**Manual Testing**:
```javascript
// In a .js file, type this and check for enhanced suggestions:
fetch('https://example.com')
  .then(response => response.text())
  .then(data => {
    // MCP should provide web-scraping related suggestions here
  });
```

**Log Verification**:
- **VS Code**: Help → Toggle Developer Tools → Console
- **Output Panel**: View → Output → MCP
- **Server Logs**: Check terminal where server is running
</details>

#### 🛠 Troubleshooting

<details>
<summary>Click to expand troubleshooting guide</summary>

**Common Issues**:

**Configuration Problems**:
- **JSON syntax error**: Use VS Code's JSON validation (red squiggles)
- **Path issues**: Use absolute paths, escape backslashes on Windows: `"C:\\path\\to\\server"`
- **Environment variables**: Check with `echo $FIRECRAWL_API_KEY` (Linux/Mac) or `echo %FIRECRAWL_API_KEY%` (Windows)

**Server Connection Issues**:
- **Port in use**: Change PORT in settings or stop conflicting process
- **Server not running**: Start server manually before opening VS Code
- **Firewall blocking**: Allow VS Code and Node.js through firewall

**No MCP Features**:
- **Extension missing**: Install MCP extension from marketplace
- **Settings not applied**: Restart VS Code after configuration changes
- **Wrong scope**: Check if settings are in user vs workspace config

**Performance Issues**:
- **Slow responses**: Increase timeout values in configuration
- **High CPU usage**: Limit document selector to specific file types
- **Memory issues**: Restart MCP server periodically

**Platform-Specific Issues**:

**Windows**:
```json
{
  "mcp.languageServers": {
    "firecrawl": {
      "server": {
        "command": "cmd",
        "args": ["/c", "npx", "-y", "firecrawl-mcp"]
      }
    }
  }
}
```

**macOS**:
```json
{
  "mcp.languageServers": {
    "firecrawl": {
      "server": {
        "command": "/usr/local/bin/node",
        "args": ["/absolute/path/to/mcp-server/index.js"]
      }
    }
  }
}
```

**Linux**:
```json
{
  "mcp.languageServers": {
    "firecrawl": {
      "server": {
        "command": "/usr/bin/node",
        "args": ["/home/user/path/to/mcp-server/index.js"]
      }
    }
  }
}
```

**Debug Steps**:
1. **Check VS Code version**: Help → About
2. **Validate JSON**: Copy settings to JSON validator
3. **Test manually**: Run server command in terminal
4. **Check logs**: Output panel and Developer Tools console
5. **Reset config**: Remove MCP config and re-add step by step
</details>

## Cursor

AI-first code editor with native MCP support. [Official MCP Docs](https://cursor.sh/docs/mcp)

#### ✅ Prerequisites
- [Cursor](https://cursor.sh/download) installed
- Running Firecrawl MCP server

#### ⚙️ Installation
1. Open Command Palette (`Cmd+K` or `Ctrl+K`)
2. Type "Configure MCP" and press Enter
3. Opens `mcp_config.json` file

#### 🔑 Configuration
**Configuration Locations:**
- **macOS**: `~/.cursor/mcp.json`
- **Windows**: `%APPDATA%\Cursor\mcp.json`
- **Linux**: `~/.cursor/mcp.json`

<details>
<summary>Click to expand mcp_config.json configuration</summary>

```json
{
  "mcpServers": {
    "firecrawl-local": {
      "model": "firecrawl/firecrawl-mcp",
      "api_key": "fc-placeholder-key",
      "base_url": "http://localhost:8080"
    },
    "firecrawl-remote": {
      "url": "https://mcp.firecrawl.dev/fc-your_api_key/v2/sse",
      "transport": "sse",
      "enabled": true
    }
  },
  "rules": [
    {
      "pattern": "**/*",
      "providers": ["firecrawl-local", "firecrawl-remote"]
    }
  ]
}
```
</details>

**Note for Cursor v0.48.6+**: Use complete JSON object with "mcpServers" wrapper.

#### 🧪 Verification
- **Settings Check**: Cursor Settings → Features → MCP Servers
- **UI Confirmation**: Added servers appear in MCP Servers list with status indicators
- **Feature Test**: Use Cursor's AI features (Chat, Code generation)
- **Server Console**: Check server console for incoming requests

#### 🛠 Troubleshooting
- **Connection refused**: Verify server is running at `http://localhost:8080`
- **Invalid JSON**: Validate `mcp_config.json` syntax
- **No AI responses**: Check Cursor's output logs for connection errors
- **JSON Parse Errors**: Ensure complete JSON object structure for v0.48.6+

## JetBrains AI Assistant

#### ✅ Prerequisites
- JetBrains IDE (IntelliJ, PyCharm, etc.) with [AI Assistant](https://www.jetbrains.com/ai/) plugin
- Running Firecrawl MCP server

#### ⚙️ Installation
1. Open IDE Settings (`Ctrl+Alt+S`)
2. Navigate to Tools → AI Assistant → Model Context Protocol (MCP)
3. Look for custom/local AI provider settings

#### 🔑 Configuration
Add custom server endpoint in AI Assistant settings:
```yaml
providers:
  - name: firecrawl_mcp
    url: http://localhost:8080
    api_key: placeholder
```

#### 🧪 Verification
- **Settings Check**: Verify server status in Settings → Tools → AI Assistant → Model Context Protocol (MCP)
- **Chat Commands**: Use `/` commands in AI chat to access MCP tools
- **Level Indicator**: Shows whether setup is Global or Current Project
- **Feature Test**: Use AI Assistant features (code completion, explanation)
- **Server Monitoring**: Monitor server console for requests
- **Health Check**: `curl http://localhost:8080/health`
- **Logs Check**: Check IDE logs for MCP connection status

#### 🛠 Troubleshooting
- **Feature unavailable**: Custom endpoints may require specific subscription tier
- **Connection failed**: Verify server URL and check firewall settings
- **Authentication issues**: May need to modify server for JetBrains-specific headers
- **No MCP section**: Update to latest version of AI Assistant plugin

## Zed

High-performance multiplayer code editor. [Official Docs](https://zed.dev/docs)

#### ✅ Prerequisites
- [Zed](https://zed.dev/download) installed
- Running Firecrawl MCP server

#### ⚙️ Installation
1. Open Zed settings (`File` → `Settings` → `Open Settings`)
2. Configure as Language Server Protocol (LSP) provider

#### 🔑 Configuration
**Configuration Location:** `settings.json` → "context_servers" section

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

#### 🧪 Verification
- **Settings Check**: Verify MCP server appears under "context_servers" in settings.json
- **Agent Mode**: Enable Firecrawl MCP server in assistant settings
- **Status Indicators**: 
  - Red dot: API key issues
  - Green dot: Successful connection
- **Tools Interface**: Access via "Write | Ask" button → "Tools" section
- **Connection Logs**: Check server console for connection logs
- **Health Check**: `curl http://localhost:8080/health`
- **Server Logs**: Monitor server logs for Zed connections

#### 🛠 Troubleshooting
- **Server not starting**: Verify absolute path in configuration
- **No LSP features**: Zed may need specific LSP capabilities from server
- **Connection timeout**: Check server startup time and logs
- **Red status indicator**: Check API key configuration and server logs

## Visual Studio

Microsoft's IDE for .NET development.

#### ✅ Prerequisites
- [Visual Studio](https://visualstudio.microsoft.com/) installed
- Running Firecrawl MCP server

#### ⚙️ Installation
Configure as External Tool:
1. Go to `Tools` → `External Tools...`
2. Click `Add` and configure:
   - **Title**: `Start Firecrawl MCP Server`
   - **Command**: `C:\Program Files\nodejs\node.exe`
   - **Arguments**: `index.js`
   - **Initial directory**: `C:\path\to\mcp-server`

#### 🔑 Configuration
This setup starts the server. Full integration requires custom VSIX extension.

#### 🧪 Verification
Run external tool from Tools menu - terminal should open and start server.
- **Health Check**: `curl http://localhost:8080/health`
- **Process Check**: Task Manager should show node.exe process
- **Logs Check**: Check terminal output for server startup messages

#### 🛠 Troubleshooting
- **Command not found**: Verify Node.js installation path
- **Server fails**: Check initial directory path and `.env` file
- **Permission denied**: Run Visual Studio as Administrator

---

## Desktop Applications

## Claude Desktop

Desktop application for Claude AI. [Official MCP Docs](https://docs.anthropic.com/claude/docs/model-context-protocol)

#### ✅ Prerequisites
- Claude Desktop application installed
- Running Firecrawl MCP server

#### ⚙️ Installation
1. Open Claude Desktop application
2. Navigate to Settings/Preferences
3. Look for "Advanced" or "API" configuration section

#### 🔑 Configuration
**Configuration Locations:**
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.claude.json`

<details>
<summary>Click to expand Claude Desktop configuration</summary>

```json
{
  "api": {
    "baseUrl": "http://localhost:8080",
    "apiKey": "fc-placeholder-key",
    "protocol": "mcp"
  }
}
```

**Alternative: Remote SSE Configuration**
```json
{
  "mcpServers": {
    "firecrawl": {
      "url": "https://mcp.firecrawl.dev/fc-your_api_key/v2/sse",
      "transport": "sse"
    }
  }
}
```
</details>

#### 🧪 Verification
- **UI Indicator**: Hammer icon (🔨) appears in bottom-right corner of conversation input
- **Tool Verification**: Click hammer icon to view available tools from connected MCP servers
- **Status Check**: Green dots indicate successful connections, red dots indicate issues
- **Message Test**: Send a message in Claude Desktop and check server console

#### 🛠 Troubleshooting
- **No response**: Verify `baseUrl` and server status
- **Authentication errors**: Server may need to handle Claude-specific auth headers
- **Connection timeout**: Check network/firewall settings
- **No hammer icon**: Check configuration file location and JSON syntax

## Smithery

AI agent building platform. [Official Docs](https://smithery.ai/)

#### ✅ Prerequisites
- Smithery account and CLI installed
- Running Firecrawl MCP server

#### ⚙️ Installation
**Method 1: Official CLI Installation**
```bash
# Install from GitHub
smithery install \
  --server=github.com/smithery-ai/mcp-github \
  --token=$MY_GITHUB_PAT

# Install Firecrawl MCP server
smithery install \
  --server=github.com/firecrawl/mcp-server \
  --token=$FIRECRAWL_API_KEY
```

**Method 2: Custom Tool Definition**
1. Define new tool in Smithery configuration
2. Point tool action to Firecrawl server endpoint

#### 🔑 Configuration
Create `agent.yaml` with Firecrawl tool:

<details>
<summary>Click to expand Smithery agent configuration</summary>

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
</details>

**Security Note**: Store tokens in environment variables rather than config files.

#### 🧪 Verification
```bash
smithery run my_agent --input '{"url": "https://example.com"}'
```

#### 🛠 Troubleshooting
- **404 Not Found**: Verify endpoint URL and server status
- **Invalid input**: Check request body format matches server expectations
- **Tool not found**: Ensure tool is properly registered in Smithery
- **Token issues**: Use environment variables for sensitive tokens

## LM Studio

Local LLM serving platform. [Official Docs](https://lmstudio.ai/)

#### ✅ Prerequisites
- [LM Studio](https://lmstudio.ai/) installed with model downloaded and served
- Running Firecrawl MCP server

#### ⚙️ Installation
Advanced setup - modify Firecrawl server to use LM Studio as backend:
1. Start LM Studio local server (note address, e.g., `http://localhost:1234/v1`)
2. Modify Firecrawl server code to forward requests to LM Studio

#### 🔑 Configuration
In server code, change model endpoint:
```javascript
const LLM_ENDPOINT = process.env.LM_STUDIO_ENDPOINT || 'http://localhost:1234/v1/chat/completions';
```

#### 🧪 Verification
Connect MCP client to Firecrawl server. Check logs for LM Studio forwarding.

#### 🛠 Troubleshooting
- **API mismatch**: Ensure LM Studio's OpenAI-compatible API matches server expectations
- **Model not loaded**: Verify model is fully loaded in LM Studio
- **Connection failed**: Check LM Studio server address and port

## Perplexity Desktop

#### ✅ Prerequisites  
- Perplexity Desktop app installed
- Running Firecrawl MCP server

#### ⚙️ Installation
Access through Perplexity Desktop settings → Extensions or Tools

#### 🔑 Configuration
**Configuration Locations:**
- **GUI Settings**: Perplexity → Settings → Tools & Extensions → Custom Tools
- **Config File**: `~/.perplexity/connectors.json` (if file-based config available)

**Setup Method:** Manual integration through custom tools interface

<details>
<summary>Click to expand Perplexity Desktop configuration</summary>

**UI Configuration Steps:**
1. Open Perplexity Desktop → **Settings** → **Connectors**
2. Click **Add Connector** → choose **Custom MCP**
3. Enter name "firecrawl" and CLI command: `npx -y firecrawl-mcp`
4. Add `FIRECRAWL_API_KEY` in the environment variables field

**Alternative JSON Configuration:**
```json
{
  "customTools": {
    "firecrawl": {
      "name": "Firecrawl Web Scraper",
      "endpoint": "http://localhost:8080",
      "apiKey": "your_api_key_here",
      "description": "Web scraping and content extraction",
      "timeout": 30000,
      "enabled": true
    }
  }
}
```
</details>

#### 🧪 Verification
- **Settings Access**: Perplexity → Settings → Tools & Extensions
- **Connector Status**: Connectors list shows **firecrawl – Running**
- **Tool Visibility**: Check for Firecrawl in available tools list
- **Test Integration**: Try using custom tool in a conversation
- **Response Check**: Verify Firecrawl responses appear in chat
- **Status Indicators**: Look for green/red connection status in tools panel
- **Search Test**: Run a search prompt (e.g., "Fetch page links from example.com")

#### 🛠 Troubleshooting
- **No custom tools**: Verify Perplexity Desktop version supports extensions
- **Connection failed**: Check local server status and firewall settings
- **Authentication issues**: Verify API key configuration and format
- **Tool not responding**: Check server logs for incoming requests
- **Connector missing**: Restart Perplexity Desktop application
- **XPC errors**: Reinstall PerplexityXPC helper component
- **Unsupported OS**: Windows/Linux not supported for desktop app
- **Timeout errors**: Increase timeout value in configuration
- **Permission denied**: Ensure Perplexity has network access permissions
- **CLI command fails**: Verify `npx` is available in system PATH
- **Environment variables**: Check that FIRECRAWL_API_KEY is properly set
- **Status**: 🔶 **Experimental** - Limited official documentation

---

## CLI Tools

## cLine

Command-line interface for direct server interaction.

#### ✅ Prerequisites
- `curl` or similar HTTP client installed
- Running Firecrawl MCP server

#### ⚙️ Installation
Use terminal commands to interact with server directly.

#### 🔑 Configuration
**Port Configuration:**
- **Standard SSE Port**: Port 3000 for local SSE mode (`env SSE_LOCAL=true`)
- **Default Port**: Port 8080 for standard operation
- **Custom Ports**: Configure via environment variables

No additional configuration needed - use server endpoints directly.

#### 🧪 Verification
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

#### 🛠 Troubleshooting
- **Connection refused**: Verify server is running on port 8080
- **Invalid JSON**: Check JSON syntax in request body
- **Empty response**: Check server logs for errors
- **Port conflicts**: Use different ports when running multiple containerized MCP servers

## Amazon Q Developer CLI

AWS AI-powered developer assistant. [Official Docs](https://aws.amazon.com/q/developer/)

#### ✅ Prerequisites
- AWS CLI and Amazon Q Developer CLI installed and configured
- Running Firecrawl MCP server

#### ⚙️ Installation
**Method 1: Native MCP Commands**
```bash
# Add MCP server
qchat mcp add --name firecrawl --url http://localhost:8080

# List configured servers
qchat mcp list

# Check status
qchat mcp status

# Import from other configs
qchat mcp import
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

#### 🔑 Configuration
**Configuration Locations:**
- **Global**: `~/.aws/amazonq/cli-agents`
- **IDE-specific**: `~/.aws/amazonq/agents/default.json`
- **Worker-level**: `~/.aws/amazonq/mcp.json`

Ensure AWS credentials are configured for Amazon Q CLI.

#### 🧪 Verification
```bash
# Test native commands
qchat mcp list
qchat mcp status

# Test wrapper script
chmod +x q-firecrawl.sh
./q-firecrawl.sh

# Health check
curl http://localhost:8080/health

# Check logs
tail -f ~/.aws/amazonq/logs/cli.log
```

#### 🛠 Troubleshooting
- **Script errors**: Ensure `curl` and `aws` in PATH, use `bash -x` to debug
- **Authentication**: Verify AWS credentials with `aws configure list`
- **API limits**: Check AWS Q usage quotas
- **MCP commands not found**: Update to latest version of Amazon Q CLI

## Gemini CLI

Google's Gemini AI command-line interface.

#### ✅ Prerequisites
- Google Cloud SDK (`gcloud`) installed and configured with Gemini access
- Running Firecrawl MCP server
- `jq` installed for JSON parsing

#### ⚙️ Installation
Create wrapper script `gemini-firecrawl.sh`:

```bash
#!/bin/bash
echo "Enter URL to analyze:"
read user_url

crawled_content=$(curl -s -X POST -H "Content-Type: application/json" \
  -d "{\"url\":\"$user_url\"}" http://localhost:3030/crawl | jq -r .data.content)

gcloud ai models predict gemini-pro --text "Analyze this text: $crawled_content"
```

#### 🔑 Configuration
Ensure Google Cloud authentication: `gcloud auth login`

#### 🧪 Verification
```bash
chmod +x gemini-firecrawl.sh
./gemini-firecrawl.sh
```

#### 🛠 Troubleshooting
- **jq not found**: Install with `sudo apt install jq` (Ubuntu) or `brew install jq` (Mac)
- **GCloud authentication**: Run `gcloud auth login` and select correct project
- **API access**: Verify Gemini API is enabled in Google Cloud Console

## RovoDev CLI

Developer productivity platform. [Official Docs](https://rovodev.com/)

#### ✅ Prerequisites
- RovoDev CLI installed
- Running Firecrawl MCP server

#### ⚙️ Installation
1. Create tool definition file `firecrawl-tool.json`:

<details>
<summary>Click to expand tool definition</summary>

```json
{
  "name": "firecrawl",
  "description": "Crawls a webpage and returns its content",
  "endpoint": "http://localhost:3030/crawl",
  "method": "POST",
  "parameters": {
    "url": {
      "type": "string",
      "description": "The URL to crawl"
    }
  }
}
```
</details>

2. Register tool:
```bash
rovodev tools:add --file firecrawl-tool.json
```

#### 🔑 Configuration
Tool configuration handled via JSON definition file.

#### 🧪 Verification
```bash
rovodev use firecrawl --params '{"url": "https://example.com"}'
```

#### 🛠 Troubleshooting
- **Tool not found**: Check tool registration with `rovodev tools:list`
- **Endpoint unreachable**: Verify server URL and status
- **Invalid parameters**: Check JSON syntax in tool definition

---

## Additional Environments

## Augment Code

AI-powered code assistant with LSP support. [Official Docs](https://augmentcode.ai/)

#### ✅ Prerequisites
- Augment Code IDE/extension installed
- Running Firecrawl MCP server
- LSP client capabilities enabled

#### ⚙️ Installation
1. **Access Language Server Settings**:
   - **VS Code Extension**: Settings → Extensions → Augment Code → Language Servers
   - **Standalone IDE**: Preferences → Language Servers → Custom Servers
   - **Config File**: Edit language server configuration directly

2. **Add MCP Server as LSP Provider**

#### 🔑 Configuration
**Configuration Locations**:
- **VS Code**: `.vscode/settings.json` in workspace
- **Global Config**: `~/.augmentcode/lsp.json`
- **Project Config**: `.augmentcode/config.json` in project root

<details>
<summary>Click to expand Augment Code LSP configuration</summary>

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
  },
  "lsp": {
    "enabled": true,
    "servers": ["firecrawl-mcp"]
  }
}
```

**Alternative NPX Configuration**:
```json
{
  "languageServers": {
    "firecrawl-mcp": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "rootPatterns": ["package.json"],
      "env": {
        "FIRECRAWL_API_KEY": "your_api_key_here"
      }
    }
  }
}
```
</details>

#### 🧪 Verification

<details>
<summary>Click to expand verification steps</summary>

```bash
# Check server status in IDE
# Look for LSP status indicators

# Test LSP connection
curl -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}' \
  http://localhost:3030

# Verify in Augment Code
# 1. Open a file
# 2. Check for MCP-related autocomplete/suggestions
# 3. Look for LSP status in status bar
# 4. Check Output/Logs panel for LSP messages
```
</details>

#### 🛠 Troubleshooting

<details>
<summary>Click to expand troubleshooting guide</summary>

**Common Issues**:
- **LSP server not starting**: 
  - Check absolute path in configuration
  - Verify Node.js is available in PATH
  - Check server logs for startup errors
- **No LSP features available**: 
  - Verify Augment Code supports custom LSP servers
  - Check if LSP client is enabled in settings
  - Restart IDE after configuration changes
- **Connection timeout**:
  - Increase timeout values in LSP configuration
  - Check server startup time and resource usage
- **File type not supported**:
  - Add appropriate file extensions to `filetypes` array
  - Use `"*"` for all file types
- **Environment variables not loaded**:
  - Use absolute paths for environment file
  - Check shell environment where IDE is launched
- **Permission denied**: 
  - Ensure execute permissions on server script
  - Check file ownership and access rights
- **JSON configuration errors**: 
  - Validate JSON syntax
  - Check for missing commas or brackets
- **Server crashes**: 
  - Monitor server logs for error details
  - Check API key validity and format
</details>

## BoltAI

#### ✅ Prerequisites
- BoltAI installed
- Running Firecrawl MCP server

#### ⚙️ Installation
Look for custom services or API configuration in BoltAI settings.

#### 🔑 Configuration
**Configuration Locations:**
- **User-level**: `~/.boltai/mcp.json` (applies to all projects)
- **Workspace-level**: `.boltai/mcp.json` in project root (project-specific)
- **Global**: `/etc/boltai/mcp.json` (system-wide, if applicable)

**Import Support:** Can import from Cursor/Claude Desktop configurations

<details>
<summary>Click to expand BoltAI configuration</summary>

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
</details>

#### 🧪 Verification
- **Settings Check**: Open BoltAI → Settings → Plugins → see MCP servers list
- **Enable Server**: Enable server in plugin dropdown
- **Tools Appearance**: Tools appear in chat toolbar
- **Tool Usage**: Use `/mcp__servername__toolname` or Tools panel

#### 🛠 Troubleshooting
- **Service not found**: Check BoltAI documentation for custom service support
- **Connection failed**: Verify server URL and firewall settings
- **Import issues**: Verify source configuration files are valid
- **Status**: ⚠️ **Well-documented** - Official documentation available
- **Import issues**: Verify source Cursor/Claude Desktop configurations are valid
- **MCP server prerequisite**: Ensure MCP server runs before starting BoltAI

## Claude Code

#### ✅ Prerequisites
- Claude Code application installed (CLI app, not VS Code extension)
- Running Firecrawl MCP server

#### ⚙️ Installation
Find API endpoint settings in application preferences.

#### 🔑 Configuration
**Configuration Locations:**
- **Primary**: `~/.claude.json` (recommended)
- **Project**: `.mcp.json` at project root (unreliable)

<details>
<summary>Click to expand Claude Code configuration</summary>

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
</details>

**Windows Configuration:**
```bash
claude mcp add firecrawl --scope user -- cmd /c npx -y firecrawl-mcp
```

#### 🧪 Verification
- **List servers**: `claude mcp list`
- **Check server**: `claude mcp get firecrawl`
- **In-app check**: Type `/mcp` in Claude Code
- **Use tools**: `/mcp__firecrawl__scrape_url` format

#### 🛠 Troubleshooting
- **No custom endpoint option**: Check if version supports custom APIs
- **Authentication errors**: May need to modify server for Claude-specific headers
- **`.mcp.json` not read**: Use `~/.claude.json` instead
- **Connection closed**: Missing `cmd /c` on Windows
- **Timeout**: Set `MCP_TIMEOUT=10000`
- **Environment variables**: Restart terminal after setting env vars
- **Node.js version**: Ensure Node.js ≥18 is installed
- **JSON config parse errors**: Validate `claude_code_config.json` syntax
- **New servers don't appear**: Restart Claude Code after configuration changes

## Copilot Coding Agent

GitHub Copilot-powered coding assistant with custom model support. [Official Docs](https://github.com/features/copilot)

#### ✅ Prerequisites
- GitHub Copilot subscription or Copilot Coding Agent installed
- Running Firecrawl MCP server
- Access to agent configuration settings

#### ⚙️ Installation
1. **Access Agent Configuration**:
   - **VS Code**: Extensions → GitHub Copilot → Settings
   - **Standalone Agent**: Configuration file or settings panel
   - **CLI**: Agent configuration commands

2. **Add Custom Model Provider**

#### 🔑 Configuration
**Configuration Locations**:
- **VS Code Extension**: `.vscode/settings.json`
- **Global Config**: `~/.copilot/agent-config.yaml`
- **Agent Config**: `config/providers.yaml` in agent directory

<details>
<summary>Click to expand Copilot Agent configuration</summary>

**YAML Configuration**:
```yaml
# ~/.copilot/agent-config.yaml
providers:
  - name: firecrawl_mcp
    type: mcp
    url: http://localhost:3030
    description: "Firecrawl web scraping and content extraction"
    capabilities:
      - code_completion
      - code_explanation
      - web_search
      - content_extraction
    settings:
      timeout: 30000
      retries: 3
      headers:
        User-Agent: "Copilot-Agent/1.0"

models:
  firecrawl:
    provider: firecrawl_mcp
    endpoint: http://localhost:3030
    enabled: true
    priority: 10

# Integration settings
integration:
  enable_custom_providers: true
  fallback_to_default: true
  log_level: "info"
```

**JSON Configuration** (alternative):
```json
{
  "copilot": {
    "customProviders": {
      "firecrawl": {
        "name": "Firecrawl MCP",
        "endpoint": "http://localhost:3030",
        "type": "mcp",
        "apiKey": "placeholder-key",
        "enabled": true,
        "features": ["search", "crawl", "extract"]
      }
    },
    "agentSettings": {
      "enableCustomProviders": true,
      "timeout": 30000,
      "maxRetries": 3
    }
  }
}
```
</details>

#### 🧪 Verification

<details>
<summary>Click to expand verification steps</summary>

```bash
# Check agent configuration
copilot config list
copilot providers list

# Test custom provider
copilot test-provider firecrawl_mcp

# Verify in VS Code (if using extension)
# 1. Open Command Palette (Ctrl+Shift+P)
# 2. Type "Copilot: Show Provider Status"
# 3. Check for Firecrawl provider in list

# Test integration
# 1. Open a code file
# 2. Use Copilot chat: "@firecrawl search for React documentation"
# 3. Verify response includes web-scraped content

# Check logs
tail -f ~/.copilot/logs/agent.log | grep -i firecrawl
```
</details>

#### 🛠 Troubleshooting

<details>
<summary>Click to expand troubleshooting guide</summary>

**Common Issues**:
- **Provider not found**:
  - Check YAML/JSON syntax in configuration
  - Verify file permissions for config files
  - Restart Copilot agent after configuration changes
- **Connection refused**:
  - Ensure Firecrawl MCP server is running on port 3030
  - Check firewall settings and network connectivity
  - Verify URL format (include `http://`)
- **Authentication errors**:
  - Some Copilot versions may require API keys
  - Check if agent supports custom model providers
  - Verify GitHub Copilot subscription status
- **Configuration not loaded**:
  - Check config file location matches agent documentation
  - Use absolute paths where required
  - Verify environment variables are properly set
- **Feature not available**:
  - Custom providers may require specific Copilot version
  - Check if enterprise or specific subscription tier required
  - Verify agent supports MCP protocol
- **Response quality issues**:
  - Adjust timeout and retry settings
  - Check server logs for processing errors
  - Verify API key and rate limiting
- **VS Code integration issues**:
  - Update GitHub Copilot extension to latest version
  - Check extension logs in Output panel
  - Restart VS Code after configuration changes
- **YAML parsing errors**:
  - Validate YAML syntax with online validators
  - Check indentation (use spaces, not tabs)
  - Ensure proper string quoting
- **Performance issues**:
  - Increase timeout values for slow responses
  - Monitor server resource usage
  - Consider local caching for frequently requested content
</details>

## Crush

#### ✅ Prerequisites
- Crush installed
- Running Firecrawl MCP server

#### ⚙️ Installation
Create wrapper script for external tool integration.

#### 🔑 Configuration
**Configuration Location:** JSON schema at `https://charm.land/crush.json`

**Transport Types:**
- **HTTP**: `"type": "http"`
- **STDIO**: `"type": "stdio"`

<details>
<summary>Click to expand Crush configuration</summary>

```json
{
  "mcp": {
    "servers": [
      {
        "name": "firecrawl",
        "type": "http",
        "url": "http://localhost:3030"
      }
    ]
  }
}
```
</details>

**Wrapper Script:**
```bash
#!/bin/bash
# crush-firecrawl.sh
url="$1"
curl -X POST -H "Content-Type: application/json" \
  -d "{\"url\":\"$url\"}" http://localhost:3030/crawl
```

#### 🧪 Verification
Configure Crush to use wrapper script or test MCP configuration.

#### 🛠 Troubleshooting
- **Script execution**: Ensure script has execute permissions
- **Integration support**: Check if Crush supports external tools
- **Transport issues**: Try both HTTP and STDIO transport types
- **Status**: ⚠️ **Community documented** - Configuration examples available

## Kiro

#### ✅ Prerequisites
- Kiro installed
- Running Firecrawl MCP server

#### ⚙️ Installation
Look for plugins, extensions, or API endpoint settings.

#### 🔑 Configuration
**Configuration Locations:**
- **Workspace-level**: `.kiro/settings/mcp.json` in project root
- **User-level**: `~/.kiro/settings/mcp.json`

<details>
<summary>Click to expand Kiro MCP configuration</summary>

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
</details>

**GUI Setup:**
1. Open Kiro panel (Ghost icon in activity bar)
2. Go to **MCP Servers** tab
3. Toggle **Enable MCP support** or click edit icon to open JSON

#### 🧪 Verification
- **Status Check**: MCP Servers tab shows green (connected) or red (error) indicators
- **Tool Test**: Click tool name to insert placeholder into chat
- **Execution Test**: Ask Kiro to run tool (e.g., "Search docs with #MCP")

#### 🛠 Troubleshooting
- **No custom endpoint**: Check documentation for plugin/extension support
- **Connection issues**: Verify network connectivity
- **Server not appearing**: Refresh panel or restart Kiro
- **Workspace override**: Workspace settings override user settings
- **Correct config file location**: Ensure file is in proper Kiro settings directory
- **API key recognition issues**: Verify environment variable syntax and value
- **Server reload**: Restart Kiro agent to reload MCP servers

## Open Code

Open-source code editor with extensible LSP support. [Official Docs](https://opencode.dev/)

#### ✅ Prerequisites
- Open Code editor installed
- Running Firecrawl MCP server
- LSP extension/plugin enabled

#### ⚙️ Installation
1. **Access LSP Configuration**:
   - **Menu**: Tools → Language Servers → Configure
   - **Settings**: Preferences → Extensions → Language Server Protocol
   - **Command Palette**: "Configure Language Server"

2. **Add Firecrawl MCP as LSP Provider**

#### 🔑 Configuration
**Configuration Locations**:
- **User Settings**: `~/.opencode/settings.json`
- **Workspace**: `.opencode/settings.json` in project root
- **LSP Config**: `~/.opencode/lsp-servers.json`

<details>
<summary>Click to expand Open Code LSP configuration</summary>

```json
{
  "lsp": {
    "servers": {
      "firecrawl-mcp": {
        "command": "node",
        "args": ["/absolute/path/to/mcp-server/index.js"],
        "env": {
          "FIRECRAWL_API_KEY": "your_api_key_here",
          "PORT": "3030"
        },
        "rootUri": null,
        "workspaceFolders": null,
        "initializationOptions": {},
        "capabilities": {
          "textDocumentSync": 1,
          "completionProvider": true,
          "hoverProvider": true,
          "codeActionProvider": true
        }
      }
    },
    "documentSelector": [
      {"language": "*", "scheme": "file"}
    ]
  }
}
```

**Alternative Configuration**:
```json
{
  "languageServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "rootPatterns": [".git", "package.json"],
      "filetypes": ["javascript", "typescript", "json", "markdown"],
      "env": {
        "FIRECRAWL_API_KEY": "your_api_key_here"
      }
    }
  }
}
```
</details>

#### 🧪 Verification

<details>
<summary>Click to expand verification steps</summary>

```bash
# Check LSP server status in editor
# Look for status indicators in:
# - Status bar
# - LSP panel/view
# - Output logs

# Test LSP functionality
# 1. Open a supported file type
# 2. Look for:
#    - Autocomplete suggestions
#    - Hover information
#    - Code actions
#    - Diagnostic messages

# Check server connection
curl -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"rootUri":"file:///path/to/project"},"id":1}' \
  http://localhost:3030

# Verify server logs
tail -f ~/.opencode/logs/lsp-firecrawl-mcp.log
```
</details>

#### 🛠 Troubleshooting

<details>
<summary>Click to expand troubleshooting guide</summary>

**Common Issues**:
- **LSP server not starting**:
  - Verify absolute path to server script
  - Check Node.js installation and PATH
  - Review server startup logs
- **No LSP features available**:
  - Confirm Open Code LSP extension is installed and enabled
  - Check document selector matches file types
  - Verify server capabilities in configuration
- **Connection refused**:
  - Check if server port is correct (3030)
  - Verify firewall settings
  - Ensure server is running before starting editor
- **JSON configuration errors**:
  - Validate JSON syntax with linter
  - Check for missing required fields
  - Verify file permissions for config files
- **Environment variables not working**:
  - Use absolute paths for .env files
  - Check shell environment where editor is launched
  - Verify API key format and validity
- **File type not supported**:
  - Add appropriate languages to documentSelector
  - Use wildcard "*" for all file types
  - Check rootPatterns for project detection
- **Server crashes repeatedly**:
  - Monitor server logs for error details
  - Check memory and resource usage
  - Verify API key and network connectivity
- **Performance issues**:
  - Adjust LSP timeout settings
  - Limit file types in documentSelector
  - Check server resource usage
</details>

## OpenAI Codex

OpenAI's code generation model integration. [Official Docs](https://platform.openai.com/docs/)

#### ✅ Prerequisites
- OpenAI API access with Codex model availability
- Running Firecrawl MCP server
- Server-side integration capabilities

#### ⚙️ Installation
**Server-Side Integration**: Modify Firecrawl server to use Codex as the underlying LLM

1. **Install OpenAI SDK**:
```bash
cd mcp-server
npm install openai
```

2. **Configure Server Integration**

#### 🔑 Configuration
**Environment Variables**:
```env
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=code-davinci-002
OPENAI_ENDPOINT=https://api.openai.com/v1/completions
FIRECRAWL_API_KEY=your_firecrawl_api_key
```

**Configuration Locations**:
- **Server Config**: `config/openai.json` in server directory
- **Environment**: `.env` file in server root
- **Runtime**: Environment variables

<details>
<summary>Click to expand server integration code</summary>

```javascript
// server/integrations/openai-codex.js
const { OpenAI } = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

class CodexIntegration {
  constructor() {
    this.model = process.env.OPENAI_MODEL || 'code-davinci-002';
    this.endpoint = process.env.OPENAI_ENDPOINT || 'https://api.openai.com/v1/completions';
  }

  async generateCode(prompt, options = {}) {
    try {
      const response = await openai.completions.create({
        model: this.model,
        prompt: prompt,
        max_tokens: options.maxTokens || 150,
        temperature: options.temperature || 0.1,
        stop: options.stop || ['\n\n'],
      });
      
      return response.choices[0].text;
    } catch (error) {
      console.error('Codex API error:', error);
      throw error;
    }
  }

  async analyzeCode(code, query) {
    const prompt = `Analyze this code and ${query}:\n\n${code}\n\nAnalysis:`;
    return await this.generateCode(prompt, { maxTokens: 300 });
  }
}

module.exports = CodexIntegration;
```

**Server Configuration**:
```json
{
  "openai": {
    "apiKey": "${OPENAI_API_KEY}",
    "model": "code-davinci-002",
    "endpoint": "https://api.openai.com/v1/completions",
    "defaultOptions": {
      "maxTokens": 150,
      "temperature": 0.1,
      "stop": ["\n\n"]
    }
  },
  "mcp": {
    "port": 3030,
    "enableCodex": true
  }
}
```
</details>

#### 🧪 Verification

<details>
<summary>Click to expand verification steps</summary>

```bash
# Test OpenAI API connection
curl -X POST https://api.openai.com/v1/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "code-davinci-002",
    "prompt": "# Function to add two numbers\ndef add_numbers(",
    "max_tokens": 50,
    "temperature": 0
  }'

# Test MCP server with Codex integration
curl -X POST -H "Content-Type: application/json" \
  -d '{"action": "generateCode", "prompt": "Create a Python function to sort a list"}' \
  http://localhost:3030/codex

# Check server logs for Codex integration
tail -f logs/mcp-server.log | grep -i codex

# Test through MCP client
# Connect MCP client to server and verify Codex-powered responses
```
</details>

#### 🛠 Troubleshooting

<details>
<summary>Click to expand troubleshooting guide</summary>

**Common Issues**:
- **API key invalid**:
  - Verify OpenAI API key format (starts with `sk-`)
  - Check key permissions and quota limits
  - Test key with direct OpenAI API call
- **Model not available**:
  - Check Codex model availability in your OpenAI account
  - Try alternative models: `code-cushman-001`, `text-davinci-003`
  - Verify model name spelling and case sensitivity
- **Rate limiting**:
  - Implement exponential backoff in server code
  - Monitor OpenAI usage dashboard
  - Consider upgrading OpenAI plan for higher limits
- **Connection timeout**:
  - Increase timeout values in server configuration
  - Check network connectivity to OpenAI API
  - Implement retry logic for failed requests
- **Server integration errors**:
  - Check Node.js OpenAI SDK installation
  - Verify server code syntax and imports
  - Monitor server startup logs for integration errors
- **Response quality issues**:
  - Adjust temperature and max_tokens parameters
  - Improve prompt engineering and context
  - Add better stop sequences for code generation
- **Cost management**:
  - Set max_tokens limits to control costs
  - Implement request caching for similar prompts
  - Monitor token usage in OpenAI dashboard
- **Security concerns**:
  - Store API keys in environment variables, not code
  - Implement input validation and sanitization
  - Use HTTPS for all API communications
</details>

## Qodo Gen

#### ✅ Prerequisites
- Qodo Gen installed
- Running Firecrawl MCP server

#### ⚙️ Installation
**Method 1: Agentic Mode**
1. Navigate to Agentic Mode → "Connect more tools" → "Add new MCP"
2. Configure server details

**Method 2: CLI Support**
```bash
qodo <agent-name> --mcp
```

#### 🔑 Configuration
Search for "API Endpoint", "Custom Server", or "LLM Provider" settings:
```json
{
  "provider_url": "http://localhost:3030"
}
```

#### 🧪 Verification
Use Qodo Gen features and check server connections.

#### 🛠 Troubleshooting
- **Settings not found**: Check Qodo Gen documentation
- **Provider not working**: Verify server compatibility
- **CLI mode issues**: Ensure latest version supports MCP CLI
- **Status**: ⚠️ **Officially supported** - Comprehensive documentation available

## Roo Code

#### ✅ Prerequisites
- Roo Code installed
- Running Firecrawl MCP server

#### ⚙️ Installation
Check for LSP or extension support.

#### 🔑 Configuration
**Configuration Method:** JSON file only (no GUI toggle)

**Configuration Locations:** 
- **Primary Method**: Open via Roo Code's MCP icon → **Edit MCP Settings**
- **User-level**: `%APPDATA%/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/cline_mcp_settings.json` (Windows)
- **User-level**: `~/.vscode/extensions/rooveterinaryinc.roo-cline/settings/cline_mcp_settings.json` (Linux/macOS)
- **Workspace-level**: `.vscode/cline_mcp_settings.json` in project root (if supported)

<details>
<summary>Click to expand Roo Code configuration</summary>

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
</details>

#### 🧪 Verification
- **MCP Icon Check**: MCP icon shows list of configured servers
- **Tool Test**: Insert tool placeholder from MCP panel into chat prompt
- **Execution Test**: Run tool and verify output confirms connectivity

#### 🛠 Troubleshooting
- **Extension not loading**: Check server startup and logs
- **No LSP support**: Look for alternative integration methods
- **Missing MCP icon**: Ensure latest version of Roo Code
- **Config not found**: Use MCP icon to open correct settings file
- **File location errors**: Use MCP icon to open correct settings file path
- **Common syntax mistakes**: Check for missing commas, quotes, and brackets
- **MCP load status**: Verify Roo logs for MCP server loading confirmation

## Trae

#### ✅ Prerequisites
- Trae installed and configured
- Running Firecrawl MCP server
- YAML configuration access

#### ⚙️ Installation
1. Access Trae configuration settings
2. Navigate to custom tools or agent configuration section
3. Add Firecrawl as HTTP tool integration

#### 🔑 Configuration
**Configuration Locations:**
- **Primary**: `~/.trae/config.yaml`
- **Project**: `./trae-config.yaml` in project root
- **Global**: `/etc/trae/tools.yaml`

**Tool Definition Methods:**

<details>
<summary>Click to expand Trae HTTP tool configuration</summary>

**Method 1: Direct HTTP Tool**
```yaml
tools:
  - name: firecrawl
    type: http
    endpoint: http://localhost:3030/crawl
    method: POST
    headers:
      Content-Type: "application/json"
    body_template: |
      {
        "url": "{{.url}}"
      }
    timeout: 30s
```

**Method 2: Agent Integration**
```yaml
agents:
  web_crawler:
    tools:
      - firecrawl
    integrations:
      - name: firecrawl
        type: mcp
        command: npx
        args: ["-y", "firecrawl-mcp"]
        env:
          FIRECRAWL_API_KEY: "${FIRECRAWL_API_KEY}"
```
</details>

#### 🧪 Verification
- **Tool Registration**: Check `trae tools list` shows firecrawl
- **Agent Test**: Run `trae agent test web_crawler`
- **Direct Usage**: Use Trae with Firecrawl tool in workflow
- **Response Check**: Verify tool returns expected JSON response
- **Log Monitoring**: Check Trae logs for successful tool calls

#### 🛠 Troubleshooting
- **Tool not recognized**: Check Trae's tool definition format and YAML syntax
- **HTTP errors**: Verify endpoint URL and request format
- **Authentication failed**: Ensure API key is properly set in environment
- **Timeout issues**: Increase timeout value in tool configuration
- **YAML parse errors**: Validate YAML syntax with `trae config validate`
- **Agent not found**: Verify agent is properly defined in configuration
- **Network connectivity**: Test direct curl to verify server accessibility
- **Permission denied**: Check file permissions for configuration files
- **Command not found**: Ensure Trae CLI is installed and in PATH
- **Tool execution failed**: Check server logs for incoming requests
- **Status**: 🔶 **Community supported** - Check Trae documentation

## Warp

#### ✅ Prerequisites
- [Warp terminal](https://www.warp.dev/) installed
- Running Firecrawl MCP server

#### ⚙️ Installation
**Method 1: MCP Server Configuration (Recommended)**
1. Navigate to MCP servers page via:
   - Warp Drive → Personal → MCP Servers
   - Command Palette → "Open MCP Servers"
   - Settings → AI → Manage MCP Servers

**Method 2: Terminal Aliases**
Create terminal aliases for easy access.

#### 🔑 Configuration
**Method 1: GUI Configuration**
- **Location**: Settings → AI → Manage MCP servers
- **Configuration**: JSON configuration or GUI setup

**Method 2: Shell Aliases**
Add to `.bashrc` or `.zshrc`:
```bash
alias firecrawl-crawl='curl -X POST -H "Content-Type: application/json" -d'
alias firecrawl-search='curl -X POST -H "Content-Type: application/json" -d'
```

#### 🧪 Verification
**Method 1: MCP Servers Page**
- **Status Check**: Running servers show green status, stopped servers show different status
- **Tools List**: Each running server displays available tools and resources

**Method 2: Alias Test**
```bash
firecrawl-crawl '{"url": "https://example.com"}' http://localhost:3030/crawl
```

#### 🛠 Troubleshooting
- **Alias not working**: Reload shell configuration with `source ~/.bashrc`
- **Curl errors**: Check JSON syntax and server status
- **MCP server not listed**: Verify server is running and configuration is correct
- **Connection issues**: Check firewall settings and server accessibility

## Windsurf

#### ✅ Prerequisites
- Windsurf IDE installed
- Running Firecrawl MCP server

#### ⚙️ Installation
Access through Windsurf settings → Integrations

#### 🔑 Configuration
**Configuration Locations:**
- **User-level**: `~/.codeium/windsurf/mcp_config.json` (applies to all projects)
- **Workspace-level**: `.windsurf/mcp_config.json` in project root (project-specific)
- **Alternative**: `~/.windsurf/mcp-servers.json` (alternative location)

**Setup Method:** Manual configuration file editing required

<details>
<summary>Click to expand Windsurf configuration</summary>

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
</details>

#### 🧪 Verification
- **IDE Restart**: Restart Windsurf after configuration
- **Command Palette**: Open command palette (Ctrl/Cmd+Shift+P)
- **MCP Commands**: Search for "MCP" or "Firecrawl" commands
- **Server Status**: Check status bar for MCP server indicators
- **Log Check**: View → Output → MCP Servers for connection logs
- **Hammer icon**: Configure → panel shows firecrawl status
- **Tool execution**: Selecting a tool under Cascade executes it

#### 🛠 Troubleshooting
- **Extension not found**: Update Windsurf to latest version
- **Configuration errors**: Validate JSON syntax with JSON linter
- **Path issues**: Use absolute paths for server executable
- **Permission errors**: Ensure proper file permissions for config files
- **Status**: 🔶 **Beta support** - Under active development
- **Hammer icon not showing**: restart Windsurf after configuration changes
- **API key validation failures**: Verify key format and permissions
- **JSON formatting**: Check for proper JSON syntax and structure
- **Config file not found**: Create directory structure if it doesn't exist
- **Server startup failed**: Check console logs for detailed error messages
- **Network issues**: Verify firewall settings and local server accessibility
- **NPX command failed**: Ensure NPX is available in system PATH

## Zencoder

#### ✅ Prerequisites
- Zencoder IDE installed
- Running Firecrawl MCP server

#### ⚙️ Installation
Look for MCP settings or external service configuration in Zencoder preferences.

#### 🔑 Configuration
**Configuration Locations:**
- **User-level**: `~/.zencoder/config/mcp.json` (applies to all projects)
- **Workspace-level**: `.zencoder/mcp.json` in project root (project-specific)
- **Settings UI**: Via Zencoder → Preferences → Services → MCP Servers
- **Alternative**: `~/.config/zencoder/mcp_servers.json` (Linux)

**Setup Method:** Via preferences, command palette, or direct file editing

<details>
<summary>Click to expand Zencoder configuration</summary>

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
</details>

#### 🧪 Verification
- **Preferences Check**: Zencoder → Preferences → Services → MCP Servers
- **Command Palette**: Open command palette and search for MCP commands
- **Tool Panel**: Check for Firecrawl tools in side panel
- **Status Indicators**: Look for green/red status indicators
- **Log Verification**: Check Zencoder logs for MCP connection status
- **Settings UI**: Open settings UI → check for Firecrawl MCP under tools list
- **Agent Tools panel**: Lists firecrawl and its tools
- **Tool execution**: Trigger a tool via panel or in-chat command

#### 🛠 Troubleshooting
- **No MCP support**: Verify Zencoder version supports MCP protocol
- **Configuration errors**: Check JSON format and file permissions
- **Path resolution**: Use absolute paths for all file references
- **Service unavailable**: Ensure Firecrawl server is running and accessible
- **Status**: 🔶 **Limited documentation** - Community-driven support
- **Syntax errors in settings**: Validate JSON configuration file format
- **MCP integration missing**: Ensure Zencoder version supports MCP protocol
- **Server not starting**: Check console output for startup errors
- **Tool not appearing**: Refresh tools panel or restart Zencoder
- **Permission denied**: Check file permissions for configuration directories
- **Network connectivity**: Test server accessibility with curl command
- **Environment variables**: Ensure API key is properly set and accessible
- **Plugin conflicts**: Disable other MCP-related plugins that might conflict

---

## Troubleshooting & Tips

Common issues and solutions for Firecrawl MCP Server installation and configuration.

### 🔧 **Common Server Issues**

<details>
<summary>Click to expand server troubleshooting</summary>

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

# Check environment variables
env | grep FIRECRAWL

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

### 🔧 **Configuration Issues**

<details>
<summary>Click to expand configuration troubleshooting</summary>

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

**CORS Issues**
```javascript
// Add to server configuration if needed
{
  "cors": {
    "origin": "*",
    "methods": ["GET", "POST", "PUT", "DELETE"],
    "allowedHeaders": ["Content-Type", "Authorization"]
  }
}
```
</details>

### 🔧 **Client-Specific Issues**

<details>
<summary>Click to expand client troubleshooting</summary>

**VS Code Issues**
- **Extension not loading**: Restart VS Code after configuration changes
- **Settings not applied**: Check if settings are in user vs workspace config
- **Path issues**: Use absolute paths, escape backslashes on Windows

**Cursor Issues**
- **MCP config not found**: Check file location matches Cursor version
- **Server not connecting**: Restart Cursor after configuration changes
- **JSON structure**: Ensure complete JSON object for v0.48.6+

**Claude Desktop Issues**
- **No hammer icon**: Check configuration file location and JSON syntax
- **Connection timeout**: Verify network/firewall settings
- **Authentication errors**: Server may need Claude-specific auth headers

**Docker Issues**
- **Build fails**: Check Dockerfile syntax and build context
- **Container exits**: Check logs with `docker logs container_name`
- **Port mapping**: Ensure correct port mapping syntax
</details>

### 🔧 **Network & Security**

<details>
<summary>Click to expand network troubleshooting</summary>

**Firewall Configuration**
```bash
# Linux (ufw)
sudo ufw allow 8080/tcp

# Linux (iptables)
sudo iptables -A INPUT -p tcp --dport 8080 -j ACCEPT

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

**SSL/TLS Issues**
```bash
# Disable SSL verification (not recommended for production)
export NODE_TLS_REJECT_UNAUTHORIZED=0

# Add custom CA certificates
export NODE_EXTRA_CA_CERTS=/path/to/ca-certificates.crt
```
</details>

### 🔧 **Performance & Optimization**

<details>
<summary>Click to expand performance troubleshooting</summary>

**High Memory Usage**
```bash
# Monitor memory usage
top | grep node  # Linux/macOS
Get-Process -Name node | Select-Object CPU,WorkingSet  # Windows

# Increase Node.js memory limit
node --max-old-space-size=4096 index.js

# Use environment variable
export NODE_OPTIONS="--max-old-space-size=4096"
```

**Slow Response Times**
```javascript
// Increase timeout in client configuration
{
  "timeout": 60000,  // 60 seconds
  "retries": 3
}
```

**Connection Pooling**
```javascript
// Add to server configuration
{
  "http": {
    "keepAlive": true,
    "maxSockets": 50
  }
}
```
</details>

### 🔧 **Version Compatibility**

<details>
<summary>Click to expand version troubleshooting</summary>

**Node.js Version Issues**
```bash
# Check current version
node --version

# Install specific version with nvm
nvm install 20
nvm use 20

# Alternative: Use specific Node.js path
/usr/local/bin/node index.js
```

**Package Version Conflicts**
```bash
# Clear npm cache
npm cache clean --force

# Remove node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Check for conflicting packages
npm ls
```

**MCP Protocol Version**
```bash
# Check MCP protocol version
npx firecrawl-mcp --protocol-version

# Ensure client compatibility
# MCP 2024-11-05 specification required
```
</details>

### 🆘 **Getting Help**

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
- **Community Discord**: [Firecrawl Discord](https://discord.gg/firecrawl)
