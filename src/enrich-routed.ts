/**
 * people_company_enrich: looks up people and companies the caller already knows, by what the
 * caller wants back. Every lookup goes through the API's routing capability, which asks data
 * providers one at a time for each input, cheapest first, and charges only for what is found.
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { UserError } from './mcp/runtime.js';
import { relayExchangeError } from './tool-helpers.js';

const isPlain = (value: unknown): value is Record<string, any> => typeof value === 'object' && value !== null && !Array.isArray(value);
const has = (value: unknown) => typeof value === 'string' && value.trim() !== '';
const str = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
const num = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined);
const unique = <T>(values: (T | undefined)[]): T[] => [...new Set(values.filter((value): value is T => value !== undefined))];

function compact<T extends object>(record: T): T {
  return Object.fromEntries(Object.entries(record).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0))) as T;
}

// ---------- Input ----------

const text = (about: string) => z.string().optional().describe(about);

/** An input that needs every field of at least one set, checked at runtime and published as the same rule in its JSON Schema. */
function needsOneOf<S extends z.ZodRawShape>(shape: S, sets: string[][], message: string) {
  return z
    .strictObject(shape)
    .refine((r: Record<string, unknown>) => sets.some((set) => set.every((key) => has(r[key]))), { message })
    .meta({ anyOf: sets.map((required) => ({ required, properties: Object.fromEntries(required.map((key) => [key, { pattern: '\\S' }])) })) });
}

const person = needsOneOf(
  {
    name: text('Full name. Needs company_domain or company.'),
    first_name: text('Use with last_name instead of name.'),
    last_name: text('Use with first_name instead of name.'),
    company_domain: text('Employer domain, e.g. example.com.'),
    company: text('Employer name.'),
    linkedin_url: text('LinkedIn profile URL. Enough on its own.'),
    email: text('An email address of the person. Enough on its own.'),
    apollo_id: text('apollo_id from people_company_search. Enough on its own.'),
  },
  [['linkedin_url'], ['email'], ['apollo_id'], ['name', 'company_domain'], ['name', 'company'], ['first_name', 'last_name', 'company_domain'], ['first_name', 'last_name', 'company']],
  'Each person needs a linkedin_url, an email, an apollo_id, or a name (name, or first_name and last_name) with company_domain or company'
);

const company = needsOneOf(
  {
    domain: text('Company domain, e.g. example.com.'),
    linkedin_url: text('LinkedIn company URL.'),
    name: text('Company name. A name several companies share can come back as ambiguous.'),
  },
  [['domain'], ['linkedin_url'], ['name']],
  'Each company needs a domain, linkedin_url or name'
);

const WANT = ['profile', 'work_email', 'personal_email', 'mobile', 'funding'] as const;
type Want = (typeof WANT)[number];

/** Provider names as the caller writes them, with the slug the API knows each by. */
const PROVIDER_SLUG = {
  hunter: 'hunter',
  apollo: 'apollo',
  fullenrich: 'fullenrich',
  datalegion: 'datalegion',
  people_data_labs: 'people-data-labs',
} as const;
type ProviderName = keyof typeof PROVIDER_SLUG;
const PROVIDER_NAMES = Object.keys(PROVIDER_SLUG) as [ProviderName, ...ProviderName[]];
const providerName = (slug: string): string => PROVIDER_NAMES.find((name) => PROVIDER_SLUG[name] === slug) ?? slug;

const DEFAULT_MAX_CREDITS = 1000;
const MAX_INPUTS = 25;

export const lookupParameters = z
  .strictObject({
    people: z
      .array(person)
      .min(1)
      .max(MAX_INPUTS)
      .optional()
      .describe('People to look up, 1 to 25. Each needs a linkedin_url, an email, an apollo_id, or a name with company_domain or company.'),
    companies: z.array(company).min(1).max(MAX_INPUTS).optional().describe('Companies to look up, 1 to 25. Each needs a domain, linkedin_url or name.'),
    want: z
      .array(z.enum(WANT))
      .optional()
      .describe(
        'What to return. People: profile (the default), work_email, personal_email, mobile. Companies always return firmographics; funding adds total funding raised. A value that applies to neither list given is ignored.'
      ),
    max_credits: z
      .number()
      .int()
      .min(0)
      .default(DEFAULT_MAX_CREDITS)
      .describe('Most credits the whole call may spend. When it is used up the call returns what it has, and next holds the call that finishes the rest.'),
    providers: z
      .array(z.enum(PROVIDER_NAMES))
      .optional()
      .describe('Limits the call to these providers, asked in this order. Leave it out to have the cheapest provider that can answer asked first.'),
  })
  .refine((args) => args.people !== undefined || args.companies !== undefined, { message: 'Give people, companies or both' });

