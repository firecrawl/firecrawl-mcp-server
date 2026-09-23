import assert from 'node:assert/strict';

export function assertAlexandriaMetadata(tools, instructions = '') {
  const scrape = tools.find((tool) => tool.name === 'firecrawl_scrape');
  const { requestId, alexandria } = scrape.inputSchema.properties;
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
  function collect(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'description' && typeof child === 'string') descriptions.push(child);
      else collect(child);
    }
  }
  collect(tools);
  for (const description of descriptions) {
    assert.doesNotMatch(description, /follow the returned terms\/show and terms\/accept|retry the same requestId later|call firecrawl_feedback once per website|after the task, report how the catalogue/i);
    const paragraphs = description.split('\n').map((line) => line.trim()).filter(Boolean);
    assert.equal(new Set(paragraphs).size, paragraphs.length, 'metadata has no duplicate paragraphs');
  }
}
