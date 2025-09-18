# Firecrawl MCP Server Installation Guide

🔥 **Official Firecrawl MCP Server** - Adds powerful web scraping and search to 23+ MCP-compatible environments.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Version Compatibility](#version-compatibility)
- [Supported Environments](#supported-environments)
- [Quick Installation](#quick-installation)
- [Environment-Specific Installation](#environment-specific-installation-instructions)
  - [🖥️ AI Coding Assistants](#️-ai-coding-assistants)
    - [1. Cursor](#1-cursor)
    - [2. Windsurf](#2-windsurf)
    - [3. VS Code](#3-vs-code)
    - [4. Claude Desktop](#4-claude-desktop)
    - [5. Claude Code](#5-claude-code)
    - [6. Cline](#6-cline)
    - [7. Zed](#7-zed)
  - [🏢 Development Environments](#-development-environments)
    - [8. Visual Studio 2022](#8-visual-studio-2022)
    - [9. JetBrains AI Assistant](#9-jetbrains-ai-assistant-intellij-pycharm-webstorm-etc)
    - [10. Augment Code](#10-augment-code)
  - [🖥️ Terminal & CLI Tools](#️-terminal--cli-tools)
    - [11. Gemini CLI](#11-gemini-cli)
    - [12. Amazon Q Developer CLI](#12-amazon-q-developer-cli)
    - [13. Warp](#13-warp)
  - [🔧 Specialized Platforms](#-specialized-platforms)
    - [14. Trae](#14-trae)
    - [15. BoltAI](#15-boltai)
    - [16. Roo Code](#16-roo-code)
    - [17. Zencoder](#17-zencoder)
    - [18. Qodo Gen](#18-qodo-gen)
    - [19. Copilot Coding Agent](#19-copilot-coding-agent)
    - [20. Kiro](#20-kiro)
  - [🐳 Runtime & Platform Alternatives](#-runtime--platform-alternatives)
    - [21. Docker](#21-docker)
    - [22. Windows](#22-windows)
    - [23. Smithery](#23-smithery-package-manager)
- [Environment Variables Configuration](#environment-variables-configuration)
- [Verification & Testing](#verification--testing)
- [Available Tools](#available-tools)
- [Troubleshooting](#troubleshooting)
- [License](#license)
- [Contributing](#contributing)

## Prerequisites

- **Node.js >= v18.0.0**
- **Firecrawl API Key** (get one at https://www.firecrawl.dev/app/api-keys)
- An MCP-compatible client (see supported environments below)

## Version Compatibility

- **Node.js:** >= 18.0.0
- **firecrawl-mcp:** Latest version (auto-updated via npx)
- **MCP Protocol:** Compatible with all MCP 1.0+ clients

> **Note:** This guide is updated for the latest versions as of September 2025. Some older client versions may have different configuration methods.

## Supported Environments

This guide provides installation instructions for **23+ MCP-compatible environments** across multiple categories:

| Category | Count | Environments |
|----------|-------|-------------|
| 🖥️ AI Coding Assistants | 7 | Cursor, Windsurf, VS Code, Claude Desktop, Claude Code, Cline, Zed |
| 🏢 Development Environments | 3 | Visual Studio 2022, JetBrains AI Assistant, Augment Code |
| 🖥️ Terminal & CLI Tools | 3 | Gemini CLI, Amazon Q Developer CLI, Warp |
| 🔧 Specialized Platforms | 7 | Trae, BoltAI, Roo Code, Zencoder, Qodo Gen, Copilot Coding Agent, Kiro |
| 🐳 Runtime & Platform Alternatives | 2 | Docker, Windows |
| 📦 Package Managers | 1 | Smithery |

**Total: 23 environments with complete installation instructions**

## Quick Installation

### Method 1: Using npx (Recommended)
```bash
env FIRECRAWL_API_KEY=fc-YOUR_API_KEY npx -y firecrawl-mcp
```

### Method 2: Global Installation
```bash
npm install -g firecrawl-mcp
```

### Method 3: Using Smithery (Automatic)
```bash
npx -y @smithery/cli@latest install firecrawl-mcp --client <CLIENT_NAME> --key <YOUR_SMITHERY_KEY>
```

---

## Environment-Specific Installation Instructions

### 🖥️ AI Coding Assistants

#### 1. Cursor

**Prerequisites:**
- Cursor version 0.45.6 or higher
- Firecrawl API Key

**Installation Steps:**

**For Cursor v0.48.6+:**
1. Open Cursor Settings
2. Go to **Features** > **MCP Servers**
3. Click **"+ Add new global MCP server"**
4. Enter the following configuration:

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "YOUR-API-KEY"
      }
    }
  }
}
```

**For Cursor v0.45.6:**
1. Open Cursor Settings
2. Go to **Features** > **MCP Servers**
3. Click **"+ Add New MCP Server"**
4. Enter:
   - **Name:** "firecrawl-mcp"
   - **Type:** "command"
   - **Command:** `env FIRECRAWL_API_KEY=your-api-key npx -y firecrawl-mcp`

**Windows Users:**
If encountering issues, use:
```bash
cmd /c "set FIRECRAWL_API_KEY=your-api-key && npx -y firecrawl-mcp"
```

**Configuration File Method:**
Add to `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project-specific):

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "YOUR-API-KEY"
      }
    }
  }
}
```

**Alternative Runtimes:**

Using **Bun:**
```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "bunx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "YOUR-API-KEY"
      }
    }
  }
}
```

Using **Deno:**
```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "deno",
      "args": ["run", "--allow-env=NO_DEPRECATION,TRACE_DEPRECATION", "--allow-net", "npm:firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "YOUR-API-KEY"
      }
    }
  }
}
```

**Verification:**
1. Refresh the MCP server list in Cursor
2. Access Composer via Command+L (Mac) or Ctrl+L (Windows)
3. Select "Agent" next to the submit button
4. Test with: "Scrape the content from https://example.com"

---

#### 2. Windsurf

**Prerequisites:**
- Windsurf IDE
- Firecrawl API Key

**Installation Steps:**
1. Locate your Windsurf MCP config file: `./codeium/windsurf/model_config.json`
2. Add the following configuration:

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

**Remote Server Connection:**
```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "serverUrl": "wss://firecrawl-mcp-server.your-domain.com/sse"
    }
  }
}
```

**Verification:**
- Restart Windsurf
- Test MCP server functionality in the chat interface

---

#### 3. VS Code

**Prerequisites:**
- Visual Studio Code
- MCP extension for VS Code
- Firecrawl API Key

**One-Click Installation:**
Click the VS Code install button on the Firecrawl MCP repository at https://github.com/firecrawl/firecrawl-mcp-server.

**Manual Installation:**
1. Press `Ctrl + Shift + P`
2. Type "Preferences: Open User Settings (JSON)"
3. Add the following configuration:

```json
{
  "mcp": {
    "inputs": [
      {
        "type": "promptString",
        "id": "apiKey",
        "description": "Firecrawl API Key",
        "password": true
      }
    ],
    "servers": {
      "firecrawl": {
        "command": "npx",
        "args": ["-y", "firecrawl-mcp"],
        "env": {
          "FIRECRAWL_API_KEY": "${input:apiKey}"
        }
      }
    }
  }
}
```

**Project-Specific Configuration:**
Create `.vscode/mcp.json` in your workspace:

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "apiKey",
      "description": "Firecrawl API Key",
      "password": true
    }
  ],
  "servers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "${input:apiKey}"
      }
    }
  }
}
```

**Remote Server Connection:**
```json
{
  "mcp": {
    "servers": {
      "firecrawl": {
        "type": "http",
        "url": "https://firecrawl-mcp-server.your-domain.com/mcp"
      }
    }
  }
}
```

**Verification:**
- Restart VS Code
- Check that the MCP server appears in the MCP panel

---

#### 4. Claude Desktop

**Prerequisites:**
- Claude Desktop app
- Firecrawl API Key

**Installation Steps:**
1. Locate your Claude Desktop config file: `claude_desktop_config.json`
2. Add the following configuration:

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "YOUR_API_KEY_HERE",
        "FIRECRAWL_RETRY_MAX_ATTEMPTS": "5",
        "FIRECRAWL_RETRY_INITIAL_DELAY": "2000",
        "FIRECRAWL_RETRY_MAX_DELAY": "30000",
        "FIRECRAWL_RETRY_BACKOFF_FACTOR": "3",
        "FIRECRAWL_CREDIT_WARNING_THRESHOLD": "2000",
        "FIRECRAWL_CREDIT_CRITICAL_THRESHOLD": "500"
      }
    }
  }
}
```

**Config File Locations:**
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

**Verification:**
- Restart Claude Desktop
- Test with: "Use firecrawl to scrape https://example.com"

---

#### 5. Claude Code

**Prerequisites:**
- Claude Code CLI
- Firecrawl API Key

**Remote Server Installation:**
```bash
claude mcp add --transport http firecrawl-mcp https://firecrawl-mcp-server.your-domain.com/mcp
```

**SSE Transport:**
```bash
claude mcp add --transport sse firecrawl-mcp https://firecrawl-mcp-server.your-domain.com/sse
```

**Local Server Installation:**
```bash
claude mcp add firecrawl-mcp -- npx -y firecrawl-mcp
```

**With Environment Variables:**
```bash
FIRECRAWL_API_KEY=your-api-key claude mcp add firecrawl-mcp -- npx -y firecrawl-mcp
```

**Verification:**
- List servers: `claude mcp list`
- Test functionality in Claude Code chat

---

#### 6. Cline

**Prerequisites:**
- Cline extension/app
- Firecrawl API Key

**Installation Steps (Marketplace - Recommended):**
1. Open **Cline**
2. Click the hamburger menu icon (☰)
3. Navigate to **MCP Servers** section
4. Click on **Marketplace** tab
5. Search for "firecrawl"
6. Click **Install** button

**Manual Installation:**
Add to your Cline MCP configuration:

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "YOUR_API_KEY"
      },
      "autoApprove": [],
      "disabled": false,
      "timeout": 60
    }
  }
}
```

**Verification:**
- Check MCP servers list in Cline
- Test with web scraping request

---

#### 7. Zed

**Prerequisites:**
- Zed editor
- Firecrawl API Key

**Installation via Extensions:**
1. Open Zed
2. Go to Extensions
3. Search for Firecrawl MCP
4. Install and configure

**Manual Installation:**
Add to your Zed `settings.json`:

```json
{
  "context_servers": {
    "Firecrawl": {
      "command": {
        "path": "npx",
        "args": ["-y", "firecrawl-mcp"]
      },
      "env": {
        "FIRECRAWL_API_KEY": "YOUR_API_KEY"
      },
      "settings": {}
    }
  }
}
```

**Config File Location:**
- **macOS:** `~/.config/zed/settings.json`
- **Linux:** `~/.config/zed/settings.json`
- **Windows:** `%APPDATA%\Zed\settings.json`

**Verification:**
- Restart Zed
- Check context servers in settings

---

### 🏢 Development Environments

#### 8. Visual Studio 2022

**Prerequisites:**
- Visual Studio 2022
- MCP extension for Visual Studio
- Firecrawl API Key

**Installation Steps:**
1. Follow the Visual Studio MCP Servers documentation at https://docs.microsoft.com/visualstudio/mcp
2. Add to your Visual Studio MCP config file:

**Remote Server Connection:**
```json
{
  "mcp": {
    "servers": {
      "firecrawl": {
        "type": "http",
        "url": "https://firecrawl-mcp-server.your-domain.com/mcp"
      }
    }
  }
}
```

**Local Server Connection:**
```json
{
  "mcp": {
    "servers": {
      "firecrawl": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "firecrawl-mcp"],
        "env": {
          "FIRECRAWL_API_KEY": "YOUR_API_KEY"
        }
      }
    }
  }
}
```

**Verification:**
- Restart Visual Studio 2022
- Check MCP servers in AI Assistant settings

---

#### 9. JetBrains AI Assistant (IntelliJ, PyCharm, WebStorm, etc.)

**Prerequisites:**
- JetBrains IDE with AI Assistant plugin
- Firecrawl API Key

**Installation Steps:**
1. Open JetBrains IDE
2. Go to **Settings** → **Tools** → **AI Assistant** → **Model Context Protocol (MCP)**
3. Click **+ Add**
4. Click **Command** in the top-left corner
5. Select **As JSON** option
6. Add this configuration and click **OK**:

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

7. Click **Apply** to save changes

**Verification:**
- Restart your JetBrains IDE
- Test AI Assistant with web scraping requests

---

#### 10. Augment Code

**Prerequisites:**
- Augment Code extension/app
- Firecrawl API Key

**UI Installation (Recommended):**
1. Click the hamburger menu
2. Select **Settings**
3. Navigate to **Tools** section
4. Click **+ Add MCP** button
5. Enter command: `npx -y firecrawl-mcp`
6. Name: **Firecrawl**
7. Set environment variable: `FIRECRAWL_API_KEY=your-api-key`
8. Click **Add** button

**Manual Configuration:**
1. Press Cmd/Ctrl + Shift + P
2. Select "Edit Settings"
3. Under Advanced, click "Edit in settings.json"
4. Add to the `mcpServers` array in the `augment.advanced` object:

```json
{
  "augment.advanced": {
    "mcpServers": [
      {
        "name": "firecrawl",
        "command": "npx",
        "args": ["-y", "firecrawl-mcp"],
        "env": {
          "FIRECRAWL_API_KEY": "YOUR_API_KEY"
        }
      }
    ]
  }
}
```

**Verification:**
- Restart your editor
- Check for syntax errors in configuration
- Test with web scraping functionality

---

### 🖥️ Terminal & CLI Tools

#### 11. Gemini CLI

**Prerequisites:**
- Gemini CLI installed
- Firecrawl API Key

**Installation Steps:**
1. Open the Gemini CLI settings file: `~/.gemini/settings.json`
2. Add to the `mcpServers` object (create if it doesn't exist):

**Remote Server Connection:**
```json
{
  "mcpServers": {
    "firecrawl": {
      "httpUrl": "https://firecrawl-mcp-server.your-domain.com/mcp"
    }
  }
}
```

**Local Server Connection:**
```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

**Config File Locations:**
- **Unix/Linux/macOS:** `~/.gemini/settings.json`
- **Windows:** `%USERPROFILE%\.gemini\settings.json`

**Verification:**
- Restart Gemini CLI
- Test web scraping functionality

---

#### 12. Amazon Q Developer CLI

**Prerequisites:**
- Amazon Q Developer CLI
- Firecrawl API Key

**Installation Steps:**
Add to your Amazon Q Developer CLI configuration file:

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

**Config File Location:**
See Amazon Q Developer CLI documentation at https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/ for config file location.

**Verification:**
- Restart Amazon Q CLI
- Test with web scraping commands

---

#### 13. Warp

**Prerequisites:**
- Warp terminal
- Firecrawl API Key

**Installation Steps:**
1. Navigate **Settings** > **AI** > **Manage MCP servers**
2. Add a new MCP server by clicking **+ Add** button
3. Paste the configuration:

```json
{
  "Firecrawl": {
    "command": "npx",
    "args": ["-y", "firecrawl-mcp"],
    "env": {
      "FIRECRAWL_API_KEY": "YOUR_API_KEY"
    },
    "working_directory": null,
    "start_on_launch": true
  }
}
```

4. Click **Save** to apply changes

**Verification:**
- Check MCP servers list in Warp settings
- Test AI functionality with web scraping

---

### 🔧 Specialized Platforms

#### 14. Trae

**Prerequisites:**
- Trae platform access
- Firecrawl API Key

**Installation Steps:**
1. Use the "Add manually" feature in Trae
2. Fill in the JSON configuration:

**Remote Server Connection:**
```json
{
  "mcpServers": {
    "firecrawl": {
      "url": "https://firecrawl-mcp-server.your-domain.com/mcp"
    }
  }
}
```

**Local Server Connection:**
```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

**Verification:**
- Check Trae MCP servers list
- Test functionality

---

#### 15. BoltAI

**Prerequisites:**
- BoltAI app
- Firecrawl API Key

**Installation Steps:**
1. Open BoltAI **Settings** page
2. Navigate to **Plugins**
3. Enter the following JSON:

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

4. Save the configuration

**Usage:**
- In chat, use commands like: `scrape-url https://example.com`
- Or: `firecrawl-scrape https://example.com`

**iOS Setup:**
See BoltAI iOS guide at https://boltai.com/docs/ios-setup for mobile configuration.

**Verification:**
- Test with web scraping commands in BoltAI chat

---

#### 16. Roo Code

**Prerequisites:**
- Roo Code IDE
- Firecrawl API Key

**Remote Server Connection:**
```json
{
  "mcpServers": {
    "firecrawl": {
      "type": "streamable-http",
      "url": "https://firecrawl-mcp-server.your-domain.com/mcp"
    }
  }
}
```

**Local Server Connection:**
```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

See Roo Code MCP documentation at https://roo.code/docs/mcp for detailed setup.

**Verification:**
- Restart Roo Code
- Test MCP functionality

---

#### 17. Zencoder

**Prerequisites:**
- Zencoder platform access
- Firecrawl API Key

**Installation Steps:**
1. Go to the Zencoder menu (...)
2. Select **Agent tools** from dropdown
3. Click **Add custom MCP**
4. Add name and server configuration:

```json
{
  "command": "npx",
  "args": ["-y", "firecrawl-mcp"],
  "env": {
    "FIRECRAWL_API_KEY": "YOUR_API_KEY"
  }
}
```

5. Hit the **Install** button

**Verification:**
- Check Agent tools list
- Test web scraping functionality

---

#### 18. Qodo Gen

**Prerequisites:**
- Qodo Gen in VSCode or IntelliJ
- Firecrawl API Key

**Installation Steps:**
1. Open Qodo Gen chat panel in VSCode or IntelliJ
2. Click **Connect more tools**
3. Click **+ Add new MCP**
4. Add configuration:

```json
{
  "mcpServers": {
    "firecrawl": {
      "url": "https://firecrawl-mcp-server.your-domain.com/mcp"
    }
  }
}
```

See Qodo Gen documentation at https://docs.qodo.ai/qodo-documentation for more details.

**Verification:**
- Check connected tools in Qodo Gen
- Test with web scraping requests

---

#### 19. Copilot Coding Agent

**Prerequisites:**
- GitHub repository with Copilot access
- Firecrawl API Key

**Installation Steps:**
1. Go to **Repository** → **Settings** → **Copilot** → **Coding agent** → **MCP configuration**
2. Add configuration to the `mcp` section:

```json
{
  "mcpServers": {
    "firecrawl": {
      "type": "http",
      "url": "https://firecrawl-mcp-server.your-domain.com/mcp",
      "tools": [
        "firecrawl_scrape",
        "firecrawl_batch_scrape",
        "firecrawl_map",
        "firecrawl_crawl",
        "firecrawl_search",
        "firecrawl_extract"
      ]
    }
  }
}
```

See GitHub Copilot MCP documentation at https://github.blog/ai-and-ml/generative-ai/a-practical-guide-on-how-to-use-the-github-mcp-server/ for more information.

**Verification:**
- Test Copilot with web scraping requests in your repository

---

#### 20. Kiro

**Prerequisites:**
- Kiro platform access
- Firecrawl API Key

**Installation Steps:**
1. Navigate **Kiro** > **MCP Servers**
2. Click **+ Add** button
3. Paste configuration:

```json
{
  "mcpServers": {
    "Firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "YOUR_API_KEY"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

4. Click **Save** to apply changes

**Verification:**
- Check MCP servers list in Kiro
- Test functionality

---

### 🐳 Runtime & Platform Alternatives

#### 21. Docker

**Prerequisites:**
- Docker Desktop or Docker daemon running
- Firecrawl API Key

**Installation Steps:**

1. **Create Dockerfile:**
Create a `Dockerfile` in your project directory:

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install firecrawl-mcp globally
RUN npm install -g firecrawl-mcp

# Expose default port (optional)
# EXPOSE 3000

# Default command to run the server
CMD ["firecrawl-mcp"]
```

2. **Build Docker Image:**
```bash
docker build -t firecrawl-mcp .
```

3. **Configure MCP Client:**
Update your MCP client configuration to use Docker:

**Example for Cline:**
```json
{
  "mcpServers": {
    "firecrawl": {
      "autoApprove": [],
      "disabled": false,
      "timeout": 60,
      "command": "docker",
      "args": ["run", "-i", "--rm", "-e", "FIRECRAWL_API_KEY=YOUR_API_KEY", "firecrawl-mcp"],
      "transportType": "stdio"
    }
  }
}
```

**For other clients, adapt the structure:**
- Replace `mcpServers` with appropriate key (`servers` for some clients)
- Ensure the Docker image name matches your build tag
- Include environment variables in the Docker run command

**Alternative: Docker Compose**
Create `docker-compose.yml`:

```yaml
version: '3.8'
services:
  firecrawl-mcp:
    build: .
    environment:
      - FIRECRAWL_API_KEY=YOUR_API_KEY
    stdin_open: true
    tty: true
```

**Verification:**
- Test Docker image: `docker run -e FIRECRAWL_API_KEY=your-key firecrawl-mcp --help`
- Check MCP client connection

---

#### 22. Windows

**Prerequisites:**
- Windows 10/11
- Node.js installed
- Firecrawl API Key

**Installation Steps:**
The configuration on Windows differs from Linux/macOS. Here's an example for Cline:

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "YOUR_API_KEY"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

**Alternative Windows Commands:**
```bash
# PowerShell
$env:FIRECRAWL_API_KEY="your-api-key"; npx -y firecrawl-mcp

# Command Prompt
set FIRECRAWL_API_KEY=your-api-key && npx -y firecrawl-mcp

# For Cursor on Windows
cmd /c "set FIRECRAWL_API_KEY=your-api-key && npx -y firecrawl-mcp"
```

**Path Considerations:**
- Use `cmd` command for Windows compatibility
- Include `/c` flag for command execution
- Ensure Node.js is in PATH

**Verification:**
- Test in Command Prompt or PowerShell
- Verify MCP client connection

---

#### 23. Smithery (Package Manager)

**Prerequisites:**
- Node.js installed
- Smithery account and key
- Firecrawl API Key

**Installation Steps:**

**Automatic Installation:**
```bash
npx -y @smithery/cli@latest install firecrawl-mcp --client <CLIENT_NAME> --key <YOUR_SMITHERY_KEY>
```

**Supported Clients:**
- `cursor`
- `claude`
- `vscode`
- `windsurf`
- And more...

**Example for Claude Desktop:**
```bash
npx -y @smithery/cli@latest install firecrawl-mcp --client claude --key your-smithery-key
```

**Get Smithery Key:**
Visit https://smithery.ai to create account and get your key.

**Manual Smithery Configuration:**
If you prefer manual setup after Smithery installation:

```bash
# Install via Smithery
npx -y @smithery/cli@latest install firecrawl-mcp --client claude

# Then configure API key in claude_desktop_config.json
```

**Verification:**
- Check client configuration was automatically updated
- Test functionality with your API key

---

## Environment Variables Configuration

### Required Variables
```bash
# Required for cloud API (default)
export FIRECRAWL_API_KEY="fc-YOUR_API_KEY"

# Optional: Custom endpoint for self-hosted instances
export FIRECRAWL_API_URL="https://firecrawl.your-domain.com"
```

### Optional Configuration
```bash
# Retry Configuration
export FIRECRAWL_RETRY_MAX_ATTEMPTS=5
export FIRECRAWL_RETRY_INITIAL_DELAY=2000
export FIRECRAWL_RETRY_MAX_DELAY=30000
export FIRECRAWL_RETRY_BACKOFF_FACTOR=3

# Credit Monitoring
export FIRECRAWL_CREDIT_WARNING_THRESHOLD=2000
export FIRECRAWL_CREDIT_CRITICAL_THRESHOLD=500
```

### SSE Local Mode
```bash
# Enable Server-Sent Events (SSE) local mode
export SSE_LOCAL=true
export FIRECRAWL_API_KEY="fc-YOUR_API_KEY"
npx -y firecrawl-mcp

# Use URL: http://localhost:3000/sse
```

---

## Verification & Testing

### Test MCP Connection
After installation, test the connection with these commands in your MCP client:

1. **Basic Scrape Test:**
   ```
   Scrape the content from https://example.com
   ```

2. **Search Test:**
   ```
   Search for "firecrawl documentation" and get the top 3 results
   ```

3. **Map Test:**
   ```
   Map all URLs on https://firecrawl.dev
   ```

### Common Test Prompts
- "Use firecrawl to scrape https://news.ycombinator.com"
- "Search the web for 'AI news' and extract content from top 5 results"
- "Map the structure of https://docs.firecrawl.dev"
- "Crawl https://blog.firecrawl.dev with depth 2"

### Troubleshooting Tests
If experiencing issues, try:

```bash
# Test direct execution
env FIRECRAWL_API_KEY=your-key npx -y firecrawl-mcp

# Test with MCP Inspector
npx -y @modelcontextprotocol/inspector npx firecrawl-mcp

# Test with verbose logging
DEBUG=* env FIRECRAWL_API_KEY=your-key npx -y firecrawl-mcp
```

---

## Available Tools

Once installed, you'll have access to these Firecrawl MCP tools:

### Core Tools
- `firecrawl_scrape` - Scrape single URL
- `firecrawl_batch_scrape` - Scrape multiple URLs
- `firecrawl_map` - Discover URLs on a site
- `firecrawl_crawl` - Crawl website with depth
- `firecrawl_search` - Web search with content extraction
- `firecrawl_extract` - Extract structured data

### Status Tools
- `firecrawl_check_crawl_status` - Check crawl job status
- `firecrawl_check_batch_status` - Check batch operation status

---

## Troubleshooting

### Common Issues

#### 1. Module Not Found Errors
**Error:** `ERR_MODULE_NOT_FOUND`

**Solution:** Try using `bunx` instead of `npx`:
```json
{
  "command": "bunx",
  "args": ["-y", "firecrawl-mcp"]
}
```

#### 2. ESM Resolution Issues
**Error:** `Cannot find module 'uriTemplate.js'`

**Solution:** Add experimental VM modules flag:
```json
{
  "command": "npx",
  "args": ["-y", "--node-options=--experimental-vm-modules", "firecrawl-mcp"]
}
```

#### 3. TLS/Certificate Issues
**Solution:** Use experimental fetch flag:
```json
{
  "command": "npx",
  "args": ["-y", "--node-options=--experimental-fetch", "firecrawl-mcp"]
}
```

#### 4. API Key Issues
**Error:** Authentication failed

**Solutions:**
- Verify API key is correct (starts with `fc-`)
- Check key has sufficient credits
- Ensure no extra spaces or characters

#### 5. Windows Path Issues
**Error:** Command not found on Windows

**Solution:** Use full Windows command syntax:
```json
{
  "command": "cmd",
  "args": ["/c", "npx", "-y", "firecrawl-mcp"]
}
```

### General Troubleshooting Steps
1. Ensure Node.js >= v18.0.0: `node --version`
2. Try latest package version: add `@latest` to package name
3. Use alternative runtime: `bunx` or `deno`
4. Check API key and credits at https://firecrawl.dev/app/api-keys
5. Test with MCP Inspector for debugging

### Getting Help
- 📖 Firecrawl Documentation: https://docs.firecrawl.dev
- 💬 GitHub Issues: https://github.com/firecrawl/firecrawl-mcp-server/issues
- 🌐 Firecrawl Website: https://firecrawl.dev

---

## License

MIT License - see https://github.com/firecrawl/firecrawl-mcp-server/blob/main/LICENSE file for details.

---

## Contributing

This installation guide covers **23 MCP-compatible environments**. If you find issues or need to add support for additional environments:

1. Fork the firecrawl-mcp-server repository: https://github.com/firecrawl/firecrawl-mcp-server
2. Update documentation
3. Test your changes
4. Submit a pull request

**Current Status:** ✅ All 23+ environments documented with complete installation instructions.