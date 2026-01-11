import { z } from 'zod';

export interface FirecrawlSchemasOptions {
  safeMode?: boolean;
}

const ActionSchema = z
  .object({
    type: z.string(),
    selector: z.string().optional(),
    text: z.string().optional(),
    key: z.string().optional(),
    milliseconds: z.number().optional(),
    script: z.string().optional(),
    direction: z.string().optional(),
    fullPage: z.boolean().optional(),
  })
  .passthrough();

const SearchSourceSchema = z.union([
  z.literal('web'),
  z.literal('images'),
  z.literal('news'),
]);

function makeActionsSchema(safeMode: boolean) {
  if (!safeMode) return z.array(ActionSchema).optional();
  // Safe mode: reject actions likely to be interactive / unsafe
  return z
    .array(ActionSchema)
    .optional()
    .superRefine((actions, ctx) => {
      if (!actions) return;
      for (const a of actions) {
        const t = String((a as any).type ?? '').toLowerCase();
        if (
          // v2 action names
          t === 'click' ||
          t === 'write' ||
          t === 'press' ||
          t === 'executejavascript' ||
          t === 'scroll' ||
          // legacy names seen in older docs/clients
          t === 'type' ||
          t === 'keypress'
        ) {
          ctx.addIssue({
            code: 'custom',
            message: `Action type "${t}" is not allowed in safe mode`,
          });
        }
      }
    });
}

