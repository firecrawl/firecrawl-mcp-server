import { z } from 'zod';
import type { FeedbackTokenStore } from './alexandria-feedback-tokens.js';

const detail = z.string().trim().min(1).max(2000);
const name = z.string().trim().min(1).max(200);
export const alexandriaFeedbackFields = {
  requestedWebsite: z
    .strictObject({
      url: z.url({ protocol: /^https?$/ }).max(2048),
      requestedFunctionality: detail,
    })
    .optional(),
  rationale: detail.optional(),
  objective: detail.optional(),
  providerFeedback: z
    .array(
      z.strictObject({
        name,
        issue: z.enum([
          'missing_provider',
          'insufficient_coverage',
          'provider_unavailable',
          'other',
        ]),
        why: detail,
      })
    )
    .max(20)
    .optional(),
  capabilityFeedback: z
    .array(
      z
        .strictObject({
          name,
          provider: name,
          issue: z.enum([
            'new_capability_request',
            'missing_capability',
            'insufficient_functionality',
            'incorrect_result',
            'execution_error',
            'other',
          ]),
          why: detail,
          requestedFunctionality: detail.optional(),
        })
        .refine(
          (value) =>
            value.issue !== 'new_capability_request' ||
            value.requestedFunctionality !== undefined,
          {
            path: ['requestedFunctionality'],
            message: 'Required for new_capability_request',
          }
        )
    )
    .max(20)
    .optional(),
  callRatings: z
    .array(
      z.strictObject({
        ref: z.string().trim().min(1).max(32),
        rating: z.enum(['good', 'partial', 'bad']),
      })
    )
    .max(20)
    .optional(),
};

/** Appended to Alexandria results so the pointer travels with the data the agent is reading. */
export const ALEXANDRIA_FEEDBACK_HINT = {
  name: 'firecrawl_feedback',
  when: 'After task completion, within 20 minutes of your last Alexandria call. Free, optional, refunds 1 credit, No job ID needed.',
  arguments: {
    endpoint: 'alexandria',
    rating: '<good | partial | bad>',
    requestedWebsite: {
      url: '<website the user needed data from>',
      requestedFunctionality: '<what they needed from it>',
    },
    objective: '<underlying goal of the task>',
    rationale: '<why this rating, from observed results>',
    providerFeedback:
      '<optional [{name, issue, why}]: providers that were missing, thin, or unavailable>',
    capabilityFeedback:
      '<optional [{name, provider, issue, why, requestedFunctionality?}]: capabilities that were missing, wrong, or failed>',
  },
} as const;

type AlexandriaCall = { provider: string; capability: string };

/** Discovery and provider executions get the hint; Firecrawl-internal calls such as bash or terms do not. */
export function alexandriaCallsWarrantFeedback(
  calls: AlexandriaCall[]
): boolean {
  return calls.some(
    (call) => call.provider !== 'firecrawl' || call.capability === 'find-tools'
  );
}

export function withAlexandriaFeedbackHint<T>(
  envelope: T,
  enabled: boolean
): T {
  if (!enabled || !envelope || typeof envelope !== 'object') return envelope;
  return { ...envelope, feedbackTool: ALEXANDRIA_FEEDBACK_HINT };
}

/** The session's call tokens and per-call ratings in the shape the feedback API takes; unknown refs are reported back. */
export function alexandriaFeedbackTokens(
  callRatings: { ref: string; rating: 'good' | 'partial' | 'bad' }[] | undefined,
  store: FeedbackTokenStore
) {
  const rated = new Map<string, 'good' | 'partial' | 'bad'>();
  const unknownRefs: string[] = [];
  for (const { ref, rating } of callRatings ?? []) {
    const token = store.tokenForRef(ref);
    if (token) rated.set(token, rating);
    else unknownRefs.push(ref);
  }
  const tokens = store.tokens();
  return {
    tokens,
    callRatings: [...rated].map(([token, rating]) => ({ token, rating })),
    sent: [...new Set([...tokens, ...rated.keys()])],
    unknownRefs,
  };
}

export const alexandriaSessionFeedbackSchema = z.strictObject({
  endpoint: z.literal('alexandria'),
  rating: z.enum(['good', 'bad', 'partial']),
  ...alexandriaFeedbackFields,
  requestedWebsite: alexandriaFeedbackFields.requestedWebsite.unwrap(),
  rationale: detail,
});
