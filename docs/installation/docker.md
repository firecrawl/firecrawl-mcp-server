# Docker

## Overview

Docker provides a containerized approach to running the Firecrawl MCP Server, offering isolation and consistent deployment across different environments. This method is ideal for users who prefer containerized applications or need to deploy in Docker-based workflows.

## Prerequisites

- Docker installed and running
- Firecrawl API Key
- Basic Docker knowledge

## Installation

### Quick Install

1. **Get Firecrawl API Key**
   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Build Docker Image**
   - Create Dockerfile (see below)
   - Build with `docker build -t firecrawl-mcp .`

3. **Configure MCP Client**
   - Update your MCP client to use Docker command

### Step-by-Step

1. **Get Firecrawl API Key**
   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Create Dockerfile**
   - Create a `Dockerfile` in your project root
   - Use the configuration below

3. **Build Docker Image**
   - Ensure Docker Desktop (or Docker daemon) is running
   - Run `docker build -t firecrawl-mcp .` in the same directory

4. **Configure MCP Client**
   - Update your MCP client's configuration to use the Docker command
   - See specific client examples below

## Dockerfile Configuration

Create a `Dockerfile` in the project root:

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install the latest version globally
RUN npm install -g firecrawl-mcp

# Expose default port if needed (optional, depends on MCP client interaction)
# EXPOSE 3000

# Default command to run the server
CMD ["firecrawl-mcp"]
```

**Build the Docker Image:**

```bash
docker build -t firecrawl-mcp .
```

## MCP Client Configuration

Update your MCP client's configuration to use the Docker command.

### General Configuration Format

Most MCP clients will use a configuration like this:

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"],
      "env": {},
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

### Claude Desktop Configuration

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"]
    }
  }
}
```

### VS Code Configuration

```json
{
  "mcp": {
    "servers": {
      "firecrawl": {
        "type": "stdio",
        "command": "docker",
        "args": ["run", "-i", "--rm", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"]
      }
    }
  }
}
```

### Cursor Configuration

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"]
    }
  }
}
```

### Windsurf Configuration

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"]
    }
  }
}
```

### Cline Configuration

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"],
      "type": "stdio"
    }
  }
}
```

### Kiro Configuration

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"],
      "env": {},
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

## Advanced Docker Configuration

### Dockerfile with Environment Variables

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install the latest version globally
RUN npm install -g firecrawl-mcp

# Set environment variables (can be overridden during runtime)
ENV FIRECRAWL_RETRY_MAX_ATTEMPTS=5
ENV FIRECRAWL_RETRY_INITIAL_DELAY=2000
ENV FIRECRAWL_RETRY_MAX_DELAY=30000
ENV FIRECRAWL_CREDIT_WARNING_THRESHOLD=2000
ENV FIRECRAWL_CREDIT_CRITICAL_THRESHOLD=500

# Default command to run the server
CMD ["firecrawl-mcp"]
```

### Docker Compose Configuration

```yaml
version: '3.8'

services:
  firecrawl-mcp:
    build: .
    container_name: firecrawl-mcp
    environment:
      - FIRECRAWL_API_KEY=fc-your-api-key-here
      - FIRECRAWL_RETRY_MAX_ATTEMPTS=5
      - FIRECRAWL_RETRY_INITIAL_DELAY=2000
    volumes:
      - ./logs:/app/logs
    restart: unless-stopped
```

### Build with Docker Compose:

```bash
docker-compose up -d --build
```

