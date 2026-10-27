// Clients that retry, replay or resume tool calls read idempotentHint from the
// tools/list annotations, so the hint must reach an official 2.x SDK client.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { createFirecrawlMcpServer } from '../dist/server.js';
import { getFreePort } from './helpers/exchange-mcp.mjs';

const IDEMPOTENT = {
  firecrawl_crawl: false,
  firecrawl_agent: false,
  firecrawl_interact: false,
  firecrawl_interact_stop: true,
  firecrawl_monitor_create: false,
  firecrawl_monitor_update: true,
  firecrawl_monitor_delete: true,
  firecrawl_monitor_run: false,
};

test('state-changing tools list idempotentHint to a 2.x SDK client', async (t) => {
  const port = await getFreePort();
  const instance = createFirecrawlMcpServer({
    transport: 'httpStream',
    unstable_hooks: {
      authenticate: async () => ({
        authType: 'api-key',
        firecrawlApiKey: 'fc-test',
      }),
    },
  });
  await instance.start({
    transportType: 'httpStream',
    httpStream: { port, host: '127.0.0.1', endpoint: '/mcp', stateless: true },
  });
  t.after(() => instance.stop());
  const client = new Client({
    name: 'tool-annotations-test',
    version: '1.0.0',
  });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`))
  );
  t.after(() => client.close());

  const { tools } = await client.listTools();
  const annotations = Object.fromEntries(
    tools.map((tool) => [tool.name, tool.annotations ?? {}])
  );
  for (const [name, idempotent] of Object.entries(IDEMPOTENT)) {
    assert.ok(annotations[name], `${name} is listed`);
    assert.equal(
      annotations[name].idempotentHint,
      idempotent,
      `${name} idempotentHint`
    );
    assert.equal(
      annotations[name].readOnlyHint,
      false,
      `${name} changes state`
    );
  }
  assert.equal(
    annotations.firecrawl_interact.destructiveHint,
    true,
    'firecrawl_interact can change data on the target site'
  );
  for (const name of ['firecrawl_feedback', 'firecrawl_search_feedback']) {
    assert.ok(annotations[name], `${name} is listed`);
    assert.equal(
      annotations[name].idempotentHint,
      undefined,
      `${name} states no idempotentHint`
    );
  }
});
