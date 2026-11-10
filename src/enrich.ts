/**
 * People and company enrichment over Alexandria's B2B data providers
 * (Apollo, FullEnrich, People Data Labs, Data Legion). Each provider block takes
 * that provider's own parameters; providers given a block run in parallel and each
 * reports its own records, charge and errors.
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { type ContentResult, type McpRuntime, type ToolExecuteContext, UserError } from './mcp/runtime.js';
import { executeToolCall, type AlexandriaTools } from './alexandria.js';
import { requestOrigin } from './origin';
import { DATA_SOURCES_SETTINGS_URL, relayExchangeError } from './tool-helpers.js';
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
/** A page size published with its maximum; a larger value runs at the maximum with a note instead of being refused. */
const capped = (max: number, fallback: number, about: string) => z.number().int().min(1).default(fallback).meta({ maximum: max }).describe(about);
const PDL_LIMIT = 10;
const text = (about?: string) => (about ? z.string().optional().describe(about) : z.string().optional());

function provider<S extends z.ZodRawShape>(shape: S, about: string, rule?: { check: (value: any) => boolean; message: string; schema: Record<string, unknown> }) {
  const block = z.strictObject(shape);
  return (rule ? block.refine(rule.check, { message: rule.message }).meta(rule.schema) : block).optional().describe(about);
}

/** An input that needs every field of at least one set, checked at runtime and published as the same rule in its JSON Schema. */
function needsOneOf<S extends z.ZodRawShape>(shape: S, sets: string[][], message: string) {
  return z
    .strictObject(shape)
    .refine((r: Record<string, unknown>) => sets.some((set) => set.every((key) => has(r[key]))), { message })
    .meta({ anyOf: sets.map((required) => ({ required, properties: Object.fromEntries(required.map((key) => [key, { pattern: '\\S' }])) })) });
}

const has = (value: unknown) => typeof value === 'string' && value.trim() !== '';

const PROVIDER_BLOCKS =
  'Each provider takes its own native parameters; nothing is shared between providers. Include a block only for each provider you want to run, e.g. "apollo": {...}; included providers run in parallel. ';
const REPORT = 'The response lists every provider with its status, records, credits charged and any error.';
const FE_LISTS = 'List filters take [{"value": "...", "exclude"?: true, "exact_match"?: true}]; range filters take [{"min"?: n, "max"?: n}]. ';

const SENIORITY_LEVELS = 'One of Owner, Founder, C-Level, Partner, VP, Head, Director, Manager or Senior';
const SENIORITY = new Set(['owner', 'founder', 'c-level', 'partner', 'vp', 'head', 'director', 'manager', 'senior']);
const INDUSTRIES = "LinkedIn's current industry names, e.g. Software Development or Computer and Network Security, not Computer Software.";

const sqlOrQuery = {
  check: (v: any) => has(v.sql) !== (v.query !== undefined),
  message: 'people_data_labs needs exactly one of sql or query',
  schema: { oneOf: [{ required: ['sql'] }, { required: ['query'] }] },
};

const peopleSearchParameters = z.strictObject({
  apollo: provider(
    {
      person_titles: strings('Job titles, e.g. ["Head of Data"]. Similar titles also match; adding titles can broaden results.'),
      person_locations: strings('e.g. ["Seattle, US"].'),
      q_organization_domains_list: strings('Employer domains, e.g. ["clerk.com"].'),
      q_keywords: text('Free text matched across the person and their company.'),
      per_page: capped(25, 10, 'Results per page, max 25. Use page for more.'),
      page: z.number().int().min(1).optional().describe('Page number, from 1.'),
    },
    'Apollo people/search. Free. No seniority, industry or headcount filter. Surnames come back masked: pass apollo_id to people_company_enrich as apollo.people[].id to reveal.'
  ),
  fullenrich: provider(
    {
      current_position_titles: matches('e.g. [{"value":"Head of Data"}].'),
      current_position_seniority_level: z
        .array(match.refine((m) => SENIORITY.has(m.value.trim().toLowerCase()), { message: SENIORITY_LEVELS }))
        .min(1)
        .optional()
        .describe(SENIORITY_LEVELS + '.'),
      current_position_job_functions: matches(),
      current_position_sub_functions: matches(),
      current_position_years_in: ranges(),
      current_company_names: matches(),
      current_company_domains: matches('Exact match recommended.'),
      current_company_professional_network_urls: matches('Employer LinkedIn URLs.'),
      current_company_industries: matches(INDUSTRIES),
      current_company_specialties: matches(),
      current_company_technologies: matches(),
      current_company_types: matches('e.g. Privately Held, Public Company.'),
      current_company_headquarters: matches(),
      current_company_headcounts: ranges('e.g. [{"min":50,"max":500}].'),
      current_company_founded_years: ranges(),
      current_company_years_at: ranges(),
      current_company_days_since_last_job_change: ranges('Recent movers, e.g. [{"max":90}].'),
      person_names: matches(),
      person_professional_network_urls: matches('LinkedIn profile URLs.'),
      person_locations: matches('Cities, regions or countries.'),
      person_languages: matches(),
      person_skills: matches(),
      person_universities: matches(),
      past_position_titles: matches(),
      past_company_names: matches(),
      past_company_domains: matches(),
      limit: capped(25, 5, 'Records to return, max 25, 5 credits each. Use offset for more.'),
      offset: z.number().int().min(0).max(10000).optional(),
    },
    'FullEnrich people/search. 5 credits per record. ' + FE_LISTS
  ),
  people_data_labs: provider(
    {
      sql: text("SELECT * FROM person WHERE ... Values are lowercase and match exactly, e.g. job_title = 'head of data'."),
      query: z.record(z.string(), z.unknown()).optional().describe('Elasticsearch query over the person schema, instead of sql.'),
      limit: capped(PDL_LIMIT, 2, 'Records to return, max 10, 50 credits each.'),
    },
    'People Data Labs person/search. 50 credits per record. Pass sql or query.',
    sqlOrQuery
  ),
});

