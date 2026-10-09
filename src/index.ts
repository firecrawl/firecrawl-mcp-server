#!/usr/bin/env node
import dotenv from 'dotenv';
import {
  createFirecrawlMcpServer,
  type FirecrawlMcpServerOptions,
  type FirecrawlMcpServerStartArgs,
} from './server.js';
import {
  createServiceHooks,
  makePrimaryProfile,
  makeSearchProfile,
  resolveCredentialFromEnv,
} from './service/index.js';

dotenv.config({ debug: false, quiet: true });

const FEEDBACK_DISABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);

function feedbackEnvEnabled(...keys: string[]): boolean {
  return keys.some((key) =>
    FEEDBACK_DISABLED_VALUES.has((process.env[key] || '').trim().toLowerCase())
  );
}

const hosted = process.env.CLOUD_SERVICE === 'true';
const httpStreaming =
  process.env.HTTP_STREAMABLE_SERVER === 'true' ||
  process.env.SSE_LOCAL === 'true';
const apiKey = resolveCredentialFromEnv();
const apiUrl = process.env.FIRECRAWL_API_URL;
const primaryProfile = makePrimaryProfile();

const searchFeedbackDisabled = feedbackEnvEnabled(
  'FIRECRAWL_NO_SEARCH_FEEDBACK',
  'FIRECRAWL_DISABLE_SEARCH_FEEDBACK'
);
const endpointFeedbackDisabled = feedbackEnvEnabled(
  'FIRECRAWL_NO_ENDPOINT_FEEDBACK',
  'FIRECRAWL_DISABLE_ENDPOINT_FEEDBACK'
);

if (searchFeedbackDisabled) {
  console.error(
    '[firecrawl-mcp] Search feedback tool disabled by FIRECRAWL_NO_SEARCH_FEEDBACK; firecrawl_search_feedback will not be registered.'
  );
}
if (endpointFeedbackDisabled) {
  console.error(
    '[firecrawl-mcp] Endpoint feedback tool disabled by FIRECRAWL_NO_ENDPOINT_FEEDBACK; firecrawl_feedback will not be registered.'
  );
}

const transport = hosted || httpStreaming ? 'httpStream' : 'stdio';
const options: FirecrawlMcpServerOptions = {
  apiUrl,
  apiKey,
  transport,
  logging: transport === 'httpStream',
  safeMode: hosted,
  fileAccess: hosted ? 'upload' : 'local',
  requireCredential: hosted,
  searchFeedback: !searchFeedbackDisabled,
  endpointFeedback: !endpointFeedbackDisabled,
};
const serviceSettings = { hosted, transport, apiKey, apiUrl } as const;

const primaryHooks = createServiceHooks(primaryProfile, serviceSettings);
const { start } = createFirecrawlMcpServer({
  ...options,
  unstable_hooks: {
    ...primaryHooks,
    configureHttp: (app) => {
      app.get('/ready', (context) => context.json({ ok: true }, 200));
    },
  },
});

const PORT = Number(process.env.PORT || 3000);
const HOST = hosted ? '0.0.0.0' : process.env.HOST || 'localhost';

const args: FirecrawlMcpServerStartArgs =
  transport === 'httpStream'
    ? {
        transportType: 'httpStream',
        httpStream: {
          port: PORT,
          host: HOST,
          endpoint: primaryProfile.endpoint,
          stateless: true,
        },
      }
    : { transportType: 'stdio' };

if (
  transport === 'stdio' &&
  !process.env.FIRECRAWL_API_KEY &&
  !process.env.FIRECRAWL_API_URL
) {
  // No credential and no self-hosted URL: run in keyless mode. scrape and
  // search work for free (rate-limited per IP) against the Firecrawl cloud;
  // every other tool needs an API key and will return Unauthorized.
  console.error(
    'No FIRECRAWL_API_KEY or FIRECRAWL_API_URL set — running in keyless mode. ' +
      'firecrawl_scrape and firecrawl_search are free (rate-limited per IP) against the Firecrawl cloud; ' +
      'other tools require an API key (get one free at https://firecrawl.dev).'
  );
}

await start(args);

// Bring up the search surface as a second in-process instance on its own port.
// The pod's nginx routes its public path here; the full surface above is
// untouched. Only registered in the hosted profile and when not disabled.
const searchProfileEnabled =
  hosted &&
  primaryProfile.id === 'full' &&
  process.env.FIRECRAWL_MCP_SEARCH_ENABLED !== 'false';

if (searchProfileEnabled) {
  const searchProfile = makeSearchProfile();
  const searchServer = createFirecrawlMcpServer({
    ...options,
    unstable_hooks: createServiceHooks(searchProfile, serviceSettings),
  });

  // Isolate the search instance from the already-serving full instance: if it
  // fails to bind (port in use, etc.), log and carry on rather than let a
  // top-level rejection exit the process and take the healthy full surface down.
  try {
    await searchServer.start({
      transportType: 'httpStream',
      httpStream: {
        port: searchProfile.port,
        host: HOST,
        endpoint: searchProfile.endpoint,
        stateless: true,
      },
    });
  } catch (error) {
    console.error(
      `[search-profile] failed to start on port ${searchProfile.port}; ` +
        'the full surface is unaffected',
      error
    );
  }
}
