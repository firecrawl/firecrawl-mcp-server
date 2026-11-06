/**
 * People and company enrichment over Alexandria's B2B data providers
 * (Apollo, FullEnrich, People Data Labs, Data Legion), as two tools: one finds
 * people or companies by criteria, one looks up known ones. Each provider takes
 * its own native parameters; listed providers run in parallel and each reports
 * its own records, charge and errors.
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
const matches = (about?: string) => {
  const schema = z.array(match).min(1).optional();
  return about ? schema.describe(about) : schema;
};
const ranges = (about?: string) => {
  const schema = z.array(range).min(1).optional();
  return about ? schema.describe(about) : schema;
};
const strings = (about: string) => z.array(z.string().min(1)).min(1).optional().describe(about);
const text = (about?: string) => (about ? z.string().optional().describe(about) : z.string().optional());

const has = (value: unknown) => typeof value === 'string' && value.trim() !== '';

const PROVIDERS = ['apollo', 'fullenrich', 'people_data_labs', 'datalegion'] as const;
const ENTITIES = ['person', 'company'] as const;
type Entity = (typeof ENTITIES)[number];

const providersParam = z
  .array(z.enum(PROVIDERS))
  .min(1)
  .optional()
  .describe('Providers to run, in parallel. Each reports its own records, credits and errors.');

const FE_LISTS = 'List filters take [{"value": "...", "exclude"?: true, "exact_match"?: true}]; range filters take [{"min"?: n, "max"?: n}].';

const SEARCH_SHAPES = {
  person: {
    apollo: {
      person_titles: strings('person. Job titles, e.g. ["Head of Data"]. Loose match.'),
      person_locations: strings('person. e.g. ["Seattle, US"].'),
      q_organization_domains_list: strings('person. Employer domains, e.g. ["clerk.com"].'),
      q_keywords: text('person. Free text matched across the person and their company.'),
    },
    fullenrich: {
      current_position_titles: matches('person. e.g. [{"value":"Head of Data"}].'),
      current_position_seniority_level: matches('person. Founder, C-Level, VP, Head, Director, Manager or Senior.'),
      current_position_job_functions: matches('person.'),
      current_position_sub_functions: matches('person.'),
      current_position_years_in: ranges('person.'),
      current_company_names: matches('person.'),
      current_company_domains: matches('person. Exact match recommended.'),
      current_company_professional_network_urls: matches('person. Employer LinkedIn URLs.'),
      current_company_industries: matches('person.'),
      current_company_specialties: matches('person.'),
      current_company_technologies: matches('person.'),
      current_company_types: matches('person. e.g. Privately Held, Public Company.'),
      current_company_headquarters: matches('person.'),
      current_company_headcounts: ranges('person. e.g. [{"min":50,"max":500}].'),
      current_company_founded_years: ranges('person.'),
      current_company_years_at: ranges('person.'),
      current_company_days_since_last_job_change: ranges('person. Recent movers, e.g. [{"max":90}].'),
      person_names: matches('person.'),
      person_professional_network_urls: matches('person. LinkedIn profile URLs.'),
      person_locations: matches('person. Cities, regions or countries.'),
      person_languages: matches('person.'),
      person_skills: matches('person.'),
      person_universities: matches('person.'),
      past_position_titles: matches('person.'),
      past_company_names: matches('person.'),
      past_company_domains: matches('person.'),
    },
  },
  company: {
    apollo: {
      q_organization_name: text('company. Matched against company names and descriptions.'),
      organization_num_employees_ranges: strings('company. Headcount bands, e.g. ["11,50", "51,200"].'),
      organization_locations: strings('company. e.g. ["San Francisco, US"].'),
      currently_using_any_of_technology_uids: strings('company. Apollo technology ids, lowercase with underscores, e.g. ["snowflake"].'),
    },
    fullenrich: {
      keywords: matches('company. Words in the company description.'),
      industries: matches('company.'),
      specialties: matches('company.'),
      technologies: matches('company.'),
      types: matches('company. e.g. Privately Held, Public Company.'),
      headquarters_locations: matches('company. Cities, regions or countries.'),
      headcounts: ranges('company. e.g. [{"min":50,"max":500}].'),
      founded_years: ranges('company.'),
      names: matches('company.'),
      domains: matches('company.'),
      professional_network_urls: matches('company. LinkedIn company URLs.'),
    },
  },
};

const searchOptions = z
  .strictObject({
    apollo: z
      .strictObject({
        ...SEARCH_SHAPES.person.apollo,
        ...SEARCH_SHAPES.company.apollo,
        per_page: z.number().int().min(1).max(25).optional().describe('Default 10.'),
        page: z.number().int().min(1).optional(),
      })
      .optional()
      .describe('Apollo native search parameters. Each key is marked person or company; keys for the other entity are reported in not_applied.'),
    fullenrich: z
      .strictObject({
        ...SEARCH_SHAPES.person.fullenrich,
        ...SEARCH_SHAPES.company.fullenrich,
        limit: z.number().int().min(1).max(25).optional().describe('Records to return, 5 credits each. Default 5.'),
        offset: z.number().int().min(0).max(10000).optional(),
      })
      .optional()
      .describe('FullEnrich native search parameters. Each key is marked person or company; keys for the other entity are reported in not_applied. ' + FE_LISTS),
    people_data_labs: z
      .strictObject({
        sql: text("SELECT * FROM person WHERE ... (entity person) or SELECT * FROM company WHERE ... (entity company). Values are lowercase and match exactly, e.g. job_title = 'head of data'."),
        query: z.record(z.string(), z.unknown()).optional().describe('Elasticsearch query over the person or company schema, instead of sql.'),
        limit: z.number().int().min(1).max(10).optional().describe('Records to return, 50 credits each. Default 2.'),
      })
      .optional()
      .describe('People Data Labs. Pass sql or query.'),
    datalegion: z.looseObject({}).optional().describe('Data Legion has no search; anything here is reported in not_applied.'),
  })
  .optional()
  .describe('Native parameters for each provider, keyed by provider. Only providers listed in providers run.');

const enrichSearchParameters = z.strictObject({
  entity: z.enum(ENTITIES).describe('person: find people by title, employer, location and more. company: find companies by industry, headcount, location, technology or founding year.'),
  providers: providersParam,
  provider_options: searchOptions,
});

const PERSON_KEYS = {
  person_professional_network_url: 'fullenrich (profiles): LinkedIn profile URL. Enough on its own.',
  person_name: 'fullenrich (profiles): full name, with company_domain or company_professional_network_url.',
  company_domain: 'fullenrich (profiles): employer domain.',
  company_professional_network_url: 'fullenrich (profiles): employer LinkedIn URL.',
  linkedin_url: 'apollo; fullenrich (contact fields): LinkedIn profile URL.',
  domain: 'apollo; fullenrich (contact fields): employer domain.',
  company_name: 'fullenrich (contact fields): employer name.',
  organization_name: 'apollo: employer name.',
  id: 'apollo: apollo_id from a search result.',
  name: 'apollo, people_data_labs: full name.',
  first_name: 'apollo, people_data_labs, datalegion, fullenrich (contact fields).',
  last_name: 'apollo, people_data_labs, datalegion, fullenrich (contact fields).',
  email: 'apollo, people_data_labs, datalegion: a known email.',
  profile: 'people_data_labs: LinkedIn or other social profile URL.',
  phone: 'people_data_labs.',
  pdl_id: 'people_data_labs.',
  company: 'people_data_labs, datalegion: employer name, domain or URL.',
  school: 'people_data_labs, datalegion.',
  location: 'people_data_labs.',
  social_url: 'datalegion: LinkedIn or other social profile URL.',
  linkedin_id: 'datalegion.',
  legion_id: 'datalegion.',
  full_name: 'datalegion.',
  job_title: 'datalegion.',
  city: 'datalegion.',
  state: 'datalegion.',
  country: 'datalegion.',
} as const;

const COMPANY_KEYS = {
  domain: 'fullenrich, apollo, datalegion: e.g. stripe.com.',
  professional_network_url: 'fullenrich: LinkedIn company URL.',
  linkedin_url: 'apollo: LinkedIn company URL.',
  website: 'apollo, people_data_labs. Most reliable for people_data_labs.',
  name: 'apollo (exact name only), people_data_labs (weakest), datalegion (fuzzy).',
  profile: 'people_data_labs: LinkedIn company URL.',
  ticker: 'people_data_labs.',
  pdl_id: 'people_data_labs.',
  location: 'people_data_labs: helps a name match.',
  social_url: 'datalegion: LinkedIn company URL.',
  linkedin_id: 'datalegion.',
  ticker_symbol: 'datalegion.',
  legion_id: 'datalegion.',
  industry: 'datalegion: helps an ambiguous name.',
} as const;

const keyed = (keys: Record<string, string>) =>
  z.strictObject(Object.fromEntries(Object.entries(keys).map(([k, about]) => [k, text(about)])) as Record<string, z.ZodOptional<z.ZodString>>);

const CONTACT_FIELDS = ['work_email', 'personal_email', 'mobile'] as const;
type ContactField = (typeof CONTACT_FIELDS)[number];

const minLikelihood = z.number().int().min(1).max(10).optional().describe('Minimum match confidence, 1 to 10 (default 6).');
const minConfidence = z.enum(['high', 'moderate', 'low']).optional();

const enrichParameters = z.strictObject({
  people: z
    .array(keyed(PERSON_KEYS))
    .min(1)
    .max(50)
    .optional()
    .describe("Known people, 1 to 50. Keys are each provider's native identifiers; each provider reads only its own keys, and an item missing a provider's identifiers is skipped for that provider and reported in not_applied."),
  companies: z
    .array(keyed(COMPANY_KEYS))
    .min(1)
    .max(50)
    .optional()
    .describe("Known companies, 1 to 50. Keys are each provider's native identifiers; each provider reads only its own keys."),
  fields: z
    .array(z.enum(CONTACT_FIELDS))
    .min(1)
    .optional()
    .describe('People only: contact values to find. Omit for profiles only.'),
  providers: providersParam,
  provider_options: z
    .strictObject({
      apollo: z.strictObject({ reveal_personal_emails: z.boolean().optional().describe('Contact fields: also return personal emails.') }).optional(),
      fullenrich: z.strictObject({}).optional(),
      people_data_labs: z.strictObject({ min_likelihood: minLikelihood }).optional(),
      datalegion: z.strictObject({ min_confidence: minConfidence }).optional(),
    })
    .optional()
    .describe('Provider-specific options, keyed by provider.'),
});

const enrichOutputSchema = z.looseObject({
  providers: z
    .array(
      z.looseObject({
        name: z.string().optional(),
        status: z.string().optional(),
        returned: z.number().optional(),
        credits: z.number().optional(),
        results: z.array(z.looseObject({})).optional().describe("This provider's records; lookup records carry input_index into the people or companies list."),
        unmatched: z.array(z.number()).optional().describe('Lookups: input indexes this provider tried and did not match.'),
      })
    )
    .optional()
    .describe('What each provider did, with its own records.'),
  credits_total: z.number().optional(),
  not_applied: z.array(z.string()).optional().describe('Inputs, options and providers that did not apply to this call and were ignored.'),
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
  note?: string;
  results?: object[];
  unmatched?: number[];
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
    personal_email: emailFrom(r?.personal_emails),
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


function finish(p: Provider, entries: Entry[], records: object[], extra: Partial<ProviderReport> = {}): ProviderReport {
  const failure = errorNote(entries);
  return compact({
    name: p,
    status: records.length ? 'ok' : failure ? 'error' : 'empty',
    returned: records.length,
    credits: credits(entries),
    note: failure,
    next_tool: nextToolOf(entries),
    results: records,
    ...extra,
  });
}

const chunks = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

// ---------- Search ----------

interface SearchSpec {
  capability: Record<'apollo' | 'fullenrich' | 'people_data_labs', string>;
  read: Record<'apollo' | 'fullenrich', (data: any) => unknown>;
  map: Record<'apollo' | 'fullenrich' | 'people_data_labs', (r: any) => object>;
}

const PEOPLE_SEARCH: SearchSpec = {
  capability: { apollo: 'people/search', fullenrich: 'people/search', people_data_labs: 'person/search' },
  read: { apollo: (d) => d?.people, fullenrich: (d) => d?.people },
  map: { apollo: apolloPreview, fullenrich: fullEnrichPerson, people_data_labs: pdlPerson },
};

const COMPANY_SEARCH: SearchSpec = {
  capability: { apollo: 'companies/search', fullenrich: 'companies/search', people_data_labs: 'company/search' },
  read: { apollo: (d) => d?.organizations, fullenrich: (d) => d?.companies },
  map: { apollo: apolloCompany, fullenrich: fullEnrichCompany, people_data_labs: pdlCompany },
};

async function pdlSearch(ctx: Context, capability: string, query: Record<string, unknown>, limit: number, map: (r: any) => object) {
  const entries: Entry[] = [];
  const records: object[] = [];
  let scroll: string | undefined;
  while (records.length < limit) {
    const size = Math.min(2, limit - records.length);
    const [entry] = await runCalls(ctx, 'people_data_labs', [
      { capability, options: { ...query, size, titlecase: true, ...(scroll ? { scroll_token: scroll } : {}) } },
    ]);
    entries.push(entry);
    const page = Array.isArray(entry.data?.data) ? entry.data.data : [];
    records.push(...page.map(map));
    scroll = str(entry.data?.scroll_token);
    if (entry.error || page.length < size || !scroll) break;
  }
  return { entries, records };
}

async function searchWith(ctx: Context, p: Provider, block: Record<string, any>, spec: SearchSpec): Promise<ProviderReport> {
  if (p === 'datalegion') throw new Error('datalegion has no search capability.');
  const { enabled: _enabled, per_page, page, limit, offset = 0, sql, query, ...filters } = block;
  if (p === 'people_data_labs') {
    const { entries, records } = await pdlSearch(ctx, spec.capability[p], has(sql) ? { sql } : { query }, limit, spec.map[p]);
    return finish(p, entries, records);
  }
  if (!Object.keys(compact(filters)).length) {
    return { name: p, status: 'skipped', returned: 0, credits: 0, note: 'No filters given; pass at least one.' };
  }
  const calls: Call[] =
    p === 'apollo'
      ? [{ capability: spec.capability[p], options: compact({ ...filters, per_page, page }) }]
      : chunks([...Array(limit).keys()], 6).map((slice) => ({
          capability: spec.capability.fullenrich,
          options: { ...filters, limit: slice.length, ...(offset + slice[0] ? { offset: offset + slice[0] } : {}) },
        }));
  const entries = await runCalls(ctx, p, calls);
  const read = spec.read[p];
  const map = spec.map[p];
  const records = entries.flatMap((e) => {
    const rows = read(e.data);
    return Array.isArray(rows) ? rows.map(map) : [];
  });
  return finish(p, entries, records);
}

// ---------- Lookups ----------

type Hits = Map<number, object>;

function lookupReport(p: Provider, entries: Entry[], hits: Hits, total: number): ProviderReport {
  const results = [...hits].sort(([a], [b]) => a - b).map(([input_index, record]) => ({ input_index, ...record }));
  const unmatched = [...Array(total).keys()].filter((i) => !hits.has(i));
  return finish(p, entries, results, { attempted: total, unmatched });
}

/** One entry per input, in order. */
function perEntry(entries: Entry[], read: (entry: Entry) => object | undefined): Hits {
  const hits: Hits = new Map();
  entries.forEach((entry, index) => {
    const record = entry && !entry.error ? read(entry) : undefined;
    if (record && Object.keys(record).length) hits.set(index, record);
  });
  return hits;
}

