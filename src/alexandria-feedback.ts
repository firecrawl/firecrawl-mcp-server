import { z } from 'zod';

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
};

/**
 * Shared by the server instructions and the Alexandria tool descriptions so an
 * agent that only reads one of them still learns the feedback loop exists.
 * Wording is checked by scripts/agent-metadata-policy.mjs.
 */
export const ALEXANDRIA_FEEDBACK_GUIDANCE =
  'Optional Alexandria quality feedback is available through firecrawl_feedback with endpoint "alexandria", whether a capability ran or discovery found nothing for the website. One submission describes one requested website and functionality, a rating, a rationale from observed results, and any provider or capability gaps. It is free, needs no job ID, and has no deadline.';

/** Appended to Alexandria results so the pointer travels with the data the agent is reading. */
export const ALEXANDRIA_FEEDBACK_HINT = {
  name: 'firecrawl_feedback',
  when: 'Optional, once per website after the task is complete, including when no provider covered the site. Free; no job ID or deadline.',
  arguments: {
    endpoint: 'alexandria',
    rating: '<good | partial | bad>',
    requestedWebsite: {
      url: '<website the user needed data from>',
      requestedFunctionality: '<what they needed from it>',
    },
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

export const alexandriaSessionFeedbackSchema = z.strictObject({
  endpoint: z.literal('alexandria'),
  rating: z.enum(['good', 'bad', 'partial']),
  ...alexandriaFeedbackFields,
  requestedWebsite: alexandriaFeedbackFields.requestedWebsite.unwrap(),
  rationale: detail,
});
