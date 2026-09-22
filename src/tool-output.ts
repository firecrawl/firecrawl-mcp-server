/**
 * Declared tool output: schemas plus the helpers that attach structured
 * content to a result.
 *
 * Every registered tool declares an `outputSchema` so a client — and the model
 * behind it — knows the shape of a result before it calls the tool. MCP asks a
 * tool that declares one to return `structuredContent` next to the text block,
 * so the helpers here attach the structured payload without touching the text
 * a tool already returned: existing clients keep reading the exact same string.
 *
 * Two fastmcp behaviours shape the schemas below.
 *
 * 1. fastmcp advertises an output schema through `strictJsonSchema`, which
 *    sets `additionalProperties: false` on every object it emits. A schema
 *    therefore has to name each top-level key the tool can return.
 * 2. fastmcp validates `structuredContent` against the schema and keeps the
 *    parsed value, so a key the schema does not name is dropped from the
 *    structured payload. The text block still carries the whole response.
 *
 * So these schemas name the documented keys and leave the value of anything
 * that passes through from the Firecrawl API unconstrained (`z.unknown()`,
 * which advertises as `{}` and accepts any shape). Only fields whose scalar
 * type is part of the API contract are typed: a wrong guess would fail
 * validation at runtime and turn a working call into an error.
 */

import { z } from 'zod';
import type { ContentResult } from 'fastmcp';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Keep `text` exactly as the tool produced it and attach `data` as structured
 * content. A payload that is not a JSON object (MCP requires an object here)
 * is returned as text alone.
 */
export function withStructured(text: string, data: unknown): ContentResult {
  return isRecord(data)
    ? { content: [{ type: 'text', text }], structuredContent: data }
    : { content: [{ type: 'text', text }] };
}

/** Pretty-printed JSON text — the shape `asText` has always returned — plus structured content. */
export function structuredText(data: unknown): ContentResult {
  return withStructured(JSON.stringify(data, null, 2), data);
}

/** Compact JSON text — the shape `compactText` has always returned — plus structured content. */
export function structuredCompact(data: unknown): ContentResult {
  return withStructured(JSON.stringify(data), data);
}

/** For a payload the caller already serialized: reuse the JSON as structured content. */
export function structuredJsonText(text: string): ContentResult {
  try {
    return withStructured(text, JSON.parse(text));
  } catch {
    return { content: [{ type: 'text', text }] };
  }
}

// --- shared fragments -------------------------------------------------------

const success = z
  .boolean()
  .optional()
  .describe('Whether the API call succeeded.');
const error = z
  .unknown()
  .optional()
  .describe('Error message or error object when the call did not succeed.');
const warning = z
  .string()
  .optional()
  .describe('Non-fatal warning about the result.');

/** Keys every Alexandria-capable response can carry (see `alexandriaOutput`). */
const alexandriaEnvelope = {
  requestId: z
    .string()
    .optional()
    .describe('Identifier of this logical execution; reuse it only for a retry of the identical payload.'),
  scrape_id: z.string().optional().describe('Identifier of the underlying scrape.'),
  receipt: z.unknown().optional().describe('Billing receipt for the execution.'),
  creditsCost: z.number().optional().describe('Credits this call consumed.'),
  delivery: z
    .string()
    .optional()
    .describe('`retained` when the full result stayed server-side instead of being inlined.'),
  responseBytes: z.number().optional().describe('Size of the full result in bytes.'),
  estimatedTokens: z.number().optional().describe('Estimated token cost of the full result.'),
  tokenEstimateMethod: z.string().optional().describe('How `estimatedTokens` was derived.'),
  inlineTokenBudget: z.number().optional().describe('Token budget above which a result is retained rather than inlined.'),
  workspaceId: z.string().optional().describe('Workspace holding a retained result, for inspection through virtual Bash.'),
  idleTtlSeconds: z.number().optional().describe('Seconds a retained workspace stays available while idle.'),
  message: z.string().optional().describe('Guidance that accompanies the result.'),
  nextTool: z
    .unknown()
    .optional()
    .describe('A follow-up tool call (`{name, arguments}`) that continues or inspects this result.'),
  feedbackTool: z
    .unknown()
    .optional()
    .describe('Pointer to the feedback tool for reporting how this result served the task.'),
};

// --- src/index.ts tools -----------------------------------------------------