async function apolloPeople(ctx: Context, details: object[], extra: Record<string, unknown> = {}): Promise<ProviderReport> {
  const batches = chunks(details, 10);
  const entries = await runCalls(
    ctx,
    'apollo',
    batches.map((chunk) => ({ capability: 'people/bulk-match', options: compact({ details: chunk, ...extra }) }))
  );
  const hits: Hits = new Map();
  batches.forEach((chunk, c) => {
    const found = Array.isArray(entries[c]?.data?.matches) ? entries[c].data.matches : [];
    chunk.forEach((_, i) => {
      if (found[i]) hits.set(c * 10 + i, apolloPerson(found[i]));
    });
  });
  return lookupReport('apollo', entries, hits, details.length);
}

async function dataLegionPeople(ctx: Context, block: Record<string, any>, capability: string): Promise<ProviderReport> {
  const entries = await runCalls(
    ctx,
    'datalegion',
    block.people.map((ref: object) => ({ capability, options: compact({ ...ref, min_confidence: block.min_confidence, titlecase: true }) }))
  );
  const hits = perEntry(entries, (e) => (e.data?.matches?.[0]?.person ? dataLegionPerson(e.data.matches[0].person) : undefined));
  return lookupReport('datalegion', entries, hits, block.people.length);
}

async function enrichPeopleWith(ctx: Context, p: Provider, block: Record<string, any>): Promise<ProviderReport> {
  if (p === 'fullenrich') {
    const entries = await runCalls(
      ctx,
      p,
      block.people.map((ref: object) => ({ capability: 'people/lookup', options: compact(ref) }))
    );
    const hits = perEntry(entries, (e) => (e.data?.people?.[0] ? fullEnrichPerson(e.data.people[0]) : undefined));
    return lookupReport(p, entries, hits, block.people.length);
  }
  if (p === 'apollo') return apolloPeople(ctx, block.details);
  if (p === 'datalegion') return dataLegionPeople(ctx, block, 'people/enrich-base-no-contact');

  const batches = chunks<object>(block.requests, 10);
  const entries = await runCalls(
    ctx,
    p,
    batches.map((chunk, c) => ({
      capability: 'person/bulk',
      options: {
        min_likelihood: block.min_likelihood ?? 6,
        titlecase: true,
        requests: chunk.map((params, i) => ({ params: compact(params), metadata: { index: c * 10 + i } })),
      },
    }))
  );
  const hits: Hits = new Map();
  for (const entry of entries) {
    for (const row of Array.isArray(entry.data) ? entry.data : []) {
      if (row?.status === 200 && row.data && typeof row.metadata?.index === 'number') hits.set(row.metadata.index, pdlPerson(row.data));
    }
  }
  return lookupReport(p, entries, hits, block.requests.length);
}

