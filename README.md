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
- Cloud browser sessions with agent-browser automation
- Automatic retries and rate limiting
- Cloud and self-hosted support
- SSE support

> Play around with [our MCP Server on MCP.so's playground](https://mcp.so/playground?server=firecrawl-mcp-server) or on [Klavis AI](https://www.klavis.ai/mcp-servers).


## Installation

### Quick Start

```bash
env FIRECRAWL_API_KEY=YOUR_API_KEY npx -y firecrawl-mcp
```

### Global Installation

```bash
npm install -g firecrawl-mcp
```

> Don't have an API key yet? Create an account and get one from [firecrawl.dev](https://www.firecrawl.dev/app/api-keys).

### MCP Client Setup

Select your environment below for detailed installation instructions.

### IDE & Editor Integration

Click your IDE to expand setup instructions.

> Replace `YOUR_API_KEY` with your [Firecrawl API key](https://www.firecrawl.dev/app/api-keys). For self-hosted instances, set `FIRECRAWL_API_URL` to your server endpoint.

---

<details>
<summary><b>Cursor</b></summary>

#### Prerequisites
- [Cursor](https://www.cursor.com/) installed (v0.45.6 or later)
- [Node.js](https://nodejs.org/) 18+
- A Firecrawl API key

#### Configuration

**Cursor v0.48.6+ (Recommended — JSON Config)**

1. Open **Cursor Settings** → **MCP** → **Add new global MCP server**.
2. Cursor will open your `~/.cursor/mcp.json` file. Add the following:

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

For self-hosted Firecrawl instances, add `FIRECRAWL_API_URL` to the `env` block:

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "YOUR_API_KEY",
        "FIRECRAWL_API_URL": "http://localhost:3002"
      }
    }
  }
}
```

**Cursor v0.45.6 (Legacy)**

1. Open **Cursor Settings** → **Features** → **MCP Servers**.
2. Click **+ Add New MCP Server**.
3. Enter:
   - **Name:** `firecrawl-mcp`
   - **Type:** `command`
   - **Command:** `env FIRECRAWL_API_KEY=YOUR_API_KEY npx -y firecrawl-mcp`

**One-Click Install**

[![Install MCP Server](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/install-mcp?name=firecrawl-mcp&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImZpcmVjcmF3bC1tY3AiXSwiZW52Ijp7IkZJUkVDUkFXTF9BUElfS0VZIjoiWU9VUl9BUElfS0VZIn19)

> After one-click install, update `YOUR_API_KEY` in `~/.cursor/mcp.json` with your actual key.

#### Verification
1. Open **Cursor Settings** → **MCP**.
2. Confirm `firecrawl-mcp` appears in the server list with a green status indicator.
3. Open the AI chat panel (Ctrl/Cmd+L) and ask: *"Use firecrawl to scrape https://example.com"* to confirm the tools are available.

</details>

---

<details>
<summary><b>VS Code / VS Code Insiders</b></summary>

#### Prerequisites
- [VS Code](https://code.visualstudio.com/) 1.99+ or [VS Code Insiders](https://code.visualstudio.com/insiders/)
- [GitHub Copilot](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot) extension with MCP support enabled
- [Node.js](https://nodejs.org/) 18+
- A Firecrawl API key

#### Configuration

**One-Click Install**

Install directly into VS Code with one click:

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0078d4?logo=visualstudiocode)](https://insiders.vscode.dev/redirect/mcp/install?name=firecrawl-mcp&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22firecrawl-mcp%22%5D%2C%22env%22%3A%7B%22FIRECRAWL_API_KEY%22%3A%22YOUR_API_KEY%22%7D%7D) [![Install in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Install_Server-24bfa5?logo=visualstudiocode)](https://insiders.vscode.dev/redirect/mcp/install?name=firecrawl-mcp&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22firecrawl-mcp%22%5D%2C%22env%22%3A%7B%22FIRECRAWL_API_KEY%22%3A%22YOUR_API_KEY%22%7D%7D)

> After one-click install, update `YOUR_API_KEY` in your settings with your actual key.

**User Settings (JSON) — global**

1. Open the Command Palette (Ctrl/Cmd+Shift+P) → **Preferences: Open User Settings (JSON)**.
2. Add the following to your `settings.json`:

```json
{
  "mcp": {
    "servers": {
      "firecrawl-mcp": {
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

**Workspace config — project-scoped**

Create a `.vscode/mcp.json` file in your project root:

```json
{
  "servers": {
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

> You can use `${input:firecrawl-api-key}` instead of hardcoding the key to be prompted on startup.

**Remote server (HTTP)**

If you are running Firecrawl MCP as a remote HTTP server:

```json
{
  "servers": {
    "firecrawl-mcp": {
      "type": "http",
      "url": "http://localhost:3002/mcp"
    }
  }
}
```

#### Verification
1. Open the Command Palette (Ctrl/Cmd+Shift+P) → **MCP: List Servers**.
2. Confirm `firecrawl-mcp` appears and shows a running status.
3. In Copilot Chat (Agent mode), ask: *"Use firecrawl to scrape https://example.com"* to verify tool access.

> [VS Code MCP docs](https://code.visualstudio.com/docs/copilot/chat/mcp-servers)

</details>

---

<details>
<summary><b>Windsurf</b></summary>

#### Prerequisites
- [Windsurf](https://codeium.com/windsurf) IDE installed
- [Node.js](https://nodejs.org/) 18+
- A Firecrawl API key

#### Configuration

1. Open **Windsurf Settings** → **Cascade** → **MCP** → **Add Server** → **Add custom server**.
2. This opens the `~/.codeium/windsurf/mcp_config.json` file. Add the following:

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

For self-hosted Firecrawl instances:

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "YOUR_API_KEY",
        "FIRECRAWL_API_URL": "http://localhost:3002"
      }
    }
  }
}
```

#### Verification
1. Open **Windsurf Settings** → **Cascade** → **MCP**.
2. Confirm `firecrawl-mcp` appears in the server list with a green status dot.
3. In Cascade, ask: *"Use firecrawl to scrape https://example.com"* to confirm the tools are accessible.

> [Windsurf MCP docs](https://docs.codeium.com/windsurf/mcp)

</details>

---

<details>
<summary><b>Zed</b></summary>

#### Prerequisites
- [Zed](https://zed.dev/) editor installed (v0.175.0+ for MCP support)
- [Node.js](https://nodejs.org/) 18+
- A Firecrawl API key

#### Configuration

1. Open **Zed** → **Settings** (Cmd+, on macOS) to edit your `settings.json`.
2. Add the MCP server configuration under `"context_servers"`:

```json
{
  "context_servers": {
    "firecrawl-mcp": {
      "command": {
        "path": "npx",
        "args": ["-y", "firecrawl-mcp"],
        "env": {
          "FIRECRAWL_API_KEY": "YOUR_API_KEY"
        }
      }
    }
  }
}
```

For self-hosted Firecrawl instances:

```json
{
  "context_servers": {
    "firecrawl-mcp": {
      "command": {
        "path": "npx",
        "args": ["-y", "firecrawl-mcp"],
        "env": {
          "FIRECRAWL_API_KEY": "YOUR_API_KEY",
          "FIRECRAWL_API_URL": "http://localhost:3002"
        }
      }
    }
  }
}
```

#### Verification
1. Open the **Assistant Panel** (Cmd+? on macOS / Ctrl+? on Linux).
2. Click the tools icon and confirm Firecrawl tools are listed.
3. Ask: *"Use firecrawl to scrape https://example.com"* to verify tool access.

> [Zed context servers docs](https://zed.dev/docs/context-servers)

</details>

---

<details>
<summary><b>JetBrains AI Assistant</b></summary>

#### Prerequisites
- A [JetBrains IDE](https://www.jetbrains.com/) (IntelliJ IDEA, PyCharm, WebStorm, etc.) 2025.1+
- [AI Assistant](https://plugins.jetbrains.com/plugin/22282-ai-assistant) plugin installed and enabled
- [Node.js](https://nodejs.org/) 18+
- A Firecrawl API key

#### Configuration

1. Open **Settings** → **Tools** → **AI Assistant** → **Model Context Protocol (MCP)**.
2. Click **+ Add** → **As JSON**.
3. Enter the following configuration:

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

For self-hosted Firecrawl instances, add `FIRECRAWL_API_URL` to the `env` block:

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "YOUR_API_KEY",
        "FIRECRAWL_API_URL": "http://localhost:3002"
      }
    }
  }
}
```

#### Verification
1. Navigate to **Settings** → **Tools** → **AI Assistant** → **Model Context Protocol (MCP)**.
2. Confirm `firecrawl-mcp` appears in the server list and shows a connected status.
3. Open the AI Assistant chat and ask: *"Use firecrawl to scrape https://example.com"* to verify the tools are available.

> [JetBrains MCP docs](https://www.jetbrains.com/help/idea/model-context-protocol.html)

</details>

---

<details>
<summary><b>Trae</b></summary>

#### Prerequisites
- [Trae](https://www.trae.ai/) IDE installed
- [Node.js](https://nodejs.org/) 18+
- A Firecrawl API key

#### Configuration

1. Open **Trae** → **Settings** → **MCP Servers**.
2. Click **Add Server** → **Add Manually**.
3. Select **JSON** as the format and enter:

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

For self-hosted Firecrawl instances:

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "YOUR_API_KEY",
        "FIRECRAWL_API_URL": "http://localhost:3002"
      }
    }
  }
}
```

#### Verification
1. Open **Trae** → **Settings** → **MCP Servers**.
2. Confirm `firecrawl-mcp` appears with a green status indicator.
3. In the AI Builder chat, ask: *"Use firecrawl to scrape https://example.com"* to verify the tools are accessible.

</details>

---

<details>
<summary><b>LM Studio</b></summary>

#### Prerequisites
- [LM Studio](https://lmstudio.ai/) v0.3.6+ installed
- [Node.js](https://nodejs.org/) 18+
- A Firecrawl API key
- A model with tool-use support loaded in LM Studio

#### Configuration

1. Open **LM Studio** → navigate to the **Developer** tab (or the chat interface with tool support).
2. Click the **MCP Servers** icon in the toolbar → **Add MCP Server**.
3. Enter the following JSON configuration:

```json
{
  "firecrawl-mcp": {
    "command": "npx",
    "args": ["-y", "firecrawl-mcp"],
    "env": {
      "FIRECRAWL_API_KEY": "YOUR_API_KEY"
    }
  }
}
```

For self-hosted Firecrawl instances:

```json
{
  "firecrawl-mcp": {
    "command": "npx",
    "args": ["-y", "firecrawl-mcp"],
    "env": {
      "FIRECRAWL_API_KEY": "YOUR_API_KEY",
      "FIRECRAWL_API_URL": "http://localhost:3002"
    }
  }
}
```

> MCP tool calls require a model with function calling support (e.g., Qwen 2.5, Llama 3.1+, Mistral).

#### Verification
1. After adding the server, confirm the MCP connection indicator shows a green/connected state.
2. Open a new chat with a tool-use-capable model.
3. Ask: *"Use firecrawl to scrape https://example.com"* and confirm the model invokes the Firecrawl tools.

> [LM Studio MCP docs](https://lmstudio.ai/docs/advanced/mcp)

</details>

---

### AI Assistants & Code Tools

Click your environment to expand setup instructions.

<details>
<summary><b>Claude Desktop</b></summary>

#### Prerequisites
- [Claude Desktop](https://claude.ai/download) installed (macOS or Windows)
- [Node.js](https://nodejs.org/) v18+ installed
- A Firecrawl API key

#### Configuration

Open **Claude Desktop → Settings → Developer → Edit Config** to edit your `claude_desktop_config.json`.

**Local server (stdio)**

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

> **Self-hosted Firecrawl?** Add `"FIRECRAWL_API_URL": "http://localhost:3002"` to the `env` block.

**Remote server**

If you are running `firecrawl-mcp` as a remote HTTP server:

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "url": "https://your-firecrawl-mcp-server.example.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_AUTH_TOKEN"
      }
    }
  }
}
```

**Config file location:**

| OS | Path |
|---|---|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

#### Verification
1. Restart Claude Desktop after saving the config.
2. Look for the 🔌 MCP icon in the input area — click it to confirm **firecrawl-mcp** tools are listed.
3. Try asking: *"Use firecrawl to scrape https://example.com "*

</details>

<details>
<summary><b>Claude Code</b></summary>

#### Prerequisites
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI installed
- Node.js 18+ installed
- A Firecrawl API key

#### Configuration

**Local server (stdio)**

```bash
claude mcp add firecrawl-mcp \
  --transport stdio \
  --env FIRECRAWL_API_KEY=YOUR_API_KEY \
  -- npx -y firecrawl-mcp
```

For a self-hosted Firecrawl instance, add the API URL environment variable:

```bash
claude mcp add firecrawl-mcp \
  --transport stdio \
  --env FIRECRAWL_API_KEY=YOUR_API_KEY \
  --env FIRECRAWL_API_URL=http://localhost:3002 \
  -- npx -y firecrawl-mcp
```

**Remote server (HTTP)**

```bash
claude mcp add firecrawl-mcp \
  --transport http \
  https://your-firecrawl-mcp-server.example.com/mcp
```

**Useful commands:**

```bash
# List configured MCP servers
claude mcp list

# Remove the server
claude mcp remove firecrawl-mcp
```

#### Verification
1. Run `claude mcp list` and confirm `firecrawl-mcp` appears.
2. Start a Claude Code session and type `/mcp` to see active MCP servers.
3. Ask Claude Code to scrape a URL using Firecrawl to confirm the tools are working.

</details>

<details>
<summary><b>OpenCode</b></summary>

#### Prerequisites
- [OpenCode](https://opencode.ai) CLI installed
- Node.js 18+ installed
- A Firecrawl API key

#### Configuration

Add the server to your OpenCode config file (`opencode.json` in your project root or global config).

**Local server (stdio)**

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "firecrawl-mcp": {
      "type": "local",
      "command": ["npx", "-y", "firecrawl-mcp"],
      "environment": {
        "FIRECRAWL_API_KEY": "YOUR_API_KEY"
      },
      "enabled": true
    }
  }
}
```

> **Self-hosted?** Add `"FIRECRAWL_API_URL": "http://localhost:3002"` to the `environment` block.

**Remote server (HTTP)**

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "firecrawl-mcp": {
      "type": "remote",
      "url": "https://your-firecrawl-mcp-server.example.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_AUTH_TOKEN"
      },
      "enabled": true
    }
  }
}
```

#### Verification
1. Launch OpenCode in your project directory.
2. Run `opencode mcp list` to confirm the server is connected.
3. In a session, ask: *"Use firecrawl to scrape https://example.com"*

</details>

<details>
<summary><b>OpenAI Codex CLI</b></summary>

#### Prerequisites
- [Codex CLI](https://github.com/openai/codex) installed (`npm i -g @openai/codex` or `brew install --cask codex`)
- Node.js 18+ installed
- A Firecrawl API key

#### Configuration

Edit `~/.codex/config.toml` (global) or `.codex/config.toml` (project-scoped, trusted projects only).

**Local server (stdio)**

```toml
[mcp_servers.firecrawl-mcp]
command = "npx"
args = ["-y", "firecrawl-mcp"]

[mcp_servers.firecrawl-mcp.env]
FIRECRAWL_API_KEY = "YOUR_API_KEY"
# Uncomment for self-hosted Firecrawl:
# FIRECRAWL_API_URL = "http://localhost:3002"
```

Or add via CLI:

```bash
codex mcp add firecrawl-mcp \
  --env FIRECRAWL_API_KEY=YOUR_API_KEY \
  -- npx -y firecrawl-mcp
```

**Remote server (Streamable HTTP)**

```toml
[mcp_servers.firecrawl-mcp]
url = "https://your-firecrawl-mcp-server.example.com/mcp"
bearer_token_env_var = "FIRECRAWL_AUTH_TOKEN"
```

#### Verification
1. Run `codex mcp` to see all configured MCP servers.
2. Start a Codex session and type `/mcp` to confirm `firecrawl-mcp` is active.
3. Ask Codex to use Firecrawl to scrape a website.

</details>

<details>
<summary><b>Google Antigravity</b></summary>

#### Prerequisites
- [Google Antigravity](https://developers.google.com/antigravity) IDE installed
- Node.js 18+ installed
- A Firecrawl API key

#### Configuration

Open Antigravity's MCP server settings and add the following JSON configuration.

**Local server (stdio)**

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

> **Self-hosted?** Add `"FIRECRAWL_API_URL": "http://localhost:3002"` to the `env` block.

**Remote server**

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "serverUrl": "https://your-firecrawl-mcp-server.example.com/mcp"
    }
  }
}
```

#### Verification
1. Restart Antigravity after saving the configuration.
2. Open the MCP Servers panel and confirm **firecrawl-mcp** appears with a connected status.
3. Test by asking the agent: *"Use firecrawl to scrape https://example.com"*

</details>

<details>
<summary><b>Kiro</b></summary>

#### Prerequisites
- [Kiro](https://kiro.dev/) IDE installed
- Node.js 18+ installed
- A Firecrawl API key

#### Configuration

**Via the MCP Servers UI:**

1. Open **Kiro → Settings → MCP Servers**.
2. Click **Add Server**.
3. Enter the server name: `firecrawl-mcp`.
4. Set the command to: `npx -y firecrawl-mcp`.
5. Add the environment variable `FIRECRAWL_API_KEY` with your API key.
6. Click **Save**.

**Via JSON config file (`.kiro/settings/mcp.json`):**

**Local server (stdio)**

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

> **Self-hosted?** Add `"FIRECRAWL_API_URL": "http://localhost:3002"` to the `env` block.

**Remote server (HTTP)**

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "url": "https://your-firecrawl-mcp-server.example.com/mcp"
    }
  }
}
```

#### Verification
1. Open the MCP Servers panel in Kiro and confirm **firecrawl-mcp** shows a green connected indicator.
2. Start a Kiro agent session and ask: *"Use firecrawl to scrape https://example.com"*
3. Approve the tool call when prompted.

</details>

<details>
<summary><b>Kilo Code</b></summary>

#### Prerequisites
- [Kilo Code](https://kilo.ai/) VS Code extension or CLI installed
- Node.js 18+ installed
- A Firecrawl API key

#### Configuration

**Via the Settings UI:**

1. Click the ⚙️ icon in the Kilo Code pane to open **Settings**.
2. Navigate to **Agent Behaviour → MCP Servers**.
3. Click **Edit Global MCP** (or **Edit Project MCP** for project-scoped config).
4. Add the configuration below and save.

**Local server (stdio)**

Edit `mcp_settings.json` (global) or `.kilocode/mcp.json` (project-scoped):

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "YOUR_API_KEY"
      },
      "disabled": false
    }
  }
}
```

> **Self-hosted?** Add `"FIRECRAWL_API_URL": "http://localhost:3002"` to the `env` block.

**Remote server (Streamable HTTP)**

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "type": "streamable-http",
      "url": "https://your-firecrawl-mcp-server.example.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_AUTH_TOKEN"
      },
      "disabled": false
    }
  }
}
```

#### Verification
1. Open the **MCP Servers** panel in Kilo Code settings — confirm **firecrawl-mcp** shows as connected with a green toggle.
2. In the Kilo Code chat, ask: *"Use firecrawl to scrape https://example.com"*
3. Approve the tool call when prompted (or configure auto-approval for specific tools).

</details>

---

### VS Code Extensions & Plugins

<details>
<summary><b>Cline</b></summary>

#### Prerequisites
- [Cline extension](https://marketplace.visualstudio.com/items?itemName=saoudrizwan.claude-dev) installed in VS Code
- Node.js 18+
- A Firecrawl API key

#### Configuration

**Marketplace install (recommended)**

1. Open VS Code and navigate to the **Cline** panel
2. Click the **MCP Servers** icon in the top navigation
3. Search for `firecrawl-mcp` and click **Install**
4. When prompted, enter your Firecrawl API key

**Manual configuration**

Open the Cline MCP settings file and add the server configuration:

**Local (stdio) — runs the server as a child process:**

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

**Remote (Streamable HTTP) — connect to a running server instance:**

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "type": "streamableHttp",
      "url": "http://localhost:3000/mcp",
      "headers": {
        "x-api-key": "YOUR_API_KEY"
      }
    }
  }
}
```

