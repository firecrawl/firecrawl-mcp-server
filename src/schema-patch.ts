/**
 * Patch for VS Code MCP JSON Schema Compatibility
 * 
 * This module patches JSON schemas from draft 2020-12 to draft-07
 * to ensure compatibility with VS Code's MCP validator.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';

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
 * Patches the MCP SDK Server class directly by monkey-patching its setRequestHandler method
 * This must be called BEFORE any Server instances are created
 */
export function patchFastMCPSchemas(_server?: any): void {
  console.error('[Schema Patch] Applying VS Code compatibility patches...');
  
  // Patch the Server prototype's setRequestHandler method
  const originalSetRequestHandler = Server.prototype.setRequestHandler;
  if (!originalSetRequestHandler) {
    console.error('[Schema Patch] ERROR: Server.prototype.setRequestHandler not found');
    return;
  }
  
  console.error('[Schema Patch] Patching Server.prototype.setRequestHandler...');
  
  Server.prototype.setRequestHandler = function(requestSchema: any, handler: any) {
    // Extract the method name from the Zod schema
    const method = requestSchema?.shape?.method?.value;
    
    console.error(`[Schema Patch] setRequestHandler called for method: ${method}`);
    
    if (method === 'tools/list') {
      console.error('[Schema Patch] ✓ Intercepting tools/list handler registration');
      
      const wrappedHandler = async (...args: any[]) => {
        console.error('[Schema Patch] tools/list handler called, converting schemas...');
        const response = await handler(...args);
        
        if (response && response.tools && Array.isArray(response.tools)) {
          console.error(`[Schema Patch] Converting ${response.tools.length} tool schemas to draft-07`);
          
          response.tools = response.tools.map((tool: any) => {
            if (tool.inputSchema) {
              const before = tool.inputSchema.$schema || 'unknown';
              tool.inputSchema = convertSchemaToDraft07(tool.inputSchema);
              console.error(`[Schema Patch] ✓ ${tool.name}: ${before} -> draft-07`);
            }
            return tool;
          });
        }
        
        return response;
      };
      
      return originalSetRequestHandler.call(this, requestSchema, wrappedHandler);
    }
    
    return originalSetRequestHandler.call(this, requestSchema, handler);
  };
  
  console.error('[Schema Patch] Successfully patched Server.prototype.setRequestHandler');
}
