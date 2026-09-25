import assert from 'node:assert/strict';

export function assertAlexandriaMetadata(tools, instructions) {
  assert.ok(instructions, 'Alexandria server instructions are required');
  const scrape = tools.find((tool) => tool.name === 'firecrawl_scrape');
  assert.ok(scrape, 'firecrawl_scrape must be registered');
  const { requestId, alexandria } = scrape.inputSchema?.properties ?? {};
  assert.ok(requestId?.description, 'firecrawl_scrape.requestId needs a description');
  assert.ok(alexandria?.description, 'firecrawl_scrape.alexandria needs a description');
  assert.equal(scrape.annotations.readOnlyHint, false);
  assert.match(requestId.description, /idempotency key.*payload/i);
  assert.match(requestId.description, /generated when omitted and returned with the result/i);
  assert.match(alexandria.description, /mutually exclusive with url/);
  assert.match(alexandria.description, /array of 1-10/);
  assert.match(alexandria.description, /per-capability results in data\.alexandria/);
  assert.match(alexandria.description, /blocked requests return the applicable requirements/i);

  const descriptions = [instructions];
  for (const name of ['firecrawl_search', 'firecrawl_scrape', 'firecrawl_find_tools']) {
    const tool = tools.find((item) => item.name === name);
    assert.ok(tool, `${name} must be registered`);
    assert.ok(tool.outputSchema?.properties, `${name} must expose output property metadata`);
    descriptions.push(tool.description ?? '');
    for (const schema of [tool.inputSchema, tool.outputSchema]) {
      for (const field of Object.values(schema?.properties ?? {})) {
        if (field.description) descriptions.push(field.description);
      }
    }
  }
  for (const description of descriptions) {
    assert.doesNotMatch(description, /terms\/show|terms\/accept|confirmed:true|repeated attempts|reuse it only for a retry|retry the same requestId|call firecrawl_feedback once per website|after the task, report how the catalogue/i);
  }
}
