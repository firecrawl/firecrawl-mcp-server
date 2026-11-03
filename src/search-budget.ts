import { userAgentProduct } from './origin';
import { structuredCompact } from './tool-output';

/**
 * A byte cap on `firecrawl_search` results, for clients that refuse a tool
 * result above a fixed size. It applies only to the User-Agent products listed
 * here; every other client gets the response unchanged.
 */
const CAPPED_USER_AGENT_PRODUCTS = new Set(['baseten-tool-bank']);

/** Bytes of the serialized tool result, text block and structured content together. */
export const SEARCH_RESULT_BYTE_BUDGET = 900_000;

const RESULT_GROUPS = ['web', 'news', 'images'];
const CONTENT_FIELDS = ['markdown', 'html', 'rawHtml', 'summary', 'description', 'links', 'images'];

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The byte budget for a client, or undefined when its results are not capped. */
export function searchByteBudget(userAgent: string | undefined): number | undefined {
  return CAPPED_USER_AGENT_PRODUCTS.has(userAgentProduct(userAgent))
    ? SEARCH_RESULT_BYTE_BUDGET
    : undefined;
}

function resultBytes(response: unknown): number {
  return Buffer.byteLength(JSON.stringify(structuredCompact(response)));
}

function cutString(value: string, limit: number, url: unknown): string {
  let cut = value.slice(0, limit);
  if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1);
  const where = typeof url === 'string' ? ` on ${url}` : '';
  return `${cut}\n\n[Truncated: ${cut.length} of ${value.length} characters shown. Call firecrawl_scrape${where} for the full page.]`;
}

function cutArray(value: unknown[], limit: number): unknown[] {
  let used = 0;
  let kept = 0;
  for (const item of value) {
    used += JSON.stringify(item ?? null).length + 1;
    if (used > limit) break;
    kept += 1;
  }
  return value.slice(0, kept);
}

/** One result with every content field cut to `limit` characters of JSON. */
function cutResult(result: unknown, limit: number): unknown {
  if (!isRecord(result)) return result;
  const cut: Json = { ...result };
  const fields: string[] = [];
  for (const field of CONTENT_FIELDS) {
    const value = result[field];
    if (typeof value === 'string' && value.length > limit) {
      cut[field] = cutString(value, limit, result.url);
      fields.push(field);
    } else if (Array.isArray(value) && JSON.stringify(value).length > limit) {
      cut[field] = cutArray(value, limit);
      fields.push(field);
    }
  }
  if (!fields.length) return result;
  cut.truncated = `${fields.join(', ')} cut to fit the response size limit. Call firecrawl_scrape on this url for the full content.`;
  return cut;
}

/** The response with content cut to `limit` and only the first `keep` results across groups. */
function shape(
  response: Json,
  data: Json,
  limit: number,
  keep: number
): { response: Json; truncated: boolean } {
  let left = keep;
  let truncated = false;
  const groups: Json = {};
  for (const [group, value] of Object.entries(data)) {
    if (!RESULT_GROUPS.includes(group) || !Array.isArray(value)) {
      groups[group] = value;
      continue;
    }
    const kept = value.slice(0, Math.max(left, 0));
    left -= kept.length;
    groups[group] = kept.map((result) => {
      const cut = cutResult(result, limit);
      if (cut !== result) truncated = true;
      return cut;
    });
  }
  return { response: { ...response, data: groups }, truncated };
}

function largestFitting(low: number, high: number, fits: (n: number) => boolean): number {
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (fits(mid)) low = mid;
    else high = mid - 1;
  }
  return low;
}

/**
 * A search response that serializes to at most `budget` bytes as a tool
 * result. A response already within budget is returned as is. Otherwise every
 * result's page content is cut to one shared length, the largest that fits,
 * and if even no content is too much the lowest-ranked results are dropped.
 */
export function fitSearchResponse(response: unknown, budget: number): unknown {
  if (!isRecord(response) || !isRecord(response.data)) return response;
  if (resultBytes(response) <= budget) return response;
  const data = response.data;

  const results = Object.entries(data)
    .filter(([group, value]) => RESULT_GROUPS.includes(group) && Array.isArray(value))
    .flatMap(([, value]) => value as unknown[]);
  const total = results.length;
  const contentLengths = results.map((result) =>
    isRecord(result)
      ? CONTENT_FIELDS.map((field) => {
          const value = result[field];
          if (typeof value === 'string') return value.length;
          return Array.isArray(value) ? JSON.stringify(value).length : 0;
        })
      : []
  );
  const bareData: Json = { ...data };
  for (const group of RESULT_GROUPS) {
    const groupResults = data[group];
    if (!Array.isArray(groupResults)) continue;
    bareData[group] = groupResults.map((result) => {
      if (!isRecord(result)) return result;
      const bare = { ...result };
      for (const field of CONTENT_FIELDS) delete bare[field];
      delete bare.truncated;
      return bare;
    });
  }
  const build = (limit: number, keep: number, source = data): Json => {
    const shaped = shape(response, source, limit, keep);
    const notes: string[] = [];
    if (shaped.truncated) {
      notes.push(`Page content was cut to keep this response under ${budget} bytes. Results with a \`truncated\` field hold partial content; call firecrawl_scrape on their URLs for the full page.`);
    }
    if (keep < total) {
      notes.push(`${total - keep} lower-ranked results were left out to keep this response under ${budget} bytes.`);
    }
    const warning = typeof response.warning === 'string' && response.warning
      ? `${response.warning} ${notes.join(' ')}`
      : notes.join(' ');
    return { ...shaped.response, warning };
  };
  const fits = (limit: number, keep: number) => resultBytes(build(limit, keep)) <= budget;
  const limits = new Map<number, number | undefined>();
  const contentLimit = (keep: number): number | undefined => {
    if (limits.has(keep)) return limits.get(keep);
    // Content and its markers only add bytes to this lower bound. Avoid
    // scanning every boundary when the retained metadata alone cannot fit.
    if (resultBytes(build(0, keep, bareData)) > budget) {
      limits.set(keep, undefined);
      return undefined;
    }
    const boundaries = [...new Set([0, ...contentLengths.slice(0, keep).flat()])]
      .sort((a, b) => a - b);
    // Size can fall when a field becomes whole and loses its truncation
    // markers. Between those boundaries it only grows, so search each
    // interval separately, starting with the longest possible content.
    for (let i = boundaries.length - 1; i >= 0; i -= 1) {
      const low = boundaries[i];
      if (!fits(low, keep)) continue;
      const high = i + 1 < boundaries.length ? boundaries[i + 1] - 1 : low;
      const limit = largestFitting(low, high, (n) => fits(n, keep));
      limits.set(keep, limit);
      return limit;
    }
    limits.set(keep, undefined);
    return undefined;
  };

  const allLimit = contentLimit(total);
  if (allLimit !== undefined) {
    return build(allLimit, total);
  }
  const keep = largestFitting(0, total, (n) => contentLimit(n) !== undefined);
  const limit = contentLimit(keep);
  if (limit !== undefined) {
    // Dropping results frees space for content in the results we keep.
    return build(limit, keep);
  }
  return {
    success: response.success,
    id: response.id,
    creditsUsed: response.creditsUsed,
    data: {},
    warning: `This search result was larger than ${budget} bytes even without page content, so no results are returned. Narrow the query or lower the limit.`,
  };
}
