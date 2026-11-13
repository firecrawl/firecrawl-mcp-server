import { z } from 'zod';
import { httpUrl } from './tool-arguments.js';

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

/** Adds alexandria to the requested sources, keeping the caller's entries and their string or object form. */
export function withAlexandriaSource(sources: unknown): unknown[] {
  if (!Array.isArray(sources) || sources.length === 0) return ['web', 'alexandria'];
  if (hasAlexandria(sources)) return sources;
  return [...sources, typeof sources[0] === 'string' ? 'alexandria' : { type: 'alexandria' }];
}

/** Zero data retention and anonymous searches cannot run provider discovery. */
export function enterpriseAllowsAlexandria(enterprise: unknown): boolean {
  return !(Array.isArray(enterprise) && enterprise.some(mode => mode === 'zdr' || mode === 'anon'));
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
      .array(httpUrl())
      .min(1)
      .max(100)
      .optional(),
    providers: z.array(z.string().min(1)).min(1).max(50).optional().describe('Values from each listed tool\'s `provider` field (e.g. "apps-apple-com"). Alone, lists that provider\'s compact tools; with capabilities, scopes them.'),
    categories: z.array(z.string().min(1)).min(1).max(50).optional().describe('Category IDs returned by an empty call. Lists providers by default.'),
    groups: z.array(z.string().min(1)).min(1).max(50).optional().describe('Optional group IDs for explicit group browsing.'),
    capabilities: z.array(z.string().min(1)).min(1).max(50).optional().describe('Values from each listed tool\'s `capability` field (e.g. "apps/app"). Put the provider in `providers`: {"providers": ["apps-apple-com"], "capabilities": ["apps/app"]}. A selected capability expands its complete contract by default.'),
    level: z.enum(['categories', 'providers', 'groups', 'tools']).optional().describe('Usually omit: it follows the arguments (tools for query, urls, providers, capabilities or groups; providers for categories; categories with none). Set providers or groups to list those within a category or url scope instead of tools. query, or a non-empty expand with any other argument, returns tools.'),
    expand: z.array(z.enum(['options', 'response', 'examples'])).optional().describe('Use ["options", "response"] for inputs and output shape without example payloads; [] keeps results compact. Omit for full contracts on selected capabilities.'),
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().nonnegative().optional(),
    includeCosts: z.boolean().optional().describe('Include per-capability credit prices (creditsCost, perRecord) in tool results.'),
  })
  .strict();

const SKILL_CHANGES = ['name', 'description', 'body', 'enabled', 'discoverable'] as const;