const FE_CONTACT: Record<ContactField, string> = {
  work_email: 'contacts/work-email',
  personal_email: 'contacts/personal-email',
  mobile: 'contacts/mobile',
};

async function contactsWith(ctx: Context, p: Provider, block: Record<string, any>): Promise<ProviderReport> {
  if (p === 'datalegion') return dataLegionPeople(ctx, block, 'people/enrich-base-with-contact');
  if (p === 'apollo') return apolloPeople(ctx, block.details, { reveal_personal_emails: block.reveal_personal_emails });

  const fields: ContactField[] = block.fields;
  const plan = (block.contacts as Record<string, string>[]).flatMap((ref, index) => fields.map((field) => ({ index, field, ref })));
  const entries = await runCalls(
    ctx,
    p,
    plan.map(({ field, ref }) => ({ capability: FE_CONTACT[field], options: compact(ref) }))
  );
  const hits = new Map<number, Person>();
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
  return lookupReport(p, entries, hits, block.contacts.length);
}

async function enrichCompaniesWith(ctx: Context, p: Provider, block: Record<string, any>): Promise<ProviderReport> {
  if (p === 'apollo') {
    const details: Record<string, string>[] = block.details;
    const batches = chunks(details, 10);
    const entries = await runCalls(
      ctx,
      p,
      batches.map((chunk) => ({ capability: 'companies/bulk-enrich', options: { details: chunk.map((d) => compact(d)) } }))
    );
    const hits: Hits = new Map();
    batches.forEach((chunk, c) => {
      const organizations = (Array.isArray(entries[c]?.data?.organizations) ? entries[c].data.organizations : []).filter(Boolean);
      chunk.forEach((ref, i) => {
        const wanted = domainOf(ref.domain ?? ref.website);
        const wantedLinkedIn = linkedIn(ref.linkedin_url);
        const found = organizations.find(
          (o: any) =>
            (wanted && domainOf(o.primary_domain ?? o.website_url) === wanted) ||
            (wantedLinkedIn && linkedIn(o.linkedin_url) === wantedLinkedIn) ||
            (!wanted && !wantedLinkedIn && ref.name && str(o.name)?.toLowerCase() === ref.name.toLowerCase())
        );
        if (found) hits.set(c * 10 + i, apolloCompany(found));
      });
    });
    return lookupReport(p, entries, hits, details.length);
  }

  const spec = {
    fullenrich: { capability: 'companies/lookup', options: {}, read: (e: Entry) => (e.data?.companies?.[0] ? fullEnrichCompany(e.data.companies[0]) : undefined) },
    people_data_labs: {
      capability: 'company/enrich',
      options: { min_likelihood: block.min_likelihood ?? 6, titlecase: true },
      read: (e: Entry) => (e.data?.status === 200 ? pdlCompany(e.data) : undefined),
    },
    datalegion: {
      capability: 'companies/enrich-base',
      options: { min_confidence: block.min_confidence, titlecase: true },
      read: (e: Entry) => (e.data?.matches?.[0]?.company ? dataLegionCompany(e.data.matches[0].company) : undefined),
    },
  }[p];
  const entries = await runCalls(
    ctx,
    p,
    block.companies.map((ref: object) => ({ capability: spec.capability, options: compact({ ...ref, ...spec.options }) }))
  );
  return lookupReport(p, entries, perEntry(entries, spec.read), block.companies.length);
}

