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

export const alexandriaSessionFeedbackSchema = z.strictObject({
  endpoint: z.literal('alexandria'),
  rating: z.enum(['good', 'bad', 'partial']),
  ...alexandriaFeedbackFields,
  requestedWebsite: alexandriaFeedbackFields.requestedWebsite.unwrap(),
  rationale: detail,
});
