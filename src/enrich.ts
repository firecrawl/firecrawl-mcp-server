/**
 * People and company search and enrichment over Alexandria's B2B data providers.
 * people_company_search runs Alexandria's search waterfall (firecrawl/search/auto)
 * and people_company_enrich runs its enrichment waterfall; each picks the providers
 * itself.
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { type ContentResult, type McpRuntime, type ToolExecuteContext, UserError } from './mcp/runtime.js';
import { type AlexandriaTools } from './alexandria.js';
import { requestOrigin } from './origin';
import { relayExchangeError } from './tool-helpers.js';
import { withStructured } from './tool-output';

export interface SessionData {
  firecrawlApiKey?: string;
  clientUserAgent?: string;
  [key: string]: unknown;
}

export type GetClient = (session?: SessionData) => unknown;
export type AssertCredential = (session?: SessionData) => void;

// ---------- Input schemas ----------

const text = (about?: string) => (about ? z.string().optional().describe(about) : z.string().optional());

/** An input that needs every field of at least one set, checked at runtime and published as the same rule in its JSON Schema. */
function needsOneOf<S extends z.ZodRawShape>(shape: S, sets: string[][], message: string) {
  return z
    .strictObject(shape)
    .refine((r: Record<string, unknown>) => sets.some((set) => set.every((key) => has(r[key]))), { message })
    .meta({ anyOf: sets.map((required) => ({ required, properties: Object.fromEntries(required.map((key) => [key, { pattern: '\\S' }])) })) });
}

const has = (value: unknown) => typeof value === 'string' && value.trim() !== '';

const DEFAULT_MAX_CREDITS = 1000;

const NAME_SETS = (names: string[][], others: string[]) => names.flatMap((name) => others.map((other) => [...name, other]));

const CONTACT_FIELDS = ['work_email', 'personal_email', 'mobile'] as const;

export const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

export function compact<T extends object>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0))
  ) as T;
}

export const RETRYABLE = new Set(['provider_error', 'provider_unavailable', 'provider_rate_limited', 'request_timeout', 'precheck_unavailable', 'billing_unavailable']);

// ---------- Argument repair ----------

export const isPlain = (value: unknown): value is Record<string, any> => typeof value === 'object' && value !== null && !Array.isArray(value);

function defOf(schema: any): any {
  let def = schema?._zod?.def;
  while (def && ['optional', 'default', 'nullable'].includes(def.type)) def = def.innerType?._zod?.def;
  return def;
}

const shapeOf = (schema: unknown): Record<string, any> | undefined => {
  const def = defOf(schema);
  return def?.type === 'object' ? def.shape : undefined;
};

const RANGE = /^\s*(\d+)\s*(?:[-–,]\s*(\d+)|\+)\s*$/;

/**
 * Repairs near-miss shapes in place: one item where a list is expected, a string
 * where a list takes {"value"} items, "51-200" where it takes {"min", "max"}, and
 * a numeric string where a number is expected. Validation still runs afterwards.
 */
export function repair(schema: unknown, value: unknown): unknown {
  const def = defOf(schema);
  if (def?.type === 'number' && typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value);
  if (def?.type === 'array' && value !== undefined && value !== null) {
    const element = shapeOf(def.element);
    return (Array.isArray(value) ? value : [value]).map((item) => {
      if (typeof item === 'string' && element?.value) return { value: item };
      const range = typeof item === 'string' && element?.min ? RANGE.exec(item) : null;
      if (range) return compact({ min: Number(range[1]), max: range[2] ? Number(range[2]) : undefined });
      return repair(def.element, item);
    });
  }
  const shape = def?.type === 'object' ? def.shape : undefined;
  if (shape && isPlain(value)) {
    for (const key of Object.keys(value)) if (key in shape) value[key] = repair(shape[key], value[key]);
  }
  return value;
}

function fieldsAt(schema: unknown, path: PropertyKey[]): string[] {
  let current = schema;
  for (const segment of path) {
    const def = defOf(current);
    current = def?.type === 'array' ? def.element : shapeOf(current)?.[segment as string];
  }
  return Object.keys(shapeOf(current) ?? {});
}

