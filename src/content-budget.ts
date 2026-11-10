import { cutArray, cutString, largestFitting } from './search-budget';

/**
 * A size cap on the page content `firecrawl_scrape`, `firecrawl_crawl` and
 * `firecrawl_check_crawl_status` return, so a large page does not exceed what
 * an MCP client accepts inline. Claude Code, for one, saves a result above
 * 50,000 characters to a file and shows the model an error-prefixed stub in
 * its place. At the default `maxCharacters` a result stays under that.
 *
 * Only the long content fields are cut: `markdown`, `html` and `rawHtml` to
 * `maxCharacters` characters, and the `links` and `images` lists to
 * `maxCharacters` characters of JSON. Small structured fields (`json`,
 * `answer`, `summary`, `metadata` and the rest) are never touched.
 */

const DEFAULT_MAX_CHARACTERS = 40_000;
const MIN_MAX_CHARACTERS = 1_000;
const MAX_MAX_CHARACTERS = 500_000;

/** Room for metadata and the other small fields on top of `maxCharacters` of content. */
const RESULT_OVERHEAD = 5_000;
/** Room kept for the warning that lists the crawl pages left out. */
const OMITTED_WARNING_RESERVE = 2_500;
/** Characters of omitted page URLs a crawl warning lists before it counts the rest. */
const OMITTED_URL_CHARS = 2_000;

/**
 * Tool `_meta` that lets Claude Code keep a result up to this many characters
 * inline, so a caller that raises `maxCharacters` still gets the result rather
 * than a file path.
 */
export const RESULT_SIZE_META = { 'anthropic/maxResultSizeChars': MAX_MAX_CHARACTERS };

const RANGE = `default ${DEFAULT_MAX_CHARACTERS}, from ${MIN_MAX_CHARACTERS} to ${MAX_MAX_CHARACTERS}; values outside are clamped`;

export const scrapeMaxCharactersDescription = `Most characters of page content to return (${RANGE}). markdown, html and rawHtml are each cut to this length, and end with a [Truncated: ...] marker; links and images lists are shortened the same way. When the fields together would exceed it, links and images are shortened first, then the text fields to a shared shorter length. json, answer, summary and metadata are never cut. A cut result sets truncated, totalLength (the full length of the longest cut field) and a warning. Raise it to read more of a long page, or ask a question with formats ["query"] instead.`;

export const crawlMaxCharactersDescription = `Most characters of content to return per page and, with room for metadata, in the whole result (${RANGE}). Each page's markdown, html and rawHtml are cut as in firecrawl_scrape; pages past the whole-result budget are not inlined, and the result sets truncated, omittedPages and a warning listing their URLs. Scrape those URLs, or call firecrawl_check_crawl_status with a larger maxCharacters to inline more.`;

const STRING_FIELDS = ['markdown', 'html', 'rawHtml'];
const ARRAY_FIELDS = ['links', 'images'];

type Json = Record<string, unknown>;

interface Cut {
  field: string;
  shown: number;
  total: number;
  unit: 'characters' | 'items';
  /** Characters of the uncut field, as JSON for a list. */
  length: number;
}

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Serialized size as a client sees it; pretty-printed, so it also bounds the compact form. */
function size(value: unknown): number {
  return JSON.stringify(value ?? null, null, 2).length;
}

const count = (n: number) => n.toLocaleString('en-US');
const pagesOf = (n: number) => `${count(n)} ${n === 1 ? 'page' : 'pages'}`;

/** The `maxCharacters` argument, clamped to its range, or the default. */
function maxCharactersFrom(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_MAX_CHARACTERS;
  return Math.min(MAX_MAX_CHARACTERS, Math.max(MIN_MAX_CHARACTERS, Math.floor(value)));
}

/** `doc` with each text field longer than `limit` and each list longer than `listLimit` cut to it. */
function cutDocument(doc: Json, limit: number, listLimit: number, hint: string): { doc: Json; cuts: Cut[] } {
  const out: Json = { ...doc };
  const cuts: Cut[] = [];
  for (const field of STRING_FIELDS) {
    const value = doc[field];
    if (typeof value === 'string' && value.length > limit) {
      out[field] = cutString(value, limit, hint);
      cuts.push({ field, shown: limit, total: value.length, unit: 'characters', length: value.length });
    }
  }
  for (const field of ARRAY_FIELDS) {
    const value = doc[field];
    const length = Array.isArray(value) ? JSON.stringify(value).length : 0;
    if (Array.isArray(value) && length > listLimit) {
      const kept = cutArray(value, listLimit);
      out[field] = kept;
      cuts.push({ field, shown: kept.length, total: value.length, unit: 'items', length });
    }
  }
  return { doc: out, cuts };
}

/** Turns a cut document into the value returned for it, so its size is measured with any notes added. */
type Finish = (doc: Json, cuts: Cut[]) => Json;

/**
 * One document with its content cut to `maxCharacters`, and further when the
 * finished document would still serialize to more than `maxCharacters` plus
 * room for its other fields: the `links` and `images` lists are shortened
 * first, and only when they are empty are the text fields cut to one shared
 * shorter length. When even no content would fit, the fields that cannot be
 * cut are what is large, and the content keeps `maxCharacters`. Returns `doc`
 * itself when nothing is cut.
 */
