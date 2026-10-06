# Firecrawl onboarding forms

This change is stacked on the `get-started` onboarding skill. It adds
`firecrawl_onboarding` to the authenticated full/account tool surface; the
restricted search profile retains its existing allowlist. Plugin descriptions,
starter prompts, app identity, connection URL, and version remain unchanged.

## Flow

1. The skill verifies the existing Firecrawl connection and explains relevant
   starting points using available context.
2. If a first-use goal is missing, the agent calls `firecrawl_onboarding` with
   two to five concise suggestions, or no arguments for the default choices.
   Alexandria is the first default choice. Raw memory and chat history must not
   be included in tool arguments.
3. A client declaring `extensions["openai/elicitation"].form` receives a form.
   Its required choice and optional question/URL return to the tool.
4. The tool returns `selected`, `cancelled`, or `declined`. The agent discovers
   a matching live contract and continues only after a concrete goal is known.
   The form tool performs no discovery, paid execution, or memory writes.

Without the form capability, the tool returns `unsupported` with readable
choices. The skill can use another available native question tool, then ordinary
chat if necessary. Cancelling does not select a goal or immediately reopen a form.

## Transport compatibility

[OpenAI's form extension](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md#openai-form-elicitation)
requires MCP `2026-07-28` and multi round-trip requests (MRTR) for registered
servers. Direct connections also support the legacy server-initiated flow.
The pinned SDK does not implement modern HTTP/MRTR, so this PR adds a bounded
compatibility bridge instead of changing SDK versions.

Modern HTTP requests use the same MCP endpoint and authentication function.
The bridge validates per-request metadata and mirrored HTTP headers, then runs
the existing FastMCP handlers over an in-process transport. It supports
`server/discover`, `tools/list`, `tools/call`, and `ping`, advertises tools only,
and returns a protocol error for other modern RPCs. Modern stdio and subscription
RPCs are outside this implementation.

On the first form call, the result is `input_required` with an
`openai/elicitation/create` request. The client retries the original call with
`params.inputResponses.firecrawl_onboarding_goal`. No shared session storage or
`requestState` is needed: choices remain in the original arguments, and the
reply is validated against those choices. Replies have no authority over account
access, billing, credentials, or stored preferences. Every retry authenticates
through the existing account/profile checks.

Legacy HTTP remains on the existing transport. Because it is stateless, it does
not retain initialized client capabilities and receives the chat fallback.
Legacy direct stdio connections can use a server-initiated form request (with
a two-minute request timeout). The form result is validated before returning.

The FastMCP patch exposes form capabilities and MRTR responses to tool handlers.
The proxy patch adds a request interceptor ahead of the legacy HTTP transport.
Both packages are bundled so npm/npx distributions include their patches.
AJV and AJV formats are direct dependencies for generated imports in that bundle.

## Validation and rollout

Run `npm test`, `npx tsc --noEmit`, and the focused onboarding tests:

```sh
npm run build
node --test tests/mcp-onboarding.test.mjs tests/build-bundle.test.mjs
```

The tests exercise real local HTTP and stdio MCP servers with simulated clients:
form creation, a retry on another process, personalized choices, missing input,
cancellation, invalid answers, capability fallback, login guards, protocol/header
validation, and legacy compatibility. Upstream authentication is a local fixture;
these tests do not prove rendering in an actual OpenAI client.

Deploy the server change before expecting the registered Firecrawl connection
to expose this tool. Uploading only the plugin ZIP does not deploy the server.
After deployment, test a clean install on a supported client, invoke `get-started`,
leave the form pending, answer it, and cancel a second run. Verify the accepted
answer reaches the agent and that no paid sample runs without a concrete target.
Also test an unsupported client's ordinary chat fallback.

OpenAI's [platform support table](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md#platform-support)
describes expected launch support; its web column refers to Work in the browser
and excludes classic ChatGPT. Client rendering and installation setup must be
verified separately from server protocol tests.
