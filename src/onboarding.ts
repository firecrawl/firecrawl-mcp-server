import { z } from 'zod';
import type { ContentResult, Context, FastMCP } from 'fastmcp';
import { structuredText } from './tool-output';

const choiceSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/),
    title: z.string().trim().min(1).max(100),
    description: z.string().trim().min(1).max(240),
  })
  .strict();

const defaults = [
  {
    id: 'alexandria',
    title: 'Alexandria providers',
    description:
      'Get structured records, such as YC companies, products, or market data.',
  },
  {
    id: 'developer',
    title: 'Developer index',
    description: 'Find code examples, library behavior, and known issues.',
  },
  {
    id: 'scrape',
    title: 'Scrape a page',
    description: 'Turn a URL into clean content or structured fields.',
  },
  {
    id: 'search',
    title: 'Web search',
    description: 'Find current sources and build a cited answer.',
  },
  {
    id: 'explore',
    title: 'Not sure yet',
    description: 'Explore sources and examples without running a paid sample.',
  },
];

const parameters = z
  .object({
    question: z.string().trim().min(1).max(300).optional(),
    choices: z
      .array(choiceSchema)
      .min(2)
      .max(5)
      .refine(
        (choices) =>
          new Set(choices.map(({ id }) => id)).size === choices.length,
        'Choice IDs must be unique.'
      )
      .optional(),
  })
  .strict();

const responseSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('accept'),
    content: z
      .object({
        choice: z.string(),
        goal: z.string().max(1000).optional(),
      })
      .strict(),
  }),
  z.object({ action: z.literal('decline') }),
  z.object({ action: z.literal('cancel') }),
]);

type SessionData = { [key: string]: unknown };
const inputKey = 'firecrawl_onboarding_goal';

export function registerOnboardingTools(
  server: Pick<FastMCP<SessionData>, 'addTool'>
): void {
  server.addTool({
    name: 'firecrawl_onboarding',
    annotations: {
      title: 'Choose a Firecrawl starting point',
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
    description:
      'Collect a first-use goal with a native choice form on supported clients. Optional choices can reflect relevant interests without including raw chat history or memory. Returns the selected choice and optional goal; does not discover providers, run research, or spend credits. Clients without form support receive readable choices for a chat reply.',
    outputSchema: z
      .object({
        status: z.enum(['selected', 'cancelled', 'declined', 'unsupported']),
        choice: choiceSchema.optional(),
        goal: z.string().optional(),
        question: z.string().optional(),
        choices: z.array(choiceSchema).optional(),
        message: z.string().optional(),
      })
      .strict(),
    parameters,
    execute: async (args, context): Promise<ContentResult> => {
      const {
        question = 'What would you like to use Firecrawl for first?',
        choices = defaults,
      } = parameters.parse(args);
      const elicitation = (context as Context<SessionData>).elicitation;
      const capabilities = elicitation.capabilities as
        | { extensions?: Record<string, { form?: unknown }> }
        | undefined;
      if (!capabilities?.extensions?.['openai/elicitation']?.form) {
        return structuredText({
          status: 'unsupported',
          question,
          choices,
          message:
            'Ask these choices in chat and wait for a reply. No goal has been selected.',
        });
      }
      const form = {
        mode: 'form',
        message: question,
        requestedSchema: {
          type: 'object',
          properties: {
            choice: {
              type: 'string',
              title: 'Starting point',
              oneOf: choices.map(({ id, title, description }) => ({
                const: id,
                title,
                description,
              })),
            },
            goal: {
              type: 'string',
              title: 'Your question or URL (optional)',
              maxLength: 1000,
            },
          },
          required: ['choice'],
          additionalProperties: false,
        },
      };
      let response: unknown;
      if (elicitation.protocolVersion === '2026-07-28') {
        const responses = z
          .record(z.string(), z.unknown())
          .optional()
          .parse(elicitation.inputResponses);
        response = responses?.[inputKey];
        if (response === undefined) {
          // No requestState is needed: the retry carries the original choices.
          // No credentials, stored preferences, or paid actions depend on this reply.
          return {
            content: [],
            resultType: 'input_required',
            inputRequests: {
              [inputKey]: { method: 'openai/elicitation/create', params: form },
            },
          } as ContentResult;
        }
      } else {
        response = await elicitation.request(form);
      }
      const result = responseSchema.parse(response);
      if (result.action !== 'accept') {
        return structuredText({
          status: result.action === 'cancel' ? 'cancelled' : 'declined',
          message:
            'The user did not select a goal. Do not run a sample or immediately reopen the form.',
        });
      }
      const selected = choices.find(({ id }) => id === result.content.choice);
      if (!selected)
        throw new Error(
          'The selected choice is not one of the offered options.'
        );
      return structuredText({
        status: 'selected',
        choice: selected,
        goal: result.content.goal?.trim() || undefined,
      });
    },
  });
}
