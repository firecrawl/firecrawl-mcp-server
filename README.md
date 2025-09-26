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

### Prerequisites

- Node.js (version 18.0.0 or higher)
- npm or yarn package manager
- Firecrawl API Key from [https://www.firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)

### Quick Start

```bash
# Using npx (recommended)
env FIRECRAWL_API_KEY=fc-YOUR_API_KEY npx -y firecrawl-mcp

# Or install globally
npm install -g firecrawl-mcp
```

### Platform Installation Guides

<details>
<summary><img src="https://claude.ai/favicon.ico" width="16" height="16" alt="Claude" style="vertical-align: middle; margin-right: 8px;"> <strong>Claude Desktop</strong></summary>

**Location of config file:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/claude/claude_desktop_config.json`

**Configuration:**
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

**Restart Claude Desktop after adding the configuration.**

</details>

<details>
<summary><img src="https://www.cursor.com/favicon.ico" width="16" height="16" alt="Cursor" style="vertical-align: middle; margin-right: 8px;"> <strong>Cursor</strong></summary>

**Cursor v0.48.6+:**
1. Open Cursor Settings (`Cmd/Ctrl + ,`)
2. Go to Features → MCP Servers
3. Click "+ Add new global MCP server"
4. Enter the following:

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

**Cursor v0.45.6:**
1. Open Cursor Settings
2. Go to Features → MCP Servers
3. Click "+ Add New MCP Server"
4. Enter:
   - Name: `firecrawl-mcp`
   - Type: `command`
   - Command: `env FIRECRAWL_API_KEY=fc-YOUR_API_KEY npx -y firecrawl-mcp`

**Windows users:** Use `cmd /c "set FIRECRAWL_API_KEY=fc-YOUR_API_KEY && npx -y firecrawl-mcp"`

</details>

<details>
<summary><img src="https://windsurf.com/favicon.svg" width="16" height="16" alt="Windsurf" style="vertical-align: middle; margin-right: 8px;"> <strong>Windsurf</strong></summary>

**Location:** `~/.codeium/windsurf/model_config.json`

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

**Restart Windsurf after adding configuration.**

</details>

<details>
<summary><img src="https://code.visualstudio.com/favicon.ico" width="16" height="16" alt="VS Code" style="vertical-align: middle; margin-right: 8px;"> <strong>VS Code</strong></summary>

**One-click install:**

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat-square&logo=visualstudiocode)](https://vscode.dev/redirect/mcp/install?name=firecrawl&inputs=%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22apiKey%22%2C%22description%22%3A%22Firecrawl%20API%20Key%22%2C%22password%22%3Atrue%7D%5D&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22firecrawl-mcp%22%5D%2C%22env%22%3A%7B%22FIRECRAWL_API_KEY%22%3A%22%24%7Binput%3AapiKey%7D%22%7D%7D)

**Manual setup:**
1. Open User Settings (`Ctrl/Cmd + Shift + P` → "Preferences: Open User Settings (JSON)")
2. Add:

```json
{
  "mcp": {
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
}
```

**Workspace config (`.vscode/mcp.json`):**
```json
{
  "servers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "${env:FIRECRAWL_API_KEY}"
      }
    }
  }
}
```

</details>

<details>
<summary><img src="https://marketplace.visualstudio.com/favicon.ico" width="16" height="16" alt="Cline" style="vertical-align: middle; margin-right: 8px;"> <strong>Cline</strong></summary>

1. Install Cline extension in VS Code
2. Open Cline settings (`Cmd/Ctrl + Shift + P` → "Cline: Open Settings")
3. Add:

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

</details>

<details>
<summary><img src="https://zed.dev/favicon_black_16.png" width="16" height="16" alt="Zed" style="vertical-align: middle; margin-right: 8px;"> <strong>Zed</strong></summary>

1. Open Zed settings (`Cmd/Ctrl + ,`)
2. Navigate to Extensions → MCP
3. Add:

```json
{
  "mcp": {
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
}
```

</details>

<details>
<summary><img src="https://www.jetbrains.com/favicon.ico" width="16" height="16" alt="JetBrains IDEs" style="vertical-align: middle; margin-right: 8px;"> <strong>JetBrains IDEs (IntelliJ IDEA / PyCharm / WebStorm / Android Studio)</strong></summary>

**For JetBrains IDEs 2025.2+ with GitHub Copilot:**

1. Open Settings → Tools → GitHub Copilot → MCP Servers
2. Add new server:

```yaml
name: firecrawl
type: command
command: npx -y firecrawl-mcp
environment:
  FIRECRAWL_API_KEY: fc-YOUR_API_KEY
```

**Project config (`.idea/mcp.xml`):**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<project version="4">
  <component name="MCPSettings">
    <servers>
      <server name="firecrawl">
        <option name="command" value="npx" />
        <option name="args">
          <list>
            <option value="-y" />
            <option value="firecrawl-mcp" />
          </list>
        </option>
        <option name="env">
          <map>
            <entry key="FIRECRAWL_API_KEY" value="fc-YOUR_API_KEY" />
          </map>
        </option>
      </server>
    </servers>
  </component>
</project>
```

</details>

<details>
<summary><img src="https://cdn.prod.website-files.com/663e06c56841363663ffbbcf/664c918ec47bacdd3acdc167_favicon%408x.png" width="16" height="16" alt="Continue.dev" style="vertical-align: middle; margin-right: 8px;"> <strong>Continue.dev</strong></summary>

1. Install Continue extension
2. Open Continue config (gear icon → "Open config.json")
3. Location: `~/.continue/config.json`
4. Add:

```json
{
  "models": [...],
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

</details>

<details>
<summary><img src="https://github.githubassets.com/favicons/favicon.svg" width="16" height="16" alt="GitHub Copilot" style="vertical-align: middle; margin-right: 8px;"> <strong>GitHub Copilot</strong></summary>

**VS Code:**
```json
{
  "github.copilot.chat.mcpServers": {
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

**JetBrains IDEs:** Follow IntelliJ IDEA instructions above.

</details>

<details>
<summary><img src="https://neovim.io/logos/neovim-mark-flat.png" width="16" height="16" alt="Neovim" style="vertical-align: middle; margin-right: 8px;"> <strong>Neovim</strong></summary>

**Prerequisites:** Neovim 0.10.0+, Node.js

**Plugin installation (lazy.nvim):**
```lua
-- ~/.config/nvim/lua/plugins/mcp.lua
return {
  "sourcegraph/mcp.nvim",
  config = function()
    require("mcp").setup({
      servers = {
        firecrawl = {
          command = "npx",
          args = { "-y", "firecrawl-mcp" },
          env = {
            FIRECRAWL_API_KEY = "fc-YOUR_API_KEY"
          }
        }
      }
    })
  end
}
```

</details>

<details>
<summary><img src="https://www.gnu.org/software/emacs/favicon.png" width="16" height="16" alt="Emacs" style="vertical-align: middle; margin-right: 8px;"> <strong>Emacs</strong></summary>

**Prerequisites:** Emacs 29+

**Package installation:**
```elisp
;; Using use-package
(use-package mcp
  :ensure t
  :config
  (add-to-list 'mcp-server-configurations
    '(firecrawl . ((command . "npx -y firecrawl-mcp")
                   (env . ((FIRECRAWL_API_KEY . "fc-YOUR_API_KEY")))))))
```

</details>

<details>
<summary><img src="https://www.docker.com/favicon.ico" width="16" height="16" alt="Docker" style="vertical-align: middle; margin-right: 8px;"> <strong>Docker</strong></summary>

**Dockerfile:**
```dockerfile
FROM node:18-alpine
WORKDIR /app
RUN npm install -g firecrawl-mcp
ENV FIRECRAWL_API_KEY=""
CMD ["firecrawl-mcp"]
```

**Build and run:**
```bash
docker build -t firecrawl-mcp .
docker run -e FIRECRAWL_API_KEY=fc-YOUR_API_KEY firecrawl-mcp
```

**Docker Compose:**
```yaml
version: '3.8'
services:
  firecrawl-mcp:
    image: firecrawl-mcp
    environment:
      - FIRECRAWL_API_KEY=fc-YOUR_API_KEY
    restart: unless-stopped
```

</details>

<details>
<summary><img src="https://raw.githubusercontent.com/kubernetes/kubernetes/master/logo/logo.png" width="16" height="16" alt="Kubernetes" style="vertical-align: middle; margin-right: 8px;"> <strong>Kubernetes</strong></summary>

**Create secret:**
```bash
kubectl create secret generic firecrawl-secret \
  --from-literal=api-key=fc-YOUR_API_KEY
```

**Deployment:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: firecrawl-mcp
spec:
  replicas: 1
  selector:
    matchLabels:
      app: firecrawl-mcp
  template:
    metadata:
      labels:
        app: firecrawl-mcp
    spec:
      containers:
      - name: firecrawl-mcp
        image: node:18-alpine
        command: ["npx", "-y", "firecrawl-mcp"]
        env:
        - name: FIRECRAWL_API_KEY
          valueFrom:
            secretKeyRef:
              name: firecrawl-secret
              key: api-key
```

</details>

<details>
<summary><img src="https://cdn.replit.com/dotcom/favicon-196.png" width="16" height="16" alt="Replit" style="vertical-align: middle; margin-right: 8px;"> <strong>Replit</strong></summary>

**Create `.replit` file:**
```toml
run = "npx -y firecrawl-mcp"

[env]
FIRECRAWL_API_KEY = "fc-YOUR_API_KEY"

[nix]
channel = "stable-24_11"

[deployment]
run = ["sh", "-c", "npx -y firecrawl-mcp"]
```

Add `FIRECRAWL_API_KEY` to Secrets tab.

</details>

<details>
<summary><img src="https://claude.ai/favicon.ico" width="16" height="16" alt="Claude Code CLI" style="vertical-align: middle; margin-right: 8px;"> <strong>Claude Code CLI</strong></summary>

**Setup:**
```bash
export FIRECRAWL_API_KEY="fc-YOUR_API_KEY"
claude-code --mcp "npx -y firecrawl-mcp"
```

**Config file (`~/.claude-code/config.json`):**
```json
{
  "mcpServers": [
    {
      "name": "firecrawl",
      "command": "npx -y firecrawl-mcp"
    }
  ]
}
```

</details>

<details>
<summary><img src="https://augmentcode.com/favicon.ico" width="16" height="16" alt="Augment Code" style="vertical-align: middle; margin-right: 8px;"> <strong>Augment Code</strong></summary>

1. Open Augment settings
2. Navigate to Extensions → MCP

**Configuration:**
```yaml
servers:
  - name: firecrawl
    command: npx -y firecrawl-mcp
    env:
      FIRECRAWL_API_KEY: fc-YOUR_API_KEY
```

</details>

<details>
<summary><img src="https://avatars.githubusercontent.com/u/211522643?s=200&v=4" width="16" height="16" alt="Roo Code" style="vertical-align: middle; margin-right: 8px;"> <strong>Roo Code</strong></summary>

**Location:** `~/.roo/mcp-config.json`

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

</details>

<details>
<summary><img src="https://opencode.ai/favicon.svg" width="16" height="16" alt="Opencode" style="vertical-align: middle; margin-right: 8px;"> <strong>Opencode</strong></summary>

1. Open Opencode preferences
2. Navigate to MCP Servers

**Configuration:**
```toml
[servers.firecrawl]
command = "npx"
args = ["-y", "firecrawl-mcp"]

[servers.firecrawl.env]
FIRECRAWL_API_KEY = "fc-YOUR_API_KEY"
```

</details>

<details>
<summary><img src="https://www.gstatic.com/lamda/images/gemini_sparkle_v002_d4735304ff6292a690345.svg" width="16" height="16" alt="Gemini CLI" style="vertical-align: middle; margin-right: 8px;"> <strong>Gemini CLI</strong></summary>

**Environment setup:**
```bash
export FIRECRAWL_API_KEY="fc-YOUR_API_KEY"
```

**Run with MCP:**
```bash
gemini --mcp-server "npx -y firecrawl-mcp" "Scrape example.com"
```

**Config file (`~/.gemini/config.yaml`):**
```yaml
mcp_servers:
  firecrawl:
    command: npx -y firecrawl-mcp
    env:
      FIRECRAWL_API_KEY: ${FIRECRAWL_API_KEY}
```

</details>


<details>
<summary><img src="https://codegpt.co/favicon.ico" width="16" height="16" alt="CodeGPT" style="vertical-align: middle; margin-right: 8px;"> <strong>CodeGPT</strong></summary>

1. Open CodeGPT settings
2. Navigate to MCP Servers

**Configuration:**
```json
{
  "codegpt.mcpServers": [
    {
      "name": "firecrawl",
      "command": "npx -y firecrawl-mcp",
      "env": {
        "FIRECRAWL_API_KEY": "fc-YOUR_API_KEY"
      }
    }
  ]
}
```

</details>

<details>
<summary><img src="https://aws.amazon.com/favicon.ico" width="16" height="16" alt="AWS Lambda" style="vertical-align: middle; margin-right: 8px;"> <strong>AWS Lambda</strong></summary>

**package.json:**
```json
{
  "dependencies": {
    "firecrawl-mcp": "latest"
  }
}
```

**Lambda handler:**
```javascript
const { FirecrawlMCP } = require('firecrawl-mcp');

exports.handler = async (event) => {
  const mcp = new FirecrawlMCP({
    apiKey: process.env.FIRECRAWL_API_KEY
  });
  return await mcp.handle(event);
};
```

**Deploy:**
```bash
zip -r function.zip .
aws lambda create-function \
  --function-name firecrawl-mcp \
  --runtime nodejs18.x \
  --handler index.handler \
  --environment Variables={FIRECRAWL_API_KEY=fc-YOUR_API_KEY}
```

</details>

<details>
<summary><img src="https://azure.microsoft.com/favicon.ico" width="16" height="16" alt="Azure Functions" style="vertical-align: middle; margin-right: 8px;"> <strong>Azure Functions</strong></summary>

**Create function:**
```bash
func init FirecrawlMCP --javascript
cd FirecrawlMCP
npm install firecrawl-mcp
```

**Function code:**
```javascript
module.exports = async function (context, req) {
  const { FirecrawlMCP } = require('firecrawl-mcp');
  const mcp = new FirecrawlMCP({
    apiKey: process.env.FIRECRAWL_API_KEY
  });
  // Implementation
};
```

**Deploy:**
```bash
func azure functionapp publish FirecrawlMCP
```

</details>

<details>
<summary><img src="https://cloud.google.com/favicon.ico" width="16" height="16" alt="Google Cloud Functions" style="vertical-align: middle; margin-right: 8px;"> <strong>Google Cloud Functions</strong></summary>

**index.js:**
```javascript
const { FirecrawlMCP } = require('firecrawl-mcp');

exports.firecrawlMCP = async (req, res) => {
  const mcp = new FirecrawlMCP({
    apiKey: process.env.FIRECRAWL_API_KEY
  });
  // Implementation
};
```

**Deploy:**
```bash
gcloud functions deploy firecrawl-mcp \
  --runtime nodejs18 \
  --trigger-http \
  --set-env-vars FIRECRAWL_API_KEY=fc-YOUR_API_KEY
```

</details>

<details>
<summary><img src="https://slack.com/favicon.ico" width="16" height="16" alt="Slack Bot" style="vertical-align: middle; margin-right: 8px;"> <strong>Slack Bot</strong></summary>

**Bot implementation:**
```javascript
const { App } = require('@slack/bolt');
const { FirecrawlMCP } = require('firecrawl-mcp');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET
});

const firecrawl = new FirecrawlMCP({
  apiKey: process.env.FIRECRAWL_API_KEY
});

app.command('/scrape', async ({ command, ack, respond }) => {
  await ack();
  const result = await firecrawl.scrape(command.text);
  await respond(result);
});

app.start();
```

</details>

<details>
<summary><img src="https://cdn.prod.website-files.com/6257adef93867e50d84d30e2/6266bc493fb42d4e27bb8393_847541504914fd33810e70a0ea73177e.ico" width="16" height="16" alt="Discord Bot" style="vertical-align: middle; margin-right: 8px;"> <strong>Discord Bot</strong></summary>

**Bot setup:**
```javascript
const { Client, Intents } = require('discord.js');
const { FirecrawlMCP } = require('firecrawl-mcp');

const client = new Client({ intents: [Intents.FLAGS.GUILDS] });
const firecrawl = new FirecrawlMCP({
  apiKey: process.env.FIRECRAWL_API_KEY
});

client.on('messageCreate', async (message) => {
  if (message.content.startsWith('!scrape ')) {
    const url = message.content.slice(8);
    const result = await firecrawl.scrape(url);
    message.reply(result);
  }
});

client.login(process.env.DISCORD_TOKEN);
```

</details>

<details>
<summary><img src="https://www.google.com/favicon.ico" width="16" height="16" alt="Chrome Extension" style="vertical-align: middle; margin-right: 8px;"> <strong>Chrome Extension</strong></summary>

**manifest.json:**
```json
{
  "manifest_version": 3,
  "name": "Firecrawl MCP",
  "version": "1.0",
  "permissions": ["storage", "activeTab"],
  "host_permissions": ["https://api.firecrawl.dev/*"],
  "background": {
    "service_worker": "background.js"
  }
}
```

**background.js:**
```javascript
const FIRECRAWL_API_KEY = 'fc-YOUR_API_KEY';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scrape') {
    fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ url: request.url })
    }).then(response => response.json())
      .then(data => sendResponse(data));
    return true;
  }
});
```

</details>

<details>
<summary><img src="https://developer.apple.com/favicon.ico" width="16" height="16" alt="iOS (Swift)" style="vertical-align: middle; margin-right: 8px;"> <strong>iOS (Swift)</strong></summary>

**Swift Package Manager:**
```swift
// Package.swift
dependencies: [
    .package(url: "https://github.com/firecrawl/firecrawl-mcp-swift", from: "1.0.0")
]
```

**Initialize in app:**
```swift
import FirecrawlMCP

class MCPManager {
    let firecrawl = FirecrawlMCPServer(
        apiKey: "fc-YOUR_API_KEY"
    )

    func start() {
        firecrawl.start()
    }
}
```

</details>

<details>
<summary><img src="https://developer.android.com/favicon.ico" width="16" height="16" alt="Android" style="vertical-align: middle; margin-right: 8px;"> <strong>Android</strong></summary>

**Gradle dependency:**
```gradle
dependencies {
    implementation 'com.firecrawl:mcp-android:1.0.0'
}
```

**Initialize:**
```kotlin
import com.firecrawl.mcp.FirecrawlMCP

class MainActivity : AppCompatActivity() {
    private lateinit var firecrawlMCP: FirecrawlMCP

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        firecrawlMCP = FirecrawlMCP.Builder()
            .apiKey("fc-YOUR_API_KEY")
            .build()
    }
}
```

</details>


### Installing via Smithery (Legacy)

To install Firecrawl for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@mendableai/mcp-server-firecrawl):

```bash
npx -y @smithery/cli install @mendableai/mcp-server-firecrawl --client claude
```


### Running with SSE Local Mode

To run the server using Server-Sent Events (SSE) locally instead of the default stdio transport:

```bash
env SSE_LOCAL=true FIRECRAWL_API_KEY=fc-YOUR_API_KEY npx -y firecrawl-mcp
```

Use the url: http://localhost:3000/sse

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

| Tool                | Best for                                 | Returns         |
|---------------------|------------------------------------------|-----------------|
| scrape              | Single page content                      | markdown/html   |
| batch_scrape        | Multiple known URLs                      | markdown/html[] |
| map                 | Discovering URLs on a site               | URL[]           |
| crawl               | Multi-page extraction (with limits)      | markdown/html[] |
| search              | Web search for info                      | results[]       |
| extract             | Structured data from pages               | JSON            |

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
