/**
 * Enrich one person or one company.
 *
 * Thin MCP wrapper over the existing Exchange waterfall. The call is the one
 * the API client already sends: POST /v2/scrape with
 * `{ provider: "firecrawl", capability: "enrich", options: { url, format: "json" } }`.
 * That options object is the only enrich payload in the Exchange client tests.
 * Name, email, and domain are not sent. Provider order, terms, and billing
 * stay in that waterfall.
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { type ContentResult, type McpRuntime, UserError } from './mcp/runtime.js';
import { requestOrigin } from './origin';
import {
  assertExchangeCredential,
  relayExchangeError,
} from './tool-helpers.js';
import { structuredText } from './tool-output';

interface SessionData {
  firecrawlApiKey?: string;
  clientUserAgent?: string;
  [key: string]: unknown;
}

type ClientLike = {
  http: {
    post: (
      endpoint: string,
      body?: Record<string, unknown>,
      init?: { headers?: Record<string, string>; timeoutMs?: number }
    ) => Promise<{ data?: unknown }>;
  };
};

type GetClient = (session?: SessionData) => unknown;
type HasCredential = (session?: SessionData) => boolean;

export type EnrichKind = 'person' | 'company';

const REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

const str = (description: string) =>
  z.string().nullable().optional().describe(description);
const num = (description: string) =>
  z.number().nullable().optional().describe(description);

export const enrichOutputSchema = z
  .object({
    success: z.boolean().nullable().optional().describe('Whether enrichment returned a profile.'),
    error: z.unknown().optional().describe('Provider error for this target, when the waterfall did not return a profile.'),
    message: str('Human-readable result or refusal.'),
    requestId: str('Idempotency key for this enrichment. Reuse it only with the identical target.'),
    scrape_id: str('Identifier of the underlying scrape.'),
    creditsCost: num('Credits this enrichment consumed, from the Alexandria execution total.'),
    target: z
      .object({
        type: z.enum(['person', 'company']).describe('Person or company, inferred from the LinkedIn URL when omitted.'),
        url: z.string().describe('LinkedIn URL that was enriched.'),
      })
      .optional()
      .describe('The person or company this call enriched.'),
    profile: z.unknown().optional().describe('Structured profile returned for the target. Fields are the waterfall payload, passed through.'),
    nextTool: z.unknown().optional().describe('Follow-up call when the waterfall needs one, such as reading provider terms.'),
  })
  .describe('One enriched person or company profile, and the credits the call consumed.');

/**
 * LinkedIn person pages are `/in/<slug>` and company pages are `/company/<slug>`,
 * on linkedin.com or a subdomain (the Exchange client test uses ca.linkedin.com).
 */
export function linkedInPage(raw: string): EnrichKind | undefined {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return undefined;
  if (parsed.username || parsed.password) return undefined;
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (host !== 'linkedin.com' && !host.endsWith('.linkedin.com')) return undefined;
  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length !== 2) return undefined;
  const [head, slug] = segments;
  if (!slug || slug === '.' || slug === '..') return undefined;
  if (head.toLowerCase() === 'in') return 'person';
  if (head.toLowerCase() === 'company') return 'company';
  return undefined;
}

const enrichTargetSchema = z
  .strictObject({
    type: z
      .enum(['person', 'company'])
      .optional()
      .describe(
        'person or company. Omit to infer it from the LinkedIn URL: /in/ is a person and /company/ is a company.'
      ),
    url: z
      .string()
      .trim()
      .min(1)
      .describe(
        'LinkedIn person or company page, such as https://www.linkedin.com/in/example or https://www.linkedin.com/company/example. Country hosts such as https://ca.linkedin.com/in/example are accepted. Pass the page itself, not a sub-page.'
      ),
  })
  .superRefine((target, ctx) => {
    const kind = linkedInPage(target.url);
    if (!kind) {
      ctx.addIssue({
        code: 'custom',
        path: ['url'],
        message:
          'url must be a LinkedIn person (/in/) or company (/company/) page, such as https://www.linkedin.com/in/example or https://www.linkedin.com/company/example.',
      });
      return;
    }
    if (target.type && target.type !== kind) {
      ctx.addIssue({
        code: 'custom',
        path: ['type'],
        message: `type "${target.type}" does not match this LinkedIn URL, which is a ${kind} page.`,
      });
    }
  });

export const enrichParameters = z.strictObject({
  target: enrichTargetSchema.describe(
    'The one person or company to enrich. Set type when you already know which; otherwise it is taken from the LinkedIn URL.'
  ),
  requestId: z
    .string()
    .regex(REQUEST_ID)
    .optional()
    .describe(
      'Idempotency key bound to this enrichment. Generated when omitted and returned with the result. Reuse it only to retry the identical target.'
    ),
  timeout: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Execution timeout in milliseconds. Omit to use the client default.'),
});

/** https, no query, no fragment, no trailing slash. The slug's case is kept. */
export function canonicalLinkedInUrl(raw: string): string | undefined {
  if (!linkedInPage(raw)) return undefined;
  const parsed = new URL(raw.trim());
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  const [head, slug] = parsed.pathname.split('/').filter(Boolean);
  const kind = head.toLowerCase() === 'in' ? 'in' : 'company';
  return `https://${host}/${kind}/${slug}`;
}