// ---------- Registration ----------

type Op = 'profiles' | 'contacts' | 'companies';

const SEARCHABLE: Provider[] = ['apollo', 'fullenrich', 'people_data_labs'];

interface NativeInput {
  keys: string[];
  ok: (r: Record<string, string | undefined>) => boolean;
}

const nameWith = (r: Record<string, string | undefined>, ...others: string[]) =>
  (has(r.name) || (has(r.first_name) && has(r.last_name))) && others.some((k) => has(r[k]));

const APOLLO_PERSON: NativeInput = {
  keys: ['id', 'email', 'linkedin_url', 'name', 'first_name', 'last_name', 'domain', 'organization_name'],
  ok: (r) => has(r.id) || has(r.email) || has(r.linkedin_url) || nameWith(r, 'domain', 'organization_name'),
};
const DATALEGION_PERSON: NativeInput = {
  keys: ['social_url', 'email', 'linkedin_id', 'legion_id', 'full_name', 'first_name', 'last_name', 'company', 'job_title', 'city', 'state', 'country', 'school'],
  ok: (r) => has(r.social_url) || has(r.email) || has(r.linkedin_id) || has(r.legion_id) || has(r.full_name) || (has(r.first_name) && has(r.last_name)),
};

const NATIVE: Record<Op, Partial<Record<Provider, NativeInput>>> = {
  profiles: {
    fullenrich: {
      keys: ['person_professional_network_url', 'person_name', 'company_domain', 'company_professional_network_url'],
      ok: (r) => has(r.person_professional_network_url) || (has(r.person_name) && (has(r.company_domain) || has(r.company_professional_network_url))),
    },
    apollo: APOLLO_PERSON,
    people_data_labs: {
      keys: ['profile', 'email', 'phone', 'pdl_id', 'name', 'first_name', 'last_name', 'company', 'school', 'location'],
      ok: (r) => has(r.profile) || has(r.email) || has(r.phone) || has(r.pdl_id) || nameWith(r, 'company', 'school', 'location'),
    },
    datalegion: DATALEGION_PERSON,
  },
  contacts: {
    fullenrich: {
      keys: ['linkedin_url', 'first_name', 'last_name', 'domain', 'company_name'],
      ok: (r) => has(r.linkedin_url) || (has(r.first_name) && has(r.last_name) && (has(r.domain) || has(r.company_name))),
    },
    datalegion: DATALEGION_PERSON,
    apollo: APOLLO_PERSON,
  },
  companies: {
    fullenrich: { keys: ['domain', 'professional_network_url'], ok: (r) => has(r.domain) || has(r.professional_network_url) },
    apollo: { keys: ['domain', 'linkedin_url', 'name', 'website'], ok: (r) => has(r.domain) || has(r.linkedin_url) || has(r.name) || has(r.website) },
    people_data_labs: {
      keys: ['website', 'profile', 'ticker', 'pdl_id', 'name', 'location'],
      ok: (r) => has(r.website) || has(r.profile) || has(r.ticker) || has(r.pdl_id) || has(r.name),
    },
    datalegion: {
      keys: ['domain', 'social_url', 'name', 'linkedin_id', 'ticker_symbol', 'legion_id', 'industry'],
      ok: (r) => has(r.domain) || has(r.social_url) || has(r.name) || has(r.linkedin_id) || has(r.ticker_symbol) || has(r.legion_id),
    },
  },
};

