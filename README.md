<div align="center">
  <a name="readme-top"></a>
  <img
    src="https://raw.githubusercontent.com/firecrawl/firecrawl-mcp-server/main/img/fire.png"
    height="140"
  >
</div>

# Firecrawl MCP Server

A Model Context Protocol (MCP) server implementation that integrates with [Firecrawl](https://github.com/firecrawl/firecrawl) for web scraping, search, crawling, and extraction.

> Big thanks to [@vrknetha](https://github.com/vrknetha), [@knacklabs](https://www.knacklabs.ai) for the initial implementation!

## Credits

- Initial implementation: [@vrknetha](https://github.com/vrknetha), [@knacklabs](https://www.knacklabs.ai), [@cawstudios](https://caw.tech)
- Hosting/integrations: MCP.so, Klavis AI, [@gstarwd](https://github.com/gstarwd), [@xiangkaiz](https://github.com/xiangkaiz), [@zihaolin96](https://github.com/zihaolin96)

## Packages in this repo

- `firecrawl-mcp` (MCP server)
- `@firecrawl/cli` (terminal CLI, no MCP)

## CLI (no MCP)

If you want to avoid MCP tool-description overhead, use the CLI:

```bash
npm install -g @firecrawl/cli
export FIRECRAWL_API_KEY=fc-YOUR_API_KEY

# JSON args via stdin + positional URL
echo '{"formats":["markdown"]}' | firecrawl scrape https://example.com

# Search (query as positional; other options via JSON)
echo '{"limit":5,"sources":["web"]}' | firecrawl search "top AI companies"
```

### `firecrawl tool` (MCP-style wrapper)

Terminal agents often already produce MCP tool-call JSON (`{ "name": "...", "arguments": {...} }`). You can pipe that directly:

```bash
echo '{"name":"firecrawl_scrape","arguments":{"url":"https://example.com","formats":["markdown"]}}' | firecrawl tool
```

### Inputs

- `--json '<json>'`: Provide the tool arguments inline
- `--input <file>`: Read JSON tool arguments from a file (`-` reads stdin)
- If stdin is piped and neither `--json` nor `--input` is provided, the CLI reads JSON from stdin

Examples:

```bash
firecrawl scrape https://example.com --json '{"formats":["markdown"]}'
firecrawl scrape https://example.com --input args.json
cat args.json | firecrawl scrape https://example.com
```

### Profiles / config

Create `~/.config/firecrawl/config.json` (or set `FIRECRAWL_CONFIG`):

```json
{
  "defaults": { "profile": "default" },
  "profiles": {
    "default": { "apiKey": "fc-YOUR_API_KEY" },
    "local": { "apiUrl": "http://localhost:3002" }
  }
}
```

Keep API keys in env vars or a user-local config file (don’t commit them to your repo).

Then run with `--profile local` (or `FIRECRAWL_PROFILE=local`).

### Streaming output (JSONL) + files

For large outputs, use `--jsonl` and/or write to a file:

```bash
firecrawl crawl https://example.com --jsonl --output out.jsonl
```

### Logging (stderr)

CLI logs go to stderr so stdout can stay machine-readable:

- `--log-level error|warn|info|debug` (default: `error`)
- `--log-format text|json` (default: `text`)
- `--quiet`, `--verbose`, `--debug`

You can also run without installing globally:

```bash
env FIRECRAWL_API_KEY=fc-YOUR_API_KEY npx -y -p @firecrawl/cli firecrawl scrape https://example.com --json '{"formats":["markdown"]}'
```

## Features

- Web scraping, crawling, and discovery (`scrape`, `map`, `crawl`)
- Web search (`search`)
- Structured extraction (`extract`)
- Firecrawl agent jobs (`agent`, `agent-status`)
- Works with cloud API keys or self-hosted via `FIRECRAWL_API_URL`

> Play around with [our MCP Server on MCP.so's playground](https://mcp.so/playground?server=firecrawl-mcp-server) or on [Klavis AI](https://www.klavis.ai/mcp-servers).

## Installation

### Running with npx

```bash
env FIRECRAWL_API_KEY=fc-YOUR_API_KEY npx -y firecrawl-mcp
```

### Manual Installation

```bash
npm install -g firecrawl-mcp
```

Then run:

```bash
env FIRECRAWL_API_KEY=fc-YOUR_API_KEY firecrawl-mcp
```

### Running on Cursor

Configuring Cursor 🖥️
Note: Requires Cursor version 0.45.6+
For the most up-to-date configuration instructions, please refer to the official Cursor documentation on configuring MCP servers:
[Cursor MCP Server Configuration Guide](https://docs.cursor.com/context/model-context-protocol#configuring-mcp-servers)

To configure Firecrawl MCP in Cursor **v0.48.6**

1. Open Cursor Settings
2. Go to Features > MCP Servers
3. Click "+ Add new global MCP server"
4. Enter the following code:
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

To configure Firecrawl MCP in Cursor **v0.45.6**

1. Open Cursor Settings
2. Go to Features > MCP Servers
3. Click "+ Add New MCP Server"
4. Enter the following:
   - Name: "firecrawl-mcp" (or your preferred name)
   - Type: "command"
   - Command: `env FIRECRAWL_API_KEY=your-api-key npx -y firecrawl-mcp`

> If you are using Windows and are running into issues, try `cmd /c "set FIRECRAWL_API_KEY=your-api-key && npx -y firecrawl-mcp"`

Replace `your-api-key` with your Firecrawl API key. If you don't have one yet, you can create an account and get it from https://www.firecrawl.dev/app/api-keys

After adding, refresh the MCP server list to see the new tools. The Composer Agent will automatically use Firecrawl MCP when appropriate, but you can explicitly request it by describing your web scraping needs. Access the Composer via Command+L (Mac), select "Agent" next to the submit button, and enter your query.

### Running on Windsurf

Add this to your `./codeium/windsurf/model_config.json`:

```json
{
  "mcpServers": {
    "mcp-server-firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

### Running with Streamable HTTP Local Mode

To run the server using Streamable HTTP locally instead of the default stdio transport:

```bash
env FASTMCP_TRANSPORT=httpStream FASTMCP_PORT=3000 FIRECRAWL_API_KEY=fc-YOUR_API_KEY npx -y firecrawl-mcp
```

Use the url: http://localhost:3000/mcp

### Installing via Smithery (Legacy)

To install Firecrawl for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@mendableai/mcp-server-firecrawl):

```bash
npx -y @smithery/cli install @mendableai/mcp-server-firecrawl --client claude
```

### Running on VS Code

For one-click installation, click one of the install buttons below...

[![Install with NPX in VS Code](https://img.shields.io/badge/VS_Code-NPM-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=firecrawl&inputs=%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22apiKey%22%2C%22description%22%3A%22Firecrawl%20API%20Key%22%2C%22password%22%3Atrue%7D%5D&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22firecrawl-mcp%22%5D%2C%22env%22%3A%7B%22FIRECRAWL_API_KEY%22%3A%22%24%7Binput%3AapiKey%7D%22%7D%7D) [![Install with NPX in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-NPM-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=firecrawl&inputs=%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22apiKey%22%2C%22description%22%3A%22Firecrawl%20API%20Key%22%2C%22password%22%3Atrue%7D%5D&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22firecrawl-mcp%22%5D%2C%22env%22%3A%7B%22FIRECRAWL_API_KEY%22%3A%22%24%7Binput%3AapiKey%7D%22%7D%7D&quality=insiders)

For manual installation, add the following JSON block to your User Settings (JSON) file in VS Code. You can do this by pressing `Ctrl + Shift + P` and typing `Preferences: Open User Settings (JSON)`.

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

Optionally, you can add it to a file called `.vscode/mcp.json` in your workspace. This will allow you to share the configuration with others:

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

### More MCP clients

Below are quick-start snippets for popular MCP hosts/clients. In most cases you can re-use the same `npx`/JSON config:

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": { "FIRECRAWL_API_KEY": "YOUR_API_KEY" }
    }
  }
}
```

#### Claude Code

Claude Code supports adding local MCP servers via the CLI:

```bash
claude mcp add --transport stdio firecrawl --env FIRECRAWL_API_KEY=YOUR_API_KEY -- npx -y firecrawl-mcp
```

Docs: https://docs.claude.com/en/docs/claude-code/mcp

#### Cline (VS Code extension)

1. Open Cline → MCP Servers → Configure → “Configure MCP Servers”
2. Add this to `cline_mcp_settings.json`:

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": { "FIRECRAWL_API_KEY": "YOUR_API_KEY" }
    }
  }
}
```

Docs: https://docs.cline.bot/mcp/configuring-mcp-servers

#### Zed

Add to Zed `settings.json`:

```json
{
  "context_servers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": { "FIRECRAWL_API_KEY": "YOUR_API_KEY" }
    }
  }
}
```

Docs: https://zed.dev/docs/ai/mcp

#### JetBrains IDEs (AI Assistant)

Settings → Tools → AI Assistant → Model Context Protocol (MCP) → Add → paste:

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": { "FIRECRAWL_API_KEY": "YOUR_API_KEY" }
    }
  }
}
```

Docs: https://www.jetbrains.com/help/ai-assistant/mcp.html

#### Continue (VS Code / JetBrains)

Create `.continue/config.yaml` (or add to your existing config) with:

```yaml
name: Continue
version: 1.0.0
schema: v1
mcpServers:
  - name: Firecrawl
    command: npx
    args: ["-y", "firecrawl-mcp"]
    env:
      FIRECRAWL_API_KEY: ${FIRECRAWL_API_KEY}
```

Docs: https://docs.continue.dev/reference (see `mcpServers`)

#### Warp

Warp → Settings → AI → Manage MCP Servers → Add → paste:

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": { "FIRECRAWL_API_KEY": "YOUR_API_KEY" }
    }
  }
}
```

Docs: https://docs.warp.dev/features/warp-ai/mcp

#### Amazon Q CLI

Option A (agent file): create an agent JSON with an `mcpServers` section:

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": { "FIRECRAWL_API_KEY": "YOUR_API_KEY" }
    }
  }
}
```