export function resolveEnrichTarget(target: {
  type?: EnrichKind;
  url: string;
}): { type: EnrichKind; url: string } {
  const inferred = linkedInPage(target.url);
  const url = canonicalLinkedInUrl(target.url);
  if (!inferred || !url || (target.type && target.type !== inferred)) {
    throw new UserError(
      'url must be a LinkedIn person (/in/) or company (/company/) page.'
    );
  }
  return { type: target.type ?? inferred, url };
}

/** The only options the Exchange client sends for firecrawl/enrich. */
export function enrichAlexandriaCall(url: string) {
  return {
    provider: 'firecrawl',
    capability: 'enrich',
    options: { url, format: 'json' as const },
  };
}

function samePayloadNote(requestId: string): string {
  return `Request ID: ${requestId}. Reuse this ID only with the identical payload.`;
}

function withRequestId(error: unknown, requestId: string): UserError {
  if ((error as { response?: { status?: number } } | null)?.response?.status === 401) {
    throw error;
  }
  const message = error instanceof Error ? error.message : String(error);
  return new UserError(`${message} ${samePayloadNote(requestId)}`, {
    ...(error instanceof UserError ? error.extras : {}),
    requestId,
  });
}

const WATERFALL_META_KEYS = new Set(['status', 'steps']);

/** `{ status: "disabled" }` with no profile fields is a waterfall that did not run. */
function isDisabledWaterfall(data: unknown): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const record = data as Record<string, unknown>;
  if (record.status !== 'disabled') return false;
  return Object.keys(record).every((key) => WATERFALL_META_KEYS.has(key));
}

function readEnrichment(
  body: unknown,
  target: { type: EnrichKind; url: string },
  requestId: string
): Record<string, unknown> {
  const envelope = body as {
    scrape_id?: unknown;
    data?: { alexandria?: unknown; creditsCost?: unknown };
  };
  const items = envelope?.data?.alexandria;
  if (!Array.isArray(items) || items.length === 0) {
    throw new UserError(
      `Enrichment returned no profile. ${samePayloadNote(requestId)}`,
      { message: 'Enrichment returned no profile.', requestId, success: false }
    );
  }
  const item = items[0] as { data?: unknown; error?: unknown };
  const creditsCost = envelope.data?.creditsCost;
  const result: Record<string, unknown> = {
    success: !item?.error,
    requestId,
    target,
  };
  if (typeof envelope.scrape_id === 'string') result.scrape_id = envelope.scrape_id;
  if (typeof creditsCost === 'number') result.creditsCost = creditsCost;
  if (item?.error) {
    result.success = false;
    result.error = item.error;
    return result;
  }
  if (isDisabledWaterfall(item?.data)) {
    result.success = false;
    result.message =
      'Enrichment is disabled for this profile. No profile was returned.';
    return result;
  }
  if (item?.data !== undefined) result.profile = item.data;
  return result;
}

export function registerEnrichTools(
  server: Pick<McpRuntime<SessionData>, 'addTool'>,
  getClient: GetClient,
  hasCredential: HasCredential
): void {
  server.addTool({
    name: 'firecrawl_enrich',
    annotations: {
      title: 'Enrich a person or company',
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
    description: `
Enrich one known person or one known company and return that profile. Use it when the task already identifies who or which company, usually by a LinkedIn URL, and needs the profile. firecrawl_search finds pages and candidate matches. firecrawl_enrich looks up the one target you name.

Pass target.url as a LinkedIn person page (/in/) or company page (/company/). Omit target.type to take person or company from that URL. Country hosts such as ca.linkedin.com are accepted. The lookup calls the existing enrichment waterfall, so the team's provider order, terms, and credit charge stay there.

Returns the structured profile and creditsCost, the credits the call consumed. A provider error is on the result.
`,
    outputSchema: enrichOutputSchema,
    parameters: enrichParameters,
    execute: async (args, { session, client: mcpClient }): Promise<ContentResult> => {
      const { target, requestId: suppliedRequestId, timeout } = args as z.infer<
        typeof enrichParameters
      >;
      const resolved = resolveEnrichTarget(target);
      assertExchangeCredential(hasCredential(session));
      const requestId = suppliedRequestId ?? randomUUID();
      const client = getClient(session) as ClientLike;
      let response: { data?: unknown };
      try {
        response = await relayExchangeError(
          () =>
            client.http.post(
              '/v2/scrape',
              {
                alexandria: enrichAlexandriaCall(resolved.url),
                origin: requestOrigin(mcpClient, session),
                ...(timeout !== undefined ? { timeout } : {}),
              },
              {
                headers: { 'x-request-id': requestId },
                ...(timeout !== undefined ? { timeoutMs: timeout + 5000 } : {}),
              }
            ),
          { tool: 'firecrawl_enrich', requestId, providers: ['firecrawl'] }
        );
      } catch (error) {
        throw withRequestId(error, requestId);
      }
      const body = response?.data as { success?: unknown; error?: unknown } | undefined;
      if (!body || body.success !== true) {
        const message =
          typeof body?.error === 'string' ? body.error : 'Enrichment returned no profile.';
        throw new UserError(`${message} ${samePayloadNote(requestId)}`, {
          message,
          requestId,
          success: false,
        });
      }
      return structuredText(readEnrichment(body, resolved, requestId));
    },
  });
}
