import { z } from 'zod';
import { toJSONSchema } from 'zod/v4/core';
import { httpUrl } from './tool-arguments.js';

const catalogueTypes = ['alexandria', 'exchange'] as const;
const skillSource = 'alexandria-skills' as const;
const searchSourceTypes = ['web', 'images', 'news', ...catalogueTypes, skillSource] as const;
export const searchSourceSchema = z.union([
  z.enum(searchSourceTypes),
  z
    .object({ type: z.enum(searchSourceTypes) })
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

export function hasSkillSource(sources: unknown): boolean {
  return Array.isArray(sources) && sources.some((source) => (typeof source === 'string' ? source : source?.type) === skillSource);
}

/** Adds alexandria-skills in the same string or object form as the list it extends. */
export function withSkillSource(sources: unknown[]): unknown[] {
  if (hasSkillSource(sources)) return sources;
  return [...sources, sources.length > 0 && typeof sources[0] !== 'string' ? { type: skillSource } : skillSource];
}

/**
 * Sources for one search. An omitted list on a credentialed session that can use
 * Alexandria is web, alexandria, and alexandria-skills. An explicit list is kept
 * as given, aside from the existing alexandria addition, so the caller can include
 * or leave out alexandria-skills. Keyless, zdr, and anon sessions are not given
 * alexandria-skills: that source is refused without Alexandria access.
 */
export function resolveSearchSources(input: {
  sources: unknown;
  credentialed: boolean;
  enterprise: unknown;
}): { sources: unknown[]; requestedSources: unknown[]; addsAlexandria: boolean } {
  const passed = Array.isArray(input.sources) && input.sources.length > 0;
  const requestedSources = normalizeSearchSources(passed ? input.sources : ['web']) as unknown[];
  const addsAlexandria = input.credentialed && enterpriseAllowsAlexandria(input.enterprise) && !hasAlexandria(requestedSources);
  let sources = addsAlexandria ? withAlexandriaSource(requestedSources) : requestedSources;
  if (!passed && addsAlexandria) sources = withSkillSource(sources);
  return { sources, requestedSources, addsAlexandria };
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

/** Prices from merged catalogue changes. Not a full price list. Declared before the schemas that quote it. */
export const ALEXANDRIA_NOTABLE_PRICES =
  'Read creditsCost before a paid call (includeCosts). Carbon Arc is 1000 credits a call. People Data Labs person/enrich and person/identify are 60 credits per successful call, and person/search and person/bulk are 50 credits per returned or matched record; misses are free. Influencers.club discovery is 45 credits per creator returned (56 with return_filter_values), similar creators are 50 per creator, and enrichment calls cost 10 to 330 credits. Read creditsCost on a Fiber tool before calling it.';

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
    includeCosts: z.boolean().optional().describe('Include per-capability credit prices (creditsCost, perRecord) in tool results. ' + ALEXANDRIA_NOTABLE_PRICES),
  })
  .strict();

const skillSlug = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug is lowercase letters and digits in words joined by single hyphens');

const skillRequestId = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9._:-]{1,128}$/, 'requestId is 1-128 letters, digits, dots, underscores, colons or hyphens')
  .optional()
  .describe('Reuse after a timeout to recover the same save. A completed save replays instead of running again.');

const skillPathSegment = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^(?!\.{1,2}$)[^/\\]+$/, 'A skill address segment cannot contain a slash or be . or ..');

export const findSkillsSchema = z
  .object({
    query: z.string().trim().min(1).max(2000).optional().describe('A natural-language goal. Official and provider skills are ranked semantically; team skills still match these words in the id, name or description. Omit to list without a goal.'),
    limit: z.number().int().min(1).max(50).optional().describe('Most skills to return; defaults to 20.'),
    provider: skillPathSegment.optional().describe('List skills published by this Alexandria provider instead of Firecrawl and team skills. Sent to Exchange as provider; a query is sent as q. Later pages are read until limit is filled.'),
  })
  .strict();

