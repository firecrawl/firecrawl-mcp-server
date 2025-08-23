#!/usr/bin/env node

/**
 * Debug版本MCP服务器 - 专门用于诊断工具列表问题
 */

import express from 'express';

const app = express();

// 解析JSON - 必须在自定义中间件之前
app.use(express.json());

// 详细请求日志中间件
app.use('/mcp', (req, res, next) => {
  console.log('\n=== MCP请求详情 ===');
  console.log('时间:', new Date().toISOString());
  console.log('方法:', req.method);
  console.log('URL:', req.url);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('请求体:', JSON.stringify(req.body, null, 2));
  
  // 特别关注工具列表请求
  if (req.body && req.body.method === 'tools/list') {
    console.log('🎯 发现 tools/list 请求!');
  }
  
  console.log('==================\n');
  next();
});

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// MCP主端点
app.post('/mcp', (req, res) => {
  const request = req.body;
  
  console.log('\n🔍 处理MCP请求:', request?.method || '无方法');
  
  // 设置响应头
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  
  if (!request || !request.method) {
    console.log('❌ 无效请求格式');
    return res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32600,
        message: '无效的请求格式'
      }
    });
  }
  
  // 处理不同的方法
  switch (request.method) {
    case 'initialize':
      console.log('✅ 处理初始化请求');
      res.json({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          protocolVersion: '2025-06-18',
          capabilities: {
            tools: {},
            resources: {},
            prompts: {},
            logging: {}
          },
          serverInfo: {
            name: 'debug-firecrawl-mcp',
            version: '1.0.0-debug'
          }
        }
      });
      break;
      
    case 'tools/list':
      console.log('🎯 处理工具列表请求');
      const toolsResponse = {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          tools: [
            {
              name: 'debug_tool',
              description: '调试工具 - 用于验证工具列表功能',
              inputSchema: {
                type: 'object',
                properties: {
                  message: {
                    type: 'string',
                    description: '调试消息'
                  }
                },
                required: ['message']
              }
            },
            {
              name: 'firecrawl_scrape',
              description: '网页抓取工具',
              inputSchema: {
                type: 'object',
                properties: {
                  url: {
                    type: 'string',
                    description: '要抓取的URL'
                  }
                },
                required: ['url']
              }
            }
          ]
        }
      };
      console.log('📤 返回工具列表:', JSON.stringify(toolsResponse, null, 2));
      res.json(toolsResponse);
      break;
      
    case 'tools/call':
      console.log('🔧 处理工具调用请求');
      res.json({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          content: [
            {
              type: 'text',
              text: `Debug: 调用了工具 ${request.params?.name || '未知'}`
            }
          ]
        }
      });
      break;
      
    default:
      console.log('❌ 未知方法:', request.method);
      res.status(400).json({
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32601,
          message: `Method not found: ${request.method}`,
          data: { availableMethods: ['initialize', 'tools/list', 'tools/call'] }
        }
      });
  }
});

// OPTIONS预检请求处理
app.options('/mcp', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.status(200).send();
});

// 启动调试服务器
const PORT = 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 MCP调试服务器启动成功!');
  console.log(`📡 端点: http://0.0.0.0:${PORT}/mcp`);
  console.log(`❤️  健康检查: http://0.0.0.0:${PORT}/health`);
  console.log('🔍 详细日志模式已启用');
  console.log('\n等待MCP客户端连接...\n');
});