const OP_LABEL: Record<Op, string> = { profiles: 'profile lookup', contacts: 'contact lookup', companies: 'company lookup' };

function chosenProviders(list: Provider[] | undefined): Provider[] {
  if (list?.length) return [...new Set(list)];
  const example = { providers: ['apollo'] };
  throw new UserError('Pass providers, the list of providers to run, e.g. "providers": ["apollo"]. Available: ' + PROVIDERS.join(', ') + '.', {
    code: 'no_provider_enabled',
    available: [...PROVIDERS],
    example,
  });
}

function strayOptions(options: Record<string, unknown> | undefined, chosen: Provider[], notApplied: string[]) {
  for (const [p, value] of Object.entries(options ?? {})) {
    if (value !== undefined && !chosen.includes(p as Provider)) notApplied.push('provider_options.' + p + ' (not in providers)');
  }
}

const skipped = (name: Provider, note: string): ProviderReport => ({ name, status: 'skipped', returned: 0, credits: 0, note });

async function runSearch(ctx: Context, a: z.infer<typeof enrichSearchParameters>, chosen: Provider[], notApplied: string[]): Promise<ProviderReport[]> {
  const options = (a.provider_options ?? {}) as Record<string, Record<string, any> | undefined>;
  strayOptions(options, chosen, notApplied);
  const other: Entity = a.entity === 'person' ? 'company' : 'person';
  const spec = a.entity === 'person' ? PEOPLE_SEARCH : COMPANY_SEARCH;
  return Promise.all(
    chosen.map(async (p) => {
      if (!SEARCHABLE.includes(p)) {
        notApplied.push(p + ' (no search)');
        return skipped(p, 'Data Legion has no search.');
      }
      const block: Record<string, any> = { ...(options[p] ?? {}) };
      const wrong = Object.keys((SEARCH_SHAPES[other] as Record<string, object>)[p] ?? {}).filter((k) => block[k] !== undefined);
      for (const k of wrong) {
        notApplied.push('provider_options.' + p + '.' + k + ' (' + other + ' key; entity is ' + a.entity + ')');
        delete block[k];
      }
      if (p === 'people_data_labs') {
        if (has(block.sql) === (block.query !== undefined)) return skipped(p, 'people_data_labs needs exactly one of sql or query.');
        block.limit ??= 2;
      }
      if (p === 'apollo') block.per_page ??= 10;
      if (p === 'fullenrich') block.limit ??= 5;
      return searchWith(ctx, p, block, spec);
    })
  );
}