**Self-hosted Firecrawl instance (local stdio with custom API URL):**

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "YOUR_API_KEY",
        "FIRECRAWL_API_URL": "http://your-firecrawl-instance:3000"
      }
    }
  }
}
```

#### Verification
1. Open the **Cline** panel in VS Code
2. Click the **MCP Servers** icon — `firecrawl-mcp` should appear with a green status indicator
3. Start a new Cline conversation and ask: *"Use firecrawl to scrape https://example.com"*
4. Cline should invoke the Firecrawl MCP tool and return the page content

</details>

<details>
<summary><b>Roo Code</b></summary>

#### Prerequisites
- [Roo Code extension](https://marketplace.visualstudio.com/items?itemName=RooVeterinaryInc.roo-cline) installed in VS Code
- Node.js 18+
- A Firecrawl API key

#### Configuration

Open Roo Code settings: **Roo Code panel → MCP Servers → Edit MCP Settings**

**Local (stdio) — runs the server as a child process:**

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

**Remote (Streamable HTTP) — connect to a running server instance:**

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "type": "streamable-http",
      "url": "http://localhost:3000/mcp",
      "headers": {
        "x-api-key": "YOUR_API_KEY"
      }
    }
  }
}
```

**Self-hosted Firecrawl instance (local stdio with custom API URL):**

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "YOUR_API_KEY",
        "FIRECRAWL_API_URL": "http://your-firecrawl-instance:3000"
      }
    }
  }
}
```

#### Verification
1. Open the **Roo Code** panel in VS Code
2. Navigate to **MCP Servers** — `firecrawl-mcp` should show as connected
3. In a new conversation, ask: *"Use firecrawl to scrape https://example.com"*
4. Roo Code should call the Firecrawl tools and return scraped content

</details>

<details>
<summary><b>Augment Code</b></summary>

#### Prerequisites
- [Augment Code extension](https://marketplace.visualstudio.com/items?itemName=augmentcode.augment) installed in VS Code
- Node.js 18+
- A Firecrawl API key

#### Configuration

**Via the UI**

1. Open VS Code **Settings** (`Cmd+,` / `Ctrl+,`)
2. Search for **"Augment Advanced"**
3. Find **Augment › Advanced: Mcp Servers**
4. Click **Add Item** and enter the JSON object for the server (see format below)

**Manual `settings.json`**

Open your VS Code `settings.json` (`Cmd+Shift+P` → **Preferences: Open User Settings (JSON)**) and add:

```json
{
  "augment.advanced": {
    "mcpServers": [
      {
        "name": "firecrawl-mcp",
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

**Self-hosted Firecrawl instance:**

```json
{
  "augment.advanced": {
    "mcpServers": [
      {
        "name": "firecrawl-mcp",
        "command": "npx",
        "args": ["-y", "firecrawl-mcp"],
        "env": {
          "FIRECRAWL_API_KEY": "YOUR_API_KEY",
          "FIRECRAWL_API_URL": "http://your-firecrawl-instance:3000"
        }
      }
    ]
  }
}
```

> **Note:** Augment Code uses an **array** format for `mcpServers` (under `augment.advanced`), unlike other extensions that use an object with named keys.

#### Verification
1. After saving `settings.json`, reload VS Code (`Cmd+Shift+P` → **Developer: Reload Window**)
2. Open the **Augment Code** panel — the `firecrawl-mcp` server should appear in the available tools list
3. Ask Augment: *"Use firecrawl to scrape https://example.com"*
4. Augment should invoke the Firecrawl MCP tools and return page content

</details>

<details>
<summary><b>Continue</b></summary>

#### Prerequisites
- [Continue extension](https://marketplace.visualstudio.com/items?itemName=Continue.continue) installed in VS Code
- Node.js 18+
- A Firecrawl API key

#### Configuration

Edit your Continue configuration file at `~/.continue/config.json` and add the `firecrawl-mcp` server to the `mcpServers` array:

```json
{
  "mcpServers": [
    {
      "name": "firecrawl-mcp",
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "YOUR_API_KEY"
      }
    }
  ]
}
```

**Self-hosted Firecrawl instance:**

```json
{
  "mcpServers": [
    {
      "name": "firecrawl-mcp",
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "YOUR_API_KEY",
        "FIRECRAWL_API_URL": "http://your-firecrawl-instance:3000"
      }
    }
  ]
}
```

> **Note:** The `mcpServers` key shown above should be merged into your existing `config.json` alongside your other Continue settings (models, context providers, etc.).

#### Verification
1. Reload VS Code after saving the config (`Cmd+Shift+P` → **Developer: Reload Window**)
2. Open the **Continue** panel and start a new session
3. Ask: *"Use firecrawl to scrape https://example.com"*
4. Continue should invoke the Firecrawl MCP tools and return the scraped content

</details>

---

### CLI, Platforms & Advanced Deployment

<details>
<summary><b>Gemini CLI</b></summary>

#### Prerequisites
- [Gemini CLI](https://github.com/google-gemini/gemini-cli) installed and authenticated
- Node.js 18+
- A Firecrawl API key

#### Configuration

Gemini CLI supports two modes: **remote HTTP** (connecting to a hosted MCP endpoint) and **local command** (spawning the server as a subprocess).

**Remote (HTTP):**

Edit `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "httpUrl": "https://your-firecrawl-mcp-endpoint.example.com/mcp"
    }
  }
}
```

**Local (stdio):**

Edit `~/.gemini/settings.json`:

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

> **Self-hosted Firecrawl?** Add `"FIRECRAWL_API_URL": "http://localhost:3002"` to the `env` block.

#### Verification
1. Start Gemini CLI: `gemini`
2. Ask: *"Use firecrawl to scrape https://example.com"*
3. Confirm the tool call executes and returns page content

</details>

<details>
<summary><b>GitHub Copilot Coding Agent</b></summary>

#### Prerequisites
- GitHub repository with Copilot Coding Agent enabled
- A publicly accessible Firecrawl MCP HTTP endpoint (the coding agent runs in GitHub's cloud and cannot spawn local processes)

#### Configuration

In your repository, go to **Settings → Copilot → Coding agent → MCP servers**, then add:

```json
{
  "firecrawl-mcp": {
    "type": "http",
    "url": "https://your-firecrawl-mcp-endpoint.example.com/mcp",
    "headers": {
      "Authorization": "Bearer YOUR_TOKEN"
    }
  }
}
```

> The endpoint must be reachable from GitHub's infrastructure. You can deploy the Firecrawl MCP server in [Streamable HTTP mode](#streamable-http-local-server-mode) on a public host and point this configuration to it.

#### Verification
1. Open an issue or PR in the repository and assign Copilot
2. Ask Copilot to use Firecrawl to scrape a URL
3. Confirm the agent invokes the MCP tool and returns results in the PR/issue thread

</details>

<details>
<summary><b>GitHub Copilot CLI</b></summary>

#### Prerequisites
- [GitHub Copilot in the CLI](https://docs.github.com/en/copilot/github-copilot-in-the-cli) installed (`gh copilot`)
- Node.js 18+
- A Firecrawl API key

#### Configuration

Create or edit `~/.copilot/mcp-config.json`:

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

#### Verification
1. Run `gh copilot` in your terminal
2. Ask: *"Use firecrawl to scrape https://example.com"*
3. Confirm the tool call succeeds and returns scraped content

</details>

<details>
<summary><b>Amazon Q Developer CLI</b></summary>

#### Prerequisites
- [Amazon Q Developer CLI](https://aws.amazon.com/q/developer/) installed
- Node.js 18+
- A Firecrawl API key

#### Configuration

Add to your Amazon Q Developer MCP configuration file (`~/.aws/amazonq/mcp.json`):

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

#### Verification
1. Launch Amazon Q Developer CLI: `q chat`
2. Ask: *"Use firecrawl to scrape https://example.com"*
3. Confirm the tool is recognized and returns scraped content

</details>

<details>
<summary><b>Warp</b></summary>

#### Prerequisites
- [Warp](https://www.warp.dev/) terminal installed (v2024.x+)
- Node.js 18+
- A Firecrawl API key

#### Configuration

1. Open Warp and go to **Settings → AI → Manage MCP servers**
2. Click **+ Add Server** and enter the following configuration:

```json
{
  "firecrawl-mcp": {
    "command": "npx",
    "args": ["-y", "firecrawl-mcp"],
    "env": {
      "FIRECRAWL_API_KEY": "YOUR_API_KEY"
    }
  }
}
```

3. Click **Save**

#### Verification
1. Open Warp's AI panel
2. Ask: *"Use firecrawl to scrape https://example.com"*
3. Confirm the MCP tool is invoked and returns page content

</details>

<details>
<summary><b>Amp</b></summary>

#### Prerequisites
- [Amp](https://ampcode.com/) installed
- Node.js 18+
- A Firecrawl API key

#### Configuration

Add the Firecrawl MCP server using the Amp CLI:

```bash
amp mcp add firecrawl-mcp -- npx -y firecrawl-mcp \
  --env FIRECRAWL_API_KEY=YOUR_API_KEY
```

Or manually add to your Amp MCP configuration:

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

#### Verification
1. Launch Amp
2. Ask: *"Use firecrawl to scrape https://example.com"*
3. Confirm the tool call returns scraped content

</details>

<details>
<summary><b>ChatGPT (Web & Desktop)</b></summary>

#### Prerequisites
- ChatGPT Plus, Pro, or Team subscription
- A remotely accessible Firecrawl MCP HTTP endpoint (ChatGPT connects to remote servers only — it cannot spawn local processes)

#### Configuration

1. Deploy the Firecrawl MCP server in [Streamable HTTP mode](#streamable-http-local-server-mode) on a publicly accessible host, or use a hosted Firecrawl MCP endpoint
2. In ChatGPT (web or desktop), open **Settings → Developer Mode** and enable it
3. Go to **Settings → MCP Servers → + Add Server**
4. Enter:
   - **Name:** `firecrawl-mcp`
   - **Server URL:** `https://your-firecrawl-mcp-endpoint.example.com/mcp`

> **Important:** ChatGPT only supports remote HTTP MCP connections. You must deploy Firecrawl MCP as a publicly accessible HTTP server. See the [Streamable HTTP](#streamable-http-local-server-mode) section for running the server in HTTP mode, then expose it via a reverse proxy (e.g., nginx, Cloudflare Tunnel) with HTTPS.

#### Verification
1. Start a new ChatGPT conversation
2. Ask: *"Use firecrawl to scrape https://example.com"*
3. ChatGPT will show a tool-use confirmation — approve it and verify the results

</details>

<details>
<summary><b>Docker</b></summary>

#### Prerequisites
- Docker installed and running
- A Firecrawl API key

#### Configuration

Run the Firecrawl MCP server in a Docker container:

```bash
docker run -i --rm \
  -e FIRECRAWL_API_KEY=YOUR_API_KEY \
  node:22-slim \
  npx -y firecrawl-mcp
```

**For self-hosted Firecrawl instances:**

```bash
docker run -i --rm \
  -e FIRECRAWL_API_KEY=YOUR_API_KEY \
  -e FIRECRAWL_API_URL=http://host.docker.internal:3002 \
  node:22-slim \
  npx -y firecrawl-mcp
```

**With Streamable HTTP mode (exposed on port 3000):**

```bash
docker run -i --rm \
  -p 3000:3000 \
  -e FIRECRAWL_API_KEY=YOUR_API_KEY \
  -e HTTP_STREAMABLE_SERVER=true \
  node:22-slim \
  npx -y firecrawl-mcp
```

**Using Docker in an MCP client config:**

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "FIRECRAWL_API_KEY=YOUR_API_KEY",
        "node:22-slim",
        "npx", "-y", "firecrawl-mcp"
      ]
    }
  }
}
```

#### Verification
1. Run the container and check for startup output on stderr
2. Send a JSON-RPC request via stdin: `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`
3. Confirm the response lists Firecrawl tools (e.g., `firecrawl_scrape`, `firecrawl_map`)

</details>

<details>
<summary><b>Bun</b></summary>

#### Prerequisites
- [Bun](https://bun.sh/) installed (v1.0+)
- A Firecrawl API key

#### Configuration

Use `bunx` as a drop-in replacement for `npx` in any MCP client configuration:

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "bunx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

**Run directly from the command line:**

```bash
FIRECRAWL_API_KEY=YOUR_API_KEY bunx -y firecrawl-mcp
```

#### Verification
1. Run the command above — the server starts in stdio mode
2. Confirm no errors on startup
3. Send a JSON-RPC `tools/list` request via stdin to verify tools are registered

</details>

<details>
<summary><b>Deno</b></summary>

#### Prerequisites
- [Deno](https://deno.land/) installed (v2.0+)
- A Firecrawl API key

#### Configuration

Run the Firecrawl MCP server using Deno with the required permissions:

```bash
FIRECRAWL_API_KEY=YOUR_API_KEY \
  deno run \
  --allow-net --allow-env --allow-read --allow-sys \
  npm:firecrawl-mcp
```

**In an MCP client configuration:**

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "deno",
      "args": [
        "run",
        "--allow-net", "--allow-env", "--allow-read", "--allow-sys",
        "npm:firecrawl-mcp"
      ],
      "env": {
        "FIRECRAWL_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

#### Verification
1. Run the Deno command above
2. Confirm the server starts without permission errors
3. Test with a JSON-RPC `tools/list` request via stdin

</details>

<details>
<summary><b>Windows</b></summary>

#### Prerequisites
- Windows 10/11
- Node.js 18+ installed and on your `PATH`
- A Firecrawl API key

#### Configuration

**Using `cmd` (Command Prompt):**

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "cmd",
      "args": [
        "/c",
        "set FIRECRAWL_API_KEY=YOUR_API_KEY && npx -y firecrawl-mcp"
      ]
    }
  }
}
```

**Using PowerShell:**

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "powershell",
      "args": [
        "-Command",
        "$env:FIRECRAWL_API_KEY='YOUR_API_KEY'; npx -y firecrawl-mcp"
      ]
    }
  }
}
```

**Running directly from the terminal:**

```cmd
REM Command Prompt
set FIRECRAWL_API_KEY=YOUR_API_KEY && npx -y firecrawl-mcp
```

```powershell
# PowerShell
$env:FIRECRAWL_API_KEY = "YOUR_API_KEY"
npx -y firecrawl-mcp
```

#### Common Issues

| Issue | Solution |
|---|---|
| `npx` not found | Ensure Node.js is installed and `npm` is on your `PATH` |
| ENOENT errors | Use the full path to `npx`: `C:\Program Files\nodejs\npx.cmd` |
| Permission denied | Run your terminal as Administrator, or check execution policy: `Set-ExecutionPolicy RemoteSigned` |
| Env vars not passed | Use the `cmd /c "set ... && ..."` pattern shown above; avoid `env` blocks with spaces in values |

#### Verification
1. Open Command Prompt or PowerShell
2. Run the appropriate command above
3. Confirm the server starts without errors

</details>

<details>
<summary><b>Smithery</b></summary>

#### Prerequisites
- Node.js 18+
- A supported MCP client (Claude Desktop, Cursor, Windsurf, etc.)

#### Configuration

Install the Firecrawl MCP server via [Smithery](https://smithery.ai/):

```bash
npx -y @smithery/cli install @mendableai/mcp-server-firecrawl --client claude
```

**For other clients,** replace `claude` with your client name:

```bash
# Cursor
npx -y @smithery/cli install @mendableai/mcp-server-firecrawl --client cursor

# Windsurf
npx -y @smithery/cli install @mendableai/mcp-server-firecrawl --client windsurf
```

The installer will prompt you for your `FIRECRAWL_API_KEY` and automatically configure the MCP client.

#### Verification
1. Open your MCP client after installation
2. Check that `firecrawl-mcp` appears in the server/tool list
3. Test by asking the AI to scrape a URL

</details>

<details>
<summary><b>n8n</b></summary>

#### Prerequisites
- [n8n](https://n8n.io/) instance (self-hosted or cloud)
- Node.js 18+ available on the n8n host (for stdio mode) or a remote Firecrawl MCP HTTP endpoint
- A Firecrawl API key

#### Configuration

**Local stdio (self-hosted n8n):**

In your n8n workflow, add an **MCP Client Tool** node and configure it:

- **Connection Type:** `Stdio`
- **Command:** `npx`
- **Arguments:** `-y firecrawl-mcp`
- **Environment Variables:**
  - `FIRECRAWL_API_KEY` = `YOUR_API_KEY`

**Remote HTTP:**

If running n8n Cloud or you prefer HTTP, deploy Firecrawl MCP in [Streamable HTTP mode](#streamable-http-local-server-mode), then:

- **Connection Type:** `Streamable HTTP`
- **URL:** `https://your-firecrawl-mcp-endpoint.example.com/mcp`

Connect the MCP Client Tool node to an AI Agent node to make Firecrawl tools available in your workflow.

#### Verification
1. Add an AI Agent node connected to the MCP Client Tool node in your workflow
2. Send a test message: *"Scrape https://example.com"*
3. Execute the workflow and confirm the output contains scraped page content

</details>

<details>
<summary><b>Streamable HTTP (Local Server Mode)</b></summary>

#### Prerequisites
- Node.js 18+
- A Firecrawl API key

#### Configuration

Start the Firecrawl MCP server in HTTP Streamable mode by setting the `HTTP_STREAMABLE_SERVER` environment variable:

```bash
env HTTP_STREAMABLE_SERVER=true FIRECRAWL_API_KEY=YOUR_API_KEY npx -y firecrawl-mcp
```

The server starts on **port 3000** by default with the MCP endpoint at:

```
http://localhost:3000/mcp
```

**Custom port:**

```bash
env HTTP_STREAMABLE_SERVER=true PORT=8080 FIRECRAWL_API_KEY=YOUR_API_KEY npx -y firecrawl-mcp
```

**Self-hosted Firecrawl:**

```bash
env HTTP_STREAMABLE_SERVER=true \
  FIRECRAWL_API_KEY=YOUR_API_KEY \
  FIRECRAWL_API_URL=http://localhost:3002 \
  npx -y firecrawl-mcp
```

**Using the HTTP endpoint in any MCP client:**

Once the server is running, point any HTTP-compatible MCP client to it:

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

> **Tip:** To expose this endpoint publicly (for ChatGPT, GitHub Copilot Coding Agent, etc.), place it behind a reverse proxy with HTTPS — for example using nginx, Caddy, or Cloudflare Tunnel.

#### Verification
1. Start the server with the command above
2. Test the endpoint with curl:
   ```bash
   curl -X POST http://localhost:3000/mcp \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'
   ```
3. Confirm you receive a JSON-RPC response with server capabilities

</details>

## Configuration

### Environment Variables

#### Required for Cloud API

- `FIRECRAWL_API_KEY`: Your Firecrawl API key
  - Required when using cloud API (default)
  - Optional when using self-hosted instance with `FIRECRAWL_API_URL`
- `FIRECRAWL_API_URL` (Optional): Custom API endpoint for self-hosted instances
  - Example: `https://firecrawl.your-domain.com`
  - If not provided, the cloud API will be used (requires API key)

#### Optional Configuration

##### Retry Configuration

- `FIRECRAWL_RETRY_MAX_ATTEMPTS`: Maximum number of retry attempts (default: 3)
- `FIRECRAWL_RETRY_INITIAL_DELAY`: Initial delay in milliseconds before first retry (default: 1000)
- `FIRECRAWL_RETRY_MAX_DELAY`: Maximum delay in milliseconds between retries (default: 10000)
- `FIRECRAWL_RETRY_BACKOFF_FACTOR`: Exponential backoff multiplier (default: 2)

##### Credit Usage Monitoring

- `FIRECRAWL_CREDIT_WARNING_THRESHOLD`: Credit usage warning threshold (default: 1000)
- `FIRECRAWL_CREDIT_CRITICAL_THRESHOLD`: Credit usage critical threshold (default: 100)

### Configuration Examples

For cloud API usage with custom retry and credit monitoring:

```bash
# Required for cloud API
export FIRECRAWL_API_KEY=YOUR_API_KEY

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
export FIRECRAWL_API_KEY=YOUR_API_KEY  # If your instance requires auth

# Custom retry configuration
export FIRECRAWL_RETRY_MAX_ATTEMPTS=10
export FIRECRAWL_RETRY_INITIAL_DELAY=500     # Start with faster retries
```

### System Configuration

The server includes several configurable parameters that can be set via environment variables. Here are the default values if not configured:

```typescript
const CONFIG = {
  retry: {
    maxAttempts: 3, // Number of retry attempts for rate-limited requests
    initialDelay: 1000, // Initial delay before first retry (in milliseconds)
    maxDelay: 10000, // Maximum delay between retries (in milliseconds)
    backoffFactor: 2, // Multiplier for exponential backoff
  },
  credit: {
    warningThreshold: 1000, // Warn when credit usage reaches this level
    criticalThreshold: 100, // Critical alert when credit usage reaches this level
  },
};
```

These configurations control:

1. **Retry Behavior**

   - Automatically retries failed requests due to rate limits
   - Uses exponential backoff to avoid overwhelming the API
   - Example: With default settings, retries will be attempted at:
     - 1st retry: 1 second delay
     - 2nd retry: 2 seconds delay
     - 3rd retry: 4 seconds delay (capped at maxDelay)

2. **Credit Usage Monitoring**
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
  - For one: use **scrape** (with JSON format for structured data)
  - For many: use **batch_scrape**
- **If you need to discover URLs on a site:** use **map**
- **If you want to search the web for info:** use **search**
- **If you need complex research across multiple unknown sources:** use **agent**
- **If you want to analyze a whole site or section:** use **crawl** (with limits!)
- **If you need interactive browser automation** (click, type, navigate): use **browser**

### Quick Reference Table

| Tool         | Best for                            | Returns                    |
| ------------ | ----------------------------------- | -------------------------- |
| scrape       | Single page content                 | JSON (preferred) or markdown |
| batch_scrape | Multiple known URLs                 | JSON (preferred) or markdown[] |
| map          | Discovering URLs on a site          | URL[]                      |
| crawl        | Multi-page extraction (with limits) | markdown/html[]            |
| search       | Web search for info                 | results[]                  |
| agent        | Complex multi-source research       | JSON (structured data)     |
| browser      | Interactive multi-step automation    | Session with live browser  |

### Format Selection Guide

When using `scrape` or `batch_scrape`, choose the right format:

- **JSON format (recommended for most cases):** Use when you need specific data from a page. Define a schema based on what you need to extract. This keeps responses small and avoids context window overflow.
- **Markdown format (use sparingly):** Only when you genuinely need the full page content, such as reading an entire article for summarization or analyzing page structure.

## Available Tools

### 1. Scrape Tool (`firecrawl_scrape`)

Scrape content from a single URL with advanced options.

**Best for:**

- Single page content extraction, when you know exactly which page contains the information.

**Not recommended for:**

- Extracting content from multiple pages (use batch_scrape for known URLs, or map + batch_scrape to discover URLs first, or crawl for full page content)
- When you're unsure which page contains the information (use search)

**Common mistakes:**

- Using scrape for a list of URLs (use batch_scrape instead).
- Using markdown format by default (use JSON format to extract only what you need).

**Choosing the right format:**

- **JSON format (preferred):** For most use cases, use JSON format with a schema to extract only the specific data needed. This keeps responses focused and prevents context window overflow.
- **Markdown format:** Only when the task genuinely requires full page content (e.g., summarizing an entire article, analyzing page structure).

**Prompt Example:**

> "Get the product details from https://example.com/product."

**Usage Example (JSON format - preferred):**

```json
{
  "name": "firecrawl_scrape",
  "arguments": {
    "url": "https://example.com/product",
    "formats": [{
      "type": "json",
      "prompt": "Extract the product information",
      "schema": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "price": { "type": "number" },
          "description": { "type": "string" }
        },
        "required": ["name", "price"]
      }
    }]
  }
}
```

**Usage Example (markdown format - when full content needed):**

```json
{
  "name": "firecrawl_scrape",
  "arguments": {
    "url": "https://example.com/article",
    "formats": ["markdown"],
    "onlyMainContent": true
  }
}
```

**Usage Example (branding format - extract brand identity):**

```json
{
  "name": "firecrawl_scrape",
  "arguments": {
    "url": "https://example.com",
    "formats": ["branding"]
  }
}
```

**Branding format:** Extracts comprehensive brand identity (colors, fonts, typography, spacing, logo, UI components) for design analysis or style replication.

**Returns:**

- JSON structured data, markdown, branding profile, or other formats as specified.

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

### 9. Agent Tool (`firecrawl_agent`)

Autonomous web research agent. This is a separate AI agent layer that independently browses the internet, searches for information, navigates through pages, and extracts structured data based on your query.

**How it works:**

The agent performs web searches, follows links, reads pages, and gathers data autonomously. This runs **asynchronously** - it returns a job ID immediately, and you poll `firecrawl_agent_status` to check when complete and retrieve results.

**Async workflow:**

1. Call `firecrawl_agent` with your prompt/schema → returns job ID
2. Do other work while the agent researches (can take minutes for complex queries)
3. Poll `firecrawl_agent_status` with the job ID to check progress
4. When status is "completed", the response includes the extracted data

**Best for:**

- Complex research tasks where you don't know the exact URLs
- Multi-source data gathering
- Finding information scattered across the web
- Tasks where you can do other work while waiting for results

**Not recommended for:**

- Simple single-page scraping where you know the URL (use scrape with JSON format - faster and cheaper)

**Arguments:**

- `prompt`: Natural language description of the data you want (required, max 10,000 characters)
- `urls`: Optional array of URLs to focus the agent on specific pages
- `schema`: Optional JSON schema for structured output

**Prompt Example:**

> "Find the founders of Firecrawl and their backgrounds"

**Usage Example (start agent, then poll for results):**

```json
{
  "name": "firecrawl_agent",
  "arguments": {
    "prompt": "Find the top 5 AI startups founded in 2024 and their funding amounts",
    "schema": {
      "type": "object",
      "properties": {
        "startups": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "name": { "type": "string" },
              "funding": { "type": "string" },
              "founded": { "type": "string" }
            }
          }
        }
      }
    }
  }
}
```

Then poll with `firecrawl_agent_status` using the returned job ID.

**Usage Example (with URLs - agent focuses on specific pages):**

```json
{
  "name": "firecrawl_agent",
  "arguments": {
    "urls": ["https://docs.firecrawl.dev", "https://firecrawl.dev/pricing"],
    "prompt": "Compare the features and pricing information from these pages"
  }
}
```

**Returns:**

- Job ID for status checking. Use `firecrawl_agent_status` to poll for results.

### 10. Check Agent Status (`firecrawl_agent_status`)

Check the status of an agent job and retrieve results when complete. Use this to poll for results after starting an agent.

**Polling pattern:** Agent research can take minutes for complex queries. Poll this endpoint periodically (e.g., every 10-30 seconds) until status is "completed" or "failed".

```json
{
  "name": "firecrawl_agent_status",
  "arguments": {
    "id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

**Possible statuses:**

- `processing`: Agent is still researching - check back later
- `completed`: Research finished - response includes the extracted data
- `failed`: An error occurred

### 11. Browser Create (`firecrawl_browser_create`)

Create a cloud browser session for interactive automation.

**Best for:**

- Multi-step browser automation (navigate, click, fill forms, extract data)
- Interactive workflows that require maintaining state across actions
- Testing and debugging web pages in a live browser
- Saving and reusing browser state with profiles

**Arguments:**

- `ttl`: Total session lifetime in seconds (30-3600, optional)
- `activityTtl`: Idle timeout in seconds (10-3600, optional)
- `streamWebView`: Whether to enable live view streaming (optional)
- `profile`: Save and reuse browser state across sessions (optional)
  - `name`: Profile name (sessions with the same name share state)
  - `saveChanges`: Whether to save changes back to the profile (default: true)

**Usage Example:**

```json
{
  "name": "firecrawl_browser_create",
  "arguments": {
    "ttl": 600,
    "profile": { "name": "my-profile", "saveChanges": true }
  }
}
```

**Returns:**

- Session ID, CDP URL, and live view URL

### 12. Browser Execute (`firecrawl_browser_execute`)

Execute code in a browser session. Supports agent-browser commands (bash), Python, or JavaScript.

**Recommended: Use bash with agent-browser commands** (pre-installed in every sandbox):

```json
{
  "name": "firecrawl_browser_execute",
  "arguments": {
    "sessionId": "session-id-here",
    "code": "agent-browser open https://example.com",
    "language": "bash"
  }
}
```

**Common agent-browser commands:**

| Command | Description |
|---------|-------------|
| `agent-browser open <url>` | Navigate to URL |
| `agent-browser snapshot` | Accessibility tree with clickable refs |
| `agent-browser click @e5` | Click element by ref from snapshot |
| `agent-browser type @e3 "text"` | Type into element |
| `agent-browser get title` | Get page title |
| `agent-browser screenshot` | Take screenshot |
| `agent-browser --help` | Full command reference |

**For Playwright scripting, use Python:**

```json
{
  "name": "firecrawl_browser_execute",
  "arguments": {
    "sessionId": "session-id-here",
    "code": "await page.goto('https://example.com')\ntitle = await page.title()\nprint(title)",
    "language": "python"
  }
}
```

### 13. Browser List (`firecrawl_browser_list`)

List browser sessions, optionally filtered by status.

```json
{
  "name": "firecrawl_browser_list",
  "arguments": {
    "status": "active"
  }
}
```

### 14. Browser Delete (`firecrawl_browser_delete`)

Destroy a browser session.

```json
{
  "name": "firecrawl_browser_delete",
  "arguments": {
    "sessionId": "session-id-here"
  }
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