export type LookupArguments = z.infer<typeof lookupParameters>;
type PersonInput = NonNullable<LookupArguments['people']>[number];
type CompanyInput = NonNullable<LookupArguments['companies']>[number];

export const LOOKUP_EXAMPLE = {
  people: [{ name: 'Jane Doe', company_domain: 'example.com' }],
  companies: [{ domain: 'example.com' }],
  want: ['work_email', 'funding'],
};

export const LOOKUP_DESCRIPTION =
  'Look up and enrich people or companies you already know. Give people (each a linkedin_url, an email, an apollo_id, or a name with company_domain or company) and/or companies (each a domain, linkedin_url or name), and list what you want back in want. ' +
  'People: profile (the default: title, employer, LinkedIn URL, location), work_email, personal_email, mobile. Companies always return firmographics (industry, headcount, headquarters, founding year); add funding for total funding raised. ' +
  'You do not choose data providers: for each input the cheapest provider that can answer is asked first, then the next one when it finds nothing, and only what is found is charged. ' +
  'max_credits is the most the whole call may spend (default 1000): when it is used up the call returns what it has, and next holds the call that finishes the rest. ' +
  'Each row has a status (found, not_found, pending, unresolved, or ambiguous for a company match that could not be confirmed, with its candidates), served_by and credits; missing lists wanted values no provider had. ' +
  'providers (optional) limits the call to those providers, in that order. ' +
  'Example: ' + JSON.stringify(LOOKUP_EXAMPLE);

// ---------- Argument repair ----------

const PROVIDER_BLOCKS = ['apollo', 'fullenrich', 'people_data_labs', 'datalegion'];
const LINKEDIN_ALIASES = ['professional_network_url', 'social_url', 'profile'];
const PERSON_ALIASES = [['full_name', 'name'], ['domain', 'company_domain'], ...LINKEDIN_ALIASES.map((alias) => [alias, 'linkedin_url'])];
const COMPANY_ALIASES = [['website', 'domain'], ...LINKEDIN_ALIASES.map((alias) => [alias, 'linkedin_url'])];

/** One item as a list of one, and each item's near-miss field names as the names the tool takes. A name already given is left alone. */
function repairList(args: Record<string, any>, key: 'people' | 'companies', aliases: string[][]): void {
  if (isPlain(args[key])) args[key] = [args[key]];
  if (!Array.isArray(args[key])) return;
  for (const item of args[key]) {
    if (!isPlain(item)) continue;
    for (const [alias, name] of aliases) {
      if (item[alias] === undefined || item[name] !== undefined) continue;
      item[name] = item[alias];
      delete item[alias];
    }
  }
}

/**
 * Repairs near-miss shapes in place before validation: contact_fields as want values, a single
 * person or company as a list of one, and the field names other lookups use for the same thing.
 * A call that still carries a provider block is refused: the tool takes what is wanted, not who to ask.
 */
export function repairLookup(args: Record<string, any>): void {
  if (args.contact_fields !== undefined) {
    args.want = unique([args.want, args.contact_fields].flatMap((value) => (value === null ? [] : value)));
    delete args.contact_fields;
  }
  repairList(args, 'people', PERSON_ALIASES);
  repairList(args, 'companies', COMPANY_ALIASES);

  const blocks = PROVIDER_BLOCKS.filter((key) => key in args);
  if (!blocks.length) return;
  const given = (key: 'people' | 'companies') => args[key] !== undefined || blocks.some((block) => isPlain(args[block]) && args[block][key] !== undefined);
  const want = Array.isArray(args.want) ? args.want.filter((value: unknown) => WANT.includes(value as Want)) : [];
  const example = compact({
    people: given('people') || !given('companies') ? LOOKUP_EXAMPLE.people : undefined,
    companies: given('companies') ? LOOKUP_EXAMPLE.companies : undefined,
    want,
  });
  const message = 'this tool takes people or companies and what you want back in want, not a block per provider. Firecrawl picks the providers';
  throw new UserError('Invalid people_company_enrich arguments. ' + blocks.join(', ') + ': ' + message + '. Example: ' + JSON.stringify(example), {
    code: 'invalid_input',
    issues: blocks.map((path) => ({ path, message })),
    example,
  });
}

