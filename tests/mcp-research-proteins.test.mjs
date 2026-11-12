// A protein lookup prints what UniProt's curators state about one protein.
// Only an experimental statement is a measurement, so every printed statement
// has to keep its evidence label and the paper or related entry behind it, and
// a name that matches several entries has to come back as candidates, never
// as one of them.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { callExpectingError, startStdioWithApi } from './helpers/exchange-mcp.mjs';

const TOOL = 'firecrawl_research_lookup_protein';
const RPUSD3 = JSON.parse(
  readFileSync(new URL('./fixtures/protein-rpusd3.json', import.meta.url), 'utf8')
);
const NOTICE = RPUSD3.notice;
const HUMAN = { taxonId: 9606, scientificName: 'Homo sapiens', commonName: 'Human' };

const EXAMPLE = {
  success: true,
  release: '2026_04',
  match: 'found',
  protein: {
    accession: 'X00001',
    entryName: 'EXMPL_HUMAN',
    synonyms: [],
    name: 'Example protein',
    organism: HUMAN,
    matchedBy: 'accession',
    url: 'https://www.uniprot.org/uniprotkb/X00001/entry',
    subcellularLocation: [
      {
        text: 'Cytoplasm',
        note: false,
        evidence: [{ kind: 'by_similarity', eco: 'ECO:0000250', fromProtein: 'X00002' }],
      },
      {
        text: 'Membrane',
        note: false,
        molecule: 'Isoform 2',
        topology: 'Peripheral membrane protein',
        orientation: 'Cytoplasmic side',
        evidence: [{ kind: 'by_similarity', eco: 'ECO:0000250' }],
      },
      {
        text: 'Nucleus',
        note: false,
        evidence: [
          { kind: 'sequence_analysis', eco: 'ECO:0000255' },
          { kind: 'experimental', eco: 'ECO:0000269', paperId: 'pmid:1' },
        ],
      },
    ],
    function: [{ text: 'Binds example ligands.', note: false, evidence: [{ kind: 'untagged' }] }],
    goCellularComponent: [
      { id: 'GO:0005737', term: 'cytoplasm', code: 'IDA', assignedBy: 'UniProt', paperIds: [] },
    ],
    paperIds: ['pmid:1'],
  },
  notice: NOTICE,
};

async function lookup(t, apiOptions, args) {
  const { api, client } = await startStdioWithApi(t, apiOptions);
  const result = await client.request('tools/call', { name: TOOL, arguments: args });
  const request = api.requests.find((entry) =>
    entry.url.startsWith('/v2/search/research/proteins')
  );
  return {
    result,
    text: result.content.map((part) => part.text).join('\n'),
    query: new URL(request.url, 'http://127.0.0.1').searchParams,
  };
}

test('a found protein prints location, GO terms and function with evidence labels, paper IDs and the source', async (t) => {
  const { result, text, query } = await lookup(t, { protein: RPUSD3 }, {
    protein: ' RPUSD3 ',
    organism: '9606',
  });

  assert.notEqual(result.isError, true, text);
  assert.equal(
    text,
    [
      '# RPUSD3 (Q6P087, RUSD3_HUMAN), Homo sapiens',
      'Mitochondrial mRNA pseudouridine synthase RPUSD3. Matched by gene symbol.',
      '',
      'Subcellular location',
      '- Mitochondrion matrix. Experimental [pmid:27974379]',
      '- Note: Localizes to mitochondrial RNA granules, platforms for post-transcriptional RNA modification and ribosome assembly. Experimental [pmid:27974379, pmid:28082677]',
      'GO cellular component (experimental)',
      '- mitochondrial matrix (GO:0005759), IDA, FlyBase [pmid:27974379]',
      '- mitochondrion (GO:0005739), IDA, FlyBase [pmid:28082677]',
      '- ribonucleoprotein granule (GO:0035770), IDA, FlyBase [pmid:28082677]',
      'Function',
      `- ${RPUSD3.protein.function[0].text}. Experimental [pmid:27667664, pmid:27974379]`,
      'Open a cited paper with firecrawl_research_inspect_paper or firecrawl_research_read_paper.',
      `Source: https://www.uniprot.org/uniprotkb/Q6P087/entry. ${NOTICE}`,
    ].join('\n')
  );
  assert.deepEqual(result.structuredContent, RPUSD3);
  assert.deepEqual([...query], [['protein', 'RPUSD3'], ['organism', '9606']]);
});

test('experimental statements print first, and the rest keep their label, related entry and qualifiers', async (t) => {
  const { text, query } = await lookup(t, { protein: EXAMPLE }, { protein: 'X00001' });

  assert.equal(
    text,
    [
      '# X00001 (EXMPL_HUMAN), Homo sapiens',
      'Example protein. Matched by accession.',
      '',
      'Subcellular location',
      '- Nucleus. Experimental [pmid:1]; Predicted from sequence',
      '- Cytoplasm. Inferred from a related protein [X00002]',
      '- [molecule: Isoform 2] Membrane (topology: Peripheral membrane protein; orientation: Cytoplasmic side). Inferred from a related protein',
      'GO cellular component (experimental)',
      '- cytoplasm (GO:0005737), IDA, UniProt',
      'Function',
      '- Binds example ligands. No evidence tag',
      'Open a cited paper with firecrawl_research_inspect_paper or firecrawl_research_read_paper.',
      `Source: https://www.uniprot.org/uniprotkb/X00001/entry. ${NOTICE}`,
    ].join('\n')
  );
  assert.equal(query.has('organism'), false);
});

