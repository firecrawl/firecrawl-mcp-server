# Firecrawl MCP Server — Installation Guide

> Comprehensive installation instructions for **all MCP-compatible environments**.
>
> The Firecrawl MCP Server adds powerful web scraping, crawling, search, and data extraction capabilities to your AI coding assistant.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Installation by Client](#installation-by-client)
  - [Cursor](#cursor)
  - [Claude Desktop](#claude-desktop)
  - [Claude Code](#claude-code)
  - [VS Code / VS Code Insiders](#vs-code)
  - [Windsurf](#windsurf)
  - [Opencode](#opencode)
  - [OpenAI Codex CLI](#openai-codex-cli)
  - [Google Antigravity](#google-antigravity)
  - [Kiro](#kiro)
  - [Kilo Code](#kilo-code)
  - [Roo Code](#roo-code)
  - [Cline](#cline)
  - [Augment Code](#augment-code)
  - [Gemini CLI](#gemini-cli)
  - [Trae](#trae)
  - [Zed](#zed)
  - [JetBrains AI Assistant](#jetbrains-ai-assistant)
  - [Qwen Code](#qwen-code)
  - [Warp](#warp)
  - [Amp](#amp)
  - [Amazon Q Developer CLI](#amazon-q-developer-cli)
  - [GitHub Copilot (Coding Agent)](#github-copilot-coding-agent)
  - [GitHub Copilot CLI](#github-copilot-cli)
  - [Smithery](#smithery)
- [Alternative Runtimes](#alternative-runtimes)
  - [Docker](#docker)
  - [Bun](#bun)
  - [Deno](#deno)
- [Platform-Specific Notes](#platform-specific-notes)
  - [Windows](#windows)
  - [Streamable HTTP (Local Server Mode)](#streamable-http-local-server-mode)
- [Configuration](#configuration)
  - [Environment Variables](#environment-variables)
  - [Self-Hosted Instances](#self-hosted-instances)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before installing the Firecrawl MCP server, ensure you have:

1. **Node.js** v18 or later installed ([download](https://nodejs.org/))
2. **A Firecrawl API key** — sign up at [firecrawl.dev](https://www.firecrawl.dev/app/api-keys) to get a free API key
3. **An MCP-compatible client** from the list below

> **Tip:** You can also use a self-hosted Firecrawl instance instead of the cloud API. See [Self-Hosted Instances](#self-hosted-instances).

---

## Quick Start

The fastest way to run the Firecrawl MCP server:

```bash
# Using npx (no installation required)
env FIRECRAWL_API_KEY=fc-YOUR_API_KEY npx -y firecrawl-mcp

# Or install globally first
npm install -g firecrawl-mcp
FIRECRAWL_API_KEY=fc-YOUR_API_KEY firecrawl-mcp
```

---

## Installation by Client

### Cursor

> Requires Cursor version 0.45.6+. See [Cursor MCP docs](https://docs.cursor.com/context/model-context-protocol) for more info.

Go to: **Settings** → **Cursor Settings** → **MCP** → **Add new global MCP server**

Paste the following configuration into your Cursor `~/.cursor/mcp.json` file. You may also create `.cursor/mcp.json` in your project folder for project-specific configuration.

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

<details>
<summary><b>Legacy setup for Cursor v0.45.6</b></summary>

1. Open Cursor Settings
2. Go to **Features** → **MCP Servers**
3. Click **"+ Add New MCP Server"**
4. Enter:
   - **Name:** `firecrawl-mcp`
   - **Type:** `command`
   - **Command:** `env FIRECRAWL_API_KEY=YOUR_API_KEY npx -y firecrawl-mcp`

> **Windows:** Use `cmd /c "set FIRECRAWL_API_KEY=YOUR_API_KEY && npx -y firecrawl-mcp"` instead.

</details>

After adding, refresh the MCP server list to see the new tools. The Composer Agent will automatically use Firecrawl MCP when appropriate.

---

### Claude Desktop

#### Remote Server Connection

Open Claude Desktop and navigate to **Settings** → **Connectors** → **Add Custom Connector**.

- **Name:** Firecrawl
- **URL:** Use the Streamable HTTP URL if you run Firecrawl MCP in [local server mode](#streamable-http-local-server-mode)

#### Local Server Connection

Open Claude Desktop developer settings and edit your `claude_desktop_config.json` file. See [Claude Desktop MCP docs](https://modelcontextprotocol.io/quickstart/user) for more info.

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

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

<details>
<summary><b>With optional retry and credit monitoring</b></summary>

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "YOUR_API_KEY",
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

</details>

---

### Claude Code

Run this command in your terminal. See [Claude Code MCP docs](https://docs.anthropic.com/en/docs/claude-code/mcp) for more info.

```bash
claude mcp add firecrawl-mcp -- npx -y firecrawl-mcp --api-key YOUR_API_KEY
```

> **Note:** If running the Firecrawl MCP in [Streamable HTTP mode](#streamable-http-local-server-mode), use:
> ```bash
> claude mcp add --transport http firecrawl-mcp http://localhost:3000/mcp
> ```

---

### VS Code

For one-click installation, use the VS Code install buttons:

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_MCP_Server-blue?logo=visualstudiocode)](https://insiders.vscode.dev/redirect/mcp/install?name=firecrawl&inputs=%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22apiKey%22%2C%22description%22%3A%22Firecrawl%20API%20Key%22%2C%22password%22%3Atrue%7D%5D&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22firecrawl-mcp%22%5D%2C%22env%22%3A%7B%22FIRECRAWL_API_KEY%22%3A%22%24%7Binput%3AapiKey%7D%22%7D%7D)

For manual installation, press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS), type **Preferences: Open User Settings (JSON)**, and add:

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

<details>
<summary><b>Workspace-level configuration (shareable with team)</b></summary>

Create `.vscode/mcp.json` in your workspace root:

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

</details>

---

### Windsurf

Add this to your Windsurf MCP config file (`~/.codeium/windsurf/model_config.json`). See [Windsurf MCP docs](https://docs.windsurf.com/windsurf/cascade/mcp) for more info.

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

Add this to your Opencode configuration file. See [Opencode MCP docs](https://opencode.ai/docs/mcp-servers) for more info.

#### Local Server Connection

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

#### Remote Server Connection (Streamable HTTP)

If you run Firecrawl MCP in [Streamable HTTP mode](#streamable-http-local-server-mode):

```json
{
  "mcp": {
    "firecrawl-mcp": {
      "type": "remote",
      "url": "http://localhost:3000/mcp",
      "enabled": true
    }
  }
}
```

---

### OpenAI Codex CLI

See [OpenAI Codex](https://github.com/openai/codex) for more information.

Add to your Codex configuration file:

```toml
[mcp_servers.firecrawl-mcp]
command = "npx"
args = ["-y", "firecrawl-mcp"]
startup_timeout_ms = 20_000

[mcp_servers.firecrawl-mcp.env]
FIRECRAWL_API_KEY = "YOUR_API_KEY"
```

> **Tip:** If you see startup timeout errors, try increasing `startup_timeout_ms` to `40_000`.

---

### Google Antigravity

Add this to your Antigravity MCP config file. See [Antigravity MCP docs](https://antigravity.google/docs/mcp) for more info.

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

### Kiro

See [Kiro MCP Documentation](https://kiro.dev/docs/mcp/configuration/) for details.

1. Navigate **Kiro** → **MCP Servers**
2. Click the **+ Add** button
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

4. Click **Save** to apply.

---

### Kilo Code

Kilo Code supports two configuration levels:
- **Global:** stored in `mcp_settings.json`
- **Project-level:** stored in `.kilocode/mcp.json` (recommended)

#### Configure via UI

1. Open **Kilo Code** → click the **Settings** icon
2. Navigate to **Settings** → **MCP Servers**
3. Click **Add Server** → Choose **Stdio Server**
4. Enter:
   - **Command:** `npx`
   - **Args:** `-y firecrawl-mcp`
   - **Environment Variables:** `FIRECRAWL_API_KEY=YOUR_API_KEY`
5. Click **Save**

#### Manual Configuration

Create `.kilocode/mcp.json`:

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "YOUR_API_KEY"
      },
      "alwaysAllow": [],
      "disabled": false
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

### Cline

You can install via the [Cline MCP Server Marketplace](https://cline.bot/mcp-marketplace):

1. Open **Cline**
2. Click the **hamburger menu** → **MCP Servers**
3. Search for "Firecrawl" in the Marketplace tab
4. Click **Install**

Or configure manually:

1. Open **Cline** → hamburger menu → **MCP Servers**
2. Choose the **Installed** tab → click **Edit Configuration**
3. Add `firecrawl-mcp` to `mcpServers`:

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

### Augment Code

#### Using the Augment Code UI

1. Click the **hamburger menu** → **Settings**
2. Navigate to the **Tools** section
3. Click **+ Add MCP**
4. Enter the command: `FIRECRAWL_API_KEY=YOUR_API_KEY npx -y firecrawl-mcp`
5. **Name:** `firecrawl-mcp`
6. Click **Add**

#### Manual Configuration

1. Press `Cmd/Ctrl+Shift+P` → **Edit Settings**
2. Under **Advanced**, click **Edit in settings.json**
3. Add:

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

### Gemini CLI

See [Gemini CLI Configuration](https://google-gemini.github.io/gemini-cli/docs/tools/mcp-server.html) for details.

Open `~/.gemini/settings.json` and add:

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

### Trae

Use the **Add manually** feature and fill in the JSON configuration. See [Trae documentation](https://docs.trae.ai/ide/model-context-protocol?_lang=en) for more details.

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

### Zed

You can install via [Zed Extensions](https://zed.dev/extensions) or add to your Zed `settings.json`. See [Zed Context Server docs](https://zed.dev/docs/assistant/context-servers) for more info.

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

### JetBrains AI Assistant

See [JetBrains AI Assistant Documentation](https://www.jetbrains.com/help/ai-assistant/configure-an-mcp-server.html) for more details.

Works with **IntelliJ IDEA**, **WebStorm**, **PyCharm**, **GoLand**, **CLion**, **Rider**, **RubyMine**, **PhpStorm**, and all other JetBrains IDEs.

1. Go to **Settings** → **Tools** → **AI Assistant** → **Model Context Protocol (MCP)**
2. Click **+ Add**
3. Click on **Command** in the top-left corner and select **As JSON**
4. Paste:

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

5. Click **Apply** to save changes.

---

### Qwen Code

See [Qwen Code MCP Configuration](https://qwenlm.github.io/qwen-code-docs/en/users/features/mcp/) for details.

#### Using CLI Command

```bash
# Project-level (default, saved to .qwen/settings.json)
qwen mcp add firecrawl-mcp npx -y firecrawl-mcp

# User-level (saved to ~/.qwen/settings.json)
qwen mcp add --scope user firecrawl-mcp npx -y firecrawl-mcp
```

#### Manual Configuration

Open `~/.qwen/settings.json` (user scope) or `.qwen/settings.json` (project scope) and add:

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

### Warp

See [Warp MCP Documentation](https://docs.warp.dev/knowledge-and-collaboration/mcp#adding-an-mcp-server) for details.

1. Navigate **Settings** → **AI** → **Manage MCP servers**
2. Click the **+ Add** button
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

4. Click **Save**.

---

### Amp

Run this command in your terminal. See [Amp MCP docs](https://ampcode.com/manual#mcp) for more info.

```bash
amp mcp add firecrawl-mcp -- npx -y firecrawl-mcp
```

> **Note:** Set the `FIRECRAWL_API_KEY` environment variable before running, or configure it in your shell profile.

---

### Amazon Q Developer CLI

Add this to your Amazon Q Developer CLI configuration file. See [Amazon Q Developer CLI docs](https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/command-line-mcp-configuration.html) for more info.

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

### GitHub Copilot (Coding Agent)

Add the following to **Repository** → **Settings** → **Copilot** → **Coding agent** → **MCP configuration**:

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

See the [official GitHub documentation](https://docs.github.com/en/enterprise-cloud@latest/copilot/how-tos/agents/copilot-coding-agent/extending-copilot-coding-agent-with-mcp) for more info.

---

### GitHub Copilot CLI

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

### Smithery

To install Firecrawl MCP Server for any client automatically via [Smithery](https://smithery.ai/server/@mendableai/mcp-server-firecrawl):

```bash
npx -y @smithery/cli install @mendableai/mcp-server-firecrawl --client claude
```

Replace `claude` with your desired client name (e.g., `cursor`, `vscode`, etc.).

---

## Alternative Runtimes

### Docker

Create a `Dockerfile`:

```dockerfile
FROM node:18-alpine
WORKDIR /app
RUN npm install -g firecrawl-mcp
ENV FIRECRAWL_API_KEY=YOUR_API_KEY
CMD ["firecrawl-mcp"]
```

Build and run:

```bash
docker build -t firecrawl-mcp .
docker run -i --rm -e FIRECRAWL_API_KEY=YOUR_API_KEY firecrawl-mcp
```

Configure your MCP client to use Docker:

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

### Bun

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

---

### Deno

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "deno",
      "args": [
        "run",
        "--allow-env",
        "--allow-net",
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

## Platform-Specific Notes

### Windows

On Windows, use `cmd` to wrap the `npx` command:

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

Alternatively, if your client does not support the `env` field:

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "cmd",
      "args": ["/c", "set FIRECRAWL_API_KEY=YOUR_API_KEY && npx -y firecrawl-mcp"]
    }
  }
}
```

---

### Streamable HTTP (Local Server Mode)

Run the MCP server as a local HTTP server instead of using stdio transport:

```bash
env HTTP_STREAMABLE_SERVER=true FIRECRAWL_API_KEY=YOUR_API_KEY npx -y firecrawl-mcp
```

The server will be available at: `http://localhost:3000/mcp`

Use this URL in any MCP client that supports HTTP transport.

---

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FIRECRAWL_API_KEY` | Yes* | — | Your Firecrawl API key |
| `FIRECRAWL_API_URL` | No | Cloud API | Custom API endpoint for self-hosted instances |
| `FIRECRAWL_RETRY_MAX_ATTEMPTS` | No | `3` | Maximum retry attempts for rate-limited requests |
| `FIRECRAWL_RETRY_INITIAL_DELAY` | No | `1000` | Initial delay (ms) before first retry |
| `FIRECRAWL_RETRY_MAX_DELAY` | No | `10000` | Maximum delay (ms) between retries |
| `FIRECRAWL_RETRY_BACKOFF_FACTOR` | No | `2` | Exponential backoff multiplier |
| `FIRECRAWL_CREDIT_WARNING_THRESHOLD` | No | `1000` | Credit usage warning threshold |
| `FIRECRAWL_CREDIT_CRITICAL_THRESHOLD` | No | `100` | Credit usage critical threshold |

\* Required when using the cloud API. Optional when using a self-hosted instance with `FIRECRAWL_API_URL`.

### Self-Hosted Instances

If you're running a self-hosted Firecrawl instance, set `FIRECRAWL_API_URL` to point to your deployment:

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
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

---

## Verification

After installation, verify the MCP server is working:

1. **Check server status:** In your MCP client, the Firecrawl MCP server should appear as connected/active in the MCP servers list.

2. **Test with a simple scrape:** Ask your AI assistant to scrape a webpage:
   ```
   Use the Firecrawl MCP to scrape https://example.com and show me the content.
   ```

3. **Available tools:** The following tools should be available:
   - `firecrawl_scrape` — Scrape a single URL
   - `firecrawl_batch_scrape` — Scrape multiple URLs
   - `firecrawl_map` — Discover URLs on a website
   - `firecrawl_crawl` — Crawl multiple pages
   - `firecrawl_search` — Search the web
   - `firecrawl_extract` — Extract structured data
   - `firecrawl_deep_research` — Deep research on a topic
   - `firecrawl_check_crawl_status` — Check crawl job status
   - `firecrawl_check_batch_status` — Check batch job status

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| `npx` command not found | Install Node.js v18+ from [nodejs.org](https://nodejs.org/) |
| API key errors | Verify your key at [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys) |
| Server fails to start | Try running `npx -y firecrawl-mcp` directly in terminal to see error output |
| Timeout on startup | Increase `startup_timeout_ms` or check network connectivity |
| Rate limiting errors | Configure retry settings via environment variables (see [Configuration](#configuration)) |
| Windows path issues | Use the `cmd` wrapper method (see [Windows](#windows)) |
| Permission denied (Linux/macOS) | Run `npm config set prefix ~/.npm-global` and add `~/.npm-global/bin` to `PATH` |
| Credit threshold warnings | Check your credit balance at [firecrawl.dev](https://www.firecrawl.dev/) |

### Getting Help

- **GitHub Issues:** [github.com/firecrawl/firecrawl-mcp-server/issues](https://github.com/firecrawl/firecrawl-mcp-server/issues)
- **Discord:** [discord.com/invite/gSmWdAkdwd](https://discord.com/invite/gSmWdAkdwd)
- **Documentation:** [docs.firecrawl.dev](https://docs.firecrawl.dev)

---

*This guide covers 25+ MCP-compatible environments. If your client isn't listed, check its documentation for MCP server configuration — most clients follow one of the patterns shown above.*
