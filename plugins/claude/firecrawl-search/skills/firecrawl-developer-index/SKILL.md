---
name: firecrawl-developer-index
description: Find documentation and repository evidence for library behavior, API contracts, error messages, and known bugs. Use when a programming question needs current public documentation, issues, pull requests, or implementation examples.
---

# Developer research

Use the connected `firecrawl_developer_search` tool. If it is deferred, discover
it with the host's tool search. Include the library, version, and exact error or
symbol when known. Read the returned matched passages and source URLs.

Distinguish official documentation from issues, proposals, and merged pull
requests. A merged fix does not establish that it shipped in the user's version.
Use `firecrawl_scrape` on a source URL when the passage lacks the needed context.
Use `firecrawl_search` when the relevant source is outside the index or the index
does not resolve the question.

Answer from the retrieved evidence, cite the relevant sources, and state any
unverified version or release boundary. Respect the user's source and tool
choices. If the connection is unavailable, report the limitation; this skill
does not require a CLI.
