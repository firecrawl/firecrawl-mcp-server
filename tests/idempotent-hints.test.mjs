import assert from 'node:assert/strict';
import test from 'node:test';
import { startStdio } from './helpers/exchange-mcp.mjs';

// idempotentHint is true only when repeating a call changes nothing on the
// account: no job, no record and no billing. Tools that start a job, write a
// record or spend credits declare false. Every default tool has an explicit
// expectation, so a new tool or a changed value has to be decided here.
const EXPECTED = {
  firecrawl_agent: false,
  firecrawl_agent_status: true,
  firecrawl_check_crawl_status: true,
  firecrawl_crawl: false,
  firecrawl_credit_usage: true,
  firecrawl_developer_search: false,
  firecrawl_feedback: false,
  firecrawl_find_tools: true,
  firecrawl_gov_search: true,
  firecrawl_interact: false,
  firecrawl_interact_stop: true,
  firecrawl_map: false,
  firecrawl_monitor_check: true,
  firecrawl_monitor_checks: true,
  firecrawl_monitor_create: false,
  firecrawl_monitor_delete: true,
  firecrawl_monitor_get: true,
  firecrawl_monitor_list: true,
  firecrawl_monitor_run: false,
  firecrawl_monitor_update: true,
  firecrawl_parse: false,
  firecrawl_research_inspect_paper: false,
  firecrawl_research_read_paper: false,
  firecrawl_research_related_papers: false,
  firecrawl_research_search_papers: false,
  firecrawl_scrape: false,
  firecrawl_search: false,
  firecrawl_search_feedback: true,
};

// The feedback tools are left out when either opt-out is set, so clear them
// for this server instead of inheriting the caller's environment.
const ENV = {
  CLOUD_SERVICE: 'false',
  FIRECRAWL_API_KEY: 'fc-idempotent-hints-test',
  FIRECRAWL_API_URL: 'http://127.0.0.1:9',
  FIRECRAWL_DISABLE_ENDPOINT_FEEDBACK: '',
  FIRECRAWL_DISABLE_SEARCH_FEEDBACK: '',
  FIRECRAWL_NO_ENDPOINT_FEEDBACK: '',
  FIRECRAWL_NO_SEARCH_FEEDBACK: '',
};

test('every default tool declares the expected idempotentHint', async (t) => {
  const { client } = await startStdio(t, ENV);
  const { tools } = await client.request('tools/list', {});
  const actual = Object.fromEntries(
    tools.map((tool) => [tool.name, tool.annotations?.idempotentHint])
  );
  assert.deepEqual(actual, EXPECTED);
});