export function checkArguments(tool: string, schema: z.ZodType, args: unknown, example: object): void {
  const parsed = schema.safeParse(args);
  if (parsed.success) return;
  const issues = parsed.error.issues.map((issue) => {
    const path = issue.path.join('.');
    if (issue.code !== 'unrecognized_keys') return { path, message: issue.message };
    const fields = fieldsAt(schema, issue.path);
    return { path, message: 'unknown field ' + issue.keys.join(', ') + (fields.length ? '; takes ' + fields.join(', ') : '') };
  });
  throw new UserError(
    'Invalid ' + tool + ' arguments. ' + issues.map((i) => (i.path ? i.path + ': ' : '') + i.message).join('; ') + '. Example: ' + JSON.stringify(example),
    { code: 'invalid_input', issues, example }
  );
}

/** Drops the session fields agents carry between Firecrawl tools; no provider takes them. */
export function dropSessionFields(args: Record<string, any>): void {
  delete args.conversationId;
  delete args.objective;
}

const ENTITY: Record<string, 'person' | 'company'> = {
  person: 'person',
  people: 'person',
  persons: 'person',
  company: 'company',
  companies: 'company',
  organization: 'company',
  organizations: 'company',
};

// ---------- people_company_search: the search waterfall ----------

const SEARCH_TIMEOUT_MS = 120_000;
const SEARCH_MAX_LIMIT = 100;
const SENIORITIES = ['owner', 'founder', 'c_suite', 'partner', 'vp', 'head', 'director', 'manager', 'senior', 'entry', 'intern'] as const;
const FUNCTIONS = [
  'engineering', 'sales', 'marketing', 'finance', 'human_resources', 'operations', 'product', 'design',
  'legal', 'information_technology', 'customer_success', 'data', 'research', 'education', 'healthcare', 'consulting',
] as const;

const values = (about: string) => z.array(z.string().min(1)).min(1).max(25).optional().describe(about);
const span = (about: string) =>
  z
    .strictObject({ min: z.number().int().min(0).optional(), max: z.number().int().min(0).optional() })
    .refine((r) => r.min !== undefined || r.max !== undefined, { message: 'give min, max or both' })
    .optional()
    .describe(about);

const searchFilters = z.strictObject({
  titles: values('People only. Current job titles, e.g. ["Head of Data"]; rows whose title does not match, or is held in the past, are dropped.'),
  seniority: z.array(z.enum(SENIORITIES)).min(1).optional().describe('People only. Rows whose title names another level are dropped; SVP, EVP and AVP meet vp.'),
  functions: z.array(z.enum(FUNCTIONS)).min(1).optional().describe('People only. Job functions; rows whose title names another function are dropped.'),
  company_domains: values('Companies by domain, e.g. ["example.com"]. For people, their employer; with it the search stops at the first provider that finds anyone.'),
  locations: values('Countries ("Germany", "US") or cities ("Berlin"). Country names are applied by the most providers.'),
  industries: values("LinkedIn's current industry names, e.g. Software Development."),
  headcount: span('Employee count, e.g. {"min": 51, "max": 200}.'),
  founded_year: span('e.g. {"min": 2018}.'),
  technologies: values('Technologies the company uses, e.g. ["Snowflake"].'),
  keywords: values('Words describing the company, e.g. ["web scraping"].'),
});

