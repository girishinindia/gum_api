# ──────────────────────────────────────────────────────────────────
# GrowUpMore API — multi-stage production Dockerfile (Phase 10.4)
#
# Builds two interchangeable images from the same source:
#   - default target → web tier   (`npm start`     → node dist/server.js)
#   - --target worker → worker    (`npm run worker` → node dist/worker.js)
#
# Both run on Node 20 LTS slim. Puppeteer Chromium is downloaded only in
# the `worker` stage so the web image stays small (~200 MB vs ~600 MB).
# ──────────────────────────────────────────────────────────────────

# ────────────── 1. deps stage ──────────────
FROM node:20-bookworm-slim AS deps
WORKDIR /app

# System dependencies needed by sharp and (in worker stage) Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
# Skip Puppeteer's Chromium download here — only the worker stage needs it
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN npm ci --omit=dev


# ────────────── 2. build stage ──────────────
FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

RUN npm run build


# ────────────── 3a. web runtime ──────────────
FROM node:20-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/dist          ./dist
COPY package.json ./

# Non-root for security
RUN groupadd -r app && useradd -r -g app -u 10001 app && chown -R app:app /app
USER app

EXPOSE 5001
CMD ["node", "dist/server.js"]


# ────────────── 3b. worker runtime ──────────────
# Heavier image — bundles Chromium for Puppeteer (Phase 8).
FROM node:20-bookworm-slim AS worker
WORKDIR /app
ENV NODE_ENV=production

# Install the Chromium dependencies Puppeteer needs at runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 \
        libatk1.0-0 libcups2 libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 \
        libnspr4 libnss3 libxcomposite1 libxdamage1 libxfixes3 libxkbcommon0 \
        libxrandr2 libxshmfence1 wget \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/dist          ./dist
COPY package.json ./

# Download Chromium for Puppeteer (run once, baked into image)
RUN npx puppeteer browsers install chrome

RUN groupadd -r app && useradd -r -g app -u 10001 app && chown -R app:app /app
USER app

CMD ["node", "dist/worker.js"]