// ---------- Routing calls ----------

type Find = 'person' | 'work_email' | 'personal_email' | 'phone' | 'company';

/** What one routing call reports for one subject. */
interface Routed {
  input_index?: number;
  status?: string;
  served_by?: string;
  email?: string;
  phone?: string;
  verification?: { status?: string };
  advice?: string;
  record?: Record<string, unknown>;
  tried?: { provider?: string; credits?: number }[];
}

/** How the lookup of one value for one input ended. */
type State = 'found' | 'missed' | 'pending' | 'budget' | 'provider_error' | 'no_provider';
type Outcome = Routed & { state: State };

const STATE: Record<string, State> = {
  hit: 'found',
  miss: 'missed',
  pending: 'pending',
  budget_exhausted: 'budget',
  stopped: 'provider_error',
  error: 'provider_error',
  no_provider: 'no_provider',
};

export interface LookupContext {
  client: any;
  origin: string;
  tool: string;
}

interface Run {
  ctx: LookupContext;
  /** The most the whole call may spend, and what its routing calls have spent so far. */
  budget: number;
  spent: number;
  /** The caller's providers as API slugs, when given. */
  providers?: string[];
  /** Routing calls that returned results. */
  completed: number;
  /** The error of a routing request that failed as a whole; nothing is sent after it. */
  failure?: unknown;
}

/** A routing call can run for close to three minutes, so its request timeout is set here rather than left to the client's default. */
const ROUTING_TIMEOUT_MS = 300_000;

/**
 * One routing call for these subjects with what is left of the budget, answered as one outcome per
 * subject in order. Nothing is sent once the budget is used up or after a request failed as a whole.
 */
async function find(run: Run, value: Find, subjects: object[], providers = run.providers): Promise<Outcome[]> {
  const all = (state: State): Outcome[] => subjects.map(() => ({ state }));
  if (run.failure !== undefined) return all('provider_error');
  const left = run.budget - run.spent;
  if (left <= 0) return all('budget');
  const requestId = randomUUID();
  let data: { results: Routed[]; providerCredits?: unknown };
  try {
    const response = await relayExchangeError(
      () =>
        run.ctx.client.http.post(
          '/v2/scrape',
          {
            alexandria: [{ provider: 'firecrawl', capability: 'enrich/waterfall', options: compact({ find: value, subjects, providers, max_credits: left }) }],
            origin: run.ctx.origin,
          },
          { headers: { 'x-request-id': requestId }, timeoutMs: ROUTING_TIMEOUT_MS }
        ),
      // The API answers a repeat of this request id from its record, so a resend cannot run twice.
      { tool: run.ctx.tool, requestId, providers: ['firecrawl'], resend: true }
    );
    const entry = response?.data?.data?.alexandria?.[0];
    if (entry?.error) {
      const { code, message, nextTool, requiresAction } = entry.error;
      throw new UserError(str(message) ?? 'The lookup failed.', compact({ code: str(code) ?? 'request_failed', nextTool, requiresAction }));
    }
    if (!Array.isArray(entry?.data?.results)) throw new Error('Unexpected response shape.');
    data = entry.data;
  } catch (error) {
    if ((error as any)?.response?.status === 401) throw error;
    run.failure = error;
    return all('provider_error');
  }
  run.completed += 1;
  run.spent += num(data.providerCredits) ?? 0;
  return subjects.map((_, index) => {
    const result = data.results.find((item) => item?.input_index === index) ?? {};
    return { ...result, state: STATE[result.status ?? ''] ?? 'provider_error' };
  });
}

/** What a request that failed as a whole said, once one has. */
const refusalOf = (run: Run): string | undefined =>
  run.failure === undefined ? undefined : run.failure instanceof Error ? run.failure.message : String(run.failure);

