import { z } from 'zod';
import {
  ALEXANDRIA_CATALOGUE_VERTICALS,
  ALEXANDRIA_SEARCH_INSTRUCTIONS,
  defaultDomainTools,
  hasAlexandria,
  normalizeSearchSources,
  searchQueryIsValid,
} from '../alexandria';
import { requestOrigin } from '../origin';
import type {
  ExtraToolsContext,
  FirecrawlMcpServerHooks,
  ToolRegistrar,
  ToolResult,
} from '../server.js';
import { searchOutputSchema, structuredCompact } from '../tool-output';
import {
  assertExchangeCredential,
  postSearchWithFallback,
  relayExchangeError,
  relayTermsRequired,
  removeEmptyTopLevel,
  SEARCH_DOMAINS_CONFLICT_MESSAGE,
  searchDomainsAreExclusive,
  searchToolBaseFields,
} from '../tool-helpers.js';
import {
  SEARCH_PROFILE_TOOLS,
  SEARCH_SURFACE_VARIANT_TOOLS,
} from './profiles.js';

// Search-surface copies of the two Alexandria tools.
// Same parameters and executor as the full-surface tools; only the
// descriptions differ, so they name nothing that surface does not register
// (no crawl, map, interact, monitor, parse or feedback references). Registered
// on the search surface in place of the module-level tools above.
function searchSurfaceScrapeDescription(safeMode: boolean): string {
  return `
Scrape one URL and return its content, or execute catalogued Alexandria capabilities. URL mode returns markdown by default, or HTML, links, screenshots, branding data, a targeted answer, or JSON matching a supplied schema, plus page metadata. Firecrawl may serve recently indexed content; set \`maxAge: 0\` for a live fetch. A successful response does not by itself confirm the page is still current. ${safeMode ? 'A named browser profile loads saved session data without saving changes to it.' : 'Browser actions can change the live page, and a named browser profile can load saved session data and overwrite its stored state.'}

\`firecrawl_search\` with \`sources\` unset and \`firecrawl_find_tools\` can discover providers for the same fields across several pages; a matching Alexandria provider returns typed records in one call.

Alexandria mode: \`alexandria\` selects catalogued capability execution and is mutually exclusive with \`url\`. Alexandria execution is billed at the capability's listed price and needs a team with Alexandria enabled.
`;
}

const SEARCH_SURFACE_FIND_TOOLS_DESCRIPTION =
  'Browse Alexandria data providers and workflows or read a selected contract. Alexandria covers ' + ALEXANDRIA_CATALOGUE_VERTICALS + ': typed, sourced records through published contracts. Prefer normal firecrawl_search for a data task; it already returns matching providers. Use this tool when the contract you need was not returned in full, to browse a category when search found nothing, or before scraping the same fields from several pages. Discovery is free. Use query for semantic discovery or urls to find providers for a website. With no arguments, browse categories, then providers and tools. Contracts describe the inputs and outputs for execution through firecrawl_scrape. nextTool identifies further discovery or pagination. Discovery does not execute providers. Use firecrawl_search when you also need web results.';

