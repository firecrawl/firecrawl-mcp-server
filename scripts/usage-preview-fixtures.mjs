// Synthetic local data; production calls the connected MCP server instead.
export function previewCatalog(args, mode) {
  args = {
    ...args,
    level:
      args.level ??
      (args.capabilities?.length || args.providers?.length
        ? 'tools'
        : args.categories?.length
          ? 'providers'
          : 'categories'),
  };
  if (
    mode === 'catalog-error' ||
    (mode === 'categories-error' && args.level === 'categories') ||
    (mode === 'tools-error' && args.level === 'tools')
  )
    return {
      isError: true,
      content: [{ type: 'text', text: 'Fixture discovery failed' }],
    };
  const providers = [
    {
      id: 'allbirds-com',
      name: 'Allbirds',
      description: 'Sample catalog: discover shoes and product information.',
      category: 'shopping',
    },
    {
      id: 'amazon-com',
      name: 'Amazon US',
      description: 'Sample catalog: product offers and photos.',
      category: 'shopping',
    },
    {
      id: 'amtrak-com',
      name: 'Amtrak',
      description: 'Sample catalog: travel information.',
      category: 'travel',
    },
    {
      id: 'fred',
      name: 'FRED',
      description: 'Sample catalog: economic series and observations.',
      category: 'finance',
    },
    {
      id: 'github-com',
      name: 'GitHub',
      description: 'Sample catalog: software repositories.',
      category: 'software',
    },
    {
      id: 'pubmed-ncbi-nlm-nih-gov',
      name: 'PubMed',
      description: 'Sample catalog: scientific research.',
      category: 'research',
    },
  ];
  let rows;
  if (args.level === 'categories')
    rows = ['shopping', 'travel', 'finance', 'software', 'research'].map(
      (id) => ({ id, description: `Sample ${id} providers` })
    );
  else if (args.level === 'providers')
    rows = providers
      .filter(
        (p) => !args.categories?.length || args.categories.includes(p.category)
      )
      .map((p) => ({
        ...p,
        provider: p.id,
        toolCount: mode === 'zero-tools' && p.id === 'allbirds-com' ? 0 : 2,
      }));
  else
    rows = providers
      .filter((p) => !(mode === 'empty-tools' && p.id === 'allbirds-com'))
      .filter((p) => args.providers?.includes(p.id))
      .flatMap((p) =>
        ['products/offer', 'products/photos'].map((capability) => ({
          provider: p.id,
          capability,
          name: capability === 'products/offer' ? 'Offer' : 'Photos',
          description: 'Sample tool description.',
          creditsCost: 5,
          perRecord: false,
          ...(args.expand?.length
            ? {
                options: [
                  {
                    name: 'asin',
                    type: 'string',
                    in: 'body',
                    about: 'Sample product identifier.',
                  },
                  {
                    name: 'url',
                    type: 'string',
                    in: 'body',
                    about: 'Sample product URL.',
                  },
                ],
                requiresOneOf: [['asin', 'url']],
                response: { fields: [{ key: 'price', type: 'number' }] },
              }
            : {}),
        }))
      )
      .filter(
        (t) =>
          !args.capabilities?.length || args.capabilities.includes(t.capability)
      );
  const offset = args.offset ?? 0,
    limit = Math.min(args.limit ?? 100, 2);
  const page = {
    level: args.level,
    items: rows.slice(offset, offset + limit),
    total: rows.length,
    catalogueVersion: 'fixture-v1',
    ...(offset + limit < rows.length
      ? {
          nextTool: {
            name: 'firecrawl_find_tools',
            arguments: { ...args, offset: offset + limit },
          },
        }
      : {}),
  };
  const envelope = {
    success: true,
    data: {
      creditsCost: 0,
      alexandria: [
        {
          provider: 'firecrawl',
          capability: 'find-tools',
          creditsCost: 0,
          data: page,
        },
      ],
    },
  };
  return {
    structuredContent: envelope,
    content: [{ type: 'text', text: JSON.stringify(envelope) }],
  };
}