Docs:
- Agent format (`mcpServers`): https://aws.github.io/amazon-q-developer-cli/agent-format.html
- CLI MCP config (`qchat mcp ...`): https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/command-line-mcp-config-CLI.html

#### Goose

Run `goose configure` and add a “Command-line Extension”, then use:

```bash
npx -y firecrawl-mcp
```

Docs: https://block.github.io/goose/docs/mcp/vs-code-mcp

#### Gemini CLI

Add to `~/.gemini/settings.json` (or `.gemini/settings.json` in a project):

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": { "FIRECRAWL_API_KEY": "${FIRECRAWL_API_KEY}" }
    }
  }
}
```

Docs: https://google-gemini.github.io/gemini-cli/docs/tools/mcp-server.html

#### Codex (OpenAI)

Add via CLI:

```bash
codex mcp add firecrawl -- npx -y firecrawl-mcp
```

Docs: https://github.com/openai/codex/blob/main/docs/config.md#mcp

#### LM Studio

LM Studio → Program tab → Install → “Edit mcp.json” and add:

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": { "FIRECRAWL_API_KEY": "YOUR_API_KEY" }
    }
  }
}
```

Docs: https://lmstudio.ai/mcp

#### LibreChat

Add to your `librechat.yaml`:

```yaml
mcpServers:
  firecrawl:
    command: npx
    args: ["-y", "firecrawl-mcp"]
    env:
      FIRECRAWL_API_KEY: "${FIRECRAWL_API_KEY}"
```

