# syntax=docker/dockerfile:1

# ---- Build: compile TypeScript ----
FROM node:22-alpine AS build
WORKDIR /app
# Toolchain in case better-sqlite3 has no prebuilt binary for this platform.
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---- Runtime: only production deps + compiled JS ----
FROM node:22-alpine
ENV NODE_ENV=production \
    DATABASE_PATH=/app/data/bot.db \
    RULES_PATH=/app/config/rules.json \
    HEARTBEAT_PATH=/tmp/heartbeat
WORKDIR /app
COPY --from=build --chown=root:root /app/node_modules ./node_modules
COPY --from=build --chown=root:root /app/dist ./dist
COPY --chown=root:root package.json ./
COPY --chown=root:root config ./config
# Remove package managers the bot doesn't need at runtime, and make only the
# data directory writable, only by the unprivileged user.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn* /usr/local/bin/yarn* \
 && mkdir -p /app/data && chown node:node /app/data && chmod 700 /app/data
USER node
VOLUME ["/app/data"]
# Healthy while the bot keeps refreshing its heartbeat file (i.e. is connected to Discord).
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "dist/healthcheck.js"]
CMD ["node", "dist/index.js"]
