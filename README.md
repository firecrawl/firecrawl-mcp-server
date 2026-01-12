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

### Quick Start

<details>
<summary><b>Running with npx</b></summary>

### Running with npx

```bash
env FIRECRAWL_API_KEY=fc-YOUR_API_KEY npx -y firecrawl-mcp
```

</details>

<details>
<summary><b>Manual Installation</b></summary>

### Manual Installation

```bash
npm install -g firecrawl-mcp
```

</details>

### AI Assistants & Code Editors

<details>
<summary><b>Claude Desktop</b></summary>

See the [Usage with Claude Desktop](#usage-with-claude-desktop) section below for detailed configuration.

</details>

<details>
<summary><b>Claude Code</b></summary>

### Running on Claude Code

Add the Firecrawl MCP server using the Claude Code CLI:

```bash
claude mcp add firecrawl -s user -- env FIRECRAWL_API_KEY=fc-YOUR_API_KEY npx -y firecrawl-mcp
```

Replace `fc-YOUR_API_KEY` with your Firecrawl API key from [firecrawl.dev](https://www.firecrawl.dev/app/api-keys).

**What this does:**
- Adds Firecrawl MCP to your user-level Claude Code configuration
- Exposes tools: `scrape`, `crawl`, `map`, `search`, `extract`, and batch operations
- Works across all your Claude Code sessions

**Verification:**
1. Run the command above
2. Start a new Claude Code session
3. Ask: "What MCP servers are available?"
4. You should see Firecrawl listed with its tools

**Tip:** You can select which tools to expose using the CLI's interactive mode by omitting the `--` and letting the CLI prompt you.

</details>

<details>
<summary><b>Google Antigravity</b></summary>

### Running on Google Antigravity

Google Antigravity is Google's agentic development platform powered by Gemini. You can add Firecrawl MCP server through the UI or manually.

**Prerequisites:**
- Google Antigravity installed ([Download](https://antigravity.google))
- Gmail account (free public preview)
- Firecrawl API key from [firecrawl.dev](https://www.firecrawl.dev/app/api-keys)

**Method 1: Via MCP Store (Recommended)**

1. Open Google Antigravity
2. Click the **`⋯`** (more) menu in the Agent pane
3. Select **MCP Servers**
4. Search for "Firecrawl" in the MCP Store
5. Click **Install**
6. Enter your Firecrawl API key when prompted

**Method 2: Manual Configuration**

1. In Antigravity, click **`⋯`** > **MCP Servers** > **Manage MCP Servers**
2. Click **View raw config**
3. Edit `~/.gemini/antigravity/mcp_config.json` (Linux/Mac) or equivalent on Windows
4. Add the Firecrawl configuration:

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "fc-YOUR_API_KEY"
      }
    }
  }
}
```

**For HTTP-based deployment:**

```json
{
  "mcpServers": {
    "firecrawl": {
      "serverUrl": "http://localhost:3000/mcp"
    }
  }
}
```

> **Note:** Antigravity uses `serverUrl` instead of `url` for HTTP-based MCP servers.

**Verification:**
1. Restart Antigravity or reload the Agent pane
2. Click **`⋯`** > **MCP Servers** to verify Firecrawl is listed
3. In your code editor, ask the Agent: "Scrape https://example.com"
4. The Agent should use Firecrawl tools

**Performance Tip:** Keep total enabled MCP tools under 50 for optimal performance in Antigravity.

</details>

<details>
<summary><b>Cursor</b></summary>

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

</details>

<details>
<summary><b>Windsurf</b></summary>

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

</details>

<details>
<summary><b>VS Code</b></summary>

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

</details>

<details>
<summary><b>Cline (VS Code Extension)</b></summary>

### Running on Cline

Cline is a popular VS Code extension for AI-assisted coding that supports MCP servers.

**Prerequisites:**
- VS Code or VS Code Insiders
- Cline extension installed from the VS Code marketplace
- Node.js 18 or higher
- Firecrawl API key from [firecrawl.dev](https://www.firecrawl.dev/app/api-keys)

**Configuration:**

1. Open Cline from the side panel
2. Click on the Hamburger menu, this will take you to the MCP servers
3. You can download Firecrawl MCP from the Marketplace, or add Remote server endpoint with filling up "Name" and API Endponint.
4. Or Click **"Configure MCP Servers"**
5. Add the Firecrawl MCP configuration:

```json
{
  "cline.mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "fc-YOUR_API_KEY"
      }
    }
  }
}
```

**Verification:**

1. Right above the **"Configure MCP Server"** option, look for firecrawl-mcp
2. Click in the drop down, you can now see the avaliable tools

**Available Tools:**
Cline can now use all Firecrawl tools including scrape, crawl, map, search, and extract within your coding workflow.

</details>

<details>
<summary><b>AMP (Augment Code)</b></summary>

### Running on AMP (Augment Code)

AMP is a VS Code extension that enhances coding with AI assistance and supports MCP servers.

**Prerequisites:**
- VS Code or VS Code Insiders
- AMP (Augment Code) extension installed from the VS Code marketplace
- Node.js 18 or higher
- Firecrawl API key from [firecrawl.dev](https://www.firecrawl.dev/app/api-keys)

**Configuration:**

1. Install the AMP extension from VS Code marketplace
2. Click on the AMP extension icon in the sidebar
3. Navigate to **Settings** icon
4. Under **MCP Servers & Toolboxes**, click the **"+ Add"** button
5. Below "Add MCP Server", click **"Open settings"** button
6. This will open `settings.json`
7. Under `"amp.mcpServers"`, add the Firecrawl configuration:

```json
{
  "amp.mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "fc-YOUR_API_KEY"
      }
    }
  }
}
```

**Verification:**

1. Save the settings.json file
2. You can see Firecrawl MCP tools listed in the tools section
3. If not, then Restart VS Code or reload the window
3. Open AMP extension
4. You should see Firecrawl MCP tools listed in the **Tools** section
5. Test by using one of the Firecrawl tools in your workflow

**Available Tools:**
AMP can now access all Firecrawl tools including scrape, crawl, map, search, and extract for enhanced web scraping capabilities.

</details>

<details>
<summary><b>Zed</b></summary>

### Running on Zed

Zed is a high-performance code editor with built-in AI assistance and MCP server support.

**Prerequisites:**
- Zed editor installed ([Download](https://zed.dev))
- Node.js 18 or higher
- Firecrawl API key from [firecrawl.dev](https://www.firecrawl.dev/app/api-keys)

**Configuration:**

1. Open Zed editor
2. Click on your **profile icon** (top-right corner)
3. Select **Extensions**
4. Navigate to **MCP Servers** section
5. Search for **"firecrawl"** in the search bar
6. Click **Install**
7. Configure by adding your Firecrawl API key when prompted
8. You should see a confirmation message: **"mcp-server-firecrawl configured successfully"**

**Verification:**
1. Open a new file or project in Zed
2. Access the AI assistant (LLM) feature
3. Ask: "Use Firecrawl to scrape https://example.com"
4. The assistant should use Firecrawl tools to fetch the content
5. You can verify available tools by asking: "What Firecrawl tools are available?"

**Available Tools:**
Zed's AI assistant can now use all Firecrawl tools including scrape, crawl, map, search, and extract for web scraping and content extraction.

</details>

<details>
<summary><b>Kiro</b></summary>

### Running on Kiro

Kiro is an AI-powered IDE that supports MCP servers for enhanced functionality.

**Prerequisites:**
- Kiro IDE installed
- Node.js 18 or higher
- Firecrawl API key from [firecrawl.dev](https://www.firecrawl.dev/app/api-keys)

**Configuration:**

1. Open a folder in Kiro
2. In the folder panel, locate and click on the Kiro logo
3. Click **MCP Server** dropdown section
4. Click **Edit Config File**
5. Add the Firecrawl configuration:

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "fc-YOUR_API_KEY"
      }
    }
  }
}
```

