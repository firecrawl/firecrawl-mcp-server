# Setup and resource links

Adapted from `firecrawl-web/public/agent-onboarding/SKILL.md` (credentials, Paths D-F, documentation, and references) and `public/skills.md`. Open only the relevant source when the user needs detailed setup. This reference contains no credentials and does not implement authentication.

## Plugin connection

Use the host's plugin connection settings for ordinary setup. Reuse an existing connection. The default installation connects to `https://mcp.firecrawl.dev/v2/mcp-oauth` through the host's OAuth flow. The plugin never receives credentials from chat. Do not promise automatic signup or the optional credential alternatives below.

`firecrawl_credit_usage` can report the connected team's current balance when exposed. Confirm balance from its result rather than quoting plan defaults. A working connection does not establish Alexandria eligibility, acceptance of provider terms, or access to every tool.

## Optional credential and client paths

These come from the public onboarding guide and are relevant only when the user asks to set up a different client or build an integration:

- **Account/dashboard:** Sign in or create a Firecrawl account, then use the dashboard's key-management UI and the target client's secure connection settings.
- **CLI and skills:** The public guide offers `npx -y firecrawl-cli@latest init --all --browser`. Explain that it installs the CLI and skills for detected agents and opens browser authorization. Do not run it during normal plugin setup or without an explicit request for that installation scope.
- **Browser authorization for coding agents:** Follow the current public guide's PKCE/session authorization flow only when needed for the explicitly requested client. Keep the verifier and returned key in the authorized secret channel, and never echo a returned key into chat or app context.
- **WorkOS ID-JAG:** Use the linked auth guide only on a platform that can mint the required identity assertion. Do not infer support from the presence of a plugin.
- **Stripe Projects:** Relevant only to a project already using Stripe Projects or an explicitly requested setup. Follow the integration guide and the project's secret management.
- **REST without CLI:** A user can integrate directly with the API using a securely configured bearer key; a CLI install is optional.
- **Keyless fallback:** Use only tools actually exposed by the connected client and respect its limits. The public guide describes several keyless surfaces, but this plugin still requires a connected account for usage and Alexandria. Do not promise that every tool in the public guide is available here.

## Provider access and terms

Alexandria needs a key on a team with access. Read the actual provider contract and returned access status. A successful usage check is not a provider access grant.

For `THIRD_PARTY_DATA_TERMS_REQUIRED`, show the returned action URL or terms instructions. The current MCP can expose separate terms/show and terms/accept capabilities: read and present the exact terms first, and only accept after explicit authorization for the reviewed version and digest. Some eligibility or authority steps require an organization admin in the dashboard. Keep terms acceptance separate from data execution. Retry the original request only after acceptance/access is confirmed; if the same gate remains, stop and direct the user to an admin rather than looping.

Setup, provider selection, and an ordinary data request do not authorize terms acceptance. Do not write directly to provider-access storage or offer to bypass a gate.

## Official Firecrawl resources

| Resource | Use it for |
| --- | --- |
| [Public onboarding skill](https://www.firecrawl.dev/agent-onboarding/SKILL.md) | Current client paths, credentials, tool routing, and direct API guidance |
| [Human-readable onboarding](https://docs.firecrawl.dev/ai-onboarding#get-credentials) | Account and credential setup explanation |
| [Firecrawl documentation](https://docs.firecrawl.dev) | Current capabilities and troubleshooting |
| [API reference](https://docs.firecrawl.dev/api-reference/v2-introduction) | Request/response schemas and endpoint parameters |
| [Alexandria guide](https://docs.firecrawl.dev/features/alexandria) | Catalogue discovery, provider contracts, and execution |
| [Sign in or create an account](https://www.firecrawl.dev/signin?view=signup&source=agent-suggested) | Human account setup |
| [Dashboard](https://www.firecrawl.dev/app) | Account, usage, and key management |
| [Data-source settings](https://www.firecrawl.dev/app/settings?tab=data-sources) | Organization-admin provider access review |
| [ID-JAG authentication guide](https://www.firecrawl.dev/auth.md) | Supported agent-platform authentication |
| [Stripe Projects integration](https://docs.firecrawl.dev/integrations/stripe-projects) | Credentials for an existing Stripe Projects setup |
| [CLI and core skills](https://github.com/firecrawl/cli) | Explicitly requested CLI installation and command workflows |
| [Build/integration skills](https://github.com/firecrawl/skills) | SDK and application integration patterns |
| [Workflow skills](https://github.com/firecrawl/firecrawl-workflows) | Research, shopping, lead discovery, SEO, QA, knowledge bases, and other deliverables |
| [Skills overview](https://www.firecrawl.dev/skills) | Human overview of Firecrawl skills and compatible agents |

Reference content and links are discovery aids. Live tool schemas and actual responses govern execution. If a link is unavailable, use the documentation index or the returned tool action URL rather than inventing a replacement API.
