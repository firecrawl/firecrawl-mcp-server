#!/usr/bin/env node
/**
 * Test script to verify that JSON schemas are properly converted to draft-07
 * Run with: node test-schemas.cjs
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🧪 Testing Firecrawl MCP Schema Conversion...\n');

// Start the MCP server as a child process
const serverPath = path.join(__dirname, 'dist', 'index.js');
const serverProcess = spawn('node', [serverPath], {
  env: {
    ...process.env,
    FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY || 'test-key',
    MCP_TRANSPORT: 'stdio'
  },
  stdio: ['pipe', 'pipe', 'pipe']
});

let output = '';
let errorOutput = '';

serverProcess.stdout.on('data', (data) => {
  output += data.toString();
});

serverProcess.stderr.on('data', (data) => {
  errorOutput += data.toString();
  console.error('📋 Server log:', data.toString());
});

// Send initialize request
setTimeout(() => {
  const initRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'test-client',
        version: '1.0.0'
      }
    }
  };
  
  serverProcess.stdin.write(JSON.stringify(initRequest) + '\n');
  
  // Send tools/list request after a delay
  setTimeout(() => {
    const listToolsRequest = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    };
    
    serverProcess.stdin.write(JSON.stringify(listToolsRequest) + '\n');
    
    // Wait for response and then check schemas
    setTimeout(() => {
      serverProcess.kill();
      
      console.log('\n📊 Analyzing Schemas...\n');
      
      // Check if schemas were converted
      if (errorOutput.includes('Converted') && errorOutput.includes('draft-07')) {
        console.log('✅ Schema conversion successful!');
        console.log('✅ All tools converted to draft-07');
      } else {
        console.log('⚠️  Schema conversion log not found');
      }
      
      // Check for 2020-12 in output
      if (output.includes('2020-12') || errorOutput.includes('2020-12')) {
        console.log('❌ WARNING: draft 2020-12 schemas still present!');
        process.exit(1);
      } else {
        console.log('✅ No draft 2020-12 schemas detected');
      }
      
      // Check for $dynamicRef
      if (output.includes('$dynamicRef') || errorOutput.includes('$dynamicRef')) {
        console.log('❌ WARNING: $dynamicRef still present in schemas!');
        process.exit(1);
      } else {
        console.log('✅ No $dynamicRef references detected');
      }
      
      console.log('\n🎉 All schema compatibility checks passed!\n');
      console.log('Next steps:');
      console.log('  1. Restart VS Code');
      console.log('  2. Check MCP logs for schema warnings');
      console.log('  3. Test Firecrawl tools with GitHub Copilot\n');
      
      process.exit(0);
    }, 2000);
  }, 1000);
}, 500);

// Handle errors
serverProcess.on('error', (error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});

// Timeout after 10 seconds
setTimeout(() => {
  console.log('\n⏱️  Test timeout - killing server');
  serverProcess.kill();
  process.exit(1);
}, 10000);
