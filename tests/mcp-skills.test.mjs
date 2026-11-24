// The Skills extension (SEP-2640) on protocol revision 2026-07-28: skills an
// embedder passes in `unstable_hooks.skills` are listed, fetched and read
// with the official SDK client, which verifies every digest and frontmatter.
import assert from 'node:assert/strict';
import test from 'node:test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { SkillsClient } from '@modelcontextprotocol/client/ext/skills';
import { z } from 'zod';
import { createFirecrawlMcpServer } from '../dist/server.js';
import { getFreePort } from './helpers/exchange-mcp.mjs';

const SKILLS = 'io.modelcontextprotocol/skills';

const ROUTER = {
  path: 'router',
  files: {
    'SKILL.md': '---\nname: router\ndescription: Pick the workflow that fits the request.\n---\n\n# Router\n\nSee [the guide](references/guide.md).\n',
    'references/guide.md': '# Guide\n\nUse `lookup` for single facts.\n',
  },
};
const LOOKUP = {
  path: 'lookup',
  files: {
    'SKILL.md': '---\nname: lookup\ndescription: Look up one fact.\nlicense: ISC\n---\n\n# Lookup\n',
  },
};

async function start(t, hooks, modernProtocol = true) {
  const port = await getFreePort();
  const instance = createFirecrawlMcpServer({
    transport: 'httpStream',
    apiKey: 'fc-skills-test',
    modernProtocol,
    unstable_hooks: hooks,
  });
  await instance.start({
    transportType: 'httpStream',
    httpStream: { port, host: '127.0.0.1', endpoint: '/v2/mcp', stateless: true },
  });
  t.after(() => instance.stop());
  return port;
}

async function connect(t, port, mode = { pin: '2026-07-28' }) {
  const client = new Client(
    { name: 'skills-test', version: '1.0.0' },
    {
      capabilities: { extensions: { [SKILLS]: {} } },
      versionNegotiation: { mode },
    }
  );
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/v2/mcp`)));
  t.after(() => client.close());
  return client;
}

test('skills are listed in the given order, fetched and read with verified digests', async (t) => {
  const client = await connect(t, await start(t, { skills: [ROUTER, LOOKUP] }));
  const skills = new SkillsClient(client);
  assert.equal(skills.supported, true);

  const listing = await skills.list();
  assert.deepEqual(listing.skills.map((skill) => skill.uri), [
    'skill://router/SKILL.md',
    'skill://lookup/SKILL.md',
  ]);
  assert.deepEqual(listing.skills[1].frontmatter, {
    name: 'lookup',
    description: 'Look up one fact.',
    license: 'ISC',
  });
  assert.deepEqual(
    listing.skills[0].resources.map((file) => file.uri),
    ['skill://router/SKILL.md', 'skill://router/references/guide.md']
  );

  const router = listing.skills[0];
  const main = await skills.read(router);
  assert.match(main.body, /# Router/);
  const guide = await skills.read(router, 'references/guide.md');
  assert.equal(guide.text, ROUTER.files['references/guide.md']);

  const { skill, ttlMs, cacheScope } = await skills.get('skill://lookup/SKILL.md');
  assert.equal(skill.frontmatter.name, 'lookup');
  assert.equal(typeof ttlMs, 'number');
  assert.equal(cacheScope, 'private');

  await assert.rejects(skills.get('skill://missing/SKILL.md'), (error) => error.code === -32602);
});

test('skills change neither tools/list nor resources/list', async (t) => {
  const plain = await connect(t, await start(t, {}));
  const served = await connect(t, await start(t, { skills: [ROUTER, LOOKUP] }));
  assert.deepEqual((await served.listTools()).tools, (await plain.listTools()).tools);
  assert.deepEqual((await served.listResources()).resources, []);
});

test('2025-era sessions see no skills capability and no skills methods', async (t) => {
  const port = await start(t, { skills: [ROUTER] });
  const legacy = await connect(t, port, 'legacy');
  assert.equal(legacy.getServerCapabilities()?.extensions, undefined);
  assert.equal(new SkillsClient(legacy).supported, false);
  await assert.rejects(legacy.request({ method: 'skills/list', params: {} }, z.object({}).loose()), (error) => error.code === -32601);
});

test('serveSkills leaves a session without the extension or the files', async (t) => {
  const client = await connect(t, await start(t, { skills: [ROUTER], serveSkills: () => false }));
  assert.equal(client.getServerCapabilities()?.extensions?.[SKILLS], undefined);
  await assert.rejects(client.readResource({ uri: 'skill://router/SKILL.md' }));
});

test('a skill given twice makes start reject', async (t) => {
  const instance = createFirecrawlMcpServer({
    transport: 'httpStream',
    apiKey: 'fc-skills-test',
    modernProtocol: true,
    unstable_hooks: { skills: [LOOKUP, LOOKUP] },
  });
  await assert.rejects(
    instance.start({
      transportType: 'httpStream',
      httpStream: { port: await getFreePort(), host: '127.0.0.1', endpoint: '/v2/mcp', stateless: true },
    })
  );
});

test('UTF-8 bytes are served as text', async (t) => {
  const bytes = { path: 'lookup', files: { 'SKILL.md': new TextEncoder().encode(LOOKUP.files['SKILL.md']) } };
  const client = await connect(t, await start(t, { skills: [bytes] }));
  const { contents } = await client.readResource({ uri: 'skill://lookup/SKILL.md' });
  assert.equal(contents[0].text, LOOKUP.files['SKILL.md']);
});

test('a skill whose folder does not match its name makes start reject', async (t) => {
  const instance = createFirecrawlMcpServer({
    transport: 'httpStream',
    apiKey: 'fc-skills-test',
    modernProtocol: true,
    unstable_hooks: { skills: [{ path: 'wrong-folder', files: LOOKUP.files }] },
  });
  await assert.rejects(
    instance.start({
      transportType: 'httpStream',
      httpStream: { port: await getFreePort(), host: '127.0.0.1', endpoint: '/v2/mcp', stateless: true },
    })
  );
});