const readSkillId = z.string().trim().min(1).max(200).describe('Skill ID from firecrawl_find_skills; team:<slug> for a team skill.');
const readSkillPath = z.string().trim().min(1).max(500).optional().describe('A file from the skill\'s files list; defaults to SKILL.md.');
const readSkillVersion = z.number().int().min(1).optional().describe('A team skill only: an earlier kept version; defaults to the current one.');
const readSkillFile = z.boolean().optional().describe('Read the skill file instead of the skill record.');
const readTeamSkillSchema = z.object({
  id: readSkillId,
  path: readSkillPath,
  version: readSkillVersion,
}).strict();
const readProviderSkillSchema = z.object({
  provider: skillPathSegment.describe('Provider slug from a firecrawl_find_skills result that set provider.'),
  plugin: skillPathSegment.describe('Plugin slug from that provider skill.'),
  skill: skillPathSegment.describe('Skill slug from that provider skill.'),
  file: readSkillFile,
}).strict();

// Each advertised branch lists only its own fields, so id cannot be combined with provider, plugin or skill.
export const readSkillSchema = advertiseExclusive(z.union([readTeamSkillSchema, readProviderSkillSchema]), [readTeamSkillSchema, readProviderSkillSchema]);

const createSkillFrom = z.string().trim().min(1).max(200).describe('A skill ID from firecrawl_find_skills to copy: a library skill or team:<slug>. Fields you also give override the copy.');
const createSkillName = z.string().trim().min(1).max(1000).describe('Skill name; required without from.');
const createSkillDescription = z.string().trim().min(1).max(5000).describe('When to use the skill; required without from.');
const createSkillBody = z.string().min(1).max(200_000).describe('The instructions, in Markdown; required without from. Reference capabilities as @provider/capability.');
const createSkillSlug = skillSlug.optional().describe('Lowercase words joined by hyphens; defaults to one made from the name.');

/**
 * Advertised schema stays `type: object`. Each anyOf branch is that branch's
 * full strict schema, so a field from one branch cannot appear with the other.
 */
function advertiseExclusive<T extends z.ZodType>(schema: T, branches: z.ZodType[]): T {
  const branchSchemas = branches.map((branch) => {
    const json = toJSONSchema(branch, { target: 'draft-7' }) as Record<string, unknown>;
    delete json.$schema;
    return json;
  });
  const properties: Record<string, unknown> = {};
  for (const branch of branchSchemas) Object.assign(properties, (branch.properties as Record<string, unknown> | undefined) ?? {});
  const json = { type: 'object', additionalProperties: false, properties, anyOf: branchSchemas };
  (schema._zod as { toJSONSchema?: () => unknown }).toJSONSchema = () => structuredClone(json);
  return schema;
}

/**
 * Runtime validation stays a union. The advertised schema stays `type: object`
 * (clients reject a bare anyOf) and adds anyOf required-sets for the same rule.
 */
function advertiseAnyOf<T extends z.ZodType>(schema: T, shape: z.ZodType, requirements: { required: string[] }[]): T {
  const json = toJSONSchema(shape, { target: 'draft-7' }) as Record<string, unknown>;
  delete json.$schema;
  json.anyOf = requirements;
  // A fresh copy each time: JSON Schema conversion mutates the object it is given,
  // and tools/list can run concurrently.
  (schema._zod as { toJSONSchema?: () => unknown }).toJSONSchema = () => structuredClone(json);
  return schema;
}

const createSkillShape = z.object({
  from: createSkillFrom.optional(),
  name: createSkillName.optional(),
  description: createSkillDescription.optional(),
  body: createSkillBody.optional(),
  slug: createSkillSlug,
  requestId: skillRequestId,
}).strict();

// A union, not a refine, so callers cannot send {} or a partial write. The advertised schema repeats that rule.
export const createSkillSchema = advertiseAnyOf(z.union([
  z.object({
    from: createSkillFrom,
    name: createSkillName.optional(),
    description: createSkillDescription.optional(),
    body: createSkillBody.optional(),
    slug: createSkillSlug,
    requestId: skillRequestId,
  }).strict(),
  z.object({
    from: createSkillFrom.optional(),
    name: createSkillName,
    description: createSkillDescription,
    body: createSkillBody,
    slug: createSkillSlug,
    requestId: skillRequestId,
  }).strict(),
]), createSkillShape, [{ required: ['from'] }, { required: ['name', 'description', 'body'] }]);

