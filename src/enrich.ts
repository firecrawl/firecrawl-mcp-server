/**
 * People and company enrichment over Alexandria's B2B data providers
 * (Apollo, FullEnrich, People Data Labs, Data Legion). Each provider block takes
 * that provider's own parameters; enabled providers run in parallel and each
 * reports its own records, charge and errors.
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

const enabled = z.boolean().describe('true runs this provider.');

function provider<S extends z.ZodRawShape>(shape: S, about: string, check?: [(value: any) => boolean, string]) {
  const block = z.strictObject({ enabled, ...shape });
  return (check ? block.refine(check[0], { message: check[1] }) : block).optional().describe(about);
}

const has = (value: unknown) => typeof value === 'string' && value.trim() !== '';

const OPT_IN =
  'Each provider takes its own native parameters; nothing is shared between providers. A provider runs only when its block has {"enabled": true}, e.g. "apollo": {"enabled": true, ...}. Enabled providers run in parallel. ';
const REPORT = 'The response lists every provider with its status, records, credits charged and any error.';
const FE_LISTS = 'List filters take [{"value": "...", "exclude"?: true, "exact_match"?: true}]; range filters take [{"min"?: n, "max"?: n}]. ';

const sqlOrQuery: [(value: any) => boolean, string] = [
  (v) => has(v.sql) !== (v.query !== undefined),
  'people_data_labs needs exactly one of sql or query',
];

const peopleSearchParameters = z.strictObject({
  apollo: provider(
    {
      person_titles: strings('Job titles, e.g. ["Head of Data"]. Loose match; several titles widen the net.'),
      person_locations: strings('e.g. ["Seattle, US"].'),
      q_organization_domains_list: strings('Employer domains, e.g. ["clerk.com"].'),
      q_keywords: text('Free text matched across the person and their company.'),
      per_page: z.number().int().min(1).max(25).default(10),
      page: z.number().int().min(1).optional(),
    },
    'Apollo people/search. Free. No seniority, industry or headcount filter. Surnames come back masked: pass apollo_id to firecrawl_enrich_people as apollo.details[].id to reveal.'
  ),
  fullenrich: provider(
    {
      current_position_titles: matches('e.g. [{"value":"Head of Data"}].'),
      current_position_seniority_level: matches('Founder, C-Level, VP, Head, Director, Manager or Senior.'),
      current_position_job_functions: matches(),
      current_position_sub_functions: matches(),
      current_position_years_in: ranges(),
      current_company_names: matches(),
      current_company_domains: matches('Exact match recommended.'),
      current_company_professional_network_urls: matches('Employer LinkedIn URLs.'),
      current_company_industries: matches(),
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
      limit: z.number().int().min(1).max(25).default(5).describe('Records to return, 5 credits each.'),
      offset: z.number().int().min(0).max(10000).optional(),
    },
    'FullEnrich people/search. 5 credits per record. ' + FE_LISTS
  ),
  people_data_labs: provider(
    {
      sql: text("SELECT * FROM person WHERE ... Values are lowercase and match exactly, e.g. job_title = 'head of data'."),
      query: z.record(z.string(), z.unknown()).optional().describe('Elasticsearch query over the person schema, instead of sql.'),
      limit: z.number().int().min(1).max(10).default(2).describe('Records to return, 50 credits each.'),
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
      per_page: z.number().int().min(1).max(25).default(10),
      page: z.number().int().min(1).optional(),
    },
    'Apollo companies/search. 30 credits per page, empty pages included. No industry or founding-year filter.'
  ),
  fullenrich: provider(
    {
      keywords: matches('Words in the company description.'),
      industries: matches(),
      specialties: matches(),
      technologies: matches(),
      types: matches('e.g. Privately Held, Public Company.'),
      headquarters_locations: matches('Cities, regions or countries.'),
      headcounts: ranges('e.g. [{"min":50,"max":500}].'),
      founded_years: ranges(),
      names: matches(),
      domains: matches(),
      professional_network_urls: matches('LinkedIn company URLs.'),
      limit: z.number().int().min(1).max(25).default(5).describe('Records to return, 5 credits each.'),
      offset: z.number().int().min(0).max(10000).optional(),
    },
    'FullEnrich companies/search. 5 credits per record. ' + FE_LISTS
  ),
  people_data_labs: provider(
    {
      sql: text("SELECT * FROM company WHERE ... Values are lowercase, e.g. industry = 'computer software'."),
      query: z.record(z.string(), z.unknown()).optional().describe('Elasticsearch query over the company schema, instead of sql.'),
      limit: z.number().int().min(1).max(10).default(2).describe('Records to return, 50 credits each.'),
    },
    'People Data Labs company/search. 50 credits per record. Pass sql or query.',
    sqlOrQuery
  ),
});

const apolloPersonRef = z
  .strictObject({
    id: text('apollo_id from firecrawl_enrich_people_search.'),
    email: text(),
    linkedin_url: text(),
    name: text('Full name, with domain or organization_name.'),
    first_name: text(),
    last_name: text(),
    domain: text('Employer domain.'),
    organization_name: text(),
  })
  .refine(
    (r) => has(r.id) || has(r.email) || has(r.linkedin_url) || ((has(r.name) || (has(r.first_name) && has(r.last_name))) && (has(r.domain) || has(r.organization_name))),
    { message: 'Each apollo person needs an id, email, linkedin_url, or a name plus domain or organization_name' }
  );

const dataLegionPersonRef = z
  .strictObject({
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
  })
  .refine(
    (r) => has(r.social_url) || has(r.email) || has(r.linkedin_id) || has(r.legion_id) || has(r.full_name) || (has(r.first_name) && has(r.last_name)),
    { message: 'Each datalegion person needs a social_url, email, linkedin_id, legion_id or a name' }
  );

const batch = <T extends z.ZodType>(item: T) => z.array(item).min(1).max(50);
const minLikelihood = z.number().int().min(1).max(10).optional().describe('Minimum match confidence, 1 to 10 (default 6).');
const minConfidence = z.enum(['high', 'moderate', 'low']).optional();

const peopleParameters = z.strictObject({
  fullenrich: provider(
    {
      people: batch(
        z
          .strictObject({
            person_professional_network_url: text('LinkedIn profile URL. Enough on its own.'),
            person_name: text('Full name, with a company identifier.'),
            company_domain: text(),
            company_professional_network_url: text('Employer LinkedIn URL.'),
          })
          .refine((r) => has(r.person_professional_network_url) || (has(r.person_name) && (has(r.company_domain) || has(r.company_professional_network_url))), {
            message: 'Each fullenrich person needs a person_professional_network_url, or a person_name plus company_domain or company_professional_network_url',
          })
      ),
    },
    'FullEnrich people/lookup. 10 credits per match. No email lookup.'
  ),
  apollo: provider(
    { details: batch(apolloPersonRef) },
    'Apollo people/bulk-match. 30 credits per match; includes a work email when Apollo has one.'
  ),
  people_data_labs: provider(
    {
      requests: batch(
        z
          .strictObject({
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
          })
          .refine(
            (r) => has(r.profile) || has(r.email) || has(r.phone) || has(r.pdl_id) || ((has(r.name) || (has(r.first_name) && has(r.last_name))) && (has(r.company) || has(r.school) || has(r.location))),
            { message: 'Each people_data_labs request needs a profile, email, phone, pdl_id, or a name plus company, school or location' }
          )
      ),
      min_likelihood: minLikelihood,
    },
    'People Data Labs person/bulk. 50 credits per match; richest work history.'
  ),
  datalegion: provider(
    { people: batch(dataLegionPersonRef), min_confidence: minConfidence },
    'Data Legion people/enrich-base-no-contact. 20 credits per match.'
  ),
});

const CONTACT_FIELDS = ['work_email', 'personal_email', 'mobile'] as const;
type ContactField = (typeof CONTACT_FIELDS)[number];

const contactParameters = z.strictObject({
  fullenrich: provider(
    {
      contacts: batch(
        z
          .strictObject({
            linkedin_url: text('Enough on its own.'),
            first_name: text(),
            last_name: text(),
            domain: text('Employer domain.'),
            company_name: text(),
          })
          .refine((r) => has(r.linkedin_url) || (has(r.first_name) && has(r.last_name) && (has(r.domain) || has(r.company_name))), {
            message: 'Each fullenrich contact needs a linkedin_url, or first_name, last_name and a domain or company_name',
          })
      ),
      fields: z.array(z.enum(CONTACT_FIELDS)).min(1).describe('Values to find for every contact.'),
    },
    'FullEnrich contacts. Per value found: work_email 30 credits, personal_email 100, mobile 300.'
  ),
  datalegion: provider(
    { people: batch(dataLegionPersonRef), min_confidence: minConfidence },
    'Data Legion people/enrich-base-with-contact. 100 credits per matched person; returns every contact field it has.'
  ),
  apollo: provider(
    {
      details: batch(apolloPersonRef),
      reveal_personal_emails: z.boolean().optional().describe('Also return personal emails.'),
    },
    'Apollo people/bulk-match. 30 credits per match; work email, plus personal emails when asked.'
  ),
});

const companyParameters = z.strictObject({
  fullenrich: provider(
    {
      companies: batch(
        z
          .strictObject({ domain: text('e.g. stripe.com.'), professional_network_url: text('LinkedIn company URL.') })
          .refine((r) => has(r.domain) || has(r.professional_network_url), { message: 'Each fullenrich company needs a domain or professional_network_url' })
      ),
    },
    'FullEnrich companies/lookup. 10 credits per match; includes technologies.'
  ),
  apollo: provider(
    {
      details: batch(
        z
          .strictObject({ domain: text(), linkedin_url: text(), name: text(), website: text() })
          .refine((r) => has(r.domain) || has(r.linkedin_url) || has(r.name) || has(r.website), { message: 'Each apollo company needs a domain, linkedin_url, name or website' })
      ),
    },
    'Apollo companies/bulk-enrich. 30 credits per match. A name alone matches only on an exact name.'
  ),
  people_data_labs: provider(
    {
      companies: batch(
        z
          .strictObject({
            website: text('Most reliable identifier.'),
            profile: text('LinkedIn company URL.'),
            ticker: text(),
            pdl_id: text(),
            name: text('Weakest identifier; ambiguous names miss.'),
            location: text('Helps a name match; never enough alone.'),
          })
          .refine((r) => has(r.website) || has(r.profile) || has(r.ticker) || has(r.pdl_id) || has(r.name), {
            message: 'Each people_data_labs company needs a website, profile, ticker, pdl_id or name',
          })
      ),
      min_likelihood: minLikelihood,
    },
    'People Data Labs company/enrich. 50 credits per match; funding history.'
  ),
  datalegion: provider(
    {
      companies: batch(
        z
          .strictObject({
            domain: text(),
            social_url: text('LinkedIn company URL.'),
            name: text('Fuzzy match; add industry or domain for ambiguous names.'),
            linkedin_id: text(),
            ticker_symbol: text(),
            legion_id: text(),
            industry: text(),
          })
          .refine((r) => has(r.domain) || has(r.social_url) || has(r.name) || has(r.linkedin_id) || has(r.ticker_symbol) || has(r.legion_id), {
            message: 'Each datalegion company needs a domain, social_url, name, linkedin_id, ticker_symbol or legion_id',
          })
      ),
      min_confidence: minConfidence,
    },
    'Data Legion companies/enrich-base. 20 credits per match.'
  ),
});

const enrichOutputSchema = z.looseObject({
  providers: z
    .array(
      z.looseObject({
        name: z.string().optional(),
        status: z.string().optional(),
        returned: z.number().optional(),
        credits: z.number().optional(),
        results: z.array(z.looseObject({})).optional().describe('This provider\'s records; lookup records carry input_index into this provider\'s input list.'),
        unmatched: z.array(z.number()).optional().describe('Lookup tools: input indexes this provider did not match.'),
      })
    )
    .optional()
    .describe('What each provider did, with its own records.'),
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

function enabledProviders(args: Record<string, any>, order: Provider[]): Provider[] {
  const on = order.filter((p) => args[p]?.enabled === true);
  if (on.length) return on;
  const example = Object.fromEntries(order.slice(0, 2).map((p) => [p, { enabled: true }]));
  throw new UserError(
    'No provider is enabled. Pass {"enabled": true} on each provider to run: ' + order.join(', ') + '. Example: ' + JSON.stringify(example) + '.',
    { code: 'no_provider_enabled', available: order, example }
  );
}


function notEnabled(name: Provider): ProviderReport {
  return { name, status: 'not_enabled', returned: 0, credits: 0 };
}

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

// ---------- Search: firecrawl_enrich_people_search, _company_search ----------

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

// ---------- Lookups: firecrawl_enrich_people, _contact_info, _company ----------

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

export function registerEnrichTools(
  server: Pick<McpRuntime<SessionData>, 'addTool'>,
  getClient: GetClient,
  assertCredential: AssertCredential
): void {
  const annotations = (title: string) => ({ title, readOnlyHint: true, openWorldHint: true, destructiveHint: false });

  function tool<S extends z.ZodObject>(
    name: string,
    title: string,
    description: string,
    parameters: S,
    order: Provider[],
    run: (ctx: Context, p: Provider, block: Record<string, any>) => Promise<ProviderReport>
  ) {
    server.addTool({
      name,
      annotations: annotations(title),
      description: description + OPT_IN + REPORT,
      outputSchema: enrichOutputSchema,
      parameters,
      execute: async (args: unknown, { session, client: mcpClient }): Promise<ContentResult> => {
        const a = parameters.parse(args) as Record<string, any>;
        const on = enabledProviders(a, order);
        assertCredential(session);
        const ctx: Context = { client: getClient(session), origin: requestOrigin(mcpClient as any, session) };
        const providers = await Promise.all(order.map((p) => (on.includes(p) ? run(ctx, p, a[p]) : notEnabled(p))));
        const data = { providers, credits_total: providers.reduce((sum, r) => sum + r.credits, 0) };
        return withStructured(JSON.stringify(data), data);
      },
    });
  }

  tool(
    'firecrawl_enrich_people_search',
    'Find people',
    "Find people by title, employer, location and more when you don't know who they are. " +
      'apollo: free, loose title match, masked surnames, no seniority filter. fullenrich: 5 credits per record, the most filters (seniority, headcount, past employers, recent job changes). people_data_labs: 50 credits per record, SQL with exact matching. ',
    peopleSearchParameters,
    ['apollo', 'fullenrich', 'people_data_labs'],
    (ctx, p, block) => searchWith(ctx, p, block, PEOPLE_SEARCH)
  );

  tool(
    'firecrawl_enrich_people',
    'Enrich people',
    'Resolve known people to profiles: current title, employer, location, LinkedIn URL and recent work history. Each provider takes its own list of 1 to 50 people; results carry input_index into that list. ' +
      'fullenrich: 10 credits per match, LinkedIn URL or name plus company. apollo: 30 per match, takes apollo_id from people search, also returns a work email. people_data_labs: 50 per match, richest history. datalegion: 20 per match. Misses are free. ',
    peopleParameters,
    ['fullenrich', 'apollo', 'people_data_labs', 'datalegion'],
    enrichPeopleWith
  );

  tool(
    'firecrawl_enrich_contact_info',
    'Find contact details',
    'Find contact details for known people: work email, personal email or mobile number. Each provider takes its own list of 1 to 50 people; results carry input_index into that list. ' +
      'fullenrich: pick fields; work email 30 credits, personal email 100, mobile 300, per value found. datalegion: 100 per matched person, every field it has. apollo: 30 per match, work email, personal emails with reveal_personal_emails. ',
    contactParameters,
    ['fullenrich', 'datalegion', 'apollo'],
    contactsWith
  );

  tool(
    'firecrawl_enrich_company_search',
    'Find companies',
    'Find companies by industry, headcount, location, technology or founding year. ' +
      'apollo: 30 credits per page even when empty, name and description text, no industry or founding-year filter. fullenrich: 5 credits per record, the most filters. people_data_labs: 50 credits per record, SQL. ',
    companySearchParameters,
    ['apollo', 'fullenrich', 'people_data_labs'],
    (ctx, p, block) => searchWith(ctx, p, block, COMPANY_SEARCH)
  );

  tool(
    'firecrawl_enrich_company',
    'Enrich companies',
    'Resolve known companies to firmographics: industry, headcount, headquarters, founding year, funding and technologies. Each provider takes its own list of 1 to 50 companies; results carry input_index into that list. ' +
      'fullenrich: 10 credits per match, technologies, domain or LinkedIn URL only. apollo: 30 per match. people_data_labs: 50 per match, funding. datalegion: 20 per match. Misses are free. ',
    companyParameters,
    ['fullenrich', 'apollo', 'people_data_labs', 'datalegion'],
    enrichCompaniesWith
  );
}