export const scrapeOutputSchema = z
  .object({
    // URL mode: the scraped document, with the formats that were requested.
    markdown: z.string().optional().describe('Page content as markdown.'),
    html: z.string().optional().describe('Processed HTML of the page.'),
    rawHtml: z.string().optional().describe('Unprocessed HTML of the page.'),
    summary: z.string().optional().describe('Summary of the page content.'),
    links: z.unknown().optional().describe('Links found on the page.'),
    screenshot: z.unknown().optional().describe('Screenshot of the page.'),
    images: z.unknown().optional().describe('Images found on the page.'),
    audio: z.unknown().optional().describe('Audio extracted from the page.'),
    video: z.unknown().optional().describe('Video extracted from the page.'),
    answer: z.string().optional().describe('Targeted answer to the question that was asked of the page.'),
    highlights: z.unknown().optional().describe('Highlighted passages from the page.'),
    pages: z.unknown().optional().describe('Physical PDF pages, when `parsers[].pages` is set.'),
    blocks: z.unknown().optional().describe('Typed PDF layout blocks, when `parsers[].blocks` is set.'),
    product: z.unknown().optional().describe('Product data extracted from the page.'),
    menu: z.unknown().optional().describe('Menu data extracted from the page.'),
    json: z.unknown().optional().describe('Structured data matching the requested JSON schema or prompt.'),
    attributes: z.unknown().optional().describe('Values collected by the requested attribute selectors.'),
    actions: z.unknown().optional().describe('Results of the browser actions that ran during the scrape.'),
    changeTracking: z.unknown().optional().describe('Change-tracking comparison against the previous scrape.'),
    branding: z.unknown().optional().describe('Branding data extracted from the page.'),
    metadata: z
      .unknown()
      .optional()
      .describe('Page metadata; authenticated responses can include `metadata.scrapeId` for scrape feedback.'),
    tools: z
      .unknown()
      .optional()
      .describe('Domain-matched Alexandria tools for the page, when `domainTools` is set.'),
    warning,
    // Alexandria mode and error envelopes.
    success,
    error,
    data: z
      .unknown()
      .optional()
      .describe('Alexandria mode: per-capability results in `data.alexandria`, each with `data`, `records`, or an `error`.'),
    ...alexandriaEnvelope,
  })
  .describe('A scraped document, or the Alexandria execution envelope when `alexandria` was passed.');

export const mapOutputSchema = z
  .object({
    links: z.unknown().optional().describe('URLs discovered under the website.'),
    success,
    error,
    warning,
    id: z.string().optional().describe('Identifier of the map run, for optional map feedback.'),
  })
  .describe('URLs indexed under the requested website.');

export const searchOutputSchema = z
  .object({
    success,
    data: z
      .unknown()
      .optional()
      .describe('Ranked results grouped by source, such as `web`, `news`, `images`, and `alexandria`.'),
    error,
    warning,
    id: z.string().optional().describe('Search identifier, for optional `firecrawl_search_feedback`.'),
    creditsUsed: z.number().optional().describe('Credits this search consumed.'),
    tools: z.unknown().optional().describe('Domain-matched Alexandria tools for the results.'),
    nextTool: z.unknown().optional().describe('A follow-up tool call that continues this search.'),
    feedbackTool: z.unknown().optional().describe('Pointer to the feedback tool for this search.'),
  })
  .describe('Ranked search results grouped by source.');

export const findToolsOutputSchema = z
  .object({
    success,
    data: z
      .unknown()
      .optional()
      .describe('Discovery page in `data.alexandria[0].data`, with `level`, `items`, `total`, and an optional `nextTool`.'),
    error,
    ...alexandriaEnvelope,
  })
  .describe('One page of the Alexandria catalogue: categories, providers, tools, or one contract.');

export const feedbackOutputSchema = z
  .object({
    success,
    error,
    status: z.number().optional().describe('HTTP status when the submission was rejected.'),
    feedbackErrorCode: z.string().optional().describe('Machine-readable reason the submission was rejected.'),
    retryable: z.boolean().optional().describe('Whether retrying the submission can succeed.'),
    message: z.string().optional().describe('Human-readable result of the submission.'),
    id: z.string().optional().describe('Identifier of the recorded feedback.'),
    data: z.unknown().optional().describe('Payload returned with the accepted feedback.'),
    raw: z.string().optional().describe('Response body when it was not JSON.'),
  })
  .describe('Result of submitting feedback.');

export const crawlOutputSchema = z
  .object({
    success,
    error,
    warning,
    id: z.string().optional().describe('Crawl identifier, for `firecrawl_check_crawl_status`.'),
    status: z.string().optional().describe('Crawl state, such as `scraping`, `completed`, or `failed`.'),
    completed: z.number().optional().describe('Pages crawled so far.'),
    total: z.number().optional().describe('Pages the crawl expects to visit.'),
    creditsUsed: z.number().optional().describe('Credits the crawl consumed.'),
    expiresAt: z.string().nullable().optional().describe('When the crawl results expire.'),
    next: z
      .string()
      .nullable()
      .optional()
      .describe('URL of the next page of results, when the data is paginated.'),
    url: z.string().optional().describe('The URL the crawl started from.'),
    data: z.unknown().optional().describe('Scraped documents collected by the crawl.'),
  })
  .describe('Crawl job state and the documents collected so far.');

