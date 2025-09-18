# Windows

## Overview

Windows requires slightly different configuration compared to Linux or macOS for running Firecrawl MCP Server. This guide provides Windows-specific instructions for various MCP-compatible environments.

## Prerequisites

- Windows 10 or 11
- Firecrawl API Key
- Node.js 18+ (for npx)
- Windows Command Prompt or PowerShell

## Installation

### Quick Install

1. **Get Firecrawl API Key**
   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Configure for Windows**
   - Use `cmd` command with `/c` flag
   - Adjust arguments for Windows compatibility (see below)

### Step-by-Step

1. **Get Firecrawl API Key**
   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Verify Node.js Installation**
   - Open Command Prompt or PowerShell
   - Run `node --version` to ensure Node.js 18+ is installed
   - Run `npx --version` to ensure npx is available

3. **Configure MCP Client**
   - Update your MCP client's configuration for Windows
   - Use Windows-specific command structure (see below)

## Windows Configuration

The configuration on Windows is slightly different compared to Linux or macOS. The same principle applies to other editors; refer to the configuration of `command` and `args`.

### General Windows Configuration

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

### Claude Desktop Windows Configuration

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"]
    }
  }
}
```

**Configuration File Location**:
- `%APPDATA%\Claude\claude_desktop_config.json`

### VS Code Windows Configuration

```json
{
  "mcp": {
    "servers": {
      "firecrawl": {
        "type": "stdio",
        "command": "cmd",
        "args": ["/c", "npx", "-y", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"]
      }
    }
  }
}
```

**Configuration File Location**:
- `%APPDATA%\Code\User\settings.json` (User settings)
- `.vscode\settings.json` (Workspace settings)

### Cursor Windows Configuration

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"]
    }
  }
}
```

**Configuration File Location**:
- `%USERPROFILE%\.cursor\mcp.json` (Global settings)
- `.cursor\mcp.json` (Project-specific settings)

### Cline Windows Configuration

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"],
      "type": "stdio",
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

### Windsurf Windows Configuration

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"]
    }
  }
}
```

**Configuration File Location**:
- `.codeium\windsurf\model_config.json`

### Kiro Windows Configuration

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"],
      "env": {},
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

### PowerShell Alternative Configuration

For environments that support PowerShell, you can use:

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "powershell",
      "args": ["-Command", "npx -y firecrawl-mcp --api-key fc-your-api-key-here"],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

## Windows-Specific Configuration

### Environment Variables on Windows

You can use Windows environment variables:

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "fc-your-api-key-here",
        "FIRECRAWL_RETRY_MAX_ATTEMPTS": "5",
        "FIRECRAWL_RETRY_INITIAL_DELAY": "2000",
        "FIRECRAWL_RETRY_MAX_DELAY": "30000"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

### Self-Hosted Configuration on Windows

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "firecrawl-mcp", "--api-key", "your-self-hosted-key"],
      "env": {
        "FIRECRAWL_API_URL": "https://your-firecrawl-instance.com"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

### Windows Path Configuration

If Node.js is not in the system PATH, use the full path:

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "cmd",
      "args": ["/c", "C:\\Program Files\\nodejs\\npx.exe", "-y", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"],
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

## Verification

### Test Installation

1. **Test Node.js and npx**
   ```cmd
   node --version
   npx --version
   ```

2. **Test Firecrawl MCP Manually**
   ```cmd
   npx -y firecrawl-mcp --help
   npx -y firecrawl-mcp --api-key fc-your-api-key-here
   ```

3. **Test Windows Command Structure**
   ```cmd
   cmd /c npx -y firecrawl-mcp --help
   ```

4. **Check MCP Client**
   - Verify Firecrawl MCP appears in your MCP client's server list
   - Status should show as "Connected" or "Active"

5. **Test with AI**
   - Try a web scraping request in your AI assistant:
     ```
     Can you scrape https://httpbin.org/json and show me the content?
     ```

## Troubleshooting

### Common Windows Issues

| Issue | Solution |
|-------|----------|
| **Command not found** | Use full path to npx or ensure Node.js is in PATH |
| **Permission denied** | Run Command Prompt/PowerShell as Administrator |
| **npx command fails** | Install Node.js 18+ and add to system PATH |
| **MCP client can't connect** | Verify Windows command structure |
| **API key issues** | Ensure API key is properly escaped in JSON |

### Windows-Specific Issues

1. **Command Structure**:
   - Always use `cmd` with `/c` flag for Windows
   - Arguments must be properly formatted for Windows command prompt
   - Use forward slashes or double backslashes in paths

2. **PATH Issues**:
   - Ensure Node.js is installed and added to system PATH
   - Use full path to npx if not in PATH
   - Test npx availability in Command Prompt

3. **Permission Issues**:
   - Run Command Prompt as Administrator if needed
   - Check user permissions for npm global packages
   - Verify write permissions for configuration files

4. **JSON Escaping**:
   - Use double backslashes for Windows paths in JSON
   - Properly escape quotes and special characters
   - Validate JSON syntax before using

### Debug Commands

```cmd
# Test Node.js installation
node --version
npm --version
npx --version

