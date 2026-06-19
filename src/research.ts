/**
 * Firecrawl Research tools (experimental).
 *
 * Thin MCP wrappers over the `/v2/search/research/*` endpoints (arXiv papers + GitHub
 * history/readmes).
 *
 * The installed `@mendable/firecrawl-js` predates the SDK's `research` client,
 * so we call the endpoints directly through the SDK's HTTP layer (auth +
 * retries) via `client.http.get(...)`, mirroring how the search tool reaches
 * `/v2/search`.
 */

import type { FastMCP, Logger } from 'firecrawl-fastmcp';
import { z } from 'zod';

interface SessionData {
  firecrawlApiKey?: string;
  [key: string]: unknown;
}

/** Whatever `getClient` returns — we only touch its `http.get`. */
type ClientLike = {
  http: {
    get: <T = unknown>(
      endpoint: string,
      headers?: Record<string, string>
    ) => Promise<{ data: T; status: number }>;
  };
};

// `getClient` returns a FirecrawlApp whose `http` member is private, so we type
// the callback loosely and narrow to `ClientLike` at each call site.
type GetClient = (session?: SessionData) => unknown;

const BASE = '/v2/search/research';

/** Append a value (or repeated array values) to a URLSearchParams instance. */
function appendParam(
  params: URLSearchParams,
  key: string,
  value: string | number | boolean | string[] | undefined
): void {
  if (value == null) return;
  if (Array.isArray(value)) {
    for (const v of value) {
      if (v != null && String(v).length > 0) params.append(key, String(v));
    }
  } else {
    params.append(key, String(value));
  }
}