function remap(report: ProviderReport, indexes: number[]): ProviderReport {
  return compact({
    ...report,
    results: report.results?.map((r: any) => ({ ...r, input_index: indexes[r.input_index] })),
    unmatched: report.unmatched?.map((i) => indexes[i]),
  });
}

async function runLookup(ctx: Context, a: z.infer<typeof enrichParameters>, chosen: Provider[], notApplied: string[]): Promise<ProviderReport[]> {
  const op: Op = a.companies ? 'companies' : a.fields ? 'contacts' : 'profiles';
  const items = (a.companies ?? a.people ?? []) as Record<string, string | undefined>[];
  const listName = a.companies ? 'companies' : 'people';
  const options = (a.provider_options ?? {}) as Record<string, Record<string, any> | undefined>;
  strayOptions(options, chosen, notApplied);

  const read = new Set(chosen.flatMap((p) => NATIVE[op][p]?.keys ?? []));
  const unread = [...new Set(items.flatMap((item) => Object.keys(item).filter((k) => has(item[k]) && !read.has(k))))];
  for (const k of unread) notApplied.push(listName + '[].' + k + ' (no listed provider reads it for a ' + OP_LABEL[op] + ')');

  if (op === 'contacts') {
    const fields = a.fields ?? [];
    if (chosen.includes('apollo')) {
      if (fields.includes('mobile')) notApplied.push('fields.mobile (apollo)');
      if (fields.includes('personal_email') && !options.apollo?.reveal_personal_emails) {
        notApplied.push('fields.personal_email (apollo needs provider_options.apollo.reveal_personal_emails)');
      }
    }
  }

  return Promise.all(
    chosen.map(async (p) => {
      const native = NATIVE[op][p];
      if (!native) {
        notApplied.push(p + ' (no ' + OP_LABEL[op] + ')');
        return skipped(p, 'No ' + OP_LABEL[op] + ' on this provider.');
      }
      const indexes: number[] = [];
      const list: Record<string, string>[] = [];
      items.forEach((item, i) => {
        const own = compact(Object.fromEntries(native.keys.filter((k) => has(item[k])).map((k) => [k, item[k] as string])));
        if (native.ok(own)) {
          indexes.push(i);
          list.push(own);
        }
      });
      const missing = items.map((_, i) => i).filter((i) => !indexes.includes(i));
      if (missing.length) notApplied.push(p + ': ' + listName + ' ' + JSON.stringify(missing) + ' lack its identifiers (' + native.keys.join(', ') + ')');
      if (!list.length) return skipped(p, 'No input has the identifiers this provider reads.');
      const own = options[p] ?? {};
      let report: ProviderReport;
      if (op === 'companies') {
        const key = p === 'apollo' ? 'details' : 'companies';
        report = await enrichCompaniesWith(ctx, p, { ...own, [key]: list });
      } else if (op === 'contacts') {
        const block = p === 'fullenrich' ? { contacts: list, fields: a.fields } : p === 'apollo' ? { ...own, details: list } : { ...own, people: list };
        report = await contactsWith(ctx, p, block);
      } else {
        const key = p === 'apollo' ? 'details' : p === 'people_data_labs' ? 'requests' : 'people';
        report = await enrichPeopleWith(ctx, p, { ...own, [key]: list });
      }
      return remap(report, indexes);
    })
  );
}