export const saveSkillSchema = z
  .object({
    id: z.string().trim().max(100).regex(/^team:[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Only team skills (team:<slug>) can be changed; copy a library skill with from.').optional().describe('Update: the team:<slug> skill to change. Omit to create a skill.'),
    baseVersion: z.number().int().min(1).optional().describe('Update, required: the version: in the skill\'s SKILL.md. A skill changed since is refused with conflict: read it again and reapply.'),
    from: z.string().trim().min(1).max(100).optional().describe('Create: the skill to copy, by id: <id> for /skills/library/<id>, team:<slug> for /skills/team/<slug>. Fields you also give override the copy.'),
    name: z.string().trim().min(1).max(1000).optional().describe('Skill name; required to create without from.'),
    description: z.string().trim().min(1).max(5000).optional().describe('When to use the skill; required to create without from.'),
    body: z.string().min(1).max(200_000).regex(/\S/, 'body must not be blank').optional().describe('The instructions in full, in Markdown; required to create without from. Reference capabilities as @provider/capability.'),
    slug: z.string().trim().max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug is lowercase letters and digits in words joined by single hyphens').optional().describe('Create: lowercase words joined by hyphens; defaults to one made from the name.'),
    enabled: z.boolean().optional().describe('Update: turn the skill on or off.'),
    discoverable: z.boolean().optional().describe('Update: whether /skills/INDEX lists it.'),
  })
  .strict()
  .superRefine((value, ctx) => {
    const given = (keys: readonly (keyof typeof value)[]) => keys.filter((key) => value[key] !== undefined);
    const refuse = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (value.id === undefined) {
      const updateOnly = given(['baseVersion', 'enabled', 'discoverable']);
      if (updateOnly.length) return refuse(`Only an update takes ${updateOnly.join(', ')}: give the skill's id too.`);
      if (value.from === undefined && given(['name', 'description', 'body']).length < 3) return refuse('To create a skill, give name, description and body, or from to copy one.');
      return;
    }
    const createOnly = given(['from', 'slug']);
    if (createOnly.length) return refuse(`Only a create takes ${createOnly.join(' and ')}: omit id to create a skill.`);
    if (value.baseVersion === undefined) return refuse('An update needs baseVersion: the version: in the skill\'s SKILL.md.');
    if (!given(SKILL_CHANGES).length) return refuse('Nothing to change: give name, description, body, enabled or discoverable.');
  });

/** Where a skill's SKILL.md sits in the library's /skills tree. */
export function skillPath(id: string): string {
  return id.startsWith('team:') ? `/skills/team/${id.slice(5)}/SKILL.md` : `/skills/library/${id}/SKILL.md`;
}

/** A saved skill names its file and the library command that reads it. */
export function withSkillNavigation(envelope: any, tools: AlexandriaTools) {
  const data = envelope?.data?.alexandria?.[0]?.data;
  if (typeof data?.id !== 'string') return envelope;
  data.path = skillPath(data.id);
  const read = { provider: 'firecrawl', capability: 'library', options: { command: `cat ${data.path}` } };
  data.nextTool = tools === 'dedicated' ? { name: ALEXANDRIA_LIBRARY_TOOL, arguments: read.options } : executeToolCall(tools, read);
  return envelope;
}

export const ALEXANDRIA_CATALOGUE_VERTICALS =
  'companies, people, jobs, finance and filings, public records and government spending, real estate, places and restaurants, retail and prices, package registries and developer data, news, research, and more';
export const ALEXANDRIA_CATALOGUE_SENTENCE =
  "Alexandria is Firecrawl's catalogue of data providers and workflows across " + ALEXANDRIA_CATALOGUE_VERTICALS + '; providers return typed, sourced records through published contracts.';
export const ALEXANDRIA_SOURCES_ALWAYS_ON =
  'Authenticated searches always add alexandria to the sources, so sources: ["web"] also returns providers; domainTools: false turns off website-matched tools only.';

// Claude Code truncates each tool description at 2,048 characters, so the routing
// copy that changes behaviour sits in the first lines of each description and the
// mechanics live on the parameters they describe.
export const ALEXANDRIA_SEARCH_LEAD =
  'Authenticated search also returns matching Alexandria data providers in data.tools (' + ALEXANDRIA_CATALOGUE_VERTICALS + '). Prefer a provider over scraping pages when the task needs the same fields across several entities, exact figures or timestamps, provenance, or many records; use web results when they already answer the question. ' + ALEXANDRIA_SOURCES_ALWAYS_ON;
export const ALEXANDRIA_CONTRACT_GUIDANCE =
  'The selected contract marks required inputs and any requiresOneOf groups (at least one member per group); it may include example.request/example.response and a key field under response (which may differ from records). Where pagination is declared, its fields govern paging with the same filters; catalogue next is separate from provider pagination.';
export const ALEXANDRIA_ENRICH_ROUTING =
  'For people and company enrichment or search, use people_company_enrich or people_company_search when they are listed, and for job postings use jobs_search when it is listed; call a provider here directly only when the user asks for that provider.';
export const ALEXANDRIA_TERMS_GUIDANCE =
  'Some providers require accepted terms; when a response reports a terms requirement, direct the user to the Firecrawl dashboard URL in that response.';

export function findToolsOptions(args: z.infer<typeof findToolsSchema>) {
  const selected = Boolean(args.query || args.providers?.length || args.categories?.length || args.groups?.length || args.capabilities?.length || args.urls?.length);
  const level = selected && (args.query || args.expand?.length) ? 'tools' : args.level ?? (args.capabilities?.length || args.providers?.length || args.groups?.length || args.urls?.length ? 'tools' : args.categories?.length ? 'providers' : 'categories');
  if (level === 'categories' && (selected || args.expand !== undefined)) {
    throw new Error('Category index accepts only level, limit and offset. Select a category to browse providers.');
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { expand, includeCosts, ...selectors } = args;
  return { ...selectors, ...(expand !== undefined ? { expand } : {}), level, limit: args.limit ?? 20,
    ...(args.expand === undefined && args.capabilities?.length ? { expand: level === 'tools' ? ['options', 'response', 'examples'] as const : [] } : {}),
  };
}

export function withFindToolsNavigation(envelope: any, carry: Record<string, unknown> = {}) {
  const page = envelope?.data?.alexandria?.[0]?.data;
  if (!page || !Array.isArray(page.items)) return envelope;
  const link = (next: any) => next?.provider === 'firecrawl' && next?.capability === 'find-tools' && next.options
    ? { name: 'firecrawl_find_tools', arguments: { ...next.options, ...carry } } : undefined;
  for (const item of page.items) {
    if (page.level === 'providers' && link(item.next)) {
      const selectors = { ...item.next.options };
      delete selectors.expand;
      item.next = { ...item.next, options: { ...selectors, level: 'tools' } };
    }
    const nextTool = link(item.next);
    if (nextTool) item.nextTool = nextTool;
  }
  if (link(page.next)) page.nextTool = link(page.next);
  return envelope;
}

// What authenticated search returns; each surface appends the tools that take it from there.
const ALEXANDRIA_SEARCH_LEAD_INSTRUCTIONS =
  'Authenticated search combines web results, semantic tool summaries and domain matches. Use sources: ["alexandria"] for semantic tools only. ' + ALEXANDRIA_SOURCES_ALWAYS_ON + ' On an authenticated session, tool matches describe available structured-data capabilities, not executed data. toolDetail: "compact" (default) returns only provider, capability and description; "summary" adds metadata; "full" includes their input and output contracts.';
export const ALEXANDRIA_SEARCH_INSTRUCTIONS =
  ALEXANDRIA_SEARCH_LEAD_INSTRUCTIONS + ' firecrawl_scrape with an alexandria body executes a selected capability; firecrawl_find_tools provides catalogue browsing and full contracts.';

const TOOL_PRICE_KEYS = ['creditsCost', 'perRecord', 'billing', 'recordsPerUnit', 'zeroDataRetentionCreditsCost'];

/** Drops per-capability price metadata from a discovered tool or an execution result entry. */
export function withoutToolPrice(tool: any) {
  if (!tool || typeof tool !== 'object' || Array.isArray(tool)) return tool;
  const copy = { ...tool };
  for (const key of TOOL_PRICE_KEYS) delete copy[key];
  return copy;
}

/** Strips per-capability prices from `data.tools` in a search or URL scrape response. */
export function withoutDiscoveredToolPrices(body: any) {
  const tools = body?.data?.tools ?? body?.tools;
  if (!Array.isArray(tools)) return body;
  return body?.data?.tools
    ? { ...body, data: { ...body.data, tools: tools.map(withoutToolPrice) } }
    : { ...body, tools: tools.map(withoutToolPrice) };
}

function withoutPagePrices(page: any) {
  if (!page || typeof page !== 'object') return page;
  return {
    ...page,
    ...(Array.isArray(page.items) ? { items: page.items.map(withoutToolPrice) } : {}),
    ...(Array.isArray(page.relatedTools) ? {
      relatedTools: page.relatedTools.map((group: any) => Array.isArray(group?.tools)
        ? { ...group, tools: group.tools.map((entry: any) => entry?.tool ? { ...entry, tool: withoutToolPrice(entry.tool) } : withoutToolPrice(entry)) }
        : group),
    } : {}),
  };
}

/** Strips the per-capability cost from each Alexandria result entry, and tool prices from Find Tools pages. */
export function withoutResultPrices(body: any) {
  const results = body?.data?.alexandria;
  if (!Array.isArray(results)) return body;
  return {
    ...body,
    data: {
      ...body.data,
      alexandria: results.map((entry: any) => {
        const stripped = withoutToolPrice(entry);
        return entry?.provider === 'firecrawl' && entry?.capability === 'find-tools' && stripped && typeof stripped === 'object'
          ? { ...stripped, data: withoutPagePrices(entry.data) }
          : stripped;
      }),
    },
  };
}

/** Find Tools is free; its envelope drops the zero total along with tool prices. */
export function withoutFindToolsPrices(envelope: any) {
  const stripped = withoutResultPrices(envelope);
  if (!stripped?.data || typeof stripped.data !== 'object') return stripped;
  const data = { ...stripped.data };
  delete data.creditsCost;
  return { ...stripped, data };
}

/**
 * How a surface names the Alexandria tools. `dedicated` is alexandria_library_search
 * and alexandria_library_read. `legacy` is firecrawl_find_tools and firecrawl_scrape
 * with an alexandria body: the search surface's tool list is fixed by its
 * connector listing, so it keeps those names and their copy.
 */
export type AlexandriaTools = 'dedicated' | 'legacy';

export const ALEXANDRIA_READ_TOOL = 'alexandria_library_read';
export const ALEXANDRIA_LIBRARY_TOOL = 'alexandria_library_search';

type AlexandriaCall = { provider: string; capability: string; options?: unknown; version?: string };

/** The tool call that runs one capability on a surface. `list` keeps the legacy body an array where it always was one. */
export function executeToolCall(tools: AlexandriaTools, call: AlexandriaCall | Record<string, unknown>, list = false) {
  return tools === 'dedicated'
    ? { name: ALEXANDRIA_READ_TOOL, arguments: { calls: [call] } }
    : { name: 'firecrawl_scrape', arguments: { alexandria: list ? [call] : call } };
}

export const ALEXANDRIA_DEDICATED_SEARCH_INSTRUCTIONS =
  ALEXANDRIA_SEARCH_LEAD_INSTRUCTIONS + ' ' + ALEXANDRIA_READ_TOOL + ' runs a selected capability; ' + ALEXANDRIA_LIBRARY_TOOL + ' explores the whole library and reads full contracts.';

// The category folders of /library, so an agent can open one without listing
// first. They come from the Exchange catalogue; a category added there is
// missing here until this list is updated, and `ls /library` always has it.
// The category folders of the deployed library (`ls /library`, 2026-11-10).
export const ALEXANDRIA_LIBRARY_CATEGORIES = [
  'agriculture', 'ai-models', 'apps', 'automotive', 'community', 'companies', 'developer',
  'digital-intelligence', 'education', 'energy', 'entertainment', 'finance', 'game-development',
  'government', 'health', 'healthcare', 'jobs', 'knowledge', 'life-sciences', 'marketing', 'music',
  'news', 'people', 'places', 'podcasts', 'political-science', 'real-estate', 'research',
  'restaurants', 'shopping', 'skills', 'social', 'software', 'sports', 'travel',
];

export const ALEXANDRIA_LIBRARY_DESCRIPTION =
  "Explore the Alexandria library: Firecrawl's catalogue of data providers that return typed, sourced records (" + ALEXANDRIA_CATALOGUE_VERTICALS + ') as a read-only filesystem, using shell commands. Use this to find out whether a provider covers the data a task needs, and to read its contract before alexandria_library_read. Layout: /library/<category>/<provider>/<capability>.md, one file per capability holding its contract (when to use it, inputs, outputs, and the call to send); /library, each category folder and each provider folder has a README.md describing what is inside. Category folders: ' + ALEXANDRIA_LIBRARY_CATEGORIES.join(', ') + '; `ls /library` shows any added since. Available commands: ls, tree, cat, head, tail, grep, find, wc, sort, uniq, cut, tr, sed, jq, xargs, with pipes. Typical starts: `ls /library`, `cat /library/README.md`, or `grep -ril "mortgage" /library`. A file path is the execute address: /library/finance/fred/series/observations.md is provider "fred", capability "series/observations". Recorded example responses are under /examples/<provider>/<capability>.json. Skills, written instructions for tasks (your team\'s and Firecrawl\'s), are under /skills: `grep -i "<word>" /skills/INDEX` lists them one per line (path, marker, name: when to use it), your team\'s first; when that lists many, `cat /skills/search/<a-few-words-from-the-task>` (joined by hyphens) ranks the best; cat the path to read one, and prefer a team skill that fits. Free; does not run providers.';

export const ALEXANDRIA_READ_DESCRIPTION =
  "Run capabilities of Alexandria data providers and return their typed, sourced records: one, or up to ten in one call when a task needs several lookups. Alexandria is Firecrawl's library of data providers across " + ALEXANDRIA_CATALOGUE_VERTICALS + '. ' + ALEXANDRIA_ENRICH_ROUTING + ' Each entry of `calls` is {provider, capability, options}: `provider` and `capability` come from firecrawl_search results or alexandria_library_search, and `options` follow the capability\'s contract, which marks required inputs and any requiresOneOf groups (at least one member per group). Where the contract declares pagination, its fields page through results with the same filters. Returns one result per call, in the same order, in data.alexandria, each with data, records, or an error with a code; one call can fail while the others succeed, and an invalid call returns an error naming the valid options. A result too large to return inline is retained, and nextTool reads it in slices. Billed per executed capability; discovery is free. ' + ALEXANDRIA_TERMS_GUIDANCE;

export const libraryToolSchema = z
  .object({
    command: z.string().trim().min(1).max(4096).describe('Shell command to run inside the read-only library, e.g. `grep -ril "rental" /library | head -20`.'),
  })
  .strict();