test('a field the API adds to the entry is left out of structuredContent, which the advertised schema closes', async (t) => {
  const { result } = await lookup(
    t,
    { protein: { ...EXAMPLE, protein: { ...EXAMPLE.protein, addedLater: true } } },
    { protein: 'X00001' }
  );

  assert.deepEqual(result.structuredContent, EXAMPLE);
});

test('an entry without its arrays still prints, with every block marked empty', async (t) => {
  const { accession, entryName, name, matchedBy, url } = EXAMPLE.protein;
  const { result, text } = await lookup(
    t,
    { protein: { ...EXAMPLE, protein: { accession, entryName, name, matchedBy, url } } },
    { protein: 'X00001' }
  );

  assert.notEqual(result.isError, true, text);
  assert.equal(
    text,
    [
      '# X00001 (EXMPL_HUMAN)',
      'Example protein. Matched by accession.',
      '',
      'Subcellular location',
      '- No statement in this entry.',
      'GO cellular component (experimental)',
      '- No experimental term in this entry.',
      'Function',
      '- No statement in this entry.',
      `Source: https://www.uniprot.org/uniprotkb/X00001/entry. ${NOTICE}`,
    ].join('\n')
  );
});

test('an ambiguous symbol prints its candidates and says to call again with one accession', async (t) => {
  const ambiguous = {
    success: true,
    release: '2026_04',
    match: 'ambiguous',
    candidates: [
      {
        accession: 'C0HLS1',
        entryName: 'OSCRI_HUMAN',
        gene: 'SCRIB',
        name: 'SCRIB overlapping open reading frame protein',
        organism: HUMAN,
        matchedBy: 'gene',
      },
      {
        accession: 'Q14160',
        entryName: 'SCRIB_HUMAN',
        gene: 'SCRIB',
        name: 'Protein scribble homolog',
        organism: HUMAN,
        matchedBy: 'gene',
      },
    ],
    candidateCount: 2,
    notice: NOTICE,
  };
  const { result, text } = await lookup(t, { protein: ambiguous }, { protein: 'SCRIB' });

  assert.notEqual(result.isError, true, text);
  assert.equal(
    text,
    [
      '"SCRIB" does not resolve to one UniProtKB/Swiss-Prot entry in the requested organism (human unless `organism` is set). 2 candidates, as accession, entry name, gene, name, organism:',
      '- C0HLS1, OSCRI_HUMAN, SCRIB, SCRIB overlapping open reading frame protein, Homo sapiens',
      '- Q14160, SCRIB_HUMAN, SCRIB, Protein scribble homolog, Homo sapiens',
      'Call firecrawl_research_lookup_protein again with one accession as `protein`.',
      NOTICE,
    ].join('\n')
  );
  assert.deepEqual(result.structuredContent, ambiguous);

  const truncated = await lookup(
    t,
    { protein: { ...ambiguous, candidateCount: 12 } },
    { protein: 'SCRIB' }
  );
  assert.match(truncated.text, /\. 12 candidates, the first 2 listed, as accession/);
});

test('an input that matches no entry says what to pass and names paper search for a question', async (t) => {
  const notFound = { success: true, release: '2026_04', match: 'not_found', notice: NOTICE };
  const { result, text } = await lookup(t, { protein: notFound }, {
    protein: 'where is RPUSD3 localized',
  });

  assert.notEqual(result.isError, true, text);
  assert.equal(
    text,
    'No UniProtKB/Swiss-Prot entry matches "where is RPUSD3 localized". Pass a UniProt accession (P05771), an entry name (KPCB_HUMAN), or a gene symbol with its `organism`. Only reviewed entries are covered. For a free-text question, use firecrawl_research_search_papers.'
  );
  assert.deepEqual(result.structuredContent, notFound);
});

test('an organism the API refuses reaches the agent in the API\'s words', async (t) => {
  const apiError =
    "unknown organism 'unicorn': pass an NCBI taxon ID such as 9606, a scientific name such as Homo sapiens, or a UniProt common name such as Human";
  const { result, text, query } = await lookup(
    t,
    { apiStatus: 400, apiError },
    { protein: 'RPUSD3', organism: 'unicorn' }
  );

  assert.equal(result.isError, true);
  assert.equal(text, apiError);
  assert.equal(query.get('organism'), 'unicorn');
});

test('a body that is not a lookup result is an error, never "no entry matches"', async (t) => {
  for (const body of [{ success: true, release: '2026_04', match: 'partial', notice: NOTICE }, {}]) {
    const { result, text } = await lookup(t, { protein: body }, { protein: 'RPUSD3' });

    assert.equal(result.isError, true, text);
    assert.match(text, /returned an unexpected response/);
    assert.doesNotMatch(text, /No UniProtKB\/Swiss-Prot entry matches/);
  }
});

test('an argument the tool does not take is refused, since a misspelled organism would answer for human', async (t) => {
  const { api, client } = await startStdioWithApi(t, { protein: RPUSD3 });
  await callExpectingError(client, {
    name: TOOL,
    arguments: { protein: 'RPUSD3', taxon: '10090' },
  });

  assert.equal(
    api.requests.some((entry) => entry.url.startsWith('/v2/search/research/proteins')),
    false
  );
});
