# Research scientific papers

Use the paper index for scientific literature, including biomedical and arXiv
papers. Ordinary `firecrawl_search` with the research category filters web
sources; it does not query the same paper index.

- `firecrawl_research_search_papers` finds papers from a natural-language query.
  Add author, category, or date filters when the request requires them.
- `firecrawl_research_inspect_paper` retrieves canonical metadata for a known
  `paperId`. Reuse identifiers returned by search or supplied by the user.
- `firecrawl_research_related_papers` expands from `seed_ids` using the requested
  relationship: similar work, citing papers, or references. Its `intent` states
  what the related work should address.
- `firecrawl_research_read_paper` retrieves full-text passages relevant to a
  `question` about one `paperId`.

Choose the operations needed for the question; a known paper does not require
another discovery search. Verify substantive claims with relevant passages when
available. If full text is unavailable, label conclusions based on the abstract
or metadata and use `firecrawl_scrape` on an accessible source URL when helpful.

Cite paper URLs or persistent identifiers. Distinguish a paper's claims from
your synthesis and do not describe a partial search as an exhaustive review.
