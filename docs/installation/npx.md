# NPX (Node Package Execute)

## Overview

NPX provides the simplest way to run Firecrawl MCP Server without any installation. It's perfect for testing, development, and temporary usage scenarios.

## Prerequisites

- Node.js 18 or higher
- npm (comes with Node.js)
- Internet connection (for downloading the package)
- Firecrawl API Key

## Installation

### Quick Install - One Line

```bash
env FIRECRAWL_API_KEY=fc-your-api-key-here npx -y firecrawl-mcp
```

### Step-by-Step

1. **Check Node.js Version**
   ```bash
   node --version
   # Should be 18.0.0 or higher
   ```

2. **Get Firecrawl API Key**
   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

3. **Run Firecrawl MCP**
   ```bash
   env FIRECRAWL_API_KEY=fc-your-api-key-here npx -y firecrawl-mcp
   ```

## Configuration

### Basic Configuration

```bash
env FIRECRAWL_API_KEY=fc-your-api-key-here npx -y firecrawl-mcp
```

### Advanced Configuration

```bash
env FIRECRAWL_API_KEY=fc-your-api-key-here \
FIRECRAWL_RETRY_MAX_ATTEMPTS=5 \
FIRECRAWL_RETRY_INITIAL_DELAY=2000 \
FIRECRAWL_RETRY_MAX_DELAY=30000 \
FIRECRAWL_RETRY_BACKOFF_FACTOR=3 \
FIRECRAWL_CREDIT_WARNING_THRESHOLD=2000 \
FIRECRAWL_CREDIT_CRITICAL_THRESHOLD=500 \
npx -y firecrawl-mcp
```

### Self-Hosted Configuration

```bash
env FIRECRAWL_API_URL=https://your-firecrawl-instance.com \
FIRECRAWL_API_KEY=your-self-hosted-key \
npx -y firecrawl-mcp
```

### Configuration File Alternative

Create a `.env` file:
```bash
# .env
FIRECRAWL_API_KEY=fc-your-api-key-here
FIRECRAWL_RETRY_MAX_ATTEMPTS=5
FIRECRAWL_CREDIT_WARNING_THRESHOLD=2000
```

Then run:
```bash
export $(cat .env | xargs) && npx -y firecrawl-mcp
```

## Verification

### Test Installation

1. **Run the Server**
   ```bash
   env FIRECRAWL_API_KEY=fc-your-api-key-here npx -y firecrawl-mcp
   ```

2. **Check Output**
   You should see:
   ```
   [INFO] Firecrawl MCP Server initialized successfully
   [INFO] Starting server with stdio transport
   [INFO] Available tools: scrape, search, map, crawl, extract, batch_scrape
   ```

3. **Test API Connection**
   ```bash
   # In another terminal, test the API key
   curl -H "Authorization: Bearer fc-your-api-key-here" https://api.firecrawl.dev/v1/test
   ```

### Expected Output

```
[INFO] Firecrawl MCP Server initialized successfully
[INFO] Starting server with stdio transport
[INFO] Server listening on stdio
[INFO] Available tools: scrape, search, map, crawl, extract, batch_scrape
```

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| **Node.js version too low** | Upgrade to Node.js 18+ |
| **API key invalid** | Verify API key format and validity |
| **Network timeouts** | Check internet connection and firewall |
| **Permission errors** | Use `sudo` if needed, or check npm permissions |

### Node.js Issues

1. **Check Node.js version**:
```bash
node --version
npm --version
```

2. **Upgrade Node.js**:
```bash
# Using nvm (recommended)
nvm install 18
nvm use 18

# Or download from nodejs.org
```

3. **Fix npm permissions**:
```bash
# Linux/macOS
sudo chown -R $(whoami) ~/.npm
sudo chown -R $(whoami) /usr/local/lib/node_modules

# Or use npx (no installation needed)
```

### API Key Issues

1. **Verify API key format**:
```bash
echo $FIRECRAWL_API_KEY | grep -E "^fc-"
```

2. **Test API key directly**:
```bash
curl -H "Authorization: Bearer $FIRECRAWL_API_KEY" https://api.firecrawl.dev/v1/test
```

### Network Issues

1. **Check internet connection**:
```bash
curl -I https://api.firecrawl.dev
```

2. **Test with different registry**:
```bash
env FIRECRAWL_API_KEY=fc-your-api-key-here npx --registry https://registry.npmjs.org -y firecrawl-mcp
```

