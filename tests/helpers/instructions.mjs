import assert from 'node:assert/strict';

// The instructions budget every surface must meet (see src/instructions.ts).
export const INSTRUCTIONS_MAX_CHARS = 1024;
// OpenAI asks for the key details of server instructions in the first 512 characters.
export const ROUTING_HEAD_CHARS = 512;

/**
 * Server instructions fit the cap, route search and scrape inside the first
 * 512 characters, and name only tools this session lists. A trailing `*`
 * names a family and needs at least one listed member.
 */
export function assertInstructionsMatchTools(instructions, tools, label) {
  assert.ok(instructions, `${label}: instructions are required`);
  assert.ok(
    instructions.length <= INSTRUCTIONS_MAX_CHARS,
    `${label}: instructions are ${instructions.length} characters`
  );
  const head = instructions.slice(0, ROUTING_HEAD_CHARS);
  for (const name of ['firecrawl_search', 'firecrawl_scrape']) {
    assert.ok(head.includes(name), `${label}: ${name} is routed in the first ${ROUTING_HEAD_CHARS} characters`);
  }
  const listed = tools.map((tool) => tool.name);
  for (const token of new Set(instructions.match(/firecrawl_[a-z_]+\*?/g) ?? [])) {
    const present = token.endsWith('*')
      ? listed.some((name) => name.startsWith(token.slice(0, -1)))
      : listed.includes(token);
    assert.ok(present, `${label}: instructions name ${token}, which this session does not list`);
  }
}
