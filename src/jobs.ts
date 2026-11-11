/**
 * Job postings over Alexandria's jobs route (firecrawl/jobs/auto): one tool that
 * searches postings, reads posting URLs and lists a company's open roles. The
 * route picks the mode and the providers; this tool only carries the input.
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { type ContentResult, type McpRuntime, type ToolExecuteContext, UserError } from './mcp/runtime.js';
import {
  type AssertCredential,
  type GetClient,
  type SessionData,
  RETRYABLE,
  checkArguments,
  compact,
  dropSessionFields,
  isPlain,
  repair,
  str,
} from './enrich.js';
import { requestOrigin } from './origin';
import { relayExchangeError } from './tool-helpers.js';
import { withStructured } from './tool-output';

const JOBS_TIMEOUT_MS = 120_000;
const JOBS_MAX_LIMIT = 100;
const JOBS_MAX_URLS = 10;
const DEFAULT_MAX_CREDITS = 200;

const jobsParameters = z.strictObject({
  query: z.string().max(300).optional().describe('Job title or keywords, e.g. "data engineer". With company, the role to look for there.'),
  location: z.string().optional().describe('City, region or country, e.g. "Berlin" or "Canada".'),
  remote: z.boolean().optional().describe('true returns remote roles only.'),
  posted_within_days: z.number().int().min(1).max(365).optional().describe('Only postings the board dates within this many days, 1 to 365.'),
  company: z.string().optional().describe("Company name or domain, e.g. \"example.com\". Lists that company's open roles from its own job board."),
  url: z.string().optional().describe('One posting URL to read in full and check: whether it is still open, with its description.'),
  urls: z.array(z.string().min(1)).min(1).max(JOBS_MAX_URLS).optional().describe('Up to ' + JOBS_MAX_URLS + ' posting URLs to check in one call; each comes back with its status.'),
  limit: z.number().int().min(1).max(JOBS_MAX_LIMIT).optional().describe('Rows wanted, 1 to ' + JOBS_MAX_LIMIT + ', default 10.'),
  cursor: z.string().optional().describe('next_cursor from an earlier call with the same input, for more rows.'),
  max_credits: z
    .number()
    .int()
    .min(0)
    .max(10_000)
    .optional()
    .describe('Most credits the call may spend. Set it only to a budget the user gave; left out, it is ' + DEFAULT_MAX_CREDITS + '. A provider that could pass it is not started.'),
  provider: z.string().optional().describe('Ask only this provider, e.g. "indeed". Leave it out to let Firecrawl choose.'),
  group_by: z.enum(['employer']).optional().describe('"employer" groups the postings found by employer, to see who is hiring for a role.'),
  boards_only: z.boolean().optional().describe("true searches employers' own job boards only; every row is confirmed open on its board."),
  include_description: z.boolean().optional().describe('true adds the description to each list row. A single url always returns it.'),
});

const JOBS_EXAMPLE = { query: 'data engineer', location: 'Berlin', posted_within_days: 14 };
const JOBS_POINTER =
  'Give query (a role or keywords), company (a name or domain), or a posting url or urls. Examples: ' +
  [JOBS_EXAMPLE, { url: 'https://boards.greenhouse.io/example/jobs/1234567' }, { company: 'example.com' }].map((example) => JSON.stringify(example)).join('; ');

// The advertised schema forbids undeclared keys, so every field the route returns is
// named here; a key that is not named is dropped from the structured answer. Scalars
// are nullish so an absent value never fails a working call.
const text = (about?: string) => (about ? z.string().nullish().describe(about) : z.string().nullish());
const count = (about?: string) => (about ? z.number().nullish().describe(about) : z.number().nullish());

const jobRow = z.object({
  status: text('open: read from the employer\'s board or live posting page in this call. unverified: from a job site or index, not confirmed on the employer\'s board. For a posting checked by url also closed (the board no longer lists it), not_found (no such board or page) or error (could not tell).'),
  title: text(),
  company: text(),
  company_domain: text(),
  location: text(),
  remote: z.boolean().nullish(),
  employment_type: text(),
  posted_at: text('The posting date as the board states it.'),
  url: text(),
  apply_url: text(),
  source: text('The provider that returned the row.'),
  source_type: text('employer_board, employer_site, aggregator or index.'),
  board: text('vendor/handle of the job board, on employer_board rows.'),
  checked_at: text('ISO time Firecrawl read the posting.'),
  description: text('For a single url, or with include_description.'),
  salary: text(),
  requirements: text('For a posting read by url, when the board lists them separately.'),
  reason: text('Why a posting is closed, not_found, error or unverified.'),
});

const jobsResultSchema = z.object({
  mode: text('posting (url or urls), company, or market (a search by role and place).'),
  results: z.array(jobRow).optional().describe('Job postings, deduplicated; a posting from the employer\'s own board replaces the same one from a job site.'),
  count: count('Rows returned.'),
  next_cursor: text('Pass as cursor, with the same input, for more rows.'),
  employers: z
    .array(z.object({ company: text(), company_domain: text(), count: count('Postings found for this employer.'), postings: z.array(jobRow).optional() }))
    .optional()
    .describe('With group_by employer: the postings grouped by employer.'),
  boards: z
    .array(
      z.object({
        vendor: text(),
        handle: text(),
        name: text(),
        url: text(),
        covers: text('What part of the company this board lists.'),
        postings: count('Open postings on the board.'),
        newest_posted_at: text(),
        found_by: text('How the board was found: the careers page, a board lookup or a web search.'),
        primary: z.boolean().nullish(),
      })
    )
    .optional()
    .describe("Company mode: the company's job boards that were read."),
  resolution: z
    .object({
      status: text('resolved, cached, unresolved (no board found) or own_site (the company lists jobs on its own site).'),
      domain: text("The company's domain."),
      steps: z.array(z.object({ step: text(), outcome: text(), ms: count(), credits: count() })).optional().describe('Each step tried to find the board, with its outcome.'),
      careers_url: text(),
      fallback: text('market when the rows come from a search of job sites instead of a board.'),
    })
    .optional()
    .describe("Company mode: how the company's job board was found."),
  providers: z
    .array(
      z.object({
        name: text(),
        capability: text(),
        status: text('rows, empty, error or skipped.'),
        returned: count(),
        dropped: count('Rows left out because their own fields contradicted the request.'),
        credits: count(),
        credits_pending: count(),
        ms: count(),
        error: text(),
      })
    )
    .optional()
    .describe('Each provider call in order.'),
  credits: count('Credits charged by the call.'),
  credits_pending: count('The most that calls whose charge was not confirmed, such as a timeout, can still bill.'),
  stopped: text('Set when the call stopped early, e.g. max_credits when a provider was not started for the cap.'),
  notes: z.array(z.string()).optional().describe('Plain sentences about the answer, such as rows that come from job sites because no board was found.'),
});

const unavailable = () =>
  new UserError('jobs_search is not available yet on this deployment: its Firecrawl API does not serve job search (firecrawl/jobs/auto). Nothing was charged.', {
    code: 'jobs_search_unavailable',
  });

export function registerJobsTools(
  server: Pick<McpRuntime<SessionData>, 'addTool'>,
  getClient: GetClient,
  assertCredential: AssertCredential,
  canList: (session?: SessionData) => boolean
): void {
  server.addTool({
    name: 'jobs_search',
    annotations: { title: 'Search job postings', readOnlyHint: true, openWorldHint: true, destructiveHint: false },
    canList,
    description:
      'Find job postings and check whether a posting is still open. Use it to: find jobs by role and place (query, with location, remote or posted_within_days); read one posting by url and tell whether it is still open; check up to ' + JOBS_MAX_URLS + " posting urls in one call; list a company's open roles from its own job board (company, a name or domain; add query for one role there); and see who is hiring for a role (query with group_by \"employer\"). " +
      'Every row has the same normalized fields: title, company, location, remote, posted_at as the board states it, url, source, a status, and checked_at, the time Firecrawl read it. ' +
      "status is open when the posting was read from the employer's board or live posting page in this call, and unverified when it comes from a job site and was not confirmed on the employer's board. A posting checked by url can also be closed, not_found or error. " +
      'A single url returns the full description; list rows carry it with include_description. ' +
      "A company search names the boards it read and what each covers; when no board is found, rows come from job sites and notes says so. boards_only searches employers' own boards only. " +
      'Each provider read is charged its listed price; max_credits caps the call. ' +
      'Example: ' + JSON.stringify(JOBS_EXAMPLE) + '.',
    outputSchema: jobsResultSchema,
    parameters: jobsParameters,
    beforeValidate: (args: unknown = {}) => {
      if (isPlain(args)) {
        dropSessionFields(args);
        repair(jobsParameters, args);
        if (!Object.keys(args).length) throw new UserError('jobs_search finds job postings. ' + JOBS_POINTER, { code: 'invalid_input', example: JOBS_EXAMPLE });
        checkArguments('jobs_search', jobsParameters, args, JOBS_EXAMPLE);
        if (!str(args.query) && !str(args.company) && !str(args.url) && !args.urls)
          throw new UserError('jobs_search needs something to look for. ' + JOBS_POINTER, { code: 'invalid_input', example: JOBS_EXAMPLE });
      }
      return undefined;
    },
    execute: async (args: unknown, context: ToolExecuteContext<SessionData>): Promise<ContentResult> => {
      const { session, client: mcpClient } = context;
      const a = jobsParameters.parse(args);
      assertCredential(session);
      const client = getClient(session) as any;
      const requestId = randomUUID();
      const response = await relayExchangeError(
        (attempt) => {
          // A resend gets the time left, keeping the 5 s margin above the API's deadline.
          const timeout = Math.floor(Math.min(JOBS_TIMEOUT_MS, (attempt?.remainingMs ?? Infinity) - 5000));
          return client.http.post(
            '/v2/scrape',
            { alexandria: [{ provider: 'firecrawl', capability: 'jobs/auto', options: compact(a) }], origin: requestOrigin(mcpClient as any, session), timeout },
            { headers: { 'x-request-id': requestId }, timeoutMs: timeout + 5000 }
          );
        },
        // The API answers a repeat of this request id from its record, so a resend cannot run twice.
        { tool: 'jobs_search', requestId, providers: ['firecrawl'], resend: true, budgetMs: JOBS_TIMEOUT_MS + 5000 }
      ).catch((error: unknown) => {
        // An API without the route refuses the whole request before anything runs.
        throw error instanceof UserError && error.extras?.code === 'unknown_capability' ? unavailable() : error;
      });
      const entry = response?.data?.data?.alexandria?.[0];
      if (!isPlain(entry)) throw new Error('Unexpected response shape.');
      if (isPlain(entry.error)) {
        const code = str(entry.error.code);
        if (code === 'unknown_capability') throw unavailable();
        throw new UserError(str(entry.error.message) ?? 'Job search failed.', compact({ code, retryable: RETRYABLE.has(code ?? '') || undefined }));
      }
      return withStructured(JSON.stringify(entry.data), entry.data);
    },
  });
}
