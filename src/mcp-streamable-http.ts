#!/usr/bin/env node

/**
 * MCP STREAMABLE_HTTP Standard Implementation
 * 
 * This module implements the MCP STREAMABLE_HTTP transport protocol
 * according to the official MCP specification with backward compatibility.
 * 
 * Protocol Version Support:
 * - 2025-06-18: Latest specification (preferred)
 * - 2025-03-26: Streamable HTTP transport specification  
 * - 2024-11-05: Previous stable version
 * - 2024-10-07: Legacy support
 * 
 * Version Negotiation Strategy:
 * 1. Exact match preferred - use client's requested version if supported
 * 2. Smart negotiation - find highest supported version ≤ client version
 * 3. Maximum compatibility - use oldest version for very old clients
 * 
 * Key features:
 * - Strict JSON-RPC 2.0 compliance
 * - Standard MCP initialization flow
 * - Intelligent protocol version negotiation
 * - Proper session management
 * - Standardized error handling
 * - Full backward compatibility
 */

import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  Tool,
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// MCP Protocol Constants - Backward Compatible
const MCP_PROTOCOL_VERSION = '2025-06-18';
const SUPPORTED_VERSIONS = [
  '2025-06-18',  // Latest specification
  '2025-03-26',  // Streamable HTTP transport specification  
  '2024-11-05',  // Previous stable version
  '2024-10-07'   // Legacy support
];

// JSON-RPC Error Codes (standard)
const JSONRPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // MCP specific error codes
  SESSION_REQUIRED: -32002,
  PROTOCOL_ERROR: -32001,
  INITIALIZATION_REQUIRED: -32000
} as const;

// Session interface
interface MCPSession {
  id: string;
  initialized: boolean;
  protocolVersion: string;
  capabilities: any;
  clientInfo: any;
  createdAt: number;
  lastActivity: number;
}

// JSON-RPC Request interface
interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: any;
}

