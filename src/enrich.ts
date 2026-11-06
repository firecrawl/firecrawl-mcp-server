/**
 * People and company enrichment over Alexandria's B2B data providers
 * (Apollo, FullEnrich, People Data Labs, Data Legion). Each tool takes one
 * shared input shape, translates it per provider, and reports what every
 * provider ran, matched, charged and could not apply.
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { type ContentResult, type McpRuntime, UserError } from './mcp/runtime.js';
import { requestOrigin } from './origin';
import { relayExchangeError } from './tool-helpers.js';
import { withStructured } from './tool-output';

interface SessionData {
  firecrawlApiKey?: string;
  clientUserAgent?: string;
  [key: string]: unknown;
}

type GetClient = (session?: SessionData) => unknown;
type AssertCredential = (session?: SessionData) => void;

type Provider = 'apollo' | 'fullenrich' | 'people_data_labs' | 'datalegion';

const SLUG: Record<Provider, string> = {
  apollo: 'apollo',
  fullenrich: 'fullenrich',
  people_data_labs: 'people-data-labs',
  datalegion: 'datalegion',
};

// ---------- Input schemas ----------

const match = z.strictObject({
  value: z.string(),
  exclude: z.boolean().optional(),
  exact_match: z.boolean().optional(),
});
const range = z.strictObject({
  min: z.number().optional(),
  max: z.number().optional(),
  exclude: z.boolean().optional(),
});
const bounds = z.strictObject({ min: z.number().optional(), max: z.number().optional() });

const personRef = z.strictObject({
  name: z.string().optional().describe('Full name.'),
  company: z.string().optional().describe('Current employer name.'),
  company_domain: z.string().optional().describe('Employer domain, e.g. linear.app. Best match rate with name.'),
  linkedin_url: z.string().optional().describe('LinkedIn profile URL. Enough on its own.'),
  email: z.string().optional().describe('A known email address.'),
  apollo_id: z.string().optional().describe('apollo_id from a firecrawl_enrich_people_search result. Resolves on apollo only.'),
});

const identifiesPerson = (ref: { linkedin_url?: string; email?: string; apollo_id?: string; name?: string; company?: string; company_domain?: string }) =>
  Boolean(ref.linkedin_url || ref.email || ref.apollo_id || (ref.name && (ref.company || ref.company_domain)));
const NEEDS_IDENTIFIER = { message: 'Each person needs a linkedin_url, an email, an apollo_id, or a name plus company or company_domain.' };

const companyRef = z.strictObject({
  domain: z.string().optional().describe('Best identifier, e.g. stripe.com.'),
  linkedin_url: z.string().optional().describe('LinkedIn company URL.'),
  name: z.string().optional().describe('Name alone matches only on people_data_labs and datalegion.'),
});

const SENIORITY = ['founder', 'c_suite', 'vp', 'head', 'director', 'manager', 'senior'] as const;

const enabled = z.boolean().describe('true runs this provider.');

function provider<S extends z.ZodRawShape>(shape: S, about: string) {
  return z.strictObject({ enabled, ...shape }).optional().describe(about);
}

const OPT_IN =
  'Providers are opt-in: pass {"enabled": true} on each provider to run, e.g. "apollo": {"enabled": true}. Enable several to compare and merge their results. ';
const REPORT =
  'The response lists every provider with its status, records returned, credits charged, and any filters it could not apply.';

const peopleSearchParameters = z.strictObject({
  titles: z.array(z.string().min(1)).min(1).max(10).describe('Current job titles, e.g. ["Head of Data", "Director of Data"].'),
  location: z.string().optional().describe('City, region or country, e.g. "Seattle", "California", "Germany".'),
  company: z.string().optional().describe('Current employer name.'),
  company_domain: z.string().optional().describe('Current employer domain.'),
  seniority: z.array(z.enum(SENIORITY)).optional().describe('Applied by fullenrich and people_data_labs; apollo runs without it and says so.'),
  limit: z.number().int().min(1).max(25).default(5).describe('Records per provider.'),
  apollo: provider(
    { q_keywords: z.string().optional().describe('Free text matched across the person and their company.') },
    'Apollo. Free. Loose title matching; surnames are masked until enriched.'
  ),
  fullenrich: provider(
    {
      past_company_names: z.array(match).optional().describe('Previous employers, e.g. [{"value":"Stripe"}].'),
      past_position_titles: z.array(match).optional(),
      person_skills: z.array(match).optional(),
      person_universities: z.array(match).optional(),
      current_company_industries: z.array(match).optional(),
      current_company_headcounts: z.array(range).optional().describe('e.g. [{"min":50,"max":500}].'),
      current_position_years_in: z.array(range).optional(),
      current_company_days_since_last_job_change: z.array(range).optional().describe('Recent movers, e.g. [{"max":90}].'),
    },
    'FullEnrich. 5 credits per record. Extra filters apply to FullEnrich only.'
  ),
  people_data_labs: provider(
    { sql: z.string().optional().describe('SELECT * FROM person WHERE ... Replaces the shared filters for PDL. Values are lowercase; job_title matches exactly.') },
    'People Data Labs. 50 credits per record. Exact title match.'
  ),
});

const peopleParameters = z.strictObject({
  people: z.array(personRef.refine(identifiesPerson, NEEDS_IDENTIFIER)).min(1).max(50).describe('Each needs a linkedin_url, an email, an apollo_id, or a name plus company or company_domain.'),
  fullenrich: provider({}, 'FullEnrich. 10 credits per match.'),
  apollo: provider({}, 'Apollo. 30 credits per match.'),
  people_data_labs: provider(
    { min_likelihood: z.number().int().min(1).max(10).optional().describe('Minimum match confidence, 1 to 10 (default 6).') },
    'People Data Labs. 50 credits per match; richest work history.'
  ),
  datalegion: provider(
    { min_confidence: z.enum(['high', 'moderate', 'low']).optional() },
    'Data Legion. 20 credits per match.'
  ),
});

const CONTACT_FIELDS = ['work_email', 'personal_email', 'mobile'] as const;
type ContactField = (typeof CONTACT_FIELDS)[number];

const contactParameters = z.strictObject({
  people: z
    .array(
      personRef
        .omit({ email: true })
        .refine((ref) => Boolean(ref.linkedin_url || (ref.name && (ref.company || ref.company_domain))), {
          message: 'Each person needs a linkedin_url, or a name plus company or company_domain.',
        })
    )
    .min(1)
    .max(50)
    .describe('Each needs a linkedin_url, or a name plus company or company_domain.'),
  fields: z.array(z.enum(CONTACT_FIELDS)).min(1).describe('Values to find.'),
  fullenrich: provider({}, 'FullEnrich. Work email 30, personal email 100, mobile 300 credits per value found.'),
  datalegion: provider({}, 'Data Legion. 100 credits per matched person, every field in one call.'),
  apollo: provider({}, 'Apollo. Work email only, 30 credits per match.'),
});

const companySearchParameters = z.strictObject({
  industries: z.array(z.string().min(1)).optional().describe('Applied by fullenrich and people_data_labs.'),
  employees: bounds.optional().describe('Headcount range, e.g. {"min":50,"max":500}.'),
  location: z.string().optional().describe('Headquarters city, region or country.'),
  technologies: z.array(z.string().min(1)).optional().describe('e.g. ["Snowflake"]. Applied by apollo and fullenrich.'),
  founded: bounds.optional().describe('Founding year range. Applied by fullenrich and people_data_labs.'),
  keywords: z.string().optional().describe('What the company does.'),
  limit: z.number().int().min(1).max(25).default(10).describe('Records per provider.'),
  apollo: provider(
    { q_organization_name: z.string().optional().describe('Replaces keywords for Apollo.') },
    'Apollo. 30 credits per page.'
  ),
  fullenrich: provider(
    {
      specialties: z.array(match).optional(),
      types: z.array(match).optional().describe('e.g. [{"value":"Privately Held"}].'),
    },
    'FullEnrich. 5 credits per record.'
  ),
  people_data_labs: provider(
    { sql: z.string().optional().describe('SELECT * FROM company WHERE ... Replaces the shared filters for PDL.') },
    'People Data Labs. 50 credits per record.'
  ),
});

const companyParameters = z.strictObject({
  companies: z.array(companyRef).min(1).max(50).describe('Each needs a domain, linkedin_url or name.'),
  fullenrich: provider({}, 'FullEnrich. 10 credits per match; includes technologies.'),
  apollo: provider({}, 'Apollo. 30 credits per match.'),
  people_data_labs: provider(
    { min_likelihood: z.number().int().min(1).max(10).optional().describe('Minimum match confidence, 1 to 10 (default 6).') },
    'People Data Labs. 50 credits per match; funding history.'
  ),
  datalegion: provider({}, 'Data Legion. 20 credits per match.'),
});

type PersonRef = z.infer<typeof personRef>;
type CompanyRef = z.infer<typeof companyRef>;

const enrichOutputSchema = z.looseObject({
  results: z.array(z.looseObject({})).optional().describe('Merged records; each lists its sources.'),
  providers: z
    .array(
      z.looseObject({
        name: z.string().optional(),
        status: z.string().optional(),
        returned: z.number().optional(),
        credits: z.number().optional(),
      })
    )
    .optional()
    .describe('What each provider did.'),
  credits_total: z.number().optional(),
});

// ---------- Normalized records ----------

interface Person {
  name?: string;
  title?: string;
  company?: string;
  company_domain?: string;
  location?: string;
  linkedin_url?: string;
  since?: string;
  previous?: string[];
  work_email?: string;
  email_status?: string;
  personal_email?: string;
  mobile?: string;
  apollo_id?: string;
}

interface Company {
  name?: string;
  domain?: string;
  linkedin_url?: string;
  industry?: string;
  employees?: number;
  employees_range?: string;
  hq?: string;
  founded?: number;
  funding_total_usd?: number;
  technologies?: string[];
  description?: string;
}

interface ProviderReport {
  name: Provider;
  status: 'ok' | 'empty' | 'error' | 'skipped' | 'not_enabled';
  returned: number;
  credits: number;
  attempted?: number;
  next_tool?: unknown;
  applied?: string[];
  not_applied?: string[];
  note?: string;
}

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;
const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
const joinPlace = (...parts: unknown[]) =>
  [...new Set(parts.map(str).filter(Boolean))].join(', ') || undefined;
const list = (values: (string | undefined)[] | undefined) => {
  const kept = (values ?? []).filter((v): v is string => Boolean(v));
  return kept.length ? kept.slice(0, 3) : undefined;
};

function linkedIn(value: unknown): string | undefined {
  const url = str(value)
    ?.toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^[a-z]{2,3}\./, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');
  return url?.startsWith('linkedin.com/') ? 'https://www.' + url : undefined;
}

function domainOf(value: unknown): string | undefined {
  return str(value)
    ?.toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/?#].*$/, '') || undefined;
}

function compact<T extends object>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0))
  ) as T;
}

function emailFrom(...candidates: unknown[]): string | undefined {
  for (const c of candidates) {
    const first = Array.isArray(c) ? c[0] : c;
    const value = str(first) ?? str((first as any)?.address) ?? str((first as any)?.email);
    if (value?.includes('@') && !value.startsWith('email_not_unlocked')) return value;
  }
  return undefined;
}

function fullEnrichPerson(r: any): Person {
  const current = r?.employment?.current;
  const place = r?.location ?? {};
  return compact({
    name: str(r?.full_name),
    title: str(current?.title),
    company: str(current?.company?.name),
    company_domain: domainOf(current?.company?.domain),
    location: joinPlace(place.city, place.region, place.country),
    linkedin_url: linkedIn(r?.social_profiles?.professional_network?.url),
    since: str(current?.start_at)?.slice(0, 7),
    previous: list(
      (Array.isArray(r?.employment?.all) ? r.employment.all : [])
        .filter((e: any) => !e?.is_current)
        .map((e: any) => (str(e?.title) && str(e?.company?.name) ? e.title + ' at ' + e.company.name : undefined))
    ),
  });
}

function apolloPreview(r: any): Person {
  return compact({
    name: joinPlace(r?.first_name, r?.last_name_obfuscated ?? r?.last_name)?.replace(', ', ' '),
    title: str(r?.title),
    company: str(r?.organization?.name),
    apollo_id: str(r?.id),
  });
}

function apolloPerson(r: any): Person {
  const history = Array.isArray(r?.employment_history) ? r.employment_history : [];
  return compact({
    name: str(r?.name) ?? joinPlace(r?.first_name, r?.last_name)?.replace(', ', ' '),
    title: str(r?.title),
    company: str(r?.organization?.name) ?? str(history.find((e: any) => e?.current)?.organization_name),
    company_domain: domainOf(r?.organization?.primary_domain),
    location: joinPlace(r?.city, r?.state, r?.country),
    linkedin_url: linkedIn(r?.linkedin_url),
    previous: list(
      history
        .filter((e: any) => !e?.current)
        .map((e: any) => (str(e?.title) && str(e?.organization_name) ? e.title + ' at ' + e.organization_name : undefined))
    ),
    work_email: emailFrom(r?.email),
    email_status: emailFrom(r?.email) ? str(r?.email_status) : undefined,
    apollo_id: str(r?.id),
  });
}

function pdlPerson(r: any): Person {
  const experience = Array.isArray(r?.experience) ? r.experience : [];
  return compact({
    name: str(r?.full_name),
    title: str(r?.job_title),
    company: str(r?.job_company_name),
    company_domain: domainOf(r?.job_company_website),
    location: str(r?.location_name),
    linkedin_url: linkedIn(str(r?.linkedin_url) ? 'https://' + r.linkedin_url : undefined),
    since: str(r?.job_start_date)?.slice(0, 7),
    previous: list(
      experience
        .filter((e: any) => str(e?.end_date))
        .map((e: any) => (str(e?.title?.name) && str(e?.company?.name) ? e.title.name + ' at ' + e.company.name : undefined))
    ),
    work_email: emailFrom(r?.work_email),
    personal_email: emailFrom(r?.recommended_personal_email, r?.personal_emails),
    mobile: str(r?.mobile_phone),
  });
}

function dataLegionPerson(p: any): Person {
  const experience = Array.isArray(p?.experience) ? p.experience : [];
  const phones = Array.isArray(p?.phones) ? p.phones : [];
  const emails = Array.isArray(p?.emails) ? p.emails : [];
  return compact({
    name: str(p?.full_name),
    title: str(p?.job_title),
    company: str(p?.company_name),
    company_domain: domainOf(p?.company_domain),
    location: joinPlace(p?.city, p?.state, p?.country),
    linkedin_url: linkedIn(p?.linkedin_url),
    since: str(experience.find((e: any) => e?.current)?.start_date)?.slice(0, 7),
    previous: list(
      experience
        .filter((e: any) => !e?.current)
        .map((e: any) =>
          str(e?.title?.cleaned) && str(e?.organization?.name?.cleaned)
            ? e.title.cleaned + ' at ' + e.organization.name.cleaned
            : undefined
        )
    ),
    work_email: emailFrom(p?.work_email),
    personal_email: emailFrom(p?.personal_email, p?.personal_emails, emails.filter((e: any) => e?.type === 'personal')),
    mobile: str(p?.mobile_phone) ?? str(phones.find((ph: any) => ph?.type === 'mobile')?.number),
  });
}

function fullEnrichCompany(c: any): Company {
  const hq = c?.locations?.headquarters ?? {};
  return compact({
    name: str(c?.name),
    domain: domainOf(c?.domain ?? c?.website),
    linkedin_url: linkedIn(c?.social_profiles?.professional_network?.url),
    industry: str(c?.industry?.main_industry),
    employees: num(c?.headcount),
    employees_range: str(c?.headcount_range),
    hq: joinPlace(hq.city, hq.region, hq.country),
    founded: num(c?.year_founded),
    technologies: (Array.isArray(c?.technologies) ? c.technologies : [])
      .map((t: any) => str(t?.name ?? t))
      .filter(Boolean)
      .slice(0, 25),
    description: str(c?.description)?.slice(0, 300),
  });
}

function apolloCompany(o: any): Company {
  return compact({
    name: str(o?.name),
    domain: domainOf(o?.primary_domain ?? o?.website_url),
    linkedin_url: linkedIn(o?.linkedin_url),
    industry: str(o?.industry),
    employees: num(o?.estimated_num_employees),
    hq: joinPlace(o?.city, o?.state, o?.country),
    founded: num(o?.founded_year),
    funding_total_usd: num(o?.total_funding),
    technologies: (Array.isArray(o?.technology_names) ? o.technology_names : []).map(str).filter(Boolean).slice(0, 25),
    description: str(o?.short_description)?.slice(0, 300),
  });
}

function pdlCompany(c: any): Company {
  return compact({
    name: str(c?.display_name) ?? str(c?.name),
    domain: domainOf(c?.website),
    linkedin_url: linkedIn(str(c?.linkedin_url) ? 'https://' + c.linkedin_url : undefined),
    industry: str(c?.industry),
    employees: num(c?.employee_count),
    employees_range: str(c?.size),
    hq: str(c?.location?.name),
    founded: num(c?.founded),
    funding_total_usd: num(c?.total_funding_raised),
    description: (str(c?.headline) ?? str(c?.summary))?.slice(0, 300),
  });
}

function dataLegionCompany(c: any): Company {
  const locations = Array.isArray(c?.locations) ? c.locations : [];
  const hq = locations.find((l: any) => l?.primary) ?? locations[0] ?? {};
  return compact({
    name: str(c?.name?.cleaned) ?? str(c?.name),
    domain: domainOf(c?.domain),
    linkedin_url: linkedIn(c?.linkedin_url),
    industry: str(c?.industry),
    employees_range: str(c?.size),
    hq: joinPlace(hq.city, hq.state, hq.country),
    founded: num(c?.founded),
    description: str(c?.description?.cleaned)?.slice(0, 300),
  });
}

// ---------- Alexandria execution ----------

type Call = { capability: string; options: Record<string, unknown> };
type Entry = { data?: any; error?: { code?: string; message?: string; nextTool?: unknown }; creditsCost?: number };

interface Context {
  client: any;
  origin: string;
}

/** Runs one provider's calls, ten per request, and returns one entry per call in order. */
async function runCalls(ctx: Context, p: Provider, calls: Call[]): Promise<Entry[]> {
  const chunks: Call[][] = [];
  for (let i = 0; i < calls.length; i += 10) chunks.push(calls.slice(i, i + 10));
  const results = await Promise.all(
    chunks.map(async (chunk): Promise<Entry[]> => {
      const requestId = randomUUID();
      try {
        const response = await relayExchangeError(
          () =>
            ctx.client.http.post(
              '/v2/scrape',
              { alexandria: chunk.map((c) => ({ provider: SLUG[p], ...c })), origin: ctx.origin },
              { headers: { 'x-request-id': requestId } }
            ),
          { tool: 'firecrawl_scrape', requestId, providers: [SLUG[p]] }
        );
        const entries = response?.data?.data?.alexandria;
        if (!Array.isArray(entries)) throw new Error('Unexpected response shape.');
        return chunk.map((_, i) => entries[i] ?? { error: { message: 'No result returned.' } });
      } catch (error) {
        if ((error as any)?.response?.status === 401) throw error;
        const message = error instanceof Error ? error.message : String(error);
        const extras = error instanceof UserError ? error.extras : undefined;
        const code = typeof extras?.code === 'string' ? extras.code : 'request_failed';
        return chunk.map(() => ({ error: compact({ code, message, nextTool: extras?.nextTool }) }));
      }
    })
  );
  return results.flat();
}

