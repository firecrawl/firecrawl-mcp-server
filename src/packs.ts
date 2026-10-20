import { z } from 'zod';
import creators from './packs/creators.json';
import fantasy from './packs/fantasy.json';
import investing from './packs/investing.json';
import jobs from './packs/jobs.json';
import marketing from './packs/marketing.json';
import prospecting from './packs/prospecting.json';
import shopping from './packs/shopping.json';
import travel from './packs/travel.json';

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
const PACK_IDS = PACKS.map((pack) => pack.id) as [string, ...string[]];

export const packsSchema = z.object({
  pack: z.enum(PACK_IDS).optional().describe('Pack ID. Omit to list the packs.'),
}).strict();

export const PACKS_TOOL_DESCRIPTION =
  'Start here when the task fits one of these packs. A pack names the Alexandria providers that hold the data for that kind of task, what each returns, and short guidance on using them, so you can query them directly instead of assembling the answer from web pages.\n' +
  PACKS.map((pack) => `- ${pack.id}: ${pack.when}`).join('\n') +
  '\nCall with {pack} to load one, or {} to list them. Read-only, free, and it does not run providers or ask the user questions. Then follow a provider\'s nextTool to browse its live capabilities and prices with firecrawl_find_tools, and execute selected capabilities through firecrawl_scrape.';

export const PACKS_INSTRUCTIONS_SENTENCE =
  `For requests about ${PACKS.map((pack) => pack.title.toLowerCase()).join(', ')}, call firecrawl_packs before searching; it names the providers that hold that data.`;

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

export function packPointers(providers: Iterable<unknown>) {
  const found = new Set([...providers].filter((provider): provider is string => typeof provider === 'string'));
  return PACKS.filter((pack) => pack.providers.some((provider) => found.has(provider.id))).map((pack) => ({
    pack: pack.id,
    title: pack.title,
    note: `The ${pack.id} pack names the providers that hold this kind of data and how to use them.`,
    nextTool: { name: 'firecrawl_packs', arguments: { pack: pack.id } },
  }));
}