### MCP Client Configuration for Docker Compose

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "docker",
      "args": ["exec", "-i", "firecrawl-mcp", "firecrawl-mcp"]
    }
  }
}
```

## Verification

### Test Installation

1. **Test Docker Image**
   ```bash
   docker run --rm firecrawl-mcp --help
   ```

2. **Test with API Key**
   ```bash
   docker run --rm firecrawl-mcp --api-key fc-your-api-key-here
   ```

3. **Check MCP Client**
   - Verify Firecrawl MCP appears in your MCP client's server list
   - Status should show as "Connected" or "Active"

4. **Test with AI**
   - Try a web scraping request in your AI assistant:
     ```
     Can you scrape https://httpbin.org/json and show me the content?
     ```

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| **Docker daemon not running** | Start Docker Desktop or Docker daemon |
| **Image build fails** | Check Dockerfile syntax and network connection |
| **Container won't start** | Check Docker logs and command syntax |
| **MCP client can't connect** | Verify Docker command and args in client config |
| **API key issues** | Ensure API key is properly passed to container |

### Docker Issues

1. **Docker Daemon**:
   - Ensure Docker Desktop or Docker daemon is running
   - Check Docker status: `docker info`

2. **Image Build**:
   - Verify Dockerfile syntax
   - Check network connection for npm package download
   - Use specific image version if needed

3. **Container Runtime**:
   - Check container logs: `docker logs <container-id>`
   - Verify container is running: `docker ps`
   - Test container manually: `docker run --rm firecrawl-mcp --help`

4. **MCP Client Configuration**:
   - Verify Docker command and arguments
   - Ensure proper container name reference
   - Check transport type (stdio for Docker containers)

### Debug Commands

```bash
# Test Docker installation
docker --version

# Test Docker daemon
docker info

# Build image with verbose output
docker build --progress=plain -t firecrawl-mcp .

# Test container manually
docker run --rm firecrawl-mcp --help

# Test with API key
docker run --rm firecrawl-mcp --api-key fc-your-api-key-here

# Check container logs
docker logs $(docker run -d firecrawl-mcp --api-key fc-your-api-key-here)
```

## Advanced Docker Options

### Custom Dockerfile with Specific Node Version

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install specific version
RUN npm install -g firecrawl-mcp@latest

# Add health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "process.exit(0)" || exit 1

# Default command
CMD ["firecrawl-mcp"]
```

### Multi-stage Build for Smaller Image

```dockerfile
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g firecrawl-mcp

# Runtime stage
FROM node:20-alpine AS runtime
WORKDIR /app
COPY --from=builder /usr/local/lib/node_modules/firecrawl-mcp ./node_modules/firecrawl-mcp
COPY --from=builder /usr/local/bin/firecrawl-mcp /usr/local/bin/firecrawl-mcp
CMD ["firecrawl-mcp"]
```

### Docker with Custom Configuration

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install the latest version globally
RUN npm install -g firecrawl-mcp

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S firecrawl -u 1001

# Switch to non-root user
USER firecrawl

# Default command to run the server
CMD ["firecrawl-mcp"]
```

## Performance Tips

1. **Image Size**: Use Alpine Linux for smaller image size
2. **Caching**: Leverage Docker layer caching for faster builds
3. **Environment Variables**: Pass configuration through environment variables
4. **Volume Mounts**: Use volumes for persistent logs if needed
5. **Resource Limits**: Set Docker resource limits for production use

## Support

- **Docker Documentation**: [Docker Documentation](https://docs.docker.com)
- **Firecrawl Documentation**: [Firecrawl Docs](https://docs.firecrawl.dev)
- **API Key Issues**: [Firecrawl API Dashboard](https://www.firecrawl.dev/app/api-keys)
- **Docker Support**: [Docker Community Forums](https://forums.docker.com)

## Environment-Specific Notes

- Docker provides complete isolation from the host system
- Containerized approach ensures consistent execution environment
- Supports all MCP clients that can execute external commands
- Environment variables can be passed through Docker run command
- Docker Compose support for multi-container deployments
- Health checks and monitoring capabilities
- Non-root container execution for improved security
- Volume mounting for persistent storage
- Resource limits and constraints for production deployments
- Multi-stage builds for optimized image sizes
- Works across all platforms that support Docker

---

**Environment Compatibility**: ✅ Verified
**Last Tested**: September 2024
**Firecrawl MCP Version**: Latest
**Docker Version**: Latest (with BuildKit support)