// Search-surface variant of firecrawl_search. It takes no scrapeOptions and
// builds the outbound /v2/search body from an explicit set of fields, so the
// surface never asks the API to fetch page content. The omission is enforced
// by the schema and the body construction, not a runtime filter.
function registerMarketplaceSearchTool(
  registrar: ToolRegistrar,
  { getClient: getClientFn, hasCredential }: ExtraToolsContext
): void {
  registrar.addTool({
    name: 'firecrawl_search',
    _meta: { 'anthropic/alwaysLoad': true },
    annotations: {
      title: 'Firecrawl web search',
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
    description: `
Search web and specialized indexes, returning ranked results with query-relevant highlights. Each web result is a title, URL, and description. Operators include quoted phrases, \`-term\`, \`site:host\`, \`inurl:term\`, \`intitle:term\`, and \`related:host\`; the set is non-exhaustive. \`includeDomains\` and \`excludeDomains\` are mutually exclusive hostname filters; categories limit result types to \`research\`, \`pdf\`, \`developer\`, or \`gov\`.

For a programming question, add \`categories: ["developer"]\`. It searches an index of public repositories, GitHub issues, merged pull requests, repository READMEs, and code documentation, and returns the results in \`data.web\` with \`category: "developer"\`.

For a legal or regulatory question, \`categories: ["gov"]\` returns results in \`data.web\` with \`category: "gov"\` and cannot be combined with other categories; \`firecrawl_gov_search\` is the dedicated tool. Verify gov results' issuer, jurisdiction, status, and version before citing current law.

${ALEXANDRIA_SEARCH_INSTRUCTIONS}

Returns result groups in \`data\` and an operation \`id\`.
`,
    outputSchema: searchOutputSchema,
    parameters: z
      .object({ ...searchToolBaseFields })
      // Reject unknown fields (notably scrapeOptions): this surface exposes no
      // way to request page-content fetching, and an unexpected field is an
      // error rather than being silently dropped.
      .strict()
      .refine(searchDomainsAreExclusive, SEARCH_DOMAINS_CONFLICT_MESSAGE)
      .refine(
        searchQueryIsValid,
        'A query is required. Use firecrawl_find_tools to browse the catalogue.'
      ),
    execute: async (args: unknown, { session, log, client: mcpClient }): Promise<ToolResult> => {
      const {
        query,
        objective,
        clientModel,
        includeDomains,
        excludeDomains,
        limit,
        tbs,
        filter,
        location,
        sources,
        categories,
        highlights,
        enterprise,
        domainTools,
        toolDetail,
      } = args as {
        query?: string;
        objective?: string;
        clientModel?: string;
        domainTools?: boolean;
        toolDetail?: 'compact' | 'summary' | 'full';
        includeDomains?: string[];
        excludeDomains?: string[];
        limit?: number;
        tbs?: string;
        filter?: string;
        location?: string;
        sources?: Array<string | { type: string }>;
        categories?: string[];
        highlights?: boolean;
        enterprise?: string[];
      };

      const searchQuery = query ?? '';

      // Build the outbound body from allowed fields only. Never spread the raw
      // arguments, so no scrape/content-fetch options can reach the API.
      const searchBody = {
        query: searchQuery,
        ...removeEmptyTopLevel({
          objective,
          clientModel,
          limit,
          includeDomains,
          excludeDomains,
          tbs,
          filter,
          location,
          sources: normalizeSearchSources(sources ?? ['web', 'alexandria']),
          categories,
          highlights,
          enterprise,
          toolDetail: toolDetail ?? 'compact',
          domainTools:
            domainTools ?? defaultDomainTools(sources ?? ['web', 'alexandria']),
        }),
        origin: requestOrigin(mcpClient, session),
      };

      log.info('Searching', { query: searchQuery });
      const exchangeSource = hasAlexandria(searchBody.sources);
      if (exchangeSource || searchBody.domainTools)
        assertExchangeCredential(hasCredential(session));
      const client = getClientFn(session);
      const postSearch = () =>
        postSearchWithFallback(
          client,
          searchBody,
          sources === undefined && domainTools !== true
        );
      const context = { tool: 'firecrawl_search' };
      const httpRes = exchangeSource
        ? await relayExchangeError(postSearch, context)
        : await relayTermsRequired(postSearch, context);
      return structuredCompact(httpRes?.data ?? {});
    },
  });
}

/**
 * The search surface's frozen tool set: built-in tools pass only when they are
 * listed and are not replaced by a surface variant.
 */
export function searchSurfaceToolFilter(name: string): boolean {
  return SEARCH_PROFILE_TOOLS.has(name) && !SEARCH_SURFACE_VARIANT_TOOLS.has(name);
}

/**
 * Registers the search-surface variants: the strict search tool and copies of
 * the two Alexandria tools with surface-scoped descriptions. Only names in the
 * frozen set ever register.
 */
export function searchSurfaceTools({
  safeMode,
}: {
  /** Must match the server's `safeMode` option, which the scrape copy describes. */
  safeMode: boolean;
}): NonNullable<FirecrawlMcpServerHooks['registerExtraTools']> {
  return (registrar, context) => {
    const surface: ToolRegistrar = {
      addTool: ((tool: { name: string }) => {
        if (SEARCH_PROFILE_TOOLS.has(tool.name)) {
          registrar.addTool(tool as Parameters<ToolRegistrar['addTool']>[0]);
        }
      }) as ToolRegistrar['addTool'],
    };
    registerMarketplaceSearchTool(surface, context);
    const findTools = context.builtInTool('firecrawl_find_tools');
    const scrape = context.builtInTool('firecrawl_scrape');
    if (findTools) {
      surface.addTool({
        ...findTools,
        description: SEARCH_SURFACE_FIND_TOOLS_DESCRIPTION,
      });
    }
    if (scrape) {
      surface.addTool({
        ...scrape,
        _meta: { 'anthropic/alwaysLoad': true },
        description: searchSurfaceScrapeDescription(safeMode),
      });
    }
  };
}
