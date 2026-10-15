import { z } from 'zod';
import fantasy from './packs/fantasy.json';
import marketing from './packs/marketing.json';

const packSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  title: z.string().min(1),
  summary: z.string().min(1),
  when: z.string().min(1),
  page: z.string().url(),
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

const PACKS = [fantasy, marketing].map((pack) => packSchema.parse(pack));
const PACK_IDS = PACKS.map((pack) => pack.id) as [string, ...string[]];

export const packsSchema = z.object({
  pack: z.enum(PACK_IDS).optional().describe('Pack ID. Omit to list the packs.'),
}).strict();

export const PACKS_TOOL_DESCRIPTION =
  'Use this when the user wants help with ' +
  PACKS.map((pack) => `${pack.title.toLowerCase()}: ${pack.when}`).join('; or ') +
  '. Returns agent-facing context: relevant providers, what they can do, a short skill on using them well, and examples of useful combinations. With no arguments, lists packs; pack loads one. This tool does not run providers or require an intake questionnaire. Read-only and free. Follow a provider\'s nextTool to browse live capabilities and prices with firecrawl_find_tools, then inspect selected contracts before execution through firecrawl_scrape.';

export const PACKS_INSTRUCTIONS_SENTENCE =
  `For ${PACKS.map((pack) => pack.title.toLowerCase()).join(' or ')}, firecrawl_packs provides relevant providers and short guidance on using them well; adapt it to the user's request.`;

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
    nextTool: { name: 'firecrawl_packs', arguments: { pack: pack.id } },
  }));
}
