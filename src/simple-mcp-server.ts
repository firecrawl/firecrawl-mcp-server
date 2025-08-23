#!/usr/bin/env node

/**
 * 简化的MCP STREAMABLE_HTTP服务器实现
 * 专门针对Firecrawl集成优化
 */

import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { FirecrawlToolsIntegration } from './firecrawl-tools-integration.js';

// MCP工具定义
const TOOLS = [
  {
    name: 'firecrawl_scrape',
    description: 'Scrape content from a single URL with advanced options',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to scrape' },
        formats: { 
          type: 'array', 
          items: { type: 'string', enum: ['markdown', 'html', 'rawHtml'] },
          default: ['markdown']
        },
        onlyMainContent: { type: 'boolean' },
        waitFor: { type: 'number' },
        timeout: { type: 'number' }
      },
      required: ['url']
    }
  },
  {
    name: 'firecrawl_map',
    description: 'Map a website to discover all indexed URLs',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Starting URL for URL discovery' },
        search: { type: 'string' },
        limit: { type: 'number' }
      },
      required: ['url']
    }
  },
  {
    name: 'firecrawl_crawl',
    description: 'Start an asynchronous crawl job on a website',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Starting URL for the crawl' },
        maxDepth: { type: 'number' },
        limit: { type: 'number' }
      },
      required: ['url']
    }
  },
  {
    name: 'firecrawl_check_crawl_status',
    description: 'Check the status of a crawl job',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Crawl job ID to check' }
      },
      required: ['id']
    }
  },
  {
    name: 'firecrawl_search',
    description: 'Search the web and optionally extract content from search results',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query string' },
        limit: { type: 'number', default: 5 },
        lang: { type: 'string', default: 'en' },
        country: { type: 'string', default: 'us' }
      },
      required: ['query']
    }
  },
  {
    name: 'firecrawl_extract',
    description: 'Extract structured information from web pages using LLM capabilities',
    inputSchema: {
      type: 'object',
      properties: {
        urls: { type: 'array', items: { type: 'string' } },
        prompt: { type: 'string' },
        schema: { type: 'object' }
      },
      required: ['urls']
    }
  },
  {
    name: 'firecrawl_deep_research',
    description: 'Conduct deep web research on a query',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The research question or topic' },
        maxDepth: { type: 'number', default: 3 },
        timeLimit: { type: 'number', default: 120 },
        maxUrls: { type: 'number', default: 50 }
      },
      required: ['query']
    }
  },
  {
    name: 'firecrawl_generate_llmstxt',
    description: 'Generate a standardized llms.txt file for a given domain',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The base URL of the website to analyze' },
        maxUrls: { type: 'number', default: 10 },
        showFullText: { type: 'boolean', default: false }
      },
      required: ['url']
    }
  }
];

export class SimpleMCPServer {
  private app: express.Application;
  private sessions: Map<string, any>;
  private firecrawlTools: FirecrawlToolsIntegration;

  constructor() {
    this.app = express();
    this.sessions = new Map();
    this.firecrawlTools = new FirecrawlToolsIntegration();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // JSON解析中间件
    this.app.use(express.json({ limit: '10mb' }));

    // CORS中间件
    this.app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      } else {
        res.setHeader('Access-Control-Allow-Origin', '*');
      }
      
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Origin, mcp-session-id, mcp-protocol-version');
      res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id, mcp-protocol-version');
      
