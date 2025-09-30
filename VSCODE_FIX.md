# Firecrawl MCP Server - VS Code JSON Schema Fix

## Problem
The Firecrawl MCP server uses `firecrawl-fastmcp` v1.0.3 which generates JSON schemas with draft 2020-12 features (`$dynamicRef`). VS Code's MCP validator only supports draft-07 or draft-04, causing all tools to be rejected.

## Solution Approach
We have two options to fix this:

### Option 1: Patch the firecrawl-fastmcp package (Recommended)
We need to modify the `firecrawl-fastmcp` package to generate draft-07 compatible schemas.

### Option 2: Use Zod's built-in JSON Schema generator
Replace `firecrawl-fastmcp` with a simpler approach using Zod's native JSON Schema generation with draft-07.

## Implementation Steps

### Step 1: Locate the Schema Generation
The issue is in `node_modules/firecrawl-fastmcp/dist/index.js` which generates schemas with:
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema"
}
```

We need to change this to:
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

### Step 2: Patch the Package
Create a patch file to modify the firecrawl-fastmcp package after installation.

### Step 3: Rebuild and Test
After patching, rebuild the project and test with VS Code.

## Quick Fix Script
Run this PowerShell script to patch the installed package:

```powershell
# Navigate to the package
cd D:\movies\firecrawl-mcp-server\node_modules\firecrawl-fastmcp\dist

# Backup the original file
Copy-Item index.js index.js.backup

# Replace the schema version (if the file exists and contains the pattern)
# This will need to be done manually or with a proper script
```

## Manual Patch Instructions

1. Open: `D:\movies\firecrawl-mcp-server\node_modules\firecrawl-fastmcp\dist\index.js`
2. Find all occurrences of: `"https://json-schema.org/draft/2020-12/schema"`
3. Replace with: `"http://json-schema.org/draft-07/schema#"`
4. Remove any `$dynamicRef` properties if present
5. Save the file
6. Rebuild the project: `npm run build`
7. Update VS Code config to use local build

## Alternative: Use zod-to-json-schema Package

Add this package which supports draft-07:
```bash
npm install zod-to-json-schema
```

Then modify the source code to use it instead of the built-in fastmcp schema generation.

## Testing
After applying the fix:
1. Restart VS Code
2. Check the MCP server logs
3. Verify tools are discovered without "invalid JSON schemas" warning

## Status
- ✅ Repository cloned
- ✅ Dependencies installed
- ⏳ Patch needs to be applied
- ⏳ Testing in VS Code