const companySearchParameters = z.strictObject({
  apollo: provider(
    {
      q_organization_name: text('Matched against company names and descriptions.'),
      organization_num_employees_ranges: strings('Headcount bands, e.g. ["11,50", "51,200"].'),
      organization_locations: strings('e.g. ["San Francisco, US"].'),
      currently_using_any_of_technology_uids: strings('Apollo technology ids, lowercase with underscores, e.g. ["snowflake", "google_analytics"].'),
      per_page: capped(25, 10, 'Results per page, max 25. Use page for more.'),
      page: z.number().int().min(1).optional().describe('Page number, from 1.'),
    },
    'Apollo companies/search. 30 credits per page, empty pages included. No industry or founding-year filter.'
  ),
  fullenrich: provider(
    {
      keywords: matches('Words in the company description.'),
      industries: matches(INDUSTRIES),
      specialties: matches(),
      technologies: matches(),
      types: matches('e.g. Privately Held, Public Company.'),
      headquarters_locations: matches('Cities, regions or countries.'),
      headcounts: ranges('e.g. [{"min":50,"max":500}].'),
      founded_years: ranges(),
      names: matches(),
      domains: matches(),
      professional_network_urls: matches('LinkedIn company URLs.'),
      limit: capped(25, 5, 'Records to return, max 25, 5 credits each. Use offset for more.'),
      offset: z.number().int().min(0).max(10000).optional(),
    },
    'FullEnrich companies/search. 5 credits per record. ' + FE_LISTS
  ),
  people_data_labs: provider(
    {
      sql: text("SELECT * FROM company WHERE ... Values are lowercase, e.g. industry = 'computer software'."),
      query: z.record(z.string(), z.unknown()).optional().describe('Elasticsearch query over the company schema, instead of sql.'),
      limit: capped(PDL_LIMIT, 2, 'Records to return, max 10, 50 credits each.'),
    },
    'People Data Labs company/search. 50 credits per record. Pass sql or query.',
    sqlOrQuery
  ),
});

const DEFAULT_MAX_CREDITS = 1000;
const maxCredits = z
  .number()
  .int()
  .min(0)
  .optional()
  .describe(
    'Most credits this call may spend. Omit it for ' + DEFAULT_MAX_CREDITS + '. 0 spends nothing, so only free calls run. The estimate checked against it is each provider\'s listed price times its unit (record, input, Apollo company page, or 10 web results), as if every record were found; a call whose estimate is higher is refused before any provider runs.'
  );

const searchParameters = z.strictObject({
  entity: z.enum(['person', 'company']).describe('Required. Exactly "person" (find people) or "company" (find companies). Each provider block then takes that entity\'s filters.'),
  max_credits: maxCredits,
  apollo: either(peopleSearchParameters.shape.apollo, companySearchParameters.shape.apollo),
  fullenrich: either(peopleSearchParameters.shape.fullenrich, companySearchParameters.shape.fullenrich),
  people_data_labs: either(peopleSearchParameters.shape.people_data_labs, companySearchParameters.shape.people_data_labs),
});

function either(person: z.ZodOptional<z.ZodType>, company: z.ZodOptional<z.ZodType>) {
  return z
    .union([person.unwrap().describe('entity person: ' + person.description), company.unwrap().describe('entity company: ' + company.description)])
    .optional();
}

const NAME_SETS = (names: string[][], others: string[]) => names.flatMap((name) => others.map((other) => [...name, other]));

const apolloPersonRef = needsOneOf(
  {
    id: text('apollo_id from people_company_search.'),
    email: text(),
    linkedin_url: text(),
    name: text('Full name, with domain or organization_name.'),
    first_name: text(),
    last_name: text(),
    domain: text('Employer domain.'),
    organization_name: text(),
  },
  [['id'], ['email'], ['linkedin_url'], ...NAME_SETS([['name'], ['first_name', 'last_name']], ['domain', 'organization_name'])],
  'Each apollo person needs an id, email, linkedin_url, or a name plus domain or organization_name'
);

const dataLegionPersonRef = needsOneOf(
  {
    social_url: text('LinkedIn or other social profile URL.'),
    email: text(),
    linkedin_id: text(),
    legion_id: text(),
    full_name: text(),
    first_name: text(),
    last_name: text(),
    company: text('Company name, website or social URL.'),
    job_title: text(),
    city: text(),
    state: text(),
    country: text(),
    school: text(),
  },
  [['social_url'], ['email'], ['linkedin_id'], ['legion_id'], ...NAME_SETS([['full_name'], ['first_name', 'last_name']], ['company', 'job_title', 'city', 'state', 'country', 'school'])],
  'Each datalegion person needs a social_url, email, linkedin_id or legion_id, or a full name (full_name, or first_name and last_name) plus company, job_title, city, state, country or school'
);

const batch = <T extends z.ZodType>(item: T) => z.array(item).min(1).max(50);
const minLikelihood = z.number().int().min(1).max(10).optional().describe('Minimum match confidence, 1 to 10 (default 6).');
const minConfidence = z.enum(['high', 'moderate', 'low']).optional();

const fullEnrichPersonRef = needsOneOf(
  {
    person_professional_network_url: text('LinkedIn profile URL. Enough on its own.'),
    person_name: text('Full name, with a company identifier.'),
    company_domain: text(),
    company_professional_network_url: text('Employer LinkedIn URL.'),
  },
  [['person_professional_network_url'], ['person_name', 'company_domain'], ['person_name', 'company_professional_network_url']],
  'Each fullenrich person needs a person_professional_network_url, or a person_name plus company_domain or company_professional_network_url'
);

const pdlPersonRef = needsOneOf(
  {
    profile: text('LinkedIn or other social profile URL.'),
    email: text(),
    phone: text(),
    pdl_id: text(),
    name: text(),
    first_name: text(),
    last_name: text(),
    company: text('Employer name or domain.'),
    school: text(),
    location: text(),
  },
  [['profile'], ['email'], ['phone'], ['pdl_id'], ...NAME_SETS([['name'], ['first_name', 'last_name']], ['company', 'school', 'location'])],
  'Each people_data_labs request needs a profile, email, phone, pdl_id, or a name plus company, school or location'
);

const fullEnrichCompanyRef = needsOneOf(
  { domain: text('e.g. stripe.com.'), professional_network_url: text('LinkedIn company URL.') },
  [['domain'], ['professional_network_url']],
  'Each fullenrich company needs a domain or professional_network_url'
);