const searchParameters = z.strictObject({
  entity: z.enum(['person', 'company']).describe('Required. Exactly "person" (find people) or "company" (find companies).'),
  query: z.string().max(500).optional().describe('Free text, applied only by providers that take it. Prefer filters.'),
  filters: searchFilters.optional().describe('For people, company filters describe the employer. Every filter given is applied: a provider that cannot apply one never runs.'),
  limit: z.number().int().min(1).max(SEARCH_MAX_LIMIT).optional().describe('Rows wanted, 1 to ' + SEARCH_MAX_LIMIT + ', default 10.'),
  cursor: z.string().optional().describe('next_cursor from an earlier call with the same entity, filters and query, for more rows.'),
  count_only: z.boolean().optional().describe('Return only how many records match, without rows.'),
  max_credits: z
    .number()
    .int()
    .min(0)
    .max(10_000)
    .optional()
    .describe('Most credits the call may spend. Set it only to a budget the user gave; left out, it is ' + DEFAULT_MAX_CREDITS + '. A provider that could pass it is not started.'),
  provider: z.string().optional().describe('Ask only this provider, e.g. "prospeo". Leave it out to let the waterfall choose.'),
  options: z.record(z.string(), z.unknown()).optional().describe("With provider: that provider's own search options, sent as given instead of filters."),
});

const SEARCH_EXAMPLE = { entity: 'person', filters: { titles: ['Head of Data'], company_domains: ['example.com'] }, limit: 10 };

const searchRow = z.looseObject({
  name: z.string().optional(),
  title: z.string().optional(),
  title_match: z.enum(['current', 'past']).optional(),
  company: z.string().optional(),
  company_domain: z.string().optional(),
  domain: z.string().optional(),
  linkedin_url: z.string().optional(),
  industry: z.string().optional(),
  headcount: z.union([z.number(), z.string()]).optional(),
  location: z.string().optional(),
  founded_year: z.number().optional(),
  source: z.string().describe('The provider that returned the row.'),
});

const searchResultSchema = z.looseObject({
  results: z.array(searchRow).optional().describe('People or companies, deduplicated, with no emails or phones.'),
  count: z.number().optional().describe('Rows returned; with count_only, how many records match.'),
  next_cursor: z.string().optional().describe('Pass as cursor, with the same filters, for more rows.'),
  providers: z
    .array(z.looseObject({ name: z.string(), capability: z.string(), leg: z.string().optional(), status: z.string(), returned: z.number(), dropped: z.number().optional(), unverified: z.number().optional(), credits: z.number(), credits_pending: z.number().optional(), ms: z.number().optional(), error: z.string().optional() }))
    .optional()
    .describe('Each provider call in order. leg is company or people when a company search fed a people search.'),
  chain: z.looseObject({}).optional().describe('When set, the filters the company search and the people search each applied.'),
  credits: z.number().optional().describe('Credits charged by the provider calls.'),
  credits_pending: z.number().optional().describe('The most that calls whose charge was not confirmed, such as a timeout, can still bill.'),
  stopped: z.string().optional().describe('max_credits when a provider was not started for the cap, team_quota when the team ran out of credits.'),
});

// ---------- people_company_enrich: the waterfall ----------

const ENRICH_MAX_RECORDS = 10;
const ENRICH_TIMEOUT_MS = 120_000;

const waterfallPerson = needsOneOf(
  {
    name: text('Full name.'),
    first_name: text(),
    last_name: text(),
    company: text('Employer name or domain.'),
    domain: text('Employer domain, e.g. example.com.'),
    linkedin_url: text('LinkedIn profile URL.'),
    email: text('Any email known for the person.'),
    phone: text('Any phone number known for the person.'),
  },
  [['linkedin_url'], ['email'], ['phone'], ...NAME_SETS([['name'], ['first_name', 'last_name']], ['company', 'domain'])],
  'Each person needs a linkedin_url, email or phone, or a name (name, or first_name and last_name) plus company or domain'
);

const waterfallCompany = needsOneOf(
  { name: text('Company name.'), domain: text('e.g. example.com.'), linkedin_url: text('LinkedIn company URL.') },
  [['domain'], ['linkedin_url'], ['name']],
  'Each company needs a domain, linkedin_url or name'
);