# Test npx directly
npx -y firecrawl-mcp --help

# Test Windows command structure
cmd /c npx -y firecrawl-mcp --help

# Test with API key
cmd /c npx -y firecrawl-mcp --api-key fc-your-api-key-here

# Check Node.js installation path
where node
where npx

# Test environment variables
echo %PATH%
echo %FIRECRAWL_API_KEY%
```

## Windows Configuration Files

### Environment Variables (System Level)

1. Open System Properties > Advanced > Environment Variables
2. Add under System variables:
   - `FIRECRAWL_API_KEY`: `fc-your-api-key-here`
   - `FIRECRAWL_RETRY_MAX_ATTEMPTS`: `5`
   - `FIRECRAWL_RETRY_INITIAL_DELAY`: `2000`

### Environment Variables (User Level)

1. Open System Properties > Advanced > Environment Variables
2. Add under User variables for your account

### Using PowerShell Profile

Add to your PowerShell profile (`$PROFILE`):

```powershell
$env:FIRECRAWL_API_KEY = "fc-your-api-key-here"
$env:FIRECRAWL_RETRY_MAX_ATTEMPTS = "5"
$env:FIRECRAWL_RETRY_INITIAL_DELAY = "2000"
```

## Windows Performance Tips

1. **Command Structure**: Always use `cmd /c` for Windows compatibility
2. **PATH Management**: Ensure Node.js is in system PATH for easier access
3. **Environment Variables**: Use system environment variables for API keys
4. **Administrator Privileges**: Run as Administrator if permission issues occur
5. **Windows Terminal**: Use Windows Terminal for better command-line experience

## Support

- **Windows Documentation**: [Windows Command Reference](https://docs.microsoft.com/en-us/windows-server/administration/windows-commands/windows-commands)
- **Node.js Windows**: [Node.js Windows Installation](https://nodejs.org/en/download/)
- **Firecrawl Documentation**: [Firecrawl Docs](https://docs.firecrawl.dev)
- **API Key Issues**: [Firecrawl API Dashboard](https://www.firecrawl.dev/app/api-keys)

## Environment-Specific Notes

- Windows requires `cmd /c` prefix for npx commands
- Environment variables work differently on Windows (use `%VAR%` format)
- Path separators use backslashes (`\`) in Windows paths
- JSON escaping requires double backslashes (`\\`) for Windows paths
- Administrator privileges may be required for some operations
- Windows Command Prompt and PowerShell have different syntax
- System PATH management is crucial for Node.js tools
- Configuration files use Windows user profile locations
- Windows Defender may affect some operations; check firewall settings
- Windows Subsystem for Linux (WSL) can be used as alternative approach

---

**Environment Compatibility**: ✅ Verified
**Last Tested**: September 2024
**Firecrawl MCP Version**: Latest
**Windows Version**: Windows 10/11 with Node.js 18+