5. Save the configuration file
6. The MCP Server dropdown in the folder panel will now show available Firecrawl tools

**Verification:**
1. Look for the **MCP Server** dropdown in the folder panel
2. Click on it to see the list of available tools
3. You should see Firecrawl tools like `scrape`, `crawl`, `map`, `search`, and `extract`
4. Test by using one of the tools in your workflow

**Available Tools in Dropdown:**
- `firecrawl_scrape` - Scrape single pages
- `firecrawl_batch_scrape` - Scrape multiple URLs
- `firecrawl_crawl` - Crawl entire websites
- `firecrawl_map` - Discover URLs on a site
- `firecrawl_search` - Web search with content extraction
- `firecrawl_extract` - Extract structured data

</details>

<details>
<summary><b>Kilo IDE</b></summary>

### Running on Kilo IDE

Kilo IDE is an AI-powered code editor that supports MCP servers for enhanced functionality.

**Prerequisites:**
- Kilo IDE installed
- Node.js 18 or higher
- Firecrawl API key from [firecrawl.dev](https://www.firecrawl.dev/app/api-keys)

**Configuration:**

1. Open and install Kilo IDE
2. Navigate to **Settings**
3. Go to **MCP Server** section
4. Click **"click here"** option to add your MCP under Marketplace
5. This will open `mcp_settings.json`
6. Add the Firecrawl MCP configuration:

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "fc-YOUR_API_KEY"
      }
    }
  }
}
```

7. Save the `mcp_settings.json` file
8. Navigate to the **Installed** section under the MCP Server tab
9. You should now see Firecrawl MCP listed

**Verification:**
1. Go to Settings → MCP Server → Installed section
2. Look for Firecrawl MCP in the installed list
3. You should see all available Firecrawl tools
4. Test by using one of the tools in your workflow

**Available Tools:**
- `firecrawl_scrape` - Scrape single pages
- `firecrawl_batch_scrape` - Scrape multiple URLs
- `firecrawl_crawl` - Crawl entire websites
- `firecrawl_map` - Discover URLs on a site
- `firecrawl_search` - Web search with content extraction
- `firecrawl_extract` - Extract structured data

</details>

<details>
<summary><b>Roo Code</b></summary>

### Running on Roo Code

Roo Code is a VS Code extension that provides AI-powered coding assistance with MCP server support.

**Prerequisites:**
- VS Code or VS Code Insiders
- Roo Code extension installed from the VS Code marketplace
- Node.js 18 or higher
- Firecrawl API key from [firecrawl.dev](https://www.firecrawl.dev/app/api-keys)

**Configuration:**

1. Install and open the Roo Code extension
2. Navigate to **Settings**
3. Select **MCP Servers**
4. Click **"Edit global MCP"**
5. Add the Firecrawl MCP configuration:

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "fc-YOUR_API_KEY"
      }
    }
  }
}
```