const enrichParameters = z.strictObject({
  people: z.array(waterfallPerson).min(1).max(ENRICH_MAX_RECORDS).optional().describe('People to enrich. People and companies together are at most ' + ENRICH_MAX_RECORDS + ' per call.'),
  companies: z.array(waterfallCompany).min(1).max(ENRICH_MAX_RECORDS).optional().describe('Companies to enrich, for firmographics.'),
  contact_fields: z
    .array(z.enum(CONTACT_FIELDS))
    .min(1)
    .optional()
    .describe('People only. Find these contact values for each person; companies in the same call still get firmographics. Include mobile only when a phone number is needed: phone lookups are the costliest and run, and bill, only when mobile is listed.'),
  profile: z
    .boolean()
    .optional()
    .describe('With contact_fields, also return each person\'s profile in the same call, looked up first so the contact lookups can use it. Default true; false skips it.'),
  verified_only: z
    .boolean()
    .optional()
    .describe('Email fields: return only an address the provider verified as deliverable. Default false returns the best address found, with fields.<field>.verified saying whether it was verified.'),
  max_credits: z
    .number()
    .int()
    .min(0)
    .max(10_000)
    .optional()
    .describe('Most credits the whole call may spend. Set it only to a budget the user gave; left out, the call has no cap. A provider is tried only while its listed price still fits, so 0 runs nothing paid.'),
});

const ENRICH_EXAMPLE = { contact_fields: ['work_email'], people: [{ name: 'Jane Doe', domain: 'example.com' }] };
const ENRICH_REFUSAL_EXAMPLE = { people: [{ name: 'Jane Doe', domain: 'example.com' }], companies: [{ domain: 'example.com' }] };

const enrichRecord = z.looseObject({
  input_index: z.number().describe('Index into the people or companies list.'),
  results: z
    .array(z.looseObject({ provider: z.string(), data: z.unknown().describe("The provider's own response, unchanged.") }))
    .describe('One entry per provider that found a requested field; empty when none did.'),
  fields: z
    .record(
      z.string(),
      z.looseObject({
        provider: z.string(),
        value: z.string().optional().describe('The email address chosen from that provider\'s response.'),
        verified: z.boolean().optional().describe('Email: the provider marked the address deliverable.'),
        domain_match: z.boolean().optional().describe('Work email: the address is on the company\'s domain.'),
        complete: z.boolean().optional().describe('Profile or firmographics: false when no provider gave the whole answer and this is the best partial one.'),
        linkedin_confirmed: z.boolean().optional().describe('Firmographics: the company LinkedIn page matches the company\'s domain or name.'),
      })
    )
    .optional()
    .describe('Per filled field (work_email, personal_email, mobile, profile, firmographics), what backs the answer.'),
});

const enrichResultSchema = z.looseObject({
  people: z.array(enrichRecord).optional(),
  companies: z.array(enrichRecord).optional(),
  credits_used: z.number().optional().describe('Credits charged: the listed price of each provider that found something.'),
  max_credits: z.number().optional().describe('The cap set for the call; absent when uncapped.'),
  stopped: z.string().optional().describe('Set when the run stopped early, e.g. team_quota when the team ran out of credits.'),
});