// ---------- Rows ----------

type Status = 'found' | 'not_found' | 'pending' | 'unresolved' | 'ambiguous';
type Row = Record<string, unknown> & { input_index: number; status: Status };
/** A row, and the states its unfinished lookups stopped in. */
type Built = { row: Row; open: State[] };

const REASONS = ['budget', 'provider_error', 'no_provider'] as const;
const isOpen = (state: State) => state === 'pending' || REASONS.some((reason) => reason === state);

/** found needs a value and nothing left open; a provider still running comes before a lookup that did not finish. */
function statusOf(states: State[]): { status: Status; reason?: (typeof REASONS)[number] } {
  if (states.includes('pending')) return { status: 'pending' };
  const reason = REASONS.find((state) => states.includes(state));
  if (reason) return { status: 'unresolved', reason };
  return { status: states.includes('found') ? 'found' : 'not_found' };
}

const triedBy = (outcome: Outcome) => unique((outcome.tried ?? []).map((attempt) => str(attempt?.provider)));

/** The fields every row ends with: who served it, what its lookups cost, anything to say, and who was asked when it is not found. */
function rowEnd(status: Status, outcomes: Outcome[], served: (string | undefined)[], notes: (string | undefined)[]) {
  return {
    served_by: unique(served).map(providerName),
    credits: outcomes.flatMap((outcome) => outcome.tried ?? []).reduce((sum, attempt) => sum + (num(attempt?.credits) ?? 0), 0),
    note: unique(notes).join(' ') || undefined,
    tried: status === 'found' ? undefined : unique(outcomes.flatMap(triedBy)).map(providerName),
  };
}

// ---------- People ----------

const PERSON_FIELDS = ['name', 'title', 'company', 'company_domain', 'location', 'linkedin_url', 'work_email', 'email_status', 'personal_email', 'mobile'] as const;
type PersonWant = Exclude<Want, 'funding'>;
const PERSON_FINDS: [PersonWant, Find][] = [
  ['profile', 'person'],
  ['work_email', 'work_email'],
  ['personal_email', 'personal_email'],
  ['mobile', 'phone'],
];

function personRow(input_index: number, lookups: [PersonWant, Outcome][]): Built {
  const outcomes = lookups.map(([, outcome]) => outcome);
  const hits = lookups.filter(([, outcome]) => outcome.state === 'found');
  const values: Partial<Record<(typeof PERSON_FIELDS)[number], string>> = {};
  // The value a contact lookup found comes first, then each record fills what is still empty.
  for (const [want, hit] of hits) {
    if (want === 'work_email') {
      values.work_email = str(hit.email) ?? str(hit.record?.work_email);
      values.email_status = str(hit.verification?.status) ?? str(hit.record?.email_status);
    }
    if (want === 'personal_email') values.personal_email = str(hit.email) ?? str(hit.record?.personal_email);
    if (want === 'mobile') values.mobile = str(hit.phone) ?? str(hit.record?.mobile);
  }
  for (const [, hit] of hits) {
    const record = hit.record ?? {};
    for (const key of PERSON_FIELDS) if (key !== 'email_status') values[key] ??= str(record[key]);
    // A record's email status describes that record's own work email.
    if (values.work_email && values.work_email === str(record.work_email)) values.email_status ??= str(record.email_status);
  }
  const states = outcomes.map((outcome) => outcome.state);
  const { status, reason } = statusOf(states);
  const row = compact({
    input_index,
    status,
    reason,
    ...Object.fromEntries(PERSON_FIELDS.map((key) => [key, values[key]])),
    missing: lookups.filter(([, outcome]) => outcome.state === 'missed').map(([want]) => want),
    ...rowEnd(status, outcomes, hits.map(([, hit]) => hit.served_by), outcomes.map((outcome) => str(outcome.advice))),
  });
  return { row, open: states.filter(isOpen) };
}