export function registerEnrichTools(
  server: Pick<McpRuntime<SessionData>, 'addTool'>,
  getClient: GetClient,
  assertCredential: AssertCredential
): void {
  const annotations = (title: string) => ({ title, readOnlyHint: true, openWorldHint: true, destructiveHint: false });
  const respond = (providers: ProviderReport[], notApplied: string[]): ContentResult => {
    const data = compact({
      providers,
      credits_total: providers.reduce((sum, r) => sum + r.credits, 0),
      not_applied: notApplied.length ? notApplied : undefined,
    });
    return withStructured(JSON.stringify(data), data);
  };

  server.addTool({
    name: 'firecrawl_enrich_search',
    annotations: annotations('Find people or companies'),
    description:
      "Find people or companies you don't know yet in B2B data providers, by criteria. entity person: by title, seniority, employer, location, past employers or recent job changes. entity company: by industry, headcount, location, technology or founding year. " +
      'List the providers to run in providers. Each takes its own native parameters in provider_options under its name; every key is marked person or company. ' +
      'apollo: free for people (surnames masked; pass the apollo_id to firecrawl_enrich as id to reveal), 30 credits per company page even when empty, loose matching, no seniority, industry or founding-year filter. fullenrich: 5 credits per record, the most filters. people_data_labs: 50 credits per record, sql or an Elasticsearch query with exact lowercase values. datalegion has no search. ' +
      'Providers run in parallel and each reports its own records, credits charged and any error. Anything in the call that did not apply is listed in not_applied. To look up people or companies you already know, use firecrawl_enrich.',
    outputSchema: enrichOutputSchema,
    parameters: enrichSearchParameters,
    execute: async (args: unknown, { session, client: mcpClient }): Promise<ContentResult> => {
      const a = enrichSearchParameters.parse(args);
      const chosen = chosenProviders(a.providers as Provider[] | undefined);
      assertCredential(session);
      const ctx: Context = { client: getClient(session), origin: requestOrigin(mcpClient as any, session) };
      const notApplied: string[] = [];
      return respond(await runSearch(ctx, a, chosen, notApplied), notApplied);
    },
  });

  server.addTool({
    name: 'firecrawl_enrich',
    annotations: annotations('Enrich people or companies'),
    description:
      'Look up people or companies you already know in B2B data providers. Pass exactly one of people or companies, 1 to 50 items. ' +
      'people without fields returns profiles: current title, employer, location, LinkedIn URL and work history. people with fields finds contact values: work_email, personal_email or mobile. companies returns firmographics: industry, headcount, headquarters, founding year, funding and technologies. ' +
      "Items use the providers' native identifier keys; the schema says which provider reads each key, and each provider reads only its own. List the providers to run in providers; they run in parallel, and results carry input_index into your list. " +
      'Profiles: fullenrich 10 credits per match, apollo 30 (adds a work email), people_data_labs 50 (richest history), datalegion 20. ' +
      'Contact fields: fullenrich per value found (work_email 30, personal_email 100, mobile 300), datalegion 100 per matched person (every field it has), apollo 30 per match (work email; personal emails with reveal_personal_emails). ' +
      'Companies: fullenrich 10 (technologies; domain or LinkedIn URL only), apollo 30, people_data_labs 50 (funding), datalegion 20. Misses are free. Anything in the call that did not apply is listed in not_applied.',
    outputSchema: enrichOutputSchema,
    parameters: enrichParameters,
    execute: async (args: unknown, { session, client: mcpClient }): Promise<ContentResult> => {
      const a = enrichParameters.parse(args);
      if (Boolean(a.people) === Boolean(a.companies)) {
        throw new UserError('Pass exactly one of people or companies.', { code: 'invalid_arguments' });
      }
      if (a.companies && a.fields) {
        throw new UserError('fields applies to people only; drop fields to look up companies.', { code: 'invalid_arguments' });
      }
      const chosen = chosenProviders(a.providers as Provider[] | undefined);
      assertCredential(session);
      const ctx: Context = { client: getClient(session), origin: requestOrigin(mcpClient as any, session) };
      const notApplied: string[] = [];
      return respond(await runLookup(ctx, a, chosen, notApplied), notApplied);
    },
  });
}