export function registerEnrichTools(
  server: Pick<McpRuntime<SessionData>, 'addTool'>,
  getClient: GetClient,
  assertCredential: AssertCredential,
  canList: (session?: SessionData) => boolean,
  // Which tool a pending job's next_tool is addressed to.
  alexandriaTools: AlexandriaTools = 'legacy'
): void {

  server.addTool({
    name: 'people_company_search',
    annotations: { title: 'Find people or companies', readOnlyHint: true, openWorldHint: true, destructiveHint: false },
    canList,
    description:
      "Find people or companies you don't know yet, by filters. Not for someone you can already name: for a named person (with their company or domain, a LinkedIn URL or an email) or a named company, call people_company_enrich instead; a request naming one person is refused and pointed there. " +
      'Set entity to "person" or "company" and give filters: people by title, seniority, function, employer and location; companies by industry, headcount, location, technology, keywords or founding year. ' +
      'Firecrawl asks its search providers one at a time, cheapest first, and only those that apply every filter given. When none does, it searches companies first and then people at those companies; a request no provider or chain covers is refused naming the filter to drop. ' +
      'With company_domains the search stops at the first provider that finds anyone; otherwise it fills limit across up to three providers. Rows carry name, title, company, location and LinkedIn URL, never emails or phones: use people_company_enrich for contact details. ' +
      'Each provider call is charged its listed price; max_credits caps the call. ' +
      'Example: ' + JSON.stringify(SEARCH_EXAMPLE) + '.',
    outputSchema: searchResultSchema,
    parameters: searchParameters,
    beforeValidate: (args: unknown = {}) => {
      if (isPlain(args)) {
        dropSessionFields(args);
        if (typeof args.entity === 'string') args.entity = ENTITY[args.entity.trim().toLowerCase()] ?? args.entity;
        repair(searchParameters, args);
        if (!Object.keys(args).length)
          throw new UserError('people_company_search finds people or companies by filters. For one named person or company, use people_company_enrich. Otherwise set entity and filters. Example: ' + JSON.stringify(SEARCH_EXAMPLE), { code: 'invalid_input', example: SEARCH_EXAMPLE });
        checkArguments('people_company_search', searchParameters, args, SEARCH_EXAMPLE);
      }
      return undefined;
    },
    execute: async (args: unknown, context: ToolExecuteContext<SessionData>): Promise<ContentResult> => {
      const { session, client: mcpClient } = context;
      const a = searchParameters.parse(args);
      if (a.options && !a.provider)
        throw new UserError('options needs provider: name the provider whose own options these are, or send filters instead. Example: ' + JSON.stringify(SEARCH_EXAMPLE), { code: 'invalid_input', example: SEARCH_EXAMPLE });
      if (a.options && (a.filters || a.query))
        throw new UserError("options replaces filters and query: send the provider's own options or the normalized filters, not both.", { code: 'invalid_input', example: SEARCH_EXAMPLE });
      assertCredential(session);
      const client = getClient(session) as any;
      const requestId = randomUUID();
      const response = await relayExchangeError(
        (attempt) => {
          // A resend gets the time left, keeping the 5 s margin above the API's deadline.
          const timeout = Math.floor(Math.min(SEARCH_TIMEOUT_MS, (attempt?.remainingMs ?? Infinity) - 5000));
          return client.http.post(
            '/v2/scrape',
            { alexandria: [{ provider: 'firecrawl', capability: 'search/auto', options: compact(a) }], origin: requestOrigin(mcpClient as any, session), timeout },
            { headers: { 'x-request-id': requestId }, timeoutMs: timeout + 5000 }
          );
        },
        // The API answers a repeat of this request id from its record, so a resend cannot run twice.
        { tool: 'people_company_search', requestId, providers: ['firecrawl'], resend: true, budgetMs: SEARCH_TIMEOUT_MS + 5000 }
      );
      const entry = response?.data?.data?.alexandria?.[0];
      if (!isPlain(entry)) throw new Error('Unexpected response shape.');
      if (isPlain(entry.error)) {
        const code = str(entry.error.code);
        throw new UserError(str(entry.error.message) ?? 'Search failed.', compact({ code, retryable: RETRYABLE.has(code ?? '') || undefined }));
      }
      return withStructured(JSON.stringify(entry.data), entry.data);
    },
  });

  server.addTool({
    name: 'people_company_enrich',
    // Read-only: looks records up and returns them; it costs credits but changes nothing.
    annotations: { title: 'Look up and enrich people or companies', readOnlyHint: true, openWorldHint: true, destructiveHint: false },
    canList,
    description:
      'Use this first when the user names a person (a name with a company or domain, a LinkedIn URL or an email) or a company and wants contact details, a profile or firmographics, such as the email of a founder at a given company. One call runs the provider waterfall. Use it, not people_company_search, whenever you have a name with a company or domain, a LinkedIn URL or an email. Give people (name with company or domain, LinkedIn URL, email or phone) or companies (domain, name or LinkedIn URL), up to ' + ENRICH_MAX_RECORDS + ' records per call. ' +
      'Each requested field runs a waterfall by default: Firecrawl tries the providers that can use your inputs one at a time, ordered by listed price, and stops as soon as the field is found. ' +
      'Without contact_fields a person gets a profile and a company gets firmographics; with contact_fields (work_email, personal_email, mobile) each person gets those values and, unless profile is false, the profile in the same call. Ask for mobile only when the task needs a phone number; it is the costliest field and nothing is spent on it otherwise. ' +
      'A work email is on the company domain when one is known and never on a known free-mail domain or a known role mailbox; fields says for each answer which provider gave it, whether the email was verified and whether its domain matched. Set verified_only to get only verified emails. ' +
      "Each result is the provider's raw response, tagged with the provider. A provider that finds the value is charged its listed price; misses are free. max_credits caps the call; without it the call is uncapped. " +
      'To call one specific provider, use ' + (alexandriaTools === 'dedicated' ? 'alexandria_library_read' : 'firecrawl_scrape with an alexandria body') + ' instead. ' +
      'Example: ' + JSON.stringify(ENRICH_EXAMPLE) + '.',
    outputSchema: enrichResultSchema,
    parameters: enrichParameters,
    beforeValidate: (args: unknown) => {
      if (isPlain(args)) {
        dropSessionFields(args);
        repair(enrichParameters, args);
        checkArguments('people_company_enrich', enrichParameters, args, ENRICH_REFUSAL_EXAMPLE);
      }
      return undefined;
    },
    execute: async (args: unknown, context: ToolExecuteContext<SessionData>): Promise<ContentResult> => {
      const { session, client: mcpClient } = context;
      const a = enrichParameters.parse(args);
      const count = (a.people?.length ?? 0) + (a.companies?.length ?? 0);
      if (!count) throw new UserError('Give people, companies or both. Example: ' + JSON.stringify(ENRICH_REFUSAL_EXAMPLE), { code: 'invalid_input', example: ENRICH_REFUSAL_EXAMPLE });
      if (count > ENRICH_MAX_RECORDS)
        throw new UserError('At most ' + ENRICH_MAX_RECORDS + ' people and companies per call, got ' + count + '. Split them across calls.', { code: 'invalid_input' });
      if (a.contact_fields && !a.people)
        throw new UserError('contact_fields applies to people only, and these are companies. Drop contact_fields to get their firmographics.', { code: 'invalid_input' });
      assertCredential(session);
      const client = getClient(session) as any;
      const requestId = randomUUID();
      const options = compact({ people: a.people, companies: a.companies, contact_fields: a.contact_fields, profile: a.contact_fields ? a.profile ?? true : undefined, verified_only: a.verified_only, max_credits: a.max_credits });
      const response = await relayExchangeError(
        (attempt) => {
          // A resend gets the time left, keeping the 5 s margin above the API's deadline.
          const timeout = Math.floor(Math.min(ENRICH_TIMEOUT_MS, (attempt?.remainingMs ?? Infinity) - 5000));
          return client.http.post(
            '/v2/scrape',
            { alexandria: [{ provider: 'firecrawl', capability: 'enrich/auto', options }], origin: requestOrigin(mcpClient as any, session), timeout },
            { headers: { 'x-request-id': requestId }, timeoutMs: timeout + 5000 }
          );
        },
        // The API answers a repeat of this request id from its record, so a resend cannot run twice.
        { tool: 'people_company_enrich', requestId, providers: ['firecrawl'], resend: true, budgetMs: ENRICH_TIMEOUT_MS + 5000 }
      );
      const entry = response?.data?.data?.alexandria?.[0];
      if (!isPlain(entry)) throw new Error('Unexpected response shape.');
      if (isPlain(entry.error)) {
        const code = str(entry.error.code);
        throw new UserError(str(entry.error.message) ?? 'Enrichment failed.', compact({ code, retryable: RETRYABLE.has(code ?? '') || undefined }));
      }
      return withStructured(JSON.stringify(entry.data), entry.data);
    },
  });
}
