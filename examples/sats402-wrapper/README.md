# Optional SATS-402 Wrapper Example

SATS-402 is a Bitcoin-native paid-delivery pattern for HTTP 402-style API and MCP responses. The response body is encrypted before delivery, and the paying agent decrypts it locally only after a Lightning preimage is observed.

An unofficial permissionless wrapper proof for Firecrawl responses is available here:

https://github.com/Lumen-Founder/firecrawl-sats402-wrapper

Related discussion:

https://github.com/firecrawl/firecrawl-mcp-server/issues/220

The wrapper keeps Firecrawl as the upstream data provider. It does not bypass Firecrawl auth, billing, API keys, rate limits, or usage limits. Real upstream mode uses a normal `FIRECRAWL_API_KEY` and calls Firecrawl's scrape API before SATS-402 locks response delivery.

Demo command from the standalone proof:

```bash
npm run firecrawl:demo -- --url https://tvp.fund/philosophy/
```

The proof path uses local real-LND regtest to create a hold invoice, pay a merchant invoice, observe the Lightning preimage, settle the agent-side hold invoice with the same preimage, and decrypt the Firecrawl markdown locally. It reports `custody: false` and `credit_extended: false`.

This example is optional and unofficial. Maintainers should feel free to move, rename, edit, or reduce it to fit the preferred Firecrawl docs/examples structure.
