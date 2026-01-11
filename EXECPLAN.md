# Nx monorepo: publish `firecrawl-mcp` + `@firecrawl/cli` (Node 22)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

## Purpose / Big Picture

Ship a production-grade Node.js 22+ codebase that supports both:

- An MCP server (`firecrawl-mcp`) for MCP clients.
- A terminal-first CLI (`@firecrawl/cli`) to avoid MCP tool-description overhead and enable agent/tool usage directly from a shell.

The outcome is observable by building the repo, running unit tests in CI, and running optional local integration tests against the real Firecrawl API (skipped in CI).

## Progress

- [x] (2026-01-11 16:48Z) Restructured into an Nx monorepo: `apps/firecrawl-mcp`, `apps/firecrawl-cli`, `libs/firecrawl-core`.
- [x] (2026-01-11 16:48Z) Ensured publishing as two npm packages via GitHub Actions: `firecrawl-mcp` and `@firecrawl/cli`.
- [x] (2026-01-11 16:48Z) Aligned runtime/tooling to Node.js `>=22.0.0` and updated Docker images/workflows.
- [x] (2026-01-11 16:48Z) Updated Firecrawl/MCP SDKs and made usage compatible with current APIs.
- [x] (2026-01-11 16:48Z) Added unit tests and local integration tests (real API) while keeping CI unit-only.
- [x] (2026-01-11 16:48Z) Updated docs without removing top-level credits in `README.md`.

## Surprises & Discoveries

- Observation: Zod v4 JSON-schema conversion (`toJSONSchema`) throws when given `z.record(...)`, which breaks MCP `tools/list` generation in `firecrawl-fastmcp`.
  Evidence: Reproduced a runtime error when `tools/list` attempted to serialize `z.record(...)`, resolved by replacing records with `z.object({}).catchall(...)` in `libs/firecrawl-core/src/lib/schemas.ts`.

## Decision Log

- Decision: Publish exactly two packages and keep the repository URL unchanged.
  Rationale: The project is already referenced by many registries/integrations; changing URLs would cause widespread breakage.
  Date/Author: 2026-01-11 / Codex

- Decision: Bump npm versions to `4.0.0`.
  Rationale: Node engine requirement is now `>=22`, and the refactor includes API/dependency alignment and packaging changes; treat as a breaking release.
  Date/Author: 2026-01-11 / Codex

## Outcomes & Retrospective

Outcome: The repo builds via Nx, publishes `firecrawl-mcp` + `@firecrawl/cli`, and passes unit tests. Local integration tests validate all tools against the real API when `FIRECRAWL_API_KEY` is provided via environment or `.env`.

If re-doing this work: consider staging the rollout (Node engine bump + monorepo + SDK upgrade) into separate releases to reduce blast radius, and add a lightweight “contract test” for tool input/output shapes that can run without API credentials.

## Context and Orientation

This repo uses npm workspaces and Nx to manage multiple packages:

- `apps/firecrawl-mcp`: The MCP server package published as `firecrawl-mcp`. Entry: `apps/firecrawl-mcp/src/mcp.ts` → `apps/firecrawl-mcp/dist/mcp.js`.
- `apps/firecrawl-cli`: The terminal CLI package published as `@firecrawl/cli`. Entry: `apps/firecrawl-cli/src/cli.ts` → `apps/firecrawl-cli/dist/cli.js`.
- `libs/firecrawl-core`: Shared internal code (schemas, client creation, utilities), not published.

GitHub Actions:

- `.github/workflows/ci.yml`: Runs `npm test` (unit tests only).
- `.github/workflows/publish.yml`: Builds and publishes both packages on release.
- `.github/workflows/registry.yml`: Publishes `server.json` to the MCP Registry on release.

## Plan of Work

The refactor is implemented by:

1. Creating Nx projects for each app and the shared library, keeping the runtime entrypoints small and stable.
2. Centralizing Firecrawl schema definitions and client creation in `libs/firecrawl-core` so CLI and MCP stay consistent.
3. Publishing only `apps/firecrawl-mcp` and `apps/firecrawl-cli`, keeping `libs/firecrawl-core` private.
4. Adding a unit-test suite that can run without network access, plus opt-in integration tests that require `FIRECRAWL_API_KEY`.
5. Updating documentation to show `npx` usage and to keep credits intact.

## Concrete Steps

From the repository root:

    npm ci
    npm run build
    npm test

Optional (local-only) real API validation:

    export FIRECRAWL_API_KEY=fc-YOUR_API_KEY
    npm run test:integration

## Validation and Acceptance

- `npm test` passes with no network access (CI-safe).
- `npm run test:integration` passes locally when `FIRECRAWL_API_KEY` is set (validates CLI + MCP stdio + MCP httpStream against real Firecrawl).
- `npx -y firecrawl-mcp` starts an MCP server on stdio.
- `npx -y -p @firecrawl/cli firecrawl scrape https://example.com --json '{"formats":["markdown"]}'` returns JSON output on stdout.

## Idempotence and Recovery

All commands in `Concrete Steps` are safe to re-run. If builds fail due to stale artifacts, delete local build outputs and retry:

    rm -rf apps/firecrawl-mcp/dist apps/firecrawl-cli/dist
    npm run build

## Artifacts and Notes

- Registry metadata lives in `server.json` and is published via `.github/workflows/registry.yml`.
- Package tarballs can be previewed locally with:

    npm pack --workspace apps/firecrawl-mcp --dry-run
    npm pack --workspace apps/firecrawl-cli --dry-run

## Interfaces and Dependencies

- Firecrawl SDK: `@mendable/firecrawl-js`
- MCP SDK (for tests/clients): `@modelcontextprotocol/sdk`
- MCP server wrapper: `firecrawl-fastmcp`
