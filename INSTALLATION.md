# Firecrawl MCP Server — Installation Guide

This guide covers installing and configuring the Firecrawl MCP server across all major MCP-compatible environments.

## Prerequisites

- **Node.js** v18 or later
- **Firecrawl API Key** — get one at [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
- For self-hosted setups, you can use `FIRECRAWL_API_URL` instead (see [Configuration](#configuration))

## Quick Start

The fastest way to run the server:

```bash
env FIRECRAWL_API_KEY=fc-YOUR_API_KEY npx -y firecrawl-mcp
```

Or install globally:

```bash
npm install -g firecrawl-mcp
```

---

## Installation by Environment

- [Cursor](#cursor)
- [VS Code / VS Code Insiders](#vs-code)
- [Visual Studio 2022](#visual-studio-2022)
- [Claude Desktop](#claude-desktop)
- [Claude Code](#claude-code)
- [Windsurf](#windsurf)
- [Cline](#cline)
- [Roo Code](#roo-code)
- [Kilo Code](#kilo-code)
- [Kiro](#kiro)
- [JetBrains AI Assistant](#jetbrains-ai-assistant)
- [Zed](#zed)
- [LM Studio](#lm-studio)
- [Augment Code](#augment-code)
- [Trae](#trae)
- [Amazon Q Developer CLI](#amazon-q-developer-cli)
- [Gemini CLI](#gemini-cli)
- [OpenAI Codex](#openai-codex)
- [Copilot Coding Agent](#copilot-coding-agent)
- [Copilot CLI](#copilot-cli)
- [Qwen Code](#qwen-code)
- [Opencode](#opencode)
- [Warp](#warp)
- [Amp](#amp)
- [Perplexity Desktop](#perplexity-desktop)
- [BoltAI](#boltai)
- [Zencoder](#zencoder)
- [Qodo Gen](#qodo-gen)
- [Smithery](#smithery)
- [Docker](#docker)
- [Windows](#windows)
- [Streamable HTTP (Local)](#streamable-http-local)

---

### Cursor

> Requires Cursor v0.45.6+. See [Cursor MCP docs](https://docs.cursor.com/context/model-context-protocol) for the latest instructions.

Go to **Settings → Features → MCP Servers → + Add new global MCP server**, or add to `~/.cursor/mcp.json`:

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

For **Cursor v0.45.6** (older), use the command form:

- Name: `firecrawl-mcp`
- Type: `command`
- Command: `env FIRECRAWL_API_KEY=YOUR_API_KEY npx -y firecrawl-mcp`

> **Windows:** Use `cmd /c "set FIRECRAWL_API_KEY=YOUR_API_KEY && npx -y firecrawl-mcp"`

After adding, refresh the MCP server list. The Composer Agent will automatically use Firecrawl when appropriate.

---

### VS Code

For one-click installation, use the install buttons in the [README](./README.md).

For manual setup, press `Ctrl+Shift+P` → **Preferences: Open User Settings (JSON)** and add:

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

You can also create `.vscode/mcp.json` in your workspace to share with your team:

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

See [VS Code MCP docs](https://code.visualstudio.com/docs/copilot/chat/mcp-servers) for more info.

---

### Visual Studio 2022

See [Visual Studio MCP Servers documentation](https://learn.microsoft.com/visualstudio/ide/mcp-servers?view=vs-2022) for details.

```json
{
  "inputs": [],
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
```

---

### Claude Desktop

Open Claude Desktop → **Settings → Developer → Edit Config**, then edit `claude_desktop_config.json`:

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

See [Claude Desktop MCP docs](https://modelcontextprotocol.io/quickstart/user) for more info.

---

### Claude Code

Run this command in your terminal:

```bash
claude mcp add --scope user firecrawl-mcp -- env FIRECRAWL_API_KEY=YOUR_API_KEY npx -y firecrawl-mcp
```

Remove `--scope user` to install for the current project only. See [Claude Code MCP docs](https://docs.anthropic.com/en/docs/claude-code/mcp) for more info.

---

### Windsurf

Add this to your Windsurf MCP config file (`.codeium/windsurf/model_config.json`). See [Windsurf MCP docs](https://docs.windsurf.com/windsurf/cascade/mcp) for more info.

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

---

### Cline

You can install through the [Cline MCP Marketplace](https://cline.bot/mcp-marketplace), or manually:

1. Open Cline
2. Click the hamburger menu → **MCP Servers**
3. Choose **Installed** tab → **Edit Configuration**
4. Add to `mcpServers`:

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

---

### Roo Code

Add this to your Roo Code MCP configuration file. See [Roo Code MCP docs](https://docs.roocode.com/features/mcp/using-mcp-in-roo) for more info.

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

---

### Kilo Code

You can configure via the UI or by editing your project's `.kilocode/mcp.json`:

**Via UI:**

1. Open Kilo Code → **Settings** (top-right) → **MCP Servers**
2. Click **Add Server** → choose **Stdio Server**
3. Enter the command: `npx -y firecrawl-mcp`
4. Add environment variable: `FIRECRAWL_API_KEY` = `YOUR_API_KEY`
5. Click **Save**

**Manual configuration** (`.kilocode/mcp.json`):

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

---

### Kiro

See [Kiro MCP docs](https://kiro.dev/docs/mcp/configuration/) for details.

1. Navigate to **Kiro → MCP Servers**
2. Click **+ Add**
3. Paste the configuration:

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
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

4. Click **Save**

---

### JetBrains AI Assistant

Works with IntelliJ IDEA, WebStorm, PyCharm, and other JetBrains IDEs. See [JetBrains AI Assistant docs](https://www.jetbrains.com/help/ai-assistant/configure-an-mcp-server.html).

1. Go to **Settings → Tools → AI Assistant → Model Context Protocol (MCP)**
2. Click **+ Add**
3. Click **Command** in the top-left corner, select **As JSON**
4. Add this configuration:

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

5. Click **Apply**

---

### Zed

You can install via [Zed Extensions](https://zed.dev/extensions) or add to your Zed `settings.json`. See [Zed Context Server docs](https://zed.dev/docs/assistant/context-servers).

```json
{
  "context_servers": {
    "firecrawl-mcp": {
      "source": "custom",
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

---

### LM Studio

See [LM Studio MCP Support](https://lmstudio.ai/blog/lmstudio-v0.3.17) for details.

1. Navigate to **Program** (right side) → **Install** → **Edit mcp.json**
2. Paste the configuration:

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

3. Click **Save**

---

### Augment Code

**Via UI:**

1. Click the hamburger menu → **Settings** → **Tools**
2. Click **+ Add MCP**
3. Enter command: `npx -y firecrawl-mcp`
4. Name: `firecrawl-mcp`
5. Click **Add**

**Manual configuration** (in VS Code `settings.json`):

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

---

### Trae

Use the **Add manually** feature. See [Trae docs](https://docs.trae.ai/ide/model-context-protocol?_lang=en) for details.

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

---

### Amazon Q Developer CLI

Add to your Amazon Q Developer CLI config. See [Amazon Q Developer CLI docs](https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/command-line-mcp-configuration.html).

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

---

### Gemini CLI

Open `~/.gemini/settings.json` and add. See [Gemini CLI docs](https://google-gemini.github.io/gemini-cli/docs/tools/mcp-server.html).

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

---

### OpenAI Codex

See [OpenAI Codex](https://github.com/openai/codex) for more info. Add to your Codex config:

```toml
[mcp_servers.firecrawl-mcp]
command = "npx"
args = ["-y", "firecrawl-mcp"]
startup_timeout_ms = 20_000

[mcp_servers.firecrawl-mcp.env]
FIRECRAWL_API_KEY = "YOUR_API_KEY"
```

If you see startup timeout errors, increase `startup_timeout_ms` to `40_000`.

---

### Copilot Coding Agent

Add to **Repository → Settings → Copilot → Coding agent → MCP configuration**. See [GitHub docs](https://docs.github.com/en/enterprise-cloud@latest/copilot/how-tos/agents/copilot-coding-agent/extending-copilot-coding-agent-with-mcp).

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

---

### Copilot CLI

Open `~/.copilot/mcp-config.json` and add:

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "type": "local",
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

---

### Qwen Code

See [Qwen Code MCP docs](https://qwenlm.github.io/qwen-code-docs/en/users/features/mcp/).

**Using CLI:**

```bash
qwen mcp add firecrawl-mcp npx -y firecrawl-mcp
```

**Manual configuration** (`~/.qwen/settings.json`):

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

---

### Opencode

Add to your Opencode configuration. See [Opencode MCP docs](https://opencode.ai/docs/mcp-servers).

```json
{
  "mcp": {
    "firecrawl-mcp": {
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

---

### Warp

See [Warp MCP docs](https://docs.warp.dev/knowledge-and-collaboration/mcp#adding-an-mcp-server).

1. Navigate to **Settings → AI → Manage MCP servers**
2. Click **+ Add**
3. Paste:

```json
{
  "firecrawl-mcp": {
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

4. Click **Save**

---

### Amp

Run in your terminal. See [Amp MCP docs](https://ampcode.com/manual#mcp).

```bash
amp mcp add firecrawl-mcp -- env FIRECRAWL_API_KEY=YOUR_API_KEY npx -y firecrawl-mcp
```

---

### Perplexity Desktop

See [Perplexity MCP docs](https://www.perplexity.ai/help-center/en/articles/11502712-local-and-remote-mcps-for-perplexity).

1. Navigate to **Perplexity → Settings → Connectors**
2. Click **Add Connector → Advanced**
3. Server Name: `firecrawl-mcp`
4. Paste:

```json
{
  "command": "npx",
  "args": ["-y", "firecrawl-mcp"],
  "env": {
    "FIRECRAWL_API_KEY": "YOUR_API_KEY"
  }
}
```

5. Click **Save**

---

### BoltAI

Open **Settings → Plugins** and enter. See [BoltAI docs](https://docs.boltai.com/docs/plugins/mcp-servers).

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

---

### Zencoder

1. Go to the Zencoder menu (…) → **Agent tools**
2. Click **Add custom MCP**
3. Name: `firecrawl-mcp`
4. Configuration:

```json
{
  "command": "npx",
  "args": ["-y", "firecrawl-mcp"],
  "env": {
    "FIRECRAWL_API_KEY": "YOUR_API_KEY"
  }
}
```

5. Click **Install**

---

### Qodo Gen

See [Qodo Gen docs](https://docs.qodo.ai/qodo-documentation/qodo-gen/qodo-gen-chat/agentic-mode/agentic-tools-mcps).

1. Open Qodo Gen chat panel
2. Click **Connect more tools → + Add new MCP**
3. Add:

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

---

### Smithery

Install automatically via [Smithery](https://smithery.ai/server/@mendableai/mcp-server-firecrawl):

```bash
npx -y @smithery/cli install @mendableai/mcp-server-firecrawl --client <CLIENT_NAME>
```

Replace `<CLIENT_NAME>` with your client (e.g., `claude`, `cursor`, `cline`).

---

### Docker

Create a `Dockerfile`:

```dockerfile
FROM node:18-alpine
WORKDIR /app
RUN npm install -g firecrawl-mcp
CMD ["firecrawl-mcp"]
```

Build and configure:

```bash
docker build -t firecrawl-mcp .
```

Then use this in your MCP client config:

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "-e", "FIRECRAWL_API_KEY=YOUR_API_KEY", "firecrawl-mcp"],
      "transportType": "stdio"
    }
  }
}
```

---

### Windows

On Windows, use `cmd` to set environment variables:

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "cmd",
      "args": ["/c", "set FIRECRAWL_API_KEY=YOUR_API_KEY && npx -y firecrawl-mcp"],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

---

### Streamable HTTP (Local)

To run using Streamable HTTP transport instead of stdio:

```bash
env HTTP_STREAMABLE_SERVER=true FIRECRAWL_API_KEY=YOUR_API_KEY npx -y firecrawl-mcp
```

Then point your MCP client to `http://localhost:3000/mcp`.

---

### Using Bun or Deno

You can use alternative runtimes:

**Bun:**

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

**Deno:**

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "deno",
      "args": [
        "run",
        "--allow-env",
        "--allow-net",
        "--allow-read",
        "npm:firecrawl-mcp"
      ],
      "env": {
        "FIRECRAWL_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

---

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FIRECRAWL_API_KEY` | Yes (cloud) | Your Firecrawl API key |
| `FIRECRAWL_API_URL` | No | Custom endpoint for self-hosted instances |
| `FIRECRAWL_RETRY_MAX_ATTEMPTS` | No | Max retry attempts (default: 3) |
| `FIRECRAWL_RETRY_INITIAL_DELAY` | No | Initial retry delay in ms (default: 1000) |
| `FIRECRAWL_RETRY_MAX_DELAY` | No | Max retry delay in ms (default: 10000) |
| `FIRECRAWL_RETRY_BACKOFF_FACTOR` | No | Backoff multiplier (default: 2) |
| `FIRECRAWL_CREDIT_WARNING_THRESHOLD` | No | Credit warning level (default: 1000) |
| `FIRECRAWL_CREDIT_CRITICAL_THRESHOLD` | No | Credit critical level (default: 100) |

### Self-Hosted Setup

If you're running your own Firecrawl instance, set the API URL:

```bash
export FIRECRAWL_API_URL=https://firecrawl.your-domain.com
export FIRECRAWL_API_KEY=your-api-key  # if your instance requires auth
```

Then use the same MCP configuration as above — the server will connect to your self-hosted instance.

## Verification

After installing in any environment, verify the server is working:

1. Check that "firecrawl-mcp" appears in your client's MCP server list
2. The server should show available tools like `firecrawl_scrape`, `firecrawl_search`, `firecrawl_crawl`, etc.
3. Try a simple test: ask your AI assistant to "scrape https://example.com using Firecrawl"

## Troubleshooting

- **"Command not found" errors:** Make sure Node.js v18+ is installed and `npx` is in your PATH
- **API key issues:** Double-check your key at [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
- **Timeout errors:** Increase `startup_timeout_ms` in clients that support it, or check your network connection
- **Windows issues:** Always use the `cmd /c` wrapper (see [Windows](#windows) section)
- **Self-hosted connection errors:** Verify `FIRECRAWL_API_URL` is reachable from your machine