const apolloCompanyRef = needsOneOf(
  { domain: text(), linkedin_url: text(), name: text(), website: text() },
  [['domain'], ['linkedin_url'], ['name'], ['website']],
  'Each apollo company needs a domain, linkedin_url, name or website'
);

const pdlCompanyRef = needsOneOf(
  {
    website: text('Company website or domain.'),
    profile: text('LinkedIn company URL.'),
    ticker: text(),
    pdl_id: text(),
    name: text('Company name. A name several companies share may not match.'),
    location: text('Helps a name match; never enough alone.'),
  },
  [['website'], ['profile'], ['ticker'], ['pdl_id'], ['name']],
  'Each people_data_labs company needs a website, profile, ticker, pdl_id or name'
);

const dataLegionCompanyRef = needsOneOf(
  {
    domain: text(),
    social_url: text('LinkedIn company URL.'),
    name: text('Fuzzy match; add industry or domain for ambiguous names.'),
    linkedin_id: text(),
    ticker_symbol: text(),
    legion_id: text(),
    industry: text(),
  },
  [['domain'], ['social_url'], ['name'], ['linkedin_id'], ['ticker_symbol'], ['legion_id']],
  'Each datalegion company needs a domain, social_url, name, linkedin_id, ticker_symbol or legion_id'
);

const CONTACT_FIELDS = ['work_email', 'personal_email', 'mobile'] as const;
type ContactField = (typeof CONTACT_FIELDS)[number];

const lookupParameters = z.strictObject({
  max_credits: maxCredits,
  contact_fields: z
    .array(z.enum(CONTACT_FIELDS))
    .min(1)
    .optional()
    .describe(
      'Applies to people only; companies in the same call get firmographics. Finds these contact values instead of profiles. fullenrich: work_email 30 credits, personal_email 100, mobile 300, per value found. datalegion: 100 per matched person, every contact field it has. apollo: 30 per match, work email, plus personal emails when personal_email is listed. people_data_labs has no contact lookup.'
    ),
  fullenrich: provider(
    { people: batch(fullEnrichPersonRef).optional(), companies: batch(fullEnrichCompanyRef).optional() },
    'FullEnrich. people: 10 credits per match, no email. companies: 10 credits per match, includes technologies.'
  ),
  apollo: provider(
    { people: batch(apolloPersonRef).optional(), companies: batch(apolloCompanyRef).optional() },
    'Apollo. people: 30 credits per match, includes a work email when Apollo has one. companies: 30 credits per match; a name alone matches only on an exact name. Runs once an organization admin has accepted Apollo\'s terms.'
  ),
  people_data_labs: provider(
    { people: batch(pdlPersonRef).optional(), companies: batch(pdlCompanyRef).optional(), min_likelihood: minLikelihood },
    'People Data Labs. people: 50 credits per match, with work history. companies: 50 credits per match, with funding history.'
  ),
  datalegion: provider(
    { people: batch(dataLegionPersonRef).optional(), companies: batch(dataLegionCompanyRef).optional(), min_confidence: minConfidence },
    'Data Legion. 20 credits per matched person or company.'
  ),
});

const KINDS = ['people', 'companies'] as const;
type Kind = (typeof KINDS)[number];

const enrichOutputSchema = z.looseObject({
  providers: z
    .array(
      z.looseObject({
        name: z.string().optional(),
        status: z.string().optional(),
        kind: z.enum(KINDS).optional().describe('people_company_enrich: which input list this entry covers. A block with both people and companies has one entry for each.'),
        returned: z.number().optional(),
        credits: z.number().optional(),
        note: z.string().optional().describe('Why the provider failed or skipped inputs.'),
        retryable: z.boolean().optional().describe('The failure may succeed on a later try.'),
        results: z.array(z.looseObject({})).optional().describe('This provider\'s records; people_company_enrich records carry input_index into this entry\'s input list (its kind).'),
        unmatched: z.array(z.number()).optional().describe('people_company_enrich: input indexes this provider did not match.'),
        pending: z
          .array(z.looseObject({}))
          .optional()
          .describe('people_company_enrich: inputs still running upstream, each with input_index and, when it can be read later, next_tool.'),
      })
    )
    .optional()
    .describe('What each provider did, with its own records.'),
  credits_total: z.number().optional(),
  credits_estimate: z.number().optional().describe('The most this call could have cost, checked against max_credits before it ran.'),
  max_credits: z.number().optional(),
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
  name: Provider | 'firecrawl_search';
  status: 'ok' | 'empty' | 'pending' | 'error' | 'skipped' | 'not_requested';
  kind?: Kind;
  returned: number;
  credits: number;
  attempted?: number;
  next_tool?: unknown;
  note?: string;
  retryable?: boolean;
  pending?: object[];
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
type Entry = { data?: any; error?: { code?: string; message?: string; nextTool?: unknown; requiresAction?: unknown }; requiresAction?: unknown; creditsCost?: number };

type TermsGate = { version?: string; url: string };

interface Context {
  client: any;
  origin: string;
  tool: string;
  alexandriaTools: AlexandriaTools;
  gated: Map<Provider, TermsGate>;
}

const TERMS_CODE = 'third_party_data_terms_required';

/** Records a provider whose terms the organization has not accepted and says where an admin accepts them; the tool adds what to retry with. */
function gate(ctx: Context, p: Provider, entry: Entry): Entry {
  if (entry.error?.code?.toLowerCase() !== TERMS_CODE) return entry;
  const action = (isPlain(entry.error.requiresAction) ? entry.error.requiresAction : isPlain(entry.requiresAction) ? entry.requiresAction : {}) as Record<string, unknown>;
  const terms = { version: str(action.version), url: str(action.url) ?? DATA_SOURCES_SETTINGS_URL };
  ctx.gated.set(p, terms);
  const message =
    'An organization admin must accept the ' + p + " provider's terms" + (terms.version ? ' (version ' + terms.version + ')' : '') + ' at ' + terms.url + ' before ' + p + ' can run. ' +
    'Terms are accepted in the Firecrawl dashboard, not through this connection.';
  return { ...entry, error: { ...entry.error, message } };
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
          // The API answers a repeat of this request id from its record, so a resend cannot run twice.
          { tool: ctx.tool, requestId, providers: [SLUG[p]], resend: true, alexandriaTools: ctx.alexandriaTools }
        );
        const entries = response?.data?.data?.alexandria;
        if (!Array.isArray(entries)) throw new Error('Unexpected response shape.');
        return chunk.map((_, i) => gate(ctx, p, entries[i] ?? { error: { message: 'No result returned.' } }));
      } catch (error) {
        if ((error as any)?.response?.status === 401) throw error;
        const message = error instanceof Error ? error.message : String(error);
        const extras = error instanceof UserError ? error.extras : undefined;
        const code = typeof extras?.code === 'string' ? extras.code : 'request_failed';
        return chunk.map(() => gate(ctx, p, { error: compact({ code, message, nextTool: extras?.nextTool, requiresAction: extras?.requiresAction }) }));
      }
    })
  );
  return results.flat();
}