const updateSkillId = z.string().trim().max(100).regex(/^team:[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Only team skills (team:<slug>) can be changed; copy a library skill with firecrawl_create_skill.').describe('team:<slug> from firecrawl_find_skills. Library skills cannot be changed; copy one with firecrawl_create_skill.');
const updateSkillBaseVersion = z.number().int().min(1).describe('The version firecrawl_read_skill returned. A skill changed since is refused with conflict: read it again and reapply.');
const updateSkillName = z.string().trim().min(1).max(1000);
const updateSkillDescription = z.string().trim().min(1).max(5000);
const updateSkillBody = z.string().min(1).max(200_000).describe('New instructions, in full.');
const updateSkillEnabled = z.boolean().describe('Turn the skill on or off. A team admin turns a skill back on, or deletes one, in the Firecrawl dashboard.');
const updateSkillDiscoverable = z.boolean().describe('Whether firecrawl_find_skills lists it.');

function updateSkillBranch(
  change: 'name' | 'description' | 'body' | 'enabled' | 'discoverable'
) {
  return z.object({
    id: updateSkillId,
    baseVersion: updateSkillBaseVersion,
    name: change === 'name' ? updateSkillName : updateSkillName.optional(),
    description: change === 'description' ? updateSkillDescription : updateSkillDescription.optional(),
    body: change === 'body' ? updateSkillBody : updateSkillBody.optional(),
    enabled: change === 'enabled' ? updateSkillEnabled : updateSkillEnabled.optional(),
    discoverable: change === 'discoverable' ? updateSkillDiscoverable : updateSkillDiscoverable.optional(),
    requestId: skillRequestId,
  }).strict();
}

const updateSkillShape = z.object({
  id: updateSkillId,
  baseVersion: updateSkillBaseVersion,
  name: updateSkillName.optional(),
  description: updateSkillDescription.optional(),
  body: updateSkillBody.optional(),
  enabled: updateSkillEnabled.optional(),
  discoverable: updateSkillDiscoverable.optional(),
  requestId: skillRequestId,
}).strict();

// Each branch requires one change, so a call with only id and baseVersion is rejected. The advertised schema stays an object.
export const updateSkillSchema = advertiseAnyOf(z.union([
  updateSkillBranch('name'),
  updateSkillBranch('description'),
  updateSkillBranch('body'),
  updateSkillBranch('enabled'),
  updateSkillBranch('discoverable'),
]), updateSkillShape, [
  { required: ['id', 'baseVersion', 'name'] },
  { required: ['id', 'baseVersion', 'description'] },
  { required: ['id', 'baseVersion', 'body'] },
  { required: ['id', 'baseVersion', 'enabled'] },
  { required: ['id', 'baseVersion', 'discoverable'] },
]);

const toolFor = (request: any) => {
  if (request?.provider !== 'firecrawl' || !request.options) return undefined;
  if (request.capability === 'read-skill') return { name: 'firecrawl_read_skill', arguments: request.options };
  if (request.capability === 'create-skill') return { name: 'firecrawl_create_skill', arguments: request.options };
  return undefined;
};

const TEAM_SKILL_PAGE = 'https://www.firecrawl.dev/app/alexandria/skills/';

/** Slug for the web app page. Prefers `skill.slug`, then `team:<slug>` with the prefix removed. */
function teamSkillPage(data: any): { url: string; message: string } | undefined {
  const fromSkill = typeof data?.skill?.slug === 'string' ? data.skill.slug.trim() : '';
  const fromId = typeof data?.id === 'string' && data.id.startsWith('team:') ? data.id.slice('team:'.length) : '';
  const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fromSkill) ? fromSkill : fromId;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return undefined;
  const url = `${TEAM_SKILL_PAGE}${slug}`;
  return { url, message: `Open it in Firecrawl: ${url}` };
}

/**
 * Skill results name their follow-up calls as tools: each listed skill the read that discloses
 * it, a library skill the create that copies it, and a create or update the read of the saved skill.
 * A successful create or update also names the skill's page in the web app.
 */
export function withSkillNavigation(envelope: any) {
  const item = envelope?.data?.alexandria?.[0];
  const data = item?.data;
  if (!data) return envelope;
  for (const skill of Array.isArray(data.skills) ? data.skills : []) {
    if (typeof skill?.id === 'string') skill.nextTool = { name: 'firecrawl_read_skill', arguments: { id: skill.id } };
    const create = toolFor(skill?.create);
    if (create) skill.createTool = create;
  }
  const create = toolFor(data.create);
  if (create) data.createTool = create;
  const next = toolFor(data.next);
  if (next) data.nextTool = next;
  if (!item.error && (item.capability === 'create-skill' || item.capability === 'update-skill')) {
    const page = teamSkillPage(data);
    if (page) {
      data.openUrl = page.url;
      data.message = page.message;
      envelope.message = page.message;
    }
  }
  return envelope;
}

function providerSkillSegment(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const segment = value.trim();
  if (!segment || segment === '.' || segment === '..' || /[/\\]/.test(segment)) return undefined;
  return segment;
}

/**
 * Read path for one provider skill. Exchange sends `provider` as `{slug, name}` and
 * `plugin` as `{id, displayName}`, and the skill slug is the last segment of `id`.
 */
export function providerSkillAddress(skill: any): { provider: string; plugin: string; skill: string } | undefined {
  const provider = providerSkillSegment(typeof skill?.provider === 'string' ? skill.provider : skill?.provider?.slug);
  const plugin = providerSkillSegment(typeof skill?.plugin === 'string' ? skill.plugin : skill?.plugin?.id);
  const named = providerSkillSegment(skill?.skill);
  const id = typeof skill?.id === 'string' ? skill.id : '';
  const last = providerSkillSegment(id.split('/').filter(Boolean).at(-1));
  const name = named ?? last;
  if (!provider || !plugin || !name) return undefined;
  return { provider, plugin, skill: name };
}

function providerSkillRecords(body: any): any[] {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.skills)) return body.skills;
  if (Array.isArray(body?.items)) return body.items;
  return [];
}

