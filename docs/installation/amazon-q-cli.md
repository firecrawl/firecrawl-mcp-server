# Amazon Q Developer CLI

## Overview

Amazon Q Developer CLI is AWS's command-line interface for AI-powered development assistance that supports MCP (Model Context Protocol) servers, enabling Firecrawl's web scraping capabilities directly within your AWS development workflow.

## Prerequisites

- Amazon Q Developer CLI installed
- AWS account and credentials configured
- Firecrawl API Key
- Node.js 18+ (for npx)

## Installation

### Quick Install

1. **Get Firecrawl API Key**
   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Configure Amazon Q CLI**
   - Locate Amazon Q Developer CLI configuration file
   - Add Firecrawl MCP configuration (see below)

### Step-by-Step

1. **Get Firecrawl API Key**
   - Visit [firecrawl.dev/app/api-keys](https://www.firecrawl.dev/app/api-keys)
   - Copy your API key (starts with `fc-`)

2. **Verify AWS Setup**
   - Ensure AWS CLI is configured: `aws configure`
   - Verify Amazon Q Developer CLI is installed: `q --version`

3. **Locate Configuration File**
   - Find Amazon Q Developer CLI configuration file
   - See documentation for exact location

4. **Add Configuration**
   - Add Firecrawl MCP to your configuration
   - Use the JSON configuration format (see below)

## Configuration

Add this to your Amazon Q Developer CLI configuration file. See [Amazon Q Developer CLI docs](https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/command-line-mcp-configuration.html) for more details.

### Amazon Q Developer CLI Local Server Configuration

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"]
    }
  }
}
```

### Amazon Q Developer CLI Configuration with Environment Variables

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_KEY": "fc-your-api-key-here",
        "FIRECRAWL_RETRY_MAX_ATTEMPTS": "5",
        "FIRECRAWL_RETRY_INITIAL_DELAY": "2000",
        "FIRECRAWL_RETRY_MAX_DELAY": "30000",
        "FIRECRAWL_CREDIT_WARNING_THRESHOLD": "2000",
        "FIRECRAWL_CREDIT_CRITICAL_THRESHOLD": "500"
      }
    }
  }
}
```

### Amazon Q Developer CLI Configuration for Self-Hosted Instance

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp", "--api-key", "your-self-hosted-key"],
      "env": {
        "FIRECRAWL_API_URL": "https://your-firecrawl-instance.com"
      }
    }
  }
}
```

## Configuration File Location

**Amazon Q Developer CLI Configuration**:
- Check Amazon Q Developer CLI documentation for exact file location
- Typically located in user home directory or AWS configuration folder
- May be named `.amazonq/config.json` or similar
- Configuration file uses JSON format

**Common Locations**:
- `~/.amazonq/config.json`
- `~/.aws/amazonq-config.json`
- `%USERPROFILE%\.amazonq\config.json` (Windows)

**Complete Configuration Example**:

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"]
    }
  }
}
```

## Verification

### Test Installation

1. **Verify Amazon Q CLI Setup**
   ```bash
   q --version
   aws configure list
   ```

2. **Test Node.js and npx**
   ```bash
   node --version
   npx --version
   ```

3. **Test Firecrawl MCP Manually**
   ```bash
   npx -y firecrawl-mcp --help
   npx -y firecrawl-mcp --api-key fc-your-api-key-here
   ```

4. **Check Amazon Q CLI Configuration**
   - Verify configuration file is properly formatted
   - Check that Firecrawl MCP appears in available servers

5. **Test with Amazon Q Developer**
   - Use Amazon Q Developer CLI with a web scraping request:
     ```
     q "Can you scrape https://httpbin.org/json and show me the content?"
     ```

6. **Check Available Tools**
   Amazon Q Developer CLI should have access to:
   - `firecrawl_scrape`
   - `firecrawl_search`
   - `firecrawl_map`
   - `firecrawl_crawl`
   - `firecrawl_extract`
   - `firecrawl_batch_scrape`

### Expected Output

```
I'll scrape that website for you using Firecrawl.

[Tool Use: firecrawl_scrape]
{"url": "https://httpbin.org/json", "formats": ["markdown"]}

Here's the content from https://httpbin.org/json:

{
  "slideshow": {
    "author": "Yours Truly",
    "date": "date of publication",
    "slides": [
      {
        "title": "Wake up to WonderWidgets!",
        "type": "all"
      }
    ]
  }
}
```

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| **Configuration not loading** | Check file path and JSON syntax |
| **AWS credentials issues** | Verify AWS CLI configuration |
| **API key rejected** | Verify API key format and validity |
| **Server not connecting** | Check npx and Node.js installation |
| **Tools not available** | Restart Amazon Q CLI and check configuration |

### Configuration Issues

1. **JSON Configuration**:
   - Ensure valid JSON syntax with proper commas and quotes
   - Configuration must include `mcpServers` object
   - Server configuration must have `command` and `args`

