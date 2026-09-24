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
 * type is part of the API contract are typed, and those are optional and
 * nullable through the `str`/`num`/`bool` helpers below: a value the schema
 * rejects would fail validation and turn a working call into an error.
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

/**
 * Every declared scalar is optional and nullable. The Firecrawl API reports an
 * absent value as either, and a value the schema rejects fails validation and
 * turns a working call into an error, so a scalar declaration narrows the type
 * without ever narrowing what the tool accepts.
 */
const str = (description: string) =>
  z.string().nullable().optional().describe(description);
const num = (description: string) =>
  z.number().nullable().optional().describe(description);
const bool = (description: string) =>
  z.boolean().nullable().optional().describe(description);
/** A value that passes through from the API, described but not constrained. */
const unknown = (description: string) =>
  z.unknown().optional().describe(description);

const success = bool('Whether the API call succeeded.');
const error = unknown('Error message or error object when the call did not succeed.');
const warning = str('Non-fatal warning about the result.');

/** Keys every Alexandria-capable response can carry (see `alexandriaOutput`). */
const alexandriaEnvelope = {
  requestId: str('Identifier of this logical execution; reuse it only for a retry of the identical payload.'),
  scrape_id: str('Identifier of the underlying scrape.'),
  receipt: unknown('Billing receipt for the execution.'),
  creditsCost: num('Credits this call consumed.'),
  delivery: str('`retained` when the full result stayed server-side instead of being inlined.'),
  responseBytes: num('Size of the full result in bytes.'),
  estimatedTokens: num('Estimated token cost of the full result.'),
  tokenEstimateMethod: str('How `estimatedTokens` was derived.'),
  inlineTokenBudget: num('Token budget above which a result is retained rather than inlined.'),
  workspaceId: str('Workspace holding a retained result, for inspection through virtual Bash.'),
  idleTtlSeconds: num('Seconds a retained workspace stays available while idle.'),
  message: str('Guidance that accompanies the result.'),
  nextTool: unknown('A follow-up tool call (`{name, arguments}`) that continues or inspects this result.'),
  feedbackTool: unknown('Pointer to the feedback tool for reporting how this result served the task.'),
};

// --- src/index.ts tools -----------------------------------------------------

export const scrapeOutputSchema = z
  .object({
    // URL mode: the scraped document, with the formats that were requested.
    markdown: str('Page content as markdown.'),
    html: str('Processed HTML of the page.'),
    rawHtml: str('Unprocessed HTML of the page.'),
    summary: str('Summary of the page content.'),
    links: unknown('Links found on the page.'),
    screenshot: unknown('Screenshot of the page.'),
    images: unknown('Images found on the page.'),
    audio: unknown('Audio extracted from the page.'),
    video: unknown('Video extracted from the page.'),
    answer: str('Targeted answer to the question that was asked of the page.'),
    highlights: unknown('Highlighted passages from the page.'),
    pages: unknown('Physical PDF pages, when `parsers[].pages` is set.'),
    blocks: unknown('Typed PDF layout blocks, when `parsers[].blocks` is set.'),
    product: unknown('Product data extracted from the page.'),
    menu: unknown('Menu data extracted from the page.'),
    json: unknown('Structured data matching the requested JSON schema or prompt.'),
    attributes: unknown('Values collected by the requested attribute selectors.'),
    actions: unknown('Results of the browser actions that ran during the scrape.'),
    changeTracking: unknown('Change-tracking comparison against the previous scrape.'),
    branding: unknown('Branding data extracted from the page.'),
    metadata: unknown('Page metadata; authenticated responses can include `metadata.scrapeId` for scrape feedback.'),
    tools: unknown('Domain-matched Alexandria tools for the page, when `domainTools` is set.'),
    warning,
    // Alexandria mode and error envelopes.
    success,
    error,
    data: unknown('Alexandria mode: per-capability results in `data.alexandria`, each with `data`, `records`, or an `error`.'),
    ...alexandriaEnvelope,
  })
  .describe('A scraped document, or the Alexandria execution envelope when `alexandria` was passed.');

export const mapOutputSchema = z
  .object({
    links: unknown('URLs discovered under the website.'),
    success,
    error,
    warning,
    id: str('Identifier of the map run, for optional map feedback.'),
  })
  .describe('URLs indexed under the requested website.');

export const searchOutputSchema = z
  .object({
    success,
    data: unknown('Ranked results grouped by source, such as `web`, `news`, `images`, and `alexandria`.'),
    error,
    warning,
    id: str('Search identifier, for optional `firecrawl_search_feedback`.'),
    creditsUsed: num('Credits this search consumed.'),
    tools: unknown('Domain-matched Alexandria tools for the results.'),
    nextTool: unknown('A follow-up tool call that continues this search.'),
    feedbackTool: unknown('Pointer to the feedback tool for this search.'),
  })
  .describe('Ranked search results grouped by source.');

