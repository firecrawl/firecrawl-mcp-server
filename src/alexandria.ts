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
    urls: z
      .array(
        z
          .string()
          .url()
          .regex(/^https?:\/\//)
      )
      .max(100)
      .optional(),
    providers: z.array(z.string().min(1)).min(1).max(50).optional().describe('Provider IDs returned by category browsing. Lists compact tools by default.'),
    categories: z.array(z.string().min(1)).min(1).max(50).optional().describe('Category IDs returned by an empty call. Lists providers by default.'),
    groups: z.array(z.string().min(1)).min(1).max(50).optional().describe('Optional group IDs for explicit group browsing.'),
    capabilities: z.array(z.string().min(1)).min(1).max(50).optional().describe('Exact capability IDs. A selected capability expands its complete contract by default.'),
    level: z.enum(['categories', 'providers', 'groups', 'tools']).optional(),
    expand: z.array(z.enum(['options', 'response', 'examples'])).optional().describe('Explicit expansion override; [] keeps results compact. Omit for full contracts on selected capabilities.'),
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().nonnegative().optional(),
  })
  .strict();

export const ALEXANDRIA_INSTRUCTIONS =
  'Use firecrawl_search with a query and sources ["alexandria"] to find relevant tool contracts, or mix with web/news/images. Contracts are in data.tools, including inputs, response fields, examples, creditsCost, matchedBy and matchedUrls. domainTools:true adds domain-matched tools to the same array. Search always requires a query. Use Find Tools for contextual lookup and progressive disclosure by URL, provider, category, group or capability. Discovery is free; web search and provider execution have their own charges. Access follows the authenticated team policy.';

export function findToolsOptions(args: z.infer<typeof findToolsSchema>) {
  const level = args.level ?? (args.capabilities?.length || args.providers?.length || args.groups?.length || args.urls?.length ? 'tools' : args.categories?.length ? 'providers' : 'categories');
  if (level === 'categories' && (args.providers?.length || args.categories?.length || args.groups?.length || args.capabilities?.length || args.urls?.length || args.expand !== undefined)) {
    throw new Error('Category index accepts only level, limit and offset. Select a category to browse providers.');
  }
  const { expand, ...selectors } = args;
  return { ...selectors, ...(expand?.length ? { expand } : {}), level, limit: args.limit ?? 20,
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