6. Save the configuration file

**Verification:**
1. You will find the Firecrawl MCP server listed
2. Click on the dropdown option to view all available tools
3. You should see all Firecrawl tools including scrape, crawl, map, search, and extract
4. Test by using one of the tools in your workflow

**Available Tools:**
- `firecrawl_scrape` - Scrape single pages
- `firecrawl_batch_scrape` - Scrape multiple URLs
- `firecrawl_crawl` - Crawl entire websites
- `firecrawl_map` - Discover URLs on a site
- `firecrawl_search` - Web search with content extraction
- `firecrawl_extract` - Extract structured data

</details>

<details>
<summary><b>Qwen IDE</b></summary>

### Running on Qwen IDE

Qwen IDE is an AI-powered integrated development environment with built-in MCP server support.

**Prerequisites:**
- Qwen IDE installed
- Node.js 18 or higher
- Firecrawl API key from [firecrawl.dev](https://www.firecrawl.dev/app/api-keys)

**Configuration:**

**Method 1: Install from Official MCPs (Recommended)**

1. Install and open Qwen IDE
2. Click on **MCP** in the search box
3. Find Firecrawl under **Official MCPs**
4. Enable Firecrawl MCP
5. You will see Firecrawl MCP being enabled
6. You can also add mcp by clicking on **"Add MCP"** and then **"Add using JSON"** 
5. Add the Firecrawl MCP configuration:

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "fc-YOUR_API_KEY"
      }
    }
  }
}
```

6. Click **"Save and Enable"**
7. You will see Firecrawl MCP being enabled

**Verification:**
1. Check the MCP section in Qwen IDE
2. Firecrawl should be displayed as enabled
3. All available Firecrawl tools will be accessible
4. Test by using one of the tools in your workflow

**Available Tools:**
- `firecrawl_scrape` - Scrape single pages
- `firecrawl_batch_scrape` - Scrape multiple URLs
- `firecrawl_crawl` - Crawl entire websites
- `firecrawl_map` - Discover URLs on a site
- `firecrawl_search` - Web search with content extraction
- `firecrawl_extract` - Extract structured data

</details>

<details>
<summary><b>JetBrains AI Assistant</b></summary>

### Running on JetBrains AI Assistant

JetBrains AI Assistant is available across all JetBrains IDEs (IntelliJ IDEA, PyCharm, WebStorm, etc.) with MCP server support.

**Prerequisites:**
- JetBrains IDE installed (IntelliJ IDEA, PyCharm, WebStorm, etc.)
- JetBrains AI Assistant plugin enabled
- Node.js 18 or higher
- Firecrawl API key from [firecrawl.dev](https://www.firecrawl.dev/app/api-keys)

**Configuration:**

1. Download and set up your JetBrains IDE
2. Open the AI chatbox
3. Type `/` in the AI chatbox
4. Navigate to **"Add command"**
5. Click on **"Add server"**
6. Paste your Firecrawl MCP configuration:

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "fc-YOUR_API_KEY"
      }
    }
  }
}
```