3. **Proxy configuration**:
```bash
env HTTP_PROXY=http://proxy.company.com:8080 \
HTTPS_PROXY=http://proxy.company.com:8080 \
FIRECRAWL_API_KEY=fc-your-api-key-here \
npx -y firecrawl-mcp
```

## Debug Mode

Enable debug logging:

```bash
env DEBUG=firecrawl-mcp:* \
FIRECRAWL_API_KEY=fc-your-api-key-here \
npx -y firecrawl-mcp
```

### Specific Debug Modules

```bash
env DEBUG=firecrawl-mcp:server,firecrawl-mcp:tools \
FIRECRAWL_API_KEY=fc-your-api-key-here \
npx -y firecrawl-mcp
```

## Advanced Configuration

### Custom Retry Settings

```bash
env FIRECRAWL_API_KEY=fc-your-api-key-here \
FIRECRAWL_RETRY_MAX_ATTEMPTS=10 \
FIRECRAWL_RETRY_INITIAL_DELAY=500 \
FIRECRAWL_RETRY_MAX_DELAY=60000 \
FIRECRAWL_RETRY_BACKOFF_FACTOR=2 \
npx -y firecrawl-mcp
```

### Credit Monitoring

```bash
env FIRECRAWL_API_KEY=fc-your-api-key-here \
FIRECRAWL_CREDIT_WARNING_THRESHOLD=5000 \
FIRECRAWL_CREDIT_CRITICAL_THRESHOLD=1000 \
npx -y firecrawl-mcp
```

### Environment Variables File

Create `firecrawl.env`:
```bash
# firecrawl.env
FIRECRAWL_API_KEY=fc-your-api-key-here
FIRECRAWL_RETRY_MAX_ATTEMPTS=5
FIRECRAWL_CREDIT_WARNING_THRESHOLD=2000
FIRECRAWL_API_URL=https://api.firecrawl.dev
```

Usage:
```bash
export $(grep -v '^#' firecrawl.env | xargs) && npx -y firecrawl-mcp
```

## Usage Examples

### Basic Usage

```bash
# Start the server
env FIRECRAWL_API_KEY=fc-your-api-key-here npx -y firecrawl-mcp
```

### With SSE Mode

```bash
env SSE_LOCAL=true \
FIRECRAWL_API_KEY=fc-your-api-key-here \
npx -y firecrawl-mcp
```

### With Custom Port

```bash
env PORT=3001 \
FIRECRAWL_API_KEY=fc-your-api-key-here \
npx -y firecrawl-mcp
```

## Performance Tips

1. **Use latest Node.js**: Always use the latest LTS version
2. **Clear npm cache**: If experiencing issues, clear the cache
3. **Use environment files**: For complex configurations
4. **Test API key first**: Verify API key works before running the server

## Common Use Cases

### Development and Testing

```bash
# Quick testing
env FIRECRAWL_API_KEY=fc-your-api-key-here npx -y firecrawl-mcp
```

### CI/CD Integration

```yaml
# GitHub Actions example
- name: Test Firecrawl MCP
  run: |
    env FIRECRAWL_API_KEY=${{ secrets.FIRECRAWL_API_KEY }} npx -y firecrawl-mcp --test
```

### Temporary Production Usage

```bash
# Production-ready configuration
env FIRECRAWL_API_KEY=fc-your-api-key-here \
FIRECRAWL_RETRY_MAX_ATTEMPTS=5 \
FIRECRAWL_CREDIT_WARNING_THRESHOLD=1000 \
npx -y firecrawl-mcp
```

## Support

- **Documentation**: [Firecrawl Docs](https://docs.firecrawl.dev)
- **Node.js**: [Node.js Website](https://nodejs.org)
- **npm**: [npm Documentation](https://docs.npmjs.com)
- **API Key Issues**: [Firecrawl API Dashboard](https://www.firecrawl.dev/app/api-keys)

## Environment-Specific Notes

- No installation required - runs directly from npm
- Always uses the latest version (use `--package` for specific versions)
- Downloads the package on first run, caches for subsequent runs
- Perfect for testing and development scenarios
- Can be used in CI/CD pipelines
- Works across all operating systems

---

**Environment Compatibility**: ✅ Verified
**Last Tested**: September 2024
**Firecrawl MCP Version**: Latest
**Node.js Version**: 18+ (recommended 20+)
**npm Version**: Latest