export const findToolsOutputSchema = z
  .object({
    success,
    data: unknown('Discovery page in `data.alexandria[0].data`, with `level`, `items`, `total`, and an optional `nextTool`.'),
    error,
    ...alexandriaEnvelope,
  })
  .describe('One page of the Alexandria catalogue: categories, providers, tools, or one contract.');

export const feedbackOutputSchema = z
  .object({
    success,
    error,
    status: num('HTTP status when the submission was rejected.'),
    feedbackErrorCode: str('Machine-readable reason the submission was rejected.'),
    retryable: bool('Whether retrying the submission can succeed.'),
    message: str('Human-readable result of the submission.'),
    id: str('Identifier of the recorded feedback.'),
    feedbackId: str('Identifier of the recorded feedback.'),
    creditsRefunded: num('Credits refunded for the feedback, when eligible.'),
    data: unknown('Payload returned with the accepted feedback.'),
    raw: str('Response body when it was not JSON.'),
  })
  .describe('Result of submitting feedback.');

export const crawlOutputSchema = z
  .object({
    success,
    error,
    warning,
    id: str('Crawl identifier, for `firecrawl_check_crawl_status`.'),
    status: str('Crawl state, such as `scraping`, `completed`, or `failed`.'),
    completed: num('Pages crawled so far.'),
    total: num('Pages the crawl expects to visit.'),
    creditsUsed: num('Credits the crawl consumed.'),
    expiresAt: str('When the crawl results expire.'),
    next: str('URL of the next page of results, when the data is paginated.'),
    url: str('The URL the crawl started from.'),
    data: unknown('Scraped documents collected by the crawl.'),
  })
  .describe('Crawl job state and the documents collected so far.');

export const agentOutputSchema = z
  .object({
    success,
    error,
    id: str('Agent job identifier, for `firecrawl_agent_status`.'),
    status: str('Job state at submission time.'),
    threadId: str('Research thread this job belongs to.'),
    threadTurn: num('Turn number of this job within its thread.'),
  })
  .describe('The queued research job. The result is read with `firecrawl_agent_status`.');

export const agentStatusOutputSchema = z
  .object({
    success,
    error,
    id: str('Agent job identifier.'),
    status: str('Job state: `processing` is non-terminal; `completed` and `failed` are terminal.'),
    progress: unknown('Progress information for a running job.'),
    data: unknown('Research result, present once the job has completed.'),
    creditsUsed: num('Credits the job consumed.'),
    sources: unknown('Sources the agent read.'),
    expiresAt: str('When the job result expires and can no longer be read.'),
    model: str('Agent model that ran the job.'),
    mode: str('Agent mode the job ran in.'),
    threadId: str('Research thread this job belongs to.'),
    threadTurn: num('Turn number of this job within its thread.'),
  })
  .describe('Progress or final result of a research agent job.');

export const interactOutputSchema = z
  .object({
    success,
    error: unknown('Why the interaction or the session could not run.'),
    url: str('The URL the session was opened from, when opening failed.'),
    scrapeId: str('Session identifier; pass it to reuse the session or to `firecrawl_interact_stop`.'),
    result: unknown('Interaction result, when it is not an object of its own.'),
    output: unknown('Execution output.'),
    stdout: str('Standard output of the executed code.'),
    stderr: str('Standard error of the executed code.'),
    exitCode: num('Exit status of the executed code.'),
    data: unknown('Payload returned by the interaction.'),
    sessionUrl: str('URL for viewing the live session.'),
    liveUrl: str('URL for viewing the live session.'),
  })
  .describe('Result of a browser interaction, with the session identifier to continue or stop it.');

export const interactStopOutputSchema = z
  .object({
    success,
    error,
    message: str('Confirmation that the session was stopped.'),
    scrapeId: str('Session that was stopped.'),
  })
  .describe('Confirmation that the interact session was stopped.');

export const parseOutputSchema = z
  .object({
    success,
    error,
    warning,
    mode: str('Which phase of the hosted flow produced this response.'),
    message: str('Guidance for the next call.'),
    data: unknown('Parsed document content; can include `data.metadata.scrapeId` for parse feedback.'),
    upload: z
      .object({
        command: str('Local command that performs the upload. It carries no Firecrawl API key.'),
        method: str('HTTP method for the upload.'),
        headers: unknown('Headers the upload request must send.'),
        fields: unknown('Form fields the upload request must send, for a POST upload.'),
        uploadUrl: str('URL to upload the local file to.'),
        uploadRef: str('Reference to pass back on the second call.'),
        expiresAt: str('When the upload URL expires.'),
        maxSizeBytes: num('Largest file the upload URL accepts.'),
      })
      .optional()
      .describe('Hosted phase one: how to upload the local file.'),
    nextToolCall: unknown('Hosted phase one: the second `firecrawl_parse` call to make once the upload succeeds, as `{name, arguments}`.'),
    notes: z
      .array(z.string())
      .nullable()
      .optional()
      .describe('Hosted phase one: constraints on completing the upload flow.'),
    raw: str('Response body when it was not JSON.'),
  })
  .describe('Parsed document content, or the upload instructions for the hosted two-call flow.');