const isMiss = (entry: Entry) => entry.error?.code === 'not_found';

const RETRYABLE = new Set(['provider_error', 'provider_unavailable', 'provider_rate_limited', 'request_timeout', 'precheck_unavailable', 'billing_unavailable']);

const isPending = (entry: Entry | undefined) => entry?.data?.status === 'job_pending' || entry?.error?.code === 'job_pending';

const failureOf = (entries: Entry[]) => entries.find((e) => e.error && !isMiss(e) && !isPending(e))?.error;

const nextToolOf = (entries: Entry[]) => entries.find((e) => e.error?.nextTool)?.error?.nextTool;

const credits = (entries: Entry[]) =>
  entries.reduce((sum, e) => sum + (typeof e.creditsCost === 'number' ? e.creditsCost : 0), 0);

function noProvider(available: string[], example: object): UserError {
  return new UserError(
    'No provider given. Add a block for each provider to run, with that provider\'s own parameters: ' + available.join(', ') + '. Example: ' + JSON.stringify(example),
    { code: 'no_provider', available, example }
  );
}

function notRequested(name: Provider): ProviderReport {
  return { name, status: 'not_requested', returned: 0, credits: 0 };
}

/** hints adds what to change to a provider error whose own message does not say. */
function finish(p: Provider, entries: Entry[], records: object[], extra: Partial<ProviderReport> = {}, hints: Record<string, string> = {}): ProviderReport {
  const failure = failureOf(entries);
  const code = failure?.code;
  return compact({
    name: p,
    status: records.length ? 'ok' : failure ? 'error' : 'empty',
    returned: records.length,
    credits: credits(entries),
    note: failure ? [code, [failure.message, code && hints[code]].filter(Boolean).join(' ')].filter(Boolean).join(': ') : undefined,
    retryable: RETRYABLE.has(code ?? '') || undefined,
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

// ---------- Search: people_company_search ----------

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

const SEARCH_HINTS: Partial<Record<Provider, Record<string, string>>> = {
  people_data_labs: {
    invalid_option:
      'Every field in the query must exist in its schema (https://docs.peopledatalabs.com/docs/fields) and be a subfield, e.g. experience.company.name rather than experience; values are lowercase; LIKE takes at most 20 % wildcards.',
  },
  fullenrich: {
    provider_error:
      "FullEnrich answers this way when a filter value is not one it knows, often an industry: use LinkedIn's current industry names, e.g. Software Development. If every value is valid, retry later.",
  },
};

/** The filters an apollo or fullenrich search block sets, without its paging fields. */
function searchFilters(block: Record<string, any>): Record<string, unknown> {
  return compact(Object.fromEntries(Object.entries(block).filter(([key]) => !['per_page', 'page', 'limit', 'offset'].includes(key))));
}

async function searchWith(ctx: Context, p: Provider, block: Record<string, any>, spec: SearchSpec): Promise<ProviderReport> {
  if (p === 'datalegion') throw new Error('datalegion has no search capability.');
  const { per_page, page, limit, offset = 0, sql, query } = block;
  const filters = searchFilters(block);
  if (p === 'people_data_labs') {
    const { entries, records } = await pdlSearch(ctx, spec.capability[p], has(sql) ? { sql } : { query }, limit, spec.map[p]);
    return finish(p, entries, records, {}, SEARCH_HINTS[p]);
  }
  if (!Object.keys(filters).length) {
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
  return finish(p, entries, records, {}, SEARCH_HINTS[p]);
}

// ---------- Lookups: people_company_enrich ----------

type Hits = Map<number, object>;

function lookupReport(p: Provider, entries: Entry[], hits: Hits, total: number, pending: { input_index: number }[] = []): ProviderReport {
  const results = [...hits].sort(([a], [b]) => a - b).map(([input_index, record]) => ({ input_index, ...record }));
  const waiting = new Set(pending.map((item) => item.input_index));
  const unmatched = [...Array(total).keys()].filter((i) => !hits.has(i) && !waiting.has(i));
  const report = finish(p, entries, results, { attempted: total, unmatched, pending: pending.length ? pending : undefined });
  return report.status === 'empty' && pending.length ? { ...report, status: 'pending' } : report;
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

/** A matched person's requested contact fields the provider did not return, so a charged match is never read as having them. */
function withMissing(report: ProviderReport, fields: ContactField[]): ProviderReport {
  if (!report.results) return report;
  const results = report.results.map((item) => {
    const record = item as Record<string, unknown>;
    const missing = fields.filter((field) => !record[field]);
    return missing.length ? { ...record, missing } : record;
  });
  return { ...report, results };
}

const PENDING_NOTE =
  'Pending inputs were still running upstream when the request ended, and nothing was charged for them. Read each entry that has a next_tool with it after poll_after_seconds; an entry without one cannot be read later from this response. The first read of a finished result is billed once, later reads are free.';

async function contactsWith(ctx: Context, p: Provider, block: Record<string, any>, fields: ContactField[]): Promise<ProviderReport> {
  if (p === 'datalegion') return withMissing(await dataLegionPeople(ctx, block, 'people/enrich-base-with-contact'), fields);
  if (p === 'apollo') {
    if (fields.every((field) => field === 'mobile')) return { name: p, status: 'skipped', returned: 0, credits: 0, note: 'Apollo has no mobile lookup.' };
    return withMissing(await apolloPeople(ctx, block.details, { reveal_personal_emails: block.reveal_personal_emails }), fields);
  }

  const contacts: (Record<string, string> | undefined)[] = block.contacts;
  const plan = contacts.flatMap((ref, index) => (ref ? fields.map((field) => ({ index, field, ref })) : []));
  const unusable = contacts.flatMap((ref, index) => (ref ? [] : [index]));
  const entries = await runCalls(
    ctx,
    p,
    plan.map(({ field, ref }) => ({ capability: FE_CONTACT[field], options: compact(ref) }))
  );
  const hits = new Map<number, Person>();
  const pending: Record<string, unknown>[] = [];
  plan.forEach(({ index, field }, i) => {
    const entry = entries[i];
    if (isPending(entry)) {
      const job = entry.data ?? {};
      pending.push(
        compact({
          input_index: index,
          field,
          job_id: str(job.jobId),
          poll_after_seconds: num(job.pollAfterSeconds),
          next_tool: isPlain(job.next) ? executeToolCall(ctx.alexandriaTools, job.next) : entry.error?.nextTool,
          note: job.next || entry.error?.nextTool ? undefined : entry.error?.message,
        })
      );
      return;
    }
    const result = entry?.data?.results?.[0];
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
  const report = lookupReport(p, entries, hits, contacts.length, pending as { input_index: number }[]);
  const skipped = unusable.length
    ? 'Skipped inputs ' + unusable.join(', ') + ': contacts need a person_professional_network_url, or a person_name with company_domain.'
    : undefined;
  const resumable = pending.some((item) => item.next_tool) ? PENDING_NOTE : undefined;
  const note = [report.note, resumable, skipped].filter(Boolean).join(' ');
  return note ? { ...report, note } : report;
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

const SEARCH_ORDER: Provider[] = ['apollo', 'fullenrich', 'people_data_labs'];
const LOOKUP_ORDER: Provider[] = ['fullenrich', 'apollo', 'people_data_labs', 'datalegion'];
const CONTACT_ORDER: Provider[] = ['fullenrich', 'datalegion', 'apollo', 'people_data_labs'];

const SEARCH = {
  person: { parameters: peopleSearchParameters.extend({ entity: searchParameters.shape.entity, max_credits: maxCredits }), spec: PEOPLE_SEARCH },
  company: { parameters: companySearchParameters.extend({ entity: searchParameters.shape.entity, max_credits: maxCredits }), spec: COMPANY_SEARCH },
};

const SEARCH_EXAMPLE = {
  entity: 'person',
  fullenrich: { current_position_titles: [{ value: 'Head of Data' }], current_company_domains: [{ value: 'example.com', exact_match: true }] },
  apollo: { person_titles: ['Head of Data'], q_organization_domains_list: ['example.com'] },
};
const COMPANY_SEARCH_EXAMPLE = {
  entity: 'company',
  fullenrich: { industries: [{ value: 'Software Development' }], headcounts: [{ min: 51, max: 200 }] },
  apollo: { organization_num_employees_ranges: ['51,200'], organization_locations: ['Boston, US'] },
};
const searchExample = (args: Record<string, any>) => (args.entity === 'company' ? COMPANY_SEARCH_EXAMPLE : SEARCH_EXAMPLE);
const LOOKUP_EXAMPLE = {
  contact_fields: ['work_email'],
  fullenrich: { people: [{ person_name: 'Jane Doe', company_domain: 'example.com' }] },
};
const COMPANY_EXAMPLE = { fullenrich: { companies: [{ domain: 'example.com' }] } };
const EXAMPLE_PERSON: Record<Provider, object> = {
  fullenrich: { person_name: 'Jane Doe', company_domain: 'example.com' },
  apollo: { name: 'Jane Doe', domain: 'example.com' },
  people_data_labs: { name: 'Jane Doe', company: 'example.com' },
  datalegion: { full_name: 'Jane Doe', company: 'example.com' },
};

/** The calls to send instead, built from the caller's own arguments when they are short enough to quote, else the fallbacks. */
function examples(calls: object[], fallback: object[]): string {
  const own = calls.map((call) => JSON.stringify(call));
  const shown = own.join('').length <= 800 ? own : fallback.map((call) => JSON.stringify(call));
  return (shown.length > 1 ? 'Example calls: ' : 'Example: ') + shown.join(' then ');
}

const PER_MATCH: Record<Provider, number> = { fullenrich: 10, apollo: 30, people_data_labs: 50, datalegion: 20 };
const FE_CONTACT_PRICE: Record<ContactField, number> = { work_email: 30, personal_email: 100, mobile: 300 };
const CONTACT_PER_MATCH: Record<Provider, number> = { fullenrich: 0, datalegion: 100, apollo: 30, people_data_labs: 0 };

/** FullEnrich contact parameters for a person, or undefined when the person has no identifier its contact lookup takes. */
function fullEnrichContact(ref: Record<string, string | undefined>) {
  const [first, ...rest] = (ref.person_name ?? '').trim().split(/\s+/);
  const contact = compact({
    linkedin_url: ref.person_professional_network_url,
    first_name: first || undefined,
    last_name: rest.join(' ') || undefined,
    domain: ref.company_domain,
  });
  return has(contact.linkedin_url) || (has(contact.first_name) && has(contact.last_name) && has(contact.domain)) ? contact : undefined;
}

/** Maps a lookup block to the provider's native lookup or contact parameters. */
function nativeLookup(p: Provider, block: Record<string, any>, contactFields?: ContactField[]): Record<string, any> {
  const { people, companies, ...options } = block;
  if (p === 'apollo') return compact({ details: people ?? companies, reveal_personal_emails: contactFields?.includes('personal_email') || undefined, fields: contactFields });
  if (!people) return { companies, ...options };
  if (p === 'people_data_labs') return { requests: people, ...options };
  if (p === 'fullenrich' && contactFields) return { contacts: people.map(fullEnrichContact), fields: contactFields };
  return { people, ...options };
}

// ---------- Argument repair ----------

const isPlain = (value: unknown): value is Record<string, any> => typeof value === 'object' && value !== null && !Array.isArray(value);

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
function repair(schema: unknown, value: unknown): unknown {
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

/** Moves each provider block to its own key: hyphenated or differently cased names, a [{provider, options}] list, a one-item list, or one extra wrapping key. */
function repairBlocks(args: Record<string, any>, order: Provider[], blockSchema: (p: Provider) => unknown): void {
  const providerOf = (name: string) => order.find((p) => p.replace(/_/g, '') === name.toLowerCase().replace(/[-_\s]/g, ''));
  if (Array.isArray(args.providers) && args.providers.every((call: unknown) => isPlain(call) && providerOf(String(call.provider)))) {
    for (const { provider, options, ...rest } of args.providers) args[providerOf(provider)!] ??= options ?? rest;
    delete args.providers;
  }
  for (const key of Object.keys(args)) {
    const p = providerOf(key);
    if (p && p !== key && args[p] === undefined) {
      args[p] = args[key];
      delete args[key];
    }
  }
  for (const p of order) {
    const shape = shapeOf(blockSchema(p)) ?? {};
    const fits = (value: unknown) => isPlain(value) && Object.keys(value).some((key) => key in shape);
    for (let depth = 0; depth < 2; depth++) {
      const block = args[p];
      if (Array.isArray(block) && block.length === 1) args[p] = block[0];
      else if (isPlain(block) && !fits(block) && Object.keys(block).length === 1 && isPlain(Object.values(block)[0])) args[p] = Object.values(block)[0];
    }
  }
}

function fieldsAt(schema: unknown, path: PropertyKey[]): string[] {
  let current = schema;
  for (const segment of path) {
    const def = defOf(current);
    current = def?.type === 'array' ? def.element : shapeOf(current)?.[segment as string];
  }
  return Object.keys(shapeOf(current) ?? {});
}

function checkArguments(tool: string, schema: z.ZodType, args: unknown, example: object): void {
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
function dropSessionFields(args: Record<string, any>): void {
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

type Plan = {
  order: Provider[];
  blocks: Record<string, any>;
  estimates: Partial<Record<Provider | 'firecrawl_search', number>>;
  run: (ctx: Context, p: Provider, block: Record<string, any>) => Promise<ProviderReport | ProviderReport[]>;
  web?: Record<string, any>;
};

/** The server's own web search, run for the firecrawl_search block of people_company_search. */
interface WebSearch {
  parameters: z.ZodType;
  run: (args: unknown, context: ToolExecuteContext<SessionData>) => Promise<ContentResult>;
}

const WEB_ABOUT =
  'Firecrawl web search with the firecrawl_search query parameters, without page fetching: web results such as team pages, profiles and news. 2 credits per 10 results (10 with enterprise zdr), which is what max_credits counts. A team that scans results for threats also pays 2 per result, which max_credits does not count.';

/** The stated web search price: 2 credits per 10 results, rounded up (10 with enterprise zdr), for each source but the free Alexandria one. No sources means web. */
function webEstimate(args: Record<string, any>): number {
  const sources = Array.isArray(args.sources) && args.sources.length ? args.sources : ['web'];
  const results = (args.limit ?? 10) * sources.filter((s: any) => (typeof s === 'string' ? s : s?.type) !== 'alexandria').length;
  const perTen = Array.isArray(args.enterprise) && args.enterprise.includes('zdr') ? 10 : 2;
  return perTen * Math.ceil(results / 10);
}

async function webReport(web: WebSearch, args: unknown, context: ToolExecuteContext<SessionData>): Promise<ProviderReport> {
  const name = 'firecrawl_search';
  try {
    const result = await web.run(args, context);
    const response = (result.structuredContent ?? {}) as Record<string, any>;
    const results = ['web', 'news', 'images'].flatMap((key) => (Array.isArray(response.data?.[key]) ? response.data[key] : []));
    return compact({ name, status: results.length ? 'ok' : 'empty', returned: results.length, credits: num(response.creditsUsed) ?? 0, results });
  } catch (error) {
    const status = (error as any)?.extras?.status ?? (error as any)?.response?.status;
    const retryable = status === 429 || status >= 500 || undefined;
    return compact({ name, status: 'error' as const, returned: 0, credits: 0, note: error instanceof Error ? error.message : String(error), retryable });
  }
}

export function registerEnrichTools(
  server: Pick<McpRuntime<SessionData>, 'addTool'>,
  getClient: GetClient,
  assertCredential: AssertCredential,
  canList: (session?: SessionData) => boolean,
  web: WebSearch,
  // Which tool a pending job's next_tool is addressed to.
  alexandriaTools: AlexandriaTools = 'legacy'
): void {
  const webBlock = web.parameters.optional().describe(WEB_ABOUT);
  const advertisedSearch = searchParameters.extend({ firecrawl_search: webBlock });
  const searchSchemas = {
    person: SEARCH.person.parameters.extend({ firecrawl_search: webBlock }),
    company: SEARCH.company.parameters.extend({ firecrawl_search: webBlock }),
  };

  function tool<S extends z.ZodObject>(
    name: string,
    annotations: Record<string, unknown>,
    description: string,
    parameters: S,
    example: (args: Record<string, any>) => object,
    alternative: (args: Record<string, any>, excluded: ReadonlySet<Provider>) => Record<string, any> | undefined,
    repairAndCheck: (args: Record<string, any>) => void,
    plan: (args: Record<string, any>) => Plan
  ) {
    server.addTool({
      name,
      annotations,
      canList,
      description: description + PROVIDER_BLOCKS + REPORT,
      outputSchema: enrichOutputSchema,
      parameters,
      beforeValidate: (args: unknown) => {
        if (isPlain(args)) {
          dropSessionFields(args);
          repairAndCheck(args);
        }
        return undefined;
      },
      execute: async (args: unknown, context: ToolExecuteContext<SessionData>): Promise<ContentResult> => {
        const { session, client: mcpClient } = context;
        const { order, blocks, estimates, run, web: webArgs } = plan(args as Record<string, any>);
        const on = order.filter((p) => blocks[p] !== undefined);
        if (!on.length && !webArgs) throw noProvider(name === 'people_company_search' ? [...order, 'firecrawl_search'] : order, example(args as Record<string, any>));
        assertCredential(session);
        const charged = [...on, ...(webArgs ? (['firecrawl_search'] as const) : [])];
        const max_credits = (args as { max_credits?: number }).max_credits ?? DEFAULT_MAX_CREDITS;
        const credits_estimate = charged.reduce((sum, p) => sum + (estimates[p] ?? 0), 0);
        if (credits_estimate > max_credits) {
          const parts = charged.filter((p) => estimates[p]).map((p) => p + ' ' + estimates[p]);
          const retry = { ...(args as object), max_credits: credits_estimate };
          const shown = JSON.stringify(retry);
          throw new UserError(
            'This call could cost up to ' + credits_estimate + ' credits (' + parts.join(', ') + '), above max_credits ' + max_credits + '. Nothing ran. The estimate is records or inputs × price, as if every record were found. ' +
              'To run it as is, set max_credits to at least ' + credits_estimate + (shown.length <= 800 ? ': ' + shown : '.') + ' Or send fewer inputs, providers, records or contact fields.',
            { code: 'max_credits_exceeded', credits_estimate, max_credits, estimates, minimum_max_credits: credits_estimate }
          );
        }
        const ctx: Context = { client: getClient(session), origin: requestOrigin(mcpClient as any, session), tool: name, alexandriaTools, gated: new Map() };
        const reports = (
          await Promise.all([
            ...order.map((p) => (on.includes(p) ? run(ctx, p, blocks[p]) : notRequested(p))),
            ...(webArgs ? [webReport(web, webArgs, context)] : []),
          ])
        ).flat();
        const failed = reports.filter((r) => r.status === 'error');
        const excluded = new Set([...ctx.gated.keys(), ...failed.flatMap((r) => (r.name === 'firecrawl_search' ? [] : [r.name]))]);
        const alt = ctx.gated.size ? alternative(args as Record<string, any>, excluded) : undefined;
        const others = alt ? order.filter((p) => alt[p] !== undefined) : [];
        const retry = (r: ProviderReport) =>
          'Retry without ' + r.name + (others.length ? ', for example with ' + others.join(' or ') : '') + ', or wait until the terms are accepted and retry the same call.';
        const providers = reports.map((r) => (r.status === 'error' && r.name !== 'firecrawl_search' && ctx.gated.has(r.name) ? { ...r, note: [r.note, retry(r)].filter(Boolean).join(' ') } : r));
        const data = { providers, credits_total: providers.reduce((sum, r) => sum + r.credits, 0), credits_estimate, max_credits };
        const ran = providers.filter((r) => r.status !== 'not_requested');
        const succeeded = ran.some((r) => r.status === 'ok' || r.status === 'empty' || r.status === 'pending');
        if (ran.length && ran.every((r) => r.status === 'error' && r.name !== 'firecrawl_search' && ctx.gated.has(r.name))) {
          const gated = [...new Set(failed.map((r) => r.name as Provider))];
          const terms = gated.map((p) => ({ provider: p, ...ctx.gated.get(p)! }));
          const cost = alt ? Object.values(plan(alt).estimates).reduce((sum: number, n) => sum + (n ?? 0), 0) : 0;
          const example = alt ? { ...alt, max_credits: cost } : undefined;
          throw new UserError(
            terms.map((t) => 'An organization admin must accept the ' + t.provider + " provider's terms" + (t.version ? ' (version ' + t.version + ')' : '') + ' at ' + t.url + ' before ' + t.provider + ' can run.').join(' ') +
              ' Terms are accepted in the Firecrawl dashboard, not through this connection. Credits charged: ' + data.credits_total + '. ' +
              (example
                ? 'Retry without ' + gated.join(' and ') + ', for example with ' + others.join(' and ') + ': ' + JSON.stringify(example) + '. Or wait until the terms are accepted and retry the same call.'
                : 'Retry once the terms are accepted.'),
            { code: TERMS_CODE, ...data, terms, ...(example ? { example, minimum_max_credits: cost } : {}) }
          );
        }
        if (!succeeded) {
          const why = ran.map((r) => r.name + (r.kind ? ' ' + r.kind : '') + ' ' + r.status + (r.note ? ': ' + r.note : '')).map((reason) => (/[.!?]$/.test(reason) ? reason : reason + '.'));
          throw new UserError('No provider ran successfully: ' + why.join(' ') + ' Credits charged: ' + data.credits_total + '. Example of a working call: ' + JSON.stringify(example(args as Record<string, any>)), {
            code: 'no_provider_ran',
            ...data,
            example: example(args as Record<string, any>),
          });
        }
        return withStructured(JSON.stringify(data), data);
      },
    });
  }

  tool(
    'people_company_search',
    { title: 'Find people or companies', readOnlyHint: true, openWorldHint: true, destructiveHint: false },
    "Find people or companies you don't know yet. Set entity to \"person\" or \"company\", then give each provider its filters for that entity: people by title, employer, location or seniority; companies by industry, headcount, location, technology or founding year. " +
      'apollo: free for people, 30 credits per page for companies, once an organization admin has accepted its terms. fullenrich: 5 credits per record. people_data_labs: 50 credits per record, SQL or Elasticsearch query. firecrawl_search: web results, with the firecrawl_search tool\'s query parameters. ' +
      'Example: ' + JSON.stringify(SEARCH_EXAMPLE) + '. ',
    advertisedSearch,
    searchExample,
    (args, excluded) => {
      const alt = Object.fromEntries(Object.entries(searchExample(args)).filter(([key]) => !excluded.has(key as Provider)));
      return SEARCH_ORDER.some((p) => alt[p] !== undefined) ? alt : undefined;
    },
    (args) => {
      if (typeof args.entity === 'string') args.entity = ENTITY[args.entity.trim().toLowerCase()] ?? args.entity;
      const entity = searchParameters.shape.entity.safeParse(args.entity);
      if (!entity.success) {
        const known = Object.keys(advertisedSearch.shape);
        const unknown = Object.keys(args).filter((key) => !known.includes(key));
        const issues = [
          { path: 'entity', message: 'required, exactly "person" or "company"' + (args.entity === undefined ? '' : ', got ' + JSON.stringify(args.entity)) },
          ...(unknown.length ? [{ path: '', message: 'unknown field ' + unknown.join(', ') + '; takes ' + known.join(', ') }] : []),
        ];
        throw new UserError(
          'Invalid people_company_search arguments. ' + issues.map((i) => (i.path ? i.path + ': ' : '') + i.message).join('; ') + '. Example: ' + JSON.stringify(SEARCH_EXAMPLE),
          { code: 'invalid_input', issues, example: SEARCH_EXAMPLE }
        );
      }
      const parameters = searchSchemas[entity.data];
      repairBlocks(args, SEARCH_ORDER, (p) => parameters.shape[p as keyof typeof parameters.shape]);
      repair(parameters, args);
      checkArguments('people_company_search', parameters, args, searchExample(args));
    },
    (args) => {
      const entity = searchParameters.shape.entity.parse(args.entity);
      const blocks = searchSchemas[entity].parse(args) as Record<string, any>;
      const notes: Partial<Record<Provider, string>> = {};
      for (const p of SEARCH_ORDER) {
        const block = blocks[p];
        const key = p === 'apollo' ? 'per_page' : 'limit';
        const max = p === 'people_data_labs' ? PDL_LIMIT : 25;
        if (!block || !(block[key] > max)) continue;
        notes[p] = key + ' ' + block[key] + ' is above the maximum ' + max + ', so ' + max + ' ran' + (p === 'people_data_labs' ? '.' : '; use ' + (p === 'apollo' ? 'page' : 'offset') + ' for more.');
        block[key] = max;
      }
      const runs = (p: 'apollo' | 'fullenrich') => blocks[p] !== undefined && Object.keys(searchFilters(blocks[p])).length > 0;
      const estimates = {
        apollo: entity === 'company' && runs('apollo') ? 30 : 0,
        fullenrich: runs('fullenrich') ? 5 * blocks.fullenrich.limit : 0,
        people_data_labs: 50 * (blocks.people_data_labs?.limit ?? 0),
        firecrawl_search: blocks.firecrawl_search ? webEstimate(blocks.firecrawl_search) : 0,
      };
      const run = async (ctx: Context, p: Provider, block: Record<string, any>) => {
        const report = await searchWith(ctx, p, block, SEARCH[entity].spec);
        return notes[p] ? { ...report, note: [notes[p], report.note].filter(Boolean).join(' ') } : report;
      };
      return { order: SEARCH_ORDER, blocks, estimates, web: blocks.firecrawl_search, run };
    }
  );

  tool(
    'people_company_enrich',
    // Read-only: looks records up and returns them; contact_fields costs credits but changes nothing.
    { title: 'Look up and enrich people or companies', readOnlyHint: true, openWorldHint: true, destructiveHint: false },
    'Look up and enrich known people or companies: profiles and work history, or firmographics such as industry, headcount, funding and technologies. Each provider block takes people, companies or both, each its own list of 1 to 50. A block with both runs them as two requests and reports two entries, kind "people" and kind "companies"; results carry input_index into their entry\'s list. ' +
      'Add contact_fields to get work email, personal email or mobile for people. Misses are free. ' +
      'Example: ' + JSON.stringify(LOOKUP_EXAMPLE) + '. ',
    lookupParameters,
    (args) => (Object.values(args).some((block) => isPlain(block) && block.companies !== undefined) ? COMPANY_EXAMPLE : LOOKUP_EXAMPLE),
    (args, excluded) => {
      if (excluded.has('fullenrich')) return undefined;
      const has = (kind: Kind) => Object.values(args).some((block) => isPlain(block) && block[kind] !== undefined);
      const fullenrich = compact({ people: has('people') ? [EXAMPLE_PERSON.fullenrich] : undefined, companies: has('companies') ? [{ domain: 'example.com' }] : undefined });
      return compact({ contact_fields: has('people') ? args.contact_fields : undefined, fullenrich });
    },
    (args) => {
      repairBlocks(args, LOOKUP_ORDER, (p) => lookupParameters.shape[p]);
      repair(lookupParameters, args);
      checkArguments('people_company_enrich', lookupParameters, args, LOOKUP_EXAMPLE);
    },
    (args) => {
      const a = lookupParameters.parse(args) as Record<string, any>;
      const given = LOOKUP_ORDER.filter((p) => a[p] !== undefined);
      const empty = given.find((p) => !a[p].people && !a[p].companies);
      if (empty) throw new UserError('Give ' + empty + ' people, companies or both. ' + examples([{ [empty]: { people: [EXAMPLE_PERSON[empty]] } }], [LOOKUP_EXAMPLE]), { code: 'invalid_input' });
      const halves = (p: Provider) => KINDS.filter((kind) => a[p][kind]);
      const kinds = new Set(given.flatMap(halves));
      const contactFields: ContactField[] | undefined = a.contact_fields;
      if (contactFields && given.length && !kinds.has('people')) {
        const without = { ...args };
        delete without.contact_fields;
        throw new UserError('contact_fields applies to people only, and these are companies. Drop contact_fields to get their firmographics. ' + examples([without], [COMPANY_EXAMPLE]), { code: 'invalid_input' });
      }
      const contacts = (kind: Kind) => (kind === 'people' ? contactFields : undefined);
      const price = (p: Provider, kind: Kind) => {
        const fields = contacts(kind);
        if (!fields) return PER_MATCH[p];
        if (p === 'fullenrich') return fields.reduce((sum, f) => sum + FE_CONTACT_PRICE[f], 0);
        return p === 'apollo' && fields.every((f) => f === 'mobile') ? 0 : CONTACT_PER_MATCH[p];
      };
      const estimates = Object.fromEntries(given.map((p) => [p, halves(p).reduce((sum, kind) => sum + a[p][kind].length * price(p, kind), 0)]));
      const runHalf = (ctx: Context, p: Provider, kind: Kind, block: Record<string, any>): Promise<ProviderReport> => {
        const native = nativeLookup(p, { ...block, people: undefined, companies: undefined, [kind]: block[kind] }, contacts(kind));
        if (kind === 'companies') return enrichCompaniesWith(ctx, p, native);
        if (!contactFields) return enrichPeopleWith(ctx, p, native);
        if (p === 'people_data_labs') return Promise.resolve({ name: p, status: 'skipped', returned: 0, credits: 0, note: 'No contact lookup; drop contact_fields to resolve these people.' });
        return contactsWith(ctx, p, native, contactFields);
      };
      return {
        order: contactFields ? CONTACT_ORDER : LOOKUP_ORDER,
        blocks: Object.fromEntries(given.map((p) => [p, a[p]])),
        estimates,
        run: (ctx, p, block) => Promise.all(halves(p).map(async (kind) => ({ ...(await runHalf(ctx, p, kind, block)), kind }))),
      };
    }
  );
}
