import assert from 'node:assert/strict';

const WORKFLOW_COPY = /terms\/show|terms\/accept|confirmed:true|repeated attempts|reuse it only for a retry|retry the same requestId|call firecrawl_feedback once per website|after the task, report how the catalogue/i;

/**
 * `tools` names the Alexandria tools of the surface: `legacy` is
 * firecrawl_find_tools and firecrawl_scrape with an alexandria body (the
 * search surface), `dedicated` is alexandria_library_search and
 * alexandria_library_read.
 */
export function assertAlexandriaMetadata(tools, instructions, { hosted = false, tools: surface = 'legacy' } = {}) {
  assert.ok(instructions, 'Alexandria server instructions are required');
  const byName = (name) => {
    const tool = tools.find((item) => item.name === name);
    assert.ok(tool, `${name} must be registered`);
    return tool;
  };
  const scrape = byName('firecrawl_scrape');
  assert.equal(scrape.annotations.readOnlyHint, hosted);

  const execute = surface === 'dedicated' ? byName('alexandria_library_read') : scrape;
  const { requestId, alexandria } = execute.inputSchema?.properties ?? {};
  assert.ok(requestId?.description, `${execute.name}.requestId needs a description`);
  assert.match(requestId.description, /idempotency key.*payload/i);
  assert.match(requestId.description, /generated when omitted and returned with the result/i);

  // Where the execution contract is described: the alexandria parameter, or the dedicated tool itself.
  const contract = surface === 'dedicated' ? execute.description : alexandria?.description;
  assert.ok(contract, `${execute.name} needs an execution contract description`);
  if (surface === 'dedicated') {
    for (const name of ['alexandria', 'url']) assert.equal(name in execute.inputSchema.properties, false, name);
    for (const name of ['alexandria', 'requestId']) assert.equal(name in scrape.inputSchema.properties, false, name);
    assert.equal(execute.annotations.readOnlyHint, true);
    assert.match(byName('firecrawl_find_tools').description, /execution through firecrawl_scrape/);
    assert.ok(execute.inputSchema.properties.calls?.description, 'alexandria_library_read.calls needs a description');
    assert.match(contract, /one result per call, in the same order, in data\.alexandria/i);
  } else {
    assert.match(contract, /mutually exclusive with url/);
    assert.match(contract, /array of 1-10/);
    assert.match(contract, /per-capability results in data\.alexandria/);
  }
  assert.doesNotMatch(contract, /API key on a team with Alexandria enabled|Alexandria access needs an API key/i);
  assert.match(contract, /Some providers require accepted terms/i);
  assert.match(contract, /direct the user to the Firecrawl dashboard URL/i);

  const descriptions = [instructions];
  const named = surface === 'dedicated'
    ? ['firecrawl_search', 'firecrawl_scrape', 'alexandria_library_read', 'alexandria_library_search']
    : ['firecrawl_search', 'firecrawl_scrape', 'firecrawl_find_tools'];
  for (const name of named) {
    const tool = byName(name);
    assert.ok(tool.outputSchema?.properties, `${name} must expose output property metadata`);
    descriptions.push(tool.description ?? '');
    for (const schema of [tool.inputSchema, tool.outputSchema]) {
      for (const field of Object.values(schema?.properties ?? {})) {
        if (field.description) descriptions.push(field.description);
      }
    }
  }
  for (const description of descriptions) assert.doesNotMatch(description, WORKFLOW_COPY);
}
