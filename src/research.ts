/**
 * Firecrawl Research tools (experimental).
 *
 * Thin MCP wrappers over the `/v2/search/research/*` paper and protein endpoints.
 *
 * Calls the endpoints directly through the SDK's HTTP layer (auth + retries)
 * via `client.http.get(...)`, mirroring how the search tool reaches
 * `/v2/search`, so the tools' request and response shapes stay under this
 * server's control.
 */

import { z } from 'zod';
import { type ContentResult, type McpRuntime, UserError } from './mcp/runtime.js';
import { originHeaders, requestOrigin } from './origin';
import { relayBadRequest } from './tool-helpers';
import {
  deprecatedToolOutputSchema,
  researchPaperOutputSchema,
  researchProteinOutputSchema,
  researchReadOutputSchema,
  researchRelatedOutputSchema,
  researchSearchOutputSchema,
  withStructured,
} from './tool-output';

interface SessionData {
  firecrawlApiKey?: string;
  /** The User-Agent the session was authenticated with (see src/origin.ts). */
  clientUserAgent?: string;
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

// Max authors to print per paper; the rest collapse to a tail so a large
// collaboration doesn't flood the context.
const MAX_AUTHORS = 15;
// Cap each abstract so a page of hits stays within the MCP output-token limit.
const MAX_ABSTRACT_CHARS = 600;
// Hard ceiling on the whole authors line, as a final guard.
const MAX_AUTHORS_LINE_CHARS = 400;

interface PaperHit {
  paperId?: string;
  primaryId?: string;
  ids?: Record<string, string[]>;
  title?: string;
  abstract?: string;
  authors?: string | string[];
  categories?: string[];
  createdDate?: string;
  updateDate?: string;
}

/** Display id supplied by the API, already ordered for citation/fetch use. */
function displayId(p: PaperHit): string {
  return p.primaryId ?? 'missing-primary-id';
}

function fmtAuthors(authors?: PaperHit['authors']): string | null {
  if (!authors) return null;
  const names = (typeof authors === 'string' ? authors.split(',') : authors)
    .map((name) => name.trim())
    .filter(Boolean);
  if (names.length === 0) return null;
  const extra =
    names.length > MAX_AUTHORS
      ? typeof authors === 'string'
        ? `; +${names.length - MAX_AUTHORS} more`
        : '; et al.'
      : '';
  return (
    ('Authors: ' + names.slice(0, MAX_AUTHORS).join('; ')).slice(
      0,
      MAX_AUTHORS_LINE_CHARS - extra.length
    ) + extra
  );
}

function fmtDates(paper: PaperHit): string | null {
  const dates = [
    paper.createdDate ? `created ${paper.createdDate}` : '',
    paper.updateDate ? `updated ${paper.updateDate}` : '',
  ]
    .filter(Boolean)
    .join('; ');
  return dates ? `Dates: ${dates}` : null;
}

/** Render ranked papers as `[id] title` / authors / abstract blocks. */
function fmtHits(results?: PaperHit[]): string {
  if (!results || results.length === 0) return '(no results)';
  return results
    .map((r) => {
      const lines = [`## [${displayId(r)}] ${r.title ?? '(untitled)'}`];
      const authors = fmtAuthors(r.authors);
      if (authors) lines.push(authors);
      const dates = fmtDates(r);
      if (dates) lines.push(dates);
      lines.push(
        (r.abstract || '(no abstract)')
          .replace(/\s+/g, ' ')
          .slice(0, MAX_ABSTRACT_CHARS)
      );
      return lines.join('\n');
    })
    .join('\n\n');
}

/**
 * The research API answers a paper ID it does not know with 404, which the
 * HTTP client raises as a bare "Request failed with status code 404". Inspect
 * and read report it as a paper that was not found, as their output schemas
 * describe, so the agent learns the ID is wrong. Null means not found.
 */
async function paperRequest<T>(
  request: () => Promise<{ data: T }>
): Promise<{ data: T } | null> {
  try {
    return await request();
  } catch (error) {
    const response = (error as {
      response?: { status?: unknown; data?: { success?: unknown; code?: unknown; error?: unknown } };
    })?.response;
    if (
      response?.status === 404 &&
      response.data?.success === false &&
      response.data.code === 'NOT_FOUND' &&
      response.data.error === 'paper metadata not found'
    ) return null;
    throw error;
  }
}

function paperNotFound(paperId: string): string {
  return `(paper not found: no indexed paper has the ID ${JSON.stringify(paperId)}. Use a paperId or primaryId from firecrawl_research_search_papers results.)`;
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

  const dates = fmtDates(paper);
  if (dates) lines.push(dates);

  lines.push('');
  lines.push('## Abstract');
  lines.push((paper.abstract || '(no abstract)').replace(/\s+/g, ' '));
  return lines.join('\n');
}

interface ProteinEvidence {
  kind: string;
  paperId?: string;
  fromProtein?: string;
}

interface ProteinStatement {
  text?: string;
  note?: boolean;
  molecule?: string;
  topology?: string;
  orientation?: string;
  evidence: ProteinEvidence[];
}

interface ProteinGoTerm {
  id?: string;
  term?: string;
  code?: string;
  assignedBy?: string;
  paperIds: string[];
}

interface ProteinCandidate {
  accession?: string;
  entryName?: string;
  gene?: string;
  name?: string;
  organism?: { scientificName?: string };
  matchedBy?: string;
}

interface ProteinEntry extends ProteinCandidate {
  url?: string;
  subcellularLocation: ProteinStatement[];
  function: ProteinStatement[];
  goCellularComponent: ProteinGoTerm[];
  paperIds: string[];
}

interface ProteinLookup {
  release?: string;
  notice?: string;
  match?: string;
  protein?: ProteinEntry;
  candidates?: ProteinCandidate[];
  candidateCount?: number;
}

const EVIDENCE_LABELS: Record<string, string> = {
  experimental: 'Experimental',
  large_scale_experimental: 'Experimental, large-scale',
  author_statement: 'Author statement',
  curator_inference: 'Curator inference',
  by_similarity: 'Inferred from a related protein',
  sequence_analysis: 'Predicted from sequence',
  imported: 'Imported from another database',
  untagged: 'No evidence tag',
};

const MATCHED_BY_LABELS: Record<string, string> = {
  accession: 'accession',
  secondary_accession: 'secondary accession',
  entry_name: 'entry name',
  gene: 'gene symbol',
  synonym: 'gene synonym',
  name: 'protein name',
};

const isMeasured = (kind: string) =>
  kind === 'experimental' || kind === 'large_scale_experimental';

function measuredFirst<T>(items: T[], measured: (item: T) => boolean): T[] {
  return [...items.filter(measured), ...items.filter((item) => !measured(item))];
}

const fmtIds = (ids: string[]) => (ids.length ? ` [${ids.join(', ')}]` : '');

function fmtEvidence(evidence: ProteinEvidence[]): string {
  const idsByKind = new Map<string, string[]>();
  for (const { kind, paperId, fromProtein } of evidence) {
    const ids = idsByKind.get(kind) ?? [];
    const id = paperId ?? fromProtein;
    if (id && !ids.includes(id)) ids.push(id);
    idsByKind.set(kind, ids);
  }
  return measuredFirst([...idsByKind], ([kind]) => isMeasured(kind))
    .map(([kind, ids]) => `${EVIDENCE_LABELS[kind] ?? kind}${fmtIds(ids)}`)
    .join('; ');
}

function fmtStatements(statements: ProteinStatement[]): string[] {
  if (!statements.length) return ['- No statement in this entry.'];
  return measuredFirst(statements, (statement) =>
    statement.evidence.some(({ kind }) => isMeasured(kind))
  ).map((statement) => {
    const qualifiers = [
      statement.topology && `topology: ${statement.topology}`,
      statement.orientation && `orientation: ${statement.orientation}`,
    ]
      .filter(Boolean)
      .join('; ');
    return [
      '- ',
      statement.molecule ? `[molecule: ${statement.molecule}] ` : '',
      statement.note ? 'Note: ' : '',
      (statement.text ?? '').replace(/\.$/, ''),
      qualifiers ? ` (${qualifiers})` : '',
      `. ${fmtEvidence(statement.evidence)}`,
    ].join('');
  });
}

function fmtProtein(notice: string | undefined, protein: ProteinEntry): string {
  const ids = protein.gene
    ? `${protein.gene} (${protein.accession}, ${protein.entryName})`
    : `${protein.accession} (${protein.entryName})`;
  const matchedBy = protein.matchedBy ?? '';
  const lines = [
    `# ${[ids, protein.organism?.scientificName].filter(Boolean).join(', ')}`,
    `${protein.name}. Matched by ${MATCHED_BY_LABELS[matchedBy] ?? matchedBy}.`,
    '',
    'Subcellular location',
    ...fmtStatements(protein.subcellularLocation),
    'GO cellular component (experimental)',
    ...(protein.goCellularComponent.length
      ? protein.goCellularComponent.map(
          (go) =>
            `- ${go.term} (${go.id}), ${go.code}, ${go.assignedBy}${fmtIds(go.paperIds)}`
        )
      : ['- No experimental term in this entry.']),
    'Function',
    ...fmtStatements(protein.function),
  ];
  if (protein.paperIds.length) {
    lines.push(
      'Open a cited paper with firecrawl_research_inspect_paper or firecrawl_research_read_paper.'
    );
  }
  lines.push(`Source: ${protein.url}. ${notice}`);
  return lines.join('\n');
}

function fmtProteinLookup(protein: string, data?: ProteinLookup): string {
  if (data?.match === 'found' && data.protein) {
    return fmtProtein(data.notice, data.protein);
  }
  if (data?.match === 'ambiguous') {
    const candidates = data.candidates ?? [];
    const candidateCount = data.candidateCount ?? candidates.length;
    const listed =
      candidateCount > candidates.length
        ? `${candidateCount} candidates, the first ${candidates.length} listed`
        : `${candidateCount} ${candidateCount === 1 ? 'candidate' : 'candidates'}`;
    return [
      `${JSON.stringify(protein)} does not resolve to one UniProtKB/Swiss-Prot entry in the requested organism (human unless \`organism\` is set). ${listed}, as accession, entry name, gene, name, organism:`,
      ...candidates.map(
        (candidate) =>
          `- ${[candidate.accession, candidate.entryName, candidate.gene ?? '-', candidate.name, candidate.organism?.scientificName].join(', ')}`
      ),
      'Call firecrawl_research_lookup_protein again with one accession as `protein`.',
      data.notice,
    ].join('\n');
  }
  // Any other body would read as "no entry matches", a false negative for a protein that exists.
  if (data?.match !== 'not_found') {
    throw new Error(
      `The protein lookup returned an unexpected response (match: ${JSON.stringify(data?.match)}).`
    );
  }
  return `No UniProtKB/Swiss-Prot entry matches ${JSON.stringify(protein)}. Pass a UniProt accession (P05771), an entry name (KPCB_HUMAN), or a gene symbol with its \`organism\`. Only reviewed entries are covered. For a free-text question, use firecrawl_research_search_papers.`;
}

function deprecatedGithubPayload() {
  return {
    code: 'DEPRECATED_TOOL',
    message:
      "firecrawl_research_search_github is deprecated and unavailable through MCP. Use firecrawl_developer_search, which searches GitHub issues, pull requests, and READMEs plus code documentation and returns matched passages. It does not carry over this tool's score breakdown or its web fallback results.",
    replacement: {
      name: 'firecrawl_developer_search',
      instructions:
        'Pass the same natural-language query. Optionally set k to control the number of results, or set skills to "only" to search only agent-skill files.',
      example_arguments: {
        query: 'pysam VCF parsing memory leak',
      },
    },
    docs_url: 'https://docs.firecrawl.dev/features/developer',
  };
}

export function registerResearchTools(
  server: Pick<McpRuntime<SessionData>, 'addTool'>,
  getClient: GetClient
): void {
  // --- search_papers ---
  server.addTool({
    name: 'firecrawl_research_search_papers',
    annotations: {
      title: 'Firecrawl research paper search',
      readOnlyHint: true, // Semantic search over indexed paper metadata; returns ranked results only.
      openWorldHint: true, // Searches the Firecrawl research paper index.
      destructiveHint: false, // Query-only; no writes to external sources or the research index.
    },
    description: `
Search paper metadata and abstracts with a natural-language query across the indexed corpus, which spans biomedical, life-science, and clinical literature (PubMed, bioRxiv, medRxiv) alongside arXiv and other scientific sources. Optional author, category, date, and sort options constrain or reorder results.

Several distinct framings of the same question surface different papers than a single query does.

Returns ranked papers with canonical IDs, titles, authors, and abstracts.
`,
    outputSchema: researchSearchOutputSchema,
    parameters: z.object({
      query: z
        .string()
        .min(1)
        .describe(
          'Natural-language research topic or question, including methods, systems, conditions, ' +
            'populations, interventions, or outcomes when relevant.'
        ),
      k: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe('Number of ranked papers to return (default 40).'),
      authors: z
        .array(z.string())
        .optional()
        .describe(
          'Author substring filter(s); ALL must match (case-insensitive).'
        ),
      categories: z
        .array(z.string())
        .optional()
        .describe(
          'Paper category filter(s) (e.g. `cs.LG`); ALL provided values must match.'
        ),
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
      sort: z
        .enum(['relevance', 'date_desc'])
        .optional()
        .describe(
          '`relevance` (default) or `date_desc`, which returns the newest of the most relevant matches, newest first by created date. It does not list every paper in a date range; add `from` (and `to`) for that.'
        ),
    }),
    execute: async (
      args: unknown,
      { session, client: mcpClient }
    ): Promise<ContentResult> => {
      const { query, k, authors, categories, from, to, sort } = args as {
        query: string;
        k?: number;
        authors?: string[];
        categories?: string[];
        from?: string;
        to?: string;
        sort?: 'relevance' | 'date_desc';
      };
      const params = new URLSearchParams();
      appendParam(params, 'query', query);
      appendParam(params, 'k', k);
      appendParam(params, 'authors', authors);
      appendParam(params, 'categories', categories);
      appendParam(params, 'from', from);
      appendParam(params, 'to', to);
      appendParam(params, 'sort', sort);
      const client = getClient(session) as ClientLike;
      const res = await client.http.get<{ results?: PaperHit[] }>(
        withQuery(`${BASE}/papers`, params),
        originHeaders(requestOrigin(mcpClient, session))
      );
      const results = res.data?.results ?? [];
      return withStructured(fmtHits(results), { results });
    },
  });

  // --- inspect_paper ---
  server.addTool({
    name: 'firecrawl_research_inspect_paper',
    annotations: {
      title: 'Firecrawl inspect research paper',
      readOnlyHint: true, // Fetches canonical metadata (title, abstract, authors) for one paper by ID.
      openWorldHint: true, // Retrieves metadata for papers in public indexes (arXiv, PMC, DOI, etc.).
      destructiveHint: false, // Read-only metadata lookup.
    },
    description: `
Retrieve canonical metadata for one paper ID, such as an arXiv, PMC, PMID, or DOI identifier. Returns the title, abstract, authors, categories, source IDs, and dates as markdown.
`,
    outputSchema: researchPaperOutputSchema,
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
      { session, client: mcpClient }
    ): Promise<ContentResult> => {
      const { paperId } = args as { paperId: string };
      const client = getClient(session) as ClientLike;
      const res = await paperRequest(() =>
        client.http.get<{ paper?: PaperHit }>(
          `${BASE}/papers/${encodeURIComponent(paperId)}`,
          originHeaders(requestOrigin(mcpClient, session))
        )
      );
      if (!res) return withStructured(paperNotFound(paperId), {});
      const paper = res.data?.paper;
      return withStructured(
        fmtPaperMetadata(paper),
        paper ? { paper } : {}
      );
    },
  });

