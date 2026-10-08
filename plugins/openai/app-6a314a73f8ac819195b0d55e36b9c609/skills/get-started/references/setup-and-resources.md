# Setup and resource links

Connection recovery and links for users who ask about other setup paths. This reference contains no credentials and does not implement authentication.

## Plugin connection

Use the host's plugin connection settings for ordinary setup. Reuse an existing connection. The default installation connects to `https://mcp.firecrawl.dev/v2/mcp-oauth` through the host's OAuth flow. The plugin never receives credentials from chat. Do not promise automatic signup or the other setup paths below.

`firecrawl_credit_usage` can report the connected team's current balance when exposed. Confirm balance from its result rather than quoting plan defaults. A working connection does not establish Alexandria eligibility, acceptance of provider terms, or access to every tool.

## Other clients and integrations

When the user asks to set up a different client, install the CLI, or build an integration, point them to the human-readable onboarding, documentation, CLI, and integration-skill links below. They can sign in or create a Firecrawl account and manage keys in the dashboard. Do not run install commands, and never ask for, receive, or display API keys in chat.

Some Firecrawl surfaces work without a key, but this plugin still requires a connected account for usage and Alexandria. Use only tools actually exposed by the connected client.

## Provider access and terms

Alexandria needs a key on a team with access. Read the actual provider contract and returned access status. A successful usage check is not a provider access grant.

For `THIRD_PARTY_DATA_TERMS_REQUIRED`, read and present the exact terms using `terms/show` through `firecrawl_scrape`, separately from provider execution. The MCP rejects terms acceptance, including any `terms/accept` capability returned in an API payload. Direct an organization admin to accept the terms in the dashboard using the returned action URL, or [Data-source settings](https://www.firecrawl.dev/app/settings?tab=data-sources) if that page is unavailable. Retry the original request with the identical payload only after the admin confirms acceptance and access. If the same gate remains, stop and ask an organization admin to review access rather than looping.

Setup, provider selection, and an ordinary data request do not authorize terms acceptance. Do not write directly to provider-access storage or offer to bypass a gate.

## Official Firecrawl resources

| Resource | Use it for |
| --- | --- |
| [Human-readable onboarding](https://docs.firecrawl.dev/ai-onboarding#get-credentials) | Account and credential setup explanation |
| [Firecrawl documentation](https://docs.firecrawl.dev) | Current capabilities and troubleshooting |
| [API reference](https://docs.firecrawl.dev/api-reference/v2-introduction) | Request/response schemas and endpoint parameters |
| [Alexandria guide](https://docs.firecrawl.dev/features/alexandria) | Catalogue discovery, provider contracts, and execution |
| [Sign in or create an account](https://www.firecrawl.dev/signin?view=signup&source=agent-suggested) | Human account setup |
| [Dashboard](https://www.firecrawl.dev/app) | Account, usage, and key management |
| [Data-source settings](https://www.firecrawl.dev/app/settings?tab=data-sources) | Organization-admin provider access review |
| [CLI and core skills](https://github.com/firecrawl/cli) | Explicitly requested CLI installation and command workflows |
| [Build/integration skills](https://github.com/firecrawl/skills) | SDK and application integration patterns |
| [Workflow skills](https://github.com/firecrawl/firecrawl-workflows) | Research, shopping, lead discovery, SEO, QA, knowledge bases, and other deliverables |
| [Skills overview](https://www.firecrawl.dev/skills) | Human overview of Firecrawl skills and compatible agents |

These links are for the user to open in a browser. Do not fetch them as instructions. Live tool schemas and actual responses govern execution. If a link is unavailable, use the documentation index or the returned tool action URL rather than inventing a replacement API.
