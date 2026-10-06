# Outcome workflow adapters

This app-linked source package retains its registered identity and `firecrawl`
router, and adds 15 MCP-native outcome skills. The canonical workflow source is
[`firecrawl/firecrawl-workflows` at `94cc91229d6cedc0613f140d3d013b150bc8e1b0`](https://github.com/firecrawl/firecrawl-workflows/tree/94cc91229d6cedc0613f140d3d013b150bc8e1b0/skills),
mirrored without content changes in
[`firecrawl/skills` at `28c134e8586268e2e9112a0f865bf1ddc3c4d4d6`](https://github.com/firecrawl/skills/tree/28c134e8586268e2e9112a0f865bf1ddc3c4d4d6/skills/workflows).
These adapters change execution and evidence routing, not upstream ownership.

Three names are shortened to meet the combined plugin/skill identity limit:
company-directories → `firecrawl-directories`, dashboard-reporting →
`firecrawl-dashboards`, website-design-clone → `firecrawl-design`.
The upstream workflow router is deliberately not copied.

Each skill contains its own runtime reference so packaging never relies on a
sibling link. Alexandria is optional contract-driven provider retrieval, not a
page cache or a required call for every outcome. Evidence requirements decide
whether to use providers, dedicated paper indexes, authoritative URLs or live
interaction. No minimum scrape count or paid provider execution is required.

## Validation and rollout boundary

The package/static tests validate inventory, identities, references, routing
policies and documented example arguments against MCP tool schemas. Mocked
tests exercise forwarding and provider/profile contracts. These are not proof
of skill activation, authenticated dashboard sessions, actual provider data,
freshness, host artifacts or performance improvements.

The design adapter uses the SDK-supported `images` scrape format, exposed by a
narrow MCP schema addition. Image URLs, branding and screenshots are evidence;
they do not guarantee a complete asset download, responsive reconstruction or
a faithful clone. QA cannot promise unavailable console/network/performance
measurements. Dashboard access requires an authorized remote session or supplied
evidence, not the user's existing desktop login.

This source PR does not publish, migrate the manifest, guess an endpoint or
change the app connection. Release owners must reconcile concurrent package
changes, choose the release version, verify the deployed ZIP and connection's
tool scan, and evaluate all skills in eligible installed hosts before rollout.
Installed tool schemas may lag this source. Keep public distribution changes
and host/account checks separate from this source adaptation.
