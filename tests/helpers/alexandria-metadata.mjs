import assert from 'node:assert/strict';

export function assertAlexandriaMetadata(tools, instructions) {
  assert.ok(instructions, 'Alexandria server instructions are required');
  const scrape = tools.find((tool) => tool.name === 'firecrawl_scrape');
  assert.ok(scrape, 'firecrawl_scrape must be registered');
  const { requestId, alexandria } = scrape.inputSchema?.properties ?? {};
  assert.ok(requestId?.description, 'firecrawl_scrape.requestId needs a description');
  assert.ok(alexandria?.description, 'firecrawl_scrape.alexandria needs a description');
  assert.equal(scrape.annotations.readOnlyHint, false);
  assert.match(requestId.description, /identical payload.*same ID/i);
  assert.match(requestId.description, /new ID cannot reconcile a pending or uncertain execution/i);
  assert.match(requestId.description, /request_in_flight.*pending/);
  assert.match(requestId.description, /request_unresolved.*reconciliation under the same ID/);
  assert.match(alexandria.description, /mutually exclusive with url/);
  assert.match(alexandria.description, /array of 1-10/);
  assert.match(alexandria.description, /terms\/show.*terms\/accept/);
  assert.match(alexandria.description, /explicit user authorization for the reviewed version and digest and confirmed:true/);
  assert.match(alexandria.description, /data request does not authorize acceptance/i);
  assert.match(alexandria.description, /execution remains blocked until acceptance is confirmed/i);

  const descriptions = [instructions];
  for (const name of ['firecrawl_search', 'firecrawl_scrape', 'firecrawl_find_tools']) {
    const tool = tools.find((item) => item.name === name);
    assert.ok(tool, `${name} must be registered`);
    descriptions.push(tool.description ?? '');
    for (const field of Object.values(tool.inputSchema?.properties ?? {})) {
      if (field.description) descriptions.push(field.description);
    }
  }
  for (const description of descriptions) {
    assert.doesNotMatch(description, /follow the returned terms\/show and terms\/accept|retry the same requestId later|call firecrawl_feedback once per website|after the task, report how the catalogue/i);
  }
}
