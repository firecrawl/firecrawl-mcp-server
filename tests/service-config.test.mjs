import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('service image config keeps Node app and nginx endpoints aligned', async () => {
  const dockerfile = await readFile('Dockerfile.service', 'utf8');
  const nginx = await readFile('docker/nginx.conf', 'utf8');
  const entrypoint = await readFile('docker/entrypoint.sh', 'utf8');

  assert.match(dockerfile, /FROM node:22-alpine AS builder/);
  assert.match(dockerfile, /FROM node:22-alpine AS runner/);
  assert.equal(
    (
      dockerfile.match(
        /COPY package\.json pnpm-lock\.yaml pnpm-workspace\.yaml \.\//g
      ) ?? []
    ).length,
    2,
    'builder and runner must copy the pnpm workspace patch configuration'
  );
  assert.equal(
    (dockerfile.match(/COPY patches \.\/patches/g) ?? []).length,
    2,
    'builder and runner must copy patched dependencies before frozen install'
  );
  assert.match(dockerfile, /COPY --from=builder \/app\/dist \.\/dist/);
  assert.match(dockerfile, /COPY docker\/nginx\.conf \/etc\/nginx\/nginx\.conf/);
  assert.match(dockerfile, /COPY docker\/entrypoint\.sh \/entrypoint\.sh/);
  assert.match(dockerfile, /ENV CLOUD_SERVICE=true/);
  assert.match(dockerfile, /ENV HTTP_STREAMABLE_SERVER=true/);
  assert.match(dockerfile, /ENV FASTMCP_ENDPOINT=\/v2\/mcp/);
  assert.match(dockerfile, /ENV PORT=3000/);
  assert.match(dockerfile, /EXPOSE 8080/);
  assert.match(dockerfile, /CMD \["\/entrypoint\.sh"\]/);

  assert.match(nginx, /upstream app \{ server 127\.0\.0\.1:3000; \}/);
  assert.match(nginx, /listen 8080;/);
  assert.match(nginx, /location ~ \^\/\(\?:v2\/mcp\|mcp\)\/\?\$/);
  assert.match(nginx, /location ~ \^\/\(\?<apikey>\[\^\/\]\+\)\/\(\?:v2\/mcp\|mcp\)\/\?\$/);

  assert.match(entrypoint, /node dist\/index\.js &/);
  assert.match(entrypoint, /nginx -g 'daemon off;' &/);
  assert.match(entrypoint, /wait -n "\$APP_PID" "\$NGINX_PID"/);
});

test('third-party launch metadata stays aligned with stdio package entry', async () => {
  const smithery = await readFile('smithery.yaml', 'utf8');
  const glama = JSON.parse(await readFile('glama.json', 'utf8'));

  assert.match(smithery, /type: stdio/);
  assert.match(smithery, /command: 'node'/);
  assert.match(smithery, /args: \['dist\/index\.js'\]/);
  assert.match(smithery, /FIRECRAWL_API_KEY: config\.fireCrawlApiKey/);
  assert.match(smithery, /FIRECRAWL_API_URL: config\.fireCrawlApiUrl \|\| ''/);

  assert.equal(glama.$schema, 'https://glama.ai/mcp/schemas/server.json');
  assert.ok(Array.isArray(glama.maintainers));
  assert.ok(glama.maintainers.includes('rakshith48'));
});