7. Click **"Apply"**

**Verification:**
1. Head back to the AI chatbox
2. Type `/` again
3. You should see the list of Firecrawl tools available
4. All Firecrawl MCP tools will be listed in the command menu
5. Test by selecting one of the tools

**Available Tools:**
- `firecrawl_scrape` - Scrape single pages
- `firecrawl_batch_scrape` - Scrape multiple URLs
- `firecrawl_crawl` - Crawl entire websites
- `firecrawl_map` - Discover URLs on a site
- `firecrawl_search` - Web search with content extraction
- `firecrawl_extract` - Extract structured data

</details>

<details>
<summary><b>Trae</b></summary>

### Running on Trae

Trae is an AI-powered development environment with built-in MCP server support.

**Prerequisites:**
- Trae installed
- Node.js 18 or higher
- Firecrawl API key from [firecrawl.dev](https://www.firecrawl.dev/app/api-keys)

**Configuration:**

**Method 1: Install from Marketplace (Recommended)**

1. Install and open Trae
2. Navigate to **Settings**
3. Click on **MCPs**
4. Find Firecrawl in the Marketplace
5. Install Firecrawl MCP
6. You will see the tool displayed in the MCP section

**Method 2: Configure via JSON**

1. Install and open Trae
2. Navigate to **Settings**
3. Click on **MCPs**
4. Configure the JSON file by adding the Firecrawl MCP code:

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "fc-YOUR_API_KEY"
      }
    }
  }
}
```

5. Save the configuration
6. You will see the tool displayed in the MCP section

**Verification:**
1. Navigate to Settings → MCPs
2. You should see Firecrawl tools displayed in the MCP section
3. All available Firecrawl tools will be accessible
4. Test by using one of the tools in your workflow

**Available Tools:**
- `firecrawl_scrape` - Scrape single pages
- `firecrawl_batch_scrape` - Scrape multiple URLs
- `firecrawl_crawl` - Crawl entire websites
- `firecrawl_map` - Discover URLs on a site
- `firecrawl_search` - Web search with content extraction
- `firecrawl_extract` - Extract structured data

</details>

<details>
<summary><b>ZenCode</b></summary>

### Running on ZenCode

ZenCode is an AI-powered coding agent with built-in MCP server support.

**Prerequisites:**
- ZenCode installed and set up
- Firecrawl API key from [firecrawl.dev](https://www.firecrawl.dev/app/api-keys)

**Configuration:**

**Method 1: Install from MCP Library (Recommended)**

1. Open ZenCode agent
2. Complete the initial setup if this is your first time
3. Click the **`...`** (three dots) in the chat box on the top-right corner
4. Select **"Tools"**
5. Click on **"MCP Library"**
6. Search for **"Firecrawl"**
7. Click **"Install"** next to Firecrawl
8. Enter your Firecrawl API key when prompted

**Method 2: Manual Configuration via JSON**

1. Open ZenCode agent
2. Click on **"Settings"**
3. Search for **"MCP"** in the search box
4. Click on **"Edit settings.json"**
5. Add the Firecrawl MCP configuration:

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "fc-YOUR_API_KEY"
      }
    }
  }
}
```

