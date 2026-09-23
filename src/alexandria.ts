import { z } from 'zod';

const catalogueTypes = ['alexandria', 'exchange'] as const;
export const searchSourceSchema = z.union([
  z.enum(['web', 'images', 'news', ...catalogueTypes]),
  z
    .object({ type: z.enum(['web', 'images', 'news', ...catalogueTypes]) })
    .strict(),
]);
export function hasAlexandria(sources: unknown): boolean {
  return (
    Array.isArray(sources) &&
    sources.some((source) =>
      catalogueTypes.includes(
        typeof source === 'string' ? source : source?.type
      )
    )
  );
}
export function defaultDomainTools(sources: unknown): boolean {
  return hasAlexandria(sources) && Array.isArray(sources) && sources.some(
    source => ['web', 'news', 'images'].includes(typeof source === 'string' ? source : source?.type)
  );
}

export function normalizeSearchSources(sources: unknown): unknown {
  if (!Array.isArray(sources)) return sources;
  return sources.map((source) =>
    source === 'exchange'
      ? 'alexandria'
      : source?.type === 'exchange'
        ? { ...source, type: 'alexandria' }
        : source
  );
}
export function searchQueryIsValid(args: { query?: string }): boolean {
  return !!args.query?.trim();
}

export const findToolsSchema = z
  .object({
    query: z.string().trim().min(1).max(2000).optional().describe('Semantic lookup of tools for the data you need. Selectors constrain the search.'),
    urls: z
      .array(
        z
          .string()
          .url()
          .regex(/^https?:\/\//)
      )
      .min(1)
      .max(100)
      .optional(),
    providers: z.array(z.string().min(1)).min(1).max(50).optional().describe('Provider IDs returned by category browsing. Lists compact tools by default.'),
    categories: z.array(z.string().min(1)).min(1).max(50).optional().describe('Category IDs returned by an empty call. Lists providers by default.'),
    groups: z.array(z.string().min(1)).min(1).max(50).optional().describe('Optional group IDs for explicit group browsing.'),
    capabilities: z.array(z.string().min(1)).min(1).max(50).optional().describe('Exact capability IDs. A selected capability expands its complete contract by default.'),
    level: z.enum(['categories', 'providers', 'groups', 'tools']).optional(),
    expand: z.array(z.enum(['options', 'response', 'examples'])).optional().describe('Use ["options", "response"] for inputs and output shape without example payloads; [] keeps results compact. Omit for full contracts on selected capabilities.'),
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().nonnegative().optional(),
  })
  .strict();

export const ALEXANDRIA_CATALOGUE_VERTICALS =
  'companies, people, jobs, finance and filings, public records and government spending, real estate, places and restaurants, retail and prices, package registries and developer data, news, research, and more';
export const ALEXANDRIA_CATALOGUE_SENTENCE =
  "Alexandria is Firecrawl's catalogue of data providers and workflows across " + ALEXANDRIA_CATALOGUE_VERTICALS + '; providers return typed, sourced records through published contracts.';
export const ALEXANDRIA_SOURCES_OPT_OUT =
  'Passing sources without alexandria in it (for example ["web"] or ["news"]) excludes Alexandria provider matches; omit sources unless you specifically need web-only or news-only results, or include "alexandria" alongside them.';

export function findToolsOptions(args: z.infer<typeof findToolsSchema>) {
  const level = args.level ?? (args.query || args.capabilities?.length || args.providers?.length || args.groups?.length || args.urls?.length ? 'tools' : args.categories?.length ? 'providers' : 'categories');
  if (level === 'categories' && (args.query || args.providers?.length || args.categories?.length || args.groups?.length || args.capabilities?.length || args.urls?.length || args.expand !== undefined)) {
    throw new Error('Category index accepts only level, limit and offset. Select a category to browse providers.');
  }
  const { expand, ...selectors } = args;
  return { ...selectors, ...(expand !== undefined ? { expand } : {}), level, limit: args.limit ?? 20,
    ...(args.expand === undefined && level === 'tools' && args.capabilities?.length ? { expand: ['options', 'response', 'examples'] as const } : {}),
  };
}

export function withFindToolsNavigation(envelope: any) {
  const page = envelope?.data?.alexandria?.[0]?.data;
  if (!page || !Array.isArray(page.items)) return envelope;
  const link = (next: any) => next?.provider === 'firecrawl' && next?.capability === 'find-tools' && next.options
    ? { name: 'firecrawl_find_tools', arguments: next.options } : undefined;
  for (const item of page.items) {
    if (page.level === 'providers' && link(item.next)) {
      const { expand, ...selectors } = item.next.options;
      item.next = { ...item.next, options: { ...selectors, level: 'tools' } };
    }
    const nextTool = link(item.next);
    if (nextTool) item.nextTool = nextTool;
  }
  if (link(page.next)) page.nextTool = link(page.next);
  return envelope;
}

export const ALEXANDRIA_SEARCH_INSTRUCTIONS =
  'Authenticated search combines web results, semantic tool summaries and domain matches. Use sources: ["alexandria"] for semantic tools only, or sources: ["web"] for web only. domainTools: false disables domain matching. Tool matches describe available structured-data capabilities, not executed data. toolDetail: "compact" (default) returns only provider, capability and description; "summary" adds metadata; "full" includes their input and output contracts. Execute a matched tool through firecrawl_scrape with an alexandria body; use firecrawl_find_tools to browse the catalogue or read a full contract.';