const isMiss = (entry: Entry) => entry.error?.code === 'not_found';

function errorNote(entries: Entry[]): string | undefined {
  const failed = entries.find((e) => e.error && !isMiss(e));
  return failed ? [failed.error?.code, failed.error?.message].filter(Boolean).join(': ') : undefined;
}

const nextToolOf = (entries: Entry[]) => entries.find((e) => e.error?.nextTool)?.error?.nextTool;

const credits = (entries: Entry[]) =>
  entries.reduce((sum, e) => sum + (typeof e.creditsCost === 'number' ? e.creditsCost : 0), 0);

function enabledProviders(args: Record<string, any>, order: Provider[]): Provider[] {
  const on = order.filter((p) => args[p]?.enabled === true);
  if (on.length) return on;
  const example = Object.fromEntries(order.slice(0, 2).map((p) => [p, { enabled: true }]));
  throw new UserError(
    'No provider is enabled. Pass {"enabled": true} on each provider to run: ' + order.join(', ') + '. Example: ' + JSON.stringify(example) + '.',
    { code: 'no_provider_enabled', available: order, example }
  );
}

function notEnabled(args: Record<string, any>, order: Provider[]): ProviderReport[] {
  return order
    .filter((p) => args[p]?.enabled !== true)
    .map((name) => ({ name, status: 'not_enabled' as const, returned: 0, credits: 0 }));
}