/** Skills on one provider-skills page whose provider slug matches, each with the read that returns it. */
export function providerSkillsOnPage(body: any, provider: string): any[] {
  return providerSkillRecords(body).flatMap((skill) => {
    const address = providerSkillAddress(skill);
    if (!address || address.provider !== provider) return [];
    return [{ ...skill, nextTool: { name: 'firecrawl_read_skill', arguments: address } }];
  });
}

/** Page fields from a provider-skills response. `limit` is the server page size, defaulting to 20. */
export function providerSkillsPageInfo(body: any): { page: number; limit: number; total?: number } {
  const page = Number.isInteger(body?.page) && body.page >= 1 ? body.page : 1;
  const limit = Number.isInteger(body?.limit) && body.limit >= 1 ? body.limit : 20;
  const total = Number.isInteger(body?.total) && body.total >= 0 ? body.total : undefined;
  return { page, limit, total };
}

/**
 * A provider skill read, with string `provider`, `plugin` and `skill` for the read path.
 * The Exchange objects stay on `providerDetail` and `pluginDetail`.
 */
export function presentProviderSkillRead(body: any) {
  const root = body && typeof body === 'object' && !Array.isArray(body) ? { ...body } : { data: body };
  const address = providerSkillAddress(root);
  if (!address) return root.success === undefined ? { success: true, ...root } : root;
  const providerDetail = root.provider;
  const pluginDetail = root.plugin;
  return {
    ...root,
    success: true,
    provider: address.provider,
    plugin: address.plugin,
    skill: address.skill,
    ...(providerDetail && typeof providerDetail === 'object' ? { providerDetail } : {}),
    ...(pluginDetail && typeof pluginDetail === 'object' ? { pluginDetail } : {}),
  };
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
export const ALEXANDRIA_TERMS_GUIDANCE =
  'Some providers require accepted terms; when a response reports a terms requirement, direct the user to the Firecrawl dashboard URL in that response.';

export const INDEX_DAILY_LIMIT_NOTE =
  'These calls are free. This index allows 1000 calls a day on Free, Hobby and Standard, 2000 on Growth, and unlimited calls on Scale and Enterprise. Past the limit the response is HTTP 429 with Retry-After until 00:00 UTC.';

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

export const ALEXANDRIA_SEARCH_INSTRUCTIONS =
  'Authenticated search combines web results, semantic tool summaries and domain matches. Use sources: ["alexandria"] for semantic tools only. ' + ALEXANDRIA_SOURCES_ALWAYS_ON + ' Tool matches describe available structured-data capabilities, not executed data. toolDetail: "compact" (default) returns only provider, capability and description; "summary" adds metadata; "full" includes their input and output contracts. firecrawl_scrape with an alexandria body executes a selected capability; firecrawl_find_tools provides catalogue browsing and full contracts.';

const TOOL_PRICE_KEYS = ['creditsCost', 'perRecord', 'billing', 'recordsPerUnit', 'zeroDataRetentionCreditsCost'];

/** Drops per-capability price metadata from a discovered tool or an execution result entry. */
export function withoutToolPrice(tool: any) {
  if (!tool || typeof tool !== 'object' || Array.isArray(tool)) return tool;
  const copy = { ...tool };
  for (const key of TOOL_PRICE_KEYS) delete copy[key];
  return copy;
}

function searchSkillProvider(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value && typeof value === 'object' && !Array.isArray(value) && typeof (value as { slug?: unknown }).slug === 'string') {
    const slug = (value as { slug: string }).slug.trim();
    return slug || undefined;
  }
  return undefined;
}

