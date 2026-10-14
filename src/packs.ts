import { z } from 'zod';
import fantasy from './packs/fantasy.json';
import marketing from './packs/marketing.json';

const TOOL_REF = /^firecrawl_[a-z_]+$/;
const CAPABILITY_REF = /^[a-z0-9-]+\/[a-z0-9_/-]+$/;

const packSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    title: z.string().min(1),
    summary: z.string().min(1),
    when: z.string().min(1),
    page: z.string().url(),
    providers: z.array(z.string().min(1)).min(1),
    askFirst: z.array(z.string().min(1)).min(1),
    recipes: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z][a-z0-9-]*$/),
            title: z.string().min(1),
            when: z.string().min(1),
            keywords: z.array(z.string().min(1)).min(1),
            steps: z
              .array(
                z
                  .object({
                    use: z
                      .array(z.string().refine((ref) => TOOL_REF.test(ref) || CAPABILITY_REF.test(ref)))
                      .min(1)
                      .optional(),
                    do: z.string().min(1),
                  })
                  .strict()
              )
              .min(1),
            output: z.string().min(1),
          })
          .strict()
      )
      .min(1),
    rules: z.array(z.string().min(1)).min(1),
  })
  .strict()
  .superRefine((pack, ctx) => {
    for (const recipe of pack.recipes) {
      for (const step of recipe.steps) {
        for (const ref of step.use ?? []) {
          if (!TOOL_REF.test(ref) && !pack.providers.includes(ref.split('/')[0])) {
            ctx.addIssue({ code: 'custom', message: `${pack.id}/${recipe.id}: ${ref} is not from a pack provider` });
          }
        }
      }
    }
  });

export type Pack = z.infer<typeof packSchema>;
type Recipe = Pack['recipes'][number];

/** Pack definitions, one data file per pack under src/packs/. */
export const PACKS: readonly Pack[] = [fantasy, marketing].map((pack) => packSchema.parse(pack));

const PACK_IDS = PACKS.map((pack) => pack.id) as [string, ...string[]];

export const packsSchema = z
  .object({
    pack: z.enum(PACK_IDS).optional().describe('Pack ID. Omit to list the packs.'),
    task: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .optional()
      .describe("A recipe ID or the user's request in a few words; selects the matching recipe."),
  })
  .strict();

export const PACKS_TOOL_DESCRIPTION =
  'Use this when the user wants help with ' +
  PACKS.map((pack) => `${pack.title.toLowerCase()}: ${pack.when}`).join('; or ') +
  '. Returns a curated Alexandria playbook: questions to ask the user first, ordered recipes naming the exact provider capabilities, output rules, and cost and terms notes. With no arguments, lists packs; pack returns its playbook; task selects the matching recipe. Read-only and free. Read the selected capability contracts with firecrawl_find_tools (nextTool) and run them with firecrawl_scrape.';

/** One sentence for the server instructions. */
export const PACKS_INSTRUCTIONS_SENTENCE =
  `For ${PACKS.map((pack) => pack.title.toLowerCase()).join(' or ')}, firecrawl_packs returns a playbook: questions to ask the user, ordered Alexandria capabilities, and output rules.`;

function capabilityRefs(recipes: readonly Recipe[]): string[] {
  const refs = recipes.flatMap((recipe) => recipe.steps.flatMap((step) => step.use ?? []));
  return [...new Set(refs.filter((ref) => !TOOL_REF.test(ref)))];
}

/** A firecrawl_find_tools call that expands the inputs and outputs of the given capabilities. */
function contractsTool(recipes: readonly Recipe[]) {
  const refs = capabilityRefs(recipes);
  return {
    name: 'firecrawl_find_tools',
    arguments: {
      providers: [...new Set(refs.map((ref) => ref.split('/')[0]))],
      capabilities: [...new Set(refs.map((ref) => ref.slice(ref.indexOf('/') + 1)))],
      expand: ['options', 'response'],
    },
  };
}

function packTool(pack: Pack, task?: string) {
  return { name: 'firecrawl_packs', arguments: task ? { pack: pack.id, task } : { pack: pack.id } };
}

function normalize(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
}

function matchRecipe(pack: Pack, task: string): { recipe: Recipe; score: number } | undefined {
  const exact = pack.recipes.find((recipe) => recipe.id === task.trim().toLowerCase());
  if (exact) return { recipe: exact, score: Number.POSITIVE_INFINITY };
  const text = normalize(task);
  let best: { recipe: Recipe; score: number } | undefined;
  for (const recipe of pack.recipes) {
    const score = recipe.keywords.filter((keyword) => text.includes(normalize(keyword))).length;
    if (score > 0 && (!best || score > best.score)) best = { recipe, score };
  }
  return best;
}

function playbook(pack: Pack, recipes: readonly Recipe[], others: readonly Recipe[]) {
  return {
    pack: pack.id,
    title: pack.title,
    summary: pack.summary,
    askFirst: pack.askFirst,
    recipes: recipes.map(({ keywords: _keywords, ...recipe }) => recipe),
    ...(others.length ? { otherRecipes: others.map((recipe) => ({ id: recipe.id, title: recipe.title, when: recipe.when })) } : {}),
    rules: pack.rules,
    page: pack.page,
    nextTool: contractsTool(recipes),
  };
}

function packList() {
  return PACKS.map((pack) => ({
    id: pack.id,
    title: pack.title,
    summary: pack.summary,
    when: pack.when,
    recipes: pack.recipes.map((recipe) => ({ id: recipe.id, title: recipe.title })),
    nextTool: packTool(pack),
  }));
}

/** The firecrawl_packs result for one call. */
export function packsResult(args: z.infer<typeof packsSchema>) {
  const { pack: packId, task } = args;
  if (!packId && !task) return { packs: packList() };
  const candidates = packId ? PACKS.filter((pack) => pack.id === packId) : PACKS;
  let selected: { pack: Pack; recipe: Recipe; score: number } | undefined;
  for (const pack of candidates) {
    const match = task ? matchRecipe(pack, task) : undefined;
    if (match && (!selected || match.score > selected.score)) selected = { pack, ...match };
  }
  if (selected) {
    return playbook(selected.pack, [selected.recipe], selected.pack.recipes.filter((recipe) => recipe !== selected.recipe));
  }
  if (!packId) {
    return { message: 'No pack recipe matches this task. Choose a pack from packs.', packs: packList() };
  }
  const pack = candidates[0];
  return {
    ...(task ? { message: 'No recipe matched the task, so every recipe is listed.' } : {}),
    ...playbook(pack, pack.recipes, []),
  };
}

/**
 * Pointers to the packs whose providers appear in a discovery result, so an
 * agent that found a pack's provider can load the matching playbook.
 */
export function packPointers(providers: Iterable<unknown>) {
  const found = new Set([...providers].filter((provider): provider is string => typeof provider === 'string'));
  return PACKS.filter((pack) => pack.providers.some((provider) => found.has(provider))).map((pack) => ({
    pack: pack.id,
    title: pack.title,
    nextTool: packTool(pack),
  }));
}
