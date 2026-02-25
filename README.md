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

### Running with npx

```bash
env FIRECRAWL_API_KEY=fc-YOUR_API_KEY npx -y firecrawl-mcp
```

### Manual Installation

```bash
npm install -g firecrawl-mcp
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

---

## Installation for Other MCP Clients

> [!NOTE]
> **API Key Required**: Get a free API key at [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys) for full access.

<details>
<summary><b>Install in Claude Code</b></summary>

Run this command. See [Claude Code MCP docs](https://code.claude.com/docs/en/mcp) for more info.

#### Claude Code Local Server Connection

```sh
claude mcp add --scope user firecrawl-mcp -- npx -y firecrawl-mcp --api-key YOUR_API_KEY
```

#### Claude Code Remote Server Connection

```sh
claude mcp add --scope user --header "FIRECRAWL_API_KEY: YOUR_API_KEY" --transport http firecrawl-mcp https://mcp.firecrawl.dev/mcp
```

> Remove `--scope user` to install for the current project only.

</details>

<details>
<summary><b>Install in Claude Desktop</b></summary>

Add this to your `claude_desktop_config.json`:

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

See [Claude Desktop MCP docs](https://docs.anthropic.com/en/docs/claude-desktop/mcp) for more info.

</details>

<details>
<summary><b>Install in Continue</b></summary>

Add this to your Continue configuration file (`.continue/config.json`):

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

See [Continue MCP docs](https://docs.continue.dev/mcp) for more info.

</details>

<details>
<summary><b>Install in Cline</b></summary>

Add this to your Cline MCP configuration (`.cline/mcp.json`):

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

See [Cline MCP docs](https://docs.cline.cc/mcp) for more info.

</details>

<details>
<summary><b>Install in MCPHub</b></summary>

MCPHub provides a web interface for configuring MCP servers. To add Firecrawl MCP:

1. Go to [MCPHub](https://mcphub.ai)
2. Click "Add Server"
3. Select "Local Server"
4. Enter the following configuration:
   - Name: "firecrawl-mcp"
   - Command: `npx -y firecrawl-mcp`
   - Environment Variable: `FIRECRAWL_API_KEY=YOUR_API_KEY`

See [MCPHub docs](https://docs.mcphub.ai) for more info.

</details>

<details>
<summary><b>Install in Claude for VS Code</b></summary>

Add this to your VS Code settings (`settings.json`):

```json
{
  "claude.vscode.mcpServers": {
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

See [Claude for VS Code MCP docs](https://marketplace.visualstudio.com/items?itemName=anthropic Claude) for more info.

</details>

<details>
<summary><b>Install with firecrawl-mcp setup</b></summary>

Set up Firecrawl MCP for your coding agents:

```bash
npx firecrawl-mcp setup
```

This command will:
- Authenticate via OAuth (if supported)
- Generate an API key
- Configure the MCP server for your agents
- Add a rule for automatic invocation

Use `--cursor`, `--claude`, or `--opencode` to target a specific agent.

</details>

<details>
<summary><b>OAuth Authentication</b></summary>

Firecrawl MCP server supports OAuth 2.0 authentication for MCP clients that implement the [MCP OAuth specification](https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization).

To use OAuth, change the endpoint from `/mcp` to `/mcp/oauth` in your client configuration:

```diff
- "url": "https://mcp.firecrawl.dev/mcp"
+ "url": "https://mcp.firecrawl.dev/mcp/oauth"
```

OAuth is only available for remote HTTP connections. For local MCP connections using stdio transport, use API key authentication instead.

</details>

## Important Tips

### Add a Rule

To avoid typing "use firecrawl" in every prompt, add a rule to your MCP client to automatically invoke Firecrawl MCP for web scraping tasks:

- **Cursor**: `Cursor Settings > Rules`
- **Claude Code**: `CLAUDE.md`
- **Continue**: `.continue/rules.md`
- **Cline**: `.cline/rules.md`

**Example rule:**

```txt
Always use Firecrawl MCP when I need web scraping, crawling, content extraction, or deep research without me having to explicitly ask.
```

### Use Library Id

If you already know exactly which Firecrawl API you want to use, add its library ID to your prompt. That way, Firecrawl MCP server can skip the library-matching step and directly continue with the request.

```txt
Scrape all product details from https://example.com/products. use library /firecrawl/scrape for API and docs.
```

The slash syntax tells the MCP tool exactly which library to use.

### Specify a Version

When using specific Firecrawl APIs, you can specify the version to ensure compatibility:

```txt
Use Firecrawl v2 API to scrape the latest news from https://news.ycombinator.com. use library /firecrawl/v2/scrape.
```

---

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