6. Save the `settings.json` file

**Verification:**
1. Navigate to **Tools** section
2. Click on the **"Custom"** tab
3. You should see the Firecrawl MCP server listed
4. All Firecrawl tools will now be accessible through ZenCode
5. Test by asking ZenCode to scrape a webpage

**Available Tools:**
- `firecrawl_scrape` - Scrape single pages
- `firecrawl_batch_scrape` - Scrape multiple URLs
- `firecrawl_crawl` - Crawl entire websites
- `firecrawl_map` - Discover URLs on a site
- `firecrawl_search` - Web search with content extraction
- `firecrawl_extract` - Extract structured data

</details>

<details>
<summary><b>Copilot AI</b></summary>

### Running on Copilot AI

Copilot AI is an AI-powered assistant with built-in MCP server support.

**Prerequisites:**
- Copilot AI installed and set up
- Firecrawl API key from [firecrawl.dev](https://www.firecrawl.dev/app/api-keys)

**Configuration:**

1. Open Copilot AI
2. Complete the initial setup if this is your first time
3. Click **"Settings"** in the top-right corner
4. Navigate to **"MCP Server"** section
5. Scroll down to find **"Firecrawl"** in the MCP section
6. Click **"Install"** next to Firecrawl
7. Enter your Firecrawl API key when prompted
8. Firecrawl MCP will be installed automatically

**Verification:**
1. Return to the MCP Server settings
2. You should see Firecrawl listed as installed
3. All Firecrawl tools will now be accessible through Copilot AI
4. Test by asking Copilot to scrape a webpage

**Available Tools:**
- `firecrawl_scrape` - Scrape single pages
- `firecrawl_batch_scrape` - Scrape multiple URLs
- `firecrawl_crawl` - Crawl entire websites
- `firecrawl_map` - Discover URLs on a site
- `firecrawl_search` - Web search with content extraction
- `firecrawl_extract` - Extract structured data

</details>

<details>
<summary><b>LM Studio</b></summary>

### Running on LM Studio

LM Studio is a desktop application for running local LLMs with MCP server support.

**Prerequisites:**
- LM Studio installed ([Download](https://lmstudio.ai))
- Node.js 18 or higher
- Firecrawl API key from [firecrawl.dev](https://www.firecrawl.dev/app/api-keys)

**Configuration:**

1. Open LM Studio
2. Complete the initial setup if this is your first time
3. Click **"Show settings"** in the top-right corner
4. Navigate to the **"Program"** tab
5. Find the **"Install"** dropdown menu
6. Click the dropdown and select **"Edit mcp.json"**
7. Add the Firecrawl MCP configuration:

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "fc-YOUR_API_KEY"
      }
    }
  }
}
```

8. Save the file
9. Close the settings

**Verification:**
1. Go back to the **"Program"** tab in settings
2. Navigate to the **"Integration"** section
3. You should see `firecrawl` displayed in the MCP integrations list
4. All Firecrawl tools will be accessible through LM Studio

**Available Tools:**
- `firecrawl_scrape` - Scrape single pages
- `firecrawl_batch_scrape` - Scrape multiple URLs
- `firecrawl_crawl` - Crawl entire websites
- `firecrawl_map` - Discover URLs on a site
- `firecrawl_search` - Web search with content extraction
- `firecrawl_extract` - Extract structured data

</details>

<details>
<summary><b>Qodo</b></summary>

### Running on Qodo

Qodo is an AI-powered coding assistant with built-in MCP server support.

**Prerequisites:**
- Qodo installed and set up
- Firecrawl API key from [firecrawl.dev](https://www.firecrawl.dev/app/api-keys)

**Configuration:**

1. Open Qodo
2. Complete the initial setup if this is your first time
3. Click the **`...`** (three dots) in the top-right corner of your chatbox
4. Click **"Add MCP"**
5. Paste the Firecrawl MCP configuration:

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "fc-YOUR_API_KEY"
      }
    }
  }
}
```

