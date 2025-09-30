/**
 * Patch for VS Code MCP JSON Schema Compatibility
 * 
 * This module patches JSON schemas from draft 2020-12 to draft-07
 * to ensure compatibility with VS Code's MCP validator.
 */

/**
 * Recursively converts JSON Schema draft 2020-12 to draft-07
 * @param schema - The schema object to convert
 * @returns The converted schema
 */
export function convertSchemaToDraft07(schema: any): any {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  // Create a copy to avoid mutating the original
  const converted = Array.isArray(schema) ? [...schema] : { ...schema };

  // Replace the $schema version
  if (converted.$schema === 'https://json-schema.org/draft/2020-12/schema') {
    converted.$schema = 'http://json-schema.org/draft-07/schema#';
  }

  // Remove unsupported draft 2020-12 features
  delete converted.$dynamicRef;
  delete converted.$dynamicAnchor;
  delete converted.prefixItems;
  delete converted.dependentSchemas;
  delete converted.dependentRequired;

  // Convert $defs to definitions (draft-07 uses 'definitions')
  if (converted.$defs) {
    converted.definitions = converted.$defs;
    delete converted.$defs;
  }

  // Recursively process nested schemas
  for (const key in converted) {
    if (typeof converted[key] === 'object' && converted[key] !== null) {
      converted[key] = convertSchemaToDraft07(converted[key]);
    }
  }

  return converted;
}

/**
 * Patches the FastMCP server to convert all tool schemas to draft-07
 */
export function patchFastMCPSchemas(server: any): void {
  console.log('[Schema Patch] Applying VS Code compatibility patches...');
  
  // Patch the protocol handler's listTools method
  const originalSend = server.send?.bind(server);
  if (!originalSend) {
    console.warn('[Schema Patch] send method not found, trying alternate approach');
    return;
  }

  server.send = function(message: any) {
    // Intercept tools/list responses
    if (message && message.result && message.result.tools && Array.isArray(message.result.tools)) {
      console.log(`[Schema Patch] Intercepted tools/list response with ${message.result.tools.length} tools`);
      
      message.result.tools = message.result.tools.map((tool: any) => {
        if (tool.inputSchema) {
          const originalSchema = tool.inputSchema.$schema || 'unknown';
          tool.inputSchema = convertSchemaToDraft07(tool.inputSchema);
          console.log(`[Schema Patch] ✓ Converted ${tool.name}: ${originalSchema} -> draft-07`);
        }
        return tool;
      });
    }
    
    return originalSend(message);
  };

  console.log('[Schema Patch] Successfully installed schema conversion interceptor');
}