/** One routing call per wanted value, in order, for all people; a profile's identifiers go into the later calls. */
async function lookupPeople(run: Run, people: PersonInput[], want: Set<Want>): Promise<Built[]> {
  const wanted = PERSON_FINDS.filter(([value]) => want.has(value));
  const finds = wanted.length ? wanted : PERSON_FINDS.slice(0, 1);
  const subjects: object[] = people.map((p) =>
    compact({ full_name: p.name, first_name: p.first_name, last_name: p.last_name, domain: p.company_domain, company: p.company, linkedin_url: p.linkedin_url, email: p.email, apollo_id: p.apollo_id })
  );
  const results: Outcome[][] = [];
  for (const [value, kind] of finds) {
    const outcomes = await find(run, kind, subjects);
    results.push(outcomes);
    if (value !== 'profile') continue;
    outcomes.forEach((outcome, index) => {
      // What the caller gave stays; the profile only adds what was missing.
      subjects[index] = { ...compact({ linkedin_url: str(outcome.record?.linkedin_url), domain: str(outcome.record?.company_domain) }), ...subjects[index] };
    });
  }
  return people.map((_, index) => personRow(index, finds.map(([value], call): [PersonWant, Outcome] => [value, results[call][index]])));
}

// ---------- Companies ----------

const COMPANY_FIELDS = ['name', 'domain', 'linkedin_url', 'industry', 'employees', 'employees_range', 'hq', 'founded', 'funding_total_usd', 'description'] as const;
type CompanyField = (typeof COMPANY_FIELDS)[number];
type CompanyRecord = Partial<Record<CompanyField, string | number>>;
const COMPANY_NUMBERS: CompanyField[] = ['employees', 'founded', 'funding_total_usd'];
const DESCRIPTION_LENGTH = 160;

const COMPANY_PROVIDERS = ['fullenrich', 'apollo', 'datalegion', 'people-data-labs'];
/** The providers that carry total funding: asked first when funding is wanted, and asked again for a company still without it. */
const FUNDING_PROVIDERS = ['people-data-labs', 'apollo'];
const FUNDING_FIRST = [...FUNDING_PROVIDERS, 'fullenrich', 'datalegion'];

const ANOTHER_MATCH = 'Another company also matched this input and was not returned.';
const UNCONFIRMED = 'before this match could be confirmed';
const NO_FUNDING = 'before funding was looked up';

/** Why a follow-up lookup was not made, as a note for the row it was for. */
function cutShort(run: Run, outcome: Outcome, what: string): string | undefined {
  if (outcome.state === 'budget') return 'max_credits ran out ' + what + '.';
  const refusal = refusalOf(run);
  return outcome.state === 'provider_error' && refusal ? 'A request failed ' + what + ': ' + refusal : undefined;
}

function companyRecord(record: Record<string, unknown> = {}): CompanyRecord {
  return compact(
    Object.fromEntries(
      COMPANY_FIELDS.map((key) => [key, COMPANY_NUMBERS.includes(key) ? num(record[key]) : key === 'description' ? str(record[key])?.slice(0, DESCRIPTION_LENGTH) : str(record[key])])
    )
  );
}

const companyValues = (record: CompanyRecord) => Object.fromEntries(COMPANY_FIELDS.map((key) => [key, record[key]]));