function fitDocument(
  doc: Json,
  maxCharacters: number,
  hint: string,
  finish: Finish = (cut) => cut
): { doc: Json; cut: boolean } {
  const budget = maxCharacters + RESULT_OVERHEAD;
  const at = (limit: number, listLimit: number) => {
    const { doc: cut, cuts } = cutDocument(doc, limit, listLimit, hint);
    return cuts.length ? finish(cut, cuts) : doc;
  };
  const fits = (limit: number, listLimit: number) => size(at(limit, listLimit)) <= budget;
  let limit = maxCharacters;
  let listLimit = maxCharacters;
  if (!fits(limit, listLimit)) {
    if (fits(limit, 0)) {
      listLimit = largestFitting(0, maxCharacters, (n) => fits(limit, n));
    } else if (fits(0, 0)) {
      listLimit = 0;
      limit = largestFitting(0, maxCharacters, (n) => fits(n, 0));
    }
  }
  const fitted = at(limit, listLimit);
  return { doc: fitted, cut: fitted !== doc };
}

function withWarning(result: Json, note: string): string {
  return typeof result.warning === 'string' && result.warning ? `${result.warning} ${note}` : note;
}

/** A `firecrawl_scrape` document cut to `maxCharacters`; a document that fits is returned as is. */
export function fitScrapeDocument(
  doc: unknown,
  options: { maxCharacters?: unknown; onlyMainContent?: unknown }
): unknown {
  if (!isRecord(doc)) return doc;
  const narrow = options.onlyMainContent === false ? ', or set onlyMainContent: true' : '';
  const finish: Finish = (cut, cuts) => {
    const parts = cuts.map((c) => `${c.field} at ${count(c.shown)} of ${count(c.total)} ${c.unit}`);
    const totalLength = Math.max(...cuts.map((c) => c.length));
    const note = `Content truncated: ${parts.join(', ')}. Re-call with a larger maxCharacters (up to ${count(MAX_MAX_CHARACTERS)}), use formats ["query"] or ["summary"] to get an answer instead of the full page${narrow}.`;
    return { ...cut, truncated: true, totalLength, warning: withWarning(doc, note) };
  };
  return fitDocument(
    doc,
    maxCharactersFrom(options.maxCharacters),
    'Re-call firecrawl_scrape with a larger maxCharacters for more.',
    finish
  ).doc;
}

function pageUrl(doc: unknown): string | undefined {
  if (!isRecord(doc)) return undefined;
  const metadata = isRecord(doc.metadata) ? doc.metadata : {};
  const url = metadata.sourceURL ?? metadata.url ?? doc.url;
  return typeof url === 'string' ? url : undefined;
}

/** The leading `docs` whose serialized size, added to `used`, stays within `budget`; always at least one. */
function keepWithin(docs: unknown[], used: number, budget: number): number {
  let kept = 0;
  for (const doc of docs) {
    used += size(doc) + 1;
    if (kept > 0 && used > budget) break;
    kept += 1;
  }
  return kept;
}

/**
 * A crawl result with every page cut to `maxCharacters`, and only as many
 * leading pages inlined as fit in `maxCharacters` plus room for the rest of
 * the result. The pages left out are counted, and listed by URL as far as a
 * short list goes, in `warning`. A crawl that fits is returned as is.
 */
export function fitCrawlResult(result: Json, maxCharactersArg?: unknown): Json {
  if (!Array.isArray(result.data) || !result.data.length) return result;
  const maxCharacters = maxCharactersFrom(maxCharactersArg);
  const budget = maxCharacters + RESULT_OVERHEAD;
  const fitted = result.data.map((doc) => {
    if (!isRecord(doc)) return { doc, cut: false };
    const where = pageUrl(doc);
    return fitDocument(
      doc,
      maxCharacters,
      `Call firecrawl_scrape${where ? ` on ${where}` : ''} with a larger maxCharacters for more.`
    );
  });
  const pages = fitted.map((page) => page.doc);

  const used = size({ ...result, data: [] });
  let kept = keepWithin(pages, used, budget);
  if (kept < pages.length) kept = keepWithin(pages, used, budget - OMITTED_WARNING_RESERVE);
  const cutInlined = fitted.slice(0, kept).filter((page) => page.cut).length;
  if (!cutInlined && kept === pages.length) return result;

  const notes: string[] = [];
  if (kept < pages.length) {
    const omitted = pages.slice(kept);
    const urls: string[] = [];
    let chars = 0;
    for (const url of omitted.map(pageUrl)) {
      if (!url) continue;
      chars += url.length + 2;
      if (chars > OMITTED_URL_CHARS) break;
      urls.push(url);
    }
    const rest = omitted.length - urls.length;
    const listed = urls.length
      ? `: ${urls.join(', ')}${rest ? `, and ${count(rest)} more` : ''}`
      : '';
    notes.push(
      `Inlined ${count(kept)} of ${pagesOf(pages.length)} to keep this result under ${count(budget)} characters; ${pagesOf(omitted.length)} left out${listed}. Call firecrawl_scrape on the URLs you need, or firecrawl_check_crawl_status with this id and a larger maxCharacters to inline more.`
    );
  }
  if (cutInlined) {
    notes.push(
      `${count(cutInlined)} inlined ${cutInlined === 1 ? 'page had' : 'pages had'} content cut at ${count(maxCharacters)} characters or less; each cut field ends with a [Truncated: ...] marker.`
    );
  }
  return {
    ...result,
    data: pages.slice(0, kept),
    truncated: true,
    ...(kept < pages.length ? { omittedPages: pages.length - kept } : {}),
    warning: withWarning(result, notes.join(' ')),
  };
}