  // --- related_papers ---
  server.addTool({
    name: 'firecrawl_research_related_papers',
    annotations: {
      title: 'Firecrawl related research papers',
      readOnlyHint: true, // Finds related papers via citation graph expansion; returns candidates only.
      openWorldHint: true, // Traverses relationships across the public research paper corpus.
      destructiveHint: false, // Read-only graph query; no modifications.
    },
    description: `
Find citation-graph candidates from one to ten \`seed_ids\`; the first ID is the primary seed and later IDs are anchors. \`mode\` defaults to \`similar\` (co-citation/bibliographic coupling); \`citers\` returns papers citing a seed and \`references\` papers cited by a seed. \`intent\` ranks candidates.

Returns ranked candidates and the evaluated pool size.
`,
    outputSchema: researchRelatedOutputSchema,
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
      { session, client: mcpClient }
    ): Promise<ContentResult> => {
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
        ),
        originHeaders(requestOrigin(mcpClient, session))
      );
      const results = res.data?.results ?? [];
      const poolSize = res.data?.poolSize ?? 0;
      const note = res.data?.note ? `\nnote: ${res.data.note}` : '';
      return withStructured(
        `${fmtHits(results)}\n(poolSize=${poolSize})${note}`,
        { results, poolSize, ...(res.data?.note ? { note: res.data.note } : {}) }
      );
    },
  });

  // --- read_paper ---
  server.addTool({
    name: 'firecrawl_research_read_paper',
    annotations: {
      title: 'Firecrawl read research paper',
      readOnlyHint: true, // Retrieves relevant full-text passages from a paper; does not modify the paper.
      openWorldHint: true, // Reads from publicly indexed paper full text when available.
      destructiveHint: false, // Read-only passage retrieval.
    },
    description: `
Retrieve in-body passages from one paper that are relevant to a specific question. Full text is available only for indexed papers; \`k\` controls the number of passages.

Returns matching passages or a notice when full text is unavailable.
`,
    outputSchema: researchReadOutputSchema,
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
      { session, client: mcpClient }
    ): Promise<ContentResult> => {
      const { paperId, question, k } = args as {
        paperId: string;
        question: string;
        k?: number;
      };
      const params = new URLSearchParams();
      appendParam(params, 'query', question);
      appendParam(params, 'k', k);
      const client = getClient(session) as ClientLike;
      const res = await paperRequest(() =>
        client.http.get<{ passages?: { text: string }[] }>(
          withQuery(`${BASE}/papers/${encodeURIComponent(paperId)}`, params),
          originHeaders(requestOrigin(mcpClient, session))
        )
      );
      if (!res) return withStructured(paperNotFound(paperId), { passages: [] });
      const passages = res.data?.passages ?? [];
      return withStructured(
        passages.length
          ? passages.map((p) => p.text).join('\n---\n')
          : '(no full-text passages available for this paper)',
        { passages }
      );
    },
  });

  server.addTool({
    name: 'firecrawl_research_lookup_protein',
    annotations: {
      title: 'Firecrawl protein lookup',
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
    description: `
Look up one protein in UniProtKB/Swiss-Prot, the reviewed section of UniProt, and return what its curators state: subcellular location, function, and GO cellular-component terms. Use this when the question is where a named protein is located in the cell, what it does, or which compartment terms it has, and you have a UniProt accession (P05771), an entry name (KPCB_HUMAN), a gene symbol (PRKCB), or the exact protein name. One protein per call; \`organism\` defaults to human.

Each location and function statement carries an evidence label and, where UniProt cites one, a \`pmid:\` paper ID. Among these statements, only those whose label starts with "Experimental" are measurements. Every other label, such as "Inferred from a related protein", "Curator inference", "Predicted from sequence", or "No evidence tag", is not, so report the label with the statement. The GO cellular-component terms carry no such label. Every GO term listed has experimental evidence, shown by its GO code (IDA and the like) and the group that assigned it. When a location statement and a GO term name the same compartment with different evidence, say which one the compartment rests on, for example "curated location has no evidence tag; GO term mitochondrion is experimental, IDA, HPA". Open a cited paper with firecrawl_research_inspect_paper or firecrawl_research_read_paper.

Not for free-text questions, topics, diseases, or lists of proteins (use firecrawl_research_search_papers), and not for structures, compounds, interactions, or unreviewed entries. If a symbol names several proteins, the result lists candidates; call again with one accession.
`,
    outputSchema: researchProteinOutputSchema,
    parameters: z.strictObject({
      protein: z
        .string()
        .trim()
        .min(1)
        .max(200)
        .describe(
          'One protein identifier: a UniProt accession (`P05771`; an isoform ID such as `P05771-2` resolves to its entry), an entry name (`KPCB_HUMAN`), a gene symbol (`PRKCB`), or the exact protein name (`Protein kinase C beta type`). Not a question or a sentence.'
        ),
      organism: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe(
          'Organism that scopes a gene symbol or protein name: an NCBI taxon ID (`10090`), a scientific name (`Mus musculus`), or a UniProt common name (`Mouse`). Defaults to human (`9606`). Accessions and entry names ignore it.'
        ),
    }),
    execute: async (
      args: unknown,
      { session, client: mcpClient }
    ): Promise<ContentResult> => {
      const { protein, organism } = args as {
        protein: string;
        organism?: string;
      };
      const params = new URLSearchParams();
      appendParam(params, 'protein', protein);
      appendParam(params, 'organism', organism);
      const client = getClient(session) as ClientLike;
      const res = await client.http
        .get<ProteinLookup>(
          withQuery(`${BASE}/proteins`, params),
          originHeaders(requestOrigin(mcpClient, session))
        )
        .catch(relayBadRequest);
      return withStructured(fmtProteinLookup(protein, res.data), res.data);
    },
  });

  // --- search_github: deprecated compatibility entry point ---
  // Hidden from tools/list so new sessions never see it, still callable so a
  // session holding a cached tool list gets a pointer to the replacement
  // instead of an unknown-tool error. Same shape as firecrawl_extract.
  // Hiding or removing a tool here also changes the search surface's
  // published tool list; see the note on SEARCH_PROFILE_TOOLS in index.ts.
  server.addTool({
    name: 'firecrawl_research_search_github',
    annotations: {
      title: 'Firecrawl GitHub history search',
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
    description: `
Deprecated compatibility entry point. Use firecrawl_developer_search for GitHub issues, pull requests, and READMEs, plus code documentation, returned as matched passages.
`,
    outputSchema: deprecatedToolOutputSchema,
    parameters: z.object({
      query: z.string().min(1),
      k: z.number().int().min(1).max(100).optional(),
    }),
    canList: () => false,
    beforeValidate: () => {
      const payload = deprecatedGithubPayload();
      return {
        content: [{ type: 'text' as const, text: payload.message }],
        isError: true,
        structuredContent: payload,
      };
    },
    execute: async (): Promise<string> => {
      const payload = deprecatedGithubPayload();
      throw new UserError(payload.message, payload);
    },
  });
}
