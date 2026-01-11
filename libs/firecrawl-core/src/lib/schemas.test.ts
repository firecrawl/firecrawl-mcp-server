import { createFirecrawlSchemas } from './schemas.js';
import { toJSONSchema } from 'zod/v4/core';

describe('schemas', () => {
  it('safeMode disables actions in scrapeOptions', () => {
    const s = createFirecrawlSchemas({ safeMode: true });
    expect(() =>
      (s.searchParamsSchema as any).parse({
        query: 'x',
        scrapeOptions: {
          actions: [{ type: 'click', selector: '#a' }],
        },
      })
    ).toThrow();
  });

  it('search sources allows web/images/news', () => {
    const s = createFirecrawlSchemas({ safeMode: false });
    const parsed = (s.searchParamsSchema as any).parse({
      query: 'x',
      sources: ['web', 'images', 'news'],
    });
    expect(parsed.sources).toEqual(['web', 'images', 'news']);
  });

  it('parameter schemas can be converted to JSON schema (MCP tools/list)', () => {
    const s = createFirecrawlSchemas({ safeMode: true });
    const schemas = [
      s.scrapeParamsSchema,
      s.mapParamsSchema,
      s.searchParamsSchema,
      s.crawlParamsSchema,
      s.checkCrawlStatusParamsSchema,
      s.extractParamsSchema,
      s.agentParamsSchema,
      s.agentStatusParamsSchema,
    ];

    for (const schema of schemas) {
      expect(() => toJSONSchema(schema as any)).not.toThrow();
    }
  });
});