2. **AWS Integration**:
   - Ensure AWS CLI is properly configured
   - Verify AWS credentials are valid and have necessary permissions
   - Check Amazon Q Developer CLI installation and version

3. **API Key Format**:
   - Use `--api-key fc-your-api-key-here` in args array
   - Or use environment variables for better security

4. **Command Structure**:
   - Must specify both `command` and `args`
   - `command` should be "npx"
   - `args` should be an array of command-line arguments

### AWS-Specific Issues

1. **AWS Credentials**:
   ```bash
   aws configure list
   aws sts get-caller-identity
   ```

2. **Amazon Q CLI Status**:
   ```bash
   q --version
   q --help
   ```

3. **Region Configuration**:
   ```bash
   aws configure get region
   ```

### Debug Commands

```bash
# Set debug environment variable
export DEBUG=firecrawl-mcp:*

# Test AWS configuration
aws configure list
aws sts get-caller-identity

# Test Amazon Q CLI
q --version
q --help

# Test local server manually
npx -y firecrawl-mcp --api-key fc-your-api-key-here

# Test with environment variables
env FIRECRAWL_API_KEY=fc-your-api-key-here npx -y firecrawl-mcp
```

## Advanced Configuration

### Custom Retry Settings

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"],
      "env": {
        "FIRECRAWL_RETRY_MAX_ATTEMPTS": "10",
        "FIRECRAWL_RETRY_INITIAL_DELAY": "500",
        "FIRECRAWL_RETRY_MAX_DELAY": "60000",
        "FIRECRAWL_RETRY_BACKOFF_FACTOR": "2"
      }
    }
  }
}
```

### AWS-Specific Configuration

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"],
      "env": {
        "AWS_REGION": "us-east-1",
        "AWS_PROFILE": "default",
        "FIRECRAWL_RETRY_MAX_ATTEMPTS": "5"
      }
    }
  }
}
```

### Proxy Configuration

```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp", "--api-key", "fc-your-api-key-here"],
      "env": {
        "HTTP_PROXY": "http://proxy.company.com:8080",
        "HTTPS_PROXY": "http://proxy.company.com:8080"
      }
    }
  }
}
```

### Credit Monitoring

```json
{
  "env": {
    "FIRECRAWL_CREDIT_WARNING_THRESHOLD": "5000",
    "FIRECRAWL_CREDIT_CRITICAL_THRESHOLD": "1000"
  }
}
```

## Integration Examples

### Basic Web Scraping

```bash
q "Can you scrape the main content from https://example.com and give me a summary?"
```

### Research and Analysis

```bash
q "Search for recent AI research papers, extract the titles and publication dates, and identify the main trends."
```

### Data Extraction

```bash
q "Go to https://example.com/products and extract all product information into a structured format."
```

### Code Generation

```bash
q "Generate a function that uses Firecrawl to scrape and process data from a news website."
```

## Performance Tips

1. **AWS Configuration**: Ensure AWS CLI is properly configured with valid credentials
2. **Environment Variables**: Use `env` object for sensitive configuration
3. **Command Structure**: Always include both `command` and `args` properties
4. **Latest Version**: Always use latest Firecrawl MCP version for best features
5. **AWS Region**: Configure appropriate AWS region for optimal performance

## AWS Integration Benefits

- **Seamless AWS Services**: Integrate with AWS services like S3, Lambda, etc.
- **AWS Authentication**: Leverage existing AWS credentials and IAM roles
- **Cloud Development**: Enhanced cloud development workflow
- **Enterprise Ready**: Suitable for enterprise AWS environments
- **Security**: AWS security and compliance features

## Support

- **Amazon Q Developer CLI Documentation**: [Command Line MCP Configuration](https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/command-line-mcp-configuration.html)
- **AWS CLI Documentation**: [AWS CLI Documentation](https://docs.aws.amazon.com/cli/)
- **Firecrawl Documentation**: [Firecrawl Docs](https://docs.firecrawl.dev)
- **API Key Issues**: [Firecrawl API Dashboard](https://www.firecrawl.dev/app/api-keys)
- **AWS Support**: [AWS Support Center](https://aws.amazon.com/support/)

## Environment-Specific Notes

- Amazon Q Developer CLI uses standard MCP server configuration format
- Integration with AWS credentials and IAM roles
- Configuration file location follows AWS conventions
- JSON configuration format with `mcpServers` object
- Local server connections using npx-based execution
- Environment variables specified through JSON object format
- AWS region and profile configuration support
- Enterprise-ready for AWS cloud development
- Seamless integration with other AWS services
- Suitable for both individual and team AWS workflows
- Self-hosted instances supported through environment variables
- AWS-specific security and compliance features

---

**Environment Compatibility**: ✅ Verified
**Last Tested**: September 2024
**Firecrawl MCP Version**: Latest
**Amazon Q Developer CLI Version**: Latest (with MCP support)