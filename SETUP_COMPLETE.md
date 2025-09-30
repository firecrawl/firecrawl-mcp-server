# 🎉 Firecrawl MCP Server - Local Setup for VS Code

## ✅ Setup Complete!

You now have a **locally-running Firecrawl MCP server** configured for VS Code/GitHub Copilot!

## 📁 Installation Location
```
D:\movies\firecrawl-mcp-server\
```

## 🔧 What Was Done

### 1. Repository Cloned ✅
- Cloned the official Firecrawl MCP server from GitHub
- Version: **3.3.6** (latest)

### 2. Dependencies Installed ✅
- All Node.js dependencies installed
- Added `zod-to-json-schema` for better compatibility
- Built successfully with TypeScript compilation

### 3. VS Code Configuration Updated ✅
Updated `.vscode/mcp.json` to use the local build:

```json
"firecrawl-local": {
  "type": "stdio",
  "command": "node",
  "args": [
    "D:\\movies\\firecrawl-mcp-server\\dist\\index.js"
  ],
  "env": {
    "FIRECRAWL_API_KEY": "${input:firecrawl_api_key}"
  }
}
```

## 🚀 How to Use

### 1. Restart VS Code
Close and reopen VS Code to load the new MCP configuration.

### 2. Enter Your Firecrawl API Key
When prompted, enter your Firecrawl API key from:
https://www.firecrawl.dev/app/api-keys

### 3. Available Tools
Once loaded, you'll have access to these 6 powerful tools:

1. **firecrawl_scrape** - Single page content extraction
2. **firecrawl_batch_scrape** - Multiple URL scraping
3. **firecrawl_map** - Discover URLs on a website
4. **firecrawl_crawl** - Multi-page content extraction
5. **firecrawl_search** - Web search with content extraction
6. **firecrawl_extract** - Extract structured data from pages

## 🔍 Verify Installation

Check VS Code MCP logs for:
```
[info] Discovered 6 tools
```

**You should NOT see:**
```
[warning] 6 tools have invalid JSON schemas and will be omitted
```

## 🛠️ Development & Maintenance

### Rebuild After Changes
If you modify the source code:
```powershell
cd D:\movies\firecrawl-mcp-server
npm run build
```

### Update from GitHub
To get the latest updates:
```powershell
cd D:\movies\firecrawl-mcp-server
git pull origin main
npm install
npm run build
```

### Apply Custom Patches
If JSON schema issues persist, run:
```powershell
cd D:\movies\firecrawl-mcp-server
node patch-fastmcp.cjs
npm run build
```

## 📊 Troubleshooting

### Problem: Tools Still Show as Invalid
**Solution:** The current version (3.3.6) might already have the fix. Check the logs to see the actual error.

### Problem: API Key Not Working
**Solution:** 
1. Get a valid API key from https://www.firecrawl.dev/app/api-keys
2. Make sure you're entering it when VS Code prompts you
3. Restart VS Code after entering the key

### Problem: MCP Server Not Starting
**Solution:**
1. Check that Node.js is installed: `node --version`
2. Verify the path exists: `D:\movies\firecrawl-mcp-server\dist\index.js`
3. Check VS Code Output panel for MCP logs

### Problem: Need to Debug
**Enable detailed logging:**
```json
"firecrawl-local": {
  "type": "stdio",
  "command": "node",
  "args": [
    "D:\\movies\\firecrawl-mcp-server\\dist\\index.js"
  ],
  "env": {
    "FIRECRAWL_API_KEY": "${input:firecrawl_api_key}",
    "DEBUG": "*"
  }
}
```

## 🔄 Alternative: Test with Different Versions

If you want to test with an older version:

```powershell
cd D:\movies\firecrawl-mcp-server
git checkout v2.0.0  # or any other version
npm install
npm run build
```

Then restart VS Code.

## 📝 Configuration Files

### Main Config: `.vscode/mcp.json`
Location: `d:\movies\new_pwa_c\.vscode\mcp.json`

### Firecrawl Source: `D:\movies\firecrawl-mcp-server\`
- Source code: `src/index.ts`
- Compiled output: `dist/index.js`
- Dependencies: `node_modules/`

## 🎯 Next Steps

1. **Restart VS Code now** to apply the changes
2. **Test the tools** by asking Copilot to search the web or scrape a page
3. **Monitor logs** in VS Code Output panel (select "MCP" from dropdown)

## 💡 Example Usage

Try asking GitHub Copilot:

> "Use Firecrawl to search for 'React best practices 2025' and summarize the top 3 results"

> "Scrape the content from https://example.com and extract the main headings"

> "Map all URLs on https://docs.example.com and show me the documentation structure"

## 🆘 Getting Help

If issues persist:
1. Check GitHub Issues: https://github.com/firecrawl/firecrawl-mcp-server/issues
2. The JSON schema issue is tracked in Issue #112 and #107
3. Share VS Code MCP logs when reporting problems

## ✨ Success Indicators

You'll know it's working when:
- ✅ VS Code MCP logs show "Discovered 6 tools"
- ✅ No "invalid JSON schemas" warning
- ✅ You can see Firecrawl tools in Copilot suggestions
- ✅ Web searches and scraping work as expected

---

**Status:** ✅ Configuration Complete - Ready to Use!

**Version:** Firecrawl MCP 3.3.6 (Local Build)

**Last Updated:** September 30, 2025
