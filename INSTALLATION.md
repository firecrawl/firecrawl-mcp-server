<div align="center">
  <img
    src="https://raw.githubusercontent.com/firecrawl/firecrawl-mcp-server/main/img/fire.png"
    height="140"
    alt="Firecrawl Logo"
  >
  <h1>Firecrawl MCP Server Installation Guide</h1>
  <p>Connect Firecrawl's powerful web scraping capabilities to your favorite MCP-compatible tools</p>
</div>

---

## Quick Setup

The Firecrawl MCP server can be used in two ways:

**Remote Server** (Recommended):
- Uses `https://mcp.firecrawl.dev` for hassle-free setup
- No local installation required
- Requires Firecrawl API key

**Local Server**:
- Runs `npx -y firecrawl-mcp` locally
- Full control over server instance
- Requires Node.js and npm

Get your API key at [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)

---

## MCP Clients

<details>
<summary><img src="https://claude.ai/favicon.ico" width="16" height="16" alt="Claude" style="vertical-align: middle; margin-right: 8px;"> <strong>Claude Desktop</strong></summary>

**Location of config file:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

**Remote server (recommended):**
```json
{
  "mcpServers": {
    "firecrawl": {
      "url": "https://mcp.firecrawl.dev",
      "headers": {
        "X-API-Key": "YOUR_API_KEY"
      }
    }
  }
}
```

**Local server:**
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

</details>

<details>
<summary><img src="https://www.cursor.com/favicon.ico" width="16" height="16" alt="Cursor" style="vertical-align: middle; margin-right: 8px;"> <strong>Cursor</strong></summary>

**Cursor v0.48.6+:**
1. Open Cursor Settings (`Cmd/Ctrl + ,`)
2. Go to Features → MCP Servers
3. Click "+ Add new global MCP server"

**Remote server (recommended):**
```json
{
  "mcpServers": {
    "firecrawl": {
      "url": "https://mcp.firecrawl.dev",
      "headers": {
        "X-API-Key": "YOUR_API_KEY"
      }
    }
  }
}
```

**Local server:**
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

**Cursor v0.45.6:**
- Name: `firecrawl`
- Command: `env FIRECRAWL_API_KEY=YOUR_API_KEY npx -y firecrawl-mcp`

</details>

<details>
<summary><img src="https://claude.ai/favicon.ico" width="16" height="16" alt="Claude" style="vertical-align: middle; margin-right: 8px;"> <strong>Claude Code CLI</strong></summary>