      if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
      }
      
      next();
    });

    // 请求日志中间件
    this.app.use((req, res, next) => {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`, {
        origin: req.headers.origin,
        sessionId: req.headers['mcp-session-id']
      });
      next();
    });
  }

  private setupRoutes(): void {
    // 健康检查端点
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        version: '1.12.0',
        transport: 'STREAMABLE_HTTP',
        firecrawlUrl: process.env.FIRECRAWL_API_URL || 'http://10.10.1.81:3002',
        protocol: '2025-06-18'
      });
    });

    // 会话管理端点
    this.app.get('/sessions', (req, res) => {
      const sessionList = Array.from(this.sessions.entries()).map(([id, data]) => ({
        id: id.substring(0, 8) + '...',
        ...data,
        age: Date.now() - data.createdAt
      }));
      
      res.json({
        totalSessions: this.sessions.size,
        sessions: sessionList,
        timestamp: new Date().toISOString()
      });
    });

    this.app.delete('/sessions', (req, res) => {
      const beforeCount = this.sessions.size;
      const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24小时
      
      for (const [sessionId, sessionData] of this.sessions.entries()) {
        if (sessionData.createdAt < cutoffTime) {
          this.sessions.delete(sessionId);
        }
      }
      
      const afterCount = this.sessions.size;
      res.json({
        message: 'Session cleanup completed',
        removed: beforeCount - afterCount,
        remaining: afterCount
      });
    });

    // 主MCP端点
    this.app.post('/mcp', this.handleMCPRequest.bind(this));
    this.app.get('/mcp', this.handleMCPGet.bind(this));
    this.app.delete('/mcp', this.handleMCPDelete.bind(this));
  }

  private async handleMCPRequest(req: Request, res: Response): Promise<void> {
    try {
      const message = req.body;
      
      // 验证JSON-RPC格式
      if (!message || !message.jsonrpc || message.jsonrpc !== '2.0') {
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32600,
            message: 'Invalid JSON-RPC message'
          },
          id: message?.id || null
        });
        return;
      }

      // 处理初始化请求
      if (message.method === 'initialize') {
        await this.handleInitialize(req, res, message);
        return;
      }

      // 处理工具列表请求
      if (message.method === 'tools/list') {
        res.json({
          jsonrpc: '2.0',
          id: message.id,
          result: { tools: TOOLS }
        });
        return;
      }

      // 处理工具调用
      if (message.method === 'tools/call') {
        await this.handleToolCall(req, res, message);
        return;
      }

      // 处理其他请求
      res.status(202).send();
      
    } catch (error) {
      console.error('Error handling MCP request:', error);
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error'
        },
        id: null
      });
    }
  }

  private async handleInitialize(req: Request, res: Response, message: any): Promise<void> {
    const sessionId = crypto.randomUUID();
    const clientVersion = message.params?.protocolVersion || '2025-06-18';
    
    this.sessions.set(sessionId, {
      initialized: true,
      createdAt: Date.now(),
      protocolVersion: clientVersion,
      clientInfo: message.params?.clientInfo
    });
    
    console.log('Client initialization:', {
      sessionId: sessionId.substring(0, 8) + '...',
      clientVersion,
      clientInfo: message.params?.clientInfo
    });
    
    res.setHeader('mcp-session-id', sessionId);
    res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');
    res.json({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: '2025-06-18',
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
          logging: {}
        },
        serverInfo: {
          name: 'firecrawl-mcp',
          version: '1.12.0'
        }
      }
    });
  }

  private async handleToolCall(req: Request, res: Response, message: any): Promise<void> {
    try {
      const toolName = message.params?.name;
      const toolArgs = message.params?.arguments || {};
      
      if (!toolName) {
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32602,
            message: 'Missing tool name'
          },
          id: message.id
        });
        return;
      }

      console.log(`Executing tool: ${toolName}`, toolArgs);
      
      const result = await this.firecrawlTools.executeToolCall(toolName, toolArgs);
      
      res.json({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }]
        }
      });
      
    } catch (error) {
      console.error('Tool execution error:', error);
      res.json({
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: -32603,
          message: 'Tool execution failed',
          data: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  }

  private handleMCPGet(req: Request, res: Response): void {
    res.status(405).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed - SSE not implemented'
      },
      id: null
    });
  }

  private handleMCPDelete(req: Request, res: Response): void {
    const sessionId = req.headers['mcp-session-id'] as string;
    if (sessionId && this.sessions.has(sessionId)) {
      this.sessions.delete(sessionId);
      res.status(200).send('Session terminated');
    } else {
      res.status(404).send('Session not found');
    }
  }

  public listen(port: number, host: string): void {
    this.app.listen(port, host, () => {
      console.log(`🚀 Simple MCP Server listening on http://${host}:${port}`);
      console.log(`📋 Health check: http://${host}:${port}/health`);
      console.log(`🔗 MCP endpoint: http://${host}:${port}/mcp`);
      console.log(`🌐 Firecrawl URL: ${process.env.FIRECRAWL_API_URL || 'http://10.10.1.81:3002'}`);
      console.log(`📡 Protocol: MCP 2025-06-18`);
    });
  }

  public cleanup(): void {
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24小时
    let cleaned = 0;
    
    for (const [sessionId, sessionData] of this.sessions.entries()) {
      if (sessionData.createdAt < cutoffTime) {
        this.sessions.delete(sessionId);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`Cleaned up ${cleaned} expired sessions`);
    }
  }
}