/** Lowercased, with everything except letters and digits removed. */
const norm = (value: unknown) => (str(value) ?? '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

const hostOf = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/?#].*$/, '');

const linkedInKey = (value: unknown) =>
  str(value)
    ?.toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^[a-z]{2,3}\./, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');

/**
 * Whether a returned company is plainly the one asked for. The label is the first label of the input's
 * domain, or its name when there is no domain: the match is strong when the returned name starts with the
 * label, or the label starts with the first word of the returned name. Anything else is weak, since several
 * companies can list the same domain or share a name.
 */
function isStrong(input: CompanyInput, record: CompanyRecord): boolean {
  const label = norm(has(input.domain) ? hostOf(input.domain as string).split('.')[0] : input.name);
  if (!label) return false;
  const firstWord = norm(str(record.name)?.split(/\s+/)[0]);
  return norm(record.name).startsWith(label) || (firstWord.length >= 3 && label.startsWith(firstWord));
}

function sameCompany(a: CompanyRecord, b: CompanyRecord): boolean {
  const url = linkedInKey(a.linkedin_url);
  const name = norm(a.name);
  return (url !== undefined && url === linkedInKey(b.linkedin_url)) || (name !== '' && name === norm(b.name));
}

/** The first record, with its empty fields taken from the second. */
const filled = (first: CompanyRecord, second: CompanyRecord): CompanyRecord => ({ ...second, ...first });
const adds = (first: CompanyRecord, second: CompanyRecord) => Object.keys(second).some((key) => !(key in first));

/** A company that matched an input without being confirmed, and the provider that returned it. */
interface Candidate {
  record: CompanyRecord;
  served_by?: string;
}

/** An ambiguous row lists this many of its candidates. */
const CANDIDATES_LISTED = 3;

interface CompanyResult {
  /** Every lookup made for this company. */
  outcomes: Outcome[];
  accepted?: CompanyRecord;
  /** Every distinct company that matched while none was confirmed, in the order returned. */
  candidates: Candidate[];
  /** The providers the accepted record came from. */
  served: (string | undefined)[];
  notes: (string | undefined)[];
}

/**
 * Judges one hit for a company that has no accepted record yet. A hit the input plainly names is accepted,
 * filled from an earlier candidate that is the same company. A hit that is the same company as an earlier
 * candidate confirms that candidate, which is accepted and filled from the hit. Any other hit becomes a candidate.
 * An accepted record carries a note when a different company had matched as well.
 */
function judge(result: CompanyResult, input: CompanyInput, outcome: Outcome): void {
  const record = companyRecord(outcome.record);
  const earlier = result.candidates.find((candidate) => sameCompany(candidate.record, record));
  if (has(input.linkedin_url) || isStrong(input, record)) {
    result.accepted = earlier ? filled(record, earlier.record) : record;
    result.served = [earlier?.served_by, outcome.served_by];
  } else if (earlier) {
    result.accepted = filled(earlier.record, record);
    result.served = [earlier.served_by, adds(earlier.record, record) ? outcome.served_by : undefined];
  } else {
    result.candidates.push({ record, served_by: outcome.served_by });
    return;
  }
  if (result.candidates.some((candidate) => candidate !== earlier)) result.notes.push(ANOTHER_MATCH);
}

/** Each group of companies that share a provider list, keyed by the list. */
function groupByProviders(lists: Map<number, string[]>): [string[], number[]][] {
  const groups = new Map<string, number[]>();
  for (const [index, providers] of lists) groups.set(providers.join(','), [...(groups.get(providers.join(',')) ?? []), index]);
  return [...groups].map(([key, indexes]) => [key.split(','), indexes]);
}

/**
 * Firmographics for every company in one routing call. A match the input does not plainly name is asked
 * for again at the providers not yet asked, until one of them settles it or none is left, and when funding
 * is wanted a company still without it is asked for again at the providers that carry it.
 */
async function lookupCompanies(run: Run, companies: CompanyInput[], funding: boolean): Promise<Built[]> {
  const subjects = companies.map((c) => compact({ domain: c.domain, linkedin_url: c.linkedin_url, company: c.name }));
  const first = await find(run, 'company', subjects, run.providers ?? (funding ? FUNDING_FIRST : undefined));
  const results: CompanyResult[] = first.map((outcome) => ({ outcomes: [outcome], candidates: [], served: [], notes: [] }));

  // Each company whose match is not settled, with the providers not yet asked for it.
  let unsettled = new Map<number, string[]>();
  first.forEach((outcome, index) => {
    if (outcome.state !== 'found') return;
    judge(results[index], companies[index], outcome);
    const remaining = (run.providers ?? COMPANY_PROVIDERS).filter((provider) => !triedBy(outcome).includes(provider));
    if (!results[index].accepted && remaining.length) unsettled.set(index, remaining);
  });
  // A routing call stops at its first hit, so each round asks the providers the last one did not reach.
  while (unsettled.size) {
    const round = groupByProviders(unsettled);
    unsettled = new Map();
    for (const [providers, group] of round) {
      const outcomes = await find(run, 'company', group.map((index) => subjects[index]), providers);
      outcomes.forEach((outcome, position) => {
        const index = group[position];
        const result = results[index];
        result.outcomes.push(outcome);
        result.notes.push(cutShort(run, outcome, UNCONFIRMED));
        if (outcome.state === 'found') judge(result, companies[index], outcome);
        const remaining = providers.filter((provider) => !triedBy(outcome).includes(provider));
        // A call that asked no provider leaves none that can be asked.
        if (!result.accepted && outcome.state !== 'budget' && remaining.length && remaining.length < providers.length) unsettled.set(index, remaining);
      });
    }
  }

  if (funding) {
    const unfunded = new Map<number, string[]>();
    results.forEach(({ accepted, outcomes }, index) => {
      if (!accepted || accepted.funding_total_usd !== undefined) return;
      if (!accepted.linkedin_url && !accepted.domain) return;
      // A provider is left out when it returned this company, which came without funding, or when it was already asked with the identifier this lookup sends.
      const returned = outcomes.filter((outcome) => outcome.state === 'found' && sameCompany(accepted, companyRecord(outcome.record))).map((outcome) => outcome.served_by);
      const input = companies[index];
      const repeats = accepted.linkedin_url
        ? linkedInKey(input.linkedin_url) === linkedInKey(accepted.linkedin_url)
        : has(input.domain) && hostOf(input.domain as string) === hostOf(String(accepted.domain));
      const asked = repeats ? outcomes.flatMap(triedBy) : [];
      const providers = FUNDING_PROVIDERS.filter((provider) => !returned.includes(provider) && !asked.includes(provider) && (!run.providers || run.providers.includes(provider)));
      if (providers.length) unfunded.set(index, providers);
    });
    for (const [providers, group] of groupByProviders(unfunded)) {
      const known = group.map((index) => {
        const { linkedin_url, domain } = results[index].accepted as CompanyRecord;
        return linkedin_url ? { linkedin_url } : { domain };
      });
      const outcomes = await find(run, 'company', known, providers);
      outcomes.forEach((outcome, position) => {
        const result = results[group[position]];
        const accepted = result.accepted as CompanyRecord;
        result.outcomes.push(outcome);
        result.notes.push(cutShort(run, outcome, NO_FUNDING));
        if (outcome.state !== 'found') return;
        const record = companyRecord(outcome.record);
        if (!sameCompany(accepted, record)) return;
        if (adds(accepted, record)) result.served.push(outcome.served_by);
        result.accepted = filled(accepted, record);
      });
    }
  }

  return results.map((result, input_index) => {
    const { accepted, outcomes } = result;
    const candidates = accepted ? [] : result.candidates.slice(0, CANDIDATES_LISTED);
    const { status, reason } = accepted ? { status: 'found' as const } : candidates.length ? { status: 'ambiguous' as const } : statusOf([outcomes[0].state]);
    const row = compact({
      input_index,
      status,
      reason,
      ...(accepted ? companyValues(accepted) : {}),
      candidates: candidates.map(({ record }) => compact(companyValues(record))),
      missing: funding && accepted && accepted.funding_total_usd === undefined ? ['funding'] : undefined,
      ...rowEnd(status, outcomes, accepted ? result.served : candidates.map((candidate) => candidate.served_by), result.notes),
    });
    return { row, open: accepted || candidates.length ? [] : [outcomes[0].state].filter(isOpen) };
  });
}

// ---------- The call ----------

const NEXT_NOTES: [State, string][] = [
  ['budget', 'max_credits ran out before these inputs finished; raise it to finish them, and ask the user first if the user set the budget.'],
  ['pending', 'A provider is still working; call again in about a minute.'],
  ['provider_error', 'A provider failed for these inputs; calling again may succeed.'],
  ['no_provider', 'No provider could be asked for these inputs; give another identifier or leave out providers.'],
];

/** Runs the lookups one routing call at a time against one budget: people first, then companies. */
export async function runLookup(ctx: LookupContext, args: LookupArguments) {
  const want = new Set(args.want);
  // An empty providers list limits nothing, like one left out.
  const providers = args.providers?.length ? args.providers.map((name) => PROVIDER_SLUG[name]) : undefined;
  const run: Run = { ctx, budget: args.max_credits, spent: 0, providers, completed: 0 };
  const people = args.people ? await lookupPeople(run, args.people, want) : undefined;
  const companies = args.companies ? await lookupCompanies(run, args.companies, want.has('funding')) : undefined;
  // A request refused before anything came back is the call's own failure.
  if (run.failure !== undefined && run.completed === 0) throw run.failure;

  const built = [...(people ?? []), ...(companies ?? [])];
  const count = (status: Status) => built.filter(({ row }) => row.status === status).length;
  const open = new Set(built.flatMap((entry) => entry.open));
  const unfinished = <T>(rows: Built[] | undefined, inputs: T[] | undefined) => inputs?.filter((_, index) => rows?.[index].open.length);
  const refusal = refusalOf(run);
  return compact({
    people: people?.map(({ row }) => row),
    companies: companies?.map(({ row }) => row),
    summary: {
      found: count('found'),
      not_found: count('not_found'),
      pending: count('pending'),
      unresolved: count('unresolved'),
      ambiguous: count('ambiguous'),
      credits: run.spent,
      max_credits: run.budget,
    },
    next: open.size
      ? {
          tool: 'people_company_enrich',
          arguments: compact({ people: unfinished(people, args.people), companies: unfinished(companies, args.companies), want: args.want, providers: args.providers }),
          note: [...NEXT_NOTES.filter(([state]) => open.has(state)).map(([, note]) => note), refusal ? 'The request that failed said: ' + refusal : undefined].filter(Boolean).join(' '),
        }
      : undefined,
  });
}

// ---------- Output ----------

const STATUSES = ['found', 'not_found', 'pending', 'unresolved', 'ambiguous'] as const;
const value = () => z.string().optional();

const rowStart = {
  input_index: z.number().int().describe('Position of the input in its list, from 0.'),
  status: z
    .enum(STATUSES)
    .describe('found; not_found: no provider had it; pending: a provider is still working; unresolved: not finished, see reason; ambiguous: a company match that could not be confirmed, see candidates.'),
  reason: z.enum(REASONS).optional().describe('Why an unresolved row is not finished: max_credits ran out, a provider failed, or no provider could be asked.'),
};

const rowFinish = {
  missing: z.array(z.string()).optional().describe('Wanted values no provider had.'),
  served_by: z.array(z.string()).optional().describe('Providers that served a value for this row.'),
  credits: z.number().optional().describe("Credits this row's lookups cost."),
  note: z.string().optional(),
  tried: z.array(z.string()).optional().describe('Providers asked, on a row that is not found.'),
};

const companyFields = {
  name: value(),
  domain: value(),
  linkedin_url: value(),
  industry: value(),
  employees: z.number().optional(),
  employees_range: value(),
  hq: value(),
  founded: z.number().optional(),
  funding_total_usd: z.number().optional().describe('Total funding raised, in US dollars.'),
  description: value().describe('Cut to 160 characters.'),
};

export const lookupOutputSchema = z.object({
  people: z
    .array(
      z.object({
        ...rowStart,
        name: value(),
        title: value(),
        company: value(),
        company_domain: value(),
        location: value(),
        linkedin_url: value(),
        work_email: value(),
        email_status: value().describe('Verification status of work_email.'),
        personal_email: value(),
        mobile: value(),
        ...rowFinish,
      })
    )
    .optional()
    .describe('One row per input person, in input order.'),
  companies: z
    .array(
      z.object({
        ...rowStart,
        ...companyFields,
        candidates: z.array(z.object(companyFields)).optional().describe('On an ambiguous row: the companies that matched, none confirmed. At most ' + CANDIDATES_LISTED + ' are listed.'),
        ...rowFinish,
      })
    )
    .optional()
    .describe('One row per input company, in input order.'),
  summary: z
    .object({
      found: z.number(),
      not_found: z.number(),
      pending: z.number(),
      unresolved: z.number(),
      ambiguous: z.number(),
      credits: z.number().describe('Credits the whole call spent.'),
      max_credits: z.number(),
    })
    .describe('Rows by status across both lists, and what the call spent.'),
  next: z
    .object({
      tool: z.string(),
      arguments: z.object({
        people: z.array(z.looseObject({})).optional(),
        companies: z.array(z.looseObject({})).optional(),
        want: z.array(z.string()).optional(),
        providers: z.array(z.string()).optional(),
      }),
      note: z.string().describe('Why these inputs are not finished, and when to call.'),
    })
    .optional()
    .describe('Present when a row is pending or unresolved: the same call narrowed to those inputs.'),
});
