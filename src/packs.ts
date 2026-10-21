import { z } from 'zod';
import creators from './packs/creators.json';
import fantasy from './packs/fantasy.json';
import investing from './packs/investing.json';
import jobs from './packs/jobs.json';
import marketing from './packs/marketing.json';
import prospecting from './packs/prospecting.json';
import shopping from './packs/shopping.json';
import travel from './packs/travel.json';
import callShapes from './packs/calls.json';

const packSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  title: z.string().min(1),
  summary: z.string().min(1),
  when: z.string().min(1),
  page: z.string().url().optional(),
  providers: z.array(z.object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    summary: z.string().min(1),
    capabilities: z.array(z.string().regex(/^[a-z0-9_/-]+$/)).min(1),
  }).strict()).min(1),
  skill: z.array(z.string().min(1)).min(1),
  examples: z.array(z.object({
    request: z.string().min(1),
    approach: z.string().min(1),
  }).strict()).min(1),
}).strict();

const PACKS = [creators, marketing, prospecting, jobs, investing, shopping, travel, fantasy].map((pack) => packSchema.parse(pack));
const CALL_SHAPES = z.record(z.string(), z.object({
  name: z.string().min(1).optional(),
  options: z.record(z.string(), z.string()),
  inputs: z.string().min(1).optional(),
}).strict()).parse(callShapes);
const PACK_IDS = PACKS.map((pack) => pack.id) as [string, ...string[]];

export const packsSchema = z.object({
  pack: z.enum(PACK_IDS).optional().describe('Pack ID. Omit to list the packs.'),
}).strict();

export const PACKS_TOOL_DESCRIPTION =
  'Start here when the task fits one of these packs. A pack names the Alexandria providers that hold the data for that kind of task, what each returns, and short guidance on using them, so you can query them directly instead of assembling the answer from web pages.\n' +
  PACKS.map((pack) => `- ${pack.id}: ${pack.when}`).join('\n') +
  '\nCall with {pack} to load one, or {} to list them. Read-only, free, and it does not run providers or ask the user questions. Then follow a provider\'s nextTool to browse its live capabilities and prices with firecrawl_find_tools, and execute selected capabilities through firecrawl_scrape.';

export const PACKS_INSTRUCTIONS_SENTENCE =
  `For requests about ${PACKS.map((pack) => pack.title.toLowerCase()).join(', ')}, run the provider calls listed under packs in search results before reading pages.`;

export function packsResult({ pack: packId }: z.infer<typeof packsSchema>) {
  if (!packId) {
    return {
      packs: PACKS.map((pack) => ({
        id: pack.id,
        title: pack.title,
        summary: pack.summary,
        when: pack.when,
        nextTool: { name: 'firecrawl_packs', arguments: { pack: pack.id } },
      })),
    };
  }
  const pack = PACKS.find((item) => item.id === packId)!;
  return {
    pack: pack.id,
    title: pack.title,
    summary: pack.summary,
    providers: pack.providers.map((provider) => ({
      ...provider,
      nextTool: {
        name: 'firecrawl_find_tools',
        arguments: { providers: [provider.id], expand: [], includeCosts: true },
      },
    })),
    skill: pack.skill,
    examples: pack.examples,
    page: pack.page,
  };
}

type ToolRef = { provider?: unknown; capability?: unknown };

const MAX_PACKS = 2;
const MAX_PACK_CALLS = 4;

/**
 * Ready firecrawl_scrape calls from the packs whose providers appear in refs: the matched
 * providers' pack capabilities, the matched capabilities first, at most four per pack.
 */
export function packCalls(refs: Iterable<ToolRef>) {
  const found = [...refs].filter((ref): ref is { provider: string; capability?: unknown } => typeof ref?.provider === 'string');
  return PACKS.map((pack) => {
    const matched = found.filter((ref) => pack.providers.some((provider) => provider.id === ref.provider));
    const candidates = pack.providers
      .filter((provider) => matched.some((ref) => ref.provider === provider.id))
      .flatMap((provider) => provider.capabilities.map((capability) => ({ provider: provider.id, capability })));
    const hit = (tool: { provider: string; capability: string }) => matched.some((ref) => ref.provider === tool.provider && ref.capability === tool.capability);
    const tools = [...candidates.filter(hit), ...candidates.filter((tool) => !hit(tool))].slice(0, MAX_PACK_CALLS);
    return { pack, matched: matched.length, tools };
  })
    .filter((selection) => selection.matched)
    .sort((a, b) => b.matched - a.matched)
    .slice(0, MAX_PACKS)
    .map(({ pack, tools }) => ({
      pack: pack.id,
      title: pack.title,
      note: `For this request, prefer these provider calls over reading web pages: each returns sourced records for ${pack.title.toLowerCase()}. Run one with firecrawl_scrape, replacing the <type> values; inputs names the other options, and several calls can go in one alexandria array. Calls are billed; firecrawl_find_tools with includeCosts shows each price.`,
      providers: pack.providers
        .filter((provider) => tools.some((tool) => tool.provider === provider.id))
        .map((provider) => ({
          provider: provider.id,
          about: provider.summary,
          calls: tools.filter((tool) => tool.provider === provider.id).map(({ capability }) => {
            const { options = {}, ...shape } = CALL_SHAPES[`${provider.id}/${capability}`] ?? {};
            return { ...('name' in shape ? { name: shape.name } : {}), call: { name: 'firecrawl_scrape', arguments: { alexandria: { provider: provider.id, capability, options } } }, ...('inputs' in shape ? { inputs: shape.inputs } : {}) };
          }),
        })),
      guide: { name: 'firecrawl_packs', arguments: { pack: pack.id } },
    }));
}

/** Pack providers named by a page URL's host: bestbuy.com is bestbuy-com, boards.greenhouse.io is greenhouse-io. */
export function packProvidersForUrl(url: unknown): ToolRef[] {
  let host: string;
  try { host = new URL(String(url)).hostname.toLowerCase(); } catch { return []; }
  const labels = host.split('.');
  const candidates = new Set(labels.map((_, index) => labels.slice(index).join('-')));
  if (labels.length >= 2) candidates.add(labels[labels.length - 2]);
  const ids = new Set(PACKS.flatMap((pack) => pack.providers.map((provider) => provider.id)).filter((id) => candidates.has(id)));
  return [...ids].map((provider) => ({ provider }));
}

/** Web results count toward a pack only when at least two of them come from that pack's providers. */
export function webPackRefs(web: unknown): ToolRef[] {
  if (!Array.isArray(web)) return [];
  const refs = web.flatMap((result) => packProvidersForUrl((result as { url?: unknown })?.url));
  return PACKS.flatMap((pack) => {
    const mine = refs.filter((ref) => pack.providers.some((provider) => provider.id === ref.provider));
    return mine.length >= 2 ? mine : [];
  });
}