export function createFirecrawlSchemas(options: FirecrawlSchemasOptions = {}) {
  const safeMode = options.safeMode === true;

  const locationSchema = z
    .object({
      country: z.string().optional(),
      languages: z.array(z.string()).optional(),
    })
    .strict()
    .optional();

  const stringRecordSchema = z.object({}).catchall(z.string());

  const parserSchema = z.union([
    z.string(),
    z
      .object({
        type: z.literal('pdf'),
        maxPages: z.number().optional(),
      })
      .strict(),
  ]);

  const webhookSchema = z
    .object({
      url: z.string(),
      headers: stringRecordSchema.optional(),
      metadata: stringRecordSchema.optional(),
      events: z.array(z.enum(['completed', 'failed', 'page', 'started'])).optional(),
    })
    .strict();

  const scrapeOptionsSchema = z
    .object({
      formats: z.array(z.string()).optional(),
      headers: stringRecordSchema.optional(),
      includeTags: z.array(z.string()).optional(),
      excludeTags: z.array(z.string()).optional(),
      maxAge: z.number().optional(),
      minAge: z.number().optional(),
      waitFor: z.number().optional(),
      mobile: z.boolean().optional(),
      onlyMainContent: z.boolean().optional(),
      removeBase64Images: z.boolean().optional(),
      skipTlsVerification: z.boolean().optional(),
      storeInCache: z.boolean().optional(),
      fastMode: z.boolean().optional(),
      blockAds: z.boolean().optional(),
      proxy: z.string().optional(),
      actions: makeActionsSchema(safeMode),
      location: locationSchema,
      parsers: z.array(parserSchema).optional(),
      integration: z.string().optional(),
    })
    .strict();

  const scrapeParamsSchema = z
    .object({
      url: z.string(),
      formats: z.array(z.string()).optional(),
      headers: stringRecordSchema.optional(),
      includeTags: z.array(z.string()).optional(),
      excludeTags: z.array(z.string()).optional(),
      timeout: z.number().optional(),
      maxAge: z.number().optional(),
      minAge: z.number().optional(),
      waitFor: z.number().optional(),
      mobile: z.boolean().optional(),
      onlyMainContent: z.boolean().optional(),
      removeBase64Images: z.boolean().optional(),
      skipTlsVerification: z.boolean().optional(),
      storeInCache: z.boolean().optional(),
      fastMode: z.boolean().optional(),
      blockAds: z.boolean().optional(),
      proxy: z.string().optional(),
      actions: makeActionsSchema(safeMode),
      location: locationSchema,
      parsers: scrapeOptionsSchema.shape.parsers,
      integration: z.string().optional(),
    })
    .strict();

  const mapParamsSchema = z
    .object({
      url: z.string(),
      search: z.string().optional(),
      limit: z.number().optional(),
      includeSubdomains: z.boolean().optional(),
      ignoreQueryParameters: z.boolean().optional(),
      sitemap: z
        .union([
          z.literal('include'),
          z.literal('only'),
          z.literal('ignore'),
          z.literal('skip'),
        ])
        .optional(),
      timeout: z.number().optional(),
      integration: z.string().optional(),
      location: locationSchema,
    })
    .strict();

  const CategorySchema = z.union([
    z.literal('github'),
    z.literal('research'),
    z.literal('pdf'),
    z.object({ type: z.enum(['github', 'research', 'pdf']) }).strict(),
  ]);

  const SearchSourceV2Schema = z.union([
    SearchSourceSchema,
    z.object({ type: SearchSourceSchema }).strict(),
  ]);

  const searchParamsSchema = z
    .object({
      query: z.string(),
      limit: z.number().optional(),
      lang: z.string().optional(),
      country: z.string().optional(),
      tbs: z.string().optional(),
      filter: z.string().optional(),
      location: z.string().optional(),
      ignoreInvalidURLs: z.boolean().optional(),
      timeout: z.number().optional(),
      integration: z.string().optional(),
      categories: z.array(CategorySchema).optional(),
      sources: z.array(SearchSourceV2Schema).optional(),
      scrapeOptions: z
        .object({
          formats: z.array(z.string()).optional(),
          headers: stringRecordSchema.optional(),
          includeTags: z.array(z.string()).optional(),
          excludeTags: z.array(z.string()).optional(),
          onlyMainContent: z.boolean().optional(),
          actions: makeActionsSchema(safeMode),
          location: locationSchema,
          maxAge: z.number().optional(),
          minAge: z.number().optional(),
          waitFor: z.number().optional(),
          mobile: z.boolean().optional(),
          removeBase64Images: z.boolean().optional(),
          skipTlsVerification: z.boolean().optional(),
          storeInCache: z.boolean().optional(),
          fastMode: z.boolean().optional(),
          blockAds: z.boolean().optional(),
          proxy: z.string().optional(),
          timeout: z.number().optional(),
          parsers: scrapeOptionsSchema.shape.parsers,
          integration: z.string().optional(),
        })
        .optional(),
    })
    .strict();

  const crawlParamsSchema = z
    .object({
      url: z.string(),
      prompt: z.string().optional(),
      maxDiscoveryDepth: z.number().optional(),
      limit: z.number().optional(),
      allowExternalLinks: z.boolean().optional(),
      allowSubdomains: z.boolean().optional(),
      crawlEntireDomain: z.boolean().optional(),
      deduplicateSimilarURLs: z.boolean().optional(),
      ignoreQueryParameters: z.boolean().optional(),
      includePaths: z.array(z.string()).optional(),
      excludePaths: z.array(z.string()).optional(),
      sitemap: z
        .union([
          z.literal('include'),
          z.literal('only'),
          z.literal('ignore'),
          z.literal('skip'),
        ])
        .optional(),
      delay: z.number().optional(),
      maxConcurrency: z.number().optional(),
      webhook: z.union([z.string(), webhookSchema]).optional(),
      zeroDataRetention: z.boolean().optional(),
      integration: z.string().optional(),
      scrapeOptions: scrapeOptionsSchema.optional(),
    })
    .strict();

  const checkCrawlStatusParamsSchema = z.object({ id: z.string() }).strict();

  const extractParamsSchema = z
    .object({
      urls: z.array(z.string()),
      prompt: z.string().optional(),
      schema: z.any().optional(),
      systemPrompt: z.string().optional(),
      allowExternalLinks: z.boolean().optional(),
      enableWebSearch: z.boolean().optional(),
      includeSubdomains: z.boolean().optional(),
      showSources: z.boolean().optional(),
      timeout: z.number().optional(),
      pollInterval: z.number().optional(),
      ignoreInvalidURLs: z.boolean().optional(),
      integration: z.string().optional(),
      scrapeOptions: scrapeOptionsSchema.optional(),
      agent: z
        .object({
          model: z.string().optional(),
          sessionId: z.string().optional(),
        })
        .strict()
        .optional(),
    })
    .strict();

  const agentParamsSchema = z
    .object({
      prompt: z.string(),
      urls: z.array(z.string()).optional(),
      schema: z.any().optional(),
      integration: z.string().optional(),
      maxCredits: z.number().optional(),
      strictConstrainToURLs: z.boolean().optional(),
    })
    .strict();

  const agentStatusParamsSchema = z.object({ id: z.string() }).strict();

  return {
    scrapeParamsSchema,
    mapParamsSchema,
    searchParamsSchema,
    crawlParamsSchema,
    checkCrawlStatusParamsSchema,
    extractParamsSchema,
    agentParamsSchema,
    agentStatusParamsSchema,
  };
}