6. Save the configuration

**Verification:**
1. Navigate to the **"Custom MCPs"** section
2. You should see Firecrawl MCP listed
3. All Firecrawl tools will now be accessible through Qodo
4. Test by asking Qodo to scrape a webpage

**Available Tools:**
- `firecrawl_scrape` - Scrape single pages
- `firecrawl_batch_scrape` - Scrape multiple URLs
- `firecrawl_crawl` - Crawl entire websites
- `firecrawl_map` - Discover URLs on a site
- `firecrawl_search` - Web search with content extraction
- `firecrawl_extract` - Extract structured data

</details>

### Terminal & CLI Tools

<details>
<summary><b>Gemini CLI</b></summary>

### Running on Gemini CLI

Gemini CLI is Google's command-line interface for interacting with Gemini AI models, with MCP server support.

**Prerequisites:**
- Terminal access
- Node.js 18 or higher
- Firecrawl API key from [firecrawl.dev](https://www.firecrawl.dev/app/api-keys)

**Configuration:**

1. Open your terminal
2. Install Gemini CLI (if not already installed)
3. Navigate to the Gemini configuration directory:
   ```bash
   cd ~/.gemini
   ```
4. Open `settings.json` file
5. Add the Firecrawl MCP configuration:

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "fc-YOUR_API_KEY"
      }
    }
  }
}
```

6. Save the `settings.json` file
7. Run Gemini CLI:
   ```bash
   gemini
   ```
8. Use the `/mcp list` command to display MCP tools

**Verification:**
1. After running `/mcp list` command in Gemini CLI
2. You should see Firecrawl MCP tools installed and displayed
3. All available Firecrawl tools will be listed
4. Test by using one of the tools in your Gemini CLI session

**Available Tools:**
- `firecrawl_scrape` - Scrape single pages
- `firecrawl_batch_scrape` - Scrape multiple URLs
- `firecrawl_crawl` - Crawl entire websites
- `firecrawl_map` - Discover URLs on a site
- `firecrawl_search` - Web search with content extraction
- `firecrawl_extract` - Extract structured data

</details>

<details>
<summary><b>Kiro CLI</b></summary>

### Running on Kiro CLI

Kiro CLI is a command-line interface that supports MCP server integration.

**Prerequisites:**
- Terminal access
- Node.js 18 or higher
- Firecrawl API key from [firecrawl.dev](https://www.firecrawl.dev/app/api-keys)

**Configuration:**

1. Install Kiro CLI (if not already installed)
2. Navigate to the Kiro settings directory:
   ```bash
   cd ~/.kiro/settings
   ```
3. Edit the `mcp.json` file:
   ```bash
   nano mcp.json
   # or use your preferred editor
   ```
4. Add the Firecrawl MCP configuration:

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "fc-YOUR_API_KEY"
      }
    }
  }
}
```

5. Save the `mcp.json` file
6. Run Kiro CLI:
   ```bash
   kiro-cli
   ```
7. Use the `/mcp` command to view all available tools

**Verification:**
1. After running `kiro-cli` command
2. The MCP servers will be displayed in the CLI
3. Use `/mcp` command to list all Firecrawl tools
4. All available Firecrawl tools will be accessible

**Available Tools:**
- `firecrawl_scrape` - Scrape single pages
- `firecrawl_batch_scrape` - Scrape multiple URLs
- `firecrawl_crawl` - Crawl entire websites
- `firecrawl_map` - Discover URLs on a site
- `firecrawl_search` - Web search with content extraction
- `firecrawl_extract` - Extract structured data

</details>

<details>
<summary><b>Crush CLI</b></summary>

### Running on Crush CLI

Crush CLI is a powerful command-line interface that supports MCP server integration.

**Prerequisites:**
- Terminal access
- Node.js 18 or higher
- Firecrawl API key from [firecrawl.dev](https://www.firecrawl.dev/app/api-keys)

**Configuration:**

1. Install Crush CLI (if not already installed)
2. Open the `crush.json` configuration file
3. Add the Firecrawl MCP configuration:

```json
{
  "mcp": {
    "firecrawl-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "fc-YOUR_API_KEY"
      }
    }
  }
}
```

4. Save the `crush.json` file
5. Run Crush CLI:
   ```bash
   crush
   ```

**Verification:**
1. Open Crush CLI
2. Navigate to the MCP section
3. You should see `firecrawl-mcp` listed under available MCP servers
4. All Firecrawl tools will be accessible through Crush CLI

**Available Tools:**
- `firecrawl_scrape` - Scrape single pages
- `firecrawl_batch_scrape` - Scrape multiple URLs
- `firecrawl_crawl` - Crawl entire websites
- `firecrawl_map` - Discover URLs on a site
- `firecrawl_search` - Web search with content extraction
- `firecrawl_extract` - Extract structured data

</details>

<details>
<summary><b>Warp</b></summary>

### Running on Warp

Warp is a modern, AI-powered terminal with built-in MCP server support.

**Prerequisites:**
- Warp terminal installed ([Download](https://www.warp.dev))
- Node.js 18 or higher
- Firecrawl API key from [firecrawl.dev](https://www.firecrawl.dev/app/api-keys)

**Configuration:**

1. Open Warp terminal
2. Navigate to **Settings** (click the gear icon or use `Cmd/Ctrl + ,`)
3. Go to **MCP Servers** section
4. Click the **"+ Add"** button
5. Paste the following configuration with your API key:

```json
{
  "servers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "fc-YOUR_API_KEY"
      }
    }
  }
}
```

6. Save the configuration

**Verification:**
1. Check the **Installed** section in MCP Servers settings
2. You should see the Firecrawl MCP server listed
3. In Warp's AI features, you can now ask: "Use Firecrawl to scrape https://example.com"
4. The Warp AI should use Firecrawl tools to fetch and display the content

**Available Tools:**
Warp's AI can now access all Firecrawl tools including scrape, crawl, map, search, and extract for terminal-based web scraping and content extraction.

</details>

### Automation & Workflow Platforms

<details>
<summary><b>n8n</b></summary>

### Running on n8n

n8n requires HTTP transport mode since it connects to MCP servers via HTTP endpoints.

**Configuration:**

1. Start the Firecrawl MCP server in HTTP mode:

```bash
env HTTP_STREAMABLE_SERVER=true \
  FIRECRAWL_API_KEY=fc-YOUR_API_KEY \
  npx -y firecrawl-mcp
```

For self-hosted Firecrawl instances, also set `FIRECRAWL_API_URL`:

```bash
env HTTP_STREAMABLE_SERVER=true \
  FIRECRAWL_API_KEY=fc-YOUR_API_KEY \
  FIRECRAWL_API_URL=https://your-firecrawl-instance.com \
  npx -y firecrawl-mcp
```

2. The server will start at `http://localhost:3000/mcp`

**Using in n8n Workflows:**

1. In your n8n workflow, add an HTTP Request node or MCP connector node
2. Set the endpoint to: `http://localhost:3000/mcp`
3. Configure authentication with your Firecrawl API key if needed
4. You can now use Firecrawl tools in your automation workflows

**Use Cases:**
- Automated web scraping workflows
- Scheduled content monitoring
- Data extraction pipelines
- Integration with other n8n services (databases, notifications, etc.)

**Note:** For production deployments, consider running the MCP server as a service and using proper API authentication.

</details>

### Alternative Runtimes

<details>
<summary><b>Bun Runtime</b></summary>

### Running with Bun Runtime

Run Firecrawl MCP server using Bun as an alternative to Node.js.

**Prerequisites:**
- Bun runtime installed ([Download](https://bun.sh))
- Firecrawl API key from [firecrawl.dev](https://www.firecrawl.dev/app/api-keys)

**Configuration:**

1. Open your preferred IDE or editor
2. Navigate to the MCP configuration section
3. Edit the JSON file and add the Firecrawl configuration with Bun:

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "bunx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "fc-YOUR_API_KEY"
      }
    }
  }
}
```

4. Save the configuration file

**Verification:**
1. Restart your IDE or reload the MCP configuration
2. Check that Firecrawl MCP server is running with Bun
3. All Firecrawl tools should be available
4. Test by using one of the tools

**Available Tools:**
- `firecrawl_scrape` - Scrape single pages
- `firecrawl_batch_scrape` - Scrape multiple URLs
- `firecrawl_crawl` - Crawl entire websites
- `firecrawl_map` - Discover URLs on a site
- `firecrawl_search` - Web search with content extraction
- `firecrawl_extract` - Extract structured data

</details>

<details>
<summary><b>Deno Runtime</b></summary>

### Running with Deno Runtime

Run Firecrawl MCP server using Deno as an alternative to Node.js.

**Prerequisites:**
- Deno runtime installed ([Download](https://deno.land))
- Firecrawl API key from [firecrawl.dev](https://www.firecrawl.dev/app/api-keys)

**Configuration:**

1. Open your preferred IDE or editor
2. Navigate to the MCP configuration section
3. Edit the JSON file and add the Firecrawl configuration with Deno:

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "deno",
      "args": ["run", "--allow-all", "npm:firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "fc-YOUR_API_KEY"
      }
    }
  }
}
```

4. Save the configuration file

**Verification:**
1. Restart your IDE or reload the MCP configuration
2. Check that Firecrawl MCP server is running with Deno
3. All Firecrawl tools should be available
4. Test by using one of the tools

**Available Tools:**
- `firecrawl_scrape` - Scrape single pages
- `firecrawl_batch_scrape` - Scrape multiple URLs
- `firecrawl_crawl` - Crawl entire websites
- `firecrawl_map` - Discover URLs on a site
- `firecrawl_search` - Web search with content extraction
- `firecrawl_extract` - Extract structured data

</details>

### Advanced Deployments

<details>
<summary><b>Streamable HTTP (Local Server Mode)</b></summary>

### Running with Streamable HTTP Local Mode

To run the server using Streamable HTTP locally instead of the default stdio transport:

```bash
env HTTP_STREAMABLE_SERVER=true FIRECRAWL_API_KEY=fc-YOUR_API_KEY npx -y firecrawl-mcp
```

Use the url: http://localhost:3000/mcp

</details>

<details>
<summary><b>Smithery (Package Manager)</b></summary>

### Installing via Smithery (Legacy)

To install Firecrawl for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@mendableai/mcp-server-firecrawl):

```bash
npx -y @smithery/cli install @mendableai/mcp-server-firecrawl --client claude
```

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
  - For one: use **scrape**
  - For many: use **batch_scrape**
- **If you need to discover URLs on a site:** use **map**
- **If you want to search the web for info:** use **search**
- **If you want to extract structured data:** use **extract**
- **If you want to analyze a whole site or section:** use **crawl** (with limits!)

### Quick Reference Table

| Tool         | Best for                            | Returns         |
| ------------ | ----------------------------------- | --------------- |
| scrape       | Single page content                 | markdown/html   |
| batch_scrape | Multiple known URLs                 | markdown/html[] |
| map          | Discovering URLs on a site          | URL[]           |
| crawl        | Multi-page extraction (with limits) | markdown/html[] |
| search       | Web search for info                 | results[]       |
| extract      | Structured data from pages          | JSON            |

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