export const deprecatedToolOutputSchema = z
  .object({
    code: str('Always `DEPRECATED_TOOL`.'),
    message: str('Why the tool is unavailable and what to call instead.'),
    replacement: unknown('The replacement tool, with instructions and example arguments.'),
    docs_url: str('Documentation for the replacement.'),
  })
  .describe('A pointer to the replacement tool. This entry point is deprecated and always errors.');

// --- src/monitor.ts tools ---------------------------------------------------

export const monitorOutputSchema = z
  .object({
    success,
    error,
    data: unknown('The monitor record: configuration, schedule, targets, and current state.'),
  })
  .describe('One monitor record.');

export const monitorListOutputSchema = z
  .object({
    success,
    error,
    data: unknown('One page of monitor records.'),
    pagination: unknown('Pagination metadata for the listing.'),
  })
  .describe('One page of monitors for the authenticated account.');

export const monitorDeleteOutputSchema = z
  .object({
    success,
    error,
    data: unknown('Deletion details, when the API returns any.'),
  })
  .describe('Deletion status for the monitor.');

export const monitorRunOutputSchema = z
  .object({
    success,
    error,
    data: unknown('The queued check.'),
  })
  .describe('The check queued outside the monitor schedule.');

export const monitorChecksOutputSchema = z
  .object({
    success,
    error,
    data: unknown('One page of check summaries.'),
    pagination: unknown('Pagination metadata for the listing.'),
  })
  .describe('One page of historical checks for the monitor.');

export const monitorCheckOutputSchema = z
  .object({
    success,
    error,
    data: unknown('The check and its page-level results: each page reports `same`, `new`, `changed`, `removed`, or `error`, with diffs and any goal judgment.'),
    pagination: unknown('Pagination metadata for the page results.'),
    next: str('URL of the next page of results, when more exist.'),
  })
  .describe('One monitor check with its page-level diff results.');

// --- src/research.ts and src/developer.ts tools -----------------------------

/**
 * Paper fields as the research endpoints return them. Inside an array item
 * `strictJsonSchema` leaves the object open, so unlisted fields survive both
 * the advertised schema and validation.
 */
const paperSchema = z.looseObject({
  paperId: str('Canonical paper identifier.'),
  primaryId: str('Display identifier, ordered for citation and fetch use.'),
  ids: unknown('Source identifiers by namespace, such as `arxiv`, `doi`, or `pmid`.'),
  title: str('Paper title.'),
  abstract: str('Paper abstract.'),
  authors: unknown('Authors, as a comma-joined string or as `{name, affiliation}` entries.'),
  categories: z.array(z.string()).nullable().optional().describe('Paper categories, such as `cs.LG`.'),
  createdDate: str('Date the paper was first indexed or published.'),
  updateDate: str('Date the paper was last updated.'),
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
    note: str('Note about how the candidates were produced.'),
  })
  .describe('Ranked citation-graph candidates and the size of the evaluated pool.');

export const researchReadOutputSchema = z
  .object({
    passages: z
      .array(z.looseObject({ text: str('Passage text.') }))
      .describe('In-body passages relevant to the question; empty when no full text is indexed.'),
  })
  .describe('Full-text passages from one paper.');

export const developerSearchOutputSchema = z
  .object({
    results: z
      .array(
        z.looseObject({
          id: str('Stable result id, such as `issue:owner/repo#123` or `doc:<hash>`; its prefix gives the source type.'),
          url: str('Source URL.'),
          title: str('Result title.'),
          passages: z
            .array(z.looseObject({ text: str('Matched passage, in markdown.') }))
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
    remainingCredits: num('Credits left in the current billing period; can exceed `planCredits` when extra credits were purchased or granted.'),
    planCredits: num('Credits included in the plan for the period.'),
    billingPeriodStart: str('Start of the current billing period; null when the billing provider reports no period.'),
    billingPeriodEnd: str('End of the current billing period; null when the billing provider reports no period.'),
    // Historical view.
    success,
    error,
    periods: unknown('Historical periods sorted by start date, each with `startDate`, `endDate`, `creditsUsed`, and `apiKey` when broken down by key.'),
  })
  .describe('The team credit balance, or historical credit consumption by period.');