export const agentOutputSchema = z
  .object({
    success,
    error,
    id: z.string().optional().describe('Agent job identifier, for `firecrawl_agent_status`.'),
    status: z.string().optional().describe('Job state at submission time.'),
  })
  .describe('The queued research job. The result is read with `firecrawl_agent_status`.');

export const agentStatusOutputSchema = z
  .object({
    success,
    error,
    id: z.string().optional().describe('Agent job identifier.'),
    status: z
      .string()
      .optional()
      .describe('Job state: `processing` is non-terminal; `completed` and `failed` are terminal.'),
    progress: z.unknown().optional().describe('Progress information for a running job.'),
    data: z.unknown().optional().describe('Research result, present once the job has completed.'),
    creditsUsed: z.number().optional().describe('Credits the job consumed.'),
    sources: z.unknown().optional().describe('Sources the agent read.'),
  })
  .describe('Progress or final result of a research agent job.');

export const interactOutputSchema = z
  .object({
    success,
    error: z
      .unknown()
      .optional()
      .describe('Why the interaction or the session could not run.'),
    url: z.string().optional().describe('The URL the session was opened from, when opening failed.'),
    scrapeId: z
      .string()
      .optional()
      .describe('Session identifier; pass it to reuse the session or to `firecrawl_interact_stop`.'),
    result: z.unknown().optional().describe('Interaction result, when it is not an object of its own.'),
    output: z.unknown().optional().describe('Execution output.'),
    stdout: z.string().optional().describe('Standard output of the executed code.'),
    stderr: z.string().optional().describe('Standard error of the executed code.'),
    exitCode: z.number().optional().describe('Exit status of the executed code.'),
    data: z.unknown().optional().describe('Payload returned by the interaction.'),
    sessionUrl: z.string().optional().describe('URL for viewing the live session.'),
    liveUrl: z.string().optional().describe('URL for viewing the live session.'),
  })
  .describe('Result of a browser interaction, with the session identifier to continue or stop it.');

export const interactStopOutputSchema = z
  .object({
    success,
    error,
    message: z.string().optional().describe('Confirmation that the session was stopped.'),
    scrapeId: z.string().optional().describe('Session that was stopped.'),
  })
  .describe('Confirmation that the interact session was stopped.');

export const parseOutputSchema = z
  .object({
    success,
    error,
    warning,
    mode: z.string().optional().describe('Which phase of the hosted flow produced this response.'),
    message: z.string().optional().describe('Guidance for the next call.'),
    data: z.unknown().optional().describe('Parsed document content; can include `data.metadata.scrapeId` for parse feedback.'),
    uploadUrl: z.string().optional().describe('Hosted phase one: URL to upload the local file to.'),
    uploadRef: z.string().optional().describe('Hosted phase one: reference to pass back on the second call.'),
    instructions: z.unknown().optional().describe('Hosted phase one: how to perform the upload.'),
    expiresAt: z.string().optional().describe('When the upload URL expires.'),
    raw: z.string().optional().describe('Response body when it was not JSON.'),
  })
  .describe('Parsed document content, or the upload instructions for the hosted two-call flow.');

export const deprecatedToolOutputSchema = z
  .object({
    code: z.string().optional().describe('Always `DEPRECATED_TOOL`.'),
    message: z.string().optional().describe('Why the tool is unavailable and what to call instead.'),
    replacement: z.unknown().optional().describe('The replacement tool, with instructions and example arguments.'),
    docs_url: z.string().optional().describe('Documentation for the replacement.'),
  })
  .describe('A pointer to the replacement tool. This entry point is deprecated and always errors.');

// --- src/monitor.ts tools ---------------------------------------------------

export const monitorOutputSchema = z
  .object({
    success,
    error,
    data: z.unknown().optional().describe('The monitor record: configuration, schedule, targets, and current state.'),
  })
  .describe('One monitor record.');

export const monitorListOutputSchema = z
  .object({
    success,
    error,
    data: z.unknown().optional().describe('One page of monitor records.'),
    pagination: z.unknown().optional().describe('Pagination metadata for the listing.'),
  })
  .describe('One page of monitors for the authenticated account.');

export const monitorDeleteOutputSchema = z
  .object({
    success,
    error,
    data: z.unknown().optional().describe('Deletion details, when the API returns any.'),
  })
  .describe('Deletion status for the monitor.');

export const monitorRunOutputSchema = z
  .object({
    success,
    error,
    data: z.unknown().optional().describe('The queued check.'),
  })
  .describe('The check queued outside the monitor schedule.');

export const monitorChecksOutputSchema = z
  .object({
    success,
    error,
    data: z.unknown().optional().describe('One page of check summaries.'),
    pagination: z.unknown().optional().describe('Pagination metadata for the listing.'),
  })
  .describe('One page of historical checks for the monitor.');

export const monitorCheckOutputSchema = z
  .object({
    success,
    error,
    data: z
      .unknown()
      .optional()
      .describe('The check and its page-level results: each page reports `same`, `new`, `changed`, `removed`, or `error`, with diffs and any goal judgment.'),
    pagination: z.unknown().optional().describe('Pagination metadata for the page results.'),
    next: z
      .string()
      .nullable()
      .optional()
      .describe('URL of the next page of results, when more exist.'),
  })
  .describe('One monitor check with its page-level diff results.');

// --- src/research.ts and src/developer.ts tools -----------------------------

/**
 * Paper fields as the research endpoints return them. Inside an array item
 * `strictJsonSchema` leaves the object open, so unlisted fields survive both
 * the advertised schema and validation.
 */
const paperSchema = z.looseObject({
  paperId: z.string().optional().describe('Canonical paper identifier.'),
  primaryId: z.string().optional().describe('Display identifier, ordered for citation and fetch use.'),
  ids: z.unknown().optional().describe('Source identifiers by namespace, such as `arxiv`, `doi`, or `pmid`.'),
  title: z.string().optional().describe('Paper title.'),
  abstract: z.string().optional().describe('Paper abstract.'),
  authors: z.unknown().optional().describe('Authors, as a comma-joined string or as `{name, affiliation}` entries.'),
  categories: z.array(z.string()).optional().describe('Paper categories, such as `cs.LG`.'),
  createdDate: z.string().optional().describe('Date the paper was first indexed or published.'),
  updateDate: z.string().optional().describe('Date the paper was last updated.'),
});

export const researchSearchOutputSchema = z
  .object({
    results: z.array(paperSchema).describe('Ranked papers, in the order the text block lists them.'),
  })
  .describe('Ranked papers with canonical IDs, titles, authors, and abstracts.');

export const researchPaperOutputSchema = z
  .object({
    paper: paperSchema.optional().describe('Canonical metadata for the requested paper, absent when it was not found.'),
  })
  .describe('Canonical metadata for one paper.');

export const researchRelatedOutputSchema = z
  .object({
    results: z.array(paperSchema).describe('Ranked citation-graph candidates.'),
    poolSize: z.number().describe('Number of candidates evaluated before ranking.'),
    note: z.string().nullable().optional().describe('Note about how the candidates were produced.'),
  })
  .describe('Ranked citation-graph candidates and the size of the evaluated pool.');

export const researchReadOutputSchema = z
  .object({
    passages: z
      .array(z.looseObject({ text: z.string().optional().describe('Passage text.') }))
      .describe('In-body passages relevant to the question; empty when no full text is indexed.'),
  })
  .describe('Full-text passages from one paper.');

export const developerSearchOutputSchema = z
  .object({
    results: z
      .array(
        z.looseObject({
          id: z.string().optional().describe('Stable result id, such as `issue:owner/repo#123` or `doc:<hash>`; its prefix gives the source type.'),
          url: z.string().optional().describe('Source URL.'),
          title: z.string().optional().describe('Result title.'),
          passages: z
            .array(z.looseObject({ text: z.string().optional().describe('Matched passage, in markdown.') }))
            .optional()
            .describe('Matched passages.'),
        })
      )
      .describe('Ranked results, in the order the text block lists them.'),
  })
  .describe('Ranked developer-index results with their matched passages.');

// --- src/usage.ts tools -----------------------------------------------------

export const creditUsageOutputSchema = z
  .object({
    // Current view.
    remainingCredits: z.number().optional().describe('Credits left in the current billing period; can exceed `planCredits` when extra credits were purchased or granted.'),
    planCredits: z.number().optional().describe('Credits included in the plan for the period.'),
    billingPeriodStart: z.string().nullable().optional().describe('Start of the current billing period; null when the billing provider reports no period.'),
    billingPeriodEnd: z.string().nullable().optional().describe('End of the current billing period; null when the billing provider reports no period.'),
    // Historical view.
    success,
    error,
    periods: z
      .unknown()
      .optional()
      .describe('Historical periods sorted by start date, each with `startDate`, `endDate`, `creditsUsed`, and `apiKey` when broken down by key.'),
  })
  .describe('The team credit balance, or historical credit consumption by period.');
