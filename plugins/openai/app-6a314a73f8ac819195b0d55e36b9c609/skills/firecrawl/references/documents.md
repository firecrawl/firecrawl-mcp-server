# Parse a document

Use `firecrawl_parse` for a supported local document. For a remote web URL,
use `firecrawl_scrape` instead.

The hosted MCP server cannot read the user's filesystem directly:

1. Call `firecrawl_parse` with `filePath` to receive upload instructions.
2. Upload the file's bytes using the returned method, URL, headers, and form
   fields through a file-transfer capability available in the host. The returned
   upload command handles these details when a local shell is available.
3. Call `firecrawl_parse` with the returned `uploadRef` and requested output
   options. Do not send `filePath` and `uploadRef` together.

Keep the upload reference and upload URL out of the final answer. If the host
cannot access or upload the file, explain that limitation; a local path alone
does not complete the upload.

Read the final parse result before answering. Choose markdown for text, targeted
questions for specific passages, or JSON for structured fields. Bound large PDF
requests with `pdfOptions.maxPages` when only part of the document is needed.