// JSON-RPC Response interface
interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export class MCPStreamableHTTPServer {
  private app: express.Application;
  private sessions: Map<string, MCPSession> = new Map();
  private mcpServer: Server;
  private tools: Tool[] = [];
  private toolExecutor?: (toolName: string, args: any) => Promise<any>;

  constructor(mcpServer: Server, tools: Tool[]) {
    this.app = express();
    this.mcpServer = mcpServer;
    this.tools = tools;
    this.setupMiddleware();
    this.setupRoutes();
  }

  public setToolExecutor(executor: (toolName: string, args: any) => Promise<any>): void {
    this.toolExecutor = executor;
  }

  private setupMiddleware(): void {
    // JSON parsing middleware
    this.app.use(express.json({
      limit: '10mb',
      strict: true,
      type: 'application/json'
    }));

    // CORS middleware
    this.app.use((req, res, next) => {
      const origin = req.headers.origin;
      
      // Set CORS headers according to MCP spec
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      } else {
        res.setHeader('Access-Control-Allow-Origin', '*');
      }
      
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 
        'Content-Type, Accept, mcp-session-id, mcp-protocol-version');
      res.setHeader('Access-Control-Expose-Headers', 
        'mcp-session-id, mcp-protocol-version');
      res.setHeader('Access-Control-Allow-Credentials', 'false');
      
      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
      }
      
      next();
    });

    // Request logging middleware
    this.app.use((req, res, next) => {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`, {
        origin: req.headers.origin,
        userAgent: req.headers['user-agent'],
        sessionId: req.headers['mcp-session-id']
      });
      next();
    });
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', this.handleHealthCheck.bind(this));
    
    // Session management endpoints
    this.app.get('/sessions', this.handleSessionsList.bind(this));
    this.app.delete('/sessions', this.handleSessionsCleanup.bind(this));
    
    // Main MCP endpoint
    this.app.post('/mcp', this.handleMCPRequest.bind(this));
    
    // Catch-all for unsupported methods
    this.app.all('*', this.handleNotFound.bind(this));
  }

  private handleHealthCheck(req: Request, res: Response): void {
    res.json({
      status: 'healthy',
      protocol: 'MCP_STREAMABLE_HTTP',
      version: MCP_PROTOCOL_VERSION,
      supportedVersions: SUPPORTED_VERSIONS,
      timestamp: new Date().toISOString(),
      sessions: this.sessions.size
    });
  }

  private handleSessionsList(req: Request, res: Response): void {
    const sessionList = Array.from(this.sessions.values()).map(session => ({
      id: session.id.substring(0, 8) + '...',
      initialized: session.initialized,
      protocolVersion: session.protocolVersion,
      age: Date.now() - session.createdAt,
      lastActivity: Date.now() - session.lastActivity
    }));

    res.json({
      totalSessions: this.sessions.size,
      sessions: sessionList,
      timestamp: new Date().toISOString()
    });
  }

  private handleSessionsCleanup(req: Request, res: Response): void {
    const beforeCount = this.sessions.size;
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.lastActivity < cutoffTime) {
        this.sessions.delete(sessionId);
      }
    }

    const afterCount = this.sessions.size;
    res.json({
      message: 'Session cleanup completed',
      removed: beforeCount - afterCount,
      remaining: afterCount,
      timestamp: new Date().toISOString()
    });
  }

  private async handleMCPRequest(req: Request, res: Response): Promise<void> {
    try {
      // Validate JSON-RPC request format
      const request = this.validateJSONRPCRequest(req.body);
      
      // Handle the request based on method
      const response = await this.processRequest(request, req, res);
      
      // Send response only if there is one (notifications don't get responses per JSON-RPC 2.0)
      if (response !== null) {
        res.json(response);
      } else {
        // For notifications, per MCP STREAMABLE_HTTP spec:
        // "MUST return HTTP status code 202 Accepted with no body" if accepted
        res.status(202).end();
      }
      
    } catch (error) {
      console.error('Error handling MCP request:', error);
      
      // Send JSON-RPC error response
      const errorResponse: JSONRPCResponse = {
        jsonrpc: '2.0',
        id: req.body?.id || null,
        error: {
          code: JSONRPC_ERRORS.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : 'Internal server error',
          data: error instanceof Error ? error.stack : undefined
        }
      };
      
      res.status(500).json(errorResponse);
    }
  }

  private validateJSONRPCRequest(body: any): JSONRPCRequest {
    if (!body || typeof body !== 'object') {
      throw new Error('Invalid JSON-RPC request: body must be an object');
    }

    if (body.jsonrpc !== '2.0') {
      throw new Error('Invalid JSON-RPC request: jsonrpc must be "2.0"');
    }

    if (typeof body.method !== 'string') {
      throw new Error('Invalid JSON-RPC request: method must be a string');
    }

    // More flexible id validation - allow undefined, null, string, or number
    if (body.id !== undefined && body.id !== null && 
        typeof body.id !== 'string' && typeof body.id !== 'number') {
      throw new Error('Invalid JSON-RPC request: id must be string, number, null, or undefined');
    }

    // Normalize id to null if undefined
    const normalizedBody = {
      ...body,
      id: body.id === undefined ? null : body.id
    };

    return normalizedBody as JSONRPCRequest;
  }

  private async processRequest(
    request: JSONRPCRequest, 
    req: Request, 
    res: Response
  ): Promise<JSONRPCResponse | null> {
    
    const sessionId = req.headers['mcp-session-id'] as string;
    
    // 详细日志记录
    console.log(`🔍 Processing MCP request:`, {
      method: request.method,
      id: request.id,
      sessionId: sessionId,
      params: request.params
    });
    
    switch (request.method) {
      case 'initialize':
        return this.handleInitialize(request, res);
        
      case 'notifications/initialized':
        return this.handleInitializedNotification(request, sessionId);
        
      case 'tools/list':
        return this.handleToolsList(request, sessionId);
        
      case 'tools/call':
        return this.handleToolCall(request, sessionId);
        
      case 'prompts/list':
        return this.handlePromptsList(request, sessionId);
        
      default:
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: JSONRPC_ERRORS.METHOD_NOT_FOUND,
            message: `Method not found: ${request.method}`,
            data: { availableMethods: ['initialize', 'notifications/initialized', 'tools/list', 'tools/call', 'prompts/list'] }
          }
        };
    }
  }

  private handleInitialize(request: JSONRPCRequest, res: Response): JSONRPCResponse {
    const params = request.params || {};
    
    // Validate initialization parameters
    if (!params.protocolVersion) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: JSONRPC_ERRORS.INVALID_PARAMS,
          message: 'Missing required parameter: protocolVersion'
        }
      };
    }

    // Check protocol version compatibility
    const clientVersion = params.protocolVersion;
    const supportedVersion = this.negotiateProtocolVersion(clientVersion);
    
    // Log protocol version negotiation for debugging
    console.log(`Protocol version negotiation: Client requested "${clientVersion}", using "${supportedVersion}"`);
    
    if (!supportedVersion) {
      console.warn(`Unsupported protocol version: ${clientVersion}. Supported versions: ${SUPPORTED_VERSIONS.join(', ')}`);
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: JSONRPC_ERRORS.PROTOCOL_ERROR,
          message: `Unsupported protocol version: ${clientVersion}`,
          data: { supportedVersions: SUPPORTED_VERSIONS }
        }
      };
    }

    // Create new session
    const sessionId = crypto.randomUUID();
    const session: MCPSession = {
      id: sessionId,
      initialized: true,
      protocolVersion: supportedVersion,
      capabilities: params.capabilities || {},
      clientInfo: params.clientInfo || {},
      createdAt: Date.now(),
      lastActivity: Date.now()
    };

    this.sessions.set(sessionId, session);

    // Set session headers
    res.setHeader('mcp-session-id', sessionId);
    res.setHeader('mcp-protocol-version', supportedVersion);

    console.log(`Session initialized: ${sessionId} (protocol: ${supportedVersion})`);

    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        protocolVersion: supportedVersion,
        capabilities: {
          tools: {
            listChanged: true
          },
          prompts: {
            listChanged: true
          },
          resources: {},
          logging: {}
        },
        serverInfo: {
          name: 'firecrawl-mcp',
          version: '1.12.0'
        }
      }
    };
  }

  private handleToolsList(request: JSONRPCRequest, sessionId?: string): JSONRPCResponse {
    // For tools/list, we don't require a session ID - this is more compatible
    // with various MCP clients that might not properly handle session headers
    
    // If session ID is provided, update activity
    if (sessionId) {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.lastActivity = Date.now();
      }
    }

    // Always return tools list regardless of session status
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        tools: this.tools
      }
    };
  }

  private async handleToolCall(request: JSONRPCRequest, sessionId?: string): Promise<JSONRPCResponse> {
    // For tool calls, we'll be very lenient with session validation
    // Many MCP clients have issues with session management
    
    let currentSessionId = sessionId;
    
    // If no session ID provided, create a default session
    if (!currentSessionId) {
      console.log('No session ID provided for tool call, creating default session');
      currentSessionId = crypto.randomUUID();
      const defaultSession: MCPSession = {
        id: currentSessionId,
        initialized: true,
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: {},
        createdAt: Date.now(),
        lastActivity: Date.now()
      };
      this.sessions.set(currentSessionId, defaultSession);
      console.log(`Created default session: ${currentSessionId}`);
    }

    // Try to get the session, but don't fail if it doesn't exist
    let session = this.sessions.get(currentSessionId);
    if (!session) {
      console.log(`Session ${currentSessionId} not found, creating new session`);
      session = {
        id: currentSessionId,
        initialized: true,
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: {},
        createdAt: Date.now(),
        lastActivity: Date.now()
      };
      this.sessions.set(currentSessionId, session);
    }

    // Update session activity
    session.lastActivity = Date.now();

    // Validate tool call parameters
    const params = request.params;
    if (!params || !params.name) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: JSONRPC_ERRORS.INVALID_PARAMS,
          message: 'Missing required parameter: name'
        }
      };
    }

    try {
      // Execute the tool call
      const result = await this.executeToolCall(params.name, params.arguments || {});

      return {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        }
      };

    } catch (error) {
      console.error(`Tool call error (${params.name}):`, error);
      
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: JSONRPC_ERRORS.INTERNAL_ERROR,
          message: `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          data: { tool: params.name }
        }
      };
    }
  }

  private negotiateProtocolVersion(clientVersion: string): string | null {
    // Exact match preferred - return client's preferred version if supported
    if (SUPPORTED_VERSIONS.includes(clientVersion)) {
      return clientVersion;
    }
    
    // Smart version negotiation for backward compatibility
    const clientVersionParts = clientVersion.split('-');
    const clientDate = clientVersionParts[0];
    
    // Find the highest supported version that's not newer than client
    for (const supportedVersion of SUPPORTED_VERSIONS) {
      const supportedDate = supportedVersion.split('-')[0];
      
      // If supported version is same or older than client's, use it
      if (supportedDate <= clientDate) {
        return supportedVersion;
      }
    }
    
    // If client is too old, use the oldest supported version for maximum compatibility  
    return SUPPORTED_VERSIONS[SUPPORTED_VERSIONS.length - 1];
  }

  private async executeToolCall(toolName: string, args: any): Promise<any> {
    if (this.toolExecutor) {
      return await this.toolExecutor(toolName, args);
    }
    
    // Fallback if no tool executor is set
    console.log(`No tool executor set, using placeholder for: ${toolName}`);
    return {
      success: false,
      error: 'No tool executor configured',
      tool: toolName,
      timestamp: new Date().toISOString()
    };
  }

  private handleNotFound(req: Request, res: Response): void {
    res.status(404).json({
      error: 'Not Found',
      message: `Endpoint not found: ${req.method} ${req.path}`,
      availableEndpoints: [
        'GET /health',
        'GET /sessions', 
        'DELETE /sessions',
        'POST /mcp'
      ]
    });
  }

  public listen(port: number, host: string = '0.0.0.0'): void {
    this.app.listen(port, host, () => {
      console.log(`🚀 MCP STREAMABLE_HTTP Server listening on http://${host}:${port}`);
      console.log(`📡 Protocol: ${MCP_PROTOCOL_VERSION}`);
      console.log(`🔧 MCP endpoint: http://${host}:${port}/mcp`);
      console.log(`❤️  Health check: http://${host}:${port}/health`);
      console.log(`📊 Sessions: http://${host}:${port}/sessions`);
    });
  }

  public getSessionCount(): number {
    return this.sessions.size;
  }

  public cleanup(): void {
    // Clean up expired sessions
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000);
    let cleaned = 0;
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.lastActivity < cutoffTime) {
        this.sessions.delete(sessionId);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`Cleaned up ${cleaned} expired sessions`);
    }
  }

  private handleInitializedNotification(request: JSONRPCRequest, sessionId?: string): JSONRPCResponse | null {
    console.log('✅ Client initialized notification received');
    
    // This is a notification, so no response is needed per JSON-RPC 2.0 spec
    // But we can use this to do any post-initialization setup
    if (sessionId) {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.lastActivity = Date.now();
        console.log(`Session ${sessionId} marked as fully initialized`);
      }
    }
    
    // JSON-RPC 2.0: Notifications must not receive a response
    // Return null to indicate no response should be sent
    return null;
  }

  private handlePromptsList(request: JSONRPCRequest, sessionId?: string): JSONRPCResponse {
    console.log('📋 Prompts list requested');
    
    // Update session activity if session ID provided
    if (sessionId) {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.lastActivity = Date.now();
      }
    }

    // Return empty prompts list (Firecrawl doesn't have prompts)
    return {
      jsonrpc: '2.0',
      id: request.id,
      result: {
        prompts: []
      }
    };
  }
}