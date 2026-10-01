import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import { previewCatalog } from '../scripts/usage-preview-fixtures.mjs';
const { code } = await transform(
  await readFile(new URL('../web/catalog.ts', import.meta.url), 'utf8'),
  { loader: 'ts', format: 'esm' }
);
const {
  catalogPage,
  nextPage,
  providerFrom,
  capabilityFrom,
  buildSelectionContext,
} = await import(
  'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
);

test('catalog follows discovery pagination and rejects failures or executable navigation', () => {
  let args = { level: 'providers', limit: 100 },
    rows = [];
  while (args) {
    const page = catalogPage(previewCatalog(args, 'normal'), 'providers');
    rows.push(...page.items);
    args = nextPage(page, 'providers');
  }
  assert.equal(rows.length, 6);
  assert.equal(providerFrom(rows.at(-1)).id, 'pubmed-ncbi-nlm-nih-gov');
  assert.throws(() =>
    catalogPage(
      previewCatalog({ level: 'providers' }, 'catalog-error'),
      'providers'
    )
  );
  assert.throws(() =>
    catalogPage(previewCatalog({ level: 'tools' }, 'normal'), 'providers')
  );
  assert.throws(() =>
    nextPage(
      {
        nextTool: {
          name: 'firecrawl_scrape',
          arguments: { level: 'providers', offset: 2 },
        },
      },
      'providers'
    )
  );
  assert.throws(() =>
    nextPage(
      {
        nextTool: {
          name: 'firecrawl_find_tools',
          arguments: { level: 'tools', offset: 2 },
        },
      },
      'providers'
    )
  );
  assert.throws(() =>
    nextPage(
      {
        nextTool: {
          name: 'firecrawl_find_tools',
          arguments: { level: 'providers', offset: -1 },
        },
      },
      'providers'
    )
  );
  const textOnly = previewCatalog({ level: 'categories' }, 'normal');
  delete textOnly.structuredContent;
  assert.equal(catalogPage(textOnly, 'categories').items[0].id, 'shopping');
});

test('composer context preserves exact IDs, selected contracts and prices for mixed selection', () => {
  const provider = {
    id: 'amazon-com',
    name: 'Amazon US',
    description: 'Products',
  };
  const args = {
    level: 'tools',
    providers: [provider.id],
    capabilities: ['products/offer'],
    expand: ['options', 'response'],
  };
  const row = catalogPage(previewCatalog(args, 'normal'), 'tools').items[0];
  const capability = capabilityFrom(row, provider.id);
  assert.throws(() => capabilityFrom(row, 'other-provider'));
  const all = { id: 'allbirds-com', name: 'Allbirds', description: 'Shoes' };
  const { content, context } = buildSelectionContext([
    { provider, capabilities: [capability], scope: 'tools' },
    {
      provider: all,
      capabilities: [
        {
          provider: all.id,
          capability: 'products/offer',
          name: 'Offer',
          description: 'Sample',
          creditsCost: 5,
        },
      ],
      scope: 'provider',
    },
  ]);
  assert.equal(content.length, 2);
  assert.deepEqual(
    content.map((item) => item._meta['openai/title']),
    ['Amazon US', 'Allbirds']
  );
  assert.ok(content[0].text.includes(JSON.stringify(context.providers[0])));
  assert.ok(!content[0].text.includes(JSON.stringify(context.providers[1])));
  assert.ok(!content[1].text.includes(JSON.stringify(context.providers[0])));
  assert.equal(
    context.providers[0].capabilities[0].capability,
    'products/offer'
  );
  assert.deepEqual(context.providers[0].capabilities[0].requiresOneOf, [
    ['asin', 'url'],
  ]);
  assert.equal(context.providers[0].capabilities[0].options[0].name, 'asin');
  assert.equal(context.providers[0].capabilities[0].creditsCost, 5);
  assert.deepEqual(context.providers[0].contractLookup.arguments.capabilities, [
    'products/offer',
  ]);
  assert.equal(
    context.providers[1].contractLookup.arguments.capabilities,
    undefined
  );
  assert.match(content[0].text, /selection is guidance/);
  assert.match(content[0].text, /enable\/connect Firecrawl/);
  assert.deepEqual(buildSelectionContext([]).content, []);
  assert.throws(() =>
    buildSelectionContext([{ provider, capabilities: [], scope: 'provider' }])
  );
  assert.throws(() =>
    buildSelectionContext([
      {
        provider,
        capabilities: [{ ...capability, description: 'x'.repeat(120000) }],
        scope: 'tools',
      },
    ])
  );
});