/** Read call for a search skill card. Provider cards use provider, plugin and skill when the id carries them. */
function searchSkillRead(card: { id?: unknown; source?: unknown; provider?: unknown }): { name: string; arguments: Record<string, string> } | undefined {
  if (typeof card.id !== 'string' || !card.id.trim()) return undefined;
  const id = card.id.trim();
  const provider = searchSkillProvider(card.provider);
  const parts = id.split('/').filter(Boolean);
  const providerShaped = card.source === 'provider' || id.startsWith('provider:');
  if (providerShaped && parts.length >= 2) {
    const skill = parts[parts.length - 1];
    const plugin = parts.length >= 3 ? parts[parts.length - 2] : parts[0];
    const head = parts[0].startsWith('provider:') ? parts[0].slice('provider:'.length) : undefined;
    const slug = provider ?? head;
    const usable = parts.length >= 3 || (Boolean(provider) && !parts[0].startsWith('provider:'));
    if (usable && slug && plugin && skill && [slug, plugin, skill].every((segment) => segment !== '.' && segment !== '..' && !/[/\\]/.test(segment))) {
      return { name: 'firecrawl_read_skill', arguments: { provider: slug, plugin, skill } };
    }
  }
  return { name: 'firecrawl_read_skill', arguments: { id } };
}

/**
 * When a search response includes `data.skills`, keep short cards and place them
 * after `web` and `tools`. Each card points at `firecrawl_read_skill` for the full body.
 * A response without that array is returned unchanged.
 */
export function surfaceSearchSkills<T>(envelope: T): T {
  const data = (envelope as { data?: unknown } | null)?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray((data as { skills?: unknown }).skills)) return envelope;
  const skills = ((data as { skills: unknown[] }).skills).flatMap((card) => {
    if (!card || typeof card !== 'object' || Array.isArray(card)) return [];
    const record = card as Record<string, unknown>;
    const compact: Record<string, unknown> = {};
    if (typeof record.id === 'string') compact.id = record.id;
    if (typeof record.name === 'string') compact.name = record.name;
    if (typeof record.description === 'string') compact.description = record.description;
    if (record.source === 'official' || record.source === 'provider') compact.source = record.source;
    const provider = searchSkillProvider(record.provider);
    if (provider) compact.provider = provider;
    if (typeof record.similarity === 'number' && Number.isFinite(record.similarity)) compact.similarity = record.similarity;
    const nextTool = searchSkillRead(compact);
    if (nextTool) compact.nextTool = nextTool;
    return [compact];
  });
  const rest = { ...(data as Record<string, unknown>) };
  delete rest.skills;
  const keys = Object.keys(rest);
  const after = Math.max(keys.indexOf('web'), keys.indexOf('tools'));
  const ordered: Record<string, unknown> = {};
  if (after < 0) Object.assign(ordered, rest, { skills });
  else keys.forEach((key, index) => {
    ordered[key] = rest[key];
    if (index === after) ordered.skills = skills;
  });
  return { ...(envelope as Record<string, unknown>), data: ordered } as T;
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