**Setup:**
```bash
export FIRECRAWL_API_KEY="YOUR_API_KEY"
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
<summary><img src="https://windsurf.com/favicon.svg" width="16" height="16" alt="Windsurf" style="vertical-align: middle; margin-right: 8px;"> <strong>Windsurf</strong></summary>

**Location:** `~/.codeium/windsurf/model_config.json`

**Remote server (recommended):**
```json
{
  "mcpServers": {
    "firecrawl": {
      "url": "https://mcp.firecrawl.dev",
      "headers": {
        "X-API-Key": "YOUR_API_KEY"
      }
    }
  }
}
```

**Local server:**
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

</details>

<details>
<summary><img src="https://code.visualstudio.com/favicon.ico" width="16" height="16" alt="VS Code" style="vertical-align: middle; margin-right: 8px;"> <strong>VS Code</strong></summary>

**One-click install:**

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat-square&logo=visualstudiocode)](https://vscode.dev/redirect/mcp/install?name=firecrawl&inputs=%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22apiKey%22%2C%22description%22%3A%22Firecrawl%20API%20Key%22%2C%22password%22%3Atrue%7D%5D&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22firecrawl-mcp%22%5D%2C%22env%22%3A%7B%22FIRECRAWL_API_KEY%22%3A%22%24%7Binput%3AapiKey%7D%22%7D%7D)

**Manual setup:**
1. Open User Settings (`Ctrl/Cmd + Shift + P` → "Preferences: Open User Settings (JSON)")

**Remote server (recommended):**
```json
{
  "mcp": {
    "servers": {
      "firecrawl": {
        "url": "https://mcp.firecrawl.dev",
        "headers": {
          "X-API-Key": "YOUR_API_KEY"
        }
      }
    }
  }
}
```

**Local server:**
```json
{
  "mcp": {
    "servers": {
      "firecrawl": {
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

**Remote server (recommended):**
```json
{
  "cline.mcpServers": {
    "firecrawl": {
      "url": "https://mcp.firecrawl.dev",
      "headers": {
        "X-API-Key": "YOUR_API_KEY"
      }
    }
  }
}
```

**Local server:**
```json
{
  "cline.mcpServers": {
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

</details>

<details>
<summary><img src="https://zed.dev/favicon_black_16.png" width="16" height="16" alt="Zed" style="vertical-align: middle; margin-right: 8px;"> <strong>Zed</strong></summary>

1. Open Zed settings (`Cmd/Ctrl + ,`)
2. Navigate to Extensions → MCP

**Remote server (recommended):**
```json
{
  "mcp": {
    "servers": {
      "firecrawl": {
        "url": "https://mcp.firecrawl.dev",
        "headers": {
          "X-API-Key": "YOUR_API_KEY"
        }
      }
    }
  }
}
```

**Local server:**
```json
{
  "mcp": {
    "servers": {
      "firecrawl": {
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

</details>

<details>
<summary><img src="https://augmentcode.com/favicon.ico" width="16" height="16" alt="Augment Code" style="vertical-align: middle; margin-right: 8px;"> <strong>Augment Code</strong></summary>

1. Open Augment settings
2. Navigate to Extensions → MCP

**Configuration:**
```yaml
servers:
  - name: firecrawl
    url: https://mcp.firecrawl.dev
    headers:
      X-API-Key: YOUR_API_KEY
```

**Local server:**
```yaml
servers:
  - name: firecrawl
    command: npx -y firecrawl-mcp
    env:
      FIRECRAWL_API_KEY: YOUR_API_KEY
```

</details>

<details>
<summary><img src="https://avatars.githubusercontent.com/u/211522643?s=200&v=4" width="16" height="16" alt="Roo Code" style="vertical-align: middle; margin-right: 8px;"> <strong>Roo Code</strong></summary>

**Location:** `~/.roo/mcp-config.json`

**Remote server (recommended):**
```json
{
  "servers": {
    "firecrawl": {
      "url": "https://mcp.firecrawl.dev",
      "headers": {
        "X-API-Key": "YOUR_API_KEY"
      }
    }
  }
}
```

**Local server:**
```json
{
  "servers": {
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

</details>

<details>
<summary><img src="https://opencode.ai/favicon.svg" width="16" height="16" alt="Opencode" style="vertical-align: middle; margin-right: 8px;"> <strong>Opencode</strong></summary>

1. Open Opencode preferences
2. Navigate to MCP Servers

**Remote server (recommended):**
```toml
[servers.firecrawl]
url = "https://mcp.firecrawl.dev"

[servers.firecrawl.headers]
X-API-Key = "YOUR_API_KEY"
```

**Local server:**
```toml
[servers.firecrawl]
command = "npx"
args = ["-y", "firecrawl-mcp"]

[servers.firecrawl.env]
FIRECRAWL_API_KEY = "YOUR_API_KEY"
```

</details>

<details>
<summary><img src="https://www.gstatic.com/lamda/images/gemini_sparkle_v002_d4735304ff6292a690345.svg" width="16" height="16" alt="Gemini" style="vertical-align: middle; margin-right: 8px;"> <strong>Gemini CLI</strong></summary>

**Environment setup:**
```bash
export FIRECRAWL_API_KEY="YOUR_API_KEY"
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
<summary><img src="https://www.jetbrains.com/favicon.ico" width="16" height="16" alt="IntelliJ IDEA" style="vertical-align: middle; margin-right: 8px;"> <strong>IntelliJ IDEA</strong></summary>

**IntelliJ IDEA 2025.2+ with GitHub Copilot:**

1. Open Settings → Tools → GitHub Copilot → MCP Servers
2. Add new server

**Configuration:**
```yaml
name: firecrawl
type: command
command: npx -y firecrawl-mcp
environment:
  FIRECRAWL_API_KEY: YOUR_API_KEY
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
            <entry key="FIRECRAWL_API_KEY" value="YOUR_API_KEY" />
          </map>
        </option>
      </server>
    </servers>
  </component>
</project>
```

</details>

<details>
<summary><img src="https://resources.jetbrains.com/storage/products/pycharm/img/meta/pycharm_logo_300x300.png" width="16" height="16" alt="PyCharm" style="vertical-align: middle; margin-right: 8px;"> <strong>PyCharm</strong></summary>

Same as IntelliJ IDEA configuration above.

</details>

<details>
<summary><img src="https://resources.jetbrains.com/storage/products/webstorm/img/meta/webstorm_logo_300x300.png" width="16" height="16" alt="WebStorm" style="vertical-align: middle; margin-right: 8px;"> <strong>WebStorm</strong></summary>

Same as IntelliJ IDEA configuration above.

</details>

<details>
<summary><img src="https://developer.android.com/favicon.ico" width="16" height="16" alt="Android Studio" style="vertical-align: middle; margin-right: 8px;"> <strong>Android Studio</strong></summary>

Same as IntelliJ IDEA configuration, adapted for Android Studio's settings location.

</details>

<details>
<summary><img src="https://cdn.prod.website-files.com/663e06c56841363663ffbbcf/664c918ec47bacdd3acdc167_favicon%408x.png" width="16" height="16" alt="Continue.dev" style="vertical-align: middle; margin-right: 8px;"> <strong>Continue.dev</strong></summary>

1. Install Continue extension
2. Open Continue config (gear icon → "Open config.json")

**Config location:** `~/.continue/config.json`

**Remote server (recommended):**
```json
{
  "models": [...],
  "mcpServers": {
    "firecrawl": {
      "url": "https://mcp.firecrawl.dev",
      "headers": {
        "X-API-Key": "YOUR_API_KEY"
      }
    }
  }
}
```

**Local server:**
```json
{
  "models": [...],
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
      "url": "https://mcp.firecrawl.dev",
      "headers": {
        "X-API-Key": "YOUR_API_KEY"
      }
    }
  ]
}
```

**Local server:**
```json
{
  "codegpt.mcpServers": [
    {
      "name": "firecrawl",
      "command": "npx -y firecrawl-mcp",
      "env": {
        "FIRECRAWL_API_KEY": "YOUR_API_KEY"
      }
    }
  ]
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
        "FIRECRAWL_API_KEY": "YOUR_API_KEY"
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
            FIRECRAWL_API_KEY = "YOUR_API_KEY"
          }
        }
      }
    })
  end
}
```

**Manual config:**
```vim
" ~/.config/nvim/init.vim
let g:mcp_servers = {
  \ 'firecrawl': {
    \ 'command': 'npx -y firecrawl-mcp',
    \ 'env': {'FIRECRAWL_API_KEY': 'YOUR_API_KEY'}
  \ }
\ }
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
                   (env . ((FIRECRAWL_API_KEY . "YOUR_API_KEY")))))))
```

**Manual configuration:**
```elisp
;; ~/.emacs.d/init.el
(setq mcp-servers
  '((firecrawl
     (command . "npx")
     (args . ("-y" "firecrawl-mcp"))
     (env . ((FIRECRAWL_API_KEY . "YOUR_API_KEY"))))))
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
docker run -e FIRECRAWL_API_KEY=YOUR_API_KEY firecrawl-mcp
```

**Docker Compose:**
```yaml
version: '3.8'
services:
  firecrawl-mcp:
    image: firecrawl-mcp
    environment:
      - FIRECRAWL_API_KEY=YOUR_API_KEY
    restart: unless-stopped
```

</details>

<details>
<summary><img src="https://raw.githubusercontent.com/kubernetes/kubernetes/master/logo/logo.png" width="16" height="16" alt="Kubernetes" style="vertical-align: middle; margin-right: 8px;"> <strong>Kubernetes</strong></summary>

**Create secret:**
```bash
kubectl create secret generic firecrawl-secret \
  --from-literal=api-key=YOUR_API_KEY
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
<summary><img src="https://aws.amazon.com/favicon.ico" width="16" height="16" alt="AWS" style="vertical-align: middle; margin-right: 8px;"> <strong>AWS Lambda</strong></summary>

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
  --environment Variables={FIRECRAWL_API_KEY=YOUR_API_KEY}
```

</details>

<details>
<summary><img src="https://azure.microsoft.com/favicon.ico" width="16" height="16" alt="Azure" style="vertical-align: middle; margin-right: 8px;"> <strong>Azure Functions</strong></summary>

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
<summary><img src="https://cloud.google.com/favicon.ico" width="16" height="16" alt="Google Cloud" style="vertical-align: middle; margin-right: 8px;"> <strong>Google Cloud Functions</strong></summary>

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
  --set-env-vars FIRECRAWL_API_KEY=YOUR_API_KEY
```

</details>

<details>
<summary><img src="https://cdn.replit.com/dotcom/favicon-196.png" width="16" height="16" alt="Replit" style="vertical-align: middle; margin-right: 8px;"> <strong>Replit</strong></summary>

**Create `.replit` file:**
```toml
run = "npx -y firecrawl-mcp"

[env]
FIRECRAWL_API_KEY = "YOUR_API_KEY"

[nix]
channel = "stable-24_11"

[deployment]
run = ["sh", "-c", "npx -y firecrawl-mcp"]
```

Add `FIRECRAWL_API_KEY` to Secrets tab.

</details>

<details>
<summary><img src="https://slack.com/favicon.ico" width="16" height="16" alt="Slack" style="vertical-align: middle; margin-right: 8px;"> <strong>Slack Bot</strong></summary>

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
<summary><img src="https://discord.com/assets/f9bb9c4af2b9c32a2c5ee0014661546d.ico" width="16" height="16" alt="Discord" style="vertical-align: middle; margin-right: 8px;"> <strong>Discord Bot</strong></summary>

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
<summary><img src="https://www.google.com/favicon.ico" width="16" height="16" alt="Chrome" style="vertical-align: middle; margin-right: 8px;"> <strong>Chrome Extension</strong></summary>

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
const FIRECRAWL_API_KEY = 'YOUR_API_KEY';

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
<summary><img src="https://developer.apple.com/favicon.ico" width="16" height="16" alt="iOS" style="vertical-align: middle; margin-right: 8px;"> <strong>iOS (Swift)</strong></summary>

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
        apiKey: "YOUR_API_KEY"
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
            .apiKey("YOUR_API_KEY")
            .build()
    }
}
```

</details>

---

## Configuration Options

### Environment Variables

**Required for Cloud API:**
- `FIRECRAWL_API_KEY`: Your Firecrawl API key

**Optional:**
- `FIRECRAWL_API_URL`: Custom API endpoint for self-hosted instances
- `FIRECRAWL_RETRY_MAX_ATTEMPTS`: Max retry attempts (default: 3)
- `FIRECRAWL_RETRY_INITIAL_DELAY`: Initial delay in ms (default: 1000)
- `FIRECRAWL_RETRY_MAX_DELAY`: Max delay in ms (default: 10000)
- `FIRECRAWL_RETRY_BACKOFF_FACTOR`: Backoff multiplier (default: 2)

### Self-Hosted Configuration

```bash
export FIRECRAWL_API_URL=https://firecrawl.your-domain.com
export FIRECRAWL_API_KEY=your-api-key  # Optional
npx -y firecrawl-mcp
```

---

## Verification & Troubleshooting

### Check Installation
```bash
# Verify Node.js
node --version  # Should be v18.0.0+

# Test package
FIRECRAWL_API_KEY=YOUR_API_KEY npx -y firecrawl-mcp --test
```

### Common Issues

**API Key Invalid:**
- Ensure key starts with `fc-`
- Check for extra spaces or quotes

**Command Not Found:**
```bash
npm install -g firecrawl-mcp
```

**Windows Users:**
```cmd
cmd /c "set FIRECRAWL_API_KEY=YOUR_API_KEY && npx -y firecrawl-mcp"
```

**Debug Mode:**
```bash
DEBUG=firecrawl:* FIRECRAWL_API_KEY=YOUR_API_KEY npx -y firecrawl-mcp
```

---

## Support

- **Documentation**: [github.com/firecrawl/firecrawl-mcp-server](https://github.com/firecrawl/firecrawl-mcp-server)
- **Issues**: [github.com/firecrawl/firecrawl-mcp-server/issues](https://github.com/firecrawl/firecrawl-mcp-server/issues)
- **Discord**: [Join Firecrawl Discord](https://discord.gg/firecrawl)
- **API Status**: [status.firecrawl.dev](https://status.firecrawl.dev)

*Get your API key at [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)*