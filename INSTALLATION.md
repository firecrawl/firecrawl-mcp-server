# Firecrawl MCP Server — Installation Guide for All Environments

This guide provides step-by-step installation instructions for the Firecrawl MCP server across **20+ MCP-compatible clients**. Each section includes prerequisites, configuration, and verification steps.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Client Installation Guides](#client-installation-guides)
  1. [Claude Desktop](#1-claude-desktop)
  2. [Cursor](#2-cursor)
  3. [Windsurf](#3-windsurf)
  4. [Cline (VS Code)](#4-cline-vs-code)
  5. [Continue (VS Code / JetBrains)](#5-continue-vs-code--jetbrains)
  6. [Zed](#6-zed)
  7. [Amazon Q Developer CLI](#7-amazon-q-developer-cli)
  8. [Firebase Genkit](#8-firebase-genkit)
  9. [GitHub Copilot (VS Code)](#9-github-copilot-vs-code)
  10. [BoltAI](#10-boltai)
  11. [Highlight.ai](#11-highlightai)
  12. [Msty](#12-msty)
  13. [Enconvo](#13-enconvo)
  14. [Claude Code](#14-claude-code)
  15. [Goose (Block)](#15-goose-block)
  16. [Roo Code](#16-roo-code)
  17. [Superinterface](#17-superinterface)
  18. [5ire](#18-5ire)
  19. [Glama.ai](#19-glamaai)
  20. [Smithery](#20-smithery)
  21. [Gemini CLI](#21-gemini-cli)
  22. [JetBrains AI Assistant](#22-jetbrains-ai-assistant)
  23. [Opencode](#23-opencode)
- [Self-Hosted Instance Configuration](#self-hosted-instance-configuration)
- [Streamable HTTP (Remote) Mode](#streamable-http-remote-mode)
- [Environment Variables Reference](#environment-variables-reference)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

All installation methods require:

- **Node.js** v18 or later — [Download](https://nodejs.org/)
- **npm** (included with Node.js)
- A **Firecrawl API key** — get one free at [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)

Verify your setup:

```bash
node --version   # should print v18.x or later
npx --version    # should print 9.x or later
```

---

## Quick Start

Run the Firecrawl MCP server directly:

```bash
env FIRECRAWL_API_KEY=fc-YOUR_API_KEY npx -y firecrawl-mcp
```

Or install globally first:

```bash
npm install -g firecrawl-mcp
```

---

## Client Installation Guides

### 1. Claude Desktop

**Config file location:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

**Steps:**

1. Open Claude Desktop and go to **Settings > Developer > Edit Config**.
2. Add the following to `claude_desktop_config.json`:

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

3. Save the file and **restart Claude Desktop**.

**Verification:** Open a new conversation and ask Claude to scrape a URL — the Firecrawl tools should appear in the tool list.

---

### 2. Cursor

**Config file location:** `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (per-project)

> Requires Cursor v0.45.6 or later.

**Option A — Cursor v0.48.6+ (Settings UI):**

1. Open **Cursor Settings**.
2. Go to **Features > MCP Servers**.
3. Click **"+ Add new global MCP server"**.
4. Paste:

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

**Option B — Manual file edit:**

Add to `~/.cursor/mcp.json`:

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

**Windows note:** If you encounter issues, use:
```
cmd /c "set FIRECRAWL_API_KEY=YOUR_API_KEY && npx -y firecrawl-mcp"
```

**Verification:** Refresh the MCP server list in Cursor Settings. The Firecrawl tools should appear. Use the Composer Agent (Cmd+L / Ctrl+L) and describe a web scraping task.

---

### 3. Windsurf

**Config file location:** `~/.codeium/windsurf/mcp_config.json`

**Steps:**

1. Open `~/.codeium/windsurf/mcp_config.json` (create it if it does not exist).
2. Add:

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

3. Restart Windsurf.

**Verification:** Open the Cascade panel and ask it to scrape a webpage. Firecrawl tools should be available.

---

### 4. Cline (VS Code)

**Config file location:** Managed through Cline extension settings UI.

**Steps:**

1. Install the [Cline extension](https://marketplace.visualstudio.com/items?itemName=saoudrizwan.claude-dev) in VS Code.
2. Open Cline settings (gear icon in the Cline sidebar panel).
3. Navigate to **MCP Servers** and click **"Edit MCP Settings"**.
4. Add:

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

5. Save and wait for the server to connect (green indicator).

**Verification:** The Cline MCP panel should show Firecrawl tools (scrape, crawl, search, etc.) with a green status dot.

---

### 5. Continue (VS Code / JetBrains)

**Config file location:** `~/.continue/config.yaml`

**Steps:**

1. Install the [Continue extension](https://marketplace.visualstudio.com/items?itemName=Continue.continue) in VS Code or JetBrains.
2. Open `~/.continue/config.yaml` and add the MCP server under the `mcpServers` key:

```yaml
mcpServers:
  - name: firecrawl
    command: npx
    args:
      - "-y"
      - "firecrawl-mcp"
    env:
      FIRECRAWL_API_KEY: YOUR_API_KEY
```

3. Restart the Continue extension.

**Verification:** In the Continue chat, the Firecrawl tools should be listed as available. Ask Continue to scrape a URL to confirm.

---

### 6. Zed

**Config file location:** `~/.config/zed/settings.json` (Linux/macOS) or Zed settings UI.

**Steps:**

1. Open Zed and go to **Settings** (Cmd+, or Ctrl+,).
2. Add the following under `"context_servers"`:

```json
{
  "context_servers": {
    "firecrawl": {
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

3. Save the settings file.

**Verification:** Open the Assistant panel in Zed. Firecrawl context tools should be available.

---

### 7. Amazon Q Developer CLI

**Config file location:** `~/.aws/amazonq/mcp.json`

**Steps:**

1. Create or edit `~/.aws/amazonq/mcp.json`:

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

2. Restart the Amazon Q Developer CLI session.

**Verification:** Run `q chat` and ask it to scrape a URL. The Firecrawl tools should be available.

---

### 8. Firebase Genkit

**Integration method:** Programmatic via the `genkitx-mcp` plugin.

**Steps:**

1. Install the MCP plugin in your Genkit project:

```bash
npm install genkitx-mcp
```

2. Configure in your Genkit app code:

```typescript
import { genkit } from "genkit";
import { mcpClient } from "genkitx-mcp";

const ai = genkit({
  plugins: [
    mcpClient({
      name: "firecrawl",
      serverProcess: {
        command: "npx",
        args: ["-y", "firecrawl-mcp"],
        env: {
          FIRECRAWL_API_KEY: "YOUR_API_KEY",
        },
      },
    }),
  ],
});
```

**Verification:** Start your Genkit dev server with `npx genkit start` and check the developer UI for available Firecrawl tools.

---

### 9. GitHub Copilot (VS Code)

**Config file location:** VS Code User Settings (JSON) or `.vscode/mcp.json`

**Steps:**

1. In VS Code, press **Ctrl+Shift+P** and select **"Preferences: Open User Settings (JSON)"**.
2. Add:

```json
{
  "mcp": {
    "inputs": [
      {
        "type": "promptString",
        "id": "firecrawlApiKey",
        "description": "Firecrawl API Key",
        "password": true
      }
    ],
    "servers": {
      "firecrawl": {
        "command": "npx",
        "args": ["-y", "firecrawl-mcp"],
        "env": {
          "FIRECRAWL_API_KEY": "${input:firecrawlApiKey}"
        }
      }
    }
  }
}
```

**Alternative — workspace config (`.vscode/mcp.json`):**

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "firecrawlApiKey",
      "description": "Firecrawl API Key",
      "password": true
    }
  ],
  "servers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "${input:firecrawlApiKey}"
      }
    }
  }
}
```

**Verification:** Open Copilot Chat in Agent mode. VS Code will prompt for your API key on first use. The Firecrawl tools should appear in the tool list.

---

### 10. BoltAI

**Config file location:** BoltAI app settings.

**Steps:**

1. Open **BoltAI** and navigate to **Settings > Plugins > MCP Servers**.
2. Click **"Add Server"** and fill in:
   - **Name:** `firecrawl`
   - **Command:** `npx`
   - **Arguments:** `-y firecrawl-mcp`
3. Add environment variable:
   - **Key:** `FIRECRAWL_API_KEY`
   - **Value:** `YOUR_API_KEY`
4. Click **Save** and enable the server.

**JSON equivalent (for import):**

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

**Verification:** Start a new chat in BoltAI. The Firecrawl tools should be listed as available.

---

### 11. Highlight.ai

**Config file location:** Highlight.ai app settings.

**Steps:**

1. Open **Highlight.ai** and go to **Settings > MCP Servers**.
2. Click **"Add MCP Server"**.
3. Enter the configuration:

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

4. Save and restart Highlight.ai.

**Verification:** Ask the assistant to scrape a URL. Firecrawl tools should be available in the response.

---

### 12. Msty

**Config file location:** Msty app settings.

**Steps:**

1. Open **Msty** and navigate to **Settings > MCP Servers**.
2. Click **"Add New Server"** and configure:
   - **Server Name:** `firecrawl`
   - **Command:** `npx`
   - **Arguments:** `-y`, `firecrawl-mcp`
   - **Environment Variables:** `FIRECRAWL_API_KEY=YOUR_API_KEY`
3. Click **Save** and restart Msty.

**JSON equivalent:**

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

**Verification:** Open a new session and check the tools panel — Firecrawl tools should be listed.

---

### 13. Enconvo

**Config file location:** Enconvo app settings.

**Steps:**

1. Open **Enconvo** and go to the **Bot Store** or **Settings > MCP**.
2. Click **"Add MCP Server"**.
3. Configure:
   - **Name:** `firecrawl`
   - **Command:** `npx -y firecrawl-mcp`
   - **Env:** `FIRECRAWL_API_KEY=YOUR_API_KEY`
4. Save the configuration.

**JSON equivalent:**

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

**Verification:** Create a new session in Enconvo and verify Firecrawl tools are listed.

---

### 14. Claude Code

**Installation method:** CLI command.

**Steps:**

```bash
claude mcp add --scope user firecrawl -- npx -y firecrawl-mcp
```

Then set the API key as an environment variable:

```bash
export FIRECRAWL_API_KEY=YOUR_API_KEY
```

Or add it directly using an environment flag:

```bash
claude mcp add --scope user -e FIRECRAWL_API_KEY=YOUR_API_KEY firecrawl -- npx -y firecrawl-mcp
```

> Remove `--scope user` to install for the current project only.

**Verification:** Run `claude mcp list` to confirm the server is registered. Start a Claude Code session and ask it to scrape a URL.

---

### 15. Goose (Block)

**Config file location:** `~/.config/goose/config.yaml`

**Steps:**

1. Open or create `~/.config/goose/config.yaml`.
2. Add:

```yaml
mcpServers:
  firecrawl:
    command: npx
    args:
      - "-y"
      - "firecrawl-mcp"
    env:
      FIRECRAWL_API_KEY: YOUR_API_KEY
```

3. Restart Goose.

**Alternative — via CLI:**

```bash
goose configure mcp add --name firecrawl --command "npx -y firecrawl-mcp" --env FIRECRAWL_API_KEY=YOUR_API_KEY
```

**Verification:** Run `goose session` and ask Goose to scrape a URL to confirm the tools are available.

---

### 16. Roo Code

**Config file location:** Roo Code settings (VS Code extension).

**Steps:**

1. Install the [Roo Code extension](https://marketplace.visualstudio.com/items?itemName=RooVeterinaryInc.roo-cline) in VS Code.
2. Open Roo Code settings and navigate to **MCP Servers**.
3. Click **"Edit MCP Settings"** and add:

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

4. Save and wait for the server to connect.

**Verification:** The MCP server status indicator should turn green. Firecrawl tools will appear in the tools list.

---

### 17. Superinterface

**Integration method:** Programmatic via the Superinterface SDK.

**Steps:**

1. In your Superinterface project configuration, add the Firecrawl MCP server:

```typescript
import { createSuperinterface } from "@superinterface/sdk";

const si = createSuperinterface({
  mcpServers: {
    firecrawl: {
      command: "npx",
      args: ["-y", "firecrawl-mcp"],
      env: {
        FIRECRAWL_API_KEY: "YOUR_API_KEY",
      },
    },
  },
});
```

**Alternative — dashboard configuration:**

1. Go to your Superinterface dashboard.
2. Navigate to **Assistants > MCP Servers**.
3. Add a new server with the JSON config:

```json
{
  "firecrawl": {
    "command": "npx",
    "args": ["-y", "firecrawl-mcp"],
    "env": {
      "FIRECRAWL_API_KEY": "YOUR_API_KEY"
    }
  }
}
```

**Verification:** Deploy your assistant and test by asking it to scrape a URL.

---

### 18. 5ire

**Config file location:** 5ire app settings.

**Steps:**

1. Open **5ire** and navigate to **Settings > MCP Servers**.
2. Click **"Add Server"**.
3. Select **Type:** `STDIO`.
4. Fill in:
   - **Name:** `firecrawl`
   - **Command:** `npx`
   - **Args:** `-y firecrawl-mcp`
5. Add environment variable:
   - **FIRECRAWL_API_KEY:** `YOUR_API_KEY`
6. Click **Save**.

**JSON equivalent:**

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

**Verification:** Start a new chat in 5ire. The tools panel should list Firecrawl tools.

---

### 19. Glama.ai

**Integration method:** Via the Glama.ai MCP playground or dashboard.

**Steps:**

1. Go to [glama.ai](https://glama.ai/) and sign in.
2. Navigate to **MCP Servers**.
3. Click **"Add Server"** and enter:

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

4. Save and activate the server.

**Verification:** Open the MCP playground and test the Firecrawl tools by running a scrape command.

---

### 20. Smithery

**Installation method:** CLI via the Smithery registry.

**Steps:**

```bash
npx -y @smithery/cli install @mendableai/mcp-server-firecrawl --client claude
```

Replace `--client claude` with your target client (e.g., `--client cursor`, `--client cline`).

**Verification:** The Smithery CLI will automatically configure the server for your selected client. Restart the client and verify tools are available.

---

### 21. Gemini CLI

**Config file location:** `~/.gemini/settings.json`

**Steps:**

1. Create or edit `~/.gemini/settings.json`:

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

2. Restart the Gemini CLI.

**Verification:** Run `gemini` and ask it to scrape a URL to confirm the Firecrawl tools are loaded.

---

### 22. JetBrains AI Assistant

**Config file location:** JetBrains IDE settings.

**Steps:**

1. Open your JetBrains IDE (IntelliJ, PyCharm, WebStorm, etc.).
2. Go to **Settings > Tools > AI Assistant > MCP Servers**.
3. Click **"+"** to add a new server.
4. Configure:
   - **Name:** `firecrawl`
   - **Command:** `npx`
   - **Arguments:** `-y firecrawl-mcp`
   - **Environment Variables:** `FIRECRAWL_API_KEY=YOUR_API_KEY`
5. Click **OK** and restart the AI Assistant.

**JSON equivalent (for `mcp.json` in project root):**

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

**Verification:** Open the AI Assistant panel and confirm Firecrawl tools are listed.

---

### 23. Opencode

**Config file location:** Opencode project configuration file.

**Steps:**

Add the following to your Opencode configuration:

```json
{
  "mcp": {
    "firecrawl": {
      "type": "local",
      "command": ["npx", "-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "YOUR_API_KEY"
      },
      "enabled": true
    }
  }
}
```

**Verification:** Start Opencode and verify the Firecrawl tools are available.

---

## Self-Hosted Instance Configuration

If you run a self-hosted Firecrawl instance, set the `FIRECRAWL_API_URL` environment variable to point to your server. The `FIRECRAWL_API_KEY` may be optional depending on your instance configuration.

**Example (Claude Desktop):**

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_URL": "https://firecrawl.your-domain.com",
        "FIRECRAWL_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

This pattern applies to all clients listed above — simply add the `FIRECRAWL_API_URL` variable alongside your existing configuration.

---

## Streamable HTTP (Remote) Mode

Instead of running the server locally via stdio, you can run it as a Streamable HTTP server:

```bash
env HTTP_STREAMABLE_SERVER=true FIRECRAWL_API_KEY=YOUR_API_KEY npx -y firecrawl-mcp
```

The server will start at `http://localhost:3000/mcp`. Use this URL in any client that supports HTTP/SSE MCP transport.

**Example (Cursor with remote URL):**

```json
{
  "mcpServers": {
    "firecrawl": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FIRECRAWL_API_KEY` | Yes (cloud) | — | Your Firecrawl API key |
| `FIRECRAWL_API_URL` | No | Cloud API | Custom endpoint for self-hosted instances |
| `FIRECRAWL_RETRY_MAX_ATTEMPTS` | No | `3` | Maximum retry attempts |
| `FIRECRAWL_RETRY_INITIAL_DELAY` | No | `1000` | Initial retry delay in ms |
| `FIRECRAWL_RETRY_MAX_DELAY` | No | `10000` | Maximum retry delay in ms |
| `FIRECRAWL_RETRY_BACKOFF_FACTOR` | No | `2` | Exponential backoff multiplier |
| `FIRECRAWL_CREDIT_WARNING_THRESHOLD` | No | `1000` | Credit usage warning threshold |
| `FIRECRAWL_CREDIT_CRITICAL_THRESHOLD` | No | `100` | Credit usage critical threshold |
| `HTTP_STREAMABLE_SERVER` | No | `false` | Enable Streamable HTTP transport |

---

## Troubleshooting

### Common Issues

**"npx: command not found"**
- Ensure Node.js v18+ is installed and `npx` is in your PATH.
- On Windows, you may need to restart your terminal after installing Node.js.

**"FIRECRAWL_API_KEY is required"**
- Make sure the API key is set in the `env` section of your MCP config.
- Double-check that the key starts with `fc-`.

**Server fails to start on Windows**
- Use the `cmd` wrapper approach:
  ```json
  {
    "command": "cmd",
    "args": ["/c", "set FIRECRAWL_API_KEY=YOUR_API_KEY && npx -y firecrawl-mcp"]
  }
  ```
- Or use the full path to `npx`:
  ```json
  {
    "command": "C:\\Program Files\\nodejs\\npx.cmd",
    "args": ["-y", "firecrawl-mcp"],
    "env": {
      "FIRECRAWL_API_KEY": "YOUR_API_KEY"
    }
  }
  ```

**"Cannot find module" or npm cache issues**
- Clear the npm cache: `npm cache clean --force`
- Remove and re-run: `npx --yes firecrawl-mcp`

**Tools not appearing in client**
- Restart the client application after adding the configuration.
- Check the MCP server logs for errors (most clients show logs in a debug panel).
- Ensure the JSON syntax is valid (no trailing commas, correct brackets).

**Rate limit errors**
- The server handles rate limiting automatically with exponential backoff.
- Increase retry settings via environment variables if needed:
  ```json
  "env": {
    "FIRECRAWL_API_KEY": "YOUR_API_KEY",
    "FIRECRAWL_RETRY_MAX_ATTEMPTS": "5",
    "FIRECRAWL_RETRY_INITIAL_DELAY": "2000"
  }
  ```

**Self-hosted instance connection errors**
- Verify the `FIRECRAWL_API_URL` is reachable from your machine.
- Ensure the URL does not have a trailing slash.
- Check that your self-hosted instance is running and healthy.

### Getting Help

- [Firecrawl Documentation](https://docs.firecrawl.dev/)
- [Firecrawl MCP Server GitHub](https://github.com/firecrawl/firecrawl-mcp-server)
- [Firecrawl Discord Community](https://discord.gg/firecrawl)