function respond(results: unknown[], providers: ProviderReport[]): ContentResult {
  const data = {
    results,
    providers: providers.map((r) => compact(r)),
    credits_total: providers.reduce((sum, r) => sum + r.credits, 0),
  };
  return withStructured(JSON.stringify(data), data);
}

type Keyed = Record<string, any> & { sources: Provider[]; confidence?: string; conflicts?: Record<string, unknown[]> };

function differs(a: unknown, b: unknown): boolean {
  return typeof a === 'string' && typeof b === 'string'
    ? a.toLowerCase() !== b.toLowerCase()
    : JSON.stringify(a) !== JSON.stringify(b);
}

/** Merges records that share a key, keeps the first value of each field, and records disagreements on the named fields. */
function mergeRecords(
  batches: { provider: Provider; records: object[] }[],
  keyOf: (record: any) => string | undefined,
  checked: string[]
): Keyed[] {
  const out: Keyed[] = [];
  const byKey = new Map<string, Keyed>();
  for (const { provider: p, records } of batches) {
    for (const record of records) {
      const key = keyOf(record);
      const existing = key ? byKey.get(key) : undefined;
      if (!existing) {
        const created: Keyed = { ...record, sources: [p] };
        out.push(created);
        if (key) byKey.set(key, created);
        continue;
      }
      fold(existing, record, p, checked);
    }
  }
  for (const record of out) settle(record);
  return out;
}

