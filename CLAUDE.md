# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Building and Running
```bash
# Build the project
npm run build

# Start the server (stdio transport)
npm start

# Start with Streamable HTTP transport (recommended)
env STREAMABLE_HTTP=true FIRECRAWL_API_KEY=your-key HOST=0.0.0.0 PORT=3000 npm start

# Start with local SSE transport (legacy)
env SSE_LOCAL=true FIRECRAWL_API_KEY=your-key npm start
```

### Testing and Quality
```bash
# Run tests
npm test

# Run linting
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format
```

### Environment Configuration
Required environment variables:
- `FIRECRAWL_API_KEY`: Your Firecrawl API key (required for cloud API)
- `FIRECRAWL_API_URL`: Optional custom API endpoint for self-hosted instances

Transport modes:
- `STREAMABLE_HTTP=true`: Enable MCP 2025-06-18 Streamable HTTP transport
- `SSE_LOCAL=true`: Enable legacy local SSE transport  
- Default: stdio transport

## Code Architecture

### Core Server Structure
The project implements a Model Context Protocol (MCP) server with multiple transport mechanisms:

**Main Entry Point (`src/index.ts`)**
- Unified server initialization handling three transport modes
- Tool definitions and request handlers for 8 Firecrawl tools
- Comprehensive retry logic with exponential backoff
- Credit usage monitoring and rate limit handling

**Streamable HTTP Implementation (`src/mcp-streamable-http.ts`)**
- Standards-compliant MCP 2025-06-18 protocol implementation
- Full JSON-RPC 2.0 compliance with proper session management
- Protocol version negotiation and CORS handling
- Endpoint structure: `/mcp` for requests, `/health` for status

**Firecrawl Integration (`src/firecrawl-tools-integration.ts`)**
- Modular tool execution with unified error handling
- Type guards for parameter validation
- Automatic retry mechanisms for API calls
- Consistent response formatting across all tools

### Transport Layer Design
The server supports three transport mechanisms through a unified interface:

1. **Stdio Transport**: Default MCP transport for CLI tools
2. **Streamable HTTP**: Modern HTTP-based transport with session management
3. **SSE Transport**: Server-sent events for real-time communication

Transport selection is environment-driven, allowing the same codebase to serve different client requirements.

### Tool Architecture Pattern
Each of the 8 Firecrawl tools follows a consistent pattern:

1. **Type Guards**: Validate input parameters using TypeScript type guards
2. **Retry Logic**: Wrap operations in `withRetry()` for resilience  
3. **Response Formatting**: Standardized success/error response structure
4. **Logging**: Comprehensive operation tracking and performance metrics

### Error Handling Strategy
Multi-layered error handling approach:

- **Tool Level**: Individual tool validation and execution errors
- **Transport Level**: Protocol-specific error formatting (JSON-RPC for HTTP, text for stdio)
- **Integration Level**: Firecrawl API errors with automatic retries
- **Server Level**: Global error catching with logging and monitoring

### Configuration Management
Environment-driven configuration with sensible defaults:

- Retry configuration (attempts, delays, backoff factors)
- Credit thresholds for usage monitoring
- Transport-specific settings (ports, origins, session management)
- API endpoint flexibility (cloud vs self-hosted)

### Key Integration Points

**MCP SDK Integration**:
- Uses `@modelcontextprotocol/sdk` for protocol compliance
- Implements standard MCP server patterns and request handlers
- Supports tool listing, execution, and capability negotiation

**Firecrawl SDK Integration**:
- Wraps `@mendable/firecrawl-js` with MCP-compatible interfaces  
- Handles both cloud API and self-hosted instance configurations
- Provides comprehensive tool coverage (scrape, crawl, search, extract, etc.)

**Express Framework Integration**:
- Used specifically for HTTP and SSE transports
- CORS configuration for cross-origin requests
- Middleware for JSON parsing, logging, and error handling

This architecture enables the server to function as a bridge between MCP clients and Firecrawl's web scraping capabilities while maintaining protocol compliance and operational reliability.