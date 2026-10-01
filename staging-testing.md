# Providers and Usage staging testing

The staging deployment workflow is
[image-staging.yml](https://github.com/firecrawl/firecrawl-mcp-server/actions/workflows/image-staging.yml).
Run it against `codex/mcp-providers-usage`:

```sh
gh workflow run image-staging.yml --ref codex/mcp-providers-usage
```

It publishes `ghcr.io/firecrawl/firecrawl-mcp-server-alpha:latest`.
Keel polls this tag every minute and rolls out both `scalable` and `sse`
in the `mcp-server-staging` namespace. A successful workflow only confirms
image publication; check both rollouts and the running image digest separately.
These are shared staging services. Production deployments are separate.

```sh
kubectl -n mcp-server-staging rollout status deployment/scalable
kubectl -n mcp-server-staging rollout status deployment/sse
kubectl -n mcp-server-staging get pods -o wide
```

## Live server checks

With Tailscale connected, the streamable HTTP endpoint is:

```text
http://mcp-server-staging-service:8080/v2/mcp
```

Build the branch, then run:

```sh
pnpm build
node scripts/verify-staging-mcp.mjs
```

The script reads `FIRECRAWL_API_KEY` from the environment, or the existing
macOS Keychain item with that service name. It never prints the key or account
credit values. It verifies the native sidebar entrypoint and icon, compares
the deployed UI bytes against `dist/usage.html`, and checks current credits,
historical usage, free provider discovery, and invalid-key recovery. It does
not execute provider capabilities, scrape pages, or send chat messages.
Discovery accepts API keys before Core validates them; invalid keys are
rejected at tool execution with `CREDENTIAL_INVALID`, rather than at initialize.

## Manual app acceptance

For a quick native host check in the Codex app, refresh the already installed
**Firecrawl Usage Dev** plugin and start a fresh chat. That development package
runs this checkout through its Keychain/stdio launcher. It tests the host UI
against the branch locally; it does not connect to the staged container.

1. Open the Firecrawl sidebar entry and pin it. Check the Firecrawl icon.
2. Browse providers, search, filter categories, and check logos and fallbacks.
3. Select a provider, then specific tools from another provider. Check the
   native composer context chips, without an automatic chat message.
4. Remove a chip and verify the next prompt no longer carries that selection.
5. Type a task in the native composer and verify the model knows the selected
   provider and tool IDs. Provider execution may consume credits; a context-only
   prompt such as "List the providers and tools I selected, without running them"
   verifies handoff without executing those capabilities.
6. Open Usage, refresh it, and check the balance/history. Compare the width with
   Providers and inspect a tool dialog in light and dark themes.

For a **ChatGPT Developer Mode check of the deployed staging server**, the
private Tailscale URL requires a Secure MCP Tunnel (or an approved public HTTPS
test endpoint). Entering that private HTTP URL as a public server does not
make it reachable by ChatGPT. See OpenAI's
[connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt)
and [Secure MCP Tunnel setup](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels).

Create/select a tunnel in
[Platform tunnel settings](https://platform.openai.com/settings/organization/tunnels),
associate it with the ChatGPT workspace, and run the official `tunnel-client`
on a machine with Tailscale access to the staging endpoint. The client needs
its own OpenAI runtime key as `CONTROL_PLANE_API_KEY` and the existing Firecrawl
key for upstream authorization. The values stay in process environment variables.

```sh
brew install openai/tools/tunnel-client
tunnel-client init --sample sample_mcp_with_dcr --profile firecrawl-staging \
  --tunnel-id YOUR_TUNNEL_ID \
  --mcp-server-url http://mcp-server-staging-service:8080/v2/mcp
export FIRECRAWL_STAGING_AUTH="Bearer $(security find-generic-password -s FIRECRAWL_API_KEY -w)"
tunnel-client run --profile firecrawl-staging \
  --mcp.extra-headers 'Authorization: env:FIRECRAWL_STAGING_AUTH' \
  --mcp.discovery-extra-headers 'Authorization: env:FIRECRAWL_STAGING_AUTH'
```

Keep the client running. In ChatGPT, enable Developer Mode under
**Settings → Security and login**, open **Plugins → +**, choose **Tunnel**,
and select that tunnel. Use the API-key-backed tunnel connection for this test;
the current staging service runs the `/v2/mcp` profile, not the production
`/v2/mcp-oauth` profile. Refresh connection metadata, start a new conversation,
and repeat the sidebar/composer checklist above. Verify the native chips,
pinning, and tool selection in the actual host; local preview and wire checks
do not substitute for this acceptance step.

The published production package remains on the production OAuth endpoint.
Do not replace the published Firecrawl connection with this staging test.
ZIP assembly, reviewer cases, review credentials, and video are separate steps.