function withQuery(path: string, params: URLSearchParams): string {
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

// --- result formatting (ported from research-index-front/src/agent_eval.ts) ---

// Max authors to print per paper (with affiliations); the rest collapse to a
// "+N more" tail so a large collaboration doesn't flood the context.
const MAX_AUTHORS = 15;
// Cap each abstract so a page of hits stays within the MCP output-token limit.
const MAX_ABSTRACT_CHARS = 600;
// Per-affiliation char cap — keeps one long org string (e.g. a full multi-dept
// university address) from bloating the authors line.
const MAX_AFFIL_CHARS = 60;
// Hard ceiling on the whole authors line, as a final guard.
const MAX_AUTHORS_LINE_CHARS = 400;

interface PaperHit {
  paperId?: string;
  primaryId?: string;
  ids?: Record<string, string[]>;
  title?: string;
  abstract?: string;
  // Search/metadata responses give a comma-joined string; some shapes give the
  // structured form — handle both.
  authors?: string | { name: string; affiliation?: string }[];
  categories?: string[];
  createdDate?: string;
  updateDate?: string;
}

/** Display id supplied by the API, already ordered for citation/fetch use. */
function displayId(p: PaperHit): string {
  return p.primaryId ?? 'missing-primary-id';
}

/** Format the authors line, accepting either the string or structured form. */
function fmtAuthors(
  authors?: string | { name: string; affiliation?: string }[]
): string | null {
  if (!authors) return null;
  let shown: string[];
  let total: number;
  if (typeof authors === 'string') {
    const names = authors
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (names.length === 0) return null;
    total = names.length;
    shown = names.slice(0, MAX_AUTHORS);
  } else {
    if (authors.length === 0) return null;
    total = authors.length;
    shown = authors.slice(0, MAX_AUTHORS).map((a) => {
      const aff = a.affiliation?.trim();
      return aff ? `${a.name} (${aff.slice(0, MAX_AFFIL_CHARS)})` : a.name;
    });
  }
  const extra = total > MAX_AUTHORS ? `; +${total - MAX_AUTHORS} more` : '';
  return ('Authors: ' + shown.join('; ') + extra).slice(
    0,
    MAX_AUTHORS_LINE_CHARS
  );
}

/** Render ranked papers as `[id] title` / authors / abstract blocks. */
function fmtHits(results?: PaperHit[]): string {
  if (!results || results.length === 0) return '(no results)';
  return results
    .map((r) => {
      const lines = [`## [${displayId(r)}] ${r.title ?? '(untitled)'}`];
      const authors = fmtAuthors(r.authors);
      if (authors) lines.push(authors);
      lines.push(
        (r.abstract || '(no abstract)')
          .replace(/\s+/g, ' ')
          .slice(0, MAX_ABSTRACT_CHARS)
      );
      return lines.join('\n');
    })
    .join('\n\n');
}

function fmtPaperMetadata(paper?: PaperHit): string {
  if (!paper) return '(paper not found)';
  const lines = [`# ${paper.title ?? '(untitled)'}`];
  lines.push('');
  lines.push(`Paper ID: ${paper.paperId ?? '?'}`);

  const ids = Object.entries(paper.ids ?? {})
    .flatMap(([namespace, values]) =>
      values.map((value) => `${namespace}:${value}`)
    )
    .join(', ');
  if (ids) lines.push(`IDs: ${ids}`);

  const authors = fmtAuthors(paper.authors);
  if (authors) lines.push(authors);

  if (paper.categories?.length) {
    lines.push(`Categories: ${paper.categories.join(', ')}`);
  }

  const dates = [
    paper.createdDate ? `created ${paper.createdDate}` : '',
    paper.updateDate ? `updated ${paper.updateDate}` : '',
  ]
    .filter(Boolean)
    .join('; ');
  if (dates) lines.push(`Dates: ${dates}`);

  lines.push('');
  lines.push('## Abstract');
  lines.push((paper.abstract || '(no abstract)').replace(/\s+/g, ' '));
  return lines.join('\n');
}

// Cap GitHub matched content so a page of results stays within the MCP
// output-token limit. Higher than abstracts since issue/PR threads carry the
// signal (repro steps, stack traces) the agent actually needs to verify.
const MAX_GITHUB_CONTENT_CHARS = 1200;

interface GitHubItem {
  resultType?: string;
  /** `owner/name`. */
  repo?: string;
  url?: string;
  /** History page type (e.g. `issue`, `pull`). Omitted for readmes. */
  pageType?: string;
  /** Issue/PR number. Omitted for readmes. */
  number?: number;
  /** Number of matched segments/chunks. */
  segmentCount?: number;
  /** Readme URL (readme results). */
  readmeUrl?: string;
  /** Short matched excerpt. */
  snippet?: string;
  /** Full matched content in markdown. */
  contentMd?: string;
}

/**
 * Render GitHub history/readme hits as `[repo#number] (kind)` / url / body
 * blocks — the same shape as `fmtHits`, but tuned for issues/PRs and readmes.
 * Markdown content keeps its newlines (so tables/code survive); only readmes and
 * snippets fall back when full content is absent.
 */
function fmtGithub(results?: GitHubItem[]): string {
  if (!results || results.length === 0) return '(no results)';
  return results
    .map((r) => {
      const lines: string[] = [];
      if (r.resultType === 'repo_readme') {
        lines.push(`[${r.repo ?? '?'}] README`);
      } else {
        const ref = r.number != null ? `#${r.number}` : '';
        const meta = [
          r.pageType,
          r.segmentCount ? `${r.segmentCount} segments` : '',
        ]
          .filter(Boolean)
          .join(', ');
        lines.push(`[${r.repo ?? '?'}${ref}]${meta ? ` (${meta})` : ''}`);
      }
      const url = r.readmeUrl ?? r.url;
      if (url) lines.push(url);
      const body = (r.contentMd || r.snippet || '').trim();
      lines.push(
        body ? body.slice(0, MAX_GITHUB_CONTENT_CHARS) : '(no content)'
      );
      return lines.join('\n');
    })
    .join('\n\n');
}

export function registerResearchTools(
  server: FastMCP<SessionData>,
  getClient: GetClient
): void {
  // --- search_papers ---
  server.addTool({
    name: 'firecrawl_research_search_papers',
    annotations: {
      title: 'Search arXiv papers',
      readOnlyHint: true, // Semantic search over indexed arXiv metadata; returns ranked results only.
      openWorldHint: true, // Searches the public arXiv research corpus.
      destructiveHint: false, // Query-only; no writes to arXiv or the research index.
    },
    description:
      'Primary entry point for finding arXiv papers by topic. Semantic (HyDE) search over arXiv ' +
      'abstracts; returns ranked papers with arXiv id, title, and abstract. The query should be a ' +
      'natural-language description of what you want. Run SEVERAL distinct framings of the question ' +
      '(sibling domains, rival methods, dataset/benchmark names) rather than one query — recall ' +
      'improves markedly with diverse framings. Returns up to `k` results (default 40).',
    parameters: z.object({
      query: z.string().min(1),
      k: z.number().int().min(1).max(500).optional(),
      authors: z
        .array(z.string())
        .optional()
        .describe(
          'Author substring filter(s); ALL must match (case-insensitive).'
        ),
      categories: z
        .array(z.string())
        .optional()
        .describe('arXiv category filter(s) (e.g. `cs.LG`); ALL must match.'),
      from: z
        .string()
        .optional()
        .describe(
          'Inclusive lower bound on created/updated date (`YYYY-MM-DD`).'
        ),
      to: z
        .string()
        .optional()
        .describe(
          'Inclusive upper bound on created/updated date (`YYYY-MM-DD`).'
        ),
    }),
    execute: async (
      args: unknown,
      { session }: { session?: SessionData; log: Logger }
    ): Promise<string> => {
      const { query, k, authors, categories, from, to } = args as {
        query: string;
        k?: number;
        authors?: string[];
        categories?: string[];
        from?: string;
        to?: string;
      };
      const params = new URLSearchParams();
      appendParam(params, 'query', query);
      appendParam(params, 'k', k);
      appendParam(params, 'authors', authors);
      appendParam(params, 'categories', categories);
      appendParam(params, 'from', from);
      appendParam(params, 'to', to);
      const client = getClient(session) as ClientLike;
      const res = await client.http.get<{ results?: PaperHit[] }>(
        withQuery(`${BASE}/papers`, params)
      );
      return fmtHits(res.data?.results);
    },
  });

  // --- inspect_paper ---
  server.addTool({
    name: 'firecrawl_research_inspect_paper',
    annotations: {
      title: 'Inspect a paper',
      readOnlyHint: true, // Fetches canonical metadata (title, abstract, authors) for one paper by ID.
      openWorldHint: true, // Retrieves metadata for papers in public indexes (arXiv, PMC, DOI, etc.).
      destructiveHint: false, // Read-only metadata lookup.
    },
    description:
      'Fetch canonical metadata for one paper by primaryId or canonical paperId. ' +
      'Use this after search/related results when you need the full title, abstract, authors, ' +
      'categories, source ids, and dates rendered as markdown.',
    parameters: z.object({
      paperId: z
        .string()
        .min(1)
        .describe(
          'Canonical paperId or primaryId such as `arxiv:1706.03762`, `pmcid:PMC12530322`, `pmid:40953549`, or `doi:10.1016/j.neunet.2025.108095`.'
        ),
    }),
    execute: async (
      args: unknown,
      { session }: { session?: SessionData; log: Logger }
    ): Promise<string> => {
      const { paperId } = args as { paperId: string };
      const client = getClient(session) as ClientLike;
      const res = await client.http.get<{ paper?: PaperHit }>(
        `${BASE}/papers/${encodeURIComponent(paperId)}`
      );
      return fmtPaperMetadata(res.data?.paper);
    },
  });

  // --- related_papers ---
  server.addTool({
    name: 'firecrawl_research_related_papers',
    annotations: {
      title: 'Find related arXiv papers',
      readOnlyHint: true, // Finds related papers via citation graph expansion; returns candidates only.
      openWorldHint: true, // Traverses relationships across the public research paper corpus.
      destructiveHint: false, // Read-only graph query; no modifications.
    },
    description:
      'Expand from anchor papers you have already found, via the citation graph, ranked and filtered ' +
      'to a natural-language `intent`. Pass arXiv ids of your strongest hits as `seed_ids`. Modes: ' +
      '`similar` (cocitation/coupling — papers in the same niche; the default), `citers` (papers ' +
      'that cite the anchors), `references` (papers the anchors cite). This reaches relevant papers ' +
      'that plain search misses, so use it on your best hits before finishing. A `similar` call ' +
      'already runs a DEEP multi-round expansion internally (re-seeding from each round’s best ' +
      'finds), so one call reaches the wider neighborhood — no need to chain many. Returns the ' +
      'candidates plus the pool size.',
    parameters: z.object({
      seed_ids: z.array(z.string()).min(1).max(10),
      intent: z.string().min(1),
      mode: z.enum(['similar', 'citers', 'references']).optional(),
      k: z.number().int().min(1).max(500).optional(),
      rerank: z
        .boolean()
        .optional()
        .describe('Apply an additional rerank over the fused candidates.'),
    }),
    execute: async (
      args: unknown,
      { session }: { session?: SessionData; log: Logger }
    ): Promise<string> => {
      const { seed_ids, intent, mode, k, rerank } = args as {
        seed_ids: string[];
        intent: string;
        mode?: string;
        k?: number;
        rerank?: boolean;
      };
      // The endpoint takes a single primary seed in the path; any additional
      // seeds ride along as repeated `anchor` params.
      const [primary, ...anchors] = seed_ids;
      const params = new URLSearchParams();
      appendParam(params, 'intent', intent);
      appendParam(params, 'mode', mode);
      appendParam(params, 'k', k);
      if (rerank != null) appendParam(params, 'rerank', rerank);
      appendParam(params, 'anchor', anchors);
      const client = getClient(session) as ClientLike;
      const res = await client.http.get<{
        results?: PaperHit[];
        poolSize?: number;
        note?: string | null;
      }>(
        withQuery(
          `${BASE}/papers/${encodeURIComponent(primary)}/similar`,
          params
        )
      );
      const note = res.data?.note ? `\nnote: ${res.data.note}` : '';
      return `${fmtHits(res.data?.results)}\n(poolSize=${res.data?.poolSize ?? 0})${note}`;
    },
  });

  // --- read_paper ---
  server.addTool({
    name: 'firecrawl_research_read_paper',
    annotations: {
      title: 'Read a paper',
      readOnlyHint: true, // Retrieves relevant full-text passages from a paper; does not modify the paper.
      openWorldHint: true, // Reads from publicly indexed paper full text when available.
      destructiveHint: false, // Read-only passage retrieval.
    },
    description:
      'Read the most relevant in-body (full-text) passages of ONE specific paper for a question. Use ' +
      'this to VERIFY whether a candidate actually satisfies a constraint before you include or ' +
      "reject it (e.g. 'does this paper actually use technique X / report a score on benchmark Y'). " +
      "Returns the best-matching passages, or a notice if the paper's full text is unavailable.",
    parameters: z.object({
      paperId: z
        .string()
        .min(1)
        .describe(
          'Canonical paperId or primaryId such as `arxiv:1706.03762`, `pmcid:PMC12530322`, `pmid:40953549`, or `doi:10.1016/j.neunet.2025.108095`.'
        ),
      question: z.string().min(1),
      k: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe('Number of passages to return (default 4).'),
    }),
    execute: async (
      args: unknown,
      { session }: { session?: SessionData; log: Logger }
    ): Promise<string> => {
      const { paperId, question, k } = args as {
        paperId: string;
        question: string;
        k?: number;
      };
      const params = new URLSearchParams();
      appendParam(params, 'query', question);
      appendParam(params, 'k', k);
      const client = getClient(session) as ClientLike;
      const res = await client.http.get<{ passages?: { text: string }[] }>(
        withQuery(`${BASE}/papers/${encodeURIComponent(paperId)}`, params)
      );
      const passages = res.data?.passages ?? [];
      return passages.length
        ? passages.map((p) => p.text).join('\n---\n')
        : '(no full-text passages available for this paper)';
    },
  });

  // --- search_github ---
  server.addTool({
    name: 'firecrawl_research_search_github',
    annotations: {
      title: 'Search GitHub history',
      readOnlyHint: true, // Searches indexed GitHub issue/PR history and READMEs; returns matches only.
      openWorldHint: true, // Searches public GitHub content.
      destructiveHint: false, // Query-only; does not create issues, PRs, or modify repositories.
    },
    description:
      'Search GitHub issue/PR history and repository readmes. Returns ranked matches with repo, ' +
      'url, a short snippet, and (when available) the full matched content in markdown.',
    parameters: z.object({
      query: z.string().min(1),
      k: z.number().int().min(1).max(100).optional(),
    }),
    execute: async (
      args: unknown,
      { session }: { session?: SessionData; log: Logger }
    ): Promise<string> => {
      const { query, k } = args as { query: string; k?: number };
      const params = new URLSearchParams();
      appendParam(params, 'query', query);
      appendParam(params, 'k', k);
      const client = getClient(session) as ClientLike;
      const res = await client.http.get<{ results?: GitHubItem[] }>(
        withQuery(`${BASE}/github`, params)
      );
      return fmtGithub(res.data?.results);
    },
  });
}