Docs: https://www.librechat.ai/docs/features/mcp

#### Roo Code

Global: Roo Code → MCP settings → “Edit Global MCP” and add:

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": { "FIRECRAWL_API_KEY": "YOUR_API_KEY" }
    }
  }
}
```

Project-level: commit `.roo/mcp.json` with the same `mcpServers` object.

Docs: https://docs.roocode.com/features/mcp/recommended-mcp-servers

#### BoltAI (macOS)

BoltAI stores MCP servers in `~/.boltai/mcp.json`:

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": { "FIRECRAWL_API_KEY": "YOUR_API_KEY" }
    }
  }
}
```

Docs: https://docs.boltai.com/docs/plugins/mcp-servers

#### Cherry Studio

Settings → MCP Server → Add server:

- Type: `STDIO`
- Command: `npx`
- Parameters: `-y firecrawl-mcp`
- Env: `FIRECRAWL_API_KEY=YOUR_API_KEY`

Docs: https://docs.cherry-ai.com/docs/en-us/advanced-basic/mcp/config

#### opencode

Add to `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "firecrawl": {
      "type": "local",
      "command": ["npx", "-y", "firecrawl-mcp"],
      "env": { "FIRECRAWL_API_KEY": "YOUR_API_KEY" }
    }
  }
}
```

Docs: https://opencode.ai/docs/mcp-servers

#### Augment Code

Option A (UI): Augment panel → Settings → MCP → Add Local MCP → set `command=npx`, `args=-y firecrawl-mcp`, and add `FIRECRAWL_API_KEY` in the environment section.

Option B (CLI):

```bash
auggie mcp add firecrawl --command npx --args "-y firecrawl-mcp" --env FIRECRAWL_API_KEY=YOUR_API_KEY
```

Docs:
- Settings + JSON import: https://docs.augmentcode.com/setup-augment/mcp
- CLI: https://docs.augmentcode.com/cli/integrations

#### Emacs