function fold(target: Keyed, record: Record<string, any>, p: Provider, checked: string[]) {
  if (!target.sources.includes(p)) target.sources.push(p);
  for (const [field, value] of Object.entries(record)) {
    if (value === undefined) continue;
    if (target[field] === undefined) {
      target[field] = value;
    } else if (checked.includes(field) && differs(target[field], value)) {
      target.conflicts ??= {};
      const seen = (target.conflicts[field] ??= [target[field]]);
      if (!seen.some((v) => !differs(v, value))) seen.push(value);
    }
  }
}

function settle(record: Keyed) {
  record.confidence = record.conflicts ? 'conflicting' : record.sources.length > 1 ? 'agreed' : 'single_source';
}

const providerExtras = (options: object | undefined): Record<string, unknown> =>
  Object.fromEntries(Object.entries(options ?? {}).filter(([key, value]) => key !== 'enabled' && value !== undefined));
const firstSegment = (location: string) => location.split(',')[0].trim();
const sqlText = (value: string) => "'" + value.toLowerCase().replace(/'/g, "''") + "'";

// ---------- firecrawl_enrich_people_search ----------

const FE_SENIORITY: Record<(typeof SENIORITY)[number], string> = {
  founder: 'Founder', c_suite: 'C-Level', vp: 'VP', head: 'Head', director: 'Director', manager: 'Manager', senior: 'Senior',
};
const PDL_SENIORITY: Partial<Record<(typeof SENIORITY)[number], string>> = {
  founder: 'owner', c_suite: 'cxo', vp: 'vp', director: 'director', manager: 'manager', senior: 'senior',
};

type Found<T> = { report: ProviderReport; records: T[] };

async function pdlSearch(
  ctx: Context,
  capability: string,
  sql: string,
  limit: number,
  map: (r: any) => object
): Promise<{ entries: Entry[]; records: object[] }> {
  const entries: Entry[] = [];
  const records: object[] = [];
  let scroll: string | undefined;
  while (records.length < limit) {
    const size = Math.min(2, limit - records.length);
    const [entry] = await runCalls(ctx, 'people_data_labs', [
      { capability, options: { sql, size, titlecase: true, ...(scroll ? { scroll_token: scroll } : {}) } },
    ]);
    entries.push(entry);
    const page = Array.isArray(entry.data?.data) ? entry.data.data : [];
    records.push(...page.map(map));
    scroll = str(entry.data?.scroll_token);
    if (entry.error || page.length < size || !scroll) break;
  }
  return { entries, records };
}

async function peopleSearchProvider(
  ctx: Context,
  p: Provider,
  a: z.infer<typeof peopleSearchParameters>
): Promise<Found<Person>> {
  const applied = ['titles'];
  const notApplied: string[] = [];
  let entries: Entry[] = [];
  let records: Person[] = [];
  let note: string | undefined;

  if (p === 'apollo') {
    const keywords = [a.apollo?.q_keywords, a.company_domain ? undefined : a.company].filter(Boolean).join(' ');
    if (a.location) applied.push('location');
    if (a.company_domain) applied.push('company_domain');
    else if (a.company) applied.push('company (as keywords)');
    if (a.company_domain && a.company) notApplied.push('company');
    if (a.seniority?.length) {
      notApplied.push('seniority');
      note = 'Apollo has no seniority filter; results are not filtered on it.';
    }
    entries = await runCalls(ctx, p, [
      {
        capability: 'people/search',
        options: compact({
          person_titles: a.titles,
          person_locations: a.location ? [a.location] : undefined,
          q_organization_domains_list: a.company_domain ? [a.company_domain] : undefined,
          q_keywords: keywords || undefined,
          per_page: a.limit,
        }),
      },
    ]);
    records = (entries[0].data?.people ?? []).map(apolloPreview);
  }

  if (p === 'fullenrich') {
    const extra = providerExtras(a.fullenrich);
    const filters = compact({
      current_position_titles: a.titles.map((value) => ({ value })),
      person_locations: a.location ? [{ value: firstSegment(a.location) }] : undefined,
      current_company_domains: a.company_domain ? [{ value: a.company_domain }] : undefined,
      current_company_names: !a.company_domain && a.company ? [{ value: a.company }] : undefined,
      current_position_seniority_level: a.seniority?.map((s) => ({ value: FE_SENIORITY[s] })),
      ...extra,
    });
    for (const key of ['location', 'company_domain', 'seniority'] as const) if (a[key]?.length) applied.push(key);
    if (a.company) (a.company_domain ? notApplied : applied).push('company');
    applied.push(...Object.keys(extra));
    const calls: Call[] = [];
    for (let offset = 0; offset < a.limit; offset += 6) {
      calls.push({ capability: 'people/search', options: { ...filters, limit: Math.min(6, a.limit - offset), ...(offset ? { offset } : {}) } });
    }
    entries = await runCalls(ctx, p, calls);
    records = entries.flatMap((e) => (e.data?.people ?? []).map(fullEnrichPerson));
  }

  if (p === 'people_data_labs') {
    let sql = str(a.people_data_labs?.sql);
    if (sql) {
      applied.splice(0, applied.length, 'sql');
    } else {
      const where = ['job_title IN (' + a.titles.map(sqlText).join(', ') + ')'];
      if (a.location) {
        const l = sqlText(firstSegment(a.location));
        where.push('(location_locality = ' + l + ' OR location_region = ' + l + ' OR location_country = ' + l + ')');
        applied.push('location');
      }
      if (a.company_domain) {
        where.push('job_company_website = ' + sqlText(a.company_domain));
        applied.push('company_domain');
      } else if (a.company) {
        where.push('job_company_name = ' + sqlText(a.company));
        applied.push('company');
      }
      if (a.company_domain && a.company) notApplied.push('company');
      const levels = (a.seniority ?? []).flatMap((s) => PDL_SENIORITY[s] ?? []);
      if (levels.length) {
        where.push('job_title_levels IN (' + levels.map(sqlText).join(', ') + ')');
        applied.push('seniority');
      }
      if (a.seniority?.includes('head')) {
        notApplied.push('seniority: head');
        note = 'People Data Labs has no "head" level; it is left out of the seniority filter.';
      }
      sql = 'SELECT * FROM person WHERE ' + where.join(' AND ');
    }
    const found = await pdlSearch(ctx, 'person/search', sql, a.limit, pdlPerson);
    entries = found.entries;
    records = found.records as Person[];
  }

  const failure = errorNote(entries);
  return {
    records,
    report: {
      name: p,
      status: records.length ? 'ok' : failure ? 'error' : 'empty',
      returned: records.length,
      credits: credits(entries),
      applied,
      not_applied: notApplied,
      note: failure ?? note,
      next_tool: nextToolOf(entries),
    },
  };
}

// ---------- firecrawl_enrich_company_search ----------

async function companySearchProvider(
  ctx: Context,
  p: Provider,
  a: z.infer<typeof companySearchParameters>
): Promise<Found<Company>> {
  const applied: string[] = [];
  const notApplied: string[] = [];
  let entries: Entry[] = [];
  let records: Company[] = [];
  let note: string | undefined;

  if (p === 'apollo') {
    const keywords = str(a.apollo?.q_organization_name) ?? str(a.keywords);
    if (a.employees) applied.push('employees');
    if (a.location) applied.push('location');
    if (a.technologies?.length) applied.push('technologies');
    if (keywords) applied.push(a.apollo?.q_organization_name ? 'q_organization_name' : 'keywords');
    if (a.industries?.length) notApplied.push('industries');
    if (a.founded) notApplied.push('founded');
    if (notApplied.length) note = 'Apollo has no ' + notApplied.join(' or ') + ' filter; results are not filtered on it.';
    entries = await runCalls(ctx, p, [
      {
        capability: 'companies/search',
        options: compact({
          q_organization_name: keywords,
          organization_num_employees_ranges: a.employees ? [(a.employees.min ?? 1) + ',' + (a.employees.max ?? 1000000)] : undefined,
          organization_locations: a.location ? [a.location] : undefined,
          currently_using_any_of_technology_uids: a.technologies?.map((t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '_')),
          per_page: a.limit,
        }),
      },
    ]);
    records = (entries[0].data?.organizations ?? []).map(apolloCompany);
  }

  if (p === 'fullenrich') {
    const extra = providerExtras(a.fullenrich);
    const filters = compact({
      industries: a.industries?.map((value) => ({ value })),
      headcounts: a.employees ? [a.employees] : undefined,
      headquarters_locations: a.location ? [{ value: firstSegment(a.location) }] : undefined,
      technologies: a.technologies?.map((value) => ({ value })),
      founded_years: a.founded ? [a.founded] : undefined,
      keywords: a.keywords ? [{ value: a.keywords }] : undefined,
      ...extra,
    });
    for (const key of ['industries', 'employees', 'location', 'technologies', 'founded', 'keywords'] as const) {
      const value = a[key];
      if (Array.isArray(value) ? value.length : value) applied.push(key);
    }
    applied.push(...Object.keys(extra));
    const calls: Call[] = [];
    for (let offset = 0; offset < a.limit; offset += 6) {
      calls.push({ capability: 'companies/search', options: { ...filters, limit: Math.min(6, a.limit - offset), ...(offset ? { offset } : {}) } });
    }
    entries = await runCalls(ctx, p, calls);
    records = entries.flatMap((e) => (e.data?.companies ?? []).map(fullEnrichCompany));
  }

  if (p === 'people_data_labs') {
    let sql = str(a.people_data_labs?.sql);
    if (sql) {
      applied.push('sql');
    } else {
      const where: string[] = [];
      if (a.industries?.length) {
        where.push('industry IN (' + a.industries.map(sqlText).join(', ') + ')');
        applied.push('industries');
      }
      if (a.employees?.min !== undefined) where.push('employee_count >= ' + Math.ceil(a.employees.min));
      if (a.employees?.max !== undefined) where.push('employee_count <= ' + Math.floor(a.employees.max));
      if (a.employees) applied.push('employees');
      if (a.location) {
        const l = sqlText(firstSegment(a.location));
        where.push('(location.locality = ' + l + ' OR location.region = ' + l + ' OR location.country = ' + l + ')');
        applied.push('location');
      }
      if (a.founded?.min !== undefined) where.push('founded >= ' + Math.ceil(a.founded.min));
      if (a.founded?.max !== undefined) where.push('founded <= ' + Math.floor(a.founded.max));
      if (a.founded) applied.push('founded');
      if (a.keywords) {
        where.push("summary LIKE '%" + a.keywords.toLowerCase().replace(/'/g, "''").replace(/%/g, '') + "%'");
        applied.push('keywords');
      }
      if (a.technologies?.length) {
        notApplied.push('technologies');
        note = 'People Data Labs has no technology filter; results are not filtered on it.';
      }
      sql = where.length ? 'SELECT * FROM company WHERE ' + where.join(' AND ') : undefined;
    }
    if (!sql) {
      return {
        records: [],
        report: { name: p, status: 'skipped', returned: 0, credits: 0, not_applied: notApplied, note: 'People Data Labs needs at least one filter it can apply.' },
      };
    }
    const found = await pdlSearch(ctx, 'company/search', sql, a.limit, pdlCompany);
    entries = found.entries;
    records = found.records as Company[];
  }

  const failure = errorNote(entries);
  return {
    records,
    report: {
      name: p,
      status: records.length ? 'ok' : failure ? 'error' : 'empty',
      returned: records.length,
      credits: credits(entries),
      applied,
      not_applied: notApplied,
      note: failure ?? note,
      next_tool: nextToolOf(entries),
    },
  };
}

// ---------- Waterfalls: firecrawl_enrich_people, _contact_info, _company ----------

type Hits<T> = Map<number, T>;
type Item<R> = { index: number; ref: R; current?: Keyed };

interface Attempt<T> {
  hits: Hits<T>;
  entries: Entry[];
  attempted: number;
}

const splitName = (name?: string) => {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') || undefined };
};

/** Maps one entry per item back to its index. */
function byEntry<T>(items: Item<unknown>[], entries: Entry[], read: (entry: Entry) => T | undefined): Hits<T> {
  const hits: Hits<T> = new Map();
  items.forEach((item, i) => {
    const record = entries[i] && !entries[i].error ? read(entries[i]) : undefined;
    if (record && Object.keys(record).length) hits.set(item.index, record);
  });
  return hits;
}

async function enrichPeopleWith(
  ctx: Context,
  p: Provider,
  items: Item<PersonRef>[],
  options: Record<string, any>
): Promise<Attempt<Person>> {
  if (p === 'fullenrich') {
    const usable: Item<PersonRef>[] = [];
    const calls: Call[] = [];
    for (const item of items) {
      const { linkedin_url, name, company_domain, company } = item.ref;
      let call: Call | undefined;
      if (linkedin_url) call = { capability: 'people/lookup', options: { person_professional_network_url: linkedin_url } };
      else if (name && company_domain) call = { capability: 'people/lookup', options: { person_name: name, company_domain } };
      else if (name && company) call = { capability: 'people/search', options: { person_names: [{ value: name }], current_company_names: [{ value: company }], limit: 1 } };
      if (call) {
        usable.push(item);
        calls.push(call);
      }
    }
    const entries = await runCalls(ctx, p, calls);
    const hits = byEntry(usable, entries, (e) => {
      const record = e.data?.people?.[0];
      return record ? fullEnrichPerson(record) : undefined;
    });
    return { hits, entries, attempted: usable.length };
  }

  if (p === 'apollo') {
    const usable = items.filter(({ ref }) => ref.apollo_id || ref.linkedin_url || ref.email || ref.name);
    const chunks: Item<PersonRef>[][] = [];
    for (let i = 0; i < usable.length; i += 10) chunks.push(usable.slice(i, i + 10));
    const entries = await runCalls(
      ctx,
      p,
      chunks.map((chunk) => ({
        capability: 'people/bulk-match',
        options: {
          details: chunk.map(({ ref }) =>
            compact({ id: ref.apollo_id, name: ref.name, domain: ref.company_domain, organization_name: ref.company, email: ref.email, linkedin_url: ref.linkedin_url })
          ),
        },
      }))
    );
    const hits: Hits<Person> = new Map();
    chunks.forEach((chunk, c) => {
      const matches = Array.isArray(entries[c]?.data?.matches) ? entries[c].data.matches : [];
      chunk.forEach((item, i) => {
        if (matches[i]) hits.set(item.index, apolloPerson(matches[i]));
      });
    });
    return { hits, entries, attempted: usable.length };
  }

  if (p === 'people_data_labs') {
    const usable = items.filter(({ ref }) => ref.linkedin_url || ref.email || (ref.name && (ref.company_domain || ref.company)));
    const chunks: Item<PersonRef>[][] = [];
    for (let i = 0; i < usable.length; i += 10) chunks.push(usable.slice(i, i + 10));
    const entries = await runCalls(
      ctx,
      p,
      chunks.map((chunk) => ({
        capability: 'person/bulk',
        options: {
          min_likelihood: options.min_likelihood ?? 6,
          titlecase: true,
          requests: chunk.map(({ index, ref }) => ({
            params: compact({ profile: ref.linkedin_url, email: ref.email, name: ref.name, company: ref.company_domain ?? ref.company }),
            metadata: { index },
          })),
        },
      }))
    );
    const hits: Hits<Person> = new Map();
    for (const entry of entries) {
      for (const row of Array.isArray(entry.data) ? entry.data : []) {
        if (row?.status === 200 && row.data && typeof row.metadata?.index === 'number') hits.set(row.metadata.index, pdlPerson(row.data));
      }
    }
    return { hits, entries, attempted: usable.length };
  }

  const usable = items.filter(({ ref }) => ref.linkedin_url || ref.email || ref.name);
  const entries = await runCalls(
    ctx,
    p,
    usable.map(({ ref }) => ({
      capability: 'people/enrich-base-no-contact',
      options: compact({
        social_url: ref.linkedin_url,
        email: ref.email,
        full_name: ref.name,
        company: ref.company_domain ?? ref.company,
        min_confidence: options.min_confidence,
        titlecase: true,
      }),
    }))
  );
  const hits = byEntry(usable, entries, (e) => (e.data?.matches?.[0]?.person ? dataLegionPerson(e.data.matches[0].person) : undefined));
  return { hits, entries, attempted: usable.length };
}

const FE_CONTACT: Record<ContactField, string> = {
  work_email: 'contacts/work-email',
  personal_email: 'contacts/personal-email',
  mobile: 'contacts/mobile',
};

async function contactsWith(
  ctx: Context,
  p: Provider,
  items: Item<PersonRef & { need: ContactField[] }>[]
): Promise<Attempt<Person>> {
  if (p === 'fullenrich') {
    const plan: { index: number; field: ContactField }[] = [];
    const calls: Call[] = [];
    for (const { index, ref } of items) {
      const company = ref.company_domain ? { domain: ref.company_domain } : ref.company ? { company_name: ref.company } : undefined;
      if (!ref.linkedin_url && !(ref.name && company)) continue;
      for (const field of ref.need) {
        plan.push({ index, field });
        calls.push({
          capability: FE_CONTACT[field],
          options: compact({ linkedin_url: ref.linkedin_url, ...(ref.name ? splitName(ref.name) : {}), ...company }),
        });
      }
    }
    const entries = await runCalls(ctx, p, calls);
    const hits: Hits<Person> = new Map();
    plan.forEach(({ index, field }, i) => {
      const result = entries[i]?.data?.results?.[0];
      const info = result?.contact_info;
      const found =
        field === 'work_email'
          ? info?.most_probable_work_email
          : field === 'personal_email'
            ? info?.most_probable_personal_email
            : info?.most_probable_phone;
      const value = str(found) ?? str(found?.email) ?? str(found?.number) ?? str(found?.phone);
      if (!value) return;
      const record = hits.get(index) ?? (result?.profile ? fullEnrichPerson(result.profile) : {});
      record[field] = value;
      if (field === 'work_email') record.email_status = str(found?.status);
      hits.set(index, compact(record));
    });
    return { hits, entries, attempted: new Set(plan.map((x) => x.index)).size };
  }

  if (p === 'datalegion') {
    const usable = items.filter(({ ref }) => ref.linkedin_url || ref.name);
      const entries = await runCalls(
      ctx,
      p,
      usable.map(({ ref }) => ({
        capability: 'people/enrich-base-with-contact',
        options: compact({ social_url: ref.linkedin_url, full_name: ref.name, company: ref.company_domain ?? ref.company, titlecase: true }),
      }))
    );
    const hits = byEntry(usable, entries, (e) => (e.data?.matches?.[0]?.person ? dataLegionPerson(e.data.matches[0].person) : undefined));
    return { hits, entries, attempted: usable.length };
  }

  return enrichPeopleWith(ctx, 'apollo', items.filter(({ ref }) => ref.need.includes('work_email')), {});
}

async function enrichCompaniesWith(
  ctx: Context,
  p: Provider,
  items: Item<CompanyRef>[],
  options: Record<string, any>
): Promise<Attempt<Company>> {
  if (p === 'fullenrich') {
    const usable = items.filter(({ ref }) => ref.domain || ref.linkedin_url);
    const entries = await runCalls(
      ctx,
      p,
      usable.map(({ ref }) => ({
        capability: 'companies/lookup',
        options: ref.domain ? { domain: domainOf(ref.domain) } : { professional_network_url: ref.linkedin_url },
      }))
    );
    const hits = byEntry(usable, entries, (e) => (e.data?.companies?.[0] ? fullEnrichCompany(e.data.companies[0]) : undefined));
    return { hits, entries, attempted: usable.length };
  }

  if (p === 'apollo') {
    const usable = items.filter(({ ref }) => ref.domain || ref.linkedin_url || ref.name);
    const chunks: Item<CompanyRef>[][] = [];
    for (let i = 0; i < usable.length; i += 10) chunks.push(usable.slice(i, i + 10));
    const entries = await runCalls(
      ctx,
      p,
      chunks.map((chunk) => ({
        capability: 'companies/bulk-enrich',
        options: { details: chunk.map(({ ref }) => compact({ domain: domainOf(ref.domain), linkedin_url: ref.linkedin_url, name: ref.name })) },
      }))
    );
    const hits: Hits<Company> = new Map();
    chunks.forEach((chunk, c) => {
      const organizations = (Array.isArray(entries[c]?.data?.organizations) ? entries[c].data.organizations : []).filter(Boolean);
      for (const item of chunk) {
        const wanted = domainOf(item.ref.domain);
        const wantedLinkedIn = linkedIn(item.ref.linkedin_url);
        const found = organizations.find(
          (o: any) =>
            (wanted && domainOf(o.primary_domain ?? o.website_url) === wanted) ||
            (wantedLinkedIn && linkedIn(o.linkedin_url) === wantedLinkedIn) ||
            (!wanted && !wantedLinkedIn && item.ref.name && str(o.name)?.toLowerCase() === item.ref.name.toLowerCase())
        );
        if (found) hits.set(item.index, apolloCompany(found));
      }
    });
    return { hits, entries, attempted: usable.length };
  }

  if (p === 'people_data_labs') {
    const usable = items.filter(({ ref }) => ref.domain || ref.linkedin_url || ref.name);
    const entries = await runCalls(
      ctx,
      p,
      usable.map(({ ref }) => ({
        capability: 'company/enrich',
        options: compact({
          website: domainOf(ref.domain),
          profile: ref.domain ? undefined : ref.linkedin_url,
          name: ref.domain || ref.linkedin_url ? undefined : ref.name,
          min_likelihood: options.min_likelihood ?? 6,
          titlecase: true,
        }),
      }))
    );
    const hits = byEntry(usable, entries, (e) => (e.data?.status === 200 ? pdlCompany(e.data) : undefined));
    return { hits, entries, attempted: usable.length };
  }

  const usable = items.filter(({ ref }) => ref.domain || ref.linkedin_url || ref.name);
  const entries = await runCalls(
    ctx,
    p,
    usable.map(({ ref }) => ({
      capability: 'companies/enrich-base',
      options: compact({ domain: domainOf(ref.domain), social_url: ref.domain ? undefined : ref.linkedin_url, name: ref.domain || ref.linkedin_url ? undefined : ref.name, titlecase: true }),
    }))
  );
  const hits = byEntry(usable, entries, (e) => (e.data?.matches?.[0]?.company ? dataLegionCompany(e.data.matches[0].company) : undefined));
  return { hits, entries, attempted: usable.length };
}

const lacking = (count: number) =>
  count > 0 ? (count === 1 ? '1 input lacks' : count + ' inputs lack') + ' the identifiers this provider needs.' : undefined;

/** Runs enabled providers in order; each later one only gets the inputs still unresolved. */
async function waterfall<R, T extends object>(
  order: Provider[],
  inputs: R[],
  done: (record: Keyed | undefined) => boolean,
  attempt: (p: Provider, items: Item<R>[]) => Promise<Attempt<T>>,
  checked: string[]
): Promise<{ results: object[]; reports: ProviderReport[] }> {
  const merged: (Keyed | undefined)[] = inputs.map(() => undefined);
  const reports: ProviderReport[] = [];
  for (const p of order) {
    const pending = inputs
      .map((ref, index) => ({ index, ref, current: merged[index] }))
      .filter(({ current }) => !done(current));
    if (!pending.length) {
      reports.push({ name: p, status: 'skipped', returned: 0, credits: 0, attempted: 0, note: 'Every input was already resolved by an earlier provider.' });
      continue;
    }
    const { hits, entries, attempted } = await attempt(p, pending);
    for (const [index, record] of hits) {
      const target = merged[index];
      if (target) fold(target, record as Record<string, any>, p, checked);
      else merged[index] = { ...record, sources: [p] };
    }
    const failure = errorNote(entries);
    reports.push({
      name: p,
      status: hits.size ? 'ok' : failure ? 'error' : attempted ? 'empty' : 'skipped',
      returned: hits.size,
      credits: credits(entries),
      attempted,
      note: failure ?? lacking(pending.length - attempted),
      next_tool: nextToolOf(entries),
    });
  }
  const results = merged.map((record, input_index) => {
    if (!record) return { input_index, matched: false };
    settle(record);
    return { input_index, matched: true, ...record };
  });
  return { results, reports };
}

// ---------- Registration ----------

export function registerEnrichTools(
  server: Pick<McpRuntime<SessionData>, 'addTool'>,
  getClient: GetClient,
  assertCredential: AssertCredential
): void {
  const contextFor = (session: SessionData | undefined, mcpClient: unknown): Context => {
    assertCredential(session);
    return { client: getClient(session), origin: requestOrigin(mcpClient as any, session) };
  };
  const annotations = (title: string) => ({ title, readOnlyHint: true, openWorldHint: true, destructiveHint: false });

  server.addTool({
    name: 'firecrawl_enrich_people_search',
    annotations: annotations('Find people'),
    description:
      "Find people by current title, employer and location when you don't know who they are. " +
      OPT_IN +
      'Enabled providers run in parallel; results merge by LinkedIn URL, and each record lists the providers that returned it and any disagreements. ' +
      'apollo: free, loose title matching, surnames masked (pass apollo_id to firecrawl_enrich_people to resolve). fullenrich: 5 credits per record, the most filters. people_data_labs: 50 credits per record, exact title match. ' +
      REPORT,
    outputSchema: enrichOutputSchema,
    parameters: peopleSearchParameters,
    execute: async (args: unknown, { session, client: mcpClient }): Promise<ContentResult> => {
      const a = peopleSearchParameters.parse(args);
      const order: Provider[] = ['apollo', 'fullenrich', 'people_data_labs'];
      const on = enabledProviders(a, order);
      const ctx = contextFor(session, mcpClient);
      const found = await Promise.all(on.map((p) => peopleSearchProvider(ctx, p, a)));
      const results = mergeRecords(
        found.map((f, i) => ({ provider: on[i], records: f.records })),
        (r: Person) => r.linkedin_url,
        ['title', 'company']
      );
      return respond(results, [...found.map((f) => f.report), ...notEnabled(a, order)]);
    },
  });

  server.addTool({
    name: 'firecrawl_enrich_people',
    annotations: annotations('Enrich people'),
    description:
      'Resolve known people to profiles: current title, employer, location, LinkedIn URL and recent work history. Takes 1 to 50 people per call and batches provider calls. ' +
      OPT_IN +
      'Enabled providers run as a waterfall in the order fullenrich, apollo, people_data_labs, datalegion: each later one only gets the people earlier ones missed. Results keep input order with input_index and matched. ' +
      'fullenrich: 10 credits per match, best with a LinkedIn URL. apollo: 30 per match, also returns a work email when it has one. people_data_labs: 50 per match, richest history. datalegion: 20 per match. Misses are free. ' +
      REPORT,
    outputSchema: enrichOutputSchema,
    parameters: peopleParameters,
    execute: async (args: unknown, { session, client: mcpClient }): Promise<ContentResult> => {
      const a = peopleParameters.parse(args);
      const order: Provider[] = ['fullenrich', 'apollo', 'people_data_labs', 'datalegion'];
      const on = enabledProviders(a, order);
      const ctx = contextFor(session, mcpClient);
      const { results, reports } = await waterfall(
        on,
        a.people,
        (record) => Boolean(record),
        (p, items) => enrichPeopleWith(ctx, p, items, (a as any)[p] ?? {}),
        ['title', 'company']
      );
      return respond(results, [...reports, ...notEnabled(a, order)]);
    },
  });

  server.addTool({
    name: 'firecrawl_enrich_contact_info',
    annotations: annotations('Find contact details'),
    description:
      'Find contact details for known people: work email, personal email or mobile number. Takes 1 to 50 people per call and charges only for values found. ' +
      OPT_IN +
      'Enabled providers run as a waterfall in the order fullenrich, datalegion, apollo: each later one only tries people still missing a requested value. ' +
      'fullenrich: work email 30 credits, personal email 100, mobile 300. datalegion: 100 per matched person, every field in one call. apollo: work email only, 30 per match. ' +
      REPORT,
    outputSchema: enrichOutputSchema,
    parameters: contactParameters,
    execute: async (args: unknown, { session, client: mcpClient }): Promise<ContentResult> => {
      const a = contactParameters.parse(args);
      const order: Provider[] = ['fullenrich', 'datalegion', 'apollo'];
      const on = enabledProviders(a, order);
      const ctx = contextFor(session, mcpClient);
      const missing = (record: Keyed | undefined) => a.fields.filter((f) => !record?.[f]);
      const { results, reports } = await waterfall(
        on,
        a.people,
        (record) => missing(record).length === 0,
        (p, items) =>
          contactsWith(
            ctx,
            p,
            items.map(({ index, ref, current }) => ({ index, ref: { ...ref, need: missing(current) } }))
          ),
        ['work_email', 'personal_email', 'mobile']
      );
      const unrequested = [
        ...CONTACT_FIELDS.filter((f) => !a.fields.includes(f)),
        ...(a.fields.includes('work_email') ? [] : ['email_status']),
      ];
      const project = (r: Record<string, any>) => {
        const kept = Object.fromEntries(Object.entries(r).filter(([key]) => key !== 'conflicts' && !unrequested.includes(key)));
        const conflicts = Object.fromEntries(Object.entries(r.conflicts ?? {}).filter(([key]) => !unrequested.includes(key)));
        if (Object.keys(conflicts).length) return { ...kept, conflicts };
        return r.conflicts ? { ...kept, confidence: r.sources.length > 1 ? 'agreed' : 'single_source' } : kept;
      };
      return respond(
        results.map((r: any) => (r.matched && a.fields.some((f) => r[f]) ? project(r) : { input_index: r.input_index, matched: false })),
        [...reports, ...notEnabled(a, order)]
      );
    },
  });

  server.addTool({
    name: 'firecrawl_enrich_company_search',
    annotations: annotations('Find companies'),
    description:
      'Find companies by industry, headcount, location, technology or founding year. ' +
      OPT_IN +
      'Enabled providers run in parallel and results merge by domain, each record listing the providers that returned it and any disagreements. ' +
      'apollo: 30 credits per page, no industry or founding-year filter. fullenrich: 5 credits per record. people_data_labs: 50 credits per record, no technology filter. ' +
      REPORT,
    outputSchema: enrichOutputSchema,
    parameters: companySearchParameters,
    execute: async (args: unknown, { session, client: mcpClient }): Promise<ContentResult> => {
      const a = companySearchParameters.parse(args);
      const order: Provider[] = ['apollo', 'fullenrich', 'people_data_labs'];
      const on = enabledProviders(a, order);
      const ctx = contextFor(session, mcpClient);
      const found = await Promise.all(on.map((p) => companySearchProvider(ctx, p, a)));
      const results = mergeRecords(
        found.map((f, i) => ({ provider: on[i], records: f.records })),
        (r: Company) => r.domain,
        ['name', 'industry', 'hq']
      );
      return respond(results, [...found.map((f) => f.report), ...notEnabled(a, order)]);
    },
  });

  server.addTool({
    name: 'firecrawl_enrich_company',
    annotations: annotations('Enrich companies'),
    description:
      'Resolve known companies to firmographics: industry, headcount, headquarters, founding year, funding and technologies. Takes 1 to 50 companies per call and batches provider calls. ' +
      OPT_IN +
      'Enabled providers run as a waterfall in the order fullenrich, apollo, people_data_labs, datalegion: each later one only gets the companies earlier ones missed. Results keep input order with input_index and matched. ' +
      'fullenrich: 10 credits per match, includes technologies. apollo: 30 per match. people_data_labs: 50 per match, funding. datalegion: 20 per match. Misses are free. ' +
      REPORT,
    outputSchema: enrichOutputSchema,
    parameters: companyParameters,
    execute: async (args: unknown, { session, client: mcpClient }): Promise<ContentResult> => {
      const a = companyParameters.parse(args);
      const order: Provider[] = ['fullenrich', 'apollo', 'people_data_labs', 'datalegion'];
      const on = enabledProviders(a, order);
      const ctx = contextFor(session, mcpClient);
      const { results, reports } = await waterfall(
        on,
        a.companies,
        (record) => Boolean(record),
        (p, items) => enrichCompaniesWith(ctx, p, items, (a as any)[p] ?? {}),
        ['name', 'industry']
      );
      return respond(results, [...reports, ...notEnabled(a, order)]);
    },
  });
}
