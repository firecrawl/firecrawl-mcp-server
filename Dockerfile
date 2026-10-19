# Standard Firecrawl MCP server image.
# stdio by default; set HTTP_STREAMABLE_SERVER=true to serve Streamable HTTP on PORT.

FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.17.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
# Skip scripts so the package "prepare" build doesn't run before the source is copied.
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .
RUN pnpm run build


FROM node:22-alpine AS release
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.17.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
RUN pnpm install --prod --frozen-lockfile --ignore-scripts && pnpm store prune

COPY --from=builder /app/dist ./dist

# Runtime configuration (see README "Docker"):
#   FIRECRAWL_API_KEY       API key for the Firecrawl cloud API
#   FIRECRAWL_API_URL       optional self-hosted Firecrawl API URL
#   HTTP_STREAMABLE_SERVER  "true" to serve Streamable HTTP instead of stdio
#   PORT, HOST              HTTP listen address (HTTP mode only)
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0
EXPOSE 3000

USER node
ENTRYPOINT ["node", "dist/index.js"]