With `mcp.el`, configure:

```elisp
(setq mcp-hub-servers
      '(("firecrawl" . (:command "npx"
                        :args ("-y" "firecrawl-mcp")
                        :env (:FIRECRAWL_API_KEY "YOUR_API_KEY")))))
```

Docs: https://github.com/lizqwerscott/mcp.el

#### Neovim

With `mcphub.nvim`, add to `~/.config/mcphub/servers.json`:

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": { "FIRECRAWL_API_KEY": "YOUR_API_KEY" }
    }
  }
}
```

Docs: https://ravitemer.github.io/mcphub.nvim/mcp/servers_json.html

#### ChatGPT (Developer mode)

ChatGPT Developer mode supports **remote** MCP servers (SSE or Streamable HTTP) over **HTTPS**. A common pattern is:

1. Run Firecrawl MCP as Streamable HTTP locally:

```bash
export FIRECRAWL_API_KEY=YOUR_API_KEY
export FASTMCP_TRANSPORT=httpStream
export FASTMCP_HOST=127.0.0.1
export FASTMCP_PORT=3000
export FASTMCP_ENDPOINT=/mcp
npx -y firecrawl-mcp
```

2. Expose it over HTTPS (e.g., ngrok / Cloudflare Tunnel).
3. In ChatGPT: Settings → Apps & Connectors → Advanced settings → Developer mode → Create app/connector → enter your `https://.../mcp` URL.

Docs:
- https://platform.openai.com/docs/guides/developer-mode
- https://developers.openai.com/apps-sdk/deploy/connect-chatgpt

#### Docker

You can run the MCP server over stdio in a container and point your MCP client at `docker run ...`:

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "FIRECRAWL_API_KEY",
        "ghcr.io/firecrawl/firecrawl-mcp-server:latest"
      ],
      "env": { "FIRECRAWL_API_KEY": "YOUR_API_KEY" }
    }
  }
}
```

Or build locally from this repo:

```bash
docker build -t firecrawl-mcp -f Dockerfile .
echo '{"formats":["markdown"]}' | docker run -i --rm -e FIRECRAWL_API_KEY=YOUR_API_KEY firecrawl-mcp
```

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

##### MCP Tool Docs

- `FIRECRAWL_MCP_DOCS`: Tool description verbosity for MCP clients (`short` or `full`, default: `short`)
- MCP also exposes a lightweight `firecrawl_capabilities` tool for discovery (safe mode, docs mode, and config hints)

##### Server runtime (optional)

- `FASTMCP_TRANSPORT=httpStream`: Run the MCP server over Streamable HTTP (instead of stdio)
- `FASTMCP_PORT`: Port for `httpStream` mode (default: `8080`)
- `FASTMCP_HOST`: Host for `httpStream` mode (default: `localhost`)
- `FASTMCP_ENDPOINT`: Endpoint path for `httpStream` mode (default: `/mcp`)
- `CLOUD_SERVICE=true`: Require API key via request headers (for hosted deployments)

### Configuration Examples

For cloud API usage:

```bash
# Required for cloud API
export FIRECRAWL_API_KEY=your-api-key
```

For self-hosted instance:

```bash
# Required for self-hosted
export FIRECRAWL_API_URL=https://firecrawl.your-domain.com

# Optional authentication for self-hosted
export FIRECRAWL_API_KEY=your-api-key  # If your instance requires auth
```

### Usage with Claude Desktop

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mcp-server-firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "YOUR_API_KEY_HERE",
        "FIRECRAWL_MCP_DOCS": "short"
      }
    }
  }
}
```

## MCP tools

This server exposes these tools (names match the CLI wrapper):

- `firecrawl_capabilities`
- `firecrawl_scrape`
- `firecrawl_map`
- `firecrawl_search`
- `firecrawl_crawl`
- `firecrawl_check_crawl_status`
- `firecrawl_extract`
- `firecrawl_agent`
- `firecrawl_agent_status`

Tip: set `FIRECRAWL_MCP_DOCS=full` to get full descriptions from the server itself.

## Development

Requires Node.js 22+.

```bash
# Install dependencies
npm install

# Build (Nx monorepo)
npm run build
# Or per-package:
npm run nx -- build firecrawl-mcp
npm run nx -- build firecrawl-cli

# Run tests
npm test
```

### Integration tests (optional)

Integration tests hit the real Firecrawl API and are intended to be run locally (not in CI). They are skipped unless `FIRECRAWL_API_KEY` is set:

```bash
export FIRECRAWL_API_KEY=fc-YOUR_API_KEY
npm run test